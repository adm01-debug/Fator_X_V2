/**
 * listHarvestCheckpoints — cálculo de idade e marcação `stale`.
 *
 * O painel de varreduras interrompidas decide entre "Retomar" e "Descartar"
 * unicamente a partir de `ageHours`/`stale`. Um erro de sinal ou de unidade
 * aqui faria o curador retomar progresso que o loader vai jogar fora — por
 * isso as fronteiras do TTL (24h) são testadas explicitamente, junto com
 * linhas corrompidas (datas inválidas, campos ausentes) que não podem
 * derrubar a listagem inteira.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/integrations/supabase/externalClient', async () => {
  const { getSharedSupabaseMock: get } = await import('@/test/utils/supabaseMock');
  return { supabaseExternal: get('harvest-checkpoint-list').client };
});
vi.mock('@/integrations/supabase/client', async () => {
  const { getSharedSupabaseMock: get } = await import('@/test/utils/supabaseMock');
  return { supabase: get('harvest-checkpoint-list').client };
});
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { getSharedSupabaseMock } from '@/test/utils/supabaseMock';
import { listHarvestCheckpoints } from '@/services/skillHarvestService';

const db = getSharedSupabaseMock('harvest-checkpoint-list');
const NOW = new Date('2026-07-28T12:00:00.000Z').getTime();
const HOUR = 3_600_000;

/** Constrói uma linha crua do PostgREST com idade controlada em horas. */
function row(repoKey: string, ageHours: number, extra: Record<string, unknown> = {}) {
  return {
    repo_key: repoKey,
    repos: [repoKey],
    file_offset: 42,
    total_files: 100,
    inserted_total: 7,
    updated_at: new Date(NOW - ageHours * HOUR).toISOString(),
    ...extra,
  };
}

describe('listHarvestCheckpoints', () => {
  beforeEach(() => {
    db.reset();
  });

  it('calcula a idade em horas e mapeia os campos do banco', async () => {
    db.setTableResult('skill_harvest_checkpoints', {
      data: [row('owner/repo', 3)],
      error: null,
    });

    const [item] = await listHarvestCheckpoints(NOW);

    expect(item.repoKey).toBe('owner/repo');
    expect(item.repos).toEqual(['owner/repo']);
    expect(item.offset).toBe(42);
    expect(item.total).toBe(100);
    expect(item.insertedTotal).toBe(7);
    expect(item.ageHours).toBeCloseTo(3, 5);
    expect(item.stale).toBe(false);
  });

  it('mantém como válido o checkpoint exatamente no limite do TTL (24h)', async () => {
    db.setTableResult('skill_harvest_checkpoints', {
      data: [row('owner/borda', 24)],
      error: null,
    });

    const [item] = await listHarvestCheckpoints(NOW);
    expect(item.ageHours).toBeCloseTo(24, 5);
    expect(item.stale).toBe(false);
  });

  it('marca como stale o checkpoint que ultrapassou o TTL', async () => {
    db.setTableResult('skill_harvest_checkpoints', {
      data: [row('owner/velho', 24.5)],
      error: null,
    });

    const [item] = await listHarvestCheckpoints(NOW);
    expect(item.stale).toBe(true);
  });

  it('trata data inválida como stale em vez de propagar NaN', async () => {
    db.setTableResult('skill_harvest_checkpoints', {
      data: [row('owner/corrompido', 1, { updated_at: 'not-a-date' })],
      error: null,
    });

    const [item] = await listHarvestCheckpoints(NOW);
    expect(item.stale).toBe(true);
    expect(item.ageHours).toBe(Number.POSITIVE_INFINITY);
  });

  it('normaliza campos ausentes sem quebrar a listagem', async () => {
    db.setTableResult('skill_harvest_checkpoints', {
      data: [{ repo_key: 'owner/parcial', updated_at: new Date(NOW).toISOString() }],
      error: null,
    });

    const [item] = await listHarvestCheckpoints(NOW);
    expect(item.repos).toEqual([]);
    expect(item.offset).toBe(0);
    expect(item.total).toBe(0);
    expect(item.insertedTotal).toBe(0);
  });

  it('preserva a ordem devolvida pelo banco (mais recente primeiro)', async () => {
    db.setTableResult('skill_harvest_checkpoints', {
      data: [row('owner/novo', 1), row('owner/antigo', 30)],
      error: null,
    });

    const items = await listHarvestCheckpoints(NOW);
    expect(items.map((i) => i.repoKey)).toEqual(['owner/novo', 'owner/antigo']);
    expect(items.map((i) => i.stale)).toEqual([false, true]);
  });

  it('devolve lista vazia (sem lançar) quando o banco retorna erro', async () => {
    db.setTableResult('skill_harvest_checkpoints', {
      data: null,
      error: { message: 'permission denied' },
    });

    await expect(listHarvestCheckpoints(NOW)).resolves.toEqual([]);
  });

  it('devolve lista vazia quando não há checkpoints', async () => {
    db.setTableResult('skill_harvest_checkpoints', { data: [], error: null });
    await expect(listHarvestCheckpoints(NOW)).resolves.toEqual([]);
  });
});
