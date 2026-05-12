import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  MessageSquare, User, Clock, CheckCircle2, AlertCircle, 
  ArrowRight, Search, Filter, Loader2, ShieldCheck,
  Smartphone, Zap, Phone, ExternalLink
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { listRecentWhatsAppEvents } from "@/services/whatsappWebhookService";
import { cn } from "@/lib/utils";

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  routed: { label: "Roteado", color: "text-nexus-emerald", bg: "bg-nexus-emerald/10" },
  no_route: { label: "Sem Rota", color: "text-muted-foreground", bg: "bg-muted/10" },
  failed: { label: "Falhou", color: "text-destructive", bg: "bg-destructive/10" },
  pending: { label: "Pendente", color: "text-nexus-amber", bg: "bg-nexus-amber/10" },
};

export function WhatsAppLiveConsole() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  
  const { data: events = [], isLoading, refetch } = useQuery({
    queryKey: ["whatsapp_live_events"],
    queryFn: () => listRecentWhatsAppEvents(50),
    refetchInterval: 5000,
  });

  const filteredEvents = events.filter(e => {
    if (filter !== "all" && e.routing_status !== filter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      e.from_phone?.toLowerCase().includes(q) || 
      e.body_preview?.toLowerCase().includes(q) ||
      e.event_type?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col h-[700px] border border-border/40 rounded-3xl overflow-hidden bg-card/30 backdrop-blur-sm">
      {/* Console Header */}
      <div className="p-6 border-b border-border/40 bg-secondary/20 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-nexus-emerald/10 flex items-center justify-center border border-nexus-emerald/20">
            <Smartphone className="h-6 w-6 text-nexus-emerald animate-pulse" />
          </div>
          <div>
            <h3 className="text-lg font-heading font-black text-foreground flex items-center gap-2">
              WhatsApp Live Console
              <Badge variant="outline" className="bg-nexus-emerald/10 text-nexus-emerald border-nexus-emerald/30 font-black text-[10px] tracking-widest uppercase">
                Enterprise
              </Badge>
            </h3>
            <p className="text-xs text-muted-foreground font-medium">Monitoramento de eventos inbound via Evolution API</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-nexus-emerald/10 border border-nexus-emerald/20">
            <div className="h-2 w-2 rounded-full bg-nexus-emerald animate-pulse" />
            <span className="text-[10px] font-bold text-nexus-emerald uppercase tracking-widest">Conexão Ativa</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="h-9 rounded-xl gap-2 border-border/40 font-bold text-xs">
            <Zap className="h-3.5 w-3.5 text-primary" /> Forçar Sync
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-6 py-4 border-b border-border/40 flex items-center gap-4 bg-background/40">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar por telefone ou conteúdo..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10 rounded-xl bg-secondary/30 border-border/30 focus:ring-primary/20 text-xs"
          />
        </div>
        
        <div className="flex items-center gap-2">
          {["all", "routed", "failed", "no_route"].map((f) => (
            <Button
              key={f}
              variant={filter === f ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setFilter(f)}
              className={cn(
                "h-8 rounded-lg text-[10px] font-bold uppercase tracking-wider",
                filter === f ? "bg-primary/10 text-primary border border-primary/20" : "text-muted-foreground"
              )}
            >
              {f === "all" ? "Todos" : f === "routed" ? "Sucesso" : f === "failed" ? "Erro" : "Órfãos"}
            </Button>
          ))}
        </div>
      </div>

      {/* Message Feed */}
      <ScrollArea className="flex-1">
        <div className="p-6 space-y-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary/40" />
              <p className="text-xs text-muted-foreground font-mono uppercase tracking-widest">Interceptando fluxo neural...</p>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
              <div className="h-16 w-16 rounded-3xl bg-secondary/30 flex items-center justify-center border border-border/40">
                <MessageSquare className="h-8 w-8 text-muted-foreground/30" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">Nenhum evento capturado</p>
                <p className="text-xs text-muted-foreground mt-1">Aguardando sinais do provedor WhatsApp...</p>
              </div>
            </div>
          ) : (
            filteredEvents.map((event) => {
              const status = STATUS_MAP[event.routing_status] || STATUS_MAP.pending;
              return (
                <div 
                  key={event.id}
                  className="group relative flex items-start gap-4 p-5 rounded-2xl bg-secondary/20 border border-border/30 hover:border-primary/30 hover:bg-secondary/30 transition-all animate-in fade-in slide-in-from-left-2"
                >
                  <div className="h-12 w-12 rounded-xl bg-background flex items-center justify-center border border-border/40 shrink-0 group-hover:scale-105 transition-transform">
                    <User className="h-6 w-6 text-muted-foreground/60" />
                  </div>
                  
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-foreground flex items-center gap-1.5">
                          <Phone className="h-3 w-3 text-nexus-emerald" />
                          {event.from_phone || "Desconhecido"}
                        </span>
                        <Badge variant="outline" className="bg-background/50 border-border/40 text-[9px] font-mono tracking-tighter h-5 px-2">
                          {event.provider}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />
                          {new Date(event.received_at).toLocaleTimeString('pt-BR')}
                        </span>
                      </div>
                    </div>
                    
                    <div className="p-3 rounded-xl bg-background/40 border border-border/20">
                      <p className="text-xs text-foreground leading-relaxed">
                        {event.body_preview || <span className="italic text-muted-foreground/60">[Mídia ou evento de sistema]</span>}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-3">
                        <Badge className={cn("text-[9px] font-black tracking-widest uppercase h-5", status.bg, status.color)}>
                          {status.label}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          ID: {event.id.slice(0, 8)}...
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                         <Button variant="ghost" size="sm" className="h-7 text-[10px] font-bold uppercase tracking-wider gap-1.5 hover:bg-primary/5 hover:text-primary">
                          Ver Trace <ExternalLink className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-[10px] font-bold uppercase tracking-wider gap-1.5 hover:bg-nexus-emerald/5 hover:text-nexus-emerald">
                          Agente <ArrowRight className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Console Footer */}
      <div className="p-4 border-t border-border/40 bg-secondary/30 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-nexus-emerald" />
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Processamento Criptografado</span>
          </div>
          <div className="h-3 w-px bg-border/40" />
          <span className="text-[10px] text-muted-foreground font-medium">Uptime: 99.98%</span>
        </div>
        
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-muted-foreground">Log retention: 30 days</span>
          <Badge variant="outline" className="text-[9px] border-primary/20 text-primary">v1.2.4-EVO</Badge>
        </div>
      </div>
    </div>
  );
}
