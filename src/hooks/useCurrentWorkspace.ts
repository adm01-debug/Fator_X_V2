/**
 * useCurrentWorkspace — resolve o workspace_id do usuário logado.
 * Retorna a primeira associação em workspace_members (compat com fluxos single-workspace).
 */
import { useEffect, useState } from "react";
import { supabaseExternal } from "@/integrations/supabase/externalClient";
import { useAuth } from "@/contexts/AuthContext";
import { logger } from "@/lib/logger";

export function useCurrentWorkspace(): { workspaceId: string | null; loading: boolean } {
  const { user } = useAuth();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setWorkspaceId(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabaseExternal
          .from("workspace_members")
          .select("workspace_id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();
        if (cancelled) return;
        if (error) throw error;
        setWorkspaceId((data?.workspace_id as string | undefined) ?? null);
      } catch (e) {
        if (!cancelled) {
          logger.error("useCurrentWorkspace failed", {
            error: e instanceof Error ? e.message : String(e),
          });
          setWorkspaceId(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return { workspaceId, loading };
}
