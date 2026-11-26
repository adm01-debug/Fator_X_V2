/**
 * lgpdGovernanceService — o Registro de Operações, as solicitações do titular e
 * as políticas de retenção existiam no banco desde 20260724000010 sem nenhuma
 * tela. Estes testes travam o que a tela depende: prazo legal de 15 dias
 * calculado no cliente, vínculo da solicitação com o usuário autenticado,
 * carimbo de resposta nos estados terminais e o upsert idempotente das
 * políticas (UNIQUE workspace_id + data_type).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getSharedSupabaseMock } from './utils/supabaseMock';

vi.mock('@/integrations/supabase/externalClient', async () => {
  const m = await import('./utils/supabaseMock');
  return { supabaseExternal: m.getSharedSupabaseMock('lgpd-gov-external').client };
});

vi.mock('@/lib/supabaseExtended', async () => {
  const m = await import('./utils/supabaseMock');
  return {
    fromTable: (table: string) =>
      (
        m.getSharedSupabaseMock('lgpd-gov-external').client as {
          from: (t: string) => unknown;
        }
      ).from(table),
  };
});

vi.mock('@/integrations/supabase/client', async () => {
  const m = await import('./utils/supabaseMock');
  return { supabase: m.getSharedSupabaseMock('lgpd-gov-local').client };
});

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const ext = getSharedSupabaseMock('lgpd-gov-external');
const local = getSharedSupabaseMock('lgpd-gov-local');

describe('lgpdGovernanceService', () => {
  beforeEach(() => {
    ext.reset();
    local.reset();
    ext.setResult({ data: [], error: null });
    local.setResult({ data: [], error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calcula o prazo do Art. 18 §1 em 15 dias', async () => {
    const { subjectRequestDeadline, DSAR_DEADLINE_DAYS } = await import('@/services/lgpdGovernanceService');
    const from = new Date('2026-03-01T00:00:00.000Z');
    expect(DSAR_DEADLINE_DAYS).toBe(15);
    expect(subjectRequestDeadline(from).toISOString().slice(0, 10)).toBe('2026-03-16');
  });

  it('abre a solicitação para o usuário autenticado, com prazo e sem dados do cliente forjados', async () => {
    ext.setResult({
      data: {
        id: 'dsr-1',
        user_id: 'test-user-id',
        workspace_id: 'ws-1',
        request_type: 'deletion',
        status: 'received',
        description: 'apagar meus dados',
        deadline_at: '2026-03-16T00:00:00.000Z',
        responded_at: null,
        denied_reason: null,
        created_at: '2026-03-01T00:00:00.000Z',
      },
      error: null,
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T00:00:00.000Z'));

    const { createSubjectRequest } = await import('@/services/lgpdGovernanceService');
    const created = await createSubjectRequest({
      workspaceId: 'ws-1',
      requestType: 'deletion',
      description: '  apagar meus dados  ',
    });

    const inserted = ext.calls.insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted.user_id).toBe('test-user-id');
    expect(inserted.workspace_id).toBe('ws-1');
    expect(inserted.request_type).toBe('deletion');
    expect(inserted.description).toBe('apagar meus dados');
    expect(String(inserted.deadline_at)).toBe('2026-03-16T00:00:00.000Z');
    expect(created.id).toBe('dsr-1');
  });

  it('recusa abrir solicitação sem sessão', async () => {
    local.setUser(null);
    const { createSubjectRequest } = await import('@/services/lgpdGovernanceService');
    await expect(createSubjectRequest({ workspaceId: 'ws-1', requestType: 'access' })).rejects.toThrow(
      'Faça login',
    );
    expect(ext.calls.insert).not.toHaveBeenCalled();
  });

  it('carimba responded_at apenas em estado terminal', async () => {
    const { respondSubjectRequest } = await import('@/services/lgpdGovernanceService');

    await respondSubjectRequest('dsr-1', 'processing');
    const inProgress = ext.calls.update.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inProgress.status).toBe('processing');
    expect(inProgress.responded_at).toBeUndefined();

    await respondSubjectRequest('dsr-1', 'completed');
    const done = ext.calls.update.mock.calls[1]?.[0] as Record<string, unknown>;
    expect(done.status).toBe('completed');
    expect(typeof done.responded_at).toBe('string');

    await respondSubjectRequest('dsr-1', 'denied', 'dado inexistente');
    const denied = ext.calls.update.mock.calls[2]?.[0] as Record<string, unknown>;
    expect(denied.denied_reason).toBe('dado inexistente');
  });

  it('salva política de retenção com upsert idempotente por workspace e tipo', async () => {
    const { saveRetentionPolicy } = await import('@/services/lgpdGovernanceService');

    await saveRetentionPolicy({ workspaceId: 'ws-1', dataType: ' agent_logs ', retentionDays: 90, autoAnonymize: true });

    const payload = ext.calls.upsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.data_type).toBe('agent_logs');
    expect(payload.retention_days).toBe(90);
    expect(payload.auto_anonymize).toBe(true);
    expect(payload.is_active).toBe(true);
    const options = ext.calls.upsert.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(options.onConflict).toBe('workspace_id,data_type');
  });

  it('filtra as leituras pelo workspace e ordena pelo prazo', async () => {
    const { listSubjectRequests } = await import('@/services/lgpdGovernanceService');
    await listSubjectRequests('ws-1');

    expect(ext.calls.select.mock.calls[0]?.[0]).toContain('deadline_at');
    expect(ext.calls.eq).toHaveBeenCalledWith('workspace_id', 'ws-1');
    expect(ext.calls.order).toHaveBeenCalledWith('deadline_at', { ascending: true });
  });

  it('propaga o erro de leitura em vez de devolver lista vazia', async () => {
    ext.setTableResult('data_subject_requests', { data: null, error: { message: 'rls denied' } });
    const { listSubjectRequests } = await import('@/services/lgpdGovernanceService');
    await expect(listSubjectRequests('ws-1')).rejects.toMatchObject({ message: 'rls denied' });
  });
});