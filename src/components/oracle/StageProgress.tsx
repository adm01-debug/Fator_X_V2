import { ORACLE_MODES, type OracleMode, useOracleStore } from '@/stores/oracleStore';
import { Loader2, CheckCircle2 } from 'lucide-react';

interface StageProgressProps {
  mode: OracleMode;
  currentStage: number;
}

export function StageProgress({ mode, currentStage }: StageProgressProps) {
  const store = useOracleStore();
  const stages = ORACLE_MODES[mode].stages;
  const stageLabel = store.stageLabel;

  return (
    <div className="p-6 bg-card border border-border/60 rounded-2xl shadow-sm animate-in fade-in slide-in-from-top-2">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 text-primary animate-spin" />
            <span className="text-sm font-bold text-foreground">{stageLabel || 'Processando...'}</span>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
            Etapa {currentStage} de {stages.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {stages.map((stage, i) => {
            const isCompleted = currentStage > i + 1;
            const isCurrent = currentStage === i + 1;
            
            return (
              <div key={stage} className="flex items-center gap-2 flex-1">
                <div
                  className={`h-10 w-10 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 transition-all duration-500 ${
                    isCompleted
                      ? 'bg-nexus-emerald/10 text-nexus-emerald border border-nexus-emerald/20'
                      : isCurrent
                        ? 'nexus-gradient-bg text-primary-foreground shadow-lg shadow-primary/20 scale-110'
                        : 'bg-secondary/50 text-muted-foreground border border-border/40'
                  }`}
                >
                  {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : i + 1}
                </div>
                
                {i < stages.length - 1 && (
                  <div className="flex-1 px-1">
                    <div className="relative h-1 w-full bg-secondary/50 rounded-full overflow-hidden">
                      <div 
                        className={`absolute inset-y-0 left-0 bg-primary transition-all duration-1000 ${isCompleted ? 'w-full' : isCurrent ? 'w-1/2 animate-pulse' : 'w-0'}`}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
