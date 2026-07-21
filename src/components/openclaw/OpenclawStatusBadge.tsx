import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react";
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

  const misconfigured = !!data?.configError;
  const ok = !!data && !error && !misconfigured && (data.status === "ok" || data.status === "healthy");

  const label = isLoading
    ? "Checando"
    : misconfigured
      ? "OpenClaw Mal Configurado"
      : ok
        ? "OpenClaw Online"
        : "OpenClaw Offline";

  return (
    <Badge
      variant="outline"
      aria-label={`OpenClaw ${misconfigured ? "mal configurado" : ok ? "online" : "offline"}`}
      title={data?.configError?.message}
      className={cn(
        "gap-1.5",
        misconfigured
          ? "border-nexus-amber/50 text-nexus-amber"
          : ok
            ? "border-nexus-emerald/50 text-nexus-emerald"
            : "border-destructive/50 text-destructive",
        className,
      )}
    >
      {isLoading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : misconfigured ? (
        <AlertTriangle className="h-3 w-3" />
      ) : ok ? (
        <CheckCircle2 className="h-3 w-3" />
      ) : (
        <XCircle className="h-3 w-3" />
      )}
      {showLabel && <span>{label}</span>}
    </Badge>
  );
}

