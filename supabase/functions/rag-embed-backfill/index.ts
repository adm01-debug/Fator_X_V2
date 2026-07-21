// Edge Function: rag-embed-backfill
// Popula embeddings vector(1536) em public.agent_memories_v2 para linhas com embedding IS NULL.
// Executada via cron a cada 5 min. Idempotente. Limite: 200 linhas/execução.
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

const BATCH_SIZE = 20;
const MAX_ROWS = 200;
const EMBED_DIM = 1536;

interface MemoryRow {
  id: string;
  content: string;
}

async function embedBatch(texts: string[], authHeader: string, projectRef: string): Promise<number[][]> {
  const url = `https://${projectRef}.supabase.co/functions/v1/rag-embed-v2`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: JSON.stringify({ texts, dimensions: EMBED_DIM }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`embed batch failed: ${res.status}`);
  const data = await res.json();
  const vectors: number[][] = data.embeddings ?? data.data ?? [];
  if (!Array.isArray(vectors) || vectors.length !== texts.length) {
    throw new Error("embedder returned mismatched vector count");
  }
  return vectors;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const startedAt = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    // 1. Busca linhas pendentes (content não vazio, embedding NULL)
    const { data: rows, error: fetchErr } = await admin
      .from("agent_memories_v2")
      .select("id, content")
      .is("embedding", null)
      .not("content", "is", null)
      .limit(MAX_ROWS);

    if (fetchErr) throw fetchErr;
    const pending = (rows ?? []).filter((r: MemoryRow) => r.content && r.content.length >= 10);

    if (pending.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, processed: 0, elapsed_ms: Date.now() - startedAt }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let processed = 0;
    let failed = 0;
    const authHeader = `Bearer ${serviceKey}`;

    // 2. Processa em lotes de 20 com backoff
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const batch = pending.slice(i, i + BATCH_SIZE) as MemoryRow[];
      try {
        const vectors = await embedBatch(
          batch.map((r) => r.content.slice(0, 8000)),
          authHeader,
          projectRef,
        );

        // Valida dimensão antes de gravar
        for (let j = 0; j < batch.length; j++) {
          if (vectors[j].length !== EMBED_DIM) {
            failed++;
            continue;
          }
          const { error: upErr } = await admin
            .from("agent_memories_v2")
            .update({ embedding: vectors[j] as unknown as string })
            .eq("id", batch[j].id);
          if (upErr) failed++;
          else processed++;
        }
      } catch (err) {
        failed += batch.length;
        console.error("[rag-embed-backfill] batch error:", err instanceof Error ? err.message : err);
        // backoff simples
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
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[rag-embed-backfill] fatal:", msg);
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
