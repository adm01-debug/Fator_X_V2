/**
 * Tiles e sparkline reutilizados pelo painel de observabilidade de skills.
 */
import { cn } from '@/lib/utils';

export interface ObservabilityMetricProps {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'positivo' | 'atencao' | 'critico';
  className?: string;
}

const TONE_CLASS: Record<NonNullable<ObservabilityMetricProps['tone']>, string> = {
  default: 'text-foreground',
  positivo: 'text-nexus-emerald',
  atencao: 'text-nexus-amber',
  critico: 'text-nexus-rose',
};

export function ObservabilityMetric({
  label,
  value,
  hint,
  tone = 'default',
  className,
}: ObservabilityMetricProps) {
  return (
    <div className={cn('rounded-lg border border-border/60 bg-card/40 p-3', className)}>
      <p className="text-meta uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-xl font-semibold tabular-nums', TONE_CLASS[tone])}>{value}</p>
      {hint ? <p className="mt-0.5 text-meta text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export interface ObservabilitySparklineProps {
  /** Série diária, do mais antigo para o mais recente. */
  data: ReadonlyArray<{ date: string; runs: number; accepted: number }>;
  className?: string;
}

/**
 * Sparkline em CSS puro — barras proporcionais ao máximo da série.
 * Evita puxar biblioteca de gráfico para um indicador de 14 pontos.
 */
export function ObservabilitySparkline({ data, className }: ObservabilitySparklineProps) {
  const max = data.reduce((m, d) => Math.max(m, d.runs), 0);

  return (
    <div className={cn('flex h-12 items-end gap-1', className)} aria-hidden>
      {data.map((d) => {
        // Barra mínima visível (8%) para distinguir "dia sem execução" de
        // ausência de dado — zero absoluto some e engana a leitura.
        const altura = max > 0 && d.runs > 0 ? Math.max(8, (d.runs / max) * 100) : 4;
        return (
          <div
            key={d.date}
            title={`${d.date}: ${d.runs} execução(ões), ${d.accepted} aceitas`}
            className={cn(
              'flex-1 rounded-sm transition-all',
              d.runs > 0 ? 'bg-nexus-cyan/70' : 'bg-muted',
            )}
            style={{ height: `${altura}%` }}
          />
        );
      })}
    </div>
  );
}
