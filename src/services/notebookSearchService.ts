/**
 * Busca do Super Cérebro (super-cerebro)
 *
 * Combina a busca textual/híbrida do banco (instantânea, não depende de LLM)
 * com a resposta sintetizada do cerebro-query. A parte do banco usa
 * `hybrid_search_notebook`, que é escopada ao notebook e ao workspace do
 * usuário por RLS + get_user_workspace_ids.
 */
import { supabase } from '@/integrations/supabase/client';

export interface NotebookChunkHit {
  chunk_id: string;
  document_id: string | null;
  document_title: string | null;
  content: string;
  bm25_score: number;
  vector_score: number;
  rrf_score: number;
}

interface RawHit {
  chunk_id: string;
  document_id: string | null;
  document_title: string | null;
  content: string | null;
  bm25_score: number | string | null;
  vector_score: number | string | null;
  rrf_score: number | string | null;
}

/**
 * Gera o embedding da consulta usando a mesma edge que alimenta os chunks
 * (`rag-embed-v2`). É opcional: sem provedor configurado a busca continua
 * funcionando só com BM25.
 */
async function embedQuery(query: string): Promise<number[] | null> {
  try {
    const { data, error } = await supabase.functions.invoke('rag-embed-v2', {
      body: { texts: [query] },
    });
    if (error) return null;
    const embeddings = (data as { embeddings?: number[][] } | null)?.embeddings;
    const first = embeddings?.[0];
    return Array.isArray(first) && first.length > 0 ? first : null;
  } catch {
    return null;
  }
}

function toVectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}

export async function searchNotebookChunks(
  query: string,
  notebookId: string | null,
  limit = 15,
): Promise<NotebookChunkHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const embedding = await embedQuery(trimmed);
  const { data, error } = await supabase.rpc('hybrid_search_notebook', {
    p_query: trimmed,
    p_notebook_id: notebookId ?? undefined,
    p_query_embedding: embedding ? toVectorLiteral(embedding) : undefined,
    p_limit: limit,
  });

  if (error) throw error;

  return ((data ?? []) as RawHit[]).map((row) => ({
    chunk_id: row.chunk_id,
    document_id: row.document_id,
    document_title: row.document_title,
    content: row.content ?? '',
    bm25_score: Number(row.bm25_score ?? 0),
    vector_score: Number(row.vector_score ?? 0),
    rrf_score: Number(row.rrf_score ?? 0),
  }));
}