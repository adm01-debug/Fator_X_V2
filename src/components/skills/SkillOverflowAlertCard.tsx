/**
 * SkillOverflowAlertCard — expõe agentes cujas skills instaladas ultrapassam o
 * teto do prompt e são silenciosamente descartadas pelo runtime.
 *
 * Só lista o que exige ação (crítico/atenção): um card que mostra 200 agentes
 * saudáveis vira ruído e deixa de ser lido.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ShieldCheck, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { fetchAgentSkillLoads } from '@/services/agentSkillLoadService';
import {
  summarizeOverflowFleet,
  SEVERITY_LABEL,
  type OverflowSeverity,
} from '@/lib/skills/promptOverflowAlert';
import { MAX_PROMPT_SKILLS } from '@/lib/skills/promptSimulation';

const BADGE_VARIANT: Record<OverflowSeverity, 'destructive' | 'secondary' | 'outline'> = {
  critico: 'destructive',
  atencao: 'secondary',
  ok: 'outline',
};

export function SkillOverflowAlertCard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['agent_skill_loads'],
    queryFn: fetchAgentSkillLoads,
    staleTime: 120_000,
  });

  const resumo = useMemo(() => summarizeOverflowFleet(data ?? []), [data]);
  const acionaveis = resumo.alerts.filter((a) => a.severity !== 'ok');

  return (
    <Card className="border-border/60">
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 text-body">
          <AlertTriangle className="h-4 w-4 text-nexus-amber" aria-hidden />
          Teto de skills no prompt
        </CardTitle>
        <p className="text-meta text-muted-foreground">
          O runtime injeta no máximo {MAX_PROMPT_SKILLS} skills por agente. O excedente é
          descartado sem erro visível.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertDescription className="text-body-sm">
              Não foi possível carregar a carga de skills dos agentes.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Agentes" value={resumo.totalAgents} />
              <Metric label="Com descarte" value={resumo.critical} tone="danger" />
              <Metric label="Perto do teto" value={resumo.warning} tone="warn" />
              <Metric label="Skills perdidas" value={resumo.totalDropped} tone="danger" />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-meta text-muted-foreground">
                <span className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" aria-hidden /> Ocupação média do teto
                </span>
                <span>{resumo.averageUtilization}%</span>
              </div>
              <Progress value={Math.min(100, resumo.averageUtilization)} className="h-1.5" />
            </div>

            {acionaveis.length === 0 ? (
              <p className="flex items-center gap-2 text-body-sm text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-nexus-green" aria-hidden />
                Nenhum agente está perdendo skills por estouro do teto.
              </p>
            ) : (
              <ul className="space-y-2">
                {acionaveis.slice(0, 12).map((a) => (
                  <li
                    key={a.agentId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-body-sm font-medium">{a.agentName}</p>
                      <p className="text-meta text-muted-foreground">
                        {a.installed} instaladas ·{' '}
                        {a.dropped > 0
                          ? `${a.dropped} descartadas no runtime`
                          : `${a.headroom} de folga`}
                      </p>
                    </div>
                    <Badge variant={BADGE_VARIANT[a.severity]} className="shrink-0">
                      {SEVERITY_LABEL[a.severity]}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}

            {acionaveis.length > 12 && (
              <p className="text-meta text-muted-foreground">
                + {acionaveis.length - 12} agentes com o mesmo sintoma.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'warn' | 'danger';
}) {
  const cor =
    tone === 'danger' && value > 0
      ? 'text-destructive'
      : tone === 'warn' && value > 0
        ? 'text-nexus-amber'
        : 'text-foreground';
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
      <p className="text-meta text-muted-foreground">{label}</p>
      <p className={`text-h4 font-semibold ${cor}`}>{value}</p>
    </div>
  );
}
