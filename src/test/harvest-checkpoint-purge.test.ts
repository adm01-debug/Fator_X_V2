/**
 * purgeStaleLocalCheckpoints — higiene do armazenamento local de checkpoints.
 *
 * O ponto crítico: o expurgo itera o `localStorage` por índice. Remover
 * durante a iteração reindexa as chaves e faria pular entradas — por isso
 * os testes cobrem explicitamente o caso de várias chaves vencidas seguidas.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/integrations/supabase/externalClient', async () => {
  const { getSharedSupabaseMock: get } = await import('@/test/utils/supabaseMock');
  return { supabaseExternal: get('harvest-checkpoint').client };
});
vi.mock('@/integrations/supabase/client', async () => {
  const { getSharedSupabaseMock: get } = await import('@/test/utils/supabaseMock');
  return { supabase: get('harvest-checkpoint').client };
});
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { purgeStaleLocalCheckpoints, harvestCheckpointKey } from '@/services/skillHarvestService';

const NOW = new Date('2026-07-28T12:00:00.000Z').getTime();
const HOUR = 60 * 60 * 1000;

/** Grava uma entrada de checkpoint com idade controlada (em horas). */
function seed(repos: string[], ageHours: number, offset = 10): string {
  const key = harvestCheckpointKey(repos);
  localStorage.setItem(
    key,
    JSON.stringify({
      offset,
      total: 100,
      savedAt: new Date(NOW - ageHours * HOUR).toISOString(),
    }),
  );
  return key;
}

describe('purgeStaleLocalCheckpoints', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('mantém checkpoints dentro do TTL de 24h', () => {
    const key = seed(['org/fresco'], 1);
    expect(purgeStaleLocalCheckpoints(NOW)).toBe(0);
    expect(localStorage.getItem(key)).not.toBeNull();
  });

  it('remove checkpoints vencidos', () => {
    const key = seed(['org/velho'], 25);
    expect(purgeStaleLocalCheckpoints(NOW)).toBe(1);
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('trata a fronteira exata de 24h como ainda válida', () => {
    const key = seed(['org/fronteira'], 24);
    expect(purgeStaleLocalCheckpoints(NOW)).toBe(0);
    expect(localStorage.getItem(key)).not.toBeNull();
  });

  it('remove todas as entradas vencidas sem pular índices', () => {
    const stale = [seed(['org/a'], 30), seed(['org/b'], 40), seed(['org/c'], 50)];
    const fresh = seed(['org/d'], 2);

    expect(purgeStaleLocalCheckpoints(NOW)).toBe(3);
    for (const key of stale) expect(localStorage.getItem(key)).toBeNull();
    expect(localStorage.getItem(fresh)).not.toBeNull();
  });

  it('descarta entradas com JSON corrompido ou data inválida', () => {
    const corrupted = harvestCheckpointKey(['org/corrompido']);
    localStorage.setItem(corrupted, '{não é json');
    const undated = harvestCheckpointKey(['org/sem-data']);
    localStorage.setItem(undated, JSON.stringify({ offset: 5, total: 9 }));

    expect(purgeStaleLocalCheckpoints(NOW)).toBe(2);
    expect(localStorage.getItem(corrupted)).toBeNull();
    expect(localStorage.getItem(undated)).toBeNull();
  });

  it('não toca em chaves de outros domínios da aplicação', () => {
    localStorage.setItem('nexus.theme', 'dark');
    localStorage.setItem('outro.app.cache', 'x');
    seed(['org/velho'], 99);

    expect(purgeStaleLocalCheckpoints(NOW)).toBe(1);
    expect(localStorage.getItem('nexus.theme')).toBe('dark');
    expect(localStorage.getItem('outro.app.cache')).toBe('x');
  });

  it('é idempotente: a segunda passada não remove nada', () => {
    seed(['org/velho'], 30);
    expect(purgeStaleLocalCheckpoints(NOW)).toBe(1);
    expect(purgeStaleLocalCheckpoints(NOW)).toBe(0);
  });

  it('usa a mesma chave canônica independentemente da ordem dos repos', () => {
    expect(harvestCheckpointKey(['b/2', 'a/1'])).toBe(harvestCheckpointKey(['a/1', 'b/2']));
  });
});
