/**
 * SkillLibraryInstallPanel — ações de instalação da biblioteca em um agente.
 *
 * Regras de projeto:
 * - Nada é instalado sem um agente-alvo explícito (evita instalar no "primeiro
 *   agente da lista", que é a origem clássica de instalação fantasma).
 * - Instalação em lote usa `bulkInstallSkills`, que é idempotente: reinstalar
 *   uma skill já presente é no-op e não aborta o lote.
 */
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Download, Trash2, PackageCheck, AlertTriangle, Scissors } from 'lucide-react';
import { useAgents } from '@/hooks/use-data';
import {
  listSkills,
  getInstalledSkills,
  bulkInstallSkills,
  bulkUninstallSkills,
} from '@/services/skillsRegistryService';
import {
  evaluateInstallImpact,
  trimSelectionToCap,
  type NamedSkillRef,
} from '@/lib/skills/installGuard';
import {
  buildInstallCapRecord,
  shouldAuditInstall,
} from '@/lib/skills/installCapAudit';
import { audit } from '@/lib/auditService';
import { MAX_PROMPT_SKILLS } from '@/lib/skills/promptSimulation';

export function SkillLibraryInstallPanel() {
  const queryClient = useQueryClient();
  const { data: agents, isLoading: loadingAgents } = useAgents();
  const [agentId, setAgentId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  const { data: catalog, isLoading: loadingCatalog } = useQuery({
    queryKey: ['skill_library_catalog', search],
    queryFn: () => listSkills({ search: search || undefined, limit: 40 }),
  });

  const { data: installed } = useQuery({
    queryKey: ['skill_library_installed', agentId],
    queryFn: () => getInstalledSkills(agentId),
    enabled: agentId.length > 0,
  });

  const installedIds = useMemo(
    () => new Set((installed ?? []).map((s) => s.id)),
    [installed],
  );

  /**
   * Guarda de teto: o runtime compila no máximo MAX_PROMPT_SKILLS skills. Sem
   * este cálculo a instalação "dá certo" e o operador só descobre a perda pelo
   * comportamento degradado do agente semanas depois.
   */
  const catalogById = useMemo(() => {
    const map = new Map<string, NamedSkillRef>();
    for (const skill of catalog?.skills ?? []) {
      map.set(skill.id, { id: skill.id, name: skill.name ?? '' });
    }
    return map;
  }, [catalog]);

  const selectedRefs = useMemo<NamedSkillRef[]>(
    () => selected.map((id) => catalogById.get(id) ?? { id, name: '' }),
    [selected, catalogById],
  );

  const guard = useMemo(
    () =>
      evaluateInstallImpact({
        installed: (installed ?? []).map((s) => ({ id: s.id, name: s.name ?? '' })),
        selected: selectedRefs,
      }),
    [installed, selectedRefs],
  );

  const trimSelection = () => {
    const aceitas = trimSelectionToCap({
      installed: (installed ?? []).map((s) => ({ id: s.id, name: s.name ?? '' })),
      selected: selectedRefs,
    });
    setSelected(aceitas.map((s) => s.id));
    toast.info(`Seleção ajustada para ${aceitas.length} skill(s) que cabem no teto`);
  };

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['skill_library_installed', agentId] });
    void queryClient.invalidateQueries({ queryKey: ['skill_library_overview'] });
  };

  const install = useMutation({
    mutationFn: () => bulkInstallSkills(agentId, selected),
    onSuccess: ({ installed: ok, skipped }) => {
      // Trilha de auditoria ANTES de limpar a seleção: se a operação estourou o
      // teto, precisamos registrar quem aceitou conscientemente a perda.
      const record = buildInstallCapRecord({
        agentId,
        agentName: (agents ?? []).find((a) => a.id === agentId)?.name ?? null,
        installed: (installed ?? []).map((s) => ({ id: s.id, name: s.name ?? '' })),
        selected: selectedRefs,
        guard,
        acknowledged: true,
      });
      if (shouldAuditInstall(record)) {
        void audit.skillInstallOverCap(record);
      }

      setSelected([]);
      invalidate();
      toast.success(
        `${ok.length} skill(s) instalada(s)` +
          (skipped.length > 0 ? ` · ${skipped.length} já estavam presentes` : ''),
      );
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : 'Falha ao instalar skills'),
  });

  const uninstall = useMutation({
    mutationFn: (skillId: string) => bulkUninstallSkills(agentId, [skillId]),
    onSuccess: (removed) => {
      invalidate();
      toast.success(`${removed.length} skill(s) removida(s)`);
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : 'Falha ao remover skill'),
  });

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));

  const canInstall = agentId.length > 0 && selected.length > 0 && !install.isPending;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Instalar em um agente</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Select value={agentId} onValueChange={setAgentId} disabled={loadingAgents}>
            <SelectTrigger className="sm:w-64">
              <SelectValue placeholder="Escolha o agente-alvo" />
            </SelectTrigger>
            <SelectContent>
              {(agents ?? []).map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.avatar_emoji ? `${agent.avatar_emoji} ` : ''}
                  {agent.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar skills no catálogo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-secondary/50 pl-9"
            />
          </div>
        </div>

        <ScrollArea className="h-72 rounded-lg border border-border">
          <div className="divide-y divide-border">
            {loadingCatalog
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="p-3">
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                ))
              : (catalog?.skills ?? []).map((skill) => {
                  const isInstalled = installedIds.has(skill.id);
                  return (
                    <div key={skill.id} className="flex items-center gap-3 p-3">
                      <Checkbox
                        checked={selected.includes(skill.id)}
                        onCheckedChange={() => toggle(skill.id)}
                        disabled={isInstalled}
                        aria-label={`Selecionar ${skill.name}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{skill.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {skill.description || 'Sem descrição'}
                        </p>
                      </div>
                      {skill.department && (
                        <Badge variant="outline" className="hidden shrink-0 sm:inline-flex">
                          {skill.department}
                        </Badge>
                      )}
                      {isInstalled ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1 text-destructive"
                          onClick={() => uninstall.mutate(skill.id)}
                          disabled={uninstall.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Remover
                        </Button>
                      ) : (
                        <PackageCheck className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                      )}
                    </div>
                  );
                })}
          </div>
        </ScrollArea>

        {agentId && selected.length > 0 && guard.verdict !== 'ok' && (
          <div
            role="status"
            className={
              guard.verdict === 'bloqueio_recomendado'
                ? 'rounded-lg border border-destructive/40 bg-destructive/10 p-3'
                : 'rounded-lg border border-border bg-secondary/40 p-3'
            }
          >
            <div className="flex items-start gap-2">
              <AlertTriangle
                className={
                  guard.verdict === 'bloqueio_recomendado'
                    ? 'mt-0.5 h-4 w-4 shrink-0 text-destructive'
                    : 'mt-0.5 h-4 w-4 shrink-0 text-muted-foreground'
                }
              />
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-sm">{guard.message}</p>
                <p className="text-xs text-muted-foreground">
                  {guard.currentSlots} → {guard.projectedSlots} de {MAX_PROMPT_SKILLS} slots
                  {guard.redundant.length > 0
                    ? ` · ${guard.redundant.length} selecionada(s) sem efeito (duplicada/sem nome)`
                    : ''}
                </p>
                {guard.additionalDropped > 0 && (
                  <Button variant="outline" size="sm" className="gap-1" onClick={trimSelection}>
                    <Scissors className="h-3.5 w-3.5" /> Instalar só o que cabe
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {agentId
              ? `${selected.length} selecionada(s) · ${installedIds.size} já instalada(s)`
              : 'Selecione um agente para habilitar a instalação'}
          </p>
          <Button onClick={() => install.mutate()} disabled={!canInstall} className="gap-2">
            <Download className="h-4 w-4" />
            {install.isPending ? 'Instalando…' : 'Instalar selecionadas'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
