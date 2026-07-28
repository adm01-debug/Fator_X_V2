/**
 * SkillPipelineFlow — visualização das 4 camadas do pipeline da biblioteca.
 * Cada estágio é navegável: o painel é um mapa operacional, não uma ilustração.
 */
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  GitBranch,
  PenLine,
  Store,
  Database,
  ScanSearch,
  Cpu,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';
import type { SkillLibraryOverview } from '@/services/skillLibraryService';

interface StageNode {
  key: string;
  icon: LucideIcon;
  title: string;
  caption: string;
  metric: string;
  to: string;
  accent: string;
}

interface SkillPipelineFlowProps {
  overview?: SkillLibraryOverview;
  isLoading?: boolean;
}

/** Formata contagens sem poluir o card com números longos. */
function compact(value: number): string {
  return new Intl.NumberFormat('pt-BR', { notation: 'compact' }).format(value);
}

function buildStages(o?: SkillLibraryOverview): StageNode[][] {
  const n = (v: number | undefined) => (typeof v === 'number' ? compact(v) : '—');
  return [
    [
      {
        key: 'harvester',
        icon: GitBranch,
        title: 'Harvester',
        caption: 'Importação GitHub dirigida',
        metric: `${n(o?.harvested)} importadas`,
        to: '/skills/harvest',
        accent: 'text-nexus-cyan border-nexus-cyan/25 bg-nexus-cyan/5',
      },
      {
        key: 'composer',
        icon: PenLine,
        title: 'Composer',
        caption: 'Criação guiada com Zod',
        metric: `${n(o?.authored)} autorais`,
        to: '/skills/composer',
        accent: 'text-nexus-purple border-nexus-purple/25 bg-nexus-purple/5',
      },
      {
        key: 'marketplace',
        icon: Store,
        title: 'Marketplace',
        caption: 'Descoberta e monetização',
        metric: `${n(o?.installs)} instalações`,
        to: '/skills',
        accent: 'text-nexus-amber border-nexus-amber/25 bg-nexus-amber/5',
      },
    ],
    [
      {
        key: 'catalog',
        icon: Database,
        title: 'Catálogo',
        caption: 'skill_registry — fonte da verdade',
        metric: `${n(o?.total)} skills públicas`,
        to: '/skills',
        accent: 'text-primary border-primary/25 bg-primary/5',
      },
    ],
    [
      {
        key: 'curation',
        icon: ScanSearch,
        title: 'Curadoria',
        caption: 'Léxico → LLM → revisão humana',
        metric: `${n(o?.unclassified)} sem depto.`,
        to: '/skills/audit',
        accent: 'text-nexus-emerald border-nexus-emerald/25 bg-nexus-emerald/5',
      },
    ],
    [
      {
        key: 'runtime',
        icon: Cpu,
        title: 'Runtime',
        caption: 'Injeção progressiva no prompt',
        metric: `${n(o?.verified)} verificadas`,
        to: '/agents/installed-skills',
        accent: 'text-foreground border-border bg-muted/30',
      },
    ],
  ];
}

export function SkillPipelineFlow({ overview, isLoading }: SkillPipelineFlowProps) {
  const columns = buildStages(overview);

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Pipeline da biblioteca</h2>
            <p className="text-sm text-muted-foreground">
              Da ingestão à injeção no prompt do agente
            </p>
          </div>
          <Badge variant="outline" className="shrink-0">
            {isLoading ? 'carregando…' : '4 camadas'}
          </Badge>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
          {columns.map((stage, index) => (
            <div key={stage[0].key} className="flex flex-1 items-center gap-3">
              <div className="flex w-full flex-col gap-3">
                {stage.map((node) => (
                  <Link
                    key={node.key}
                    to={node.to}
                    className={cn(
                      'group rounded-xl border p-4 transition-all duration-200',
                      'hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      node.accent,
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <node.icon className="h-4 w-4 shrink-0" />
                      <span className="text-sm font-semibold text-foreground">{node.title}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{node.caption}</p>
                    <p className="mt-2 text-sm font-medium tabular-nums">{node.metric}</p>
                  </Link>
                ))}
              </div>
              {index < columns.length - 1 && (
                <ArrowRight
                  className="hidden h-4 w-4 shrink-0 text-muted-foreground lg:block"
                  aria-hidden
                />
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
