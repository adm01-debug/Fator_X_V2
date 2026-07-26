/**
 * crmService — testes de comportamento com o mock compartilhado.
 *
 * Foco deliberado nos pontos onde um mock raso esconderia bug real:
 *  1. Isolamento multi-tenant: TODA leitura precisa filtrar por workspace_id.
 *  2. Soft delete: nenhuma listagem pode devolver registros excluídos.
 *  3. Aritmética PostgREST: NUMERIC chega como string; somar sem converter
 *     produz concatenação silenciosa ("1000" + "500" = "1000500").
 *  4. Forecast ponderado: só negócios abertos entram, ponderados pelo estágio.
 *  5. Sync Bitrix24: o workspace vai no corpo e o erro precisa propagar.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getSharedSupabaseMock } from '@/test/utils/supabaseMock';

const db = getSharedSupabaseMock('crm-service');

vi.mock('@/integrations/supabase/client', () => ({ supabase: db.client }));
vi.mock('@/lib/supabaseExtended', () => ({
  fromTable: (table: string) => (db.client.from as (t: string) => unknown)(table),
  rpcCall: (fn: string, args?: unknown) =>
    (db.client.rpc as (f: string, a?: unknown) => unknown)(fn, args),
}));
vi.mock('@/lib/agentService', () => ({
  getWorkspaceId: vi.fn(async () => 'ws-alpha'),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  listDeals,
  listStages,
  listContacts,
  listCompanies,
  logActivity,
  summarizeDeals,
  syncFromBitrix24,
  formatCurrency,
  type CrmDeal,
  type CrmStage,
} from '@/services/crmService';

beforeEach(() => {
  db.reset();
});

describe('isolamento multi-tenant', () => {
  it('listDeals filtra por workspace_id e ignora soft-deletados', async () => {
    db.setTableResult('crm_deals', { data: [], error: null });
    await listDeals();

    expect(db.calls.eq).toHaveBeenCalledWith('workspace_id', 'ws-alpha');
    expect(db.calls.is).toHaveBeenCalledWith('deleted_at', null);
  });

  it('listContacts, listCompanies e listStages também escopam por workspace', async () => {
    db.setResult({ data: [], error: null });

    await listContacts();
    await listCompanies();
    await listStages();

    const workspaceFilters = db.calls.eq.mock.calls.filter(
      ([column]) => column === 'workspace_id',
    );
    // Uma chamada por listagem — nenhuma leitura pode escapar do escopo.
    expect(workspaceFilters.length).toBeGreaterThanOrEqual(3);
    expect(workspaceFilters.every(([, value]) => value === 'ws-alpha')).toBe(true);
  });

  it('logActivity carimba o workspace mesmo se o chamador tentar sobrescrever', async () => {
    db.setResult({ data: null, error: null });

    await logActivity({
      activity_type: 'note',
      body: 'teste',
      // Tentativa de spoof: o serviço deve sobrepor com o workspace real.
      workspace_id: 'ws-invasor',
    } as Parameters<typeof logActivity>[0]);

    const inserted = db.calls.insert.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(inserted.workspace_id).toBe('ws-alpha');
    expect(inserted.source).toBe('nexus');
  });
});

describe('normalização de NUMERIC do Postgres', () => {
  it('converte amount/lead_score string em número', async () => {
    db.setTableResult('crm_deals', {
      data: [{ id: 'd1', title: 'A', amount: '1000.50', lead_score: '72', status: 'open' }],
      error: null,
    });

    const [deal] = await listDeals();
    expect(deal.amount).toBe(1000.5);
    expect(deal.lead_score).toBe(72);
  });

  it('trata null e string vazia sem virar NaN', async () => {
    db.setTableResult('crm_deals', {
      data: [{ id: 'd1', title: 'A', amount: null, lead_score: '', status: 'open' }],
      error: null,
    });

    const [deal] = await listDeals();
    expect(deal.amount).toBe(0);
    expect(deal.lead_score).toBeNull();
  });

  it('win_probability e position de estágios viram números', async () => {
    db.setTableResult('crm_stages', {
      data: [{ id: 's1', name: 'Proposta', win_probability: '50', position: '2' }],
      error: null,
    });

    const [stage] = await listStages();
    expect(stage.win_probability).toBe(50);
    expect(stage.position).toBe(2);
  });
});

describe('summarizeDeals', () => {
  const stages: CrmStage[] = [
    { id: 's1', win_probability: 50 } as CrmStage,
    { id: 's2', win_probability: 100 } as CrmStage,
  ];

  const deals: CrmDeal[] = [
    { id: 'd1', status: 'open', amount: 1000, stage_id: 's1' } as CrmDeal,
    { id: 'd2', status: 'open', amount: 500, stage_id: 's2' } as CrmDeal,
    { id: 'd3', status: 'won', amount: 2000, stage_id: 's2' } as CrmDeal,
    { id: 'd4', status: 'lost', amount: 300, stage_id: 's1' } as CrmDeal,
  ];

  it('soma abertos sem concatenar', () => {
    const s = summarizeDeals(deals, stages);
    expect(s.openCount).toBe(2);
    expect(s.openAmount).toBe(1500);
  });

  it('pondera o forecast pela probabilidade do estágio', () => {
    // 1000 * 0.5 + 500 * 1.0 = 1000
    expect(summarizeDeals(deals, stages).weightedForecast).toBe(1000);
  });

  it('exclui ganhos e perdidos do forecast', () => {
    const s = summarizeDeals(deals, stages);
    expect(s.wonAmount).toBe(2000);
    expect(s.lostCount).toBe(1);
    expect(s.weightedForecast).toBeLessThan(s.openAmount + s.wonAmount);
  });

  it('win rate usa apenas negócios fechados', () => {
    // 1 ganho / (1 ganho + 1 perdido) = 50%
    expect(summarizeDeals(deals, stages).winRate).toBe(50);
  });

  it('não divide por zero quando nada foi fechado', () => {
    const abertos = deals.filter((d) => d.status === 'open');
    expect(summarizeDeals(abertos, stages).winRate).toBe(0);
  });

  it('estágio desconhecido não quebra o forecast', () => {
    const orfao: CrmDeal[] = [{ id: 'x', status: 'open', amount: 900, stage_id: 'inexistente' } as CrmDeal];
    const s = summarizeDeals(orfao, stages);
    expect(Number.isFinite(s.weightedForecast)).toBe(true);
    expect(s.openAmount).toBe(900);
  });

  it('funil vazio devolve zeros', () => {
    const s = summarizeDeals([], []);
    expect(s).toMatchObject({ openCount: 0, openAmount: 0, winRate: 0, weightedForecast: 0 });
  });
});

describe('syncFromBitrix24', () => {
  it('envia o workspace do usuário e devolve o resumo', async () => {
    db.setFunctionResult('crm-bitrix-sync', {
      data: { ok: true, summary: { deal: { inserted: 2, updated: 1, failed: 0 } } },
      error: null,
    } as never);

    const summary = await syncFromBitrix24(['deal']);

    expect(db.calls.invoke).toHaveBeenCalledWith(
      'crm-bitrix-sync',
      expect.objectContaining({
        body: { workspace_id: 'ws-alpha', entities: ['deal'] },
      }),
    );
    expect(summary.deal.inserted).toBe(2);
  });

  it('propaga erro da edge function em vez de fingir sucesso', async () => {
    db.setFunctionResult('crm-bitrix-sync', {
      data: null,
      error: { message: 'Bitrix24 não conectado' },
    } as never);

    await expect(syncFromBitrix24()).rejects.toMatchObject({
      message: 'Bitrix24 não conectado',
    });
  });

  it('resposta sem summary devolve objeto vazio, não undefined', async () => {
    db.setFunctionResult('crm-bitrix-sync', { data: { ok: true }, error: null } as never);
    await expect(syncFromBitrix24()).resolves.toEqual({});
  });
});

describe('formatCurrency', () => {
  it('formata em BRL pt-BR', () => {
    expect(formatCurrency(1500)).toContain('1.500');
  });

  it('respeita moeda alternativa', () => {
    expect(formatCurrency(1500, 'USD')).toMatch(/US\$|\$/);
  });
});

describe('propagação de erro nas leituras', () => {
  it('listDeals lança quando o PostgREST devolve erro', async () => {
    db.setTableResult('crm_deals', {
      data: null,
      error: { message: 'permission denied for table crm_deals' },
    });
    await expect(listDeals()).rejects.toMatchObject({
      message: 'permission denied for table crm_deals',
    });
  });
});
