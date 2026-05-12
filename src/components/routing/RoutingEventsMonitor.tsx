import { useQuery } from "@tanstack/react-query";
import { listRecentBitrix24Events } from "@/services/bitrix24WebhookService";
import { listRecentWhatsAppEvents } from "@/services/whatsappWebhookService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, AlertCircle, XCircle, Loader2, Building2, MessageCircle, Clock, Zap } from "lucide-react";

export function RoutingEventsMonitor() {
  const { data: bitrixEvents = [], isLoading: loadingBitrix } = useQuery({
    queryKey: ["bitrix24_webhook_events_routing"],
    queryFn: () => listRecentBitrix24Events(20),
    refetchInterval: 10000,
  });

  const { data: whatsappEvents = [], isLoading: loadingWhatsApp } = useQuery({
    queryKey: ["whatsapp_webhook_events_routing"],
    queryFn: () => listRecentWhatsAppEvents(20),
    refetchInterval: 10000,
  });

  const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
    routed: { label: "Roteado", color: "text-nexus-emerald bg-nexus-emerald/10 border-nexus-emerald/20", icon: CheckCircle2 },
    no_route: { label: "Sem rota", color: "text-muted-foreground bg-muted/10 border-border/20", icon: AlertCircle },
    failed: { label: "Falhou", color: "text-destructive bg-destructive/10 border-destructive/20", icon: XCircle },
    invalid_signature: { label: "Assinatura inválida", color: "text-destructive bg-destructive/10 border-destructive/20", icon: XCircle },
    pending: { label: "Pendente", color: "text-nexus-amber bg-nexus-amber/10 border-nexus-amber/20", icon: Loader2 },
  };

  return (
    <Card className="nexus-card overflow-hidden">
      <CardHeader className="bg-muted/30 border-b border-border/40 py-4 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          Live Webhook Feed
        </CardTitle>
        <Badge variant="outline" className="bg-nexus-emerald/5 text-nexus-emerald border-nexus-emerald/20 gap-1.5 py-0.5 px-2 text-[9px]">
          <Zap className="h-3 w-3 animate-pulse" /> Real-time
        </Badge>
      </CardHeader>
      <CardContent className="p-0">
        <Tabs defaultValue="bitrix24" className="w-full">
          <TabsList className="w-full justify-start rounded-none border-b border-border/40 bg-transparent px-4 h-11">
            <TabsTrigger value="bitrix24" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-11 px-4 gap-2 text-xs font-bold">
              <Building2 className="h-3.5 w-3.5" /> Bitrix24
            </TabsTrigger>
            <TabsTrigger value="whatsapp" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-11 px-4 gap-2 text-xs font-bold">
              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
            </TabsTrigger>
          </TabsList>

          <TabsContent value="bitrix24" className="p-0 m-0">
            {loadingBitrix ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : bitrixEvents.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">Nenhum evento Bitrix24 recebido.</div>
            ) : (
              <div className="max-h-[400px] overflow-y-auto divide-y divide-border/20">
                {bitrixEvents.map((e) => {
                  const cfg = STATUS_CONFIG[e.routing_status] ?? STATUS_CONFIG.pending;
                  const Icon = cfg.icon;
                  return (
                    <div key={e.id} className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <code className="text-[11px] font-mono font-bold text-foreground">{e.event_type}</code>
                          <span className="text-[10px] text-muted-foreground">#{e.bitrix_event_id?.slice(0, 8)}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">{new Date(e.received_at).toLocaleString('pt-BR')}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge variant="outline" className={`text-[10px] gap-1.5 px-2 py-0.5 ${cfg.color}`}>
                          <Icon className={`h-3 w-3 ${e.routing_status === 'pending' ? 'animate-spin' : ''}`} />
                          {cfg.label}
                        </Badge>
                        {e.trace_id && (
                          <a href={`/monitoring?trace=${e.trace_id}`} className="text-[10px] font-mono text-primary hover:underline">
                            {e.trace_id.slice(0, 8)}
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="whatsapp" className="p-0 m-0">
            {loadingWhatsApp ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : whatsappEvents.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">Nenhum evento WhatsApp recebido.</div>
            ) : (
              <div className="max-h-[400px] overflow-y-auto divide-y divide-border/20">
                {whatsappEvents.map((e) => {
                  const cfg = STATUS_CONFIG[e.routing_status] ?? STATUS_CONFIG.pending;
                  const Icon = cfg.icon;
                  return (
                    <div key={e.id} className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
                      <div className="space-y-1 flex-1 min-w-0 mr-4">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[9px] uppercase tracking-tighter">{e.provider}</Badge>
                          <span className="text-[11px] font-bold text-foreground truncate">{e.body_preview || e.event_type}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>{e.from_phone}</span>
                          <span className="opacity-40">•</span>
                          <span>{new Date(e.received_at).toLocaleString('pt-BR')}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge variant="outline" className={`text-[10px] gap-1.5 px-2 py-0.5 ${cfg.color}`}>
                          <Icon className={`h-3 w-3 ${e.routing_status === 'pending' ? 'animate-spin' : ''}`} />
                          {cfg.label}
                        </Badge>
                        {e.trace_id && (
                          <a href={`/monitoring?trace=${e.trace_id}`} className="text-[10px] font-mono text-primary hover:underline">
                            {e.trace_id.slice(0, 8)}
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
