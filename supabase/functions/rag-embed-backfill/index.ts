// Edge Function: rag-embed-backfill
// Popula embeddings vector(1536) em public.agent_memories_v2 para linhas com embedding IS NULL.
// Executada via cron a cada 5 min. Idempotente. Limite: 200 linhas/execução.
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflight, checkRateLimit, createRateLimitResponse, getRateLimitIdentifier, RATE_LIMITS, requireEnv } from "../_shared/mod.ts";

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

async function embedBatch(texts: string[], authHeader: string, projectRef: string): Promise<EmbedBatchResult> {
  const url = `https://${projectRef}.supabase.co/functions/v1/rag-embed-v2`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
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
    throw new Error("embedder em modo degradado (hash); nenhum provedor real disponível");
  }

  const vectors: number[][] = data.embeddings ?? data.data ?? [];
  if (!Array.isArray(vectors) || vectors.length !== texts.length) {
    throw new Error("embedder returned mismatched vector count");
  }
  return { vectors, model: String(data.model ?? data.provider_used ?? "unknown") };
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req); if (req.method === "OPTIONS") return handleCorsPreflight(req);

  const identifier = getRateLimitIdentifier(req);
  const rate = await checkRateLimit(identifier, RATE_LIMITS.heavy);
  if (!rate.success) return createRateLimitResponse(rate.remaining, rate.reset, cors);

  const startedAt = Date.now();
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    // 1. Busca linhas pendentes (content não vazio, embedding NULL, attempts < 3)
    const { data: rows, error: fetchErr } = await admin
      .from("agent_memories_v2")
      .select("id, content")
      .is("embedding", null)
      .lt("embed_attempts", 3)
      .not("content", "is", null)
      .order("created_at", { ascending: true })
      .limit(MAX_ROWS);

    if (fetchErr) throw fetchErr;
    const pending = (rows ?? []).filter((r: MemoryRow) => r.content && r.content.length >= 10);

    if (pending.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, processed: 0, elapsed_ms: Date.now() - startedAt }),
        { headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    let processed = 0;
    let failed = 0;
    const authHeader = `Bearer ${serviceKey}`;

    async function markFailure(ids: string[], errMsg: string) {
      const truncated = errMsg.slice(0, 500);
      // increment atomicamente via RPC não existe; usamos update+fetch mínimo
      for (const id of ids) {
        const { data: current } = await admin
          .from("agent_memories_v2")
          .select("embed_attempts")
          .eq("id", id)
          .maybeSingle();
        const attempts = ((current?.embed_attempts as number | undefined) ?? 0) + 1;
        await admin
          .from("agent_memories_v2")
          .update({
            embed_attempts: attempts,
            embed_last_error: truncated,
            embed_last_attempt_at: new Date().toISOString(),
          })
          .eq("id", id);
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
            .from("agent_memories_v2")
            .update({
              embedding: vectors[j] as unknown as string,
              // Proveniência do modelo grava junto do vetor: sem isso não há
              // como saber quais linhas invalidar ao trocar de embedder.
              embedding_model: model,
              embed_last_error: null,
            })
            .eq("id", batch[j].id);
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
        console.error("[rag-embed-backfill] batch error:", msg);
        await markFailure(batch.map((r) => r.id), msg);
        await new Promise((r) => setTimeout(r, 500));
      }
    }


    return new Response(
      JSON.stringify({
        ok: true,
        processed,
        failed,
        candidates: pending.length,
        elapsed_ms: Date.now() - startedAt,
      }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[rag-embed-backfill] fatal:", msg);
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
