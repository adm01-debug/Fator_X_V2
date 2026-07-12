import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { RefreshCw, CheckCircle2, XCircle, Clock, Activity, Info } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

type RetentionRun = {
  id: string;
  job_name: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  partitions_dropped: number | null;
  status: string;
  error_message: string | null;
};

type AutomationLog = {
  id: string;
  rule_id: string | null;
  status: string;
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
};

type PgNetRun = {
  id: string;
  run_at: string;
  target_url: string;
  status_code: number | null;
  latency_ms: number | null;
  succeeded: boolean;
  error_msg: string | null;
};

type EntityLog = {
  id: string;
  primary_entity_id: string;
  merged_entity_id: string;
  resolution_method: string;
  confidence: number;
  created_at: string;
};

type CronJobHealth = {
  jobid: number;
  jobname: string;
  schedule: string;
  active: boolean;
  last_run_at: string | null;
  last_status: string | null;
  last_duration_ms: number | null;
  runs_20: number;
  success_20: number;
  failure_20: number;
  success_rate: number | null;
  avg_duration_ms: number | null;
};

const statusBadge = (status: string) => {
  const s = status.toLowerCase();
  if (s.includes("success") || s.includes("complet") || s === "ok") {
    return (
      <Badge variant="outline" className="text-nexus-emerald border-nexus-emerald/40">
        <CheckCircle2 className="h-3 w-3 mr-1" /> {status}
      </Badge>
    );
  }
  if (s.includes("fail") || s.includes("error")) {
    return (
      <Badge variant="outline" className="text-destructive border-destructive/40">
        <XCircle className="h-3 w-3 mr-1" /> {status}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-nexus-amber border-nexus-amber/40">
      <Clock className="h-3 w-3 mr-1" /> {status}
    </Badge>
  );
};

const timeAgo = (iso: string | null) =>
  iso ? formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR }) : "—";

export default function SystemJobsPage() {
  const retention = useQuery({
    queryKey: ["system-jobs", "retention"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("retention_job_runs" as never)
        .select("*")
        .order("started_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as RetentionRun[];
    },
    refetchInterval: 30_000,
  });

  const automation = useQuery({
    queryKey: ["system-jobs", "automation"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automation_logs" as never)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as AutomationLog[];
    },
    refetchInterval: 30_000,
  });

  const pgnet = useQuery({
    queryKey: ["system-jobs", "pgnet"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pg_net_smoke_runs" as never)
        .select("*")
        .order("run_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as PgNetRun[];
    },
    refetchInterval: 30_000,
  });

  const entity = useQuery({
    queryKey: ["system-jobs", "entity"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entity_resolution_logs" as never)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as EntityLog[];
    },
    refetchInterval: 60_000,
  });

  const cron = useQuery({
    queryKey: ["system-jobs", "cron"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_cron_job_health" as never);
      if (error) throw error;
      return (data ?? []) as unknown as CronJobHealth[];
    },
    refetchInterval: 30_000,
  });

  const refetchAll = () => {
    retention.refetch();
    automation.refetch();
    pgnet.refetch();
    entity.refetch();
    cron.refetch();
  };

  const cronJobs = cron.data ?? [];
  const cronFails = cronJobs.filter((c) => c.last_status && c.last_status !== "succeeded").length;

  const kpi = (label: string, value: number | string, icon: React.ReactNode) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );

  const retentionRuns = retention.data ?? [];
  const automationRuns = automation.data ?? [];
  const pgnetRuns = pgnet.data ?? [];
  const entityRuns = entity.data ?? [];

  const retentionFails = retentionRuns.filter((r) =>
    (r.status ?? "").toLowerCase().includes("fail")
  ).length;
  const pgnetFails = pgnetRuns.filter((r) => !r.succeeded).length;
  const automationFails = automationRuns.filter((r) =>
    (r.status ?? "").toLowerCase().includes("fail")
  ).length;

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="Jobs de Sistema"
        description="Observabilidade unificada de retenção de dados, automações agendadas, smoke tests de pg_net e resolução de entidades."
        actions={
          <Button variant="outline" onClick={refetchAll}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar tudo
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {kpi(
          "pg_cron jobs",
          `${cronJobs.length} • ${cronFails} falhas`,
          <Activity className="h-4 w-4 text-primary" />
        )}
        {kpi(
          "Retenção (últimas 50)",
          `${retentionRuns.length} • ${retentionFails} falhas`,
          <Activity className="h-4 w-4 text-primary" />
        )}
        {kpi(
          "Automações (últimas 50)",
          `${automationRuns.length} • ${automationFails} falhas`,
          <Activity className="h-4 w-4 text-primary" />
        )}
        {kpi(
          "pg_net smoke",
          `${pgnetRuns.length} • ${pgnetFails} falhas`,
          <Activity className="h-4 w-4 text-primary" />
        )}
        {kpi(
          "Resoluções de entidade",
          entityRuns.length,
          <Activity className="h-4 w-4 text-primary" />
        )}
      </div>

      <Tabs defaultValue="cron" className="w-full">
        <TabsList>
          <TabsTrigger value="cron">pg_cron</TabsTrigger>
          <TabsTrigger value="retention">Retenção</TabsTrigger>
          <TabsTrigger value="automation">Automações</TabsTrigger>
          <TabsTrigger value="pgnet">pg_net</TabsTrigger>
          <TabsTrigger value="entity">Entidades</TabsTrigger>
        </TabsList>

        <TabsContent value="cron">
          <Card>
            <CardHeader>
              <CardTitle>Saúde dos jobs agendados (pg_cron)</CardTitle>
            </CardHeader>
            <CardContent>
              {cron.isLoading ? (
                <Skeleton className="h-80 w-full" />
              ) : cronJobs.length === 0 ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Nenhum job agendado</AlertTitle>
                  <AlertDescription>
                    Requer permissão de administrador para visualizar. Se você é admin, aguarde a primeira execução.
                  </AlertDescription>
                </Alert>
              ) : (
                <ScrollArea className="h-[520px] pr-3">
                  <div className="space-y-2">
                    {cronJobs.map((c) => {
                      const rate = c.success_rate;
                      const rateColor =
                        rate === null
                          ? "text-muted-foreground border-muted"
                          : rate >= 95
                          ? "text-nexus-emerald border-nexus-emerald/40"
                          : rate >= 80
                          ? "text-nexus-amber border-nexus-amber/40"
                          : "text-destructive border-destructive/40";
                      return (
                        <div
                          key={c.jobid}
                          className="p-3 border rounded-lg bg-card hover:bg-accent/30 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{c.jobname}</span>
                              <Badge variant="secondary" className="font-mono text-[10px]">
                                {c.schedule}
                              </Badge>
                              {!c.active && <Badge variant="outline">inativo</Badge>}
                            </div>
                            <div className="flex items-center gap-2">
                              {c.last_status && statusBadge(c.last_status)}
                              <Badge variant="outline" className={rateColor}>
                                {rate === null ? "sem dados" : `${rate}% ok`}
                              </Badge>
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                            <span>Última: {timeAgo(c.last_run_at)}</span>
                            <span>Duração última: {c.last_duration_ms ?? "—"} ms</span>
                            <span>Média (20): {c.avg_duration_ms ? Number(c.avg_duration_ms).toFixed(0) : "—"} ms</span>
                            <span>
                              20 execs: {c.success_20} ok • {c.failure_20} falhas
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>


        <TabsContent value="retention">
          <Card>
            <CardHeader>
              <CardTitle>Execuções de retenção</CardTitle>
            </CardHeader>
            <CardContent>
              {retention.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : retentionRuns.length === 0 ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Sem execuções recentes</AlertTitle>
                  <AlertDescription>
                    Os jobs de retenção são disparados via pg_cron. Aguarde a próxima janela agendada.
                  </AlertDescription>
                </Alert>
              ) : (
                <ScrollArea className="h-[520px] pr-3">
                  <div className="space-y-2">
                    {retentionRuns.map((r) => (
                      <div
                        key={r.id}
                        className="p-3 border rounded-lg bg-card hover:bg-accent/30 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="font-medium text-sm">{r.job_name}</span>
                          {statusBadge(r.status)}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span>Iniciado {timeAgo(r.started_at)}</span>
                          <span>Duração: {r.duration_ms ?? "—"} ms</span>
                          <span>Partições removidas: {r.partitions_dropped ?? 0}</span>
                        </div>
                        {r.error_message && (
                          <p className="mt-2 text-xs text-destructive break-words">
                            {r.error_message}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="automation">
          <Card>
            <CardHeader>
              <CardTitle>Execuções de automações</CardTitle>
            </CardHeader>
            <CardContent>
              {automation.isLoading ? (
                <Skeleton className="h-80 w-full" />
              ) : automationRuns.length === 0 ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Nenhum log de automação</AlertTitle>
                  <AlertDescription>
                    Configure regras em <b>Automações</b> para começar a registrar execuções aqui.
                  </AlertDescription>
                </Alert>
              ) : (
                <ScrollArea className="h-[520px] pr-3">
                  <div className="space-y-2">
                    {automationRuns.map((a) => (
                      <div
                        key={a.id}
                        className="p-3 border rounded-lg bg-card hover:bg-accent/30 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="font-medium text-sm">
                            Regra {a.rule_id?.slice(0, 8) ?? "—"}…
                          </span>
                          {statusBadge(a.status)}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span>{timeAgo(a.created_at)}</span>
                          <span>Duração: {a.duration_ms ?? "—"} ms</span>
                        </div>
                        {a.error_message && (
                          <p className="mt-2 text-xs text-destructive break-words">
                            {a.error_message}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pgnet">
          <Card>
            <CardHeader>
              <CardTitle>Smoke tests de pg_net</CardTitle>
            </CardHeader>
            <CardContent>
              {pgnet.isLoading ? (
                <Skeleton className="h-80 w-full" />
              ) : pgnetRuns.length === 0 ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Nenhum smoke test registrado</AlertTitle>
                  <AlertDescription>
                    O job de verificação de pg_net roda automaticamente. Aguarde a próxima execução.
                  </AlertDescription>
                </Alert>
              ) : (
                <ScrollArea className="h-[520px] pr-3">
                  <div className="space-y-2">
                    {pgnetRuns.map((p) => (
                      <div
                        key={p.id}
                        className="p-3 border rounded-lg bg-card hover:bg-accent/30 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">{p.target_url}</span>
                          {p.succeeded ? (
                            <Badge
                              variant="outline"
                              className="text-nexus-emerald border-nexus-emerald/40"
                            >
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              {p.status_code ?? "OK"}
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-destructive border-destructive/40"
                            >
                              <XCircle className="h-3 w-3 mr-1" />
                              {p.status_code ?? "falha"}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span>{timeAgo(p.run_at)}</span>
                          <span>Latência: {p.latency_ms ?? "—"} ms</span>
                        </div>
                        {p.error_msg && (
                          <p className="mt-2 text-xs text-destructive break-words">
                            {p.error_msg}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="entity">
          <Card>
            <CardHeader>
              <CardTitle>Resoluções de entidade</CardTitle>
            </CardHeader>
            <CardContent>
              {entity.isLoading ? (
                <Skeleton className="h-80 w-full" />
              ) : entityRuns.length === 0 ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Sem resoluções registradas</AlertTitle>
                  <AlertDescription>
                    Utilize o SuperCérebro para mesclar entidades e registrar decisões aqui.
                  </AlertDescription>
                </Alert>
              ) : (
                <ScrollArea className="h-[520px] pr-3">
                  <div className="space-y-2">
                    {entityRuns.map((e) => (
                      <div
                        key={e.id}
                        className="p-3 border rounded-lg bg-card hover:bg-accent/30 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="font-medium text-sm">
                            {e.primary_entity_id.slice(0, 8)}… ← {e.merged_entity_id.slice(0, 8)}…
                          </span>
                          <Badge variant="secondary">{e.resolution_method}</Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span>{timeAgo(e.created_at)}</span>
                          <span>Confiança: {(e.confidence * 100).toFixed(1)}%</span>
                        </div>
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
