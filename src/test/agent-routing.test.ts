/**
 * agentRoutingService tests.
 *
 * A versão anterior cobria apenas `summarizeRoutes` e os labels — as funções
 * que tocam o banco ficavam sem teste algum (`from: vi.fn()` devolvia
 * `undefined`, então qualquer chamada real explodiria). Com o mock
 * compartilhado passamos a cobrir também o caminho de dados, com destaque
 * para `bulkToggleSource`, que é o botão de pânico de "desligar tudo de uma
 * origem" e precisa devolver a contagem correta de linhas afetadas.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSharedSupabaseMock } from './utils/supabaseMock';

vi.mock('@/lib/supabaseExtended', async () => {
  const m = await import('./utils/supabaseMock');
  const mock = m.getSharedSupabaseMock('agent-routing');
  return {
    fromTable: (t: string) => (mock.client.from as (x: string) => unknown)(t),
    rpcCall: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
});
vi.mock('@/integrations/supabase/client', async () => {
  const m = await import('./utils/supabaseMock');
  return { supabase: m.getSharedSupabaseMock('agent-routing').client };
});
vi.mock('@/lib/agentService', () => ({
  getWorkspaceId: vi.fn().mockResolvedValue('ws-1'),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  summarizeRoutes,
  getSourceLabel,
  SOURCE_LABELS,
  listAllRoutes,
  listRoutesBySource,
  bulkToggleSource,
  toggleRoute,
  deleteRoute,
  type AgentRoutingRow,
} from '@/services/agentRoutingService';

const db = getSharedSupabaseMock('agent-routing');


const buildRow = (overrides: Partial<AgentRoutingRow>): AgentRoutingRow => ({
  id: 'r-1',
  workspace_id: 'ws-1',
  source: 'bitrix24',
  event_type: 'ONCRMDEALADD',
  agent_id: 'agent-1',
  is_enabled: true,
  filter_json: null,
  created_at: '2026-04-08T10:00:00Z',
  updated_at: '2026-04-08T10:00:00Z',
  ...overrides,
});

describe('summarizeRoutes (pure function)', () => {
  it('returns empty array for empty input', () => {
    expect(summarizeRoutes([])).toEqual([]);
  });

  it('produces correct counts for a single source', () => {
    const rows = [
      buildRow({ id: 'r1', is_enabled: true }),
      buildRow({ id: 'r2', is_enabled: true }),
      buildRow({ id: 'r3', is_enabled: false }),
    ];
    const sums = summarizeRoutes(rows);
    expect(sums.length).toBe(1);
    expect(sums[0].source).toBe('bitrix24');
    expect(sums[0].total).toBe(3);
    expect(sums[0].enabled).toBe(2);
    expect(sums[0].disabled).toBe(1);
  });

  it('groups by source and sorts alphabetically', () => {
    const rows = [
      buildRow({ id: '1', source: 'whatsapp' }),
      buildRow({ id: '2', source: 'bitrix24' }),
      buildRow({ id: '3', source: 'gmail' }),
    ];
    expect(summarizeRoutes(rows).map((s) => s.source)).toEqual(['bitrix24', 'gmail', 'whatsapp']);
  });

  it('unique_agents excludes null agent_ids', () => {
    const rows = [
      buildRow({ id: '1', agent_id: 'a1' }),
      buildRow({ id: '2', agent_id: null }),
      buildRow({ id: '3', agent_id: 'a2' }),
    ];
    expect(summarizeRoutes(rows)[0].unique_agents).toBe(2);
  });

  it('unique_agents deduplicates same agent across rows', () => {
    const rows = [
      buildRow({ id: '1', agent_id: 'a1', event_type: 'e1' }),
      buildRow({ id: '2', agent_id: 'a1', event_type: 'e2' }),
      buildRow({ id: '3', agent_id: 'a1', event_type: 'e3' }),
    ];
    expect(summarizeRoutes(rows)[0].unique_agents).toBe(1);
  });

  it('disabled = total - enabled invariant holds', () => {
    const rows = [
      buildRow({ id: '1', is_enabled: true }),
      buildRow({ id: '2', is_enabled: false }),
      buildRow({ id: '3', is_enabled: false }),
      buildRow({ id: '4', is_enabled: true }),
    ];
    const s = summarizeRoutes(rows)[0];
    expect(s.disabled).toBe(s.total - s.enabled);
  });

  it('handles all 4 documented sources together', () => {
    const rows = [
      buildRow({ id: '1', source: 'bitrix24', agent_id: 'a1' }),
      buildRow({ id: '2', source: 'whatsapp', agent_id: 'a2' }),
      buildRow({ id: '3', source: 'gmail', agent_id: 'a1' }),
      buildRow({ id: '4', source: 'slack', agent_id: 'a3' }),
    ];
    const sums = summarizeRoutes(rows);
    expect(sums.length).toBe(4);
    expect(sums.every((s) => s.total === 1)).toBe(true);
    expect(sums.every((s) => s.unique_agents === 1)).toBe(true);
  });
});

describe('SOURCE_LABELS + getSourceLabel', () => {
  it('exposes the 4 documented sources', () => {
    const keys = Object.keys(SOURCE_LABELS);
    expect(keys).toContain('bitrix24');
    expect(keys).toContain('whatsapp');
    expect(keys).toContain('gmail');
    expect(keys).toContain('slack');
  });

  it('returns friendly label for known sources', () => {
    expect(getSourceLabel('bitrix24')).toBe('Bitrix24');
    expect(getSourceLabel('whatsapp')).toBe('WhatsApp');
    expect(getSourceLabel('gmail')).toBe('Gmail');
    expect(getSourceLabel('slack')).toBe('Slack');
  });

  it('falls through to source string for unknown sources', () => {
    expect(getSourceLabel('teams')).toBe('teams');
    expect(getSourceLabel('custom-source-xyz')).toBe('custom-source-xyz');
  });

  it('every label entry has icon and color', () => {
    for (const cfg of Object.values(SOURCE_LABELS)) {
      expect(cfg.label.length).toBeGreaterThan(0);
      expect(cfg.icon.length).toBeGreaterThan(0);
      expect(cfg.color).toMatch(/^text-/);
    }
  });
});

describe('agentRoutingService exports', () => {
  it('module exports the documented public surface', async () => {
    const mod = await import('@/services/agentRoutingService');
    expect(typeof mod.listAllRoutes).toBe('function');
    expect(typeof mod.listRoutesBySource).toBe('function');
    expect(typeof mod.summarizeRoutes).toBe('function');
    expect(typeof mod.bulkToggleSource).toBe('function');
    expect(typeof mod.toggleRoute).toBe('function');
    expect(typeof mod.deleteRoute).toBe('function');
    expect(typeof mod.getSourceLabel).toBe('function');
  });
});

describe('agentRoutingService — acesso a dados', () => {
  beforeEach(() => {
    db.reset();
    db.setResult({ data: [], error: null });
  });

  it('listAllRoutes escopa por workspace e ordena por source depois event_type', async () => {
    db.setTableResult('agent_routing_config', { data: [{ id: 'r1' }], error: null });
    const rows = await listAllRoutes();

    expect(rows).toHaveLength(1);
    expect(db.calls.eq).toHaveBeenCalledWith('workspace_id', 'ws-1');
    expect(db.calls.order).toHaveBeenNthCalledWith(1, 'source', { ascending: true });
    expect(db.calls.order).toHaveBeenNthCalledWith(2, 'event_type', { ascending: true });
  });

  it('listRoutesBySource acrescenta o filtro de origem ao escopo de workspace', async () => {
    await listRoutesBySource('whatsapp');
    expect(db.calls.eq).toHaveBeenCalledWith('workspace_id', 'ws-1');
    expect(db.calls.eq).toHaveBeenCalledWith('source', 'whatsapp');
  });

  it('bulkToggleSource devolve a contagem de linhas realmente afetadas', async () => {
    db.setTableResult('agent_routing_config', {
      data: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      error: null,
    });
    const affected = await bulkToggleSource('bitrix24', false);

    expect(affected).toBe(3);
    expect(db.calls.update).toHaveBeenCalledWith({ is_enabled: false });
    // o escopo de workspace é o que impede desligar rotas de outro tenant
    expect(db.calls.eq).toHaveBeenCalledWith('workspace_id', 'ws-1');
    expect(db.calls.eq).toHaveBeenCalledWith('source', 'bitrix24');
    expect(db.calls.select).toHaveBeenCalledWith('id');
  });

  it('bulkToggleSource devolve 0 quando o banco retorna null (não quebra a UI)', async () => {
    db.setTableResult('agent_routing_config', { data: null, error: null });
    expect(await bulkToggleSource('gmail', true)).toBe(0);
  });

  it('bulkToggleSource propaga erro em vez de reportar sucesso silencioso', async () => {
    db.setTableResult('agent_routing_config', { data: null, error: { message: 'rls' } });
    await expect(bulkToggleSource('bitrix24', false)).rejects.toMatchObject({ message: 'rls' });
  });

  it('toggleRoute e deleteRoute agem exatamente sobre o id informado', async () => {
    await toggleRoute('r-9', true);
    expect(db.calls.update).toHaveBeenCalledWith({ is_enabled: true });
    expect(db.calls.eq).toHaveBeenCalledWith('id', 'r-9');

    db.reset();
    db.setResult({ data: [], error: null });
    await deleteRoute('r-9');
    expect(db.calls.delete).toHaveBeenCalled();
    expect(db.calls.eq).toHaveBeenCalledWith('id', 'r-9');
  });
});
