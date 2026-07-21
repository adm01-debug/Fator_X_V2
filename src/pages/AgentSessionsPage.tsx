import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceId } from "@/hooks/use-data";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Mic, Globe, Clock, DollarSign, RefreshCw, MessageCircle, Send, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { sendWhatsappMessage } from "@/services/openclawDeployService";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type VoiceSession = {
  id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  audio_in_seconds: number | null;
  audio_out_seconds: number | null;
  cost_cents: number | null;
  agent_id: string | null;
};

type BrowserSession = {
  id: string;
  status: string;
  goal: string | null;
  start_url: string | null;
  steps_count: number | null;
  max_steps: number | null;
  cost_cents: number | null;
  final_result: string | null;
  error_message: string | null;
  started_at: string;
  ended_at: string | null;
  agent_id: string | null;
};
type WhatsappInstance = {
  id: string;
  instance_name: string;
  phone_number: string | null;
  status: string;
};

type WhatsappMessage = {
  id: string;
  instance_id: string | null;
  remote_phone: string;
  direction: string;
  body: string | null;
  status: string;
  created_at: string;
};


const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  completed: "secondary",
  success: "secondary",
  running: "default",
  active: "default",
  failed: "destructive",
  error: "destructive",
  cancelled: "outline",
};

const fmtCost = (cents: number | null) =>
  cents === null || cents === undefined ? "-" : `$${(cents / 100).toFixed(4)}`;
const fmtDuration = (ms: number | null) => {
  if (!ms) return "-";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
};

export default function AgentSessionsPage() {
  const { data: workspaceId } = useWorkspaceId();
  const [voice, setVoice] = useState<VoiceSession[]>([]);
  const [browser, setBrowser] = useState<BrowserSession[]>([]);
  const [instances, setInstances] = useState<WhatsappInstance[]>([]);
  const [messages, setMessages] = useState<WhatsappMessage[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    const [{ data: v, error: ve }, { data: b, error: be }, { data: inst }, { data: msgs }] = await Promise.all([
      supabase
        .from("voice_sessions")
        .select("id,status,started_at,ended_at,duration_ms,audio_in_seconds,audio_out_seconds,cost_cents,agent_id")
        .eq("workspace_id", workspaceId)
        .order("started_at", { ascending: false })
        .limit(200),
      supabase
        .from("browser_sessions")
        .select("id,status,goal,start_url,steps_count,max_steps,cost_cents,final_result,error_message,started_at,ended_at,agent_id")
        .eq("workspace_id", workspaceId)
        .order("started_at", { ascending: false })
        .limit(200),
      supabase
        .from("openclaw_whatsapp_instances")
        .select("id,instance_name,phone_number,status")
        .eq("workspace_id", workspaceId)
        .order("instance_name", { ascending: true }),
      supabase
        .from("openclaw_whatsapp_messages")
        .select("id,instance_id,remote_phone,direction,body,status,created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(300),
    ]);
    if (ve || be) toast.error("Erro ao carregar sessões");
    setVoice((v ?? []) as VoiceSession[]);
    setBrowser((b ?? []) as BrowserSession[]);
    setInstances((inst ?? []) as WhatsappInstance[]);
    setMessages((msgs ?? []) as WhatsappMessage[]);
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const voiceStats = {
    total: voice.length,
    active: voice.filter((s) => s.status === "active" || s.status === "running").length,
    total_seconds:
      voice.reduce((acc, s) => acc + Number(s.audio_in_seconds ?? 0) + Number(s.audio_out_seconds ?? 0), 0),
    total_cost: voice.reduce((acc, s) => acc + (s.cost_cents ?? 0), 0),
  };
  const browserStats = {
    total: browser.length,
    running: browser.filter((s) => s.status === "running" || s.status === "active").length,
    failed: browser.filter((s) => s.status === "failed" || s.status === "error").length,
    total_cost: browser.reduce((acc, s) => acc + (s.cost_cents ?? 0), 0),
  };

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="Sessões de Agentes"
        description="Histórico de sessões de voz (Realtime) e navegação autônoma (Browser Agent) com métricas de custo e duração"
      />

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      <Tabs defaultValue="voice">
        <TabsList>
          <TabsTrigger value="voice"><Mic className="h-4 w-4 mr-2" /> Voz ({voice.length})</TabsTrigger>
          <TabsTrigger value="browser"><Globe className="h-4 w-4 mr-2" /> Browser ({browser.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="voice" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card><CardHeader className="pb-2"><CardTitle className="text-body-sm text-muted-foreground">Total</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{voiceStats.total}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-body-sm text-muted-foreground">Ativas</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold text-primary">{voiceStats.active}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-body-sm text-muted-foreground">Áudio total</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{Math.round(voiceStats.total_seconds)}s</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-body-sm text-muted-foreground">Custo total</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{fmtCost(voiceStats.total_cost)}</p></CardContent></Card>
          </div>
          <Card>
            <CardHeader><CardTitle>Sessões de voz recentes</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {loading ? (
                <p className="text-body-sm text-muted-foreground">Carregando…</p>
              ) : voice.length === 0 ? (
                <p className="text-body-sm text-muted-foreground text-center py-8">Nenhuma sessão de voz registrada.</p>
              ) : (
                voice.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 rounded border border-border/60 p-3 hover:bg-muted/30 transition">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={STATUS_VARIANT[s.status] ?? "outline"}>{s.status}</Badge>
                        <span className="text-meta text-muted-foreground">
                          {format(new Date(s.started_at), "PPp", { locale: ptBR })}
                        </span>
                      </div>
                      <p className="text-meta text-muted-foreground mt-1 truncate">Session ID: {s.id.slice(0, 8)}…</p>
                    </div>
                    <div className="flex items-center gap-4 text-meta">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {fmtDuration(s.duration_ms)}</span>
                      <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" /> {fmtCost(s.cost_cents)}</span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="browser" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card><CardHeader className="pb-2"><CardTitle className="text-body-sm text-muted-foreground">Total</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{browserStats.total}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-body-sm text-muted-foreground">Rodando</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold text-primary">{browserStats.running}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-body-sm text-muted-foreground">Falhas</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold text-destructive">{browserStats.failed}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-body-sm text-muted-foreground">Custo total</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{fmtCost(browserStats.total_cost)}</p></CardContent></Card>
          </div>
          <Card>
            <CardHeader><CardTitle>Sessões de navegação recentes</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {loading ? (
                <p className="text-body-sm text-muted-foreground">Carregando…</p>
              ) : browser.length === 0 ? (
                <p className="text-body-sm text-muted-foreground text-center py-8">Nenhuma sessão de browser agent registrada.</p>
              ) : (
                browser.map((s) => (
                  <div key={s.id} className="rounded border border-border/60 p-3 hover:bg-muted/30 transition">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={STATUS_VARIANT[s.status] ?? "outline"}>{s.status}</Badge>
                          <span className="text-meta text-muted-foreground">
                            {format(new Date(s.started_at), "PPp", { locale: ptBR })}
                          </span>
                        </div>
                        {s.goal && <p className="text-body-sm mt-1 line-clamp-2">{s.goal}</p>}
                        {s.start_url && <p className="text-meta text-muted-foreground truncate">→ {s.start_url}</p>}
                      </div>
                      <div className="flex flex-col items-end gap-1 text-meta">
                        <span>{s.steps_count ?? 0} / {s.max_steps ?? "∞"} passos</span>
                        <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" /> {fmtCost(s.cost_cents)}</span>
                      </div>
                    </div>
                    {s.error_message && (
                      <p className="text-meta text-destructive mt-2 line-clamp-2">Erro: {s.error_message}</p>
                    )}
                    {s.final_result && !s.error_message && (
                      <p className="text-meta text-muted-foreground mt-2 line-clamp-2">Resultado: {s.final_result}</p>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
