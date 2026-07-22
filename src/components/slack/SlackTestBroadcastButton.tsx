/**
 * SlackTestBroadcastButton — Fase 5
 * Dispara um alerta de teste em todas as rotas ativas para popular o health card.
 */
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";

export function SlackTestBroadcastButton() {
  const { workspaceId } = useCurrentWorkspace();

  const broadcast = useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error("Workspace não identificado");
      const { data, error } = await supabase.functions.invoke("slack-alert-dispatcher", {
        body: {
          test: true,
          alert: {
            workspace_id: workspaceId,
            category: "custom",
            severity: "info",
            title: "Teste de broadcast",
            description: "Este é um broadcast de teste enviado pelo Nexus.",
            metadata: { origin: "manual_broadcast" },
          },
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => toast.success("Broadcast de teste enviado"),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Falha no broadcast"),
  });

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => broadcast.mutate()}
      disabled={broadcast.isPending}
    >
      <Send className="h-3.5 w-3.5 mr-1" />
      {broadcast.isPending ? "Enviando…" : "Broadcast de teste"}
    </Button>
  );
}
