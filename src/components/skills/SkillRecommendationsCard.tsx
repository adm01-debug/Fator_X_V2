import { Sparkles, Loader2, Zap, Plus, Check } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { Recommendation } from '@/services/skillRecommenderService';

interface SkillRecommendationsCardProps {
  recommendations: Recommendation[];
  isLoading?: boolean;
  selectedIds: string[];
  onSelect: (id: string) => void;
  onInstallAll?: () => void;
  /**
   * Se fornecido, exibe um botão "Adicionar" por skill.
   * Retorna Promise para gerenciar estado de loading. Deve resolver após persistir.
   */
  onInstall?: (skillId: string) => Promise<void> | void;
  installingIds?: Set<string>;
  installedIds?: Set<string>;
  installLabel?: string;
  /** Título e descrição customizáveis */
  title?: string;
  description?: string;
}

export function SkillRecommendationsCard({
  recommendations,
  isLoading,
  selectedIds,
  onSelect,
  onInstallAll,
  onInstall,
  installingIds,
  installedIds,
  installLabel = 'Adicionar',
  title = 'Recomendadas para você',
  description = 'Baseado na missão e no contexto do agente',
}: SkillRecommendationsCardProps) {
  const selectedSet = new Set(selectedIds);
  const unselectedCount = recommendations.filter((r) => !selectedSet.has(r.skill.id)).length;

  return (
    <TooltipProvider delayDuration={200}>
      <Card className="border-nexus-amber/30 bg-gradient-to-br from-nexus-amber/5 to-transparent">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-nexus-amber" />
              <div>
                <CardTitle className="text-title-sm">{title}</CardTitle>
                <CardDescription className="text-meta">{description}</CardDescription>
              </div>
            </div>
            {onInstallAll && recommendations.length > 0 && unselectedCount > 0 && (
              <Button size="sm" variant="outline" onClick={onInstallAll} className="gap-1.5">
                <Zap className="h-3.5 w-3.5" />
                Instalar {unselectedCount} recomendada{unselectedCount === 1 ? '' : 's'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-body-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Analisando missão...
            </div>
          ) : recommendations.length === 0 ? (
            <p className="text-meta text-muted-foreground py-2">
              Descreva a missão do agente para ver recomendações.
            </p>
          ) : (
            <ul className="space-y-2">
              {recommendations.map((r) => {
                const selected = selectedSet.has(r.skill.id);
                const isInstalled = installedIds?.has(r.skill.id);
                const isInstalling = installingIds?.has(r.skill.id);
                const scorePct = Math.round(r.score * 100);
                return (
                  <li key={r.skill.id}>
                    <div
                      className={`w-full p-3 rounded-lg border transition-all ${
                        selected
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                          : 'border-border hover:border-primary/40 bg-card'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => onSelect(r.skill.id)}
                          className="flex-1 min-w-0 text-left"
                          aria-pressed={selected}
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-body-sm font-semibold">{r.skill.name}</span>
                            <Badge variant="outline" className="text-meta">
                              {r.skill.category}
                            </Badge>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge className="bg-nexus-amber/15 text-nexus-amber border-nexus-amber/30 text-meta cursor-help">
                                  {scorePct}% match
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs space-y-1.5">
                                <p className="text-meta font-semibold">Como calculamos</p>
                                <div className="space-y-1">
                                  <div className="flex justify-between gap-2">
                                    <span className="text-meta text-muted-foreground">
                                      Palavras-chave (60%)
                                    </span>
                                    <span className="text-meta font-mono">
                                      {Math.round(r.breakdown.keyword * 100)}%
                                    </span>
                                  </div>
                                  <Progress
                                    value={r.breakdown.keyword * 100}
                                    className="h-1"
                                  />
                                  <div className="flex justify-between gap-2 pt-1">
                                    <span className="text-meta text-muted-foreground">
                                      Categoria (40%)
                                    </span>
                                    <span className="text-meta font-mono">
                                      {Math.round(r.breakdown.category * 100)}%
                                    </span>
                                  </div>
                                  <Progress
                                    value={r.breakdown.category * 100}
                                    className="h-1"
                                  />
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                          <p className="text-meta text-muted-foreground mt-1">{r.reason}</p>
                          {r.matchedKeywords.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {r.matchedKeywords.slice(0, 6).map((kw) => (
                                <span
                                  key={kw}
                                  className="text-meta px-1.5 py-0.5 rounded bg-nexus-amber/10 text-nexus-amber border border-nexus-amber/20"
                                >
                                  {kw}
                                </span>
                              ))}
                            </div>
                          )}
                        </button>

                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          {selected && !onInstall && (
                            <Badge variant="secondary" className="text-meta">
                              Selecionada
                            </Badge>
                          )}
                          {onInstall && (
                            <Button
                              size="sm"
                              variant={isInstalled ? 'secondary' : 'default'}
                              disabled={isInstalled || isInstalling}
                              onClick={(e) => {
                                e.stopPropagation();
                                void onInstall(r.skill.id);
                              }}
                              className="h-7 gap-1 text-meta"
                            >
                              {isInstalling ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : isInstalled ? (
                                <Check className="h-3 w-3" />
                              ) : (
                                <Plus className="h-3 w-3" />
                              )}
                              {isInstalled ? 'Instalada' : isInstalling ? 'Instalando...' : installLabel}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
