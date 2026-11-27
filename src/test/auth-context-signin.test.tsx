import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  signInWithPassword: vi.fn(),
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
    rpc: mocks.rpc,
    from: (table: string) => table === 'auth_attempts'
      ? { insert: vi.fn() }
      : { select: () => ({ eq: () => ({ maybeSingle: mocks.role }) }) },
  },
}));
vi.mock('@/integrations/supabase/externalClient', () => ({ syncExternalAuth: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }));

import { AuthProvider, useAuth } from '@/contexts/AuthContext';

const EMAIL = 'fixture@example.invalid';

function gate(allowed: boolean, extra: Record<string, unknown> = {}) {
  return { data: { allowed, ...extra }, error: null };
}

function attempts() {
  return mocks.rpc.mock.calls.filter(([fn]) => fn === 'record_auth_attempt').map(([, args]) => args);
}

async function signInFixture() {
  const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
  await waitFor(() => expect(result.current.loading).toBe(false));
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue(gate(true));
  mocks.signInWithPassword.mockResolvedValue({ error: null, data: { user: { id: 'user-fixture' } } });
  mocks.role.mockResolvedValue({ data: { role_key: 'member' } });
});

describe('signIn grava a tentativa pela RPC (anon não tem INSERT em auth_attempts)', () => {
  it('consulta o guard e registra sucesso sem bloquear o login', async () => {
    const result = await signInFixture();
    await act(async () => {
      await expect(result.current.signIn(EMAIL, 'fixture-password')).resolves.toEqual({ error: null });
    });
    expect(mocks.rpc).toHaveBeenCalledWith('check_auth_security', expect.objectContaining({ p_email: EMAIL }));
    expect(attempts()).toContainEqual({
      p_email: EMAIL,
      p_success: true,
      p_ip_address: null,
      p_requires_captcha: false,
    });
    expect(mocks.role).toHaveBeenCalledOnce();
  });

  it('guarda indisponível não impede login válido', async () => {
    mocks.rpc.mockImplementation((fn: string) =>
      fn === 'check_auth_security'
        ? Promise.resolve({ data: null, error: { message: 'permission denied' } })
        : Promise.resolve({ data: 'id', error: null }),
    );
    const result = await signInFixture();
    await act(async () => {
      await expect(result.current.signIn(EMAIL, 'fixture-password')).resolves.toEqual({ error: null });
    });
    expect(mocks.role).toHaveBeenCalledOnce();
  });

  it('falha de autenticação é preservada e registrada como insucesso', async () => {
    const error = new Error('invalid credentials');
    mocks.signInWithPassword.mockResolvedValue({ error, data: { user: null } });
    const result = await signInFixture();
    await act(async () => {
      await expect(result.current.signIn(EMAIL, 'fixture-password')).resolves.toEqual({ error });
    });
    expect(attempts()).toContainEqual(expect.objectContaining({ p_email: EMAIL, p_success: false }));
    expect(mocks.role).not.toHaveBeenCalled();
  });

  it('conta bloqueada não autentica, mas registra a tentativa para renovar o lockout', async () => {
    mocks.rpc.mockImplementation((fn: string) =>
      fn === 'check_auth_security'
        ? Promise.resolve(gate(false, { reason: 'locked_out' }))
        : Promise.resolve({ data: 'id', error: null }),
    );
    const result = await signInFixture();
    await act(async () => {
      const response = await result.current.signIn(EMAIL, 'fixture-password');
      expect(response.error?.message).toMatch(/temporariamente bloqueada/);
    });
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
    // Sem este registro o contador de falhas estagnaria e o bloqueio expiraria
    // mesmo com o atacante insistindo.
    expect(attempts()).toContainEqual(expect.objectContaining({ p_email: EMAIL, p_success: false }));
  });

  it('lockout permanente informa bloqueio administrativo', async () => {
    mocks.rpc.mockImplementation((fn: string) =>
      fn === 'check_auth_security'
        ? Promise.resolve(gate(false, { reason: 'permanent_lockout' }))
        : Promise.resolve({ data: 'id', error: null }),
    );
    const result = await signInFixture();
    await act(async () => {
      const response = await result.current.signIn(EMAIL, 'fixture-password');
      expect(response.error?.message).toMatch(/Conta bloqueada/);
    });
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });
});
