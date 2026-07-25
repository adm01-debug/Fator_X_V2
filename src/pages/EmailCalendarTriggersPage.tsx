import { useState, useEffect, useCallback } from "react";
import { Mail, Calendar, Webhook, Plus, Trash2, Filter, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/PageHeader";
import { SharedEmptyState } from "@/components/shared/SharedEmptyState";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceId } from "@/hooks/use-data";

type TriggerType = "email" | "calendar";

interface AutomationRule {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_config: { provider?: string; filter?: string; type?: TriggerType } | null;
  action_type: string;
  action_config: { agent?: string } | null;
  is_active: boolean;
  run_count: number;
  created_at: string;
}

const EMAIL_TRIGGER = "email_received";
const CALENDAR_TRIGGER = "calendar_event";

export default function EmailCalendarTriggersPage() {
  const { data: workspaceId } = useWorkspaceId();
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    type: "email" as TriggerType,
    name: "",
    provider: "Gmail",
    filter: "",
    agent: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("automation_rules")
      .select("*")
      .in("trigger_type", [EMAIL_TRIGGER, CALENDAR_TRIGGER])
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Falha ao carregar triggers", { description: error.message });
    } else {
      setRules((data ?? []) as unknown as AutomationRule[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (rule: AutomationRule) => {
    const next = !rule.is_active;
    setRules((rs) => rs.map((r) => (r.id === rule.id ? { ...r, is_active: next } : r)));
    const { error } = await supabase
      .from("automation_rules")
      .update({ is_active: next })
      .eq("id", rule.id);
    if (error) {
      toast.error("Falha ao alternar", { description: error.message });
      void load();
    } else {
      toast.success(next ? "Trigger ativado" : "Trigger pausado");
    }
  };

  const remove = async (rule: AutomationRule) => {
    if (!confirm(`Remover trigger "${rule.name}"?`)) return;
    const previous = rules;
    setRules((rs) => rs.filter((r) => r.id !== rule.id));
    const { error } = await supabase.from("automation_rules").delete().eq("id", rule.id);
    if (error) {
      toast.error("Falha ao remover", { description: error.message });
      setRules(previous);
    } else {
      toast.success("Trigger removido");
    }
  };

  const create = async () => {
    if (!form.name.trim()) {
      toast.error("Informe o nome do trigger");
      return;
    }
    setCreating(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      toast.error("Sessão expirada");
      setCreating(false);
      return;
    }
    if (!workspaceId) {
      toast.error("Workspace não encontrado");
      setCreating(false);
      return;
    }
    const { error } = await supabase.from("automation_rules").insert({
      workspace_id: workspaceId,
      name: form.name.trim(),
      description: null,
      trigger_type: form.type === "email" ? EMAIL_TRIGGER : CALENDAR_TRIGGER,
      trigger_config: { provider: form.provider, filter: form.filter, type: form.type },
      action_type: "invoke_agent",
      action_config: { agent: form.agent },
      is_active: true,
      created_by: userData.user.id,
    });
    setCreating(false);
    if (error) {
      toast.error("Falha ao criar", { description: error.message });
      return;
    }
    toast.success("Trigger criado");
    setForm({ type: "email", name: "", provider: "Gmail", filter: "", agent: "" });
    void load();
  };

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="Email & Calendar Triggers"
        description="Dispare agentes automaticamente a partir de emails recebidos ou eventos de calendário. Suporte Gmail, Outlook, Google Calendar."
      />

      <Tabs defaultValue="triggers">
        <TabsList>
          <TabsTrigger value="triggers"><Webhook className="h-3.5 w-3.5 mr-1.5" />Triggers ativos</TabsTrigger>
          <TabsTrigger value="new"><Plus className="h-3.5 w-3.5 mr-1.5" />Novo trigger</TabsTrigger>
        </TabsList>

        <TabsContent value="triggers" className="space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando triggers...
            </div>
          ) : rules.length === 0 ? (
            <SharedEmptyState
              icon={Webhook}
              title="Nenhum trigger configurado"
              description="Crie seu primeiro trigger na aba 'Novo trigger' para automatizar processamento de emails ou eventos de calendário."
            />
          ) : (
            rules.map((r) => {
              const cfg = r.trigger_config ?? {};
              const isEmail = r.trigger_type === EMAIL_TRIGGER;
              return (
                <Card key={r.id} className={!r.is_active ? "opacity-60" : ""}>
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className={`h-10 w-10 rounded-md flex items-center justify-center ${isEmail ? "bg-nexus-blue/15" : "bg-nexus-purple/15"}`}>
                      {isEmail ? <Mail className="h-5 w-5 text-nexus-blue" /> : <Calendar className="h-5 w-5 text-nexus-purple" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-body-sm">{r.name}</span>
                        {cfg.provider && <Badge variant="outline" className="text-meta">{cfg.provider}</Badge>}
                        {cfg.filter && <Badge variant="outline" className="text-meta"><Filter className="h-2.5 w-2.5 mr-0.5" />{cfg.filter}</Badge>}
                      </div>
                      <div className="text-meta text-muted-foreground mt-1">
                        → {r.action_config?.agent || "sem agente"} · {r.run_count.toLocaleString("pt-BR")} execuções
                      </div>
                    </div>
                    <Switch checked={r.is_active} onCheckedChange={() => toggle(r)} />
                    <Button variant="ghost" size="sm" onClick={() => remove(r)}><Trash2 className="h-4 w-4" /></Button>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="new">
          <Card>
            <CardHeader><CardTitle className="text-body-sm">Configurar novo trigger</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, type: "email", provider: "Gmail" }))}
                  className={`p-4 rounded-lg border-2 text-left transition-colors ${form.type === "email" ? "border-primary bg-primary/5" : "border-border/40 hover:border-primary/40"}`}
                >
                  <Mail className="h-6 w-6 text-nexus-blue mb-2" />
                  <div className="text-body-sm font-semibold">Email recebido</div>
                  <div className="text-meta text-muted-foreground mt-0.5">IMAP/Gmail/Outlook polling</div>
                </button>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, type: "calendar", provider: "Google Cal" }))}
                  className={`p-4 rounded-lg border-2 text-left transition-colors ${form.type === "calendar" ? "border-primary bg-primary/5" : "border-border/40 hover:border-primary/40"}`}
                >
                  <Calendar className="h-6 w-6 text-nexus-purple mb-2" />
                  <div className="text-body-sm font-semibold">Evento de calendário</div>
                  <div className="text-meta text-muted-foreground mt-0.5">Google/Outlook calendar webhooks</div>
                </button>
              </div>
              <div>
                <Label className="text-meta">Nome do trigger</Label>
                <Input placeholder="Ex: Triagem de tickets" className="mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label className="text-meta">Provider</Label>
                <Input placeholder="Gmail / Outlook / Google Cal" className="mt-1" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} />
              </div>
              <div>
                <Label className="text-meta">Filtro (Gmail query syntax)</Label>
                <Input placeholder="from:cliente@empresa.com is:unread" className="mt-1 font-mono" value={form.filter} onChange={(e) => setForm({ ...form, filter: e.target.value })} />
              </div>
              <div>
                <Label className="text-meta">Agente que processa</Label>
                <Input placeholder="Nome ou ID do agente" className="mt-1" value={form.agent} onChange={(e) => setForm({ ...form, agent: e.target.value })} />
              </div>
              <Button className="w-full" onClick={create} disabled={creating}>
                {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                Criar trigger
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
