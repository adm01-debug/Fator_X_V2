/**
 * TemplateLinkedSkillsPanel — mostra as skills do Registry vinculadas
 * automaticamente a um template de agente, permitindo instalá-las junto com o
 * agente criado a partir do blueprint.
 */
import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Puzzle, Loader2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { AgentTemplate } from '@/data/agentTemplates';
import { listSkills } from '@/services/skillsRegistryService';
import { linkSkillsToTemplate } from '@/services/templateSkillRegistry';

export interface TemplateLinkedSkillsPanelProps {
  template: AgentTemplate;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  className?: string;
}

export function TemplateLinkedSkillsPanel({
  template,
  selectedIds,
  onChange,
  className,
}: TemplateLinkedSkillsPanelProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['skills_for_template_link'],
    queryFn: () => listSkills({ limit: 100 }),
    staleTime: 60_000,
  });

  const linked = useMemo(
    () => (data?.skills ? linkSkillsToTemplate(template, data.skills, 5) : []),
    [data, template],
  );

  // Pré-seleciona os vínculos fortes assim que o cálculo estiver disponível.
  const strongIds = useMemo(
    () => linked.filter((l) => l.isStrongMatch).map((l) => l.skill.id),
    [linked],
  );

  useEffect(() => {
    if (strongIds.length > 0) onChange(strongIds);
    else onChange([]);
    // Recalcula apenas quando o template ou os vínculos fortes mudam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template.id, strongIds.join('|')]);

  const toggle = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  return (
    <div className={cn('space-y-3', className)}>
      <h4 className="text-body-sm font-bold flex items-center gap-2 text-foreground">
        <Puzzle className="h-4 w-4 text-nexus-purple" />
        Skills vinculadas
      </h4>

      {isLoading ? (
        <div className="flex items-center gap-2 text-meta text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Calculando vínculos…
        </div>
      ) : linked.length === 0 ? (
        <p className="text-meta text-muted-foreground">
          Nenhuma skill do Registry combina com este blueprint ainda.
        </p>
      ) : (
        <ul className="space-y-2">
          {linked.map((l) => (
            <li
              key={l.skill.id}
              className="flex items-start gap-3 rounded-xl border border-border/50 bg-secondary/30 p-3"
            >
              <Checkbox
                id={`linked-${l.skill.id}`}
                checked={selectedIds.includes(l.skill.id)}
                onCheckedChange={() => toggle(l.skill.id)}
                aria-label={`Instalar skill ${l.skill.name}`}
                className="mt-0.5"
              />
              <label htmlFor={`linked-${l.skill.id}`} className="flex-1 cursor-pointer space-y-1">
                <span className="flex items-center gap-2">
                  <span className="text-body-sm font-semibold text-foreground">{l.skill.name}</span>
                  {l.isStrongMatch && (
                    <Badge variant="outline" className="text-[9px] uppercase font-bold border-primary/40 text-primary">
                      Match forte
                    </Badge>
                  )}
                </span>
                <span className="block text-meta text-muted-foreground">{l.reason}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
