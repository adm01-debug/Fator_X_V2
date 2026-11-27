import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { syncExternalAuth } from '@/integrations/supabase/externalClient';
import { logger } from '@/lib/logger';
import type { User, Session } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  updatePassword: (password: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      // Sync access token to external DB client so RLS works
      syncExternalAuth();
    });

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        setUser(session?.user ?? null);
        // Sync access token to external DB client on initial load
        syncExternalAuth();
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string) => {
    // Check lockout first via our new service
    const { isUserLockedOut } = await import('@/lib/supabaseExtended');
    const locked = await isUserLockedOut(email);
    if (locked) {
      return {
        error: new Error(
          'Muitas tentativas falhas. Sua conta está temporariamente bloqueada por 15 minutos.',
        ),
      };
    }

    const { error, data } = await supabase.auth.signInWithPassword({ email, password });

    // Log attempt (successful or failed) — best-effort; never block sign-in
    await Promise.resolve(
      supabase.from('auth_attempts').insert({
        email,
        success: !error,
        ip_address: null,
      }),
    ).catch(() => undefined);

    if (error) return { error: error as Error | null };

    // Check if MFA is required for this user (Admin role)
    if (data.user) {
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role_key')
        .eq('user_id', data.user.id)
        .maybeSingle();

      // Espelha `is_mfa_valid_for_role()`: o segundo fator do produto é o TOTP
      // em `user_2fa`, não o AAL2 do Supabase Auth.
      if (roleData?.role_key === 'workspace_admin') {
        const { data: mfaData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        const { data: status } = await supabase.rpc('get_my_2fa_status');
        const has2fa = Boolean(status?.[0]?.enabled);
        if (!has2fa && mfaData?.currentLevel !== 'aal2') {
          logger.warn('Admin sem segundo fator ativo', { userId: data.user.id });
        }
      }
    }

    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { error: error as Error | null };
  };

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error as Error | null };
  };

  return (
    <AuthContext.Provider
      value={{ user, session, loading, signUp, signIn, signOut, resetPassword, updatePassword }}
    >
      {children}
    </AuthContext.Provider>
  );
}

const FALLBACK_AUTH: AuthContextType = {
  user: null,
  session: null,
  loading: true,
  signUp: async () => ({ error: new Error('AuthProvider not mounted') }),
  signIn: async () => ({ error: new Error('AuthProvider not mounted') }),
  signOut: async () => {},
  resetPassword: async () => ({ error: new Error('AuthProvider not mounted') }),
  updatePassword: async () => ({ error: new Error('AuthProvider not mounted') }),
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  // Return a safe fallback instead of throwing — prevents blank screens
  // during HMR re-evaluation or when a consumer renders briefly before
  // AuthProvider mounts. Real auth-gated routes use AuthGuard.
  return ctx ?? FALLBACK_AUTH;
}
