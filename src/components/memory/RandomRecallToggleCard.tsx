/**
 * RandomRecallToggleCard — habilita "recall aleatório" (serendipity) por agente.
 *
 * Grava a flag em `agents.config.random_recall_enabled` (jsonb). Quando ativa,
 * o `oracle-research` (e futuros consumidores) sorteia com pequena probabilidade
 * uma memória arquivada para injetar no contexto, promovendo colisões criativas.
 *
 * Fonte de leitura/gravação: tabela `agents`, coluna `config` (jsonb).
 */
import { useEffect, useState } from "react";
import { Shuffle, Loader2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabaseExternal } from "@/integrations/supabase/externalClient";
import { logger } from "@/lib/logger";
import { toast } from "sonner";

interface AgentRow {
  id: string;
  name: string;
  config: Record<string, unknown> | null;
}

interface Props {
  workspaceId: string | null | undefined;
}

export function RandomRecallToggleCard({ workspaceId }: Props) {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: qErr } = await supabaseExternal
          .from("agents")
          .select("id, name, config")
          .eq("workspace_id", workspaceId)
          .order("name");
        if (cancelled) return;
        if (qErr) throw qErr;
        const rows = (data ?? []) as AgentRow[];
        setAgents(rows);
        if (rows.length > 0) setSelectedId((prev) => prev || rows[0].id);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        logger.error("RandomRecallToggleCard load failed", { error: msg });
        setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const selected = agents.find((a) => a.id === selectedId) ?? null;
  const enabled = Boolean(
    (selected?.config as { random_recall_enabled?: boolean } | null)?.random_recall_enabled,
  );

  async function toggle(next: boolean) {
    if (!selected) return;
    setSaving(true);
    try {
      const nextConfig = {
        ...(selected.config ?? {}),
        random_recall_enabled: next,
      };
      const { error: uErr } = await supabaseExternal
        .from("agents")
        .update({ config: nextConfig })
        .eq("id", selected.id);
      if (uErr) throw uErr;
      setAgents((prev) =>
        prev.map((a) => (a.id === selected.id ? { ...a, config: nextConfig } : a)),
      );
      toast.success(next ? "Recall aleatório ativado" : "Recall aleatório desativado");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error("RandomRecallToggleCard update failed", { error: msg });
      toast.error(`Falha ao atualizar: ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shuffle className="h-4 w-4 text-primary" />
          Recall aleatório por agente
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-body-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando agentes…
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-body-sm text-destructive">
            <AlertCircle className="h-4 w-4" /> {error}
          </div>
        ) : agents.length === 0 ? (
          <p className="text-meta text-muted-foreground">
            Nenhum agente encontrado neste workspace.
          </p>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="rr-agent" className="text-body-sm">
                Agente
              </Label>
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger id="rr-agent">
                  <SelectValue placeholder="Selecione um agente" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="space-y-1">
                <Label htmlFor="rr-switch" className="text-body-sm font-medium">
                  Injetar memórias arquivadas aleatoriamente
                </Label>
                <p className="text-meta text-muted-foreground">
                  Sorteia com ~5% de chance uma memória do tier `archive` para
                  promover conexões criativas no raciocínio.
                </p>
              </div>
              <Switch
                id="rr-switch"
                checked={enabled}
                disabled={saving}
                onCheckedChange={toggle}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
