import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { DbRow } from '@/types/dbRow';

/**
 * Supabase Extended Client
 * Includes additional helpers for schema-safe access and RLS persona testing.
 * Added: isUserLockedOut RPC call.
 */

/**
 * Permissive fluent-query shim para tabelas fora do schema tipado.
 * `data` é resolvido como `DbRow` (ponte documentada) para preservar
 * o acesso legado por propriedade em callbacks; os métodos fluentes
 * são todos tipados e retornam a mesma interface.
 */
export interface AnyQueryResult {
  data: DbRow;
  error: { message: string } | null;
  count?: number | null;
}

export interface AnyQueryBuilder extends PromiseLike<AnyQueryResult> {
  select: (...args: unknown[]) => AnyQueryBuilder;
  insert: (...args: unknown[]) => AnyQueryBuilder;
  update: (...args: unknown[]) => AnyQueryBuilder;
  upsert: (...args: unknown[]) => AnyQueryBuilder;
  delete: (...args: unknown[]) => AnyQueryBuilder;
  eq: (...args: unknown[]) => AnyQueryBuilder;
  neq: (...args: unknown[]) => AnyQueryBuilder;
  in: (...args: unknown[]) => AnyQueryBuilder;
  is: (...args: unknown[]) => AnyQueryBuilder;
  gt: (...args: unknown[]) => AnyQueryBuilder;
  gte: (...args: unknown[]) => AnyQueryBuilder;
  lt: (...args: unknown[]) => AnyQueryBuilder;
  lte: (...args: unknown[]) => AnyQueryBuilder;
  like: (...args: unknown[]) => AnyQueryBuilder;
  ilike: (...args: unknown[]) => AnyQueryBuilder;
  contains: (...args: unknown[]) => AnyQueryBuilder;
  containedBy: (...args: unknown[]) => AnyQueryBuilder;
  or: (...args: unknown[]) => AnyQueryBuilder;
  not: (...args: unknown[]) => AnyQueryBuilder;
  filter: (...args: unknown[]) => AnyQueryBuilder;
  match: (...args: unknown[]) => AnyQueryBuilder;
  order: (...args: unknown[]) => AnyQueryBuilder;
  limit: (...args: unknown[]) => AnyQueryBuilder;
  range: (...args: unknown[]) => AnyQueryBuilder;
  single: () => AnyQueryBuilder;
  maybeSingle: () => AnyQueryBuilder;
  [key: string]: unknown;
}

export const fromTable = (table: string): AnyQueryBuilder =>
  (supabase as unknown as { from: (t: string) => AnyQueryBuilder }).from(table);

/**
 * Checks if a user is locked out due to multiple failed login attempts.
 */
export const isUserLockedOut = async (email: string): Promise<boolean> => {
  const { data, error } = await supabase.rpc('is_user_locked_out', { target_email: email });
  if (error) {
    logger.error('Lockout check failed in supabaseExtended', error);
    return false;
  }
  return !!data;
};

/**
 * Syncs the local auth token to the external database client.
 */
export const syncExternalAuth = (token: string | null) => {
  if (token) {
    localStorage.setItem('supabase.external.auth.token', token);
  } else {
    localStorage.removeItem('supabase.external.auth.token');
  }
};

/**
 * Executes a Supabase RPC call.
 */
export const rpcCall = async (fnName: string, params: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }> => {
  return await (supabase as unknown as { rpc: (fn: string, p: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> }).rpc(fnName, params);
};

/**
 * Helper to wrap any Supabase call and fix the deep type issue
 */
export const wrap = <T>(fn: T): T => fn;

/**
 * Mock result type to satisfy high-level UI component mapping
 */
export type ResultOne = Record<string, unknown>;
