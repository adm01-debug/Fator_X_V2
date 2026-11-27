/**
 * costAnomalyService — leitura das baselines do detector.
 *
 * `listBaselines` foi adicionada para dar tela a `cost_baselines`, que era
 * escrita só por `compute_cost_baselines()` e nunca lida. Aqui se prova o que a
 * tela não prova: a ordenação/limite da consulta e a política de erro
 * (lançar, para o painel mostrar falha em vez de "sem baseline").
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSharedSupabaseMock } from './utils/supabaseMock';

vi.mock('@/integrations/supabase/client', async () => {
  const m = await import('./utils/supabaseMock');
  return { supabase: m.getSharedSupabaseMock('cost-anomaly').client };
});

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const db = getSharedSupabaseMock('cost-anomaly');

beforeEach(() => {
  db.reset();
  db.setResult({ data: [], error: null });
});

describe('costAnomalyService.listBaselines', () => {
  it('ordena pelas mais recentes e aplica o teto informado', async () => {
    const { listBaselines } = await import('@/services/costAnomalyService');
    await listBaselines({ limit: 25 });

    expect(db.calls.from).toHaveBeenCalledWith('cost_baselines');
    expect(db.calls.order).toHaveBeenCalledWith('computed_at', { ascending: false });
    expect(db.calls.limit).toHaveBeenCalledWith(25);
    expect(db.calls.eq).not.toHaveBeenCalled();
  });

  it('filtra por escopo apenas quando informado', async () => {
    const { listBaselines } = await import('@/services/costAnomalyService');
    await listBaselines({ scope: 'agent' });
    expect(db.calls.eq).toHaveBeenCalledWith('scope', 'agent');
  });

  it('lança em erro — o painel precisa distinguir falha de baseline ausente', async () => {
    db.setResult({ data: null, error: { message: 'permission denied' } });
    const { listBaselines } = await import('@/services/costAnomalyService');
    await expect(listBaselines()).rejects.toBeTruthy();
  });
});
