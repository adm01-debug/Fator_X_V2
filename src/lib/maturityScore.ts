/**
 * Maturity Score — calcula a maturidade de produção de um agente
 * com base em tokens, custo, latência p95 e taxa de erros.
 *
 *  - Prototype:       protótipo cru; sem tráfego consistente ou instável.
 *  - Tested:          uso recorrente, métricas dentro de faixas aceitáveis.
 *  - Production-ready: uso robusto, p95 e custo controlados, erros mínimos.
 */
import type { AgentDailyMetricWithName } from '@/services/agentDailyMetricsService';

export type MaturityLevel = 'prototype' | 'tested' | 'production-ready';

export interface MaturityBreakdown {
  executions: number;
  errorRate: number;       // 0..1
  p95Latency: number;      // ms
  costPerExec: number;     // USD
  daysActive: number;
  score: number;           // 0..100
  level: MaturityLevel;
  reasons: string[];
}

export function computeMaturity(rows: AgentDailyMetricWithName[]): MaturityBreakdown {
  const executions = rows.reduce((s, r) => s + r.executions, 0);
  const errors = rows.reduce((s, r) => s + r.errors, 0);
  const totalCost = rows.reduce((s, r) => s + r.total_cost_usd, 0);
  const p95Latency = rows.length
    ? Math.max(...rows.map((r) => r.p95_latency_ms || 0))
    : 0;
  const errorRate = executions > 0 ? errors / executions : 0;
  const costPerExec = executions > 0 ? totalCost / executions : 0;
  const daysActive = new Set(rows.filter((r) => r.executions > 0).map((r) => r.day.slice(0, 10))).size;

  const reasons: string[] = [];
  let score = 0;

  // Volume (30 pts)
  if (executions >= 500) { score += 30; }
  else if (executions >= 100) { score += 20; reasons.push('Volume moderado (<500 execuções)'); }
  else if (executions >= 10) { score += 10; reasons.push('Volume baixo (<100 execuções)'); }
  else { reasons.push('Volume insuficiente (<10 execuções)'); }

  // Confiabilidade (30 pts)
  if (errorRate <= 0.01) { score += 30; }
  else if (errorRate <= 0.05) { score += 20; reasons.push(`Taxa de erros ${(errorRate * 100).toFixed(1)}% (>1%)`); }
  else if (errorRate <= 0.15) { score += 10; reasons.push(`Taxa de erros elevada ${(errorRate * 100).toFixed(1)}%`); }
  else { reasons.push(`Taxa de erros crítica ${(errorRate * 100).toFixed(1)}%`); }

  // Latência p95 (20 pts)
  if (p95Latency > 0 && p95Latency <= 800) { score += 20; }
  else if (p95Latency <= 2000) { score += 12; reasons.push(`p95 acima do ideal (${Math.round(p95Latency)}ms)`); }
  else if (p95Latency <= 5000) { score += 6; reasons.push(`p95 alto (${Math.round(p95Latency)}ms)`); }
  else if (p95Latency > 5000) { reasons.push(`p95 crítico (${Math.round(p95Latency)}ms)`); }

  // Consistência (10 pts)
  if (daysActive >= 14) { score += 10; }
  else if (daysActive >= 7) { score += 6; reasons.push('Uso irregular (<14 dias ativos)'); }
  else { reasons.push('Uso esporádico'); }

  // Custo (10 pts)
  if (costPerExec > 0 && costPerExec <= 0.02) { score += 10; }
  else if (costPerExec <= 0.05) { score += 6; reasons.push(`Custo/execução moderado ($${costPerExec.toFixed(3)})`); }
  else if (costPerExec > 0.05) { reasons.push(`Custo/execução elevado ($${costPerExec.toFixed(3)})`); }

  let level: MaturityLevel = 'prototype';
  if (score >= 80) level = 'production-ready';
  else if (score >= 55) level = 'tested';

  return { executions, errorRate, p95Latency, costPerExec, daysActive, score, level, reasons };
}

export function maturityLabel(level: MaturityLevel): string {
  switch (level) {
    case 'production-ready': return 'Production-ready';
    case 'tested': return 'Tested';
    default: return 'Prototype';
  }
}

export function maturityTone(level: MaturityLevel): 'success' | 'warning' | 'muted' {
  switch (level) {
    case 'production-ready': return 'success';
    case 'tested': return 'warning';
    default: return 'muted';
  }
}
