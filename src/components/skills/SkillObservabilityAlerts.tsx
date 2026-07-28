/**
 * Alertas do painel de observabilidade de skills.
 * Componente puro de apresentação — a derivação vive em `lib/skills/observability`.
 */
import { AlertTriangle, ShieldCheck, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ObservabilityAlert } from '@/lib/skills/observability';

export interface SkillObservabilityAlertsProps {
  alerts: readonly ObservabilityAlert[];
  className?: string;
}

export function SkillObservabilityAlerts({ alerts, className }: SkillObservabilityAlertsProps) {
  if (alerts.length === 0) {
    return (
      <div
        className={cn(
          'flex items-start gap-3 rounded-lg border border-border/60 bg-muted/30 p-4',
          className,
        )}
      >
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-nexus-emerald" aria-hidden />
        <div>
          <p className="text-sm font-medium text-foreground">Nenhum alerta ativo</p>
          <p className="text-xs text-muted-foreground">
            Ingestão, fila de curadoria e calibração de limiar dentro dos limites monitorados.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ul className={cn('space-y-2', className)} aria-label="Alertas de observabilidade">
      {alerts.map((alert) => {
        const critico = alert.level === 'critico';
        const Icon = critico ? AlertTriangle : Activity;
        return (
          <li
            key={alert.id}
            className={cn(
              'flex items-start gap-3 rounded-lg border p-3',
              critico
                ? 'border-nexus-rose/40 bg-nexus-rose/10'
                : 'border-nexus-amber/40 bg-nexus-amber/10',
            )}
          >
            <Icon
              className={cn(
                'mt-0.5 h-4 w-4 shrink-0',
                critico ? 'text-nexus-rose' : 'text-nexus-amber',
              )}
              aria-hidden
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{alert.title}</p>
              <p className="text-xs text-muted-foreground">{alert.detail}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
