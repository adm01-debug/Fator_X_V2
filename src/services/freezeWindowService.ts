import { supabase } from "@/integrations/supabase/client";

export interface FreezeWindow {
  id: string;
  workspace_id: string;
  name: string;
  reason: string | null;
  starts_at: string;
  ends_at: string;
  allow_emergency: boolean;
  created_by: string;
  created_at: string;
}

export async function listFreezeWindows(workspaceId: string): Promise<FreezeWindow[]> {
  const { data, error } = await supabase
    .from("freeze_windows")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("starts_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FreezeWindow[];
}

export async function createFreezeWindow(
  workspaceId: string,
  input: {
    name: string;
    reason?: string | null;
    starts_at: string;
    ends_at: string;
    allow_emergency?: boolean;
  },
): Promise<FreezeWindow> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Sessão inválida");
  const { data, error } = await supabase
    .from("freeze_windows")
    .insert({
      workspace_id: workspaceId,
      name: input.name,
      reason: input.reason ?? null,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      allow_emergency: input.allow_emergency ?? true,
      created_by: userId,
    })
    .select()
    .single();
  if (error) throw error;
  return data as FreezeWindow;
}

export async function updateFreezeWindow(
  id: string,
  patch: Partial<Pick<FreezeWindow, "allow_emergency" | "name" | "reason" | "starts_at" | "ends_at">>,
): Promise<FreezeWindow> {
  const { data, error } = await supabase
    .from("freeze_windows")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as FreezeWindow;
}

export async function deleteFreezeWindow(id: string): Promise<void> {
  const { error } = await supabase.from("freeze_windows").delete().eq("id", id);
  if (error) throw error;
}
