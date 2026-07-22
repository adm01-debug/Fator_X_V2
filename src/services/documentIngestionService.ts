/**
 * Document Ingestion Service — Upload de PDF/DOCX para o Super Cérebro.
 * Fluxo: Storage → doc-parse (Edge Function) → chunks + embeddings.
 */
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

export type IngestionStatus =
  | 'pending' | 'uploading' | 'parsing' | 'ocr'
  | 'chunking' | 'embedding' | 'ready' | 'error';

export type ExtractionMethod = 'text' | 'ocr' | 'hybrid' | 'docx';

export interface DocumentIngestion {
  id: string;
  document_id: string | null;
  collection_id: string | null;
  user_id: string;
  filename: string;
  mime: string;
  size_bytes: number;
  pages: number | null;
  extraction_method: ExtractionMethod | null;
  status: IngestionStatus;
  progress_pct: number;
  storage_path: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const ACCEPTED_MIMES = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
} as const;

export async function listIngestions(collectionId?: string): Promise<DocumentIngestion[]> {
  let q = supabase
    .from('document_ingestions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  if (collectionId) q = q.eq('collection_id', collectionId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as DocumentIngestion[];
}

export function subscribeIngestions(
  userId: string,
  onChange: (row: DocumentIngestion) => void,
) {
  const channel = supabase
    .channel(`ingestions:${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'document_ingestions', filter: `user_id=eq.${userId}` },
      (payload) => {
        const row = (payload.new ?? payload.old) as DocumentIngestion | undefined;
        if (row) onChange(row);
      },
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

/**
 * Rasteriza páginas de um PDF em PNG base64 usando pdfjs-dist (browser only).
 * Usado como fallback quando o server detecta que o PDF é 100% escaneado.
 */
async function rasterizePdfPages(file: File): Promise<Array<{ page: number; png_base64: string }>> {
  const pdfjs = await import('pdfjs-dist');
  // Vite: worker importado como URL
  const workerSrc = (await import('pdfjs-dist/build/pdf.worker.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const out: Array<{ page: number; png_base64: string }> = [];
  const maxPages = Math.min(pdf.numPages, 30); // segurança
  for (let p = 1; p <= maxPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1.6 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    const dataUrl = canvas.toDataURL('image/png');
    out.push({ page: p, png_base64: dataUrl.split(',')[1] });
    canvas.width = 0; canvas.height = 0;
  }
  return out;
}

export interface UploadOptions {
  collectionId: string;
  onStage?: (stage: string) => void;
}

/**
 * Envia arquivo ao Storage e dispara o pipeline doc-parse.
 * Se o server detectar PDF escaneado (422 ocr_pages_required), rasteriza
 * páginas no browser e reenvia automaticamente.
 */
export async function uploadDocument(file: File, opts: UploadOptions): Promise<DocumentIngestion> {
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes.user) throw new Error('Não autenticado');
  const user = userRes.user;

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`Arquivo excede 20 MB (${(file.size / 1024 / 1024).toFixed(1)} MB).`);
  }
  const mime = file.type || 'application/octet-stream';
  if (!(mime in ACCEPTED_MIMES)) {
    throw new Error('Tipo não suportado. Envie PDF ou DOCX.');
  }

  // 1. Cria row de rastreio
  opts.onStage?.('preparing');
  const { data: ingestion, error: iErr } = await supabase
    .from('document_ingestions')
    .insert({
      user_id: user.id,
      collection_id: opts.collectionId,
      filename: file.name,
      mime,
      size_bytes: file.size,
      status: 'uploading',
      progress_pct: 5,
    })
    .select()
    .single();
  if (iErr || !ingestion) throw iErr ?? new Error('Falha ao criar ingestion');

  // 2. Upload no bucket (path: {user_id}/{ingestion_id}/{filename})
  const storagePath = `${user.id}/${ingestion.id}/${file.name}`;
  opts.onStage?.('uploading');
  const up = await supabase.storage.from('knowledge-uploads').upload(storagePath, file, {
    contentType: mime,
    upsert: true,
  });
  if (up.error) {
    await supabase
      .from('document_ingestions')
      .update({ status: 'error', error_message: `Upload: ${up.error.message}` })
      .eq('id', ingestion.id);
    throw up.error;
  }
  await supabase
    .from('document_ingestions')
    .update({ storage_path: storagePath, status: 'parsing', progress_pct: 10 })
    .eq('id', ingestion.id);

  // 3. Dispara doc-parse
  opts.onStage?.('parsing');
  const callParse = (extra: Record<string, unknown> = {}) =>
    supabase.functions.invoke('doc-parse', {
      body: {
        ingestion_id: ingestion.id,
        collection_id: opts.collectionId,
        filename: file.name,
        mime,
        storage_path: storagePath,
        ...extra,
      },
    });

  let res = await callParse();

  // 4. Retry com OCR se PDF escaneado
  if (res.error) {
    const ctx = (res.error as { context?: Response }).context;
    let errBody: { error?: string; message?: string } | null = null;
    try {
      if (ctx && typeof ctx.text === 'function') {
        const raw = await ctx.text();
        errBody = raw ? JSON.parse(raw) : null;
      }
    } catch { /* ignore parse */ }

    if (errBody?.error === 'ocr_pages_required' && mime === 'application/pdf') {
      opts.onStage?.('rasterizing');
      const ocrPages = await rasterizePdfPages(file);
      opts.onStage?.('ocr');
      res = await callParse({ ocr_pages: ocrPages });
    }
  }

  if (res.error) {
    const msg = res.error instanceof Error ? res.error.message : String(res.error);
    logger.error('doc-parse falhou', { ingestion_id: ingestion.id, err: msg });
    throw new Error(msg);
  }

  // 5. Fetch estado final
  const { data: final } = await supabase
    .from('document_ingestions').select('*').eq('id', ingestion.id).maybeSingle();
  return (final ?? ingestion) as DocumentIngestion;
}

export async function retryIngestion(id: string): Promise<void> {
  const { data: ing, error } = await supabase
    .from('document_ingestions').select('*').eq('id', id).maybeSingle();
  if (error || !ing) throw error ?? new Error('Ingestion não encontrada');
  if (!ing.storage_path) throw new Error('Storage path ausente — reenvie o arquivo.');
  await supabase
    .from('document_ingestions')
    .update({ status: 'parsing', progress_pct: 10, error_message: null })
    .eq('id', id);
  const { error: fErr } = await supabase.functions.invoke('doc-parse', {
    body: {
      ingestion_id: ing.id,
      collection_id: ing.collection_id,
      filename: ing.filename,
      mime: ing.mime,
      storage_path: ing.storage_path,
    },
  });
  if (fErr) throw fErr;
}

export async function deleteIngestion(ing: DocumentIngestion): Promise<void> {
  if (ing.storage_path) {
    await supabase.storage.from('knowledge-uploads').remove([ing.storage_path]).catch(() => {});
  }
  if (ing.document_id) {
    await supabase.from('chunks').delete().eq('document_id', ing.document_id).catch(() => {});
    await supabase.from('documents').delete().eq('id', ing.document_id).catch(() => {});
  }
  const { error } = await supabase.from('document_ingestions').delete().eq('id', ing.id);
  if (error) throw error;
}

export function statusLabel(s: IngestionStatus): string {
  const map: Record<IngestionStatus, string> = {
    pending: 'Pendente',
    uploading: 'Enviando…',
    parsing: 'Extraindo texto…',
    ocr: 'OCR em andamento…',
    chunking: 'Segmentando…',
    embedding: 'Gerando embeddings…',
    ready: 'Pronto',
    error: 'Erro',
  };
  return map[s];
}

export function methodLabel(m: ExtractionMethod | null): string {
  if (!m) return '—';
  const map: Record<ExtractionMethod, string> = {
    text: 'Texto nativo',
    ocr: 'OCR',
    hybrid: 'Híbrido',
    docx: 'DOCX',
  };
  return map[m];
}
