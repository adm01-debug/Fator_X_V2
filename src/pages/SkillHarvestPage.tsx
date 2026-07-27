/**
 * SkillHarvestPage — curadoria das skills coletadas no GitHub.
 *
 * Rota: /skills/harvest (restrita a administradores de workspace).
 * A varredura roda server-side; aqui o admin aprova, rejeita, reclassifica
 * e promove candidatos para o registry.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Download, RefreshCw, Loader2, CheckCircle2, XCircle, Star,
  ShieldAlert, ExternalLink, Search, Layers,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  SKILL_DEPARTMENTS, DEPARTMENT_META, departmentLabel, type SkillDepartment,
} from '@/config/skill-departments';
import {
  runHarvest, listCandidates, listRuns, promoteCandidate, bulkUpdateStatus,
  updateCandidate, getDepartmentCoverage,
  type HarvestCandidate, type HarvestRun, type CandidateStatus,
} from '@/services/skillHarvestService';

const STATUS_LABEL: Record<CandidateStatus, string> = {
  pending: 'Pendente',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
  auto_rejected: 'Rejeitado automaticamente',
  promoted: 'Promovido',
};

const COVERAGE_TARGET = 5;

export default function SkillHarvestPage() {
  const [candidates, setCandidates] = useState<HarvestCandidate[]>([]);
  const [runs, setRuns] = useState<HarvestRun[]>([]);
  const [coverage, setCoverage] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [harvesting, setHarvesting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [statusFilter, setStatusFilter] = useState<CandidateStatus | 'all'>('pending');
  const [deptFilter, setDeptFilter] = useState<SkillDepartment | 'all'>('all');
  const [search, setSearch] = useState('');

  const [pickedDepts, setPickedDepts] = useState<Set<SkillDepartment>>(new Set());
  const [minStars, setMinStars] = useState(3);
  const [maxRepos, setMaxRepos] = useState(40);

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

  useEffect(() => { void load(); }, [load]);

  const handleHarvest = async () => {
    setHarvesting(true);
    try {
      const result = await runHarvest({
        departments: Array.from(pickedDepts),
        minStars,
        maxRepos,
      });
      toast.success('Varredura concluída', {
        description: `${result.found} candidatos encontrados, ${result.inserted} novos, ${result.rejected} rejeitados automaticamente.`,
      });
      if (result.errors.length > 0) {
        toast.warning(`${result.errors.length} consulta(s) falharam`, { description: result.errors[0] });
      }
      await load();
    } catch (e) {
      toast.error('Falha ao executar a varredura', {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setHarvesting(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulk = async (status: CandidateStatus) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    try {
      await bulkUpdateStatus(ids, status);
      toast.success(`${ids.length} candidato(s) marcados como ${STATUS_LABEL[status].toLowerCase()}`);
      setSelected(new Set());
      await load();
    } catch (e) {
      toast.error('Falha na ação em lote', { description: e instanceof Error ? e.message : undefined });
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
      toast.error('Falha ao reclassificar', { description: e instanceof Error ? e.message : undefined });
    }
  };

  const stats = useMemo(() => ({
    total: candidates.length,
    blocked: candidates.filter((c) => c.status === 'auto_rejected').length,
    avgQuality: candidates.length
      ? Math.round(candidates.reduce((s, c) => s + c.quality_score, 0) / candidates.length)
      : 0,
  }), [candidates]);

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
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as CandidateStatus | 'all')}>
              <SelectTrigger className="w-[200px]" aria-label="Filtrar por status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {(Object.keys(STATUS_LABEL) as CandidateStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={deptFilter} onValueChange={(v) => setDeptFilter(v as SkillDepartment | 'all')}>
              <SelectTrigger className="w-[200px]" aria-label="Filtrar por departamento">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os departamentos</SelectItem>
                {SKILL_DEPARTMENTS.map((d) => (
                  <SelectItem key={d} value={d}>{DEPARTMENT_META[d].label}</SelectItem>
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
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Limpar</Button>
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
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
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
                            if (next.has(d)) next.delete(d); else next.add(d);
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
                    id="minStars" type="number" min={0} max={100000} value={minStars}
                    onChange={(e) => setMinStars(Math.max(0, Number(e.target.value) || 0))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="maxRepos">Máximo de repositórios</Label>
                  <Input
                    id="maxRepos" type="number" min={1} max={200} value={maxRepos}
                    onChange={(e) => setMaxRepos(Math.min(200, Math.max(1, Number(e.target.value) || 1)))}
                  />
                </div>
              </div>

              <Button onClick={() => void handleHarvest()} disabled={harvesting} className="w-full sm:w-auto">
                {harvesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {harvesting ? 'Varrendo o GitHub…' : 'Executar varredura'}
              </Button>

              <p className="text-meta text-muted-foreground">
                Skills com licença bloqueada, segredos embutidos ou padrões de prompt-injection são
                rejeitadas automaticamente e nunca chegam ao registry.
              </p>
            </CardContent>
          </Card>
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
                  <div
                    key={d}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
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

function CandidateCard({ candidate, selected, onToggle, onPromote, onReclassify }: CandidateCardProps) {
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
              <Badge key={r} variant="destructive" className="text-meta">{r}</Badge>
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
                <SelectItem key={d} value={d}>{DEPARTMENT_META[d].label}</SelectItem>
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
