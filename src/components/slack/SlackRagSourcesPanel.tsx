/**
 * SlackRagSourcesPanel — Módulo 4
 * Canais Slack indexados como fonte de conhecimento (RAG).
 */
import { useState } from "react";
import { useSlackRagSources, type SlackRagSource } from "@/hooks/useSlackConfig";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface FormState {
  id?: string;
  channel_id: string;
  channel_name: string;
  enabled: boolean;
}

const EMPTY: FormState = { channel_id: "", channel_name: "", enabled: true };

export function SlackRagSourcesPanel() {
  const { items, loading, upsert, remove, sync } = useSlackRagSources();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);

  const openEdit = (s: SlackRagSource) => {
    setForm({ id: s.id, channel_id: s.channel_id, channel_name: s.channel_name ?? "", enabled: s.enabled });
    setOpen(true);
  };

  const save = async () => {
    if (!form.channel_id) return;
    await upsert.mutateAsync({
      id: form.id,
      channel_id: form.channel_id,
      channel_name: form.channel_name || undefined,
      enabled: form.enabled,
    });
    setOpen(false);
    setForm(EMPTY);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle>Fontes RAG do Slack</CardTitle>
          <CardDescription>
            Canais indexados como memória semântica. A sincronização respeita PII (emails/telefones são mascarados).
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => sync.mutate(undefined)} disabled={sync.isPending}>
            <RefreshCw className="h-4 w-4 mr-2" /> Sincronizar tudo
          </Button>
          <Button size="sm" onClick={() => { setForm(EMPTY); setOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Novo canal
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-body-sm text-muted-foreground">Carregando…</div>
        ) : items.length === 0 ? (
          <div className="text-body-sm text-muted-foreground py-8 text-center">
            Nenhum canal indexado.
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((s) => (
              <div key={s.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border bg-card/50">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={s.enabled ? "default" : "secondary"}>{s.enabled ? "Ativo" : "Pausado"}</Badge>
                  <span className="font-mono text-body-sm">{s.channel_name ? `#${s.channel_name}` : s.channel_id}</span>
                  <Badge variant="outline">{s.message_count} mensagens</Badge>
                  {s.last_sync_status && (
                    <Badge variant={s.last_sync_status === "ok" ? "secondary" : "destructive"}>
                      {s.last_sync_status}
                    </Badge>
                  )}
                  {s.last_synced_at && (
                    <span className="text-meta text-muted-foreground">
                      {formatDistanceToNow(new Date(s.last_synced_at), { addSuffix: true, locale: ptBR })}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => sync.mutate(s.id)} disabled={sync.isPending}>
                    <RefreshCw className="h-3.5 w-3.5 mr-1" /> Sincronizar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(s)}>Editar</Button>
                  <Button size="sm" variant="ghost" onClick={() => remove.mutate(s.id)} disabled={remove.isPending}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar canal" : "Adicionar canal"}</DialogTitle>
            <DialogDescription>
              O bot precisa estar convidado no canal. Somente mensagens humanas (sem bots) são indexadas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>ID do canal</Label>
                <Input value={form.channel_id} onChange={(e) => setForm({ ...form, channel_id: e.target.value.trim() })} placeholder="C0123456789" />
              </div>
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={form.channel_name} onChange={(e) => setForm({ ...form, channel_name: e.target.value })} placeholder="produto" />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="font-medium">Ativo</div>
              <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={upsert.isPending || !form.channel_id}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
