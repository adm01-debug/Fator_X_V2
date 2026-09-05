import type { DbRow } from '@/types/dbRow';
/**
 * WhatsApp webhook routing tests.
 *
 * Migrado do `makeQB()` local para o mock compartilhado, validado por
 * `supabase-mock-simulation.test.ts`. O `makeQB` anterior resolvia sempre
 * `{data: [], error: null}`, o que tornava impossível testar o caminho de erro
 * — e é justamente ele que importa aqui: roteamento de WhatsApp que falha em
 * silêncio significa mensagem de cliente perdida sem rastro.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSharedSupabaseMock } from './utils/supabaseMock';

vi.mock('@/lib/supabaseExtended', async () => {
  const m = await import('./utils/supabaseMock');
  const mock = m.getSharedSupabaseMock('whatsapp-webhook');
  return {
    fromTable: (t: string) => (mock.client.from as (x: string) => unknown)(t),
    rpcCall: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
});

vi.mock('@/integrations/supabase/client', async () => {
  const m = await import('./utils/supabaseMock');
  return { supabase: m.getSharedSupabaseMock('whatsapp-webhook').client };
});

vi.mock('@/lib/agentService', () => ({
  getWorkspaceId: vi.fn().mockResolvedValue('ws-123'),
  listAgents: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  WHATSAPP_EVENT_TYPES,
  WHATSAPP_PROVIDERS,
  listWhatsAppRoutes,
  upsertWhatsAppRoute,
  deleteWhatsAppRoute,
  toggleWhatsAppRoute,
  listRecentWhatsAppEvents,
  getWhatsAppWebhookUrl,
} from '@/services/whatsappWebhookService';

const db = getSharedSupabaseMock('whatsapp-webhook');

describe('whatsappWebhookService — catálogo', () => {
  it('exposes documented event types', () => {
    expect(WHATSAPP_EVENT_TYPES.length).toBeGreaterThanOrEqual(8);
    const ids = WHATSAPP_EVENT_TYPES.map((e) => e.id);
    expect(ids).toContain('message.text');
    expect(ids).toContain('message.image');
    expect(ids).toContain('message.audio');
    expect(ids).toContain('message.document');
    expect(ids).toContain('status.delivered');
    expect(ids).toContain('status.read');
  });

  it('exposes 4 supported providers', () => {
    const ids = WHATSAPP_PROVIDERS.map((p) => p.id);
    expect(ids).toEqual(['twilio', 'meta', 'zapi', 'evolution']);
  });

  it('every provider has tokenEnv', () => {
    for (const p of WHATSAPP_PROVIDERS) {
      expect(p.tokenEnv).toMatch(/^WHATSAPP_/);
      expect(p.label.length).toBeGreaterThan(0);
    }
  });

  it('every event type has label and description', () => {
    for (const e of WHATSAPP_EVENT_TYPES) {
      expect(e.label.length).toBeGreaterThan(0);
      expect(e.description.length).toBeGreaterThan(0);
    }
  });

  it('não há ids de evento duplicados (chave do upsert onConflict)', () => {
    const ids = WHATSAPP_EVENT_TYPES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('whatsappWebhookService — CRUD de rotas', () => {
  beforeEach(() => {
    db.reset();
    db.setResult({ data: [], error: null });
  });

  it('listWhatsAppRoutes isola por workspace E por source=whatsapp', async () => {
    db.setTableResult('agent_routing_config', {
      data: [{ id: 'r1', event_type: 'message.text' }],
      error: null,
    });
    const routes = await listWhatsAppRoutes();

    expect(routes).toHaveLength(1);
    expect(db.calls.from).toHaveBeenCalledWith('agent_routing_config');
    // Sem o segundo eq, rotas de Bitrix/Slack vazariam para o painel do WhatsApp.
    expect(db.calls.eq).toHaveBeenCalledWith('workspace_id', 'ws-123');
    expect(db.calls.eq).toHaveBeenCalledWith('source', 'whatsapp');
    expect(db.calls.order).toHaveBeenCalledWith('event_type', { ascending: true });
  });

  it('listWhatsAppRoutes propaga erro em vez de devolver lista vazia', async () => {
    db.setTableResult('agent_routing_config', { data: null, error: { message: 'rls denied' } });
    await expect(listWhatsAppRoutes()).rejects.toMatchObject({ message: 'rls denied' });
  });

  it('upsertWhatsAppRoute usa a chave de conflito correta (idempotência da rota)', async () => {
    await upsertWhatsAppRoute('message.text', 'agent-uuid-here', true);

    expect(db.calls.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: 'ws-123',
        source: 'whatsapp',
        event_type: 'message.text',
        agent_id: 'agent-uuid-here',
        is_enabled: true,
      }),
      { onConflict: 'workspace_id,source,event_type' },
    );
  });

  it('upsertWhatsAppRoute propaga erro do banco', async () => {
    db.setTableResult('agent_routing_config', { data: null, error: { message: 'conflito' } });
    await expect(upsertWhatsAppRoute('message.image', 'a1')).rejects.toMatchObject({
      message: 'conflito',
    });
  });

  it('deleteWhatsAppRoute remove exatamente o id informado', async () => {
    await deleteWhatsAppRoute('route-9');
    expect(db.calls.delete).toHaveBeenCalled();
    expect(db.calls.eq).toHaveBeenCalledWith('id', 'route-9');
  });

  it.each([[true], [false]])('toggleWhatsAppRoute grava is_enabled=%s', async (enabled) => {
    await toggleWhatsAppRoute('route-1', enabled);
    expect(db.calls.update).toHaveBeenCalledWith({ is_enabled: enabled });
    expect(db.calls.eq).toHaveBeenCalledWith('id', 'route-1');
  });

  it('listRecentWhatsAppEvents ordena do mais recente e respeita o limite', async () => {
    db.setTableResult('whatsapp_webhook_events', { data: [{ id: 'e1' }], error: null });
    const events = await listRecentWhatsAppEvents(10);

    expect(events).toHaveLength(1);
    expect(db.calls.from).toHaveBeenCalledWith('whatsapp_webhook_events');
    expect(db.calls.eq).toHaveBeenCalledWith('workspace_id', 'ws-123');
    expect(db.calls.order).toHaveBeenCalledWith('received_at', { ascending: false });
    expect(db.calls.limit).toHaveBeenCalledWith(10);
  });

  it('listRecentWhatsAppEvents usa limite padrão de 50', async () => {
    await listRecentWhatsAppEvents();
    expect(db.calls.limit).toHaveBeenCalledWith(50);
  });

  it('getWhatsAppWebhookUrl returns a URL string', () => {
    const url = getWhatsAppWebhookUrl();
    expect(typeof url).toBe('string');
    expect(url).toContain('/functions/v1/whatsapp-webhook');
  });
});

// ════════════════════════════════════════════════════════════════
// Tests for the Edge Function helper LOGIC (provider detection,
// normalization, HMAC pattern). Replicated inline because the Edge
// Function lives in Deno-land.
// ════════════════════════════════════════════════════════════════

function parseFormBody(body: string): Record<string, string> {
  const params = new URLSearchParams(body);
  const result: Record<string, string> = {};
  for (const [k, v] of params.entries()) result[k] = v;
  return result;
}

type Provider = 'twilio' | 'meta' | 'zapi' | 'evolution' | 'unknown';

function detectProvider(headers: Record<string, string>, parsed: DbRow): Provider {
  if (headers['x-twilio-signature']) return 'twilio';
  if (headers['x-hub-signature-256']) return 'meta';
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    if ('instanceId' in obj || 'phone' in obj) return 'zapi';
    if ('event' in obj && 'instance' in obj) return 'evolution';
    if ('object' in obj && obj.object === 'whatsapp_business_account') return 'meta';
  }
  return 'unknown';
}

describe('whatsapp-webhook — parseFormBody helper (Twilio)', () => {
  it('parses Twilio inbound message form fields', () => {
    const body = [
      'MessageSid=SM123abc',
      'From=whatsapp%3A%2B5511999998888',
      'To=whatsapp%3A%2B5511777776666',
      'Body=Olá%20mundo',
      'NumMedia=0',
    ].join('&');
    const result = parseFormBody(body);
    expect(result.MessageSid).toBe('SM123abc');
    expect(result.From).toBe('whatsapp:+5511999998888');
    expect(result.Body).toBe('Olá mundo');
    expect(result.NumMedia).toBe('0');
  });

  it('parses media-bearing Twilio payload', () => {
    const body = 'MessageSid=SM456&NumMedia=1&MediaContentType0=image%2Fjpeg';
    const result = parseFormBody(body);
    expect(result.NumMedia).toBe('1');
    expect(result.MediaContentType0).toBe('image/jpeg');
  });
});

describe('whatsapp-webhook — detectProvider', () => {
  it('detects Twilio via X-Twilio-Signature header', () => {
    expect(detectProvider({ 'x-twilio-signature': 'sig123' }, {})).toBe('twilio');
  });

  it('detects Meta via X-Hub-Signature-256 header', () => {
    expect(detectProvider({ 'x-hub-signature-256': 'sha256=abc' }, {})).toBe('meta');
  });

  it('detects Meta via business account body shape', () => {
    expect(detectProvider({}, { object: 'whatsapp_business_account', entry: [] })).toBe('meta');
  });

  it('detects Z-API via instanceId or phone in body', () => {
    expect(detectProvider({}, { instanceId: 'inst-1', messageId: 'm1' })).toBe('zapi');
    expect(detectProvider({}, { phone: '5511999' })).toBe('zapi');
  });

  it('detects Evolution via event+instance keys', () => {
    expect(detectProvider({}, { event: 'messages.upsert', instance: 'main' })).toBe('evolution');
  });

  it('returns unknown when no signal matches', () => {
    expect(detectProvider({}, { random: 'data' })).toBe('unknown');
  });
});

describe('whatsapp-webhook — HMAC SHA-256 hex validation pattern', () => {
  it('detects mismatched signatures', () => {
    const expected = 'abc123';
    const provided = 'def456';
    let diff = 0;
    if (expected.length === provided.length) {
      for (let i = 0; i < expected.length; i++) {
        diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
      }
    } else {
      diff = -1;
    }
    expect(diff !== 0).toBe(true);
  });

  it('matches identical signatures', () => {
    const sig = 'abcdef123456';
    let diff = 0;
    for (let i = 0; i < sig.length; i++) {
      diff |= sig.charCodeAt(i) ^ sig.charCodeAt(i);
    }
    expect(diff).toBe(0);
  });

  it('length mismatch is treated as failure', () => {
    const a = 'short';
    const b = 'much-longer-signature';
    expect(a.length === b.length).toBe(false);
  });
});
