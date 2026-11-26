/**
 * billingService tests.
 *
 * A suíte anterior só checava exports. Billing é o serviço onde um teste
 * simbólico custa dinheiro: se a agregação de custo estiver errada, o
 * orçamento não corta o consumo.
 *
 * Dois riscos cobertos aqui:
 *  1. **Fronteira de client** — `usage_records` e `budgets` vivem no banco
 *     externo. `getUsageSummary` lia pelo client local, devolvendo custo 0 e
 *     fazendo `checkBudgetStatus` responder "ok" com o orçamento estourado.
 *     O teste trava a leitura no client externo.
 *  2. **Aritmética de agregação** — nulos, strings numéricas vindas de
 *     `numeric` do Postgres e limites de faixa (80% / 100%).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSharedSupabaseMock } from './utils/supabaseMock';

vi.mock('@/integrations/supabase/client', async () => {
  const m = await import('./utils/supabaseMock');
  return { supabase: m.getSharedSupabaseMock('billing-local').client };
});
vi.mock('@/integrations/supabase/externalClient', async () => {
  const m = await import('./utils/supabaseMock');
  return { supabaseExternal: m.getSharedSupabaseMock('billing-external').client };
});

import {
  getUsageSummary,
  getAgentUsage,
  getUsageRecords,
  listBudgets,
  checkBudgetStatus,
  getModelPricing,
} from '@/services/billingService';

const local = getSharedSupabaseMock('billing-local');
const db = getSharedSupabaseMock('billing-external');

beforeEach(() => {
  local.reset();
  db.reset();
});

describe('billingService — agregação de consumo', () => {
  it('soma custo e tokens ignorando nulos, e agrupa por tipo', async () => {
    db.setTableResult('usage_records', {
      data: [
        { cost_usd: 1.5, record_type: 'llm', tokens: 100, created_at: 'a' },
        { cost_usd: 2.5, record_type: 'llm', tokens: null, created_at: 'b' },
        { cost_usd: null, record_type: 'embedding', tokens: 40, created_at: 'c' },
      ],
    });

    const s = await getUsageSummary('week');
    expect(s.totalCost).toBe(4);
    expect(s.totalTokens).toBe(140);
    expect(s.byType).toEqual({ llm: 4, embedding: 0 });
    expect(s.recordCount).toBe(3);
    expect(s.period).toBe('week');
  });

  it('trata numeric do Postgres devolvido como string sem concatenar', async () => {
    db.setTableResult('usage_records', {
      data: [
        { cost_usd: '0.10', record_type: 'llm', tokens: '5', created_at: 'a' },
        { cost_usd: '0.20', record_type: 'llm', tokens: '5', created_at: 'b' },
      ],
    });

    const s = await getUsageSummary('day');
    // Sem Number(), isto viraria "00.100.20".
    expect(s.totalCost).toBeCloseTo(0.3, 10);
    expect(s.totalTokens).toBe(10);
  });

  it('classifica registros sem record_type como llm', async () => {
    db.setTableResult('usage_records', {
      data: [{ cost_usd: 1, record_type: null, tokens: 0, created_at: 'a' }],
    });
    expect((await getUsageSummary()).byType).toEqual({ llm: 1 });
  });

  it('lê usage_records do banco EXTERNO, com janela temporal aplicada', async () => {
    db.setTableResult('usage_records', { data: [] });
    await getUsageSummary('month');

    expect(db.calls.from).toHaveBeenCalledWith('usage_records');
    const [col, since] = db.calls.gte.mock.calls[0] as [string, string];
    expect(col).toBe('created_at');
    // ~30 dias atrás, nunca no futuro.
    expect(new Date(since).getTime()).toBeLessThan(Date.now());
    // Regressão: a leitura não pode voltar para o client local.
    expect(local.calls.from?.mock.calls ?? []).toHaveLength(0);
  });

  it('propaga erro do banco em vez de reportar consumo zero', async () => {
    db.setTableResult('usage_records', { data: null, error: { message: 'timeout' } });
    await expect(getUsageSummary()).rejects.toMatchObject({ message: 'timeout' });
  });
});

describe('billingService — status de orçamento', () => {
  function withBudgetAndCost(limit: number | null, cost: number) {
    db.setTableResult('budgets', { data: { id: 'b1', limit_usd: limit } });
    db.setTableResult('usage_records', {
      data: [{ cost_usd: cost, record_type: 'llm', tokens: 0, created_at: 'a' }],
    });
  }

  it('devolve no_budget sem consultar consumo quando não há orçamento', async () => {
    db.setTableResult('budgets', { data: null });
    await expect(checkBudgetStatus('ws-1')).resolves.toEqual({
      status: 'no_budget',
      used: 0,
      limit: 0,
      percentage: 0,
    });
  });

  it('ok abaixo de 80%', async () => {
    withBudgetAndCost(100, 79.9);
    const r = await checkBudgetStatus('ws-1');
    expect(r.status).toBe('ok');
    expect(r.percentage).toBe(80); // arredondado para exibição
  });

  it('warning exatamente em 80% — a borda que decide se o alerta dispara', async () => {
    withBudgetAndCost(100, 80);
    expect((await checkBudgetStatus('ws-1')).status).toBe('warning');
  });

  it('exceeded exatamente em 100%', async () => {
    withBudgetAndCost(100, 100);
    expect((await checkBudgetStatus('ws-1')).status).toBe('exceeded');
  });

  it('não divide por zero quando o limite é nulo', async () => {
    withBudgetAndCost(null, 50);
    const r = await checkBudgetStatus('ws-1');
    expect(r.percentage).toBe(0);
    expect(r.status).toBe('ok');
    expect(Number.isFinite(r.percentage)).toBe(true);
  });

  it('filtra o orçamento pelo workspace — nunca lê o de outro tenant', async () => {
    db.setTableResult('budgets', { data: null });
    await checkBudgetStatus('ws-42');
    expect(db.calls.eq).toHaveBeenCalledWith('workspace_id', 'ws-42');
  });
});

describe('billingService — listagens', () => {
  it('getAgentUsage filtra por data em formato YYYY-MM-DD', async () => {
    db.setTableResult('agent_usage', { data: [] });
    await getAgentUsage(7);

    const [, since] = db.calls.gte.mock.calls[0] as [string, string];
    expect(since).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('listagens devolvem array vazio quando data vem nulo', async () => {
    db.setResult({ data: null });
    await expect(getUsageRecords()).resolves.toEqual([]);
    await expect(listBudgets()).resolves.toEqual([]);
    await expect(getModelPricing()).resolves.toEqual([]);
  });

  it('getUsageRecords aplica o limite solicitado', async () => {
    db.setTableResult('usage_records_cost_safe', { data: [] });
    await getUsageRecords(25);
    expect(db.calls.limit).toHaveBeenCalledWith(25);
  });

  it('getUsageRecords lê a view de custo seguro, nunca a tabela crua', async () => {
    db.setTableResult('usage_records_cost_safe', {
      data: [
        {
          id: 'r1',
          workspace_id: 'ws-1',
          record_type: 'llm',
          tokens: 10,
          cost_usd: null,
          created_at: 'a',
        },
      ],
    });

    const rows = await getUsageRecords(5);

    expect(db.calls.from).toHaveBeenCalledWith('usage_records_cost_safe');
    // O custo pode vir mascarado; o valor cru nunca deve ser lido da tabela.
    expect(rows[0].cost_usd).toBeNull();
  });

  it('getUsageRecords não projeta metadata — o campo segue restrito a admins', async () => {
    db.setTableResult('usage_records_cost_safe', { data: [] });
    await getUsageRecords();

    const colunas = String(db.calls.select?.mock.calls?.[0]?.[0] ?? '');
    expect(colunas).toContain('cost_usd');
    expect(colunas).not.toContain('metadata');
    expect(colunas).not.toBe('*');
  });
});
