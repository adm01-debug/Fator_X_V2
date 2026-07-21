/**
 * Autograph-style memory tiers helper (portado de smixs/autograph).
 *
 * - computeTier(relevance): mapeia score → tier (core/active/warm/cold/archive)
 * - touchMemory(client, id): RPC atômica que incrementa access_count e atualiza last_accessed_at
 * - pickRandomRecall(client, agentId, probability): sorteia 1 memória em tier=archive p/ colisão criativa
 *
 * Uso típico: quando o retrieval do RAG injeta uma memória no prompt, chame touchMemory
 * fire-and-forget. Para random-recall, cheque a flag `random_recall_enabled` do agente.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type MemoryTier = "core" | "active" | "warm" | "cold" | "archive";

/** Espelha os thresholds usados por public.recompute_memory_tier() no Postgres. */
export function computeTier(relevance: number, pinned = false): MemoryTier {
  if (pinned) return "core";
  if (relevance >= 3.0) return "core";
  if (relevance >= 1.5) return "active";
  if (relevance >= 0.5) return "warm";
  if (relevance >= 0.1) return "cold";
  return "archive";
}

/** Registra acesso à memória (não bloqueia o caller em caso de erro). */
export async function touchMemory(
  client: SupabaseClient,
  memoryId: string,
): Promise<void> {
  try {
    await client.rpc("touch_memory", { p_id: memoryId });
  } catch (e) {
    console.warn("touchMemory failed", { memoryId, error: (e as Error).message });
  }
}

/**
 * Random recall (serendipity): retorna uma memória `archive` aleatória do mesmo agente,
 * ou `null` se não sortear ou não houver candidatos. Marca com prefixo para o LLM entender.
 */
export interface RandomRecallItem {
  id: string;
  content: string;
  memory_type: string;
  serendipity: true;
}

export async function pickRandomRecall(
  client: SupabaseClient,
  agentId: string,
  probability = 0.05,
  auditContext?: { workspaceId?: string | null; userId?: string | null; source?: string },
): Promise<RandomRecallItem | null> {
  if (Math.random() >= probability) return null;
  const { data, error } = await client
    .from("agent_memories_v2")
    .select("id, content, memory_type")
    .eq("agent_id", agentId)
    .eq("memory_tier", "archive")
    .limit(50);
  if (error || !data || data.length === 0) return null;
  const pick = data[Math.floor(Math.random() * data.length)] as {
    id: string;
    content: string;
    memory_type: string;
  };
  // Registra o toque para que memórias resgatadas subam de tier gradualmente.
  await touchMemory(client, pick.id);

  // Auditoria fire-and-forget: registra o disparo da serendipidade para observabilidade.
  try {
    await client.from("audit_events").insert({
      event_type: "memory.random_recall",
      severity: "info",
      workspace_id: auditContext?.workspaceId ?? null,
      user_id: auditContext?.userId ?? null,
      resource_type: "agent_memory",
      resource_id: pick.id,
      metadata: {
        agent_id: agentId,
        memory_type: pick.memory_type,
        probability,
        source: auditContext?.source ?? "pickRandomRecall",
      },
    });
  } catch (e) {
    console.warn("random_recall audit failed", (e as Error).message);
  }

  return {
    id: pick.id,
    content: `[recall aleatório] ${pick.content}`,
    memory_type: pick.memory_type,
    serendipity: true,
  };
}
