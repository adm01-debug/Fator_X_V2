/**
 * SkillHarvestPage — curadoria das skills coletadas no GitHub.
 *
 * Rota: /skills/harvest (restrita a administradores de workspace).
 * A varredura roda server-side; aqui o admin aprova, rejeita, reclassifica
 * e promove candidatos para o registry.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Download,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  Star,
  ShieldAlert,
  ExternalLink,
  Search,
  Layers,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { RecentCurationsPanel } from '@/components/agents/RecentCurationsPanel';
import { SkillDemandPanel } from '@/components/skills/SkillDemandPanel';
import { HarvestCheckpointsCard } from '@/components/skills/HarvestCheckpointsCard';

import { rebuildTemplateSkillLinks } from '@/services/templateSkillLinkService';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { repoSlugRegex } from '@/lib/validations/skillImport';

import {
  SKILL_DEPARTMENTS,
  DEPARTMENT_META,
  departmentLabel,
  type SkillDepartment,
} from '@/config/skill-departments';
import {
  runHarvest,
  runHarvestAllBatches,
  listCandidates,
  listRuns,
  promoteCandidate,
  bulkUpdateStatus,
  updateCandidate,
  getDepartmentCoverage,
  loadHarvestCheckpoint,
  saveHarvestCheckpoint,
  clearHarvestCheckpoint,
  purgeStaleLocalCheckpoints,
  type HarvestCandidate,
  type HarvestRun,
  type CandidateStatus,
  type HarvestBatchResult,
} from '@/services/skillHarvestService';

const STATUS_LABEL: Record<CandidateStatus, string> = {
  pending: 'Pendente',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
  auto_rejected: 'Rejeitado automaticamente',
  promoted: 'Promovido',
};

const COVERAGE_TARGET = 5;

/**
 * Teto de invocações encadeadas por clique. Protege contra um monorepo
 * absurdo consumir cota indefinidamente; o curador pode rodar de novo e a
 * varredura continua a partir dos candidatos já gravados.
 */
const MAX_HARVEST_BATCHES = 12;

/** Progresso da varredura em lotes exibido durante o modo dirigido. */
interface HarvestProgress {
  batch: number;
  processed: number;
  total: number;
  inserted: number;
}

export default function SkillHarvestPage() {
  const [candidates, setCandidates] = useState<HarvestCandidate[]>([]);
  const [runs, setRuns] = useState<HarvestRun[]>([]);
  const [coverage, setCoverage] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [harvesting, setHarvesting] = useState(false);
  const [harvestProgress, setHarvestProgress] = useState<HarvestProgress | null>(null);
  /** Permite ao curador interromper o encadeamento sem perder o já coletado. */
  const abortRef = useRef<AbortController | null>(null);
  const [rebuilding, setRebuilding] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [statusFilter, setStatusFilter] = useState<CandidateStatus | 'all'>('pending');
  const [deptFilter, setDeptFilter] = useState<SkillDepartment | 'all'>('all');
  const [search, setSearch] = useState('');

  const [pickedDepts, setPickedDepts] = useState<Set<SkillDepartment>>(new Set());
  const [minStars, setMinStars] = useState(3);
  const [maxRepos, setMaxRepos] = useState(40);
  /** Lista livre de monorepos, um `owner/repo` por linha. */
  const [reposInput, setReposInput] = useState('');
  const [filesPerRepo, setFilesPerRepo] = useState(120);
  /** Incrementa para forçar recarga do painel de varreduras interrompidas. */
  const [checkpointsToken, setCheckpointsToken] = useState(0);

  /** Normaliza a caixa de texto: aceita URL completa ou `owner/repo`. */
  const parsedRepos = useMemo(
    () =>
      Array.from(
        new Set(
          reposInput
            .split(/[\n,\s]+/)
            .map((raw) =>
              raw
                .trim()
                .replace(/^https?:\/\/github\.com\//i, '')
                .replace(/\.git$/i, '')
                .replace(/\/+$/, ''),
            )
            .filter((s) => repoSlugRegex.test(s)),
        ),
      ).slice(0, 10),
    [reposInput],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, r, cov] = await Promise.all([
        listCandidates({ status: statusFilter, department: deptFilter, search }),
        listRuns(10),
        getDepartmentCoverage(),
      ]);
      setCandidates(c);
      setRuns(r);
      setCoverage(cov);
    } catch (e) {
      toast.error('Falha ao carregar a fila de curadoria', {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, deptFilter, search]);

  useEffect(() => {
    void load();
  }, [load]);

  // Higiene de storage: remove checkpoints locais vencidos (>24h) de qualquer
  // varredura antiga. Roda uma única vez por montagem, fora do caminho crítico.
  useEffect(() => {
    purgeStaleLocalCheckpoints();
  }, []);

  const handleHarvest = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setHarvesting(true);
    setHarvestProgress(null);
    try {
      const directMode = parsedRepos.length > 0;

      if (!directMode) {
        const result = await runHarvest({
          departments: Array.from(pickedDepts),
          minStars,
          maxRepos,
          filesPerRepo: 8,
          maxCandidates: 120,
        });
        toast.success('Varredura concluída', {
          description: `${result.found} candidatos encontrados, ${result.inserted} novos, ${result.rejected} rejeitados automaticamente.`,
        });
        if (result.errors.length > 0) {
          toast.warning(`${result.errors.length} consulta(s) falharam`, {
            description: result.errors[0],
          });
        }
        await load();
        return;
      }

      // Modo dirigido: monorepos com centenas de SKILL.md não cabem numa única
      // invocação (limite de tempo da Edge Function). Encadeamos lotes e
      // mostramos o progresso ao curador em vez de arriscar um timeout.
      let found = 0;
      let inserted = 0;
      let rejected = 0;
      const allErrors: string[] = [];

      // Retoma do último ponto conhecido em vez de reprocessar tudo — as
      // leituras já feitas consomem cota da API do GitHub sem gerar nada novo.
      const checkpoint = await loadHarvestCheckpoint(parsedRepos);
      if (checkpoint) {
        toast.info('Retomando varredura', {
          description: `Continuando a partir do arquivo ${checkpoint.offset}.`,
        });
      }

      const batches = await runHarvestAllBatches(
        {
          departments: Array.from(pickedDepts),
          minStars,
          maxRepos,
          repos: parsedRepos,
          filesPerRepo,
          fileOffset: checkpoint?.offset ?? 0,
          maxCandidates: Math.min(1000, filesPerRepo * parsedRepos.length),
        },
        {
          maxBatches: MAX_HARVEST_BATCHES,
          signal: controller.signal,
          onBatch: (batch: HarvestBatchResult, index: number) => {
            found += batch.found;
            inserted += batch.inserted;
            rejected += batch.rejected;
            allErrors.push(...batch.errors);
            const total = Object.values(batch.repoFileTotals).reduce<number>(
              (acc, n) => Math.max(acc, Number(n) || 0),
              0,
            );

            setHarvestProgress({
              batch: index + 1,
              processed: batch.nextFileOffset,
              total,
              inserted,
            });
          },
          onBatchError: (error, attempt, willRetry) => {
            allErrors.push(error.message);
            if (willRetry) {
              toast.warning(`Lote falhou (tentativa ${attempt}) — retentando`, {
                description: error.message.slice(0, 160),
              });
            }
          },
          onCheckpoint: (offset, total) => {
            void saveHarvestCheckpoint(parsedRepos, offset, total);
          },
        },
      );

      const last = batches[batches.length - 1];
      const incomplete = Boolean(last?.truncated) || controller.signal.aborted;

      // Sem pendências: o checkpoint deixa de valer e precisa sair do storage,
      // senão a próxima varredura do mesmo repo começaria no fim da lista.
      if (!incomplete) await clearHarvestCheckpoint(parsedRepos);
      else if (last) await saveHarvestCheckpoint(parsedRepos, last.nextFileOffset);
      setCheckpointsToken((n) => n + 1);

      if (controller.signal.aborted) {
        toast.info('Varredura interrompida', {
          description: `${inserted} novos candidatos gravados. O progresso foi salvo — rode de novo para continuar.`,
        });
      } else {
        toast.success(`Varredura concluída em ${batches.length} lote(s)`, {
          description: `${found} candidatos encontrados, ${inserted} novos, ${rejected} rejeitados automaticamente.`,
        });
      }
      if (incomplete && !controller.signal.aborted) {
        toast.warning('Varredura parcial', {
          description: 'Progresso salvo. Rode novamente para continuar exatamente de onde parou.',
        });
      }
      if (allErrors.length > 0) {
        toast.warning(`${allErrors.length} consulta(s) falharam`, { description: allErrors[0] });
      }
      await load();
    } catch (e) {
      toast.error('Falha ao executar a varredura', {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      abortRef.current = null;
      setHarvesting(false);
      setHarvestProgress(null);
    }
  };

  /**
   * Recalcula os vínculos automáticos entre os templates de agentes e as
   * skills do registry. Exige permissão de admin (garantida por RLS).
   */
  const handleRebuildLinks = async () => {
    setRebuilding(true);
    try {
      const result = await rebuildTemplateSkillLinks();
      toast.success(`${result.links} vínculos gravados em ${result.templates} templates`, {
        description: result.templatesWithoutLinks.length
          ? `Sem vínculo: ${result.templatesWithoutLinks.join(', ')}`
          : `${result.strongLinks} vínculos fortes`,
      });
    } catch (e) {
      toast.error('Falha ao recalcular os vínculos', {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setRebuilding(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulk = async (status: CandidateStatus) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    try {
      await bulkUpdateStatus(ids, status);
      toast.success(
        `${ids.length} candidato(s) marcados como ${STATUS_LABEL[status].toLowerCase()}`,
      );
      setSelected(new Set());
      await load();
    } catch (e) {
      toast.error('Falha na ação em lote', {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  };

  const handlePromote = async (candidate: HarvestCandidate) => {
    try {
      await promoteCandidate(candidate);
      toast.success(`"${candidate.name}" promovida para o registry`, {
        description: 'Criada como privada e não verificada — publique manualmente no marketplace.',
      });
      await load();
    } catch (e) {
      toast.error('Falha ao promover', { description: e instanceof Error ? e.message : undefined });
    }
  };

  const handleReclassify = async (candidate: HarvestCandidate, department: string) => {
    try {
      await updateCandidate(candidate.id, { department });
      toast.success(`Reclassificada para ${departmentLabel(department)}`);
      await load();
    } catch (e) {
      toast.error('Falha ao reclassificar', {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  };

  const stats = useMemo(
    () => ({
      total: candidates.length,
      blocked: candidates.filter((c) => c.status === 'auto_rejected').length,
      avgQuality: candidates.length
        ? Math.round(candidates.reduce((s, c) => s + c.quality_score, 0) / candidates.length)
        : 0,
    }),
    [candidates],
  );

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="Coleta de Skills"
        description="Varredura do GitHub, curadoria e promoção de skills por departamento."
        actions={
          <Button
            variant="outline"
            onClick={handleRebuildLinks}
            disabled={rebuilding}
            aria-label="Recalcular vínculos entre templates e skills"
          >
            {rebuilding ? 'Recalculando…' : 'Recalcular vínculos'}
          </Button>
        }
      />

      <Tabs defaultValue="queue" className="space-y-6">
        <TabsList>
          <TabsTrigger value="queue">Fila de curadoria</TabsTrigger>
          <TabsTrigger value="harvest">Executar varredura</TabsTrigger>
          <TabsTrigger value="coverage">Cobertura</TabsTrigger>
          <TabsTrigger value="runs">Histórico</TabsTrigger>
          <TabsTrigger value="curation">Curadoria recente</TabsTrigger>
          <TabsTrigger value="demand">Demanda</TabsTrigger>
        </TabsList>

        {/* ─── Fila */}
        <TabsContent value="queue" className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por nome, descrição ou repositório"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Buscar candidatos"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as CandidateStatus | 'all')}
            >
              <SelectTrigger className="w-[200px]" aria-label="Filtrar por status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {(Object.keys(STATUS_LABEL) as CandidateStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={deptFilter}
              onValueChange={(v) => setDeptFilter(v as SkillDepartment | 'all')}
            >
              <SelectTrigger className="w-[200px]" aria-label="Filtrar por departamento">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os departamentos</SelectItem>
                {SKILL_DEPARTMENTS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {DEPARTMENT_META[d].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
              Atualizar
            </Button>
          </div>

          {selected.size > 0 && (
            <Card className="border-primary/40">
              <CardContent className="flex flex-wrap items-center gap-3 py-3">
                <span className="text-body-sm font-medium">{selected.size} selecionado(s)</span>
                <Button size="sm" onClick={() => void handleBulk('approved')}>
                  <CheckCircle2 className="h-4 w-4" /> Aprovar
                </Button>
                <Button size="sm" variant="outline" onClick={() => void handleBulk('rejected')}>
                  <XCircle className="h-4 w-4" /> Rejeitar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                  Limpar
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Candidatos listados" value={stats.total} />
            <StatCard label="Bloqueados por política" value={stats.blocked} />
            <StatCard label="Qualidade média" value={stats.avgQuality} />
          </div>

          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : candidates.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center space-y-2">
                <Layers className="mx-auto h-10 w-10 text-muted-foreground" />
                <p className="font-medium">Nenhum candidato nesta visão</p>
                <p className="text-body-sm text-muted-foreground">
                  Execute uma varredura ou ajuste os filtros para ver resultados.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {candidates.map((c) => (
                <CandidateCard
                  key={c.id}
                  candidate={c}
                  selected={selected.has(c.id)}
                  onToggle={() => toggleSelect(c.id)}
                  onPromote={() => void handlePromote(c)}
                  onReclassify={(d) => void handleReclassify(c, d)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ─── Varredura */}
        <TabsContent value="harvest">
          <Card>
            <CardHeader>
              <CardTitle className="text-body">Configurar varredura no GitHub</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <Label className="mb-2 block">Departamentos (vazio = todos)</Label>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {SKILL_DEPARTMENTS.map((d) => (
                    <label key={d} className="flex items-center gap-2 text-body-sm cursor-pointer">
                      <Checkbox
                        checked={pickedDepts.has(d)}
                        onCheckedChange={() => {
                          setPickedDepts((prev) => {
                            const next = new Set(prev);
                            if (next.has(d)) next.delete(d);
                            else next.add(d);
                            return next;
                          });
                        }}
                      />
                      {DEPARTMENT_META[d].label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="minStars">Mínimo de estrelas</Label>
                  <Input
                    id="minStars"
                    type="number"
                    min={0}
                    max={100000}
                    value={minStars}
                    onChange={(e) => setMinStars(Math.max(0, Number(e.target.value) || 0))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="maxRepos">Máximo de repositórios</Label>
                  <Input
                    id="maxRepos"
                    type="number"
                    min={1}
                    max={200}
                    value={maxRepos}
                    onChange={(e) =>
                      setMaxRepos(Math.min(200, Math.max(1, Number(e.target.value) || 1)))
                    }
                  />
                </div>
              </div>

              <div className="space-y-1.5 rounded-lg border border-border/60 p-4">
                <Label htmlFor="repos">Monorepos dirigidos (opcional)</Label>
                <Textarea
                  id="repos"
                  rows={3}
                  placeholder={'sales-skills/sales\nhttps://github.com/owner/repo'}
                  value={reposInput}
                  onChange={(e) => setReposInput(e.target.value)}
                  className="font-mono text-body-sm"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setReposInput('sales-skills/sales')}
                  >
                    sales-skills/sales
                  </Button>
                  <span className="text-meta text-muted-foreground">
                    {parsedRepos.length > 0
                      ? `${parsedRepos.length} repositório(s) válido(s) — a busca por palavra-chave será ignorada.`
                      : 'Vazio = varredura normal por tópicos e departamentos.'}
                  </span>
                </div>
                {parsedRepos.length > 0 && (
                  <div className="space-y-1.5 pt-2">
                    <Label htmlFor="filesPerRepo">SKILL.md por lote (por repositório)</Label>
                    <Input
                      id="filesPerRepo"
                      type="number"
                      min={1}
                      max={1000}
                      value={filesPerRepo}
                      onChange={(e) =>
                        setFilesPerRepo(Math.min(1000, Math.max(1, Number(e.target.value) || 1)))
                      }
                    />
                    <span className="text-meta text-muted-foreground">
                      A varredura é encadeada automaticamente em até {MAX_HARVEST_BATCHES} lotes,
                      então um monorepo com centenas de skills é coberto sem estourar o tempo de
                      execução.
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  onClick={() => void handleHarvest()}
                  disabled={harvesting}
                  className="w-full sm:w-auto"
                >
                  {harvesting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {harvesting ? 'Varrendo o GitHub…' : 'Executar varredura'}
                </Button>

                {harvesting && (
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() => abortRef.current?.abort()}
                  >
                    Interromper
                  </Button>
                )}
              </div>

              {harvestProgress && (
                <div
                  className="space-y-1.5 rounded-md border border-border/60 bg-muted/30 p-3"
                  role="status"
                  aria-live="polite"
                >
                  <div className="flex items-center justify-between text-meta text-muted-foreground">
                    <span>
                      Lote {harvestProgress.batch} de até {MAX_HARVEST_BATCHES} ·{' '}
                      {harvestProgress.processed}
                      {harvestProgress.total > 0 ? ` / ${harvestProgress.total}` : ''} arquivos
                      lidos
                    </span>
                    <span>{harvestProgress.inserted} novos</span>
                  </div>
                  {harvestProgress.total > 0 && (
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-500"
                        style={{
                          width: `${Math.min(100, Math.round((harvestProgress.processed / harvestProgress.total) * 100))}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              <p className="text-meta text-muted-foreground">
                Skills com licença bloqueada, segredos embutidos ou padrões de prompt-injection são
                rejeitadas automaticamente e nunca chegam ao registry.
              </p>
            </CardContent>
          </Card>

          <HarvestCheckpointsCard
            className="mt-4"
            refreshToken={checkpointsToken}
            onResume={(repos) => {
              setReposInput(repos.join(', '));
              toast.info('Repositórios carregados', {
                description: 'Clique em varrer para continuar de onde parou.',
              });
            }}
          />
        </TabsContent>

        {/* ─── Cobertura */}
        <TabsContent value="coverage">
          <Card>
            <CardHeader>
              <CardTitle className="text-body">Skills por departamento</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {SKILL_DEPARTMENTS.map((d) => {
                const count = coverage[d] ?? 0;
                const below = count < COVERAGE_TARGET;
                return (
                  <div key={d} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-body-sm font-medium">{DEPARTMENT_META[d].label}</p>
                      <p className="text-meta text-muted-foreground">Meta: {COVERAGE_TARGET}</p>
                    </div>
                    <Badge variant={below ? 'destructive' : 'secondary'}>{count}</Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Histórico */}
        <TabsContent value="runs">
          <Card>
            <CardHeader>
              <CardTitle className="text-body">Execuções recentes</CardTitle>
            </CardHeader>
            <CardContent>
              {runs.length === 0 ? (
                <p className="py-8 text-center text-body-sm text-muted-foreground">
                  Nenhuma varredura executada ainda.
                </p>
              ) : (
                <ScrollArea className="max-h-[420px]">
                  <div className="space-y-2">
                    {runs.map((r) => (
                      <div key={r.id} className="rounded-lg border p-3 text-body-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={r.status === 'completed' ? 'secondary' : 'destructive'}>
                            {r.status}
                          </Badge>
                          <span className="text-muted-foreground">
                            {new Date(r.created_at).toLocaleString('pt-BR')}
                          </span>
                          <span className="ml-auto text-meta text-muted-foreground">
                            {r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : '—'}
                          </span>
                        </div>
                        <p className="mt-2 text-meta text-muted-foreground">
                          {r.repos_scanned} repositórios · {r.candidates_found} candidatos ·{' '}
                          {r.candidates_accepted} aceitos · {r.candidates_rejected} rejeitados
                        </p>
                        {r.error && (
                          <p className="mt-1 text-meta text-destructive line-clamp-2">{r.error}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Curadoria manual recente */}
        <TabsContent value="curation">
          <RecentCurationsPanel />
        </TabsContent>

        {/* ─── Demanda por skill (detecção de catálogo ocioso) */}
        <TabsContent value="demand">
          <SkillDemandPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-meta text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

interface CandidateCardProps {
  candidate: HarvestCandidate;
  selected: boolean;
  onToggle: () => void;
  onPromote: () => void;
  onReclassify: (department: string) => void;
}

function CandidateCard({
  candidate,
  selected,
  onToggle,
  onPromote,
  onReclassify,
}: CandidateCardProps) {
  const blocked = candidate.status === 'auto_rejected';
  return (
    <Card className={selected ? 'border-primary' : undefined}>
      <CardContent className="space-y-3 py-4">
        <div className="flex items-start gap-3">
          <Checkbox
            checked={selected}
            onCheckedChange={onToggle}
            aria-label={`Selecionar ${candidate.name}`}
            className="mt-1"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate font-medium">{candidate.name}</h3>
              <Badge variant="outline">{candidate.category}</Badge>
              {candidate.department && (
                <Badge variant="secondary">{departmentLabel(candidate.department)}</Badge>
              )}
              <Badge variant={blocked ? 'destructive' : 'outline'}>
                {STATUS_LABEL[candidate.status]}
              </Badge>
            </div>
            <p className="mt-1 line-clamp-2 text-body-sm text-muted-foreground">
              {candidate.description || 'Sem descrição.'}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-meta text-muted-foreground">
              <span className="flex items-center gap-1">
                <Star className="h-3 w-3" /> {candidate.stars}
              </span>
              <span>Qualidade {Math.round(candidate.quality_score)}</span>
              <span>Confiança {(candidate.department_confidence * 100).toFixed(0)}%</span>
              <span>{candidate.source_license ?? 'sem licença'}</span>
              <a
                href={candidate.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 underline-offset-2 hover:underline"
              >
                <ExternalLink className="h-3 w-3" /> {candidate.source_repo}
              </a>
            </div>
          </div>
        </div>

        {candidate.rejection_reasons.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-destructive/10 p-2">
            <ShieldAlert className="h-3.5 w-3.5 text-destructive" />
            {candidate.rejection_reasons.slice(0, 6).map((r) => (
              <Badge key={r} variant="destructive" className="text-meta">
                {r}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Select value={candidate.department ?? ''} onValueChange={onReclassify}>
            <SelectTrigger className="w-[200px]" aria-label={`Departamento de ${candidate.name}`}>
              <SelectValue placeholder="Classificar departamento" />
            </SelectTrigger>
            <SelectContent>
              {SKILL_DEPARTMENTS.map((d) => (
                <SelectItem key={d} value={d}>
                  {DEPARTMENT_META[d].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={onPromote}
            disabled={blocked || candidate.status === 'promoted'}
          >
            <CheckCircle2 className="h-4 w-4" />
            {candidate.status === 'promoted' ? 'Já promovida' : 'Promover ao registry'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
