/**
 * ResearchProgress — Indicador de progresso iterativo em tempo real
 * para o Deep Research. Como a Edge Function não faz streaming, simulamos
 * o avanço com base na profundidade e tempo médio observado por iteração.
 */
import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, Search, Brain, FileText, Radar } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface ResearchProgressProps {
  depth: 'quick' | 'standard' | 'deep';
  maxIterations: number;
  startedAt: number;
}

const STAGE_LABELS = [
  { icon: Radar, label: 'Planejando queries de busca' },
  { icon: Search, label: 'Consultando fontes web' },
  { icon: Brain, label: 'Analisando achados e identificando gaps' },
];

// Tempo médio observado por iteração (ms) — ajustado por profundidade
const ITER_MS: Record<'quick' | 'standard' | 'deep', number> = {
  quick: 6000,
  standard: 9000,
  deep: 14000,
};

export function ResearchProgress({ depth, maxIterations, startedAt }: ResearchProgressProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 400);
    return () => clearInterval(id);
  }, []);

  const elapsed = now - startedAt;
  const iterMs = ITER_MS[depth];
  const currentIter = Math.min(maxIterations, Math.floor(elapsed / iterMs) + 1);
  const iterElapsed = elapsed % iterMs;
  const stageIdx = Math.min(STAGE_LABELS.length - 1, Math.floor((iterElapsed / iterMs) * STAGE_LABELS.length));
  const iterProgress = Math.min(100, (iterElapsed / iterMs) * 100);
  const totalProgress = Math.min(95, ((currentIter - 1) / maxIterations) * 100 + iterProgress / maxIterations);

  const StageIcon = STAGE_LABELS[stageIdx].icon;

  return (
    <Card className="p-6 bg-card border border-border/60 rounded-2xl shadow-sm animate-in fade-in slide-in-from-top-2">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 text-primary animate-spin" />
            <StageIcon className="h-4 w-4 text-primary" />
            <span className="text-body-sm font-bold text-foreground">
              {STAGE_LABELS[stageIdx].label}
            </span>
          </div>
          <span className="text-meta font-mono text-muted-foreground uppercase tracking-widest">
            Iteração {currentIter} de {maxIterations} · {Math.round(elapsed / 1000)}s
          </span>
        </div>

        {/* Barra global */}
        <div className="relative h-1.5 w-full bg-secondary/60 rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 nexus-gradient-bg transition-all duration-500"
            style={{ width: `${totalProgress}%` }}
          />
        </div>

        {/* Ticks por iteração */}
        <div className="flex items-center gap-2">
          {Array.from({ length: maxIterations }).map((_, i) => {
            const isCompleted = currentIter > i + 1;
            const isCurrent = currentIter === i + 1;
            return (
              <div key={i} className="flex items-center gap-2 flex-1">
                <div
                  className={`h-8 w-8 rounded-lg flex items-center justify-center text-meta font-bold shrink-0 transition-all duration-500 ${
                    isCompleted
                      ? 'bg-nexus-emerald/10 text-nexus-emerald border border-nexus-emerald/20'
                      : isCurrent
                        ? 'nexus-gradient-bg text-primary-foreground shadow-lg shadow-primary/20 scale-105'
                        : 'bg-secondary/50 text-muted-foreground border border-border/40'
                  }`}
                >
                  {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                </div>
                {i < maxIterations - 1 && (
                  <div className="flex-1 h-0.5 bg-secondary/50 rounded-full overflow-hidden">
                    <div
                      className={`h-full bg-primary transition-all duration-1000 ${
                        isCompleted ? 'w-full' : isCurrent ? 'w-1/2 animate-pulse' : 'w-0'
                      }`}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2 text-meta text-muted-foreground">
          <FileText className="h-3.5 w-3.5" />
          <span>
            Estágio {stageIdx + 1}/{STAGE_LABELS.length} desta iteração · Síntese final ao concluir todos os ciclos.
          </span>
        </div>
      </div>
    </Card>
  );
}
