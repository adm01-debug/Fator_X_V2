/**
 * TemplateLinkedSkillsPanel — mostra as skills do Registry vinculadas a um
 * template de agente (persistidas ou calculadas), permite instalá-las junto do
 * agente e oferece curadoria manual (adicionar/remover) para admins.
 *
 * A RLS da tabela `template_skill_links` é a fonte de verdade da permissão:
 * usuários sem privilégio recebem erro e vêem um toast explicativo.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Puzzle, Loader2, Plus, X, Pin } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { AgentTemplate } from '@/data/agentTemplates';
import { listSkills, type AgentSkillDefinition } from '@/services/skillsRegistryService';
import { linkSkillsToTemplate } from '@/services/templateSkillRegistry';
import {
  fetchTemplateSkillLinks,
  mergeDisplayLinks,
  toDisplayLink,
  formatCurationTrail,
  addManualTemplateSkillLink,
  removeTemplateSkillLink,
  type DisplayTemplateSkillLink,
} from '@/services/templateSkillLinkService';
import { supabase } from '@/integrations/supabase/client';


export interface TemplateLinkedSkillsPanelProps {
  template: AgentTemplate;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** Exibe os controles de curadoria manual. */
  allowCuration?: boolean;
  className?: string;
}

const DISPLAY_LIMIT = 5;

export function TemplateLinkedSkillsPanel({
  template,
  selectedIds,
  onChange,
  allowCuration = true,
  className,
}: TemplateLinkedSkillsPanelProps) {
  const queryClient = useQueryClient();
  const [pendingSkillId, setPendingSkillId] = useState<string>('');

  // Usado apenas para personalizar a trilha de auditoria ("você" vs. admin X).
  const currentUser = useQuery({
    queryKey: ['auth_user_id'],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
    staleTime: 5 * 60_000,
    retry: false,
  });



  // 1ª fonte: vínculos persistidos (curadoria + recálculo por um clique).
  const persisted = useQuery({
    queryKey: ['template_skill_links', template.id],
    queryFn: () => fetchTemplateSkillLinks(template.id, DISPLAY_LIMIT + 10),
    staleTime: 60_000,
    retry: false,
  });

  const hasPersisted = (persisted.data?.length ?? 0) > 0;

  // Catálogo de skills: fallback de cálculo local + opções de curadoria.
  const catalog = useQuery({
    queryKey: ['skills_for_template_link'],
    queryFn: () => listSkills({ limit: 100 }),
    staleTime: 60_000,
    enabled: allowCuration || (!persisted.isLoading && !hasPersisted),
  });

  const isLoading = persisted.isLoading || (!hasPersisted && catalog.isLoading);

  const linked = useMemo<DisplayTemplateSkillLink[]>(() => {
    const persistedLinks = (persisted.data ?? [])
      .map(toDisplayLink)
      .filter((l): l is DisplayTemplateSkillLink => l !== null);

    const fallback: DisplayTemplateSkillLink[] = catalog.data?.skills
      ? linkSkillsToTemplate(template, catalog.data.skills, DISPLAY_LIMIT).map((l) => ({
          skillId: l.skill.id,
          skillName: l.skill.name,
          reason: l.reason,
          isStrongMatch: l.isStrongMatch,
          origin: 'auto' as const,
        }))
      : [];

    return mergeDisplayLinks(persistedLinks, fallback, DISPLAY_LIMIT);
  }, [persisted.data, catalog.data, template]);

  // Pré-seleciona os vínculos fortes assim que o cálculo estiver disponível.
  const strongIds = useMemo(
    () => linked.filter((l) => l.isStrongMatch).map((l) => l.skillId),
    [linked],
  );

  useEffect(() => {
    onChange(strongIds.length > 0 ? strongIds : []);
    // Recalcula apenas quando o template ou os vínculos fortes mudam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template.id, strongIds.join('|')]);

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['template_skill_links', template.id] }),
      queryClient.invalidateQueries({ queryKey: ['template_skill_link_counts'] }),
    ]);

  const addLink = useMutation({
    mutationFn: (skillId: string) => addManualTemplateSkillLink(template.id, skillId),
    onSuccess: async () => {
      setPendingSkillId('');
      await invalidate();
      toast.success('Skill vinculada ao template');
    },
    onError: (error: Error) =>
      toast.error('Não foi possível vincular', {
        description: `${error.message} — apenas administradores podem curar vínculos.`,
      }),
  });

  const removeLink = useMutation({
    mutationFn: (skillId: string) => removeTemplateSkillLink(template.id, skillId),
    onSuccess: async () => {
      await invalidate();
      toast.success('Vínculo removido');
    },
    onError: (error: Error) =>
      toast.error('Não foi possível remover', {
        description: `${error.message} — apenas administradores podem curar vínculos.`,
      }),
  });

  const linkedIds = new Set(linked.map((l) => l.skillId));
  const availableSkills: AgentSkillDefinition[] = (catalog.data?.skills ?? []).filter(
    (s) => !linkedIds.has(s.id),
  );
  const isMutating = addLink.isPending || removeLink.isPending;

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
              key={l.skillId}
              className="flex items-start gap-3 rounded-xl border border-border/50 bg-secondary/30 p-3"
            >
              <Checkbox
                id={`linked-${l.skillId}`}
                checked={selectedIds.includes(l.skillId)}
                onCheckedChange={() => toggle(l.skillId)}
                aria-label={`Instalar skill ${l.skillName}`}
                className="mt-0.5"
              />
              <label htmlFor={`linked-${l.skillId}`} className="flex-1 cursor-pointer space-y-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-body-sm font-semibold text-foreground">{l.skillName}</span>
                  {l.origin === 'manual' ? (
                    <Badge
                      variant="outline"
                      className="gap-1 text-[9px] uppercase font-bold border-nexus-purple/40 text-nexus-purple"
                    >
                      <Pin className="h-2.5 w-2.5" /> Curadoria
                    </Badge>
                  ) : (
                    l.isStrongMatch && (
                      <Badge
                        variant="outline"
                        className="text-[9px] uppercase font-bold border-primary/40 text-primary"
                      >
                        Match forte
                      </Badge>
                    )
                  )}
                </span>
                <span className="block text-meta text-muted-foreground">{l.reason}</span>
                {(() => {
                  const trilha = formatCurationTrail(l, currentUser.data);
                  return trilha ? (
                    <span className="block text-[10px] text-muted-foreground/70">{trilha}</span>
                  ) : null;
                })()}

              </label>
              {allowCuration && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={isMutating}
                  onClick={() => removeLink.mutate(l.skillId)}
                  aria-label={`Remover vínculo com ${l.skillName}`}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {allowCuration && availableSkills.length > 0 && (
        <div className="flex items-center gap-2">
          <Select value={pendingSkillId} onValueChange={setPendingSkillId} disabled={isMutating}>
            <SelectTrigger className="h-9 flex-1 text-meta" aria-label="Escolher skill para vincular">
              <SelectValue placeholder="Adicionar skill manualmente…" />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {availableSkills.map((skill) => (
                <SelectItem key={skill.id} value={skill.id} className="text-meta">
                  {skill.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!pendingSkillId || isMutating}
            onClick={() => addLink.mutate(pendingSkillId)}
          >
            {addLink.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Vincular
          </Button>
        </div>
      )}
    </div>
  );
}
