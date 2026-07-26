/**
 * datahubService tests.
 *
 * A suíte anterior só checava `typeof mod.x === 'function'` — cobertura
 * simbólica. O risco real aqui é de segurança: `queryEntity`,
 * `getEntityDetail` e `getDatahubStats` montam um `fetch` manual com
 * `Authorization` e `apikey`. Se o guard de sessão falhar, disparamos uma
 * requisição sem token (ou pior, com header vazio) para uma função que lê
 * bancos externos. Agora testamos o guard e o formato do envelope.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getSharedSupabaseMock } from './utils/supabaseMock';

vi.mock('@/integrations/supabase/client', async () => {
  const m = await import('./utils/supabaseMock');
  return { supabase: m.getSharedSupabaseMock('datahub').client };
});
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import type { DatahubHealthReport, DatahubProjectHealth } from '@/services/datahubService';
import {
  queryEntity,
  getEntityDetail,
  getDatahubStats,
  testDatahubConnections,
} from '@/services/datahubService';

const db = getSharedSupabaseMock('datahub');
const originalFetch = globalThis.fetch;

function stubFetch(ok: boolean, body: unknown, status = ok ? 200 : 500) {
  const spy = vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response);
  globalThis.fetch = spy as unknown as typeof fetch;
  return spy;
}

describe('datahubService — guard de sessão e envelope', () => {
  beforeEach(() => {
    db.reset();
    db.setUser({ id: 'u-1' });
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('queryEntity aborta sem sessão e NÃO dispara requisição alguma', async () => {
    db.setUser(null);
    const spy = stubFetch(true, {});

    await expect(queryEntity('deal')).rejects.toThrow('Not authenticated');
    expect(spy).not.toHaveBeenCalled();
  });

  it('getEntityDetail também aborta sem sessão', async () => {
    db.setUser(null);
    const spy = stubFetch(true, {});

    await expect(getEntityDetail('deal', 'id-1')).rejects.toThrow('Not authenticated');
    expect(spy).not.toHaveBeenCalled();
  });

  it('queryEntity envia Bearer da sessão e o envelope de ação esperado', async () => {
    const spy = stubFetch(true, { rows: [] });
    await queryEntity('deal', { stage: 'won' }, 5);

    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-token');
    expect(JSON.parse(init.body as string)).toEqual({
      action: 'query_entity',
      entity: 'deal',
      filters: { stage: 'won' },
      limit: 5,
    });
  });

  it('queryEntity converte HTTP não-ok em erro (nunca devolve corpo parcial)', async () => {
    stubFetch(false, { boom: true }, 503);
    await expect(queryEntity('deal')).rejects.toThrow('DataHub query failed: 503');
  });

  it('getDatahubStats degrada para zeros em vez de quebrar o dashboard', async () => {
    stubFetch(false, null, 500);
    expect(await getDatahubStats()).toEqual({ databases: 0, tables: 0, records: 0 });
  });

  it('testDatahubConnections propaga erro da edge function', async () => {
    db.setInvokeImpl(() => ({ data: null, error: { message: 'down' } }));
    await expect(testDatahubConnections()).rejects.toMatchObject({ message: 'down' });
    expect(db.calls.invoke).toHaveBeenCalledWith('datahub-query', {
      body: { action: 'test_connections' },
    });
  });
});


describe('datahubService exports', () => {
  it('module exports the documented public surface', async () => {
    const mod = await import('@/services/datahubService');
    expect(typeof mod.queryEntity).toBe('function');
    expect(typeof mod.getEntityDetail).toBe('function');
    expect(typeof mod.getDatahubStats).toBe('function');
    expect(typeof mod.testDatahubConnections).toBe('function');
    expect(typeof mod.listDatahubEntities).toBe('function');
    expect(typeof mod.listDatahubTables).toBe('function');
    expect(typeof mod.getDatahubHealth).toBe('function');
    expect(typeof mod.getDatahubRlsPolicies).toBe('function');
    expect(typeof mod.invokeDatahubMCPTool).toBe('function');
  });
});

describe('datahubService types', () => {
  it('DatahubHealthReport shape is valid', () => {
    const report: DatahubHealthReport = {
      timestamp: '2026-04-09T00:00:00Z',
      projects: [],
      overall_status: 'healthy',
      reachable_count: 0,
      total_count: 0,
    };
    expect(report.overall_status).toBe('healthy');
  });

  it('DatahubProjectHealth shape is valid', () => {
    const health: DatahubProjectHealth = {
      project: 'test',
      ref: 'ref-1',
      reachable: true,
      latency_ms: 50,
      table_count: 10,
      total_rows: 100,
      last_checked: '2026-04-09T00:00:00Z',
    };
    expect(health.reachable).toBe(true);
  });

  it('overall_status has 3 valid values', () => {
    const statuses: DatahubHealthReport['overall_status'][] = ['healthy', 'degraded', 'critical'];
    expect(statuses).toHaveLength(3);
  });
});
