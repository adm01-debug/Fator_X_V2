import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

export type CodeRuntime = "python" | "node" | "deno";

export interface CodeExecution {
  id: string;
  user_id: string;
  workspace_id: string | null;
  runtime: CodeRuntime;
  code: string;
  stdout: string;
  stderr: string;
  exit_code: number | null;
  files: Array<{ name: string; size: number }>;
  duration_ms: number;
  memory_mb: number;
  status: "pending" | "running" | "completed" | "failed" | "timeout";
  simulated: boolean;
  error_message: string | null;
  created_at: string;
}

export const codeInterpreterService = {
  async execute(runtime: CodeRuntime, code: string, workspace_id?: string): Promise<CodeExecution> {
    const { data, error } = await supabase.functions.invoke("code-interpreter-execute", {
      body: { runtime, code, workspace_id },
    });
    if (error) throw error;
    return data as CodeExecution;
  },

  async streamExecute(
    runtime: CodeRuntime, 
    code: string, 
    onEvent: (event: string, data: any) => void,
    workspace_id?: string
  ): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Não autenticado");

    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/code-interpreter-execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ runtime, code, workspace_id, stream: true }),
    });

    if (!response.ok) throw new Error(`Falha no streaming: ${response.statusText}`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Corpo da resposta vazio");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        const eventMatch = line.match(/^event: (.*)$/m);
        const dataMatch = line.match(/^data: (.*)$/m);
        if (eventMatch && dataMatch) {
          try {
            onEvent(eventMatch[1], JSON.parse(dataMatch[1]));
          } catch (e) {
            logger.error("Erro ao processar evento SSE no codeInterpreterService", e);
          }
        }
      }
    }
  },

  async list(limit = 20): Promise<CodeExecution[]> {
    const { data, error } = await supabase
      .from("code_executions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as unknown as CodeExecution[];
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from("code_executions").delete().eq("id", id);
    if (error) throw error;
  },

  async clearAll(): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("code_executions").delete().eq("user_id", user.id);
    if (error) throw error;
  },
};
