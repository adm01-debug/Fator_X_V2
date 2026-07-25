/**
 * MemoryTierBadge — visual do tier de uma memória (autograph-style).
 *
 * Tiers: core → active → warm → cold → archive.
 * Aparece na listagem de memórias e na página SuperCerebro/Memory.
 */
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Pin } from "lucide-react";

export type MemoryTier = "core" | "active" | "warm" | "cold" | "archive";

const TIER_LABEL: Record<MemoryTier, string> = {
  core: "Núcleo",
  active: "Ativa",
  warm: "Morna",
  cold: "Fria",
  archive: "Arquivo",
};

const TIER_TONE: Record<MemoryTier, string> = {
  core: "bg-primary/15 text-primary border-primary/30",
  active: "bg-success/15 text-success border-success/30",
  warm: "bg-warning/15 text-warning border-warning/30",
  cold: "bg-muted text-muted-foreground border-border",
  archive: "bg-secondary text-secondary-foreground border-border opacity-70",
};

interface MemoryTierBadgeProps {
  tier: MemoryTier;
  pinned?: boolean;
  className?: string;
}

export function MemoryTierBadge({ tier, pinned = false, className }: MemoryTierBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 text-meta font-medium", TIER_TONE[tier], className)}
      title={`Tier: ${TIER_LABEL[tier]}${pinned ? " · fixada" : ""}`}
    >
      {pinned && <Pin className="h-3 w-3" aria-hidden />}
      {TIER_LABEL[tier]}
    </Badge>
  );
}
