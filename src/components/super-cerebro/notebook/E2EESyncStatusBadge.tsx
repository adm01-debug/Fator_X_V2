/**
 * E2EESyncStatusBadge — Indicador compacto de status do auto-sync E2EE.
 */
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, ShieldCheck, ShieldAlert, ShieldOff, AlertTriangle, Clock } from "lucide-react";
import type { AutoSyncStatus } from "@/services/e2eeAutoSync";

function fmt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function E2EESyncStatusBadge({ status }: { status: AutoSyncStatus | null }) {
  if (!status) {
    return (
      <Badge variant="outline" className="gap-1">
        <ShieldOff className="h-3 w-3" /> Auto-sync inativo
      </Badge>
    );
  }

  const { phase, lastRunAt, nextRunAt, attempt, lastError, lastPlanSummary } = status;

  const map: Record<AutoSyncStatus["phase"], { label: string; icon: React.ReactNode; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    disabled: { label: "Desabilitado", icon: <ShieldOff className="h-3 w-3" />, variant: "outline" },
    idle: { label: "Pronto", icon: <Clock className="h-3 w-3" />, variant: "outline" },
    running: { label: "Sincronizando…", icon: <Loader2 className="h-3 w-3 animate-spin" />, variant: "secondary" },
    success: { label: "Sincronizado", icon: <ShieldCheck className="h-3 w-3" />, variant: "default" },
    conflicts: { label: "Conflitos detectados", icon: <AlertTriangle className="h-3 w-3" />, variant: "secondary" },
    error: { label: `Erro (tentativa ${attempt})`, icon: <ShieldAlert className="h-3 w-3" />, variant: "destructive" },
  };
  const cfg = map[phase];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant={cfg.variant} className="gap-1 cursor-default">
          {cfg.icon}
          {cfg.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <div className="space-y-1 text-meta">
          <div>Última execução: <span className="font-mono">{fmt(lastRunAt)}</span></div>
          <div>Próxima: <span className="font-mono">{fmt(nextRunAt)}</span></div>
          {lastPlanSummary && (
            <div>
              Drift: +{lastPlanSummary.insert} / ~{lastPlanSummary.update} / ={lastPlanSummary.keep} / ⚠{lastPlanSummary.conflicts}
            </div>
          )}
          {lastError && <div className="text-destructive">Erro: {lastError}</div>}
          {phase === "error" && (
            <div className="text-muted-foreground">Retry exponencial ativo (base 5s, teto 5min).</div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
