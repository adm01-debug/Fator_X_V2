/**
 * ═══════════════════════════════════════════════════════════════
 * Nexus Agents Studio — RAG Embed v2
 * ═══════════════════════════════════════════════════════════════
 * Multi-provider text embedding with HuggingFace, OpenAI fallback,
 * and a deterministic local fallback for development.
 *
 * Providers (in order of preference):
 *  1. HuggingFace Inference API (if HUGGINGFACE_API_KEY set)
 *     - qwen3-embedding-8b → Qwen/Qwen3-Embedding-8B
 *     - bge-m3              → BAAI/bge-m3
 *  2. OpenAI text-embedding-3-large (if OPENAI_API_KEY set)
 *  3. Deterministic hash-based fallback (dev/offline)
 *
 * Used by: src/services/ragPipelineService.ts
 * ═══════════════════════════════════════════════════════════════
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { fetchWithTimeout } from "../_shared/retry.ts";
import {
  handleCorsPreflight, jsonResponse, errorResponse,
  authenticateRequest,
  checkRateLimit, createRateLimitResponse, getRateLimitIdentifier, RATE_LIMITS,
  parseBody, z,
} from "../_shared/mod.ts";
import { CANONICAL_DIM, HF_MODEL_MAP, hasExactDimension, hashEmbed } from "./embedder.ts";

// ═══ Input Schema ═══
// CANONICAL_DIM, HF_MODEL_MAP, hasExactDimension e hashEmbed vivem em
// ./embedder.ts para permitir testes unitários sem HTTP.

const EmbedInput = z.object({
  texts: z.array(z.string().min(1).max(8000)).min(1).max(100),
  provider: z.string().default('qwen3-embedding-8b'),
  dimension: z.number().int().positive().max(4096).default(CANONICAL_DIM),
  task: z.enum(['retrieval.passage', 'retrieval.query', 'classification', 'clustering']).default('retrieval.passage'),
});

// ═══ HF Embedding ═══
async function embedWithHF(texts: string[], model: string, hfKey: string): Promise<number[][] | null> {
  try {
    const url = `https://api-inference.huggingface.co/pipeline/feature-extraction/${model}`;
    const resp = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${hfKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: texts, options: { wait_for_model: true } }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    // HF returns array<array<number>> for batched, array<number> for single
    if (Array.isArray(data) && Array.isArray(data[0])) {
      return data as number[][];
    }
    if (Array.isArray(data) && typeof data[0] === 'number') {
      return [data as number[]];
    }
    return null;
  } catch {
    return null;
  }
}

// ═══ OpenAI Embedding ═══
async function embedWithOpenAI(texts: string[], openaiKey: string, dimension: number): Promise<number[][] | null> {
  try {
    const resp = await fetchWithTimeout('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-large',
        input: texts,
        dimensions: dimension,
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return (data.data as Array<{ embedding: number[] }>).map(d => d.embedding);
  } catch {
    return null;
  }
}

// ═══ Server ═══
serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req);

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return auth.error;
    const { user, supabase } = auth;

    const identifier = getRateLimitIdentifier(req, user.id);
    const rateCheck = checkRateLimit(identifier, RATE_LIMITS.standard);
    if (!rateCheck.allowed) return createRateLimitResponse(rateCheck);

    const parsed = await parseBody(req, EmbedInput);
    if (parsed.error) return parsed.error;
    const { texts, provider, dimension } = parsed.data;

    // Look up workspace secrets
    const { data: members } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .limit(1);
    const wsId = members?.[0]?.workspace_id;

    let hfKey: string | undefined;
    let openaiKey: string | undefined;
    if (wsId) {
      const { data: secrets } = await supabase
        .from('workspace_secrets')
        .select('key_name, key_value')
        .eq('workspace_id', wsId)
        .in('key_name', ['huggingface_api_key', 'openai_api_key']);
      for (const s of secrets ?? []) {
        if (s.key_name === 'huggingface_api_key') hfKey = s.key_value;
        if (s.key_name === 'openai_api_key') openaiKey = s.key_value;
      }
    }

    // Fallback to env vars
    hfKey ??= Deno.env.get('HUGGINGFACE_API_KEY') ?? undefined;
    openaiKey ??= Deno.env.get('OPENAI_API_KEY') ?? undefined;

    let embeddings: number[][] | null = null;
    let usedProvider = 'fallback_hash';
    const rejected: string[] = [];

    // Try HF first
    if (hfKey && HF_MODEL_MAP[provider]) {
      const hf = await embedWithHF(texts, HF_MODEL_MAP[provider], hfKey);
      if (hf && hasExactDimension(hf, dimension)) {
        embeddings = hf;
        usedProvider = `hf:${HF_MODEL_MAP[provider]}`;
      } else if (hf) {
        // Dimensão nativa != pedida. Truncar seria tentador, mas só é válido em
        // modelos Matryoshka e exigiria renormalizar; adivinhar aqui produziria
        // vetores silenciosamente ruins. Descartamos e caímos para o próximo.
        rejected.push(`hf:${HF_MODEL_MAP[provider]} devolveu dim=${hf[0]?.length}, esperado ${dimension}`);
      }
    }

    // Try OpenAI
    if (!embeddings && openaiKey) {
      const oa = await embedWithOpenAI(texts, openaiKey, dimension);
      if (oa && hasExactDimension(oa, dimension)) {
        embeddings = oa;
        usedProvider = 'openai:text-embedding-3-large';
      } else if (oa) {
        rejected.push(`openai devolveu dim=${oa[0]?.length}, esperado ${dimension}`);
      }
    }

    // Deterministic fallback
    const degraded = embeddings === null;
    if (!embeddings) {
      embeddings = texts.map(t => hashEmbed(t, dimension));
      usedProvider = 'fallback_hash';
    }

    if (rejected.length > 0) {
      console.warn('rag-embed-v2: provedores descartados por dimensão', rejected);
    }

    return jsonResponse(req, {
      embeddings,
      provider_used: usedProvider,
      // Proveniência: quem persiste precisa gravar isto junto do vetor, porque
      // comparar embeddings de modelos diferentes é ruído estatístico.
      model: usedProvider,
      /**
       * `degraded: true` significa vetor de hash — estável, mas SEM significado
       * semântico. Persistir isso é pior que não ter embedding: a busca passa a
       * devolver resultados errados com aparência de confiança. Quem grava DEVE
       * recusar quando este flag estiver ligado.
       */
      degraded,
      rejected_providers: rejected,
      dimension: embeddings[0]?.length ?? dimension,
      count: embeddings.length,
      version: 'rag-embed-v2.1',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(req, message, 500);
  }
});
