import { act, renderHook, waitFor } from '@testing-library/react';
import { Secret, TOTP } from 'otpauth';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  upsert: vi.fn(),
  del: vi.fn(),
  eq: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: mocks.rpc, from: mocks.from },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-fixture', email: 'fixture@example.invalid' } }),
}));

import { generateBackupCodes, use2FA } from '@/hooks/use2FA';

const SECRET = new Secret({ size: 20 }).base32;
const BACKUP_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

function currentCode(secret: string) {
  return new TOTP({ secret: Secret.fromBase32(secret) }).generate();
}

function wrongCodeFor(secret: string) {
  const valid = currentCode(secret);
  const flipped = (Number(valid[valid.length - 1]) + 5) % 10;
  return valid.slice(0, -1) + String(flipped);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockImplementation((fn: string) => {
    if (fn === 'enable_my_2fa') return Promise.resolve({ data: true, error: null });
    if (fn === 'disable_my_2fa') return Promise.resolve({ data: null, error: null });
    return Promise.resolve({
      data: [
        {
          enabled: true,
          last_verified_at: '2026-01-02T03:04:05.000Z',
          configured_at: '2025-12-01T00:00:00.000Z',
        },
      ],
      error: null,
    });
  });
});

describe('use2FA lê o status pela RPC get_my_2fa_status', () => {
  it('usa a RPC como fonte e não consulta a tabela direto', async () => {
    const { result } = renderHook(() => use2FA());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mocks.rpc).toHaveBeenCalledWith('get_my_2fa_status');
    expect(mocks.from).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({
      enabled: true,
      hasRecord: true,
      lastVerifiedAt: '2026-01-02T03:04:05.000Z',
      configuredAt: '2025-12-01T00:00:00.000Z',
    });
  });

  it('sem linha na RPC, o usuário aparece como desativado', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => use2FA());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current).toMatchObject({
      enabled: false,
      hasRecord: false,
      lastVerifiedAt: null,
      configuredAt: null,
    });
  });
});

describe('enable grava pela RPC enable_my_2fa', () => {
  it('o banco recusando o código não ativa o fator', async () => {
    mocks.rpc.mockImplementation((fn: string) =>
      fn === 'enable_my_2fa'
        ? Promise.resolve({ data: null, error: { message: 'código inválido' } })
        : Promise.resolve({ data: [{ enabled: false }], error: null }),
    );
    const { result } = renderHook(() => use2FA());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(
        result.current.enable(SECRET, wrongCodeFor(SECRET)),
      ).rejects.toThrow('código inválido');
    });

    // Colunas secret/backup_codes são REVOKE para authenticated: gravar direto
    // falharia sempre, então nunca se escreve na tabela pelo cliente.
    expect(mocks.from).not.toHaveBeenCalled();
    expect(result.current.enabled).toBe(false);
  });

  it('código válido grava o segredo e devolve 8 códigos de recuperação únicos', async () => {
    const { result } = renderHook(() => use2FA());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let codes: string[] = [];
    await act(async () => {
      codes = await result.current.enable(SECRET, currentCode(SECRET));
    });

    expect(mocks.rpc).toHaveBeenCalledWith('enable_my_2fa', {
      _secret: SECRET,
      _token: expect.stringMatching(/^[0-9]{6}$/),
      _backup_codes: codes,
    });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(result.current.enabled).toBe(true);
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    codes.forEach((code) => expect(code).toMatch(BACKUP_PATTERN));
  });
});

describe('disable remove o fator do usuário', () => {
  it('apaga a linha do próprio usuário e volta o estado a inativo', async () => {
    const { result } = renderHook(() => use2FA());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.disable();
    });

    expect(mocks.rpc).toHaveBeenCalledWith('disable_my_2fa');
    expect(result.current).toMatchObject({ enabled: false, hasRecord: false });
  });
});

describe('generateBackupCodes', () => {
  it('usa CSPRNG e alfabeto sem caracteres ambíguos', () => {
    const first = generateBackupCodes();
    expect(first).toHaveLength(8);
    first.forEach((code) => expect(code).toMatch(BACKUP_PATTERN));
    expect(generateBackupCodes()).not.toEqual(first);
  });
});
