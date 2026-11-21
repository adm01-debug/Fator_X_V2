// Edge Function: rag-embed-backfill
// Popula embeddings vector(1536) em public.agent_memories_v2 e public.chunks para
// linhas com embedding IS NULL. Executada via cron a cada 5 min (e pós doc-parse,
// escopada por document_id). Idempotente. Limite: 200 linhas/execução.
// Retry: chunks em 'pending' OU 'failed' com embed_attempts < 5 são reprocessados;
// cada falha incrementa embed_attempts e grava o erro — sem reinício automático de
// contagem (dead-letter em embed_attempts >= 5, evita loop infinito sem provedor).
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  getCorsHeaders,
  handleCorsPreflight,
  checkRateLimit,
  createRateLimitResponse,
  getRateLimitIdentifier,
  RATE_LIMITS,
  requireEnv,
} from '../_shared/mod.ts';

const BATCH_SIZE = 20;
const MAX_ROWS = 200;
const EMBED_DIM = 1536;

interface MemoryRow {
  id: string;
  content: string;
}

interface EmbedBatchResult {
  vectors: number[][];
  model: string;
}

// Registra falha de embedding num chunk, incrementando embed_attempts e
// gravando o motivo. Repete o padrão de agent_memories_v2: falhas consecutivas
// elevam o contador até o limite (5) — quando o provedor volta a funcionar, o
// rag-embed-backfill reprocessa chunk 'failed' com embed_attempts < 5.
async function embedBatch(
  texts: string[],
  authHeader: string,
  projectRef: string,
): Promise<EmbedBatchResult> {
  const url = `https://${projectRef}.supabase.co/functions/v1/rag-embed-v2`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
    },
    // O campo é `dimension` (singular). Antes enviávamos `dimensions`, que o
    // schema Zod do embedder simplesmente ignorava: caía no default de 1024 e
    // toda linha era rejeitada por dimensão inválida, indo para o dead-letter.
    body: JSON.stringify({ texts, dimension: EMBED_DIM }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`embed batch failed: ${res.status}`);
  const data = await res.json();

  // Vetor de hash é determinístico mas semanticamente vazio. Persistir isso é
  // pior que deixar NULL: a busca passaria a devolver resultados errados com
  // aparência de confiança, e não haveria como distinguir depois. Falhar aqui
  // deixa a linha pendente para quando houver provedor real configurado.
  if (data?.degraded === true) {
    throw new Error('embedder em modo degradado (hash); nenhum provedor real disponível');
  }

  const vectors: number[][] = data.embeddings ?? data.data ?? [];
  if (!Array.isArray(vectors) || vectors.length !== texts.length) {
    throw new Error('embedder returned mismatched vector count');
  }
  return { vectors, model: String(data.model ?? data.provider_used ?? 'unknown') };
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return handleCorsPreflight(req);

  const identifier = getRateLimitIdentifier(req);
  const rate = await checkRateLimit(identifier, RATE_LIMITS.heavy);
  if (!rate.allowed) return createRateLimitResponse(rate, cors);

  const startedAt = Date.now();
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  const admin = createClient(supabaseUrl, serviceKey);

  // Registra falha de embedding num chunk, incrementando embed_attempts e
  // gravando o motivo. Falhas consecutivas elevam o contador até o limite (5):
  // quando o provedor volta, o chunk 'failed' com embed_attempts < 5 volta ao retry.
  const markChunkFailure = async (id: string, errMsg: string) => {
    const truncated = errMsg.slice(0, 500);
    const { data: current } = await admin
      .from('chunks')
      .select('embed_attempts')
      .eq('id', id)
      .maybeSingle();
    const attempts = ((current?.embed_attempts as number | undefined) ?? 0) + 1;
    await admin
      .from('chunks')
      .update({
        embedding_status: 'failed',
        embed_attempts: attempts,
        embed_last_error: truncated,
        embed_last_attempt_at: new Date().toISOString(),
      })
      .eq('id', id);
  };

  try {
    // Body opcional: doc-rechunk invoca esta edge com { document_id } para
    // escopar o embedding aos chunks daquele documento. Sem body (cron), o
    // processamento é global.
    const reqBody = (await req.json().catch(() => null)) as { document_id?: string } | null;
    const scopeDocumentId = reqBody?.document_id ?? null;

    // 1. Busca linhas pendentes (content não vazio, embedding NULL, attempts < 3)
    const { data: rows, error: fetchErr } = await admin
      .from('agent_memories_v2')
      .select('id, content')
      .is('embedding', null)
      .lt('embed_attempts', 3)
      .not('content', 'is', null)
      .order('created_at', { ascending: true })
      .limit(MAX_ROWS);

    if (fetchErr) throw fetchErr;
    const pending = (rows ?? []).filter((r: MemoryRow) => r.content && r.content.length >= 10);

    let processed = 0;
    let failed = 0;
    const authHeader = `Bearer ${serviceKey}`;

    async function markFailure(ids: string[], errMsg: string) {
      const truncated = errMsg.slice(0, 500);
      // increment atomicamente via RPC não existe; usamos update+fetch mínimo
      for (const id of ids) {
        const { data: current } = await admin
          .from('agent_memories_v2')
          .select('embed_attempts')
          .eq('id', id)
          .maybeSingle();
        const attempts = ((current?.embed_attempts as number | undefined) ?? 0) + 1;
        await admin
          .from('agent_memories_v2')
          .update({
            embed_attempts: attempts,
            embed_last_error: truncated,
            embed_last_attempt_at: new Date().toISOString(),
          })
          .eq('id', id);
      }
    }

    // 2. Processa em lotes de 20 com backoff
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const batch = pending.slice(i, i + BATCH_SIZE) as MemoryRow[];
      try {
        const { vectors, model } = await embedBatch(
          batch.map((r) => r.content.slice(0, 8000)),
          authHeader,
          projectRef,
        );

        for (let j = 0; j < batch.length; j++) {
          if (vectors[j].length !== EMBED_DIM) {
            failed++;
            await markFailure([batch[j].id], `invalid dim ${vectors[j].length}`);
            continue;
          }
          const { error: upErr } = await admin
            .from('agent_memories_v2')
            .update({
              embedding: vectors[j] as unknown as string,
              // Proveniência do modelo grava junto do vetor: sem isso não há
              // como saber quais linhas invalidar ao trocar de embedder.
              embedding_model: model,
              embed_last_error: null,
            })
            .eq('id', batch[j].id);
          if (upErr) {
            failed++;
            await markFailure([batch[j].id], upErr.message);
          } else {
            processed++;
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        failed += batch.length;
        console.error('[rag-embed-backfill] batch error:', msg);
        await markFailure(
          batch.map((r) => r.id),
          msg,
        );
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    // 3. Processa chunks pendentes/falhos (embedding NULL, status 'pending' ou
    // 'failed', embed_attempts < 5). O doc-rechunk arquiva e recria chunks
    // aguardando embed — sem este passo o vetor nunca chega ao banco e
    // `match_documents` fica sem dados. 'failed' entra no retry para que chunks
    // marcados quando o embedder degradou possam se recuperar quando o provedor
    // voltar. Quando o chamador escopa por document_id, processa só aquele doc.
    let chunkPending: Array<{ id: string; content: string }> = [];
    if (scopeDocumentId || pending.length === 0) {
      let chunkQuery = admin
        .from('chunks')
        .select('id, content')
        .is('embedding', null)
        .in('embedding_status', ['pending', 'failed'])
        .lt('embed_attempts', 5)
        .not('content', 'is', null)
        .order('created_at', { ascending: true })
        .limit(MAX_ROWS);
      if (scopeDocumentId) chunkQuery = chunkQuery.eq('document_id', scopeDocumentId);
      const { data: chunkRows, error: chunkFetchErr } = await chunkQuery;
      if (chunkFetchErr) throw chunkFetchErr;
      chunkPending = (chunkRows ?? []).filter(
        (r: { content: string | null }) => r.content && r.content.length >= 10,
      );

      for (let i = 0; i < chunkPending.length; i += BATCH_SIZE) {
        const batch = chunkPending.slice(i, i + BATCH_SIZE);
        try {
          const { vectors, model } = await embedBatch(
            batch.map((r) => r.content.slice(0, 8000)),
            authHeader,
            projectRef,
          );
          for (let j = 0; j < batch.length; j++) {
            if (vectors[j].length !== EMBED_DIM) {
              failed++;
              await markChunkFailure(batch[j].id, `invalid dim ${vectors[j].length}`);
              continue;
            }
            const { error: upErr } = await admin
              .from('chunks')
              .update({
                embedding: vectors[j] as unknown as string,
                embedding_model: model,
                embedded_at: new Date().toISOString(),
                embedding_status: 'done',
                embed_last_error: null,
              })
              .eq('id', batch[j].id);
            if (upErr) {
              failed++;
              await markChunkFailure(batch[j].id, upErr.message);
            } else {
              processed++;
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          failed += batch.length;
          console.error('[rag-embed-backfill] chunk batch error:', msg);
          await Promise.all(batch.map((r) => markChunkFailure(r.id, msg)));
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed,
        failed,
        candidates: pending.length,
        chunk_candidates: chunkPending.length,
        elapsed_ms: Date.now() - startedAt,
      }),
      { headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[rag-embed-backfill] fatal:', msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
