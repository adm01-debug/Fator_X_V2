import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getCorsHeaders, handleCorsPreflight, jsonResponse, checkRateLimit, createRateLimitResponse, getRateLimitIdentifier, RATE_LIMITS, requireEnv } from "../_shared/mod.ts";
import { z } from "https://esm.sh/zod@3.23.8";

const IngestBodySchema = z.object({
  document_id: z.string().uuid(),
  content: z.string().min(1).max(2_000_000),
  chunk_size: z.number().int().min(100).max(8000).optional(),
  chunk_overlap: z.number().int().min(0).max(2000).optional(),
  contextual_chunking: z.boolean().optional(),
});
type IngestRequest = z.infer<typeof IngestBodySchema>;

function chunkText(text: string, chunkSize = 1000, overlap = 200): string[] {
  if (overlap >= chunkSize) overlap = Math.floor(chunkSize * 0.2);
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.substring(start, end));
    start = end - overlap;
    if (start >= text.length - overlap) break;
  }
  return chunks;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req);

  const isStream = req.headers.get('accept') === 'text/event-stream';

  try {
    const authHeader = req.headers.get('Authorization')!;
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const supabaseKey = requireEnv("SUPABASE_ANON_KEY");
    const supabase = createClient(supabaseUrl, supabaseKey, { global: { headers: { Authorization: authHeader } } });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Unauthorized');
    const rateCheck = checkRateLimit(getRateLimitIdentifier(req, user.id), RATE_LIMITS.heavy);
    if (!rateCheck.allowed) return createRateLimitResponse(rateCheck, getCorsHeaders(req));

    const rawBody = await req.json().catch(() => null);
    const parsedBody = IngestBodySchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return jsonResponse({ error: 'Payload inválido', details: parsedBody.error.flatten().fieldErrors }, 400);
    }
    const body: IngestRequest = parsedBody.data;
    const { document_id, content, chunk_size = 1000, chunk_overlap = 200 } = body;

    if (isStream) {
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Edge Function: fronteira JSON dinâmica (Supabase/HTTP), tipagem estrita adiciona ruído sem ganho de segurança.
      const send = async (type: string, data: any) => {
        await writer.write(encoder.encode(`data: ${JSON.stringify({ type, data })}\n\n`));
      };

      (async () => {
        try {
          await send('status', { message: 'Iniciando ingestão neural...', stage: 'start' });
          await supabase.from('documents').update({ status: 'processing' }).eq('id', document_id);

          const chunks = chunkText(content, chunk_size, chunk_overlap);
          await send('status', { message: `Texto segmentado em ${chunks.length} chunks`, stage: 'chunking', count: chunks.length });

          const { data: memberData } = await supabase.from('workspace_members').select('workspace_id').eq('user_id', user.id).limit(1).single();
          const { data: secret } = await supabase.from('workspace_secrets').select('key_value').eq('workspace_id', memberData?.workspace_id).eq('key_name', 'openai_api_key').single();

          const chunkRows = chunks.map((c, i) => ({
            document_id, content: c, chunk_index: i, embedding_status: 'pending',
            token_count: Math.ceil(c.length / 4)
          }));
          
          const { data: insertedChunks } = await supabase.from('chunks').insert(chunkRows).select('id');
          await send('status', { message: 'Chunks salvos no banco de dados', stage: 'db_insert' });

          if (secret?.key_value && insertedChunks) {
            const { withRetry, fetchWithTimeout } = await import('../_shared/retry.ts');
            for (let i = 0; i < insertedChunks.length; i++) {
              const resp = await withRetry(() => fetchWithTimeout('https://api.openai.com/v1/embeddings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${secret.key_value}` },
                body: JSON.stringify({ model: 'text-embedding-3-small', input: chunks[i] }),
                timeoutMs: 20_000,
              }), { attempts: 3, baseMs: 500, capMs: 5_000 });
              const res = await resp.json();
              if (res.data?.[0]?.embedding) {
                await supabase.from('chunks').update({ embedding_status: 'done' }).eq('id', insertedChunks[i].id);
              }
              await send('progress', { current: i + 1, total: chunks.length, percentage: Math.round(((i + 1) / chunks.length) * 100) });
            }
          }

          await supabase.from('documents').update({ status: 'indexed', size_bytes: content.length }).eq('id', document_id);
          await send('status', { message: 'Indexação concluída com sucesso!', stage: 'complete' });
          await writer.close();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Edge Function: fronteira JSON dinâmica (Supabase/HTTP), tipagem estrita adiciona ruído sem ganho de segurança.
        } catch (err: any) {
          await send('error', err.message);
          await writer.close();
        }
      })();

      return new Response(readable, {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      });
    }

    // Sync fallback
    const chunks = chunkText(content, chunk_size, chunk_overlap);
    await supabase.from('chunks').insert(chunks.map((c, i) => ({ document_id, content: c, chunk_index: i })));
    await supabase.from('documents').update({ status: 'indexed' }).eq('id', document_id);
    return jsonResponse({ status: 'ok', chunks: chunks.length });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Edge Function: fronteira JSON dinâmica (Supabase/HTTP), tipagem estrita adiciona ruído sem ganho de segurança.
  } catch (error: any) {
    console.error('rag-ingest error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });
  }
});

