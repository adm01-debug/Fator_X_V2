/**
 * SkillsModule — Gestão de skills do agente dentro do Agent Builder.
 *
 * Três camadas:
 *  1. Recomendações automáticas (score determinístico sobre missão/persona/tools).
 *  2. Skills instaladas (remoção individual).
 *  3. Catálogo completo (seleção livre: adicionar ou excluir qualquer skill).
 *
 * Persistência imediata em `agent_installed_skills` — só disponível após o
 * agente ter sido salvo (precisamos de um `agent_id` real para o vínculo).
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trash2, Sparkles, Package, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/EmptyState';
import { SectionTitle } from '../ui';
import { SkillsPickerPanel } from '@/components/skills/SkillsPickerPanel';
import { SkillRecommendationsCard } from '@/components/skills/SkillRecommendationsCard';
import { recommendSkills } from '@/services/skillRecommenderService';
import {
  listSkills,
  getInstalledSkills,
  installSkill,
  bulkInstallSkills,

  uninstallSkill,
  type AgentSkillDefinition,
  computeSkillSelectionDiff,
} from '@/services/skillsRegistryService';
import { useAgentBuilderStore } from '@/stores/agentBuilderStore';
import { logger } from '@/lib/logger';

export function SkillsModule() {
  const agent = useAgentBuilderStore((s) => s.agent);
  const agentId = agent.id;
  const queryClient = useQueryClient();
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const { data: installed = [], isLoading: loadingInstalled } = useQuery({
    queryKey: ['agent_installed_skills', agentId],
    queryFn: () => getInstalledSkills(agentId as string),
    enabled: Boolean(agentId),
    staleTime: 15_000,
  });

  // Registry amplo para alimentar o recomendador (sem chamada LLM).
  const { data: registry } = useQuery({
    queryKey: ['skills_registry_for_recommender'],
    queryFn: () => listSkills({ limit: 200 }),
    staleTime: 60_000,
  });

  const installedIds = useMemo(
    () => (installed as AgentSkillDefinition[]).filter(Boolean).map((s) => s.id),
    [installed],
  );
  const installedSet = useMemo(() => new Set(installedIds), [installedIds]);

  const recommendations = useMemo(() => {
    const pool = registry?.skills ?? [];
    if (pool.length === 0) return [];
    return recommendSkills(
      {
        mission: `${agent.mission ?? ''} ${agent.scope ?? ''}`.trim(),
        role: agent.persona,
        tools: (agent.tools ?? []).map((t) => t.name).filter(Boolean),
      },
      pool,
      5,
    );
  }, [registry, agent.mission, agent.scope, agent.persona, agent.tools]);

  const setBusy = (id: string, on: boolean) =>
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['agent_installed_skills', agentId] });

  const handleInstall = async (skillId: string) => {
    if (!agentId) return;
    setBusy(skillId, true);
    try {
      const inserted = await installSkill(agentId, skillId);
      await refresh();
      if (inserted) toast.success('Skill adicionada ao agente');
      else toast.info('Skill já estava instalada');

    } catch (error) {
      logger.error('Falha ao instalar skill', { error, skillId, agentId });
      toast.error('Não foi possível adicionar a skill');
    } finally {
      setBusy(skillId, false);
    }
  };

  const handleUninstall = async (skillId: string) => {
    if (!agentId) return;
    setBusy(skillId, true);
    try {
      await uninstallSkill(agentId, skillId);
      await refresh();
      toast.success('Skill removida do agente');
    } catch (error) {
      logger.error('Falha ao remover skill', { error, skillId, agentId });
      toast.error('Não foi possível remover a skill');
    } finally {
      setBusy(skillId, false);
    }
  };

  /**
   * Aplica um lote de skills em uma única chamada idempotente (UPSERT),
   * evitando N toasts e N refreshes. Retorna resumo agregado.
   */
  const applyBatch = async (idsToAdd: string[], idsToRemove: string[]) => {
    if (idsToAdd.length === 0 && idsToRemove.length === 0) return;
    if (!agentId) return;
    for (const id of [...idsToAdd, ...idsToRemove]) setBusy(id, true);
    try {
      let installedCount = 0;
      let skippedCount = 0;
      if (idsToAdd.length > 0) {
        const res = await bulkInstallSkills(agentId, idsToAdd);
        installedCount = res.installed.length;
        skippedCount = res.skipped.length;
      }
      for (const id of idsToRemove) await uninstallSkill(agentId, id);
      await refresh();

      const parts: string[] = [];
      if (installedCount > 0) parts.push(`${installedCount} adicionada(s)`);
      if (skippedCount > 0) parts.push(`${skippedCount} já instalada(s)`);
      if (idsToRemove.length > 0) parts.push(`${idsToRemove.length} removida(s)`);
      if (parts.length > 0) toast.success('Skills atualizadas', { description: parts.join(' · ') });
    } catch (error) {
      logger.error('Falha ao aplicar lote de skills', { error, agentId });
      toast.error('Não foi possível atualizar as skills');
    } finally {
      for (const id of [...idsToAdd, ...idsToRemove]) setBusy(id, false);
    }
  };

  /** Diferença entre a seleção do catálogo e o estado atual → instala/remove. */
  const handlePickerChange = async (nextIds: string[]) => {
    const { toAdd, toRemove } = computeSkillSelectionDiff(installedIds, nextIds);
    await applyBatch(toAdd, toRemove);
  };


  const handleInstallAll = async () => {
    const toAdd = recommendations
      .map((rec) => rec.skill.id)
      .filter((id) => !installedSet.has(id));
    await applyBatch(toAdd, []);
  };


  if (!agentId) {
    return (
      <div>
        <SectionTitle
          icon="🧩"
          title="Skills do Agente"
          subtitle="Adicione, remova e receba recomendações automáticas de skills."
        />
        <EmptyState
          icon={Save}
          title="Salve o agente primeiro"
          description="As skills são vinculadas ao agente no banco. Salve o agente na aba Identidade para liberar a gestão de skills."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionTitle
        icon="🧩"
        title="Skills do Agente"
        subtitle="O sistema recomenda as principais skills para a missão deste agente — você adiciona ou exclui livremente."
        badge={`${installedIds.length} instalada${installedIds.length === 1 ? '' : 's'}`}
      />

      {recommendations.length > 0 && (
        <SkillRecommendationsCard
          recommendations={recommendations}
          selectedIds={installedIds}
          onSelect={(id) => (installedSet.has(id) ? handleUninstall(id) : handleInstall(id))}
          onInstall={handleInstall}
          onInstallAll={handleInstallAll}
          installingIds={busyIds}
          installedIds={installedSet}
          title="Recomendadas para este agente"
          description="Score determinístico baseado na missão, escopo, persona e ferramentas."
        />
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-title-sm">Skills instaladas</CardTitle>
              <CardDescription className="text-meta">
                Cada skill é injetada no contexto do agente em tempo de execução.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingInstalled ? (
            <p className="text-meta text-muted-foreground">Carregando skills…</p>
          ) : installedIds.length === 0 ? (
            <EmptyState
              icon={Package}
              title="Nenhuma skill instalada"
              description="Use as recomendações acima ou escolha no catálogo completo abaixo."
            />
          ) : (
            <ul className="space-y-2">
              {(installed as AgentSkillDefinition[]).filter(Boolean).map((skill) => (
                <li
                  key={skill.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-secondary/30 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-body-sm font-medium text-foreground truncate">{skill.name}</p>
                    <p className="text-meta text-muted-foreground line-clamp-1">{skill.description}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-meta">
                      {skill.category}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyIds.has(skill.id)}
                      onClick={() => handleUninstall(skill.id)}
                      aria-label={`Remover skill ${skill.name}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-title-sm">Catálogo completo</CardTitle>
          <CardDescription className="text-meta">
            Monte o agente do zero: clique para adicionar ou remover qualquer skill do registry.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SkillsPickerPanel
            selectedIds={installedIds}
            onChange={handlePickerChange}
            recommendedIds={recommendations.map((r) => r.skill.id)}
            emptyDescription="Publique novas skills no Composer ou ajuste os filtros de busca."
          />
        </CardContent>
      </Card>
    </div>
  );
}
