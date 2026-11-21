/**
 * whatsappOutboundService tests (sprint #4 + Int-004)
 *
 * Tests the public sendMessage entry point. Since Int-004 the service
 * delegates to the `whatsapp-outbound` edge function (server-side), so
 * these tests mock supabase.functions.invoke and verify request shaping
 * and result mapping — the provider dispatch itself is tested on the edge
 * (supabase/functions/whatsapp-outbound).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockInvoke = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  sendWhatsAppMessage,
  sendWhatsAppImage,
  sendWhatsAppDocument,
  sendWhatsAppTemplate,
} from '@/services/whatsappOutboundService';

beforeEach(() => {
  mockInvoke.mockReset();
});

afterEach(() => {});

describe('whatsappOutboundService — sendWhatsAppMessage', () => {
  it('delegates to the whatsapp-outbound edge and returns its result', async () => {
    mockInvoke.mockResolvedValue({
      data: { ok: true, provider: 'meta', message_id: 'wamid.123' },
      error: null,
    });
    const result = await sendWhatsAppMessage({ to: '+5511999999999', text: 'oi mundo' });
    expect(result.ok).toBe(true);
    expect(result.provider).toBe('meta');
    expect(result.message_id).toBe('wamid.123');
    expect(mockInvoke).toHaveBeenCalledWith('whatsapp-outbound', {
      body: { to: '+5511999999999', text: 'oi mundo' },
    });
  });

  it('sends an image message with caption', async () => {
    mockInvoke.mockResolvedValue({
      data: { ok: true, provider: 'meta', message_id: 'wamid.img-1' },
      error: null,
    });
    const result = await sendWhatsAppImage('+5511999999999', 'https://example.com/x.jpg', 'foto');
    expect(result.ok).toBe(true);
    expect(mockInvoke.mock.calls[0][1].body).toEqual({
      to: '+5511999999999',
      imageUrl: 'https://example.com/x.jpg',
      caption: 'foto',
    });
  });

  it('sends a document message', async () => {
    mockInvoke.mockResolvedValue({
      data: { ok: true, provider: 'meta', message_id: 'wamid.doc-1' },
      error: null,
    });
    const result = await sendWhatsAppDocument(
      '+5511999999999',
      'https://example.com/contract.pdf',
      'contract.pdf',
    );
    expect(result.ok).toBe(true);
    expect(mockInvoke.mock.calls[0][1].body).toEqual({
      to: '+5511999999999',
      documentUrl: 'https://example.com/contract.pdf',
      documentFilename: 'contract.pdf',
    });
  });

  it('sends a template message with positional params', async () => {
    mockInvoke.mockResolvedValue({
      data: { ok: true, provider: 'meta', message_id: 'wamid.tpl-1' },
      error: null,
    });
    const result = await sendWhatsAppTemplate(
      '+5511999999999',
      'order_confirmation',
      ['Joaquim', '#1234'],
      'pt_BR',
    );
    expect(result.ok).toBe(true);
    expect(mockInvoke.mock.calls[0][1].body).toEqual({
      to: '+5511999999999',
      templateName: 'order_confirmation',
      templateLanguage: 'pt_BR',
      templateParams: ['Joaquim', '#1234'],
    });
  });

  it('returns ok:false result from the edge on provider error', async () => {
    mockInvoke.mockResolvedValue({
      data: { ok: false, provider: 'meta', message_id: null, error: 'Invalid recipient' },
      error: null,
    });
    const result = await sendWhatsAppMessage({ to: 'invalid', text: 'oi' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Invalid recipient');
  });

  it('returns ok:false on edge invocation transport error', async () => {
    mockInvoke.mockRejectedValue(new Error('network down'));
    const result = await sendWhatsAppMessage({ to: '+55119', text: 'x' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('network down');
  });
});
