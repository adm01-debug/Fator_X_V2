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

// ---------- Telemetria ----------
export interface SignedUrlCacheStats {
  hits: number;
  misses: number;
  inflightCoalesced: number;
  errors: number;
  fetches: number;
  totalFetchMs: number;
  lastFetchMs: number | null;
  avgFetchMs: number;
  size: number;
  hitRate: number;
}

const stats = {
  hits: 0,
  misses: 0,
  inflightCoalesced: 0,
  errors: 0,
  fetches: 0,
  totalFetchMs: 0,
  lastFetchMs: null as number | null,
};

type StatsListener = (s: SignedUrlCacheStats) => void;
const listeners = new Set<StatsListener>();

export function getSignedUrlCacheStats(): SignedUrlCacheStats {
  const total = stats.hits + stats.misses;
  return {
    ...stats,
    avgFetchMs: stats.fetches ? stats.totalFetchMs / stats.fetches : 0,
    size: cache.size,
    hitRate: total ? stats.hits / total : 0,
  };
}

export function subscribeSignedUrlCacheStats(cb: StatsListener): () => void {
  listeners.add(cb);
  cb(getSignedUrlCacheStats());
  return () => { listeners.delete(cb); };
}

export function resetSignedUrlCacheStats(): void {
  stats.hits = 0;
  stats.misses = 0;
  stats.inflightCoalesced = 0;
  stats.errors = 0;
  stats.fetches = 0;
  stats.totalFetchMs = 0;
  stats.lastFetchMs = null;
  notify();
}

function notify(): void {
  const snap = getSignedUrlCacheStats();
  for (const l of listeners) l(snap);
}

const DEBUG =
  typeof window !== 'undefined' &&
  (import.meta.env?.DEV ||
    /(?:^|[?&])debugSignedUrls=1(?:&|$)/.test(window.location.search) ||
    window.localStorage?.getItem('debug:signedUrls') === '1');

function debugLog(event: string, payload: Record<string, unknown>): void {
  if (!DEBUG) return;
  // eslint-disable-next-line no-console
  console.debug(
    `%c[signedUrlCache]%c ${event}`,
    'color:#8b5cf6;font-weight:600',
    'color:inherit',
    { ...payload, stats: getSignedUrlCacheStats() },
  );
}

function makeKey(bucket: string, path: string): string {
  return `${bucket}::${path}`;
}

function pruneIfNeeded(): void {
  if (cache.size <= MAX_ENTRIES) return;
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
    stats.hits += 1;
    debugLog('hit', { key, ttlLeftMs: hit.expiresAt - now });
    notify();
    return hit.url;
  }
  if (hit) cache.delete(key);

  const pending = inflight.get(key);
  if (pending) {
    stats.inflightCoalesced += 1;
    debugLog('inflight-coalesced', { key });
    notify();
    return pending;
  }

  stats.misses += 1;
  const startedAt = performance.now();

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
      stats.errors += 1;
      logger.error('signed_url_cache.fetch_failed', { bucket, path, error: e });
      return null;
    } finally {
      const elapsed = performance.now() - startedAt;
      stats.fetches += 1;
      stats.totalFetchMs += elapsed;
      stats.lastFetchMs = elapsed;
      inflight.delete(key);
      debugLog('miss-fetched', { key, elapsedMs: Math.round(elapsed) });
      notify();
    }
  })();

  inflight.set(key, promise);
  return promise;
}


export function invalidateSignedUrl(bucket: string, path: string): void {
  cache.delete(makeKey(bucket, path));
}

/**
 * Invalida entradas do cache associadas a um documento específico.
 * Consulta `documents.metadata` para descobrir bucket/storage_path e remove a chave correspondente.
 * Usar após rechunk, troca de versão ativa ou reupload — evita servir links stale.
 */
export async function invalidateSignedUrlForDocument(documentId: string): Promise<void> {
  try {
    const { data, error } = await supabaseExternal
      .from('documents')
      .select('metadata')
      .eq('id', documentId)
      .maybeSingle();
    if (error || !data) return;
    const md = (data.metadata ?? {}) as { storage_path?: string; bucket?: string };
    if (!md.storage_path) return;
    invalidateSignedUrl(md.bucket ?? 'knowledge-uploads', md.storage_path);
  } catch (e) {
    logger.error('signed_url_cache.invalidate_by_doc_failed', { documentId, error: e });
  }
}

export function clearSignedUrlCache(): void {
  cache.clear();
  inflight.clear();
  notify();
}

// Expose helpers no console para debug rápido: window.__signedUrlCache.stats()
if (typeof window !== 'undefined') {
  (window as unknown as { __signedUrlCache?: unknown }).__signedUrlCache = {
    stats: getSignedUrlCacheStats,
    reset: resetSignedUrlCacheStats,
    clear: clearSignedUrlCache,
    subscribe: subscribeSignedUrlCacheStats,
  };
}

