/**
 * SkillAutoRecommendationsPanel — Recomendações automáticas baseadas na missão
 * de um agente existente, com botão "Adicionar ao agente" por skill.
 *
 * Guarda de teto: aplicar sugestões em lote é o caminho mais rápido para
 * empurrar um agente para além de `MAX_PROMPT_SKILLS` sem ninguém perceber —
 * o insert sempre "dá certo", mas o compilador de prompt descarta o excedente
 * em silêncio. Projetamos o impacto ANTES da escrita, avisamos o operador e
 * registramos a trilha quando ele decide seguir mesmo assim.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Sparkles, Bot, Loader2, AlertTriangle, Scissors } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { SkillRecommendationsCard } from './SkillRecommendationsCard';
import { useAgents } from '@/hooks/use-data';
import {
  listSkills,
  installSkill,
  bulkInstallSkills,
  getInstalledSkills,
} from '@/services/skillsRegistryService';
import {
  evaluateInstallImpact,
  trimSelectionToCap,
  type NamedSkillRef,
} from '@/lib/skills/installGuard';
import { buildInstallCapRecord, shouldAuditInstall } from '@/lib/skills/installCapAudit';
import { audit } from '@/lib/auditService';
import { logger } from '@/lib/logger';

import { recommendSkills, computePendingSkillIds } from '@/services/skillRecommenderService';

export function SkillAutoRecommendationsPanel() {
  const [agentId, setAgentId] = useState<string | undefined>(undefined);
  const [installingIds, setInstallingIds] = useState<Set<string>>(new Set());
  const [installingAll, setInstallingAll] = useState(false);

  const queryClient = useQueryClient();

  const { data: agents } = useAgents();
  const activeAgent = agents?.find((a) => a.id === agentId);

  const { data: registry } = useQuery({
    queryKey: ['skills_all_for_auto_recs'],
    queryFn: () => listSkills({ limit: 100 }),
    staleTime: 60_000,
  });

  const { data: installed } = useQuery({
    queryKey: ['installed_skills', agentId],
    queryFn: () => getInstalledSkills(agentId!),
    enabled: !!agentId,
    staleTime: 30_000,
  });

  const installedIds = useMemo(() => new Set((installed ?? []).map((s) => s.id)), [installed]);

  const recommendations = useMemo(() => {
    if (!registry?.skills || !activeAgent) return [];
    const missionParts: string[] = [];
    if (typeof activeAgent.mission === 'string') missionParts.push(activeAgent.mission);
    // 'persona' is a jsonb-like column; safely extract role/description if present
    const persona = activeAgent.persona as { role?: string; description?: string } | null;
    if (persona?.description) missionParts.push(persona.description);
    return recommendSkills(
      {
        mission: missionParts.join(' ').trim() || activeAgent.name,
        role: persona?.role,
      },
      registry.skills,
      6,
    );
  }, [registry, activeAgent]);

  const handleInstall = async (skillId: string) => {
    if (!agentId) return;
    setInstallingIds((prev) => new Set(prev).add(skillId));
    try {
      const inserted = await installSkill(agentId, skillId);
      if (inserted) toast.success('Skill adicionada ao agente');
      else toast.info('Skill já estava instalada neste agente');

      await queryClient.invalidateQueries({ queryKey: ['installed_skills', agentId] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao instalar';
      toast.error('Erro ao adicionar skill', { description: msg });
    } finally {
      setInstallingIds((prev) => {
        const next = new Set(prev);
        next.delete(skillId);
        return next;
      });
    }
  };

  /** Recomendações ainda não instaladas — base do botão "Adicionar todas". */
  const pendingIds = useMemo(
    () => computePendingSkillIds(recommendations, installedIds),
    [recommendations, installedIds],
  );

  /** Refs nomeadas: a guarda conta por NOME normalizado, não por id. */
  const installedRefs = useMemo<NamedSkillRef[]>(
    () => (installed ?? []).map((s) => ({ id: s.id, name: s.name ?? '' })),
    [installed],
  );

  const pendingRefs = useMemo<NamedSkillRef[]>(() => {
    const porId = new Map(recommendations.map((r) => [r.skill.id, r.skill]));
    return pendingIds.map((id) => ({ id, name: porId.get(id)?.name ?? '' }));
  }, [recommendations, pendingIds]);

  /** Projeção do impacto de "Adicionar todas" antes de qualquer escrita. */
  const guard = useMemo(
    () => evaluateInstallImpact({ installed: installedRefs, selected: pendingRefs }),
    [installedRefs, pendingRefs],
  );

  const trimmed = useMemo(
    () => trimSelectionToCap({ installed: installedRefs, selected: pendingRefs }),
    [installedRefs, pendingRefs],
  );

  /**
   * Aplica o lote. `refs` permite instalar tanto tudo quanto só o que cabe —
   * a auditoria usa a mesma seleção efetivamente escrita, nunca a intenção
   * original, senão a trilha registraria um estouro que não aconteceu.
   */
  const applyBatch = async (refs: readonly NamedSkillRef[], acknowledged: boolean) => {
    if (!agentId || refs.length === 0) return;
    setInstallingAll(true);
    try {
      const ids = refs.map((r) => r.id);
      const { installed: ok, skipped } = await bulkInstallSkills(agentId, ids);
      await queryClient.invalidateQueries({ queryKey: ['installed_skills', agentId] });

      const record = buildInstallCapRecord({
        agentId,
        agentName: activeAgent?.name ?? '',
        installed: installedRefs,
        selected: refs,
        guard: evaluateInstallImpact({ installed: installedRefs, selected: refs }),
        acknowledged,
      });
      if (shouldAuditInstall(record)) {
        // Falha de auditoria não pode desfazer nem mascarar a instalação
        // bem-sucedida; registramos no logger e seguimos.
        try {
          await audit.skillInstallOverCap(record);
        } catch (auditErr) {
          logger.error('audit skill.install_over_cap failed', {
            error: auditErr instanceof Error ? auditErr.message : String(auditErr),
          });
        }
      }

      const parts: string[] = [];
      if (ok.length > 0) parts.push(`${ok.length} adicionada(s)`);
      if (skipped.length > 0) parts.push(`${skipped.length} já instalada(s)`);
      if (record.additionalDropped > 0) {
        parts.push(`${record.additionalDropped} serão descartada(s) no prompt`);
      }
      toast.success('Sugestões aplicadas', { description: parts.join(' · ') });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao instalar';
      toast.error('Erro ao adicionar skills', { description: msg });
    } finally {
      setInstallingAll(false);
    }
  };

  const handleInstallAll = () => void applyBatch(pendingRefs, guard.additionalDropped > 0);
  const handleInstallTrimmed = () => void applyBatch(trimmed, false);

  return (
    <Card className="border-nexus-amber/20">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-nexus-amber" />
          <div>
            <CardTitle className="text-title-sm">Auto-recomendações por agente</CardTitle>
            <CardDescription>
              Selecione um agente e receba sugestões calculadas a partir da missão dele.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-muted-foreground shrink-0" />
          <Select value={agentId} onValueChange={setAgentId}>
            <SelectTrigger className="w-full sm:w-[360px] bg-secondary/50">
              <SelectValue placeholder="Escolha um agente..." />
            </SelectTrigger>
            <SelectContent>
              {(agents ?? []).map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.avatar_emoji ? `${a.avatar_emoji} ` : ''}
                  {a.name}
                </SelectItem>
              ))}
              {(!agents || agents.length === 0) && (
                <div className="px-2 py-1.5 text-meta text-muted-foreground">
                  Nenhum agente disponível
                </div>
              )}
            </SelectContent>
          </Select>
        </div>

        {agentId ? (
          <>
            {pendingIds.length > 0 && (
              <div className="space-y-3">
                {guard.additionalDropped > 0 && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{guard.message}</AlertDescription>
                  </Alert>
                )}
                {guard.additionalDropped === 0 && guard.verdict === 'atencao' && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{guard.message}</AlertDescription>
                  </Alert>
                )}
                <div className="flex flex-wrap justify-end gap-2">
                  {guard.additionalDropped > 0 && trimmed.length > 0 && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleInstallTrimmed}
                      disabled={installingAll}
                      className="gap-1"
                    >
                      <Scissors className="h-4 w-4" />
                      Instalar só o que cabe ({trimmed.length})
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant={guard.additionalDropped > 0 ? 'ghost' : 'outline'}
                    onClick={handleInstallAll}
                    disabled={installingAll}
                  >
                    {installingAll ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    {guard.additionalDropped > 0
                      ? `Adicionar mesmo assim (${pendingIds.length})`
                      : `Adicionar todas (${pendingIds.length})`}
                  </Button>
                </div>
              </div>
            )}

            <SkillRecommendationsCard
              title={`Sugestões para ${activeAgent?.name ?? 'este agente'}`}
              description="Cada skill exibe o score, categoria e as palavras-chave que combinam com a missão."
              recommendations={recommendations}
              selectedIds={[]}
              onSelect={() => {}}
              onInstall={handleInstall}
              installingIds={installingIds}
              installedIds={installedIds}
              installLabel="Adicionar ao agente"
            />
          </>
        ) : (
          <p className="text-body-sm text-muted-foreground">
            Escolha um agente acima para ver recomendações automáticas com justificativa.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
