import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Wrench } from 'lucide-react';
import { SkillsPickerPanel } from '@/components/skills/SkillsPickerPanel';
import { SkillRecommendationsCard } from '@/components/skills/SkillRecommendationsCard';
import { listSkills } from '@/services/skillsRegistryService';
import { recommendSkills } from '@/services/skillRecommenderService';

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

  const recommendations = useMemo(() => {
    if (!allSkills?.skills) return [];
    return recommendSkills(
      { mission: debouncedMission, role },
      allSkills.skills,
      5,
    );
  }, [debouncedMission, role, allSkills]);

  const recommendedIds = recommendations.map((r) => r.skill.id);

  const handleSelect = (id: string) => {
    if (selectedIds.includes(id)) onChange(selectedIds.filter((x) => x !== id));
    else onChange([...selectedIds, id]);
  };

  const handleInstallAll = () => {
    const merged = Array.from(new Set([...selectedIds, ...recommendedIds]));
    onChange(merged);
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

      <SkillRecommendationsCard
        recommendations={recommendations}
        selectedIds={selectedIds}
        onSelect={handleSelect}
        onInstallAll={handleInstallAll}
      />

      <SkillsPickerPanel
        selectedIds={selectedIds}
        onChange={onChange}
        recommendedIds={recommendedIds}
        emptyDescription="Nenhuma skill disponível — publique uma no /skills/composer."
      />
    </div>
  );
}
