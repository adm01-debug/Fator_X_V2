/**
 * Client-side mirror of the Autograph memory-tier thresholds.
 * Fonte de verdade: public.recompute_memory_tier() + supabase/functions/_shared/memory-tiers.ts
 */
export type MemoryTier = "core" | "active" | "warm" | "cold" | "archive";

export const MEMORY_TIERS: MemoryTier[] = ["core", "active", "warm", "cold", "archive"];

export function computeTier(relevance: number, pinned = false): MemoryTier {
  if (pinned) return "core";
  if (!Number.isFinite(relevance) || relevance < 0) return "archive";
  if (relevance >= 3.0) return "core";
  if (relevance >= 1.5) return "active";
  if (relevance >= 0.5) return "warm";
  if (relevance >= 0.1) return "cold";
  return "archive";
}

export const TIER_LABEL_PT: Record<MemoryTier | "all", string> = {
  all: "Todos os tiers",
  core: "Núcleo",
  active: "Ativa",
  warm: "Morna",
  cold: "Fria",
  archive: "Arquivo",
};
