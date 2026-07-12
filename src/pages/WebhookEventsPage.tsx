import { useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RefreshCw, ShieldAlert, KeyRound, Zap, Info, Eye } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

type WebhookEvent = {
  id: string;
  webhook_id: string | null;
  method: string;
  headers: Record<string, unknown> | null;
  query_params: Record<string, unknown> | null;
  body: unknown;
  source_ip: string | null;
  status: string;
  response_code: number | null;
  created_at: string;
};

type IdempotencyKey = {
  id: string;
  key: string;
  status_code: number;
  response_body: unknown;
  created_at: string;
  expires_at: string;
};

type BlockedLog = {
  id: string;
  ip_address: string | null;
  country_code: string | null;
  reason: string;
  user_agent: string | null;
  created_at: string;
};

const timeAgo = (iso: string) =>
  formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR });

const statusColor = (code: number | null) => {
  if (code === null) return "text-muted-foreground border-muted";
  if (code >= 200 && code < 300) return "text-emerald-500 border-emerald-500/40";
  if (code >= 400 && code < 500) return "text-amber-500 border-amber-500/40";
  if (code >= 500) return "text-destructive border-destructive/40";
  return "text-muted-foreground border-muted";
};

export default function WebhookEventsPage() {
  const [selectedEvent, setSelectedEvent] = useState<WebhookEvent | null>(null);

  const events = useQuery({
    queryKey: ["webhook-events", "recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webhook_events" as never)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as WebhookEvent[];
    },
    refetchInterval: 15_000,
  });

  const idem = useQuery({
    queryKey: ["webhook-events", "idempotency"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("idempotency_keys" as never)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as IdempotencyKey[];
    },
    refetchInterval: 30_000,
  });

  const blocked = useQuery({
    queryKey: ["webhook-events", "blocked"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("access_blocked_log" as never)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as BlockedLog[];
    },
    refetchInterval: 30_000,
  });

  const refetchAll = () => {
    events.refetch();
    idem.refetch();
    blocked.refetch();
  };

  const eventList = events.data ?? [];
  const idemList = idem.data ?? [];
  const blockedList = blocked.data ?? [];

  const failures = eventList.filter(
    (e) => (e.response_code ?? 200) >= 400 || e.status === "failed"
  ).length;

  const kpi = (label: string, value: React.ReactNode, icon: React.ReactNode) => (
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

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="Eventos de Webhook"
        description="Inspeção em tempo real de eventos recebidos, chaves de idempotência e bloqueios de acesso."
        actions={
          <Button variant="outline" onClick={refetchAll}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {kpi(
          "Eventos recentes",
          `${eventList.length} • ${failures} falhas`,
          <Zap className="h-4 w-4 text-primary" />
        )}
        {kpi(
          "Chaves de idempotência",
          idemList.length,
          <KeyRound className="h-4 w-4 text-primary" />
        )}
        {kpi(
          "Acessos bloqueados",
          blockedList.length,
          <ShieldAlert className="h-4 w-4 text-destructive" />
        )}
      </div>

      <Tabs defaultValue="events" className="w-full">
        <TabsList>
          <TabsTrigger value="events">Eventos</TabsTrigger>
          <TabsTrigger value="idempotency">Idempotência</TabsTrigger>
          <TabsTrigger value="blocked">Bloqueios</TabsTrigger>
        </TabsList>

        <TabsContent value="events">
          <Card>
            <CardHeader>
              <CardTitle>Últimos 100 eventos</CardTitle>
            </CardHeader>
            <CardContent>
              {events.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : eventList.length === 0 ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Nenhum evento recebido</AlertTitle>
                  <AlertDescription>
                    Configure endpoints em <b>Webhooks</b> para começar a receber eventos.
                  </AlertDescription>
                </Alert>
              ) : (
                <ScrollArea className="h-[520px] pr-3">
                  <div className="space-y-2">
                    {eventList.map((e) => (
                      <button
                        key={e.id}
                        onClick={() => setSelectedEvent(e)}
                        className="w-full text-left p-3 border rounded-lg bg-card hover:bg-accent/30 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">{e.method}</Badge>
                            <Badge variant="outline" className={statusColor(e.response_code)}>
                              {e.response_code ?? e.status}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              webhook {e.webhook_id?.slice(0, 8) ?? "—"}…
                            </span>
                          </div>
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span>{timeAgo(e.created_at)}</span>
                          {e.source_ip && <span>de {e.source_ip}</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="idempotency">
          <Card>
            <CardHeader>
              <CardTitle>Chaves ativas</CardTitle>
            </CardHeader>
            <CardContent>
              {idem.isLoading ? (
                <Skeleton className="h-80 w-full" />
              ) : idemList.length === 0 ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Sem chaves registradas</AlertTitle>
                  <AlertDescription>
                    Chaves de idempotência são criadas automaticamente por integrações que suportam retries.
                  </AlertDescription>
                </Alert>
              ) : (
                <ScrollArea className="h-[520px] pr-3">
                  <div className="space-y-2">
                    {idemList.map((k) => (
                      <div
                        key={k.id}
                        className="p-3 border rounded-lg bg-card hover:bg-accent/30 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="font-mono text-xs truncate max-w-[60%]">
                            {k.key}
                          </span>
                          <Badge variant="outline" className={statusColor(k.status_code)}>
                            {k.status_code}
                          </Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span>Criada {timeAgo(k.created_at)}</span>
                          <span>Expira {timeAgo(k.expires_at)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="blocked">
          <Card>
            <CardHeader>
              <CardTitle>Acessos bloqueados</CardTitle>
            </CardHeader>
            <CardContent>
              {blocked.isLoading ? (
                <Skeleton className="h-80 w-full" />
              ) : blockedList.length === 0 ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Nenhum bloqueio recente</AlertTitle>
                  <AlertDescription>
                    Bloqueios são registrados por IP whitelist, restrições geográficas ou rate limits.
                  </AlertDescription>
                </Alert>
              ) : (
                <ScrollArea className="h-[520px] pr-3">
                  <div className="space-y-2">
                    {blockedList.map((b) => (
                      <div
                        key={b.id}
                        className="p-3 border rounded-lg bg-card hover:bg-accent/30 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className="text-destructive border-destructive/40"
                            >
                              <ShieldAlert className="h-3 w-3 mr-1" />
                              {b.reason}
                            </Badge>
                            {b.country_code && (
                              <Badge variant="secondary">{b.country_code}</Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {timeAgo(b.created_at)}
                          </span>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground space-y-1">
                          {b.ip_address && <div>IP: {b.ip_address}</div>}
                          {b.user_agent && (
                            <div className="truncate">UA: {b.user_agent}</div>
                          )}
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

      <Dialog open={!!selectedEvent} onOpenChange={(o) => !o && setSelectedEvent(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Detalhes do evento</DialogTitle>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-muted-foreground text-xs">Método</div>
                  <div className="font-mono">{selectedEvent.method}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Status</div>
                  <div className="font-mono">
                    {selectedEvent.response_code ?? selectedEvent.status}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Origem</div>
                  <div className="font-mono">{selectedEvent.source_ip ?? "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Recebido</div>
                  <div>{timeAgo(selectedEvent.created_at)}</div>
                </div>
              </div>

              <div>
                <div className="text-muted-foreground text-xs mb-1">Headers</div>
                <ScrollArea className="h-32 rounded border bg-muted/30 p-2">
                  <pre className="text-xs">
                    {JSON.stringify(selectedEvent.headers ?? {}, null, 2)}
                  </pre>
                </ScrollArea>
              </div>

              <div>
                <div className="text-muted-foreground text-xs mb-1">Query params</div>
                <ScrollArea className="h-24 rounded border bg-muted/30 p-2">
                  <pre className="text-xs">
                    {JSON.stringify(selectedEvent.query_params ?? {}, null, 2)}
                  </pre>
                </ScrollArea>
              </div>

              <div>
                <div className="text-muted-foreground text-xs mb-1">Body</div>
                <ScrollArea className="h-48 rounded border bg-muted/30 p-2">
                  <pre className="text-xs">
                    {JSON.stringify(selectedEvent.body ?? {}, null, 2)}
                  </pre>
                </ScrollArea>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
