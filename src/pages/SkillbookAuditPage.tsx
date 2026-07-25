/**
 * Skillbook Audit Page
 * Trilha completa de auditoria: quando cada skill foi aprendida ou instalada,
 * a confiança adquirida e o impacto nas execuções do agente.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  Brain,
  Package,
  TrendingUp,
  Activity,
  DollarSign,
  Zap,
  ShieldCheck,
  Sparkles,
  AlertCircle,
  Download as DownloadIcon,
  LineChart as LineChartIcon,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ResponsiveContainer,
  
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Area,
  ComposedChart,
} from 'recharts';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { EmptyState } from '@/components/shared/EmptyState';
import {
  fetchLearnedSkills,
  fetchInstalledSkills,
  fetchSkillbookImpact,
  fetchSkillbookTimeline,
  confidenceLabel,
  filterByPeriod,
  buildConfidenceSeries,
  toCsv,
  downloadCsv,
  type SkillbookTimelineEvent,
  type SkillbookPeriod,
} from '@/services/skillbookAuditService';
import { toast } from 'sonner';

const relTime = (iso: string) => formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR });

const confidenceColor = (c: number): string => {
  if (c < 0.4) return 'text-destructive';
  if (c < 0.7) return 'text-amber-500';
  if (c < 0.9) return 'text-nexus-cyan';
  return 'text-nexus-emerald';
};


export default function SkillbookAuditPage() {
  const [period, setPeriod] = useState<SkillbookPeriod>('30d');

  const learnedQuery = useQuery({ queryKey: ['skillbook-learned'], queryFn: () => fetchLearnedSkills(500) });
  const installedQuery = useQuery({ queryKey: ['skillbook-installed'], queryFn: () => fetchInstalledSkills(500) });
  const impactQuery = useQuery({ queryKey: ['skillbook-impact'], queryFn: fetchSkillbookImpact });
  const timelineQuery = useQuery({ queryKey: ['skillbook-timeline'], queryFn: () => fetchSkillbookTimeline(200) });

  const learnedAll = learnedQuery.data ?? [];
  const installedAll = installedQuery.data ?? [];
  const timelineAll = timelineQuery.data ?? [];

  const learned = useMemo(() => filterByPeriod(learnedAll, period, 'created_at'), [learnedAll, period]);
  const installed = useMemo(() => filterByPeriod(installedAll, period, 'installed_at'), [installedAll, period]);
  const timeline = useMemo(
    () =>
      timelineAll.filter((ev) => {
        const iso = ev.kind === 'learned' ? ev.created_at : ev.installed_at;
        const start =
          period === 'all'
            ? null
            : new Date(Date.now() - (period === '7d' ? 7 : period === '30d' ? 30 : 90) * 86400_000).toISOString();
        return !start || iso >= start;
      }),
    [timelineAll, period],
  );

  const confidenceSeries = useMemo(() => buildConfidenceSeries(learnedAll, period), [learnedAll, period]);

  const stats = useMemo(() => {
    const impact = impactQuery.data ?? [];
    const avgConfidence = learned.length ? learned.reduce((s, x) => s + x.confidence, 0) / learned.length : 0;
    const totalUses = learned.reduce((s, x) => s + x.totalUses, 0);
    const totalCost = impact.reduce((s, x) => s + x.totalCostUsd, 0);
    return { learned: learned.length, installed: installed.length, avgConfidence, totalUses, totalCost };
  }, [learned, installed, impactQuery.data]);

  const isLoading = learnedQuery.isLoading || installedQuery.isLoading || impactQuery.isLoading;

  const handleExportLearned = () => {
    if (learned.length === 0) {
      toast.info('Nada para exportar no período selecionado');
      return;
    }
    const csv = toCsv(
      learned.map((s) => ({
        skill: s.skill_name,
        agente: s.agent_name ?? '',
        confianca_pct: Math.round(s.confidence * 100),
        sucessos: s.success_count,
        falhas: s.failure_count,
        taxa_sucesso_pct: Math.round(s.successRate * 100),
        versao: s.version,
        aprendida_em: s.created_at,
      })),
      ['skill', 'agente', 'confianca_pct', 'sucessos', 'falhas', 'taxa_sucesso_pct', 'versao', 'aprendida_em'],
    );
    downloadCsv(`skillbook-aprendidas-${period}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast.success(`Exportadas ${learned.length} skills aprendidas`);
  };

  const handleExportInstalled = () => {
    if (installed.length === 0) {
      toast.info('Nada para exportar no período selecionado');
      return;
    }
    const csv = toCsv(
      installed.map((s) => ({
        skill: s.skill_name,
        agente: s.agent_name ?? '',
        categoria: s.skill_category ?? '',
        versao: s.skill_version ?? '',
        verificada: s.is_verified ? 'sim' : 'não',
        instalada_em: s.installed_at,
      })),
      ['skill', 'agente', 'categoria', 'versao', 'verificada', 'instalada_em'],
    );
    downloadCsv(`skillbook-instaladas-${period}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast.success(`Exportadas ${installed.length} skills instaladas`);
  };

  const handleExportImpact = () => {
    const impact = impactQuery.data ?? [];
    if (impact.length === 0) {
      toast.info('Sem dados de impacto para exportar');
      return;
    }
    const csv = toCsv(
      impact.map((row) => ({
        agente: row.agent_name ?? row.agent_id,
        aprendidas: row.learnedCount,
        instaladas: row.installedCount,
        confianca_media_pct: Math.round(row.avgConfidence * 100),
        execucoes: row.totalExecutions,
        latencia_media_ms: row.avgLatencyMs,
        taxa_erro_pct: Math.round(row.errorRate * 100),
        custo_usd: row.totalCostUsd.toFixed(4),
        ultima_atividade: row.lastActivity ?? '',
      })),
      [
        'agente',
        'aprendidas',
        'instaladas',
        'confianca_media_pct',
        'execucoes',
        'latencia_media_ms',
        'taxa_erro_pct',
        'custo_usd',
        'ultima_atividade',
      ],
    );
    downloadCsv(`skillbook-impacto-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast.success(`Exportado impacto de ${impact.length} agentes`);
  };

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="Auditoria do Skillbook"
        description="Trilha completa: quando cada skill foi aprendida ou instalada, a confiança adquirida e o impacto nas execuções"
      />

      {/* Filtros de período */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-meta text-muted-foreground">Período:</span>
          <ToggleGroup
            type="single"
            size="sm"
            value={period}
            onValueChange={(v) => v && setPeriod(v as SkillbookPeriod)}
          >
            <ToggleGroupItem value="7d">7 dias</ToggleGroupItem>
            <ToggleGroupItem value="30d">30 dias</ToggleGroupItem>
            <ToggleGroupItem value="90d">90 dias</ToggleGroupItem>
            <ToggleGroupItem value="all">Tudo</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-5">
        <KpiCard icon={Brain} label="Aprendidas" value={stats.learned} accent="text-nexus-purple" loading={isLoading} />
        <KpiCard icon={Package} label="Instaladas" value={stats.installed} accent="text-nexus-cyan" loading={isLoading} />
        <KpiCard
          icon={ShieldCheck}
          label="Confiança média"
          value={`${Math.round(stats.avgConfidence * 100)}%`}
          accent={confidenceColor(stats.avgConfidence)}
          loading={isLoading}
        />
        <KpiCard icon={Activity} label="Execuções acumuladas" value={stats.totalUses.toLocaleString('pt-BR')} accent="text-nexus-emerald" loading={isLoading} />
        <KpiCard
          icon={DollarSign}
          label="Custo total (USD)"
          value={`$${stats.totalCost.toFixed(2)}`}
          accent="text-amber-500"
          loading={isLoading}
          className="col-span-2 md:col-span-1"
        />
      </div>

      {/* Evolução da confiança */}
      <Card>
        <CardHeader>
          <CardTitle className="text-title-sm flex items-center gap-2">
            <LineChartIcon className="h-4 w-4 text-nexus-purple" /> Evolução da confiança
            <Badge variant="outline" className="text-meta ml-auto">
              {confidenceSeries.length} pontos
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : confidenceSeries.length === 0 ? (
            <EmptyState
              icon={LineChartIcon}
              title="Sem dados no período"
              description="Nenhuma skill aprendida no período selecionado. Amplie a janela para visualizar a evolução."
            />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={confidenceSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis
                  yAxisId="left"
                  domain={[0, 1]}
                  tick={{ fontSize: 11 }}
                  stroke="hsl(var(--muted-foreground))"
                  tickFormatter={(v) => `${Math.round(v * 100)}%`}
                />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value, name) => {
                    const num = typeof value === 'number' ? value : Number(value);
                    if (name === 'Confiança média') return [`${Math.round(num * 100)}%`, name];
                    return [num, name];
                  }}

                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="cumulativeLearned"
                  name="Total acumulado"
                  fill="hsl(var(--nexus-cyan) / 0.15)"
                  stroke="hsl(var(--nexus-cyan))"
                  strokeWidth={1.5}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="avgConfidence"
                  name="Confiança média"
                  stroke="hsl(var(--nexus-purple))"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="learnedCount"
                  name="Novas skills/dia"
                  stroke="hsl(var(--nexus-emerald))"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={{ r: 2 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="timeline" className="space-y-4">
        <TabsList>
          <TabsTrigger value="timeline" className="gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Linha do tempo</TabsTrigger>
          <TabsTrigger value="learned" className="gap-1.5"><Brain className="h-3.5 w-3.5" /> Aprendidas</TabsTrigger>
          <TabsTrigger value="installed" className="gap-1.5"><Package className="h-3.5 w-3.5" /> Instaladas</TabsTrigger>
          <TabsTrigger value="impact" className="gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> Impacto por agente</TabsTrigger>
        </TabsList>


        {/* TIMELINE */}
        <TabsContent value="timeline" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-title-sm flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" /> Eventos de aquisição
                <Badge variant="outline" className="text-meta ml-2">{timeline.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {timelineQuery.isLoading ? (
                <TimelineSkeleton />
              ) : timeline.length === 0 ? (
                <EmptyState icon={BookOpen} title="Nenhum evento no período" description="Assim que agentes aprenderem ou instalarem skills, os eventos aparecem aqui." />
              ) : (
                <ScrollArea className="h-[560px] pr-4">
                  <ol className="relative border-l border-border ml-2 space-y-4">
                    {timeline.map((ev) => (
                      <TimelineItem key={`${ev.kind}-${ev.id}`} event={ev} />
                    ))}
                  </ol>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* LEARNED */}
        <TabsContent value="learned" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-title-sm flex items-center gap-2">
                <Brain className="h-4 w-4 text-nexus-purple" /> Skills aprendidas (self-evolution)
                <Badge variant="outline" className="text-meta ml-2">{learned.length}</Badge>
              </CardTitle>
              <Button size="sm" variant="outline" onClick={handleExportLearned} disabled={learned.length === 0}>
                <DownloadIcon className="h-3.5 w-3.5 mr-1.5" /> Exportar CSV
              </Button>
            </CardHeader>
            <CardContent>
              {learnedQuery.isLoading ? (
                <TimelineSkeleton />
              ) : learned.length === 0 ? (
                <EmptyState icon={Brain} title="Sem skills aprendidas no período" description="Amplie o filtro ou aguarde os agentes gerarem padrões." />
              ) : (
                <div className="space-y-3">
                  {learned.map((s) => (
                    <div key={s.id} className="nexus-card">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-body-sm font-semibold truncate">{s.skill_name}</h3>
                            <Badge variant="outline" className="text-meta">v{s.version}</Badge>
                            {s.agent_name && <Badge variant="secondary" className="text-meta">{s.agent_name}</Badge>}
                          </div>
                          {s.description && <p className="text-meta text-muted-foreground line-clamp-2 mt-1">{s.description}</p>}
                          <p className="text-meta text-muted-foreground mt-1">Aprendida {relTime(s.created_at)}</p>
                        </div>
                        <div className="w-full sm:w-56 space-y-2">
                          <div className="flex items-center justify-between text-meta">
                            <span className="text-muted-foreground">Confiança</span>
                            <span className={`font-mono ${confidenceColor(s.confidence)}`}>
                              {Math.round(s.confidence * 100)}% · {confidenceLabel(s.confidence)}
                            </span>
                          </div>
                          <Progress value={s.confidence * 100} className="h-1.5" />
                          <div className="flex items-center justify-between text-meta">
                            <span className="text-muted-foreground">Uso</span>
                            <span className="font-mono">
                              <span className="text-nexus-emerald">{s.success_count}✓</span>
                              {' / '}
                              <span className="text-destructive">{s.failure_count}✗</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* INSTALLED */}
        <TabsContent value="installed" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-title-sm flex items-center gap-2">
                <Package className="h-4 w-4 text-nexus-cyan" /> Skills instaladas do registry
                <Badge variant="outline" className="text-meta ml-2">{installed.length}</Badge>
              </CardTitle>
              <Button size="sm" variant="outline" onClick={handleExportInstalled} disabled={installed.length === 0}>
                <DownloadIcon className="h-3.5 w-3.5 mr-1.5" /> Exportar CSV
              </Button>
            </CardHeader>
            <CardContent>
              {installedQuery.isLoading ? (
                <TimelineSkeleton />
              ) : installed.length === 0 ? (
                <EmptyState icon={Package} title="Sem instalações no período" description="Nenhum agente instalou skills do marketplace na janela selecionada." />
              ) : (
                <div className="space-y-2">
                  {installed.map((s) => (
                    <div key={s.id} className="nexus-card flex items-center justify-between gap-4 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-body-sm font-semibold truncate">{s.skill_name}</h3>
                          {s.skill_version && <Badge variant="outline" className="text-meta">v{s.skill_version}</Badge>}
                          {s.skill_category && <Badge variant="secondary" className="text-meta">{s.skill_category}</Badge>}
                          {s.is_verified && (
                            <Badge className="text-meta gap-1 bg-nexus-emerald/15 text-nexus-emerald border-nexus-emerald/30">
                              <ShieldCheck className="h-3 w-3" /> verificada
                            </Badge>
                          )}
                        </div>
                        <p className="text-meta text-muted-foreground mt-1">
                          {s.agent_name ?? 'Agente removido'} · instalada {relTime(s.installed_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* IMPACT */}
        <TabsContent value="impact" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-title-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-nexus-emerald" /> Impacto por agente
                <Badge variant="outline" className="text-meta ml-2">{(impactQuery.data ?? []).length}</Badge>
              </CardTitle>
              <Button size="sm" variant="outline" onClick={handleExportImpact} disabled={(impactQuery.data ?? []).length === 0}>
                <DownloadIcon className="h-3.5 w-3.5 mr-1.5" /> Exportar CSV
              </Button>
            </CardHeader>
            <CardContent>
              {impactQuery.isLoading ? (
                <TimelineSkeleton />
              ) : (impactQuery.data ?? []).length === 0 ? (
                <EmptyState icon={TrendingUp} title="Sem dados de impacto" description="Instale ou aprenda skills para começar a correlacionar com execuções." />
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {(impactQuery.data ?? []).map((row) => (
                    <div key={row.agent_id} className="nexus-card space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-body-sm font-semibold truncate">{row.agent_name ?? row.agent_id.slice(0, 8)}</h3>
                        {row.errorRate > 0.1 && (
                          <Badge variant="destructive" className="text-meta gap-1">
                            <AlertCircle className="h-3 w-3" /> erros altos
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-meta">
                        <Stat label="Aprendidas" value={row.learnedCount} icon={Brain} />
                        <Stat label="Instaladas" value={row.installedCount} icon={Package} />
                        <Stat label="Execuções" value={row.totalExecutions.toLocaleString('pt-BR')} icon={Activity} />
                        <Stat label="Latência" value={`${row.avgLatencyMs}ms`} icon={Zap} />
                        <Stat label="Confiança" value={`${Math.round(row.avgConfidence * 100)}%`} icon={ShieldCheck} />
                        <Stat label="Custo" value={`$${row.totalCostUsd.toFixed(2)}`} icon={DollarSign} />
                      </div>
                      {row.lastActivity && (
                        <p className="text-meta text-muted-foreground">Última atividade: {row.lastActivity}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}


interface KpiCardProps {
  icon: React.ElementType;
  label: string;
  value: number | string;
  accent: string;
  loading?: boolean;
  className?: string;
}
function KpiCard({ icon: Icon, label, value, accent, loading, className }: KpiCardProps) {
  return (
    <Card className={className}>
      <CardContent className="pt-6 space-y-1">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${accent}`} />
          <span className="text-meta text-muted-foreground">{label}</span>
        </div>
        {loading ? (
          <Skeleton className="h-7 w-20" />
        ) : (
          <p className={`text-title font-bold font-mono ${accent}`}>{value}</p>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string | number; icon: React.ElementType }) {
  return (
    <div className="flex items-center justify-between px-2 py-1.5 rounded bg-secondary/40">
      <span className="flex items-center gap-1 text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function TimelineItem({ event }: { event: SkillbookTimelineEvent }) {
  const isLearned = event.kind === 'learned';
  const Icon = isLearned ? Brain : Package;
  const accent = isLearned ? 'text-nexus-purple bg-nexus-purple/15 border-nexus-purple/30' : 'text-nexus-cyan bg-nexus-cyan/15 border-nexus-cyan/30';
  const when = isLearned ? event.created_at : event.installed_at;
  const skillName = isLearned ? event.skill_name : event.skill_name;

  return (
    <li className="ml-4">
      <span className={`absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full border ${accent}`}>
        <Icon className="h-2.5 w-2.5" />
      </span>
      <div className="nexus-card">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={`text-meta ${isLearned ? 'text-nexus-purple' : 'text-nexus-cyan'}`}>
                {isLearned ? 'Aprendida' : 'Instalada'}
              </Badge>
              <h4 className="text-body-sm font-semibold truncate">{skillName}</h4>
              {event.agent_name && <span className="text-meta text-muted-foreground">· {event.agent_name}</span>}
            </div>
            {isLearned && event.description && (
              <p className="text-meta text-muted-foreground line-clamp-2 mt-1">{event.description}</p>
            )}
            <p className="text-meta text-muted-foreground mt-1">{relTime(when)}</p>
          </div>
          {isLearned && (
            <div className="text-right">
              <p className={`text-meta font-mono ${confidenceColor(event.confidence)}`}>
                {Math.round(event.confidence * 100)}%
              </p>
              <p className="text-meta text-muted-foreground">
                {event.success_count}✓ / {event.failure_count}✗
              </p>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function TimelineSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full" />
      ))}
    </div>
  );
}
