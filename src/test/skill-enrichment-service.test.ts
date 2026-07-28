import { describe, expect, it } from 'vitest';

import {
  classifyApplyError,
  toEnrichQueueError,
  type ApplyFailureKind,
} from '@/services/skillEnrichmentService';

/**
 * Política de retry do enriquecimento de descrições.
 *
 * Estes casos são os modos de falha reais observados no gateway de IA. O que
 * está sendo protegido não é a mensagem, é a DECISÃO de retentar: marcar 402
 * como transitório faz cada item do lote queimar todas as tentativas contra a
 * mesma parede antes de o lote inteiro morrer — o usuário espera minutos para
 * receber o mesmo erro que já era conhecido na primeira chamada.
 */
function erroHttp(status: number, headers: Record<string, string> = {}): Error {
  const err = new Error(`Edge Function returned ${status}`);
  // Formato do supabase-js: o Response cru vem em `context.response`.
  (err as unknown as { context: { response: Response } }).context = {
    response: new Response(null, { status, headers }),
  };
  return err;
}

describe('toEnrichQueueError — decisão de retry por status', () => {
  it('402 (créditos) NUNCA é retentável', () => {
    const e = toEnrichQueueError(erroHttp(402), 'fallback');
    expect(e.retryable).toBe(false);
    expect(e.kind).toBe('creditos');
    expect(e.retryAfterMs).toBeNull();
  });

  it('401 e 403 não são retentáveis: permissão não muda sozinha', () => {
    for (const status of [401, 403]) {
      const e = toEnrichQueueError(erroHttp(status), 'fallback');
      expect(e.retryable, `status ${status}`).toBe(false);
      expect(e.kind).toBe('permissao');
    }
  });

  it('429 é retentável e respeita Retry-After em segundos', () => {
    const e = toEnrichQueueError(erroHttp(429, { 'Retry-After': '30' }), 'fallback');
    expect(e.retryable).toBe(true);
    expect(e.kind).toBe('taxa');
    expect(e.retryAfterMs).toBe(30_000);
  });

  it('429 sem Retry-After ou com header lixo cai no backoff da fila (null)', () => {
    for (const header of [undefined, 'depois', '-5', 'NaN', '']) {
      const headers = header === undefined ? {} : { 'Retry-After': header };
      const e = toEnrichQueueError(erroHttp(429, headers), 'fallback');
      expect(e.retryable, `header ${String(header)}`).toBe(true);
      expect(e.retryAfterMs).toBeNull();
    }
  });

  it('Retry-After fracionário é arredondado, nunca vira NaN de espera', () => {
    const e = toEnrichQueueError(erroHttp(429, { 'Retry-After': '1.4' }), 'fallback');
    expect(e.retryAfterMs).toBe(1400);
    const zero = toEnrichQueueError(erroHttp(429, { 'Retry-After': '0' }), 'fallback');
    expect(zero.retryAfterMs).toBe(0);
  });

  it('demais 4xx são definitivos (entrada inválida não melhora com repetição)', () => {
    for (const status of [400, 404, 409, 422]) {
      const e = toEnrichQueueError(erroHttp(status), 'fallback');
      expect(e.retryable, `status ${status}`).toBe(false);
      expect(e.kind).toBe('invalido');
    }
  });

  it('5xx é retentável: falha do lado do servidor costuma passar', () => {
    for (const status of [500, 502, 503, 504]) {
      const e = toEnrichQueueError(erroHttp(status), 'fallback');
      expect(e.retryable, `status ${status}`).toBe(true);
      expect(e.kind).toBe('servidor');
    }
  });

  it('erro sem resposta HTTP é tratado como rede e retentado', () => {
    const e = toEnrichQueueError(new Error('Failed to fetch'), 'fallback');
    expect(e.retryable).toBe(true);
    expect(e.kind).toBe('rede');
    expect(e.message).toBe('Failed to fetch');
  });

  it('entradas hostis não lançam e usam a mensagem de fallback', () => {
    for (const hostil of [null, undefined, 0, '', {}, [], { context: null }]) {
      const e = toEnrichQueueError(hostil, 'mensagem padrão');
      expect(e.message).toBe('mensagem padrão');
      expect(e.retryable).toBe(true);
    }
  });

  it('nenhum status produz simultaneamente retryable=false e espera definida', () => {
    for (let status = 400; status <= 599; status += 1) {
      const e = toEnrichQueueError(erroHttp(status, { 'Retry-After': '10' }), 'fb');
      if (!e.retryable) expect(e.retryAfterMs, `status ${status}`).toBeNull();
    }
  });
});

describe('classifyApplyError — categorias acionáveis na gravação', () => {
  const casos: Array<[string, ApplyFailureKind]> = [
    ['new row violates row-level security policy', 'permission'],
    ['permission denied for table skill_registry', 'permission'],
    ['ERROR: 42501: insufficient privilege', 'permission'],
    ['confiança abaixo do mínimo exigido', 'confidence'],
    ['confidence below threshold', 'confidence'],
    ['skill já possui descrição humana', 'conflict'],
    ['nao_elegivel: curadoria humana', 'conflict'],
    ['TypeError: Failed to fetch', 'network'],
    ['network request timeout', 'network'],
    ['algo completamente inesperado', 'unknown'],
  ];

  it.each(casos)('classifica %s', (mensagem, esperado) => {
    expect(classifyApplyError(new Error(mensagem))).toBe(esperado);
  });

  it('é insensível a caixa e aceita não-Error sem lançar', () => {
    expect(classifyApplyError('ROW-LEVEL SECURITY')).toBe('permission');
    expect(classifyApplyError(null)).toBe('unknown');
    expect(classifyApplyError(undefined)).toBe('unknown');
    expect(classifyApplyError({ toString: () => 'Failed to fetch' })).toBe('unknown');
  });

  it('permissão tem precedência sobre conflito quando a mensagem cita ambos', () => {
    // A RPC pode devolver texto composto; a ação do curador difere: pedir acesso
    // vem antes de reavaliar o conteúdo.
    expect(classifyApplyError(new Error('permission denied: já possui descrição'))).toBe(
      'permission',
    );
  });
});
