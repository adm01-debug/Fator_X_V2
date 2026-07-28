/**
 * Relatório do simulador de prompt — destino de cada skill e diagnóstico
 * agregado. Componente puro de apresentação.
 */
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  DISPOSITION_LABEL,
  SANITIZATION_LABEL,
  MAX_PROMPT_SKILLS,
  type PromptSimulationResult,
  type SkillDisposition,
} from '@/lib/skills/promptSimulation';

const DISPOSITION_CLASS: Record<SkillDisposition, string> = {
  injetada: 'border-nexus-emerald/40 bg-nexus-emerald/10 text-nexus-emerald',
  overflow: 'border-nexus-rose/40 bg-nexus-rose/10 text-nexus-rose',
  duplicada: 'border-nexus-amber/40 bg-nexus-amber/10 text-nexus-amber',
  descartada: 'border-border bg-muted/40 text-muted-foreground',
};

export interface SkillPromptSimulatorReportProps {
  result: PromptSimulationResult;
}

export function SkillPromptSimulatorReport({ result }: SkillPromptSimulatorReportProps) {
  const d = result.diagnostics;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Recebidas" value={d.received} hint={`teto de ${MAX_PROMPT_SKILLS} no prompt`} />
        <Tile
          label="No prompt"
          value={d.injected}
          hint={`${d.eligible} elegíveis`}
          tone="positivo"
        />
        <Tile
          label="Cortadas (overflow)"
          value={d.overflow}
          hint={d.overflowed ? 'agente não enxerga estas' : 'nenhum corte'}
          tone={d.overflowed ? 'critico' : 'default'}
        />
        <Tile
          label="Sanitizadas"
          value={d.sanitized}
          hint={`${d.duplicates} dup. · ${d.discarded} sem nome`}
          tone={d.sanitized > 0 ? 'atencao' : 'default'}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(SANITIZATION_LABEL) as Array<keyof typeof SANITIZATION_LABEL>)
          .filter((kind) => d.sanitizationsByKind[kind] > 0)
          .map((kind) => (
            <Badge key={kind} variant="outline" className="text-meta">
              {SANITIZATION_LABEL[kind]}: {d.sanitizationsByKind[kind]}
            </Badge>
          ))}
        <Badge variant="outline" className="text-meta">
          Tokens: {result.compiled.stats.estimatedTokens} ({result.baseTokens} base +{' '}
          {result.skillsTokens} skills)
        </Badge>
      </div>

      <ScrollArea className="h-72 rounded-lg border border-border/60">
        <ul className="divide-y divide-border/60">
          {result.skills.map((skill) => (
            <li
              key={`${skill.inputIndex}-${skill.id ?? skill.name}`}
              className="flex items-start justify-between gap-3 p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-body-sm font-medium text-foreground">
                  {skill.name || skill.originalName || '(sem nome)'}
                </p>
                {skill.description ? (
                  <p className="truncate text-meta text-muted-foreground">{skill.description}</p>
                ) : null}
                {skill.sanitizations.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {skill.sanitizations.map((kind) => (
                      <Badge key={kind} variant="secondary" className="text-meta">
                        {SANITIZATION_LABEL[kind]}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
              <Badge
                variant="outline"
                className={cn('shrink-0 text-meta', DISPOSITION_CLASS[skill.disposition])}
              >
                {DISPOSITION_LABEL[skill.disposition]}
              </Badge>
            </li>
          ))}
        </ul>
      </ScrollArea>
    </div>
  );
}

interface TileProps {
  label: string;
  value: number;
  hint?: string;
  tone?: 'default' | 'positivo' | 'atencao' | 'critico';
}

const TONE: Record<NonNullable<TileProps['tone']>, string> = {
  default: 'text-foreground',
  positivo: 'text-nexus-emerald',
  atencao: 'text-nexus-amber',
  critico: 'text-nexus-rose',
};

function Tile({ label, value, hint, tone = 'default' }: TileProps) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-3">
      <p className="text-meta uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-xl font-semibold tabular-nums', TONE[tone])}>{value}</p>
      {hint ? <p className="mt-0.5 text-meta text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
