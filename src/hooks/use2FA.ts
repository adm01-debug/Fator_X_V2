/**
 * use2FA — TOTP-based two-factor authentication hook.
 * Uses otpauth library for HMAC-SHA1 token generation per RFC 6238.
 * O status vem da RPC get_my_2fa_status: a linha de user_2fa não é lida direto pelo cliente.
 */
import { useCallback, useEffect, useState } from 'react';
import { TOTP, Secret } from 'otpauth';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const ISSUER = 'Fator X';
const BACKUP_CODE_COUNT = 8;
// Sem 0/O e 1/I/L: código de recuperação é digitado à mão.
const BACKUP_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

interface TwoFAState {
  enabled: boolean;
  loading: boolean;
  hasRecord: boolean;
  lastVerifiedAt: string | null;
  configuredAt: string | null;
}

const INACTIVE_STATE: TwoFAState = {
  enabled: false,
  loading: false,
  hasRecord: false,
  lastVerifiedAt: null,
  configuredAt: null,
};

/** Códigos de recuperação via CSPRNG — Math.random não serve para segredos. */
export function generateBackupCodes(count = BACKUP_CODE_COUNT): string[] {
  const bytes = new Uint8Array(count * 8);
  crypto.getRandomValues(bytes);
  return Array.from({ length: count }, (_, index) =>
    Array.from(bytes.subarray(index * 8, index * 8 + 8))
      .map((byte) => BACKUP_ALPHABET[byte % BACKUP_ALPHABET.length])
      .join(''),
  );
}

export function use2FA() {
  const { user } = useAuth();
  const [state, setState] = useState<TwoFAState>({ ...INACTIVE_STATE, loading: true });

  useEffect(() => {
    if (!user?.id) {
      setState({ ...INACTIVE_STATE });
      return;
    }
    let active = true;
    (async () => {
      const { data } = await supabase.rpc('get_my_2fa_status');
      if (!active) return;
      const status = data?.[0] ?? null;
      setState({
        enabled: Boolean(status?.enabled),
        loading: false,
        hasRecord: status !== null,
        lastVerifiedAt: status?.last_verified_at ?? null,
        configuredAt: status?.configured_at ?? null,
      });
    })();
    return () => {
      active = false;
    };
  }, [user?.id]);

  const generateSecret = useCallback(() => {
    const secret = new Secret({ size: 20 });
    const totp = new TOTP({ issuer: ISSUER, label: user?.email ?? 'user', secret });
    return { secret: secret.base32, uri: totp.toString() };
  }, [user?.email]);

  const verifyToken = useCallback(
    (secret: string, token: string): boolean => {
      try {
        const totp = new TOTP({
          issuer: ISSUER,
          label: user?.email ?? 'user',
          secret: Secret.fromBase32(secret),
        });
        const delta = totp.validate({ token: token.replace(/\s/g, ''), window: 1 });
        return delta !== null;
      } catch {
        return false;
      }
    },
    [user?.email],
  );

  // O hardening revogou INSERT/UPDATE de (secret, backup_codes) para
  // `authenticated`; a gravação só passa pela RPC, que revalida o TOTP no banco.
  const enable = useCallback(
    async (secret: string, token: string) => {
      if (!user?.id) throw new Error('Not authenticated');
      const backupCodes = generateBackupCodes();
      const { data, error } = await supabase.rpc('enable_my_2fa', {
        _secret: secret,
        _token: token.replace(/\s/g, ''),
        _backup_codes: backupCodes,
      });
      if (error) throw new Error(error.message);
      if (!data) throw new Error('Código inválido');
      const verifiedAt = new Date().toISOString();
      setState((previous) => ({
        ...previous,
        enabled: true,
        hasRecord: true,
        loading: false,
        lastVerifiedAt: verifiedAt,
        configuredAt: previous.configuredAt ?? verifiedAt,
      }));
      return backupCodes;
    },
    [user?.id],
  );

  const disable = useCallback(async () => {
    if (!user?.id) throw new Error('Not authenticated');
    const { error } = await supabase.rpc('disable_my_2fa');
    if (error) throw new Error(error.message);
    setState({ ...INACTIVE_STATE });
  }, [user?.id]);

  return { ...state, generateSecret, verifyToken, enable, disable };
}
