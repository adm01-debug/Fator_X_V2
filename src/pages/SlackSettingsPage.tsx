/**
 * SlackSettingsPage — /settings/slack
 *
 * Módulo 1: Roteamento de alertas para canais Slack.
 * Módulos 2/3/4 (Notificações, Bot, RAG) serão adicionados em abas próprias.
 */

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/shared/PageHeader";
import { Plus, Trash2, Send, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import {
  useSlackConfig,
  type SlackCategory,
  type SlackChannelRoute,
  type SlackSeverity,
  type UpsertRouteInput,
} from "@/hooks/useSlackConfig";
import { SlackAgentNotificationsPanel } from "@/components/slack/SlackAgentNotificationsPanel";
import { SlackRagSourcesPanel } from "@/components/slack/SlackRagSourcesPanel";
import { SlackBotBindingPanel } from "@/components/slack/SlackBotBindingPanel";
import { SlackHealthCard } from "@/components/slack/SlackHealthCard";


const CATEGORY_LABELS: Record<SlackCategory, string> = {
  security_alert: "Alertas de segurança",
  partition_automation_failure: "Falha em partições",
  circuit_breaker: "Circuit breaker aberto",
  high_cost: "Custo elevado",
  agent_failure: "Falha em agente",
  system_error: "Erro de sistema",
  custom: "Personalizado",
};

const SEVERITY_LABELS: Record<SlackSeverity, string> = {
  info: "Info",
  warning: "Aviso",
  error: "Erro",
  critical: "Crítico",
};

const SEVERITY_VARIANT: Record<SlackSeverity, "secondary" | "outline" | "destructive"> = {
  info: "secondary",
  warning: "outline",
  error: "destructive",
  critical: "destructive",
};

function emptyForm(): UpsertRouteInput {
  return {
    category: "security_alert",
    category_label: CATEGORY_LABELS.security_alert,
    channel_id: "",
    channel_name: "",
    min_severity: "warning",
    enabled: true,
    mention_users: [],
  };
}

export default function SlackSettingsPage() {
  const { isConfigured, config, routes, loading, upsertRoute, deleteRoute, testRoute, verifyConnection } =
    useSlackConfig();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<UpsertRouteInput>(emptyForm);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (route: SlackChannelRoute) => {
    setEditingId(route.id);
    setForm({
      id: route.id,
      category: route.category,
      category_label: route.category_label ?? CATEGORY_LABELS[route.category],
      channel_id: route.channel_id,
      channel_name: route.channel_name ?? "",
      min_severity: route.min_severity,
      enabled: route.enabled,
      mention_users: route.mention_users ?? [],
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.channel_id.trim()) return;
    await upsertRoute.mutateAsync(form);
    setDialogOpen(false);
  };

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="Integração Slack"
        description="Envie alertas, notificações de agentes e habilite o bot Nexus dentro do seu workspace Slack."
      />

      {!isConfigured && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Slack ainda não configurado</AlertTitle>
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center gap-3 mt-2">
            <span>
              Configure os secrets <code>SLACK_BOT_TOKEN</code> e <code>SLACK_SIGNING_SECRET</code>, então clique em verificar.
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => verifyConnection.mutate()}
              disabled={verifyConnection.isPending}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Verificar conexão
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {isConfigured && config && (
        <Card>
          <CardContent className="pt-6 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <div className="text-sm">
                Conectado ao workspace{" "}
                <span className="font-medium">{config.slack_team_name ?? config.slack_team_id}</span>{" "}
                como <span className="font-medium">{config.bot_display_name ?? config.bot_user_id}</span>.
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => verifyConnection.mutate()}
              disabled={verifyConnection.isPending}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Reverificar
            </Button>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="alerts" className="w-full">
        <TabsList>
          <TabsTrigger value="alerts">Alertas</TabsTrigger>
          <TabsTrigger value="notifications">Notificações de Agentes</TabsTrigger>
          <TabsTrigger value="bot">Bot @Nexus</TabsTrigger>
          <TabsTrigger value="rag">Fontes RAG</TabsTrigger>
        </TabsList>


        <TabsContent value="alerts" className="space-y-4 mt-6">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Rotas de alertas</CardTitle>
                <CardDescription>
                  Defina para qual canal do Slack cada categoria de alerta será enviada, com
                  filtro de severidade mínima.
                </CardDescription>
              </div>
              <Button onClick={openCreate} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Nova rota
              </Button>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-sm text-muted-foreground">Carregando…</div>
              ) : routes.length === 0 ? (
                <div className="text-sm text-muted-foreground py-8 text-center">
                  Nenhuma rota configurada. Clique em <strong>Nova rota</strong> para começar.
                </div>
              ) : (
                <div className="space-y-2">
                  {routes.map((route) => (
                    <div
                      key={route.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border bg-card/50"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={route.enabled ? "default" : "secondary"}>
                          {route.enabled ? "Ativo" : "Pausado"}
                        </Badge>
                        <span className="font-medium">
                          {CATEGORY_LABELS[route.category] ?? route.category}
                        </span>
                        <span className="text-muted-foreground">→</span>
                        <span className="font-mono text-sm">
                          {route.channel_name ? `#${route.channel_name}` : route.channel_id}
                        </span>
                        <Badge variant={SEVERITY_VARIANT[route.min_severity]}>
                          ≥ {SEVERITY_LABELS[route.min_severity]}
                        </Badge>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => testRoute.mutate(route)}
                          disabled={testRoute.isPending}
                        >
                          <Send className="h-3.5 w-3.5 mr-1" />
                          Testar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openEdit(route)}>
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteRoute.mutate(route.id)}
                          disabled={deleteRoute.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4 mt-6">
          <SlackAgentNotificationsPanel />
        </TabsContent>

        <TabsContent value="bot" className="space-y-4 mt-6">
          <SlackBotBindingPanel />
        </TabsContent>

        <TabsContent value="rag" className="space-y-4 mt-6">
          <SlackRagSourcesPanel />
        </TabsContent>
      </Tabs>


      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar rota" : "Nova rota"}</DialogTitle>
            <DialogDescription>
              Configure para qual canal do Slack esta categoria de alerta será enviada.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select
                value={form.category}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    category: v as SlackCategory,
                    category_label: CATEGORY_LABELS[v as SlackCategory],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATEGORY_LABELS) as SlackCategory[]).map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>ID do canal</Label>
                <Input
                  placeholder="C0123456789"
                  value={form.channel_id}
                  onChange={(e) => setForm({ ...form, channel_id: e.target.value.trim() })}
                />
              </div>
              <div className="space-y-2">
                <Label>Nome (opcional)</Label>
                <Input
                  placeholder="alerts-prod"
                  value={form.channel_name ?? ""}
                  onChange={(e) => setForm({ ...form, channel_name: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Severidade mínima</Label>
              <Select
                value={form.min_severity}
                onValueChange={(v) => setForm({ ...form, min_severity: v as SlackSeverity })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SEVERITY_LABELS) as SlackSeverity[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {SEVERITY_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Menções (IDs de usuário Slack separados por vírgula)</Label>
              <Input
                placeholder="U012ABC, U345DEF"
                value={(form.mention_users ?? []).join(", ")}
                onChange={(e) =>
                  setForm({
                    ...form,
                    mention_users: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="font-medium">Rota ativa</div>
                <div className="text-sm text-muted-foreground">
                  Desative para pausar temporariamente sem apagar a configuração.
                </div>
              </div>
              <Switch
                checked={form.enabled}
                onCheckedChange={(v) => setForm({ ...form, enabled: v })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={upsertRoute.isPending || !form.channel_id}>
              {editingId ? "Salvar" : "Criar rota"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
