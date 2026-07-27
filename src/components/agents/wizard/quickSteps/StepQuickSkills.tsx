import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Wrench, Pin, Sparkles } from 'lucide-react';
import { SkillsPickerPanel } from '@/components/skills/SkillsPickerPanel';
import { SkillRecommendationsCard } from '@/components/skills/SkillRecommendationsCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { listSkills } from '@/services/skillsRegistryService';
import { recommendSkills } from '@/services/skillRecommenderService';
import { resolveQuickTypeTemplateIds } from '@/services/quickTypeTemplateMap';
import { fetchAggregatedTemplateSkillLinks } from '@/services/templateSkillLinkService';

interface StepQuickSkillsProps {
  mission: string;
  role?: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function StepQuickSkills({ mission, role, selectedIds, onChange }: StepQuickSkillsProps) {
  const [debouncedMission, setDebouncedMission] = useState(mission);

  // Debounce 400ms para não recalcular a cada tecla
  useMemo(() => {
    const t = setTimeout(() => setDebouncedMission(mission), 400);
    return () => clearTimeout(t);
  }, [mission]);

  const { data: allSkills } = useQuery({
    queryKey: ['skills_all_for_recs'],
    queryFn: () => listSkills({ limit: 100 }),
    staleTime: 60_000,
  });

  // Templates da galeria equivalentes ao tipo escolhido no wizard rápido.
  const templateIds = useMemo(() => resolveQuickTypeTemplateIds(role ?? ''), [role]);

  // Curadoria herdada: reaproveita os vínculos já persistidos e revisados por
  // um admin, em vez de depender só da similaridade textual da missão.
  const { data: inherited = [] } = useQuery({
    queryKey: ['quick_inherited_links', templateIds.join('|')],
    queryFn: () => fetchAggregatedTemplateSkillLinks(templateIds, 5),
    enabled: templateIds.length > 0,
    staleTime: 60_000,
    retry: false,
  });

  const recommendations = useMemo(() => {
    if (!allSkills?.skills) return [];
    return recommendSkills(
      { mission: debouncedMission, role },
      allSkills.skills,
      5,
    );
  }, [debouncedMission, role, allSkills]);

  const recommendedIds = recommendations.map((r) => r.skill.id);
  const inheritedIds = inherited.map((l) => l.skillId);

  const handleSelect = (id: string) => {
    if (selectedIds.includes(id)) onChange(selectedIds.filter((x) => x !== id));
    else onChange([...selectedIds, id]);
  };

  const handleInstallAll = () => {
    const merged = Array.from(new Set([...selectedIds, ...recommendedIds]));
    onChange(merged);
  };

  const handleInstallInherited = () => {
    onChange(Array.from(new Set([...selectedIds, ...inheritedIds])));
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Wrench className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-title-sm font-heading font-semibold text-foreground">Skills</h2>
          <p className="text-body-sm text-muted-foreground">
            Instale habilidades do marketplace — separadas das Ferramentas nativas e MCP.
            Recomendações são calculadas a partir da missão do agente.
          </p>
        </div>
      </div>

      {inherited.length > 0 && (
        <section className="rounded-xl border border-nexus-purple/30 bg-nexus-purple/5 p-4 space-y-3">
          <header className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h3 className="text-body-sm font-bold text-foreground flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-nexus-purple" />
                Herdadas de blueprints equivalentes
              </h3>
              <p className="text-meta text-muted-foreground">
                Vínculos já curados para os templates da galeria com o mesmo perfil.
              </p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={handleInstallInherited}>
              Selecionar todas
            </Button>
          </header>

          <ul className="space-y-2">
            {inherited.map((l) => (
              <li key={l.skillId} className="flex items-start gap-3">
                <Checkbox
                  id={`inherited-${l.skillId}`}
                  checked={selectedIds.includes(l.skillId)}
                  onCheckedChange={() => handleSelect(l.skillId)}
                  aria-label={`Instalar skill ${l.skillName}`}
                  className="mt-0.5"
                />
                <label htmlFor={`inherited-${l.skillId}`} className="flex-1 cursor-pointer space-y-0.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-body-sm font-semibold text-foreground">{l.skillName}</span>
                    {l.origin === 'manual' && (
                      <Badge
                        variant="outline"
                        className="gap-1 text-[9px] uppercase font-bold border-nexus-purple/40 text-nexus-purple"
                      >
                        <Pin className="h-2.5 w-2.5" /> Curadoria
                      </Badge>
                    )}
                    {l.templateCount > 1 && (
                      <Badge variant="secondary" className="text-[9px] font-bold">
                        {l.templateCount} blueprints
                      </Badge>
                    )}
                  </span>
                  <span className="block text-meta text-muted-foreground">{l.reason}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}

      <SkillRecommendationsCard
        recommendations={recommendations}
        selectedIds={selectedIds}
        onSelect={handleSelect}
        onInstallAll={handleInstallAll}
      />

      <SkillsPickerPanel
        selectedIds={selectedIds}
        onChange={onChange}
        recommendedIds={Array.from(new Set([...recommendedIds, ...inheritedIds]))}
        emptyDescription="Nenhuma skill disponível — publique uma no /skills/composer."
      />
    </div>
  );
}
