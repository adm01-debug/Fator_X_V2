import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  signInWithPassword: vi.fn(),
  isUserLockedOut: vi.fn(),
  role: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: mocks.unsubscribe } } }),
      getSession: () => Promise.resolve({ data: { session: null } }),
      signInWithPassword: mocks.signInWithPassword,
    },
    from: (table: string) => table === 'auth_attempts'
      ? { insert: mocks.insert }
      : { select: () => ({ eq: () => ({ maybeSingle: mocks.role }) }) },
  },
}));
vi.mock('@/integrations/supabase/externalClient', () => ({ syncExternalAuth: vi.fn() }));
vi.mock('@/lib/supabaseExtended', () => ({ isUserLockedOut: mocks.isUserLockedOut }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }));

import { AuthProvider, useAuth } from '@/contexts/AuthContext';

function auditThenable(reject = false) {
  return {
    then: (resolve: (value: { error: null }) => void, onReject: (reason: Error) => void) =>
      reject ? onReject(new Error('audit unavailable')) : resolve({ error: null }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isUserLockedOut.mockResolvedValue(false);
  mocks.signInWithPassword.mockResolvedValue({ error: null, data: { user: { id: 'user-fixture' } } });
  mocks.role.mockResolvedValue({ data: { role_key: 'member' } });
  mocks.insert.mockImplementation(() => auditThenable());
});

describe('signIn preserva o resultado de autenticação ao registrar auditoria', () => {
  it('aguarda builder thenable sem exigir método catch', async () => {
    const { result, unmount } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await expect(result.current.signIn('fixture@example.invalid', 'fixture-password')).resolves.toEqual({ error: null });
    });
    expect(mocks.insert).toHaveBeenCalledWith({ email: 'fixture@example.invalid', success: true, ip_address: null });
    expect(mocks.role).toHaveBeenCalledOnce();
    unmount();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });

  it('falha do registro não bloqueia login válido', async () => {
    mocks.insert.mockImplementation(() => auditThenable(true));
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await expect(result.current.signIn('fixture@example.invalid', 'fixture-password')).resolves.toEqual({ error: null });
    });
    expect(mocks.role).toHaveBeenCalledOnce();
  });

  it('falha de autenticação é preservada mesmo se o registro rejeitar', async () => {
    const error = new Error('invalid credentials');
    mocks.signInWithPassword.mockResolvedValue({ error, data: { user: null } });
    mocks.insert.mockImplementation(() => auditThenable(true));
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await expect(result.current.signIn('fixture@example.invalid', 'fixture-password')).resolves.toEqual({ error });
    });
    expect(mocks.insert).toHaveBeenCalledWith({ email: 'fixture@example.invalid', success: false, ip_address: null });
    expect(mocks.role).not.toHaveBeenCalled();
  });

  it('bloqueio da conta encerra antes de autenticar e de registrar tentativa', async () => {
    mocks.isUserLockedOut.mockResolvedValue(true);
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      const response = await result.current.signIn('fixture@example.invalid', 'fixture-password');
      expect(response.error?.message).toMatch(/temporariamente bloqueada/);
    });
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
