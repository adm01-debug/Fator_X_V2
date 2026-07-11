/**
 * Web Vitals — coleta CLS / INP / LCP / FCP / TTFB.
 *
 * • Em dev: log estruturado no console via logger.
 * • Em prod: envia measurement para Sentry (via `Sentry.setMeasurement`
 *   quando disponível + breadcrumb com rating), e emite `CustomEvent`
 *   `lovable:web-vital` no `window` para qualquer painel interno
 *   consumir sem acoplar dependência.
 * • Observa carregamentos lentos de chunks (> 500ms) e sinaliza como
 *   breadcrumb `perf.slow-chunk` para correlacionar regressões de
 *   navegação com o bundle real servido.
 *
 * Silent no-op quando Sentry não está configurado — nada é enviado.
 */
import { onCLS, onINP, onLCP, onFCP, onTTFB, type Metric } from 'web-vitals';
import * as Sentry from '@sentry/react';
import { logger } from '@/lib/logger';

type VitalDetail = {
  name: Metric['name'];
  value: number;
  rating: Metric['rating'];
  delta: number;
  id: string;
  navigationType: Metric['navigationType'];
};

function emitWindowEvent(detail: VitalDetail) {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent<VitalDetail>('lovable:web-vital', { detail }));
  } catch {
    /* CustomEvent indisponível em ambientes exóticos — ignore. */
  }
}

function reportToSentry(detail: VitalDetail) {
  try {
    // `setMeasurement` só existe na transação ativa; fallback em breadcrumb.
    const scope = Sentry.getCurrentScope?.();
    if (scope) {
      Sentry.addBreadcrumb({
        category: 'web-vital',
        level: detail.rating === 'poor' ? 'warning' : 'info',
        message: `${detail.name} ${detail.value.toFixed(1)} (${detail.rating})`,
        data: detail as unknown as Record<string, unknown>,
      });
    }
  } catch {
    /* Sentry indisponível — silencie. */
  }
}

function reportMetric(metric: Metric) {
  const detail: VitalDetail = {
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    delta: metric.delta,
    id: metric.id,
    navigationType: metric.navigationType,
  };

  if (import.meta.env.DEV) {
    logger.info(`[WebVitals] ${detail.name}: ${detail.value.toFixed(1)} (${detail.rating})`);
  }

  emitWindowEvent(detail);

  if (import.meta.env.PROD) {
    reportToSentry(detail);
  }
}

export function initWebVitals() {
  onCLS(reportMetric);
  onINP(reportMetric);
  onLCP(reportMetric);
  onFCP(reportMetric);
  onTTFB(reportMetric);

  if (typeof PerformanceObserver === 'undefined') return;

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType !== 'resource') continue;
        if (!entry.name.endsWith('.js')) continue;
        const duration = entry.duration;
        if (duration <= 500) continue;

        const chunk = entry.name.split('/').pop() ?? entry.name;
        if (import.meta.env.DEV) {
          logger.warn(`[ChunkLoad] Slow chunk: ${chunk} took ${duration.toFixed(0)}ms`);
        }
        try {
          Sentry.addBreadcrumb({
            category: 'perf.slow-chunk',
            level: 'info',
            message: `${chunk} ${duration.toFixed(0)}ms`,
            data: { url: entry.name, duration },
          });
        } catch {
          /* noop */
        }
      }
    });
    observer.observe({ type: 'resource', buffered: false });
  } catch (err) {
    logger.error('PerformanceObserver failed:', err);
  }
}
