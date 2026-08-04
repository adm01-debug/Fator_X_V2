import { useEffect, useState } from 'react';
import {
  getSignedUrlCacheStats,
  resetSignedUrlCacheStats,
  clearSignedUrlCache,
  subscribeSignedUrlCacheStats,
  type SignedUrlCacheStats,
} from '@/lib/signedUrlCache';

/**
 * Painel flutuante de debug para o cache de signed URLs.
 * Mostra hits/misses, hit-rate, tempo médio/último de busca e tamanho do cache.
 *
 * Ativação (não aparece em produção sem opt-in):
 * - DEV: sempre visível
 * - PROD: adicione `?debugSignedUrls=1` na URL ou
 *   `localStorage.setItem('debug:signedUrls','1')` e recarregue.
 */
export function SignedUrlCacheDebugPanel() {
  const [stats, setStats] = useState<SignedUrlCacheStats>(() => getSignedUrlCacheStats());
  const [minimized, setMinimized] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const on =
      (import.meta.env?.DEV && !navigator.webdriver) ||
      /(?:^|[?&])debugSignedUrls=1(?:&|$)/.test(window.location.search) ||
      window.localStorage?.getItem('debug:signedUrls') === '1';
    setEnabled(!!on);
    if (!on) return;
    const unsub = subscribeSignedUrlCacheStats(setStats);
    return unsub;
  }, []);

  if (!enabled) return null;

  const hitRatePct = (stats.hitRate * 100).toFixed(1);
  const avg = stats.avgFetchMs.toFixed(1);
  const last = stats.lastFetchMs != null ? stats.lastFetchMs.toFixed(1) : '—';

  return (
    <div
      className="fixed bottom-3 right-3 z-[9999] rounded-md border border-border/60 bg-background/95 shadow-nexus-lg backdrop-blur text-meta font-mono"
      style={{ minWidth: minimized ? 'auto' : 240 }}
    >
      <div className="flex items-center justify-between gap-2 px-2 py-1 border-b border-border/40">
        <span className="text-muted-foreground">signed-url cache</span>
        <div className="flex gap-1">
          <button
            className="px-1 text-muted-foreground hover:text-foreground"
            onClick={() => setMinimized((m) => !m)}
            title={minimized ? 'Expandir' : 'Minimizar'}
          >
            {minimized ? '▢' : '—'}
          </button>
          {!minimized && (
            <>
              <button
                className="px-1 text-muted-foreground hover:text-foreground"
                onClick={resetSignedUrlCacheStats}
                title="Zerar contadores"
              >
                ↺
              </button>
              <button
                className="px-1 text-muted-foreground hover:text-destructive"
                onClick={clearSignedUrlCache}
                title="Limpar cache"
              >
                ✕
              </button>
            </>
          )}
        </div>
      </div>
      {!minimized && (
        <div className="px-2 py-1.5 space-y-0.5">
          <Row label="hits" value={stats.hits} accent="text-nexus-emerald" />
          <Row label="misses" value={stats.misses} accent="text-nexus-amber" />
          <Row label="in-flight coalesced" value={stats.inflightCoalesced} />
          <Row
            label="retries"
            value={stats.retries}
            accent={stats.retries ? 'text-nexus-amber' : ''}
          />
          <Row
            label="errors"
            value={stats.errors}
            accent={stats.errors ? 'text-destructive' : ''}
          />
          <Row label="hit rate" value={`${hitRatePct}%`} />
          <Row label="fetches" value={stats.fetches} />
          <Row label="avg fetch" value={`${avg} ms`} />
          <Row label="last fetch" value={`${last} ms`} />
          <Row label="size" value={stats.size} />
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  accent = '',
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={accent}>{value}</span>
    </div>
  );
}

export default SignedUrlCacheDebugPanel;
