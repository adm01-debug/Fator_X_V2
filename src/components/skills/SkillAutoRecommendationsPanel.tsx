/**
 * SkillAutoRecommendationsPanel — Recomendações automáticas baseadas na missão
 * de um agente existente, com botão "Adicionar ao agente" por skill.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, Bot, Loader2 } from 'lucide-react';
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

import { recommendSkills } from '@/services/skillRecommenderService';

export function SkillAutoRecommendationsPanel() {
  const [agentId, setAgentId] = useState<string | undefined>(undefined);
  const [installingIds, setInstallingIds] = useState<Set<string>>(new Set());
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

  const installedIds = useMemo(
    () => new Set((installed ?? []).map((s) => s.id)),
    [installed],
  );

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
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleInstallAll}
                  disabled={installingAll}
                >
                  {installingAll ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  Adicionar todas ({pendingIds.length})
                </Button>
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
