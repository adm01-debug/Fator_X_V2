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
  retries: number;
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
  retries: 0,
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
    let lastError: unknown = null;
    let attempts = 0;
    try {
      // Retry com backoff exponencial + jitter: 250ms, 750ms (max 3 tentativas).
      const delays = [0, 250, 750];
      for (let i = 0; i < delays.length; i++) {
        attempts = i + 1;
        if (delays[i] > 0) {
          const jitter = Math.floor(Math.random() * 150);
          await new Promise((r) => setTimeout(r, delays[i] + jitter));
          stats.retries += 1;
          debugLog('retry', { key, attempt: attempts });
          notify();
        }
        try {
          const { data, error } = await supabaseExternal.storage
            .from(bucket)
            .createSignedUrl(path, STORAGE_TTL_SECONDS);
          if (error) throw error;
          const url = data?.signedUrl ?? null;
          if (url) {
            cache.set(key, { url, expiresAt: Date.now() + CACHE_TTL_MS });
            pruneIfNeeded();
            return url;
          }
          lastError = new Error('empty_signed_url');
        } catch (e) {
          lastError = e;
        }
      }
      stats.errors += 1;
      logger.error('signed_url_cache.fetch_failed', { bucket, path, attempts, error: lastError });
      return null;
    } finally {
      const elapsed = performance.now() - startedAt;
      stats.fetches += 1;
      stats.totalFetchMs += elapsed;
      stats.lastFetchMs = elapsed;
      inflight.delete(key);
      debugLog('miss-fetched', { key, elapsedMs: Math.round(elapsed), attempts });
      notify();
    }
  })();

  inflight.set(key, promise);
  return promise;
}

/**
 * Igual a getCachedSignedUrl, mas força bypass do cache (usar em "Tentar novamente").
 */
export async function refetchSignedUrl(bucket: string, path: string): Promise<string | null> {
  invalidateSignedUrl(bucket, path);
  return getCachedSignedUrl(bucket, path);
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
    docMetaCache.delete(documentId);
  } catch (e) {
    logger.error('signed_url_cache.invalidate_by_doc_failed', { documentId, error: e });
  }
}

// ---------- Prefetch por documento ----------
// Cache curto (5 min) do mapeamento documentId -> (bucket, storage_path)
// para evitar SELECTs repetidos ao passar o mouse sobre a mesma citação.
interface DocMetaEntry { bucket: string; storagePath: string; expiresAt: number; }
const DOC_META_TTL_MS = 300_000;
const docMetaCache = new Map<string, DocMetaEntry>();
const docMetaInflight = new Map<string, Promise<DocMetaEntry | null>>();
const prefetchInflight = new Map<string, Promise<void>>();

async function resolveDocMeta(documentId: string): Promise<DocMetaEntry | null> {
  const now = Date.now();
  const hit = docMetaCache.get(documentId);
  if (hit && hit.expiresAt > now) return hit;
  const pending = docMetaInflight.get(documentId);
  if (pending) return pending;
  const p = (async () => {
    try {
      const { data, error } = await supabaseExternal
        .from('documents')
        .select('metadata')
        .eq('id', documentId)
        .maybeSingle();
      if (error || !data) return null;
      const md = (data.metadata ?? {}) as { storage_path?: string; bucket?: string };
      if (!md.storage_path) return null;
      const entry: DocMetaEntry = {
        bucket: md.bucket ?? 'knowledge-uploads',
        storagePath: md.storage_path,
        expiresAt: Date.now() + DOC_META_TTL_MS,
      };
      docMetaCache.set(documentId, entry);
      return entry;
    } catch (e) {
      logger.error('signed_url_cache.doc_meta_failed', { documentId, error: e });
      return null;
    } finally {
      docMetaInflight.delete(documentId);
    }
  })();
  docMetaInflight.set(documentId, p);
  return p;
}

/**
 * Aquece o cache de signed URL para um documento (hover/focus em citação).
 * Idempotente e deduplicado — chamadas repetidas para o mesmo documentId
 * enquanto uma anterior está em voo compartilham a mesma Promise.
 * Retorna sem erros mesmo se o documento não puder ser resolvido.
 */
export function prefetchSignedUrlForDocument(documentId: string): Promise<void> {
  if (!documentId) return Promise.resolve();
  const existing = prefetchInflight.get(documentId);
  if (existing) return existing;
  const p = (async () => {
    try {
      const meta = await resolveDocMeta(documentId);
      if (!meta) return;
      const key = `${meta.bucket}::${meta.storagePath}`;
      const cached = cache.get(key);
      if (cached && cached.expiresAt > Date.now()) return; // já quente
      await getCachedSignedUrl(meta.bucket, meta.storagePath);
    } finally {
      prefetchInflight.delete(documentId);
    }
  })();
  prefetchInflight.set(documentId, p);
  return p;
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

