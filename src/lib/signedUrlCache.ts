import { supabaseExternal } from '@/integrations/supabase/externalClient';
import { logger } from '@/lib/logger';

/**
 * In-memory cache de signed URLs para reduzir chamadas repetidas ao Storage
 * quando o usuário clica várias vezes na mesma citação/documento.
 *
 * Estratégia:
 * - TTL do link no Storage: 600s (10 min).
 * - TTL do cache no cliente: 540s (9 min) — mantém 60s de margem de segurança.
 * - Requisições concorrentes ao mesmo par (bucket, path) compartilham a mesma Promise
 *   (in-flight dedupe), evitando "thundering herd".
 * - Auto-limpeza opportunistic: entradas expiradas são descartadas no próximo get.
 */

const STORAGE_TTL_SECONDS = 600;
const CACHE_TTL_MS = 540_000;
const MAX_ENTRIES = 200;

interface CacheEntry {
  url: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<string | null>>();

function makeKey(bucket: string, path: string): string {
  return `${bucket}::${path}`;
}

function pruneIfNeeded(): void {
  if (cache.size <= MAX_ENTRIES) return;
  // remove os mais antigos até voltar ao limite
  const toRemove = cache.size - MAX_ENTRIES;
  let removed = 0;
  for (const key of cache.keys()) {
    cache.delete(key);
    removed += 1;
    if (removed >= toRemove) break;
  }
}

export async function getCachedSignedUrl(
  bucket: string,
  path: string,
): Promise<string | null> {
  const key = makeKey(bucket, path);
  const now = Date.now();

  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    return hit.url;
  }
  if (hit) cache.delete(key);

  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const { data, error } = await supabaseExternal.storage
        .from(bucket)
        .createSignedUrl(path, STORAGE_TTL_SECONDS);
      if (error) throw error;
      const url = data?.signedUrl ?? null;
      if (url) {
        cache.set(key, { url, expiresAt: Date.now() + CACHE_TTL_MS });
        pruneIfNeeded();
      }
      return url;
    } catch (e) {
      logger.error('signed_url_cache.fetch_failed', { bucket, path, error: e });
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

export function invalidateSignedUrl(bucket: string, path: string): void {
  cache.delete(makeKey(bucket, path));
}

export function clearSignedUrlCache(): void {
  cache.clear();
  inflight.clear();
}
