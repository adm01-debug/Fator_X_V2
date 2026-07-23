/**
 * SlackAgentNotificationsPanel — Módulo 2
 * Configura notificações de execuções de agentes por canal Slack.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";
import { useSlackAgentNotifications, type SlackAgentNotification } from "@/hooks/useSlackConfig";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

interface AgentOption {
  id: string;
  name: string;
}

function useWorkspaceAgents(): AgentOption[] {
  const { workspaceId } = useCurrentWorkspace();
  const { data } = useQuery({
    queryKey: ["agents-min", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agents")
        .select("id, name")
        .eq("workspace_id", workspaceId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as AgentOption[];
    },
  });
  return data ?? [];
}

interface FormState {
  id?: string;
  agent_id: string;
  channel_id: string;
  channel_name: string;
  notify_on: "success" | "failure" | "both";
  template: string;
  enabled: boolean;
}

const EMPTY: FormState = {
  agent_id: "",
  channel_id: "",
  channel_name: "",
  notify_on: "both",
  template: "",
  enabled: true,
};

export function SlackAgentNotificationsPanel() {
  const { items, loading, upsert, remove } = useSlackAgentNotifications();
  const agents = useWorkspaceAgents();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);

  const openEdit = (n: SlackAgentNotification) => {
    setForm({
      id: n.id,
      agent_id: n.agent_id,
      channel_id: n.channel_id,
      channel_name: n.channel_name ?? "",
      notify_on: n.notify_on,
      template: n.template ?? "",
      enabled: n.enabled,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.agent_id || !form.channel_id) return;
    await upsert.mutateAsync({
      id: form.id,
      agent_id: form.agent_id,
      channel_id: form.channel_id,
      channel_name: form.channel_name || undefined,
      notify_on: form.notify_on,
      template: form.template || null,
      enabled: form.enabled,
    });
    setOpen(false);
    setForm(EMPTY);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle>Notificações de agentes</CardTitle>
          <CardDescription>
            Envie mensagens ao Slack quando um agente conclui uma execução (sucesso, falha ou ambos).
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => { setForm(EMPTY); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Nova
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-body-sm text-muted-foreground">Carregando…</div>
        ) : items.length === 0 ? (
          <div className="text-body-sm text-muted-foreground py-8 text-center">
            Nenhuma notificação. Clique em <strong>Nova</strong>.
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((n) => {
              const agent = agents.find((a) => a.id === n.agent_id);
              return (
                <div
                  key={n.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border bg-card/50"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={n.enabled ? "default" : "secondary"}>
                      {n.enabled ? "Ativo" : "Pausado"}
                    </Badge>
                    <span className="font-medium">{agent?.name ?? n.agent_id.slice(0, 8)}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-mono text-body-sm">
                      {n.channel_name ? `#${n.channel_name}` : n.channel_id}
                    </span>
                    <Badge variant="outline">{n.notify_on}</Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(n)}>
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => remove.mutate(n.id)}
                      disabled={remove.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar notificação" : "Nova notificação"}</DialogTitle>
            <DialogDescription>
              Placeholders: {"{{agent_name}}"}, {"{{status}}"}, {"{{duration_ms}}"}, {"{{cost_usd}}"}, {"{{trace_url}}"}, {"{{error}}"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Agente</Label>
              <Select
                value={form.agent_id}
                onValueChange={(v) => setForm({ ...form, agent_id: v })}
              >
                <SelectTrigger><SelectValue placeholder="Selecione um agente" /></SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>ID do canal</Label>
                <Input value={form.channel_id} onChange={(e) => setForm({ ...form, channel_id: e.target.value.trim() })} placeholder="C0123456789" />
              </div>
              <div className="space-y-2">
                <Label>Nome (opcional)</Label>
                <Input value={form.channel_name} onChange={(e) => setForm({ ...form, channel_name: e.target.value })} placeholder="agentes-prod" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notificar quando</Label>
              <Select value={form.notify_on} onValueChange={(v) => setForm({ ...form, notify_on: v as FormState["notify_on"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="success">Somente sucesso</SelectItem>
                  <SelectItem value="failure">Somente falha</SelectItem>
                  <SelectItem value="both">Sucesso e falha</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Template (opcional)</Label>
              <Textarea rows={4} value={form.template} onChange={(e) => setForm({ ...form, template: e.target.value })} placeholder="*{{agent_name}}* finalizou com status *{{status}}*." />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="font-medium">Ativa</div>
              <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={upsert.isPending || !form.agent_id || !form.channel_id}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
