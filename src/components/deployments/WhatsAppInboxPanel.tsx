import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MessageSquare,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ShieldAlert,
  Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface WhatsAppEvent {
  id: string;
  event_type: string;
  provider: string;
  message_id: string | null;
  from_phone: string | null;
  to_phone: string | null;
  body_preview: string | null;
  raw_payload: unknown;
  signature_valid: boolean;
  routed_agent_id: string | null;
  routing_status: string;
  routing_error: string | null;
  trace_id: string | null;
  received_at: string;
  processed_at: string | null;
}

const STATUS_META: Record<
  string,
  { label: string; icon: typeof CheckCircle2; color: string; bg: string }
> = {
  routed: { label: "Roteado", icon: CheckCircle2, color: "text-nexus-emerald", bg: "bg-nexus-emerald/10" },
  pending: { label: "Pendente", icon: Clock, color: "text-nexus-amber", bg: "bg-nexus-amber/10" },
  no_route: { label: "Sem rota", icon: AlertTriangle, color: "text-nexus-amber", bg: "bg-nexus-amber/10" },
  failed: { label: "Falhou", icon: XCircle, color: "text-destructive", bg: "bg-destructive/10" },
  invalid_signature: { label: "Assinatura inválida", icon: ShieldAlert, color: "text-destructive", bg: "bg-destructive/10" },
  duplicate: { label: "Duplicado", icon: RefreshCw, color: "text-muted-foreground", bg: "bg-muted/40" },
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

function maskPhone(p: string | null) {
  if (!p) return "—";
  const digits = p.replace(/\D/g, "");
  if (digits.length < 6) return p;
  return `${digits.slice(0, 4)}••••${digits.slice(-2)}`;
}

export function WhatsAppInboxPanel() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<WhatsAppEvent | null>(null);

  const { data: events = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["whatsapp_webhook_events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_webhook_events" as never)
        .select("*")
        .order("received_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as WhatsAppEvent[];
    },
    refetchInterval: 30000,
  });

  const stats = useMemo(() => {
    const total = events.length;
    const routed = events.filter((e) => e.routing_status === "routed").length;
    const failed = events.filter((e) => ["failed", "invalid_signature"].includes(e.routing_status)).length;
    const pending = events.filter((e) => e.routing_status === "pending").length;
    return { total, routed, failed, pending };
  }, [events]);

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (statusFilter && e.routing_status !== statusFilter) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        e.from_phone?.toLowerCase().includes(q) ||
        e.to_phone?.toLowerCase().includes(q) ||
        e.body_preview?.toLowerCase().includes(q) ||
        e.event_type?.toLowerCase().includes(q) ||
        e.provider?.toLowerCase().includes(q)
      );
    });
  }, [events, search, statusFilter]);

  const copyPayload = (evt: WhatsAppEvent) => {
    navigator.clipboard.writeText(JSON.stringify(evt.raw_payload, null, 2));
    toast.success("Payload copiado");
  };

  return (
    <div className="bg-card/50 backdrop-blur-xl border border-border/40 p-8 rounded-[3rem] shadow-xl shadow-primary/5">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-nexus-emerald/10 flex items-center justify-center">
            <MessageSquare className="h-5 w-5 text-nexus-emerald" />
          </div>
          <div>
            <h3 className="text-xl font-heading font-black text-foreground">Inbox WhatsApp</h3>
            <p className="text-meta text-muted-foreground font-medium uppercase tracking-widest">
              Eventos recebidos em tempo real
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isRefetching}
          className="h-9 w-9 p-0 rounded-xl hover:bg-primary/10"
          aria-label="Recarregar"
        >
          <RefreshCw className={cn("h-4 w-4", isRefetching && "animate-spin")} />
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          { label: "Total", val: stats.total, color: "text-foreground" },
          { label: "Roteados", val: stats.routed, color: "text-nexus-emerald" },
          { label: "Pendentes", val: stats.pending, color: "text-nexus-amber" },
          { label: "Falhas", val: stats.failed, color: "text-destructive" },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-border/30 bg-secondary/30 p-3 text-center"
          >
            <div className={cn("text-lg font-black font-mono", s.color)}>{s.val}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por telefone, texto ou tipo…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10 rounded-xl bg-background/50 border-border/40"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[null, "routed", "pending", "failed", "invalid_signature", "no_route"].map((s) => (
            <Button
              key={s ?? "all"}
              size="sm"
              variant={statusFilter === s ? "default" : "outline"}
              onClick={() => setStatusFilter(s)}
              className="h-9 px-3 rounded-xl text-meta font-bold uppercase tracking-widest"
            >
              {s ? STATUS_META[s]?.label ?? s : "Todos"}
            </Button>
          ))}
        </div>
      </div>

      {/* List */}
      <ScrollArea className="h-[420px] pr-2">
        {isLoading ? (
          <div className="text-center text-meta text-muted-foreground py-16">Carregando…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-border/40 rounded-2xl">
            <MessageSquare className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-40" />
            <p className="text-body-sm text-muted-foreground font-medium">
              Nenhum evento WhatsApp encontrado.
            </p>
            <p className="text-meta text-muted-foreground/70 mt-1">
              Configure o webhook do provedor (Twilio, Meta, Z-API, Evolution) para começar.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((evt) => {
              const meta = STATUS_META[evt.routing_status] ?? STATUS_META.pending;
              const Icon = meta.icon;
              return (
                <button
                  key={evt.id}
                  onClick={() => setSelected(evt)}
                  className="w-full text-left flex items-center gap-3 p-3.5 rounded-2xl bg-secondary/20 border border-border/30 hover:border-primary/30 hover:bg-secondary/40 transition-all group"
                >
                  <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center shrink-0", meta.bg)}>
                    <Icon className={cn("h-4 w-4", meta.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-body-sm font-bold text-foreground truncate">
                        {maskPhone(evt.from_phone)}
                      </span>
                      <Badge variant="outline" className="h-5 px-2 rounded-lg text-[9px] font-black uppercase tracking-widest border-border/40">
                        {evt.provider}
                      </Badge>
                      {!evt.signature_valid && (
                        <Badge className="h-5 px-2 rounded-lg text-[9px] font-black uppercase tracking-widest bg-destructive/10 text-destructive border-none">
                          Assinatura
                        </Badge>
                      )}
                    </div>
                    <p className="text-meta text-muted-foreground truncate">
                      {evt.body_preview || evt.event_type}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={cn("text-meta font-black uppercase tracking-widest", meta.color)}>
                      {meta.label}
                    </div>
                    <div className="text-[9px] text-muted-foreground font-mono mt-0.5">
                      {fmtDate(evt.received_at)}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-2xl rounded-[2rem] border-border/40 p-8">
          <DialogHeader>
            <DialogTitle className="text-2xl font-heading font-black flex items-center gap-3">
              <MessageSquare className="h-6 w-6 text-nexus-emerald" />
              Evento WhatsApp
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="De" value={maskPhone(selected.from_phone)} />
                <Field label="Para" value={maskPhone(selected.to_phone)} />
                <Field label="Tipo" value={selected.event_type} />
                <Field label="Provedor" value={selected.provider} />
                <Field label="Status" value={STATUS_META[selected.routing_status]?.label ?? selected.routing_status} />
                <Field label="Assinatura" value={selected.signature_valid ? "✓ Válida" : "✗ Inválida"} />
                <Field label="Message ID" value={selected.message_id ?? "—"} mono />
                <Field label="Trace ID" value={selected.trace_id ?? "—"} mono />
                <Field label="Recebido" value={fmtDate(selected.received_at)} />
                <Field label="Processado" value={selected.processed_at ? fmtDate(selected.processed_at) : "—"} />
              </div>

              {selected.body_preview && (
                <div className="p-4 rounded-2xl bg-secondary/40 border border-border/40">
                  <p className="text-meta font-black uppercase tracking-widest text-muted-foreground mb-2">
                    Preview da mensagem
                  </p>
                  <p className="text-body-sm text-foreground whitespace-pre-wrap">
                    {selected.body_preview}
                  </p>
                </div>
              )}

              {selected.routing_error && (
                <div className="p-4 rounded-2xl bg-destructive/10 border border-destructive/30">
                  <p className="text-meta font-black uppercase tracking-widest text-destructive mb-2">
                    Erro de roteamento
                  </p>
                  <p className="text-body-sm text-destructive/90 font-mono break-all">
                    {selected.routing_error}
                  </p>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-meta font-black uppercase tracking-widest text-muted-foreground">
                    Payload bruto
                  </p>
                  <Button size="sm" variant="ghost" onClick={() => copyPayload(selected)} className="h-8 rounded-lg gap-1.5">
                    <Copy className="h-3.5 w-3.5" />
                    <span className="text-meta font-bold">Copiar</span>
                  </Button>
                </div>
                <pre className="p-4 rounded-2xl bg-background/60 border border-border/40 text-[11px] font-mono text-muted-foreground max-h-64 overflow-auto">
                  {JSON.stringify(selected.raw_payload, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="p-3 rounded-xl bg-secondary/30 border border-border/30">
      <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">
        {label}
      </p>
      <p className={cn("text-body-sm text-foreground break-all", mono && "font-mono text-meta")}>
        {value}
      </p>
    </div>
  );
}

export default WhatsAppInboxPanel;
