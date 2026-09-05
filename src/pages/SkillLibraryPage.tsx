/**
 * Biblioteca de Skills — visão premium do pipeline completo:
 * ingestão (Harvester / Composer / Marketplace) → catálogo → curadoria → runtime.
 */
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { InfoHint } from '@/components/shared/InfoHint';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import { Plus, GitBranch, Library, BadgeCheck, Download } from 'lucide-react';
import { SkillPipelineFlow } from '@/components/skills/SkillPipelineFlow';
import { SkillClassificationStatusCard } from '@/components/skills/SkillClassificationStatusCard';
import { SkillLibraryInstallPanel } from '@/components/skills/SkillLibraryInstallPanel';
import { SkillObservabilityPanel } from '@/components/skills/SkillObservabilityPanel';
import { SkillPromptSimulator } from '@/components/skills/SkillPromptSimulator';
import { SkillOverflowAlertCard } from '@/components/skills/SkillOverflowAlertCard';
import { SkillPromptEvidenceLedgerCard } from '@/components/skills/SkillPromptEvidenceLedgerCard';
import { SkillInstallCapLedgerCard } from '@/components/skills/SkillInstallCapLedgerCard';
import { fetchSkillLibraryOverview } from '@/services/skillLibraryService';

const STAT_ICONS = [Library, GitBranch, BadgeCheck, Download] as const;

export default function SkillLibraryPage() {
  const {
    data: overview,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['skill_library_overview'],
    queryFn: fetchSkillLibraryOverview,
    staleTime: 60_000,
  });

  const stats = [
    { label: 'Skills no catálogo', value: overview?.total },
    { label: 'Importadas (Harvester)', value: overview?.harvested },
    { label: 'Verificadas', value: overview?.verified },
    { label: 'Instalações', value: overview?.installs },
  ];

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Biblioteca de Skills"
          description="Pipeline completo — ingestão, catálogo, curadoria e runtime dos agentes"
        />
        <div className="flex gap-2">
          <Button asChild variant="outline" className="gap-2">
            <Link to="/skills">
              <Library className="h-4 w-4" /> Marketplace
            </Link>
          </Button>
          <Button asChild className="gap-2">
            <Link to="/skills/composer">
              <Plus className="h-4 w-4" /> Criar skill
            </Link>
          </Button>
        </div>
      </div>

      <InfoHint title="Como a biblioteca funciona">
        Toda skill entra por um dos três caminhos de ingestão, é registrada no catálogo canônico,
        passa por curadoria de departamento (léxico → LLM → revisão humana) e só então é injetada no
        prompt do agente pelo carregador progressivo.
      </InfoHint>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 text-body-sm text-destructive">
            Não foi possível carregar as métricas da biblioteca. Tente novamente em instantes.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat, index) => {
          const Icon = STAT_ICONS[index];
          return (
            <Card key={stat.label} className="transition-shadow hover:shadow-nexus-lg">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Icon className="h-4 w-4" />
                  <span className="text-meta">{stat.label}</span>
                </div>
                {isLoading || typeof stat.value !== 'number' ? (
                  <Skeleton className="mt-2 h-7 w-20" />
                ) : (
                  <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
                    {stat.value.toLocaleString('pt-BR')}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <SkillPipelineFlow overview={overview} isLoading={isLoading} />

      <SkillObservabilityPanel />

      <SkillOverflowAlertCard />

      <SkillPromptSimulator />

      <SkillPromptEvidenceLedgerCard />

      <SkillInstallCapLedgerCard />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SkillLibraryInstallPanel />
        </div>
        <SkillClassificationStatusCard overview={overview} isLoading={isLoading} />
      </div>
    </div>
  );
}
