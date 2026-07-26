/**
 * securityService — suíte migrada para o mock compartilhado do PostgREST.
 *
 * A versão anterior só verificava `expect(fn).toBeDefined()`, o que passa mesmo
 * se a função estiver quebrada. Como este serviço governa chaves de API,
 * guardrails e trilha de auditoria, cobertura simbólica aqui é o pior lugar
 * possível para se ter. Esta suíte exercita comportamento real: hashing da
 * chave, filtros condicionais, e — crítico — a diferença entre funções que
 * **lançam** e funções que **degradam para lista vazia**.
 *
 * Nota sobre o duplo client: `securityService` usa `supabaseExternal` para
 * TODO acesso a dados (inclusive via `fromTable(...)`) e o client local
 * `supabase` apenas para auth. Ambos são mockados com chaves distintas para
 * que a suíte prove essa fronteira em vez de apenas assumi-la.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSharedSupabaseMock } from './utils/supabaseMock';

vi.mock('@/integrations/supabase/externalClient', async () => {
  const m = await import('./utils/supabaseMock');
  return { supabaseExternal: m.getSharedSupabaseMock('security-external').client };
});

vi.mock('@/integrations/supabase/client', async () => {
  const m = await import('./utils/supabaseMock');
  return { supabase: m.getSharedSupabaseMock('security-local').client };
});

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const mockInvokeTraced = vi.fn().mockResolvedValue({ ok: true });
vi.mock('@/services/llmGatewayService', () => ({
  invokeTracedFunction: (...args: unknown[]) => mockInvokeTraced(...args),
}));

const ext = getSharedSupabaseMock('security-external');
const local = getSharedSupabaseMock('security-local');

describe('securityService', () => {
  beforeEach(() => {
    ext.reset();
    local.reset();
    ext.setResult({ data: [], error: null });
    local.setResult({ data: [], error: null });
    mockInvokeTraced.mockClear();
  });

  describe('listApiKeys', () => {
    it('nunca seleciona a coluna key_hash (vazamento de credencial)', async () => {
      const { listApiKeys } = await import('@/services/securityService');
      await listApiKeys();

      const selected = ext.calls.select.mock.calls[0]?.[0] as string;
      expect(selected).toBeTypeOf('string');
      expect(selected).not.toContain('key_hash');
      expect(selected).toContain('key_prefix');
    });

    it('propaga erro em vez de mascarar como lista vazia', async () => {
      ext.setTableResult('api_keys', { data: null, error: { message: 'rls denied' } });
      const { listApiKeys } = await import('@/services/securityService');
      await expect(listApiKeys()).rejects.toMatchObject({ message: 'rls denied' });
    });
  });

  describe('createApiKey', () => {
    it('grava apenas o hash e o prefixo, devolvendo a chave crua uma única vez', async () => {
      const { createApiKey } = await import('@/services/securityService');
      const result = await createApiKey('CI Token', ['read']);

      expect(result.raw_key).toMatch(/^nxs_[0-9a-f]{32}$/);
      expect(result.key_prefix).toBe(result.raw_key.substring(0, 12));

      const inserted = ext.calls.insert.mock.calls[0]?.[0] as Record<string, unknown>;
      // SHA-256 hex = 64 caracteres
      expect(inserted.key_hash).toMatch(/^[0-9a-f]{64}$/);
      // a chave crua jamais pode ir para o banco
      expect(JSON.stringify(inserted)).not.toContain(result.raw_key);
      expect(inserted.scopes).toEqual(['read']);
      expect(inserted.user_id).toBe('test-user-id');
    });

    it('recusa criação sem sessão autenticada', async () => {
      local.setUser(null);
      const { createApiKey } = await import('@/services/securityService');
      await expect(createApiKey('anon')).rejects.toThrow('Not authenticated');
      expect(ext.calls.insert).not.toHaveBeenCalled();
    });

    it('aceita workspace nulo quando o usuário não é membro de nenhum', async () => {
      ext.setTableResult('workspace_members', { data: null, error: null });
      const { createApiKey } = await import('@/services/securityService');
      await createApiKey('Solo');

      const inserted = ext.calls.insert.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(inserted.workspace_id).toBeNull();
    });
  });

  describe('revokeApiKey', () => {
    it('faz soft-revoke via is_active=false, nunca DELETE (preserva auditoria)', async () => {
      const { revokeApiKey } = await import('@/services/securityService');
      await revokeApiKey('key-1');

      expect(ext.calls.update).toHaveBeenCalledWith({ is_active: false });
      expect(ext.calls.eq).toHaveBeenCalledWith('id', 'key-1');
      expect(ext.calls.delete).not.toHaveBeenCalled();
    });
  });

  describe('getSecurityAlerts', () => {
    it('aplica o filtro de não-resolvidos apenas quando solicitado', async () => {
      const { getSecurityAlerts } = await import('@/services/securityService');

      await getSecurityAlerts({ limit: 10 });
      expect(ext.calls.limit).toHaveBeenCalledWith(10);
      expect(ext.calls.eq).not.toHaveBeenCalledWith('is_resolved', false);

      await getSecurityAlerts({ unresolvedOnly: true });
      expect(ext.calls.eq).toHaveBeenCalledWith('is_resolved', false);
      expect(ext.calls.limit).toHaveBeenCalledWith(50); // default
    });

    it('degrada para lista vazia em erro — painel não pode quebrar', async () => {
      ext.setTableResult('security_alerts', { data: null, error: { message: 'boom' } });
      const { getSecurityAlerts } = await import('@/services/securityService');
      expect(await getSecurityAlerts()).toEqual([]);
    });
  });

  describe('getSecurityEvents', () => {
    it('lê da view segura audit_log_safe e normaliza action → event_type', async () => {
      ext.setTableResult('audit_log_safe', {
        data: [{ action: 'login_failed', created_at: '2026-07-25T00:00:00Z' }],
        error: null,
      });
      const { getSecurityEvents } = await import('@/services/securityService');
      const events = await getSecurityEvents({ limit: 5 });

      expect(ext.calls.from).toHaveBeenCalledWith('audit_log_safe');
      expect(events[0]).toMatchObject({ event_type: 'login_failed', severity: 'info' });
      expect(ext.calls.limit).toHaveBeenCalledWith(5);
      // Trilha de auditoria é dado, não auth: jamais pode cair no client local.
      expect(local.calls.from).not.toHaveBeenCalled();
    });

    it('degrada para lista vazia em erro', async () => {
      ext.setTableResult('audit_log_safe', { data: null, error: { message: 'view ausente' } });
      const { getSecurityEvents } = await import('@/services/securityService');
      expect(await getSecurityEvents()).toEqual([]);
    });
  });

  describe('getAuditLog', () => {
    it('filtra por usuário quando informado e usa limite padrão de 100', async () => {
      const { getAuditLog } = await import('@/services/securityService');
      await getAuditLog({ userId: 'u-9' });

      expect(ext.calls.eq).toHaveBeenCalledWith('user_id', 'u-9');
      expect(ext.calls.limit).toHaveBeenCalledWith(100);
    });

    it('devolve lista vazia quando a consulta falha', async () => {
      ext.setTableResult('audit_log_safe', { data: null, error: { message: 'denied' } });
      const { getAuditLog } = await import('@/services/securityService');
      expect(await getAuditLog()).toEqual([]);
    });
  });

  describe('guardrail policies', () => {
    it('toggle atualiza is_enabled do id certo', async () => {
      const { toggleGuardrailPolicy } = await import('@/services/securityService');
      await toggleGuardrailPolicy('p1', false);

      expect(ext.calls.from).toHaveBeenCalledWith('guardrail_policies');
      expect(ext.calls.update).toHaveBeenCalledWith({ is_enabled: false });
      expect(ext.calls.eq).toHaveBeenCalledWith('id', 'p1');
    });

    it('installGuardrailPreset preserva rastreabilidade do preset no config', async () => {
      const { installGuardrailPreset } = await import('@/services/securityService');
      await installGuardrailPreset(
        { id: 'pii-br', name: 'PII Brasil', type: 'pii_detection', config: { cpf: true }, severity: 'high', tags: ['br'] },
        'ws-1',
      );

      const inserted = ext.calls.insert.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(inserted.is_enabled).toBe(true);
      expect(inserted.workspace_id).toBe('ws-1');
      expect(inserted.config).toMatchObject({ cpf: true, preset_id: 'pii-br', severity: 'high', tags: ['br'] });
    });

    it('listGuardrailPolicies lança em erro (config de segurança não pode falhar em silêncio)', async () => {
      ext.setTableResult('guardrail_policies', { data: null, error: { message: 'rls' } });
      const { listGuardrailPolicies } = await import('@/services/securityService');
      await expect(listGuardrailPolicies()).rejects.toMatchObject({ message: 'rls' });
    });
  });

  describe('guardrails engine', () => {
    it('roteia a checagem pela edge function com spanKind de guardrail', async () => {
      const { testGuardrails } = await import('@/services/securityService');
      await testGuardrails('meu cpf é 000.000.000-00');

      expect(mockInvokeTraced).toHaveBeenCalledWith(
        'guardrails-engine',
        expect.objectContaining({ checks: ['pii', 'injection', 'toxicity', 'content'] }),
        expect.objectContaining({ spanKind: 'guardrail' }),
      );
    });
  });

  describe('sessões', () => {
    it('retorna vazio sem sessão ativa', async () => {
      local.setUser(null);
      const { getActiveSessions } = await import('@/services/securityService');
      expect(await getActiveSessions()).toEqual([]);
    });

    it('marca a sessão corrente e expõe apenas um prefixo do token', async () => {
      const { getActiveSessions } = await import('@/services/securityService');
      const sessions = await getActiveSessions();

      expect(sessions).toHaveLength(1);
      expect(sessions[0].current).toBe(true);
      // nunca o token inteiro
      expect(sessions[0].id).toBe('test-tok');
    });
  });
});
