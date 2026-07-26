/**
 * ragPipelineService tests.
 *
 * A suíte anterior cobria os invokers rasos, mas deixava `searchAndRerank`
 * — a orquestração de 3 saltos (embed → match_documents → rerank) — sem
 * nenhum teste. É exatamente ali que moram as falhas caras:
 *
 *  - embedding vazio/malformado seguindo adiante e enviando `null` como
 *    `query_embedding` para o pgvector;
 *  - vazamento de `knowledge_base_id`, que retornaria documentos de outro
 *    tenant como contexto do LLM;
 *  - zero candidatos disparando um rerank inútil (custo por chamada).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSharedSupabaseMock } from './utils/supabaseMock';

vi.mock('@/integrations/supabase/client', async () => {
  const m = await import('./utils/supabaseMock');
  return { supabase: m.getSharedSupabaseMock('rag-local').client };
});
vi.mock('@/integrations/supabase/externalClient', async () => {
  const m = await import('./utils/supabaseMock');
  return { supabaseExternal: m.getSharedSupabaseMock('rag-external').client };
});
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import {
  embedTexts,
  rerankDocuments,
  searchAndRerank,
  invokeRagRerank,
} from '@/services/ragPipelineService';

const fns = getSharedSupabaseMock('rag-local');
const db = getSharedSupabaseMock('rag-external');

beforeEach(() => {
  fns.reset();
  db.reset();
});

describe('ragPipelineService — invokers', () => {
  it('embedTexts envia provider, dimensão e task de retrieval', async () => {
    fns.setFunctionResult('rag-embed-v2', { data: { embeddings: [[0.1]] } });
    await embedTexts(['olá']);

    const [name, opts] = fns.calls.invoke.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(name).toBe('rag-embed-v2');
    expect(opts.body).toEqual({
      texts: ['olá'],
      provider: 'qwen3-embedding-8b',
      dimension: 1024,
      task: 'retrieval.passage',
    });
  });

  it('rerankDocuments envia top_k e modelo', async () => {
    fns.setFunctionResult('rag-rerank-v2', { data: { results: [] } });
    await rerankDocuments('q', [{ id: '1', content: 'c' }], 3);

    const [, opts] = fns.calls.invoke.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(opts.body).toMatchObject({ query: 'q', top_k: 3, model: 'qwen3-reranker-8b' });
  });

  it('erros de embed e rerank viram exceção rotulada', async () => {
    fns.setFunctionResult('rag-embed-v2', { data: null, error: { message: 'embed fail' } });
    await expect(embedTexts(['t'])).rejects.toThrow('Embed error: embed fail');

    fns.setFunctionResult('rag-rerank-v2', { data: null, error: { message: 'rerank fail' } });
    await expect(rerankDocuments('q', [{ id: '1', content: 'c' }])).rejects.toThrow('Rerank error: rerank fail');
  });

  it('invokeRagRerank v1 aplica top_k padrão e devolve {} sem corpo', async () => {
    fns.setFunctionResult('rag-rerank', { data: null, error: null });
    await expect(invokeRagRerank({ query: 'q', chunks: [{ content: 'x' }] })).resolves.toEqual({});

    const [name, opts] = fns.calls.invoke.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(name).toBe('rag-rerank');
    expect(opts.body).toMatchObject({ top_k: 5 });
  });
});

describe('ragPipelineService — orquestração searchAndRerank', () => {
  /** Encadeia embed → rerank com respostas distintas por função. */
  function wireInvoke(embedData: unknown, rerankData: unknown = { results: ['r'] }) {
    fns.setInvokeImpl((name: string) => {
      if (name === 'rag-embed-v2') return { data: embedData, error: null };
      if (name === 'rag-rerank-v2') return { data: rerankData, error: null };
      return { data: null, error: null };
    });
  }

  it('passa o embedding e o knowledge_base_id corretos para o pgvector', async () => {
    wireInvoke({ embeddings: [[0.1, 0.2]] });
    db.setRpcResult('match_documents', {
      data: [{ id: 'd1', content: 'texto', similarity: 0.87 }],
    });

    await searchAndRerank('minha pergunta', 'kb-42', 4);

    expect(db.calls.rpc).toHaveBeenCalledWith('match_documents', {
      query_embedding: [0.1, 0.2],
      match_threshold: 0.5,
      match_count: 50,
      // Isolamento de tenant: sem isto, o LLM recebe documentos alheios.
      p_knowledge_base_id: 'kb-42',
    });
  });

  it('mapeia candidatos para o formato do reranker preservando similaridade', async () => {
    wireInvoke({ embeddings: [[0.1]] });
    db.setRpcResult('match_documents', {
      data: [{ id: 7, content: 'texto', similarity: 0.42 }],
    });

    await searchAndRerank('q', 'kb-1', 2);

    const rerankCall = fns.calls.invoke.mock.calls.find((c) => c[0] === 'rag-rerank-v2');
    const body = (rerankCall![1] as { body: Record<string, unknown> }).body;
    expect(body.documents).toEqual([{ id: '7', content: 'texto', score: 0.42 }]);
    expect(body.top_k).toBe(2);
  });

  it('normaliza similaridade ausente para 0 em vez de NaN', async () => {
    wireInvoke({ embeddings: [[0.1]] });
    db.setRpcResult('match_documents', { data: [{ id: 'd1', content: 'c' }] });

    await searchAndRerank('q', 'kb-1');

    const rerankCall = fns.calls.invoke.mock.calls.find((c) => c[0] === 'rag-rerank-v2');
    const docs = (rerankCall![1] as { body: { documents: Array<{ score: number }> } }).body.documents;
    expect(docs[0].score).toBe(0);
    expect(Number.isNaN(docs[0].score)).toBe(false);
  });

  it('aborta antes do pgvector quando o embedding volta vazio', async () => {
    wireInvoke({ embeddings: [] });
    await expect(searchAndRerank('q', 'kb-1')).rejects.toThrow('Failed to embed query');
    expect(db.calls.rpc?.mock.calls ?? []).toHaveLength(0);
  });

  it('aborta quando a resposta de embed não traz o campo embeddings', async () => {
    wireInvoke({ unexpected: true });
    await expect(searchAndRerank('q', 'kb-1')).rejects.toThrow('Failed to embed query');
  });

  it('sem candidatos, devolve vazio e NÃO gasta uma chamada de rerank', async () => {
    wireInvoke({ embeddings: [[0.1]] });
    db.setRpcResult('match_documents', { data: [] });

    await expect(searchAndRerank('q', 'kb-1')).resolves.toEqual({ results: [], total_candidates: 0 });
    const rerankCalls = fns.calls.invoke.mock.calls.filter((c) => c[0] === 'rag-rerank-v2');
    expect(rerankCalls).toHaveLength(0);
  });

  it('propaga falha da busca vetorial como Search error', async () => {
    wireInvoke({ embeddings: [[0.1]] });
    db.setRpcResult('match_documents', { data: null, error: { message: 'index missing' } });

    await expect(searchAndRerank('q', 'kb-1')).rejects.toThrow('Search error: index missing');
  });
});
