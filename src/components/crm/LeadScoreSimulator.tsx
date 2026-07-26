/**
 * LeadScoreSimulator — recálculo ao vivo do score contra o perfil de ICP.
 *
 * Existe porque um número sozinho não gera confiança do time comercial: o
 * usuário precisa ver a decomposição por critério antes de aceitar o corte.
 */
import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { scoreLead, TIER_LABELS, type IcpProfile, type LeadSignals, type LeadTier } from '@/services/crmScoringService';

const TIER_STYLES: Record<LeadTier, string> = {
  hot: 'bg-nexus-success/15 text-nexus-success border-nexus-success/30',
  qualified: 'bg-primary/15 text-primary border-primary/30',
  nurture: 'bg-nexus-warning/15 text-nexus-warning border-nexus-warning/30',
  cold: 'bg-muted text-muted-foreground border-border',
};

export interface LeadScoreSimulatorProps {
  profile: IcpProfile;
}

export function LeadScoreSimulator({ profile }: LeadScoreSimulatorProps) {
  const [signals, setSignals] = useState<LeadSignals>({
    industry: 'Tecnologia da Informação',
    sizeBand: '51-200',
    jobTitle: 'Diretor de Operações',
    recentActivityCount: 3,
    lastActivityAt: new Date().toISOString(),
  });

  const result = useMemo(() => scoreLead(signals, profile), [signals, profile]);

  const set = (patch: Partial<LeadSignals>) => setSignals((prev) => ({ ...prev, ...patch }));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-body">Simulador de lead</CardTitle>
        <Badge variant="outline" className={cn('font-medium', TIER_STYLES[result.tier])}>
          {result.score.toFixed(0)} · {TIER_LABELS[result.tier]}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="sim-industry">Setor</Label>
            <Input
              id="sim-industry"
              value={signals.industry ?? ''}
              onChange={(e) => set({ industry: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sim-size">Porte (faixa ou número)</Label>
            <Input
              id="sim-size"
              value={signals.sizeBand ?? ''}
              onChange={(e) => set({ sizeBand: e.target.value })}
              placeholder="ex.: 51-200"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sim-title">Cargo</Label>
            <Input
              id="sim-title"
              value={signals.jobTitle ?? ''}
              onChange={(e) => set({ jobTitle: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sim-activity">Atividades nos últimos 30 dias</Label>
            <Input
              id="sim-activity"
              type="number"
              min={0}
              value={signals.recentActivityCount ?? 0}
              onChange={(e) => set({ recentActivityCount: Number(e.target.value) })}
            />
          </div>
        </div>

        <ul className="space-y-2" aria-label="Decomposição do score">
          {result.criteria.map((c) => (
            <li key={c.key} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-body-sm">
                <span className="text-foreground">{c.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {c.points.toFixed(1)} / {(c.weight * 100).toFixed(0)} pts
                </span>
              </div>
              <Progress value={c.match * 100} aria-label={`${c.label}: ${c.reason}`} />
              <p className="text-caption text-muted-foreground">{c.reason}</p>
            </li>
          ))}
        </ul>

        {result.missingSignals.length > 0 && (
          <p className="text-caption text-nexus-warning">
            Sinais ausentes: {result.missingSignals.join(', ')} — enriquecimento aumentaria a confiança do score.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
