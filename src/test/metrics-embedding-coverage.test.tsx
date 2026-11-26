/**
 * EmbeddingCoverageCard — cobertura de memórias e de chunks de documentos.
 *
 * A RPC `get_chunk_embedding_coverage(_workspace_id)` existia desde o QA V6 sem
 * nenhum consumidor: dava para ingerir documentos e nunca saber se os chunks
 * receberam embedding (pipeline de RAG separado das memórias). Os testes travam
 * o merge das duas métricas e a degradação quando só a secundária falha.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { getSharedSupabaseMock } from './utils/supabaseMock';

vi.mock('@/integrations/supabase/client', async () => {
  const m = await import('./utils/supabaseMock');
  return { supabase: m.getSharedSupabaseMock('metrics-embedding').client };
});

import { EmbeddingCoverageCard } from '@/components/metrics/EmbeddingCoverageCard';

const db = getSharedSupabaseMock('metrics-embedding');

beforeEach(() => {
  db.reset();
});

describe('EmbeddingCoverageCard', () => {
  it('mostra a cobertura dos chunks de documentos junto da cobertura de memórias', async () => {
    db.setRpcResult('get_embedding_coverage', {
      data: [{ total: 10, embedded: 9, dead_letter: 0, pct: 90 }],
      error: null,
    });
    db.setRpcResult('get_chunk_embedding_coverage', {
      data: [
        {
          total_chunks: 5,
          embedded_chunks: 2,
          pending_chunks: 3,
          coverage_pct: 40,
          distinct_models: 1,
        },
      ],
      error: null,
    });

    render(<EmbeddingCoverageCard workspaceId="ws1" />);

    expect(await screen.findByText('Chunks de documentos')).toBeInTheDocument();
    expect(screen.getByText(/2 de 5 chunks com embedding/)).toBeInTheDocument();
    expect(screen.getByText(/3 pendentes/)).toBeInTheDocument();
    expect(screen.getByText('40.0%')).toBeInTheDocument();
    expect(db.calls.rpc).toHaveBeenCalledWith('get_chunk_embedding_coverage', {
      _workspace_id: 'ws1',
    });
  });

  it('não derruba o card quando a cobertura de chunks falha', async () => {
    db.setRpcResult('get_embedding_coverage', {
      data: [{ total: 10, embedded: 10, dead_letter: 0, pct: 100 }],
      error: null,
    });
    db.setRpcResult('get_chunk_embedding_coverage', {
      data: null,
      error: { message: 'permission denied' },
    });

    render(<EmbeddingCoverageCard workspaceId="ws1" />);

    expect(await screen.findByText('100.0%')).toBeInTheDocument();
    expect(screen.queryByText('Chunks de documentos')).toBeNull();
    expect(screen.queryByText(/Falha:/)).toBeNull();
  });

  it('não mostra a seção de chunks quando o workspace não tem chunks', async () => {
    db.setRpcResult('get_embedding_coverage', {
      data: [{ total: 1, embedded: 1, dead_letter: 0, pct: 100 }],
      error: null,
    });
    db.setRpcResult('get_chunk_embedding_coverage', {
      data: [
        {
          total_chunks: 0,
          embedded_chunks: 0,
          pending_chunks: 0,
          coverage_pct: 0,
          distinct_models: 0,
        },
      ],
      error: null,
    });

    render(<EmbeddingCoverageCard workspaceId="ws1" />);

    expect(await screen.findByText(/1 de 1 memórias com embedding/)).toBeInTheDocument();
    expect(screen.queryByText('Chunks de documentos')).toBeNull();
  });
});