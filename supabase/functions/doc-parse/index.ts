/**
 * doc-parse — Parse PDF/DOCX uploads, extract text (with OCR fallback for scanned
 * PDF pages), then delegate to rag-ingest for chunking + embedding.
 *
 * Auth: JWT (via authenticateRequest)
 * Rate limit: heavy
 *
 * Input:
 *   {
 *     ingestion_id: uuid,                    // row previously created by client
 *     collection_id: uuid,
 *     filename: string,
 *     mime: 'application/pdf' | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 *     storage_path: string,                  // path inside bucket knowledge-uploads
 *     ocr_pages?: Array<{ page: number, png_base64: string }>, // client-rasterized pages when force_ocr
 *     force_ocr?: boolean,
 *   }
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import {
  handleCorsPreflight,
  jsonResponse,
  errorResponse,
  getCorsHeaders,
  authenticateRequest,
  checkRateLimit,
  createRateLimitResponse,
  getRateLimitIdentifier,
  RATE_LIMITS,
  parseBody,
  z,
} from '../_shared/mod.ts';

import { chunkText, normalizeChunkOptions } from '../_shared/chunker.ts';

const MAX_BYTES = 20 * 1024 * 1024;
const OCR_MIN_TEXT_PER_PAGE = 40;
const OCR_CONCURRENCY = 3;

const Input = z.object({
  ingestion_id: z.string().uuid(),
  collection_id: z.string().uuid(),
  filename: z.string().min(1).max(255),
  mime: z.enum([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]),
  storage_path: z.string().min(3).max(500),
  ocr_pages: z
    .array(
      z.object({
        page: z.number().int().min(1),
        png_base64: z.string().min(50),
      }),
    )
    .optional(),
  force_ocr: z.boolean().optional(),
  chunk_size: z.number().int().min(200).max(4000).optional(),
  chunk_overlap: z.number().int().min(0).max(3999).optional(),
  chunk_strategy: z.enum(['fixed', 'paragraph', 'sentence']).optional(),
  content_hash: z
    .string()
    .regex(/^[a-f0-9]{64}$/i, 'must be sha-256 hex')
    .optional(),
});

type IngestionStatus =
  | 'pending'
  | 'uploading'
  | 'parsing'
  | 'ocr'
  | 'chunking'
  | 'embedding'
  | 'ready'
  | 'error'
  | 'cancelled';

async function extractDocxText(bytes: Uint8Array): Promise<string> {
  const { unzip } = await import('https://esm.sh/unzipit@1.4.3');
  const { entries } = await unzip(bytes);
  const entry = entries['word/document.xml'];
  if (!entry) throw new Error('DOCX inválido: word/document.xml ausente');
  const xml = await entry.text();
  // Extract <w:t>...</w:t> and preserve paragraph breaks between <w:p>
  const paragraphs = xml
    .split(/<w:p[\s>]/i)
    .map((p) =>
      (p.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) ?? [])
        .map((t) => t.replace(/<[^>]+>/g, ''))
        .join(''),
    )
    .filter(Boolean);
  return paragraphs.join('\n').trim();
}

async function extractPdfPages(bytes: Uint8Array): Promise<string[]> {
  const { extractText, getDocumentProxy } = await import('https://esm.sh/unpdf@0.12.1');
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: false });
  return Array.isArray(text) ? text : [String(text ?? '')];
}

export type OcrPageEvent = {
  page: number;
  method: 'text' | 'ocr' | 'hybrid';
  status: 'success' | 'error';
  duration_ms: number;
  image_bytes: number;
  text_chars: number;
  error?: string;
};

async function ocrPagePng(hfToken: string, pngBase64: string): Promise<string> {
  const resp = await fetch(
    'https://router.huggingface.co/hf-inference/models/ibm-granite/granite-vision-3.3-2b',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${hfToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: {
          image: pngBase64,
          text: 'Extract ALL text from this document image. Return only the raw text, preserving line breaks.',
        },
        parameters: { max_new_tokens: 2048 },
      }),
      signal: AbortSignal.timeout(45_000),
    },
  );
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OCR falhou (${resp.status}): ${err.slice(0, 200)}`);
  }
  const json = await resp.json();
  return typeof json === 'string'
    ? json
    : (json?.generated_text ?? json?.[0]?.generated_text ?? '');
}

/** Approx decoded byte length of a base64 payload without allocating. */
function base64ByteLength(b64: string): number {
  const clean = b64.includes(',') ? b64.slice(b64.indexOf(',') + 1) : b64;
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
}

async function runOcrPages(
  hfToken: string,
  pages: Array<{ page: number; png_base64: string }>,
  onProgress: (done: number, total: number) => Promise<void>,
  onPageEvent: (ev: OcrPageEvent) => void,
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const total = pages.length;
  let done = 0;
  for (let i = 0; i < pages.length; i += OCR_CONCURRENCY) {
    const batch = pages.slice(i, i + OCR_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (p) => {
        const start = performance.now();
        const image_bytes = base64ByteLength(p.png_base64);
        try {
          const text = await ocrPagePng(hfToken, p.png_base64);
          onPageEvent({
            page: p.page,
            method: 'ocr',
            status: 'success',
            duration_ms: Math.round(performance.now() - start),
            image_bytes,
            text_chars: text.length,
          });
          return { page: p.page, text };
        } catch (err) {
          onPageEvent({
            page: p.page,
            method: 'ocr',
            status: 'error',
            duration_ms: Math.round(performance.now() - start),
            image_bytes,
            text_chars: 0,
            error: err instanceof Error ? err.message : String(err),
          });
          throw err;
        }
      }),
    );
    for (const r of results) {
      done += 1;
      if (r.status === 'fulfilled') out.set(r.value.page, r.value.text);
    }
    await onProgress(done, total);
  }
  return out;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req);
  const cors = getCorsHeaders(req);

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return auth.error;
    const { user } = auth;

    const rate = checkRateLimit(getRateLimitIdentifier(req, user.id), RATE_LIMITS.heavy);
    if (!rate.allowed) return createRateLimitResponse(rate, getCorsHeaders(req));

    const parsed = await parseBody(req, Input);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Ownership guard
    const { data: ingestion, error: ingErr } = await supabase
      .from('document_ingestions')
      .select('id,user_id')
      .eq('id', body.ingestion_id)
      .maybeSingle();
    if (ingErr || !ingestion) return errorResponse(req, 'Ingestion não encontrada', 404);
    if (ingestion.user_id !== user.id) return errorResponse(req, 'Forbidden', 403);

    const updateStatus = async (
      status: IngestionStatus,
      progress: number,
      extra: Record<string, unknown> = {},
    ) => {
      await supabase
        .from('document_ingestions')
        .update({ status, progress_pct: progress, ...extra })
        .eq('id', body.ingestion_id);
    };

    // Cooperative cancellation — checked between pipeline stages.
    const CANCELLED = Symbol('ingestion_cancelled');
    const checkCancelled = async (): Promise<boolean> => {
      const { data } = await supabase
        .from('document_ingestions')
        .select('cancel_requested,status')
        .eq('id', body.ingestion_id)
        .maybeSingle();
      if (data?.cancel_requested || data?.status === 'cancelled') {
        await supabase
          .from('document_ingestions')
          .update({
            status: 'cancelled',
            error_message: 'Cancelado pelo usuário',
            progress_pct: data?.status === 'cancelled' ? undefined : 0,
          })
          .eq('id', body.ingestion_id);
        return true;
      }
      return false;
    };

    // Resolve content_hash: prefer body, fallback to Idempotency-Key header
    const idempotencyHeader =
      req.headers.get('Idempotency-Key') ?? req.headers.get('idempotency-key');
    const providedHash = (body.content_hash ?? idempotencyHeader ?? '').toLowerCase();
    const isValidHash = /^[a-f0-9]{64}$/.test(providedHash);

    // ═══ Deduplication short-circuit ═══
    // Same file (same SHA-256) in the same notebook → reuse existing document + chunks.
    if (isValidHash) {
      const { data: existing } = await supabase
        .from('documents')
        .select('id, status, chunk_version')
        .eq('collection_id', body.collection_id)
        .eq('content_hash', providedHash)
        .eq('status', 'indexed')
        .maybeSingle();

      if (existing?.id) {
        const { count: activeChunks } = await supabase
          .from('chunks')
          .select('id', { count: 'exact', head: true })
          .eq('document_id', existing.id)
          .eq('is_active', true);

        // Only reuse when we actually have chunks — otherwise fall through and reprocess.
        if ((activeChunks ?? 0) > 0) {
          await supabase
            .from('document_ingestions')
            .update({
              status: 'ready',
              progress_pct: 100,
              document_id: existing.id,
              content_hash: providedHash,
              deduped_from: existing.id,
              extraction_method: 'text',
              error_message: null,
            })
            .eq('id', body.ingestion_id);

          await supabase
            .from('audit_events')
            .insert({
              user_id: user.id,
              event_type: 'document.dedup_hit',
              resource_type: 'document',
              resource_id: existing.id,
              action: 'reuse',
              metadata: {
                collection_id: body.collection_id,
                filename: body.filename,
                content_hash: providedHash,
                reused_chunks: activeChunks ?? 0,
                chunk_version: existing.chunk_version,
                source: idempotencyHeader ? 'header' : 'body',
              },
              // Best-effort, porém audível: perder o registro de reuso em
              // silêncio deixa a trilha de auditoria incompleta sem aviso.
            })
            .then(
              () => {},
              (e) =>
                console.warn(
                  `[audit] falha ao registrar document.reuse (header): ${e?.message ?? e}`,
                ),
            );

          return jsonResponse({
            status: 'ok',
            deduped: true,
            document_id: existing.id,
            reused_chunks: activeChunks ?? 0,
            chunk_version: existing.chunk_version,
          });
        }
      }
    }

    if (await checkCancelled()) return jsonResponse({ status: 'cancelled' });
    await updateStatus('parsing', 10);

    // Download from storage
    const dl = await supabase.storage.from('knowledge-uploads').download(body.storage_path);
    if (dl.error || !dl.data) {
      await updateStatus('error', 0, { error_message: `Download falhou: ${dl.error?.message}` });
      return errorResponse(req, 'Falha ao baixar arquivo', 500);
    }
    const bytes = new Uint8Array(await dl.data.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) {
      await updateStatus('error', 0, { error_message: 'Arquivo excede 20MB' });
      return errorResponse(req, 'Arquivo excede 20MB', 413);
    }

    // Compute hash server-side if the client didn't provide one
    let effectiveHash = isValidHash ? providedHash : '';
    if (!effectiveHash) {
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      effectiveHash = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }

    // Persist hash on the ingestion row for observability
    await supabase
      .from('document_ingestions')
      .update({ content_hash: effectiveHash })
      .eq('id', body.ingestion_id);

    // Late dedup: if the client didn't send a hash, re-check now that we have one.
    if (!isValidHash) {
      const { data: existing } = await supabase
        .from('documents')
        .select('id, status, chunk_version')
        .eq('collection_id', body.collection_id)
        .eq('content_hash', effectiveHash)
        .eq('status', 'indexed')
        .maybeSingle();
      if (existing?.id) {
        const { count: activeChunks } = await supabase
          .from('chunks')
          .select('id', { count: 'exact', head: true })
          .eq('document_id', existing.id)
          .eq('is_active', true);
        if ((activeChunks ?? 0) > 0) {
          await supabase
            .from('document_ingestions')
            .update({
              status: 'ready',
              progress_pct: 100,
              document_id: existing.id,
              deduped_from: existing.id,
              extraction_method: 'text',
              error_message: null,
            })
            .eq('id', body.ingestion_id);
          await supabase
            .from('audit_events')
            .insert({
              user_id: user.id,
              event_type: 'document.dedup_hit',
              resource_type: 'document',
              resource_id: existing.id,
              action: 'reuse',
              metadata: {
                collection_id: body.collection_id,
                filename: body.filename,
                content_hash: effectiveHash,
                reused_chunks: activeChunks ?? 0,
                source: 'server_computed',
              },
              // Best-effort, porém audível (ver nota no bloco de reuso acima).
            })
            .then(
              () => {},
              (e) =>
                console.warn(
                  `[audit] falha ao registrar document.reuse (hash servidor): ${e?.message ?? e}`,
                ),
            );
          return jsonResponse({
            status: 'ok',
            deduped: true,
            document_id: existing.id,
            reused_chunks: activeChunks ?? 0,
            chunk_version: existing.chunk_version,
          });
        }
      }
    }

    let fullText = '';
    let extractionMethod: 'text' | 'ocr' | 'hybrid' | 'docx' = 'text';
    let pageCount: number | null = null;
    const pageEvents: OcrPageEvent[] = [];
    const parseStart = performance.now();

    if (body.mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      fullText = await extractDocxText(bytes);
      extractionMethod = 'docx';
    } else {
      // PDF
      const pages = await extractPdfPages(bytes);
      pageCount = pages.length;
      const scannedPages = pages
        .map((t, i) => ({ page: i + 1, len: (t ?? '').trim().length }))
        .filter((p) => p.len < OCR_MIN_TEXT_PER_PAGE);

      if (body.force_ocr || scannedPages.length === pages.length) {
        // 100% scanned OR forced → require client-provided PNGs
        const hfToken = Deno.env.get('HF_API_TOKEN');
        if (!hfToken) {
          await updateStatus('error', 0, { error_message: 'HF_API_TOKEN ausente' });
          return errorResponse(req, 'OCR indisponível: HF_API_TOKEN não configurado', 503);
        }
        if (!body.ocr_pages?.length) {
          await updateStatus('error', 0, {
            error_message:
              'PDF escaneado detectado. Cliente precisa rasterizar páginas antes do reenvio.',
          });
          return jsonResponse(
            {
              error: 'ocr_pages_required',
              message: 'PDF escaneado. Envie ocr_pages: [{page,png_base64}]',
              scanned_page_count: scannedPages.length,
              total_pages: pages.length,
            },
            422,
          );
        }
        if (await checkCancelled()) return jsonResponse({ status: 'cancelled' });
        await updateStatus('ocr', 30);
        let ocrMap: Map<number, string>;
        try {
          ocrMap = await runOcrPages(
            hfToken,
            body.ocr_pages,
            async (done, total) => {
              const pct = 30 + Math.floor((done / total) * 40);
              await updateStatus('ocr', pct);
              if (await checkCancelled()) throw CANCELLED;
            },
            (ev) => pageEvents.push(ev),
          );
        } catch (e) {
          if (e === CANCELLED) return jsonResponse({ status: 'cancelled' });
          throw e;
        }

        const combined = pages.map((t, i) => {
          const p = i + 1;
          const ocr = ocrMap.get(p);
          return ocr && ocr.length > (t?.length ?? 0) ? ocr : (t ?? '');
        });
        fullText = combined.map((t, i) => `\n\n--- Página ${i + 1} ---\n${t}`).join('');
        extractionMethod = scannedPages.length === pages.length ? 'ocr' : 'hybrid';
      } else {
        // Pure text extraction — emit one event per page for parity with OCR path
        const textStart = performance.now();
        const perPage =
          pages.length > 0 ? Math.round((performance.now() - textStart) / pages.length) : 0;
        pages.forEach((t, i) => {
          pageEvents.push({
            page: i + 1,
            method: 'text',
            status: (t ?? '').trim().length > 0 ? 'success' : 'error',
            duration_ms: perPage,
            image_bytes: 0,
            text_chars: (t ?? '').length,
            ...((t ?? '').trim().length === 0 ? { error: 'empty_page' } : {}),
          });
        });
        fullText = pages.map((t, i) => `\n\n--- Página ${i + 1} ---\n${t ?? ''}`).join('');
        extractionMethod = 'text';
      }
    }

    // Emit detailed per-page OCR/extraction audit events (best-effort, non-blocking failure)
    if (pageEvents.length > 0) {
      const totalDuration = Math.round(performance.now() - parseStart);
      const auditRows = pageEvents.map((ev) => ({
        user_id: user.id,
        event_type: 'ocr.page',
        resource_type: 'document_ingestion',
        resource_id: body.ingestion_id,
        action: ev.status === 'success' ? 'extract' : 'extract_failed',
        metadata: {
          page: ev.page,
          method: ev.method,
          status: ev.status,
          duration_ms: ev.duration_ms,
          image_bytes: ev.image_bytes,
          text_chars: ev.text_chars,
          filename: body.filename,
          mime: body.mime,
          collection_id: body.collection_id,
          extraction_method: extractionMethod,
          total_parse_ms: totalDuration,
          ...(ev.error ? { error: ev.error.slice(0, 500) } : {}),
        },
      }));
      const { error: auditErr } = await supabase.from('audit_events').insert(auditRows);
      if (auditErr) {
        console.error('[doc-parse] audit_events insert failed:', auditErr.message);
      }
    }

    fullText = fullText.trim();
    if (!fullText || fullText.length < 20) {
      await updateStatus('error', 0, { error_message: 'Nenhum texto extraído' });
      return errorResponse(req, 'Nenhum texto foi extraído do documento', 422);
    }

    // Cria row em documents
    const chunkOpts = normalizeChunkOptions({
      size: body.chunk_size,
      overlap: body.chunk_overlap,
      strategy: body.chunk_strategy,
    });

    if (await checkCancelled()) return jsonResponse({ status: 'cancelled' });
    await updateStatus('chunking', 75, { pages: pageCount, extraction_method: extractionMethod });

    const { data: doc, error: docErr } = await supabase
      .from('documents')
      .insert({
        collection_id: body.collection_id,
        title: body.filename,
        source_type: 'upload',
        source_url: body.storage_path,
        mime_type: body.mime,
        size_bytes: bytes.byteLength,
        status: 'processing',
        content_hash: effectiveHash || null,
        chunk_size: chunkOpts.size,
        chunk_overlap: chunkOpts.overlap,
        chunk_strategy: chunkOpts.strategy,
        chunk_version: 1,
        parsed_text: fullText,

        metadata: {
          filename: body.filename,
          extraction_method: extractionMethod,
          pages: pageCount,
          ingestion_id: body.ingestion_id,
        },
      })
      .select('id')
      .single();
    if (docErr || !doc) {
      await updateStatus('error', 0, { error_message: `documents insert: ${docErr?.message}` });
      return errorResponse(req, 'Falha ao criar documento', 500);
    }

    await supabase
      .from('document_ingestions')
      .update({ document_id: doc.id })
      .eq('id', body.ingestion_id);

    if (await checkCancelled()) return jsonResponse({ status: 'cancelled' });
    await updateStatus('embedding', 85);

    const chunks = chunkText(fullText, chunkOpts);

    // Fetch notebook name for chunk metadata (best-effort)
    let notebookName: string | null = null;
    try {
      const { data: col } = await supabase
        .from('collections')
        .select('name')
        .eq('id', body.collection_id)
        .maybeSingle();
      notebookName = (col?.name as string | undefined) ?? null;
    } catch {
      /* skip */
    }

    const chunkRows = chunks.map((content, i) => ({
      document_id: doc.id,
      content,
      chunk_index: i,
      embedding_status: 'pending',
      token_count: Math.ceil(content.length / 4),
      chunk_version: 1,
      is_active: true,
      metadata: {
        filename: body.filename,
        extraction_method: extractionMethod,
        collection_id: body.collection_id,
        notebook_name: notebookName,
        chunk_strategy: chunkOpts.strategy,
        chunk_size: chunkOpts.size,
        chunk_overlap: chunkOpts.overlap,
      },
    }));
    const { error: cErr } = await supabase.from('chunks').insert(chunkRows);
    if (cErr) {
      await updateStatus('error', 0, { error_message: `chunks insert: ${cErr.message}` });
      return errorResponse(req, 'Falha ao gravar chunks', 500);
    }

    await supabase.from('documents').update({ status: 'indexed' }).eq('id', doc.id);
    await updateStatus('ready', 100);

    // Dispara embeddings em background via rag-embed-backfill (best-effort)
    supabase.functions
      .invoke('rag-embed-backfill', {
        body: { document_id: doc.id },
      })
      .catch(() => {});

    return jsonResponse({
      status: 'ok',
      document_id: doc.id,
      chunks: chunks.length,
      pages: pageCount,
      extraction_method: extractionMethod,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
