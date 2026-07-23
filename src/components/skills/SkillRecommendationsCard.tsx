import { Sparkles, Loader2, Zap } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Recommendation } from '@/services/skillRecommenderService';

interface SkillRecommendationsCardProps {
  recommendations: Recommendation[];
  isLoading?: boolean;
  selectedIds: string[];
  onSelect: (id: string) => void;
  onInstallAll: () => void;
}

export function SkillRecommendationsCard({
  recommendations,
  isLoading,
  selectedIds,
  onSelect,
  onInstallAll,
}: SkillRecommendationsCardProps) {
  const selectedSet = new Set(selectedIds);
  const unselectedCount = recommendations.filter((r) => !selectedSet.has(r.skill.id)).length;

  return (
    <Card className="border-nexus-amber/30 bg-gradient-to-br from-nexus-amber/5 to-transparent">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-nexus-amber" />
            <div>
              <CardTitle className="text-title-sm">Recomendadas para você</CardTitle>
              <CardDescription className="text-meta">
                Baseado na missão e ferramentas do agente
              </CardDescription>
            </div>
          </div>
          {recommendations.length > 0 && unselectedCount > 0 && (
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
              return (
                <li key={r.skill.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(r.skill.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-all ${
                      selected
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                        : 'border-border hover:border-primary/40 bg-card'
                    }`}
                    aria-pressed={selected}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-body-sm font-semibold">{r.skill.name}</span>
                          <Badge variant="outline" className="text-meta">
                            {r.skill.category}
                          </Badge>
                          <Badge className="bg-nexus-amber/15 text-nexus-amber border-nexus-amber/30 text-meta">
                            {Math.round(r.score * 100)}% match
                          </Badge>
                        </div>
                        <p className="text-meta text-muted-foreground mt-1">{r.reason}</p>
                      </div>
                      {selected && (
                        <Badge variant="secondary" className="text-meta shrink-0">
                          Selecionada
                        </Badge>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
