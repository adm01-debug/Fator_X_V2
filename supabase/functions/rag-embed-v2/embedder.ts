/**
 * Embedder puro do rag-embed-v2 — separado do handler HTTP para permitir
 * testes unitários determinísticos sem rede e sem autenticação.
 *
 * A dimensão canônica do sistema é 1536: é exatamente o que as colunas
 * `public.chunks.embedding` e `public.agent_memories_v2.embedding` declaram
 * como `vector(1536)`. pgvector exige dimensão fixa por coluna, logo qualquer
 * vetor com tamanho diferente é impossível de persistir.
 */

/** Dimensão canônica, espelhando as colunas `vector(1536)` do banco. */
export const CANONICAL_DIM = 1536;

/** Modelos disponíveis na HuggingFace Inference API. */
export const HF_MODEL_MAP: Record<string, string> = {
  'qwen3-embedding-8b': 'Qwen/Qwen3-Embedding-8B',
  'bge-m3': 'BAAI/bge-m3',
  'bge-large-en': 'BAAI/bge-large-en-v1.5',
  'multilingual-e5': 'intfloat/multilingual-e5-large',
};

/**
 * Todo vetor devolvido precisa ter EXATAMENTE a dimensão pedida.
 * Provedores não respeitam o pedido por igual: a feature-extraction da HF
 * devolve a dimensão nativa do modelo (Qwen3-Embedding-8B → 4096) e ignora
 * qualquer parâmetro. Sem esta checagem, o vetor errado só falharia no INSERT.
 */
export function hasExactDimension(vectors: number[][], dim: number): boolean {
  return vectors.length > 0 && vectors.every((v) => Array.isArray(v) && v.length === dim);
}

/**
 * Fallback determinístico (dev/offline) — projeção por hash + normalização L2.
 * Estável, porém SEM significado semântico: nunca deve ser persistido.
 */
export function hashEmbed(text: string, dim: number): number[] {
  const vec = new Array(dim).fill(0);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const idx = (code * 2654435761) % dim;
    vec[idx < 0 ? idx + dim : idx] += Math.sin(code + i) / Math.sqrt(text.length);
  }
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return vec.map((v) => v / norm);
}

/** true quando o vetor pode ser gravado numa coluna `vector(1536)`. */
export function isPgVectorCompatible(vector: number[], dim = CANONICAL_DIM): boolean {
  return (
    Array.isArray(vector) &&
    vector.length === dim &&
    vector.every((v) => typeof v === 'number' && Number.isFinite(v))
  );
}
