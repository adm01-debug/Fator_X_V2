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
  mocks.eq.mockResolvedValue({ error: null });
  mocks.del.mockReturnValue({ eq: mocks.eq });
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.from.mockReturnValue({ upsert: mocks.upsert, delete: mocks.del });
  mocks.rpc.mockResolvedValue({
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

describe('enable valida o TOTP antes de gravar', () => {
  it('código inválido é recusado e nada é gravado', async () => {
    const { result } = renderHook(() => use2FA());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.enable(SECRET, wrongCodeFor(SECRET))).rejects.toThrow(
        'Código inválido',
      );
    });

    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('código válido grava o segredo e devolve 8 códigos de recuperação únicos', async () => {
    const { result } = renderHook(() => use2FA());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let codes: string[] = [];
    await act(async () => {
      codes = await result.current.enable(SECRET, currentCode(SECRET));
    });

    expect(mocks.from).toHaveBeenCalledWith('user_2fa');
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-fixture',
        secret: SECRET,
        enabled: true,
        backup_codes: codes,
      }),
      { onConflict: 'user_id' },
    );
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

    expect(mocks.from).toHaveBeenCalledWith('user_2fa');
    expect(mocks.eq).toHaveBeenCalledWith('user_id', 'user-fixture');
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
