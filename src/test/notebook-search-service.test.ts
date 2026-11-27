/**
 * notebookSearchService — contrato da busca híbrida escopada ao notebook.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const invokeMock = vi.fn();
const rpcMock = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

import { searchNotebookChunks } from '@/services/notebookSearchService';

const NOTEBOOK = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
  invokeMock.mockReset();
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ data: [], error: null });
});

describe('searchNotebookChunks', () => {
  it('não consulta o banco com query vazia', async () => {
    const result = await searchNotebookChunks('   ', NOTEBOOK);
    expect(result).toEqual([]);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('envia o vetor da consulta quando o embedding está disponível', async () => {
    invokeMock.mockResolvedValue({ data: { embeddings: [[0.1, 0.2]] }, error: null });
    await searchNotebookChunks('ambev', NOTEBOOK, 5);

    expect(invokeMock).toHaveBeenCalledWith('rag-embed-v2', { body: { texts: ['ambev'] } });
    const [fn, params] = rpcMock.mock.calls[0];
    expect(fn).toBe('hybrid_search_notebook');
    expect(params).toMatchObject({
      p_query: 'ambev',
      p_notebook_id: NOTEBOOK,
      p_query_embedding: '[0.1,0.2]',
      p_limit: 5,
    });
  });

  it('cai para busca textual pura quando o embedding falha', async () => {
    invokeMock.mockRejectedValue(new Error('provider offline'));
    await searchNotebookChunks('ambev', null);

    const [, params] = rpcMock.mock.calls[0];
    expect(params.p_query_embedding).toBeUndefined();
    expect(params.p_notebook_id).toBeUndefined();
  });

  it('normaliza os escores numéricos e preenche conteúdo nulo', async () => {
    invokeMock.mockResolvedValue({ data: null, error: null });
    rpcMock.mockResolvedValue({
      data: [
        {
          chunk_id: 'c1',
          document_id: 'd1',
          document_title: 'Contrato Ambev',
          content: null,
          bm25_score: '0.42',
          vector_score: 0.9,
          rrf_score: '0.016',
        },
      ],
      error: null,
    });

    const [hit] = await searchNotebookChunks('ambev', NOTEBOOK);
    expect(hit).toEqual({
      chunk_id: 'c1',
      document_id: 'd1',
      document_title: 'Contrato Ambev',
      content: '',
      bm25_score: 0.42,
      vector_score: 0.9,
      rrf_score: 0.016,
    });
  });

  it('propaga o erro da RPC', async () => {
    invokeMock.mockResolvedValue({ data: null, error: null });
    rpcMock.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    await expect(searchNotebookChunks('ambev', NOTEBOOK)).rejects.toEqual({
      message: 'permission denied',
    });
  });
});