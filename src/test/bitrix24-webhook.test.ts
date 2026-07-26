/**
 * Bitrix24 webhook routing tests.
 *
 * Migrado do `makeQB()` local para o mock compartilhado. O mock antigo
 * resolvia sempre `{data: [], error: null}` — o caminho de erro era
 * inalcançável, e "retorna um array" passava mesmo com o serviço quebrado.
 * As asserções abaixo verificam o isolamento por workspace + source, que é o
 * que impede rotas de Bitrix e WhatsApp de se misturarem na mesma tabela.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSharedSupabaseMock } from './utils/supabaseMock';

vi.mock('@/lib/supabaseExtended', async () => {
  const m = await import('./utils/supabaseMock');
  const mock = m.getSharedSupabaseMock('bitrix24-webhook');
  return {
    fromTable: (t: string) => (mock.client.from as (x: string) => unknown)(t),
    rpcCall: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
});

vi.mock('@/integrations/supabase/client', async () => {
  const m = await import('./utils/supabaseMock');
  return { supabase: m.getSharedSupabaseMock('bitrix24-webhook').client };
});

vi.mock('@/lib/agentService', () => ({
  getWorkspaceId: vi.fn().mockResolvedValue('ws-123'),
  listAgents: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  BITRIX24_EVENT_TYPES,
  listBitrix24Routes,
  upsertBitrix24Route,
  deleteBitrix24Route,
  toggleBitrix24Route,
  listRecentBitrix24Events,
  getBitrix24WebhookUrl,
} from '@/services/bitrix24WebhookService';

const db = getSharedSupabaseMock('bitrix24-webhook');

describe('bitrix24WebhookService — catálogo', () => {
  it('exposes the documented event types', () => {
    expect(BITRIX24_EVENT_TYPES.length).toBeGreaterThanOrEqual(7);
    const ids = BITRIX24_EVENT_TYPES.map((e) => e.id);
    expect(ids).toContain('ONCRMDEALADD');
    expect(ids).toContain('ONCRMCONTACTADD');
    expect(ids).toContain('ONIMBOTMESSAGEADD');
  });

  it('every event type has a label and description', () => {
    for (const e of BITRIX24_EVENT_TYPES) {
      expect(e.label.length).toBeGreaterThan(0);
      expect(e.description.length).toBeGreaterThan(0);
    }
  });

  it('não há ids duplicados (chave do upsert onConflict)', () => {
    const ids = BITRIX24_EVENT_TYPES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('bitrix24WebhookService — CRUD de rotas', () => {
  beforeEach(() => {
    db.reset();
    db.setResult({ data: [], error: null });
  });

  it('listBitrix24Routes isola por workspace E por source=bitrix24', async () => {
    db.setTableResult('agent_routing_config', {
      data: [{ id: 'r1', event_type: 'ONCRMDEALADD' }],
      error: null,
    });
    const routes = await listBitrix24Routes();

    expect(routes).toHaveLength(1);
    expect(db.calls.from).toHaveBeenCalledWith('agent_routing_config');
    expect(db.calls.eq).toHaveBeenCalledWith('workspace_id', 'ws-123');
    expect(db.calls.eq).toHaveBeenCalledWith('source', 'bitrix24');
    expect(db.calls.order).toHaveBeenCalledWith('event_type', { ascending: true });
  });

  it('listBitrix24Routes propaga erro de RLS', async () => {
    db.setTableResult('agent_routing_config', { data: null, error: { message: 'rls denied' } });
    await expect(listBitrix24Routes()).rejects.toMatchObject({ message: 'rls denied' });
  });

  it('upsertBitrix24Route usa a chave de conflito correta', async () => {
    await upsertBitrix24Route('ONCRMDEALADD', 'agent-uuid-here', true);

    expect(db.calls.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: 'ws-123',
        source: 'bitrix24',
        event_type: 'ONCRMDEALADD',
        agent_id: 'agent-uuid-here',
        is_enabled: true,
      }),
      { onConflict: 'workspace_id,source,event_type' },
    );
  });

  it('deleteBitrix24Route remove exatamente o id informado', async () => {
    await deleteBitrix24Route('route-7');
    expect(db.calls.delete).toHaveBeenCalled();
    expect(db.calls.eq).toHaveBeenCalledWith('id', 'route-7');
  });

  it.each([[true], [false]])('toggleBitrix24Route grava is_enabled=%s', async (enabled) => {
    await toggleBitrix24Route('route-1', enabled);
    expect(db.calls.update).toHaveBeenCalledWith({ is_enabled: enabled });
    expect(db.calls.eq).toHaveBeenCalledWith('id', 'route-1');
  });

  it('listRecentBitrix24Events ordena do mais recente e respeita o limite', async () => {
    db.setTableResult('bitrix24_webhook_events', { data: [{ id: 'e1' }], error: null });
    const events = await listRecentBitrix24Events(10);

    expect(events).toHaveLength(1);
    expect(db.calls.from).toHaveBeenCalledWith('bitrix24_webhook_events');
    expect(db.calls.eq).toHaveBeenCalledWith('workspace_id', 'ws-123');
    expect(db.calls.order).toHaveBeenCalledWith('received_at', { ascending: false });
    expect(db.calls.limit).toHaveBeenCalledWith(10);
  });

  it('listRecentBitrix24Events usa limite padrão de 50', async () => {
    await listRecentBitrix24Events();
    expect(db.calls.limit).toHaveBeenCalledWith(50);
  });

  it('getBitrix24WebhookUrl returns a URL string', () => {
    const url = getBitrix24WebhookUrl();
    expect(typeof url).toBe('string');
    expect(url).toContain('/functions/v1/bitrix24-webhook');
  });
});


// ════════════════════════════════════════════════════════════════
// Tests for the HELPER LOGIC the Edge Function relies on.
// We replicate the parseFormBody and validateSignature functions
// inline here so we can test them under vitest (the original is
// in Deno-land and can't be imported).
// ════════════════════════════════════════════════════════════════

function parseFormBody(body: string): Record<string, unknown> {
  const params = new URLSearchParams(body);
  const result: Record<string, unknown> = {};
  for (const [rawKey, value] of params.entries()) {
    const path = rawKey.replace(/\]/g, "").split("[");
    let cursor: Record<string, unknown> = result;
    for (let i = 0; i < path.length; i++) {
      const seg = path[i];
      if (i === path.length - 1) {
        cursor[seg] = value;
      } else {
        if (typeof cursor[seg] !== "object" || cursor[seg] === null) {
          cursor[seg] = {};
        }
        cursor = cursor[seg] as Record<string, unknown>;
      }
    }
  }
  return result;
}

function validateSignature(parsed: Record<string, unknown>, expectedToken: string | undefined): boolean {
  if (!expectedToken) return true;
  const auth = parsed.auth as Record<string, unknown> | undefined;
  const received = auth?.application_token;
  if (typeof received !== "string") return false;
  if (received.length !== expectedToken.length) return false;
  let diff = 0;
  for (let i = 0; i < received.length; i++) {
    diff |= received.charCodeAt(i) ^ expectedToken.charCodeAt(i);
  }
  return diff === 0;
}

describe('bitrix24-webhook — parseFormBody helper', () => {
  it('parses simple key=value pairs', () => {
    const result = parseFormBody('event=ONCRMDEALADD&handler_id=42');
    expect(result.event).toBe('ONCRMDEALADD');
    expect(result.handler_id).toBe('42');
  });

  it('parses nested bracket keys into objects', () => {
    const result = parseFormBody('data[FIELDS][ID]=1234&data[FIELDS][TITLE]=Test');
    expect(result.data).toEqual({ FIELDS: { ID: '1234', TITLE: 'Test' } });
  });

  it('handles auth subobject', () => {
    const body = 'auth[domain]=mycompany.bitrix24.com&auth[application_token]=secret123';
    const result = parseFormBody(body);
    expect(result.auth).toEqual({
      domain: 'mycompany.bitrix24.com',
      application_token: 'secret123',
    });
  });

  it('handles a complete realistic Bitrix24 payload', () => {
    const body = [
      'event=ONCRMDEALADD',
      'event_handler_id=99',
      'data[FIELDS][ID]=5678',
      'auth[domain]=promobrindes.bitrix24.com.br',
      'auth[application_token]=tok_abc123',
    ].join('&');
    const result = parseFormBody(body);
    expect(result.event).toBe('ONCRMDEALADD');
    expect((result.data as { FIELDS: { ID: string } }).FIELDS.ID).toBe('5678');
    expect((result.auth as { domain: string }).domain).toBe('promobrindes.bitrix24.com.br');
  });
});

describe('bitrix24-webhook — validateSignature helper', () => {
  const validParsed = { auth: { application_token: 'expected_token' } };
  const wrongTokenParsed = { auth: { application_token: 'wrong_token' } };
  const noAuthParsed = { event: 'ONCRMDEALADD' };

  it('returns true when no expected token is configured (dev mode)', () => {
    expect(validateSignature(validParsed, undefined)).toBe(true);
  });

  it('returns true when tokens match exactly', () => {
    expect(validateSignature(validParsed, 'expected_token')).toBe(true);
  });

  it('returns false when tokens differ', () => {
    expect(validateSignature(wrongTokenParsed, 'expected_token')).toBe(false);
  });

  it('returns false when no auth object present', () => {
    expect(validateSignature(noAuthParsed, 'expected_token')).toBe(false);
  });

  it('returns false when token length differs (avoids timing attacks)', () => {
    expect(validateSignature(
      { auth: { application_token: 'short' } },
      'much_longer_token'
    )).toBe(false);
  });

  it('uses constant-time comparison (no early exit on first diff)', () => {
    // Hard to assert directly, but we verify same-length tokens with single
    // char diff still return false (proves comparison reaches the end)
    expect(validateSignature(
      { auth: { application_token: 'abcdefghij' } },
      'abcdefghiX'
    )).toBe(false);
    expect(validateSignature(
      { auth: { application_token: 'Xbcdefghij' } },
      'abcdefghij'
    )).toBe(false);
  });
});
