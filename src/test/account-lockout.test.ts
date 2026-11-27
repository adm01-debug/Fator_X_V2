import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: mocks.rpc },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));

import { listAccountLockouts, releaseAccountLockout } from '@/services/accountLockoutService';

beforeEach(() => vi.clearAllMocks());

describe('accountLockoutService', () => {
  it('lista bloqueios pela RPC com guard de administrador', async () => {
    const rows = [{ id: 'l-1', email: 'a@b.invalid', failure_count: 5 }];
    mocks.rpc.mockResolvedValue({ data: rows, error: null });

    await expect(listAccountLockouts('ws-1')).resolves.toEqual(rows);
    expect(mocks.rpc).toHaveBeenCalledWith('admin_list_account_lockouts', { p_workspace: 'ws-1' });
  });

  it('propaga erro em vez de devolver lista vazia', async () => {
    const error = { message: 'Acesso negado' };
    mocks.rpc.mockResolvedValue({ data: null, error });

    await expect(listAccountLockouts('ws-1')).rejects.toBe(error);
  });

  it('libera o bloqueio pelo id', async () => {
    mocks.rpc.mockResolvedValue({ data: { released: true }, error: null });

    await expect(releaseAccountLockout('l-1')).resolves.toBeUndefined();
    expect(mocks.rpc).toHaveBeenCalledWith('admin_release_account_lockout', { p_lockout: 'l-1' });
  });

  it('falha de liberacao nao e silenciada', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });

    await expect(releaseAccountLockout('l-1')).rejects.toEqual({ message: 'boom' });
  });
});
