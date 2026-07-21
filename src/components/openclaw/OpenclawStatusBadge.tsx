import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { getOpenclawHealth } from "@/services/openclawDeployService";
import { cn } from "@/lib/utils";

interface OpenclawStatusBadgeProps {
  className?: string;
  showLabel?: boolean;
}

/**
 * Reusable OpenClaw runtime status indicator.
 * Polls /health every 30s through the openclaw-proxy Edge Function.
 */
export function OpenclawStatusBadge({ className, showLabel = true }: OpenclawStatusBadgeProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["openclaw-health"],
    queryFn: getOpenclawHealth,
    retry: false,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const ok = !!data && !error && (data.status === "ok" || data.status === "healthy");

  return (
    <Badge
      variant="outline"
      aria-label={`OpenClaw ${ok ? "online" : "offline"}`}
      className={cn(
        "gap-1.5",
        ok ? "border-nexus-emerald/50 text-nexus-emerald" : "border-destructive/50 text-destructive",
        className,
      )}
    >
      {isLoading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : ok ? (
        <CheckCircle2 className="h-3 w-3" />
      ) : (
        <XCircle className="h-3 w-3" />
      )}
      {showLabel && <span>{isLoading ? "Checando" : ok ? "OpenClaw Online" : "OpenClaw Offline"}</span>}
    </Badge>
  );
}
