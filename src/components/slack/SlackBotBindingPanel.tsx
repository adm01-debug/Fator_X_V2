/**
 * SlackBotBindingPanel — Módulo 3
 * Define o agente padrão do bot @Nexus e overrides por canal.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";
import { useSlackBotBinding } from "@/hooks/useSlackConfig";
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
import { Plus, Trash2 } from "lucide-react";

function useAgents() {
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
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });
  return data ?? [];
}

export function SlackBotBindingPanel() {
  const { binding, loading, upsert } = useSlackBotBinding();
  const agents = useAgents();
  const [defaultAgent, setDefaultAgent] = useState<string>("");
  const [enabled, setEnabled] = useState(true);
  const [overrides, setOverrides] = useState<Array<{ channel: string; agent: string }>>([]);

  useEffect(() => {
    if (binding) {
      setDefaultAgent(binding.default_agent_id ?? "");
      setEnabled(binding.enabled);
      setOverrides(
        Object.entries(binding.channel_overrides ?? {}).map(([channel, agent]) => ({
          channel,
          agent,
        }))
      );
    }
  }, [binding]);

  const save = async () => {
    const map: Record<string, string> = {};
    for (const o of overrides) {
      if (o.channel && o.agent) map[o.channel] = o.agent;
    }
    await upsert.mutateAsync({
      default_agent_id: defaultAgent || null,
      channel_overrides: map,
      enabled,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bot @Nexus</CardTitle>
        <CardDescription>
          Configure qual agente responde às menções ao bot. Overrides por canal têm prioridade sobre o agente padrão.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="text-sm text-muted-foreground">Carregando…</div>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="font-medium">Bot ativo</div>
                <div className="text-sm text-muted-foreground">
                  Quando desativado, o bot ignora todas as menções e DMs.
                </div>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>

            <div className="space-y-2">
              <Label>Agente padrão</Label>
              <Select value={defaultAgent} onValueChange={setDefaultAgent}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um agente padrão" />
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

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Overrides por canal</Label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setOverrides([...overrides, { channel: "", agent: "" }])}
                >
                  <Plus className="h-4 w-4 mr-1" /> Adicionar
                </Button>
              </div>
              {overrides.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  Nenhum override. Todos os canais usam o agente padrão.
                </div>
              ) : (
                <div className="space-y-2">
                  {overrides.map((o, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <Input
                        placeholder="C0123456789"
                        value={o.channel}
                        onChange={(e) => {
                          const next = [...overrides];
                          next[i] = { ...o, channel: e.target.value.trim() };
                          setOverrides(next);
                        }}
                        className="w-48 font-mono text-sm"
                      />
                      <Select
                        value={o.agent}
                        onValueChange={(v) => {
                          const next = [...overrides];
                          next[i] = { ...o, agent: v };
                          setOverrides(next);
                        }}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Agente" />
                        </SelectTrigger>
                        <SelectContent>
                          {agents.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setOverrides(overrides.filter((_, idx) => idx !== i))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <Button onClick={save} disabled={upsert.isPending}>
                Salvar configuração
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
