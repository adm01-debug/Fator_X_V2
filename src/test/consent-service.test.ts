import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: mocks.rpc },
}));

import { listMyConsents, setMyConsent, REQUIRED_CONSENTS } from '@/services/consentService';

beforeEach(() => vi.clearAllMocks());

describe('consentService', () => {
  it('lista consentimentos escopados no workspace', async () => {
    const rows = [{ id: 'c-1', consent_type: 'marketing', granted: true, version: 2 }];
    mocks.rpc.mockResolvedValue({ data: rows, error: null });

    await expect(listMyConsents('ws-1')).resolves.toEqual(rows);
    expect(mocks.rpc).toHaveBeenCalledWith('list_my_consents', { p_workspace: 'ws-1' });
  });

  it('erro de leitura nao vira lista vazia', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'rls denied' } });

    await expect(listMyConsents(null)).rejects.toEqual({ message: 'rls denied' });
  });

  it('concede e revoga pelo mesmo RPC com o booleano explicito', async () => {
    mocks.rpc.mockResolvedValue({ data: { id: 'c-1', granted: false }, error: null });

    await setMyConsent({ consentType: 'analytics', granted: false, workspaceId: 'ws-1' });

    expect(mocks.rpc).toHaveBeenCalledWith('set_my_consent', {
      p_consent_type: 'analytics',
      p_granted: false,
      p_workspace: 'ws-1',
    });
  });

  it('falha de escrita e propagada para a tela avisar', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: '42501' } });

    await expect(
      setMyConsent({ consentType: 'privacy_policy', granted: true, workspaceId: null }),
    ).rejects.toEqual({ message: '42501' });
  });

  it('termos e privacidade sao os consentimentos essenciais', () => {
    expect(REQUIRED_CONSENTS).toEqual(['terms_of_service', 'privacy_policy']);
  });
});
