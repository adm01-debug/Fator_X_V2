/**
 * useSlackConfig — Slack integration config (Módulo 1)
 *
 * Reads/writes:
 *  - slack_workspace_config (workspace-scoped, one row per workspace)
 *  - slack_channel_routes   (list of routes)
 *
 * All queries are workspace-scoped and rely on RLS for admin gating.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "./useCurrentWorkspace";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

export type SlackSeverity = "info" | "warning" | "error" | "critical";
export type SlackCategory =
  | "security_alert"
  | "partition_automation_failure"
  | "circuit_breaker"
  | "high_cost"
  | "agent_failure"
  | "system_error"
  | "custom";

export interface SlackWorkspaceConfig {
  id: string;
  workspace_id: string;
  slack_team_id: string;
  slack_team_name: string | null;
  bot_user_id: string;
  bot_display_name: string | null;
  installed_at: string;
  last_verified_at: string | null;
  is_active: boolean;
}

export interface SlackChannelRoute {
  id: string;
  workspace_id: string;
  category: SlackCategory;
  category_label: string | null;
  channel_id: string;
  channel_name: string | null;
  min_severity: SlackSeverity;
  enabled: boolean;
  mention_users: string[];
  created_at: string;
  updated_at: string;
}

export interface UpsertRouteInput {
  id?: string;
  category: SlackCategory;
  category_label?: string;
  channel_id: string;
  channel_name?: string;
  min_severity: SlackSeverity;
  enabled: boolean;
  mention_users?: string[];
}

const CONFIG_KEY = (ws: string | null) => ["slack", "config", ws] as const;
const ROUTES_KEY = (ws: string | null) => ["slack", "routes", ws] as const;

export function useSlackConfig() {
  const { workspaceId } = useCurrentWorkspace();
  const qc = useQueryClient();

  const configQuery = useQuery({
    queryKey: CONFIG_KEY(workspaceId),
    enabled: !!workspaceId,
    queryFn: async (): Promise<SlackWorkspaceConfig | null> => {
      const { data, error } = await supabase
        .from("slack_workspace_config")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .maybeSingle();
      if (error) throw error;
      return (data as SlackWorkspaceConfig) ?? null;
    },
  });

  const routesQuery = useQuery({
    queryKey: ROUTES_KEY(workspaceId),
    enabled: !!workspaceId,
    queryFn: async (): Promise<SlackChannelRoute[]> => {
      const { data, error } = await supabase
        .from("slack_channel_routes")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data as SlackChannelRoute[]) ?? [];
    },
  });

  const upsertRoute = useMutation({
    mutationFn: async (input: UpsertRouteInput) => {
      if (!workspaceId) throw new Error("Workspace não identificado");
      const payload = {
        ...input,
        workspace_id: workspaceId,
        mention_users: input.mention_users ?? [],
      };
      const { data, error } = await supabase
        .from("slack_channel_routes")
        .upsert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as SlackChannelRoute;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ROUTES_KEY(workspaceId) });
      toast.success("Rota Slack salva");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Falha ao salvar rota";
      logger.error("upsertRoute failed", { error: msg });
      toast.error(msg);
    },
  });

  const deleteRoute = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("slack_channel_routes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ROUTES_KEY(workspaceId) });
      toast.success("Rota removida");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Falha ao remover rota";
      toast.error(msg);
    },
  });

  const testRoute = useMutation({
    mutationFn: async (route: SlackChannelRoute) => {
      if (!workspaceId) throw new Error("Workspace não identificado");
      const { data, error } = await supabase.functions.invoke("slack-alert-dispatcher", {
        body: {
          test: true,
          alert: {
            workspace_id: workspaceId,
            category: route.category,
            severity: route.min_severity,
            title: `Teste de alerta — ${route.category_label ?? route.category}`,
            description:
              "Este é um alerta de teste enviado pelo Nexus para validar a rota configurada.",
            metadata: { origin: "manual_test", route_id: route.id },
          },
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => toast.success("Mensagem de teste enviada ao Slack"),
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Falha no teste";
      toast.error(msg);
    },
  });

  return {
    workspaceId,
    config: configQuery.data ?? null,
    isConfigured: !!configQuery.data?.is_active,
    routes: routesQuery.data ?? [],
    loading: configQuery.isLoading || routesQuery.isLoading,
    upsertRoute,
    deleteRoute,
    testRoute,
  };
}
