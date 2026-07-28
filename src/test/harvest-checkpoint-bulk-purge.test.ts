/**
 * deleteStaleHarvestCheckpoints — expurgo em lote das retomadas vencidas.
 *
 * O risco aqui é de corte: um sinal invertido ou um TTL divergente do loader
 * apagaria progresso ainda aproveitável. Os testes fixam a fronteira (24h),
 * verificam que o filtro enviado ao PostgREST é `updated_at < cutoff` e que o
 * espelho em `localStorage` é limpo junto — caso contrário o cache local
 * ressuscitaria um checkpoint já removido do banco.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/integrations/supabase/externalClient', async () => {
  const { getSharedSupabaseMock: get } = await import('@/test/utils/supabaseMock');
  return { supabaseExternal: get('harvest-checkpoint-purge-db').client };
});
vi.mock('@/integrations/supabase/client', async () => {
  const { getSharedSupabaseMock: get } = await import('@/test/utils/supabaseMock');
  return { supabase: get('harvest-checkpoint-purge-db').client };
});
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { getSharedSupabaseMock } from '@/test/utils/supabaseMock';
import {
  deleteStaleHarvestCheckpoints,
  harvestCheckpointKey,
} from '@/services/skillHarvestService';

const db = getSharedSupabaseMock('harvest-checkpoint-purge-db');
const NOW = new Date('2026-07-28T12:00:00.000Z').getTime();
const TTL_HOURS = 24;

describe('deleteStaleHarvestCheckpoints', () => {
  beforeEach(() => {
    db.reset();
    localStorage.clear();
  });

  it('corta exatamente no TTL de 24h usando updated_at < cutoff', async () => {
    db.setTableResult('skill_harvest_checkpoints', { data: [], error: null });

    await deleteStaleHarvestCheckpoints(NOW);

    const expected = new Date(NOW - TTL_HOURS * 3_600_000).toISOString();
    expect(db.calls.delete).toHaveBeenCalled();
    expect(db.calls.lt).toHaveBeenCalledWith('updated_at', expected);
  });

  it('devolve a quantidade removida', async () => {
    db.setTableResult('skill_harvest_checkpoints', {
      data: [{ repo_key: 'a/b' }, { repo_key: 'c/d' }],
      error: null,
    });

    await expect(deleteStaleHarvestCheckpoints(NOW)).resolves.toBe(2);
  });

  it('limpa o espelho local apenas das chaves efetivamente removidas', async () => {
    const staleKey = harvestCheckpointKey(['a/b']);
    const liveKey = harvestCheckpointKey(['c/d']);
    localStorage.setItem(staleKey, '{"offset":1}');
    localStorage.setItem(liveKey, '{"offset":2}');
    localStorage.setItem('nexus:outra-coisa', 'preservar');

    db.setTableResult('skill_harvest_checkpoints', {
      data: [{ repo_key: 'a/b' }],
      error: null,
    });

    await deleteStaleHarvestCheckpoints(NOW);

    expect(localStorage.getItem(staleKey)).toBeNull();
    expect(localStorage.getItem(liveKey)).not.toBeNull();
    expect(localStorage.getItem('nexus:outra-coisa')).toBe('preservar');
  });

  it('ignora linhas sem repo_key sem quebrar a contagem', async () => {
    db.setTableResult('skill_harvest_checkpoints', {
      data: [{ repo_key: 'a/b' }, {}],
      error: null,
    });

    await expect(deleteStaleHarvestCheckpoints(NOW)).resolves.toBe(2);
  });

  it('retorna 0 quando nada está vencido', async () => {
    db.setTableResult('skill_harvest_checkpoints', { data: [], error: null });
    await expect(deleteStaleHarvestCheckpoints(NOW)).resolves.toBe(0);
  });

  it('propaga erro do banco para o painel exibir o motivo', async () => {
    db.setTableResult('skill_harvest_checkpoints', {
      data: null,
      error: { message: 'permission denied' },
    });

    await expect(deleteStaleHarvestCheckpoints(NOW)).rejects.toThrow('permission denied');
  });
});
