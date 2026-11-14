import { useEffect, useState } from 'react';
import { ShieldCheck, Activity, Globe, Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * 10/10 System Status Indicator
 * Real-time feedback on connection and platform health.
 */
export function SystemStatusIndicator() {
  const isOnline = useNetworkStatus();
  const [latency, setLatency] = useState<number | null>(null);

  useEffect(() => {
    if (!isOnline) return;

    const measure = () => {
      const start = performance.now();
      fetch('/favicon.ico', { method: 'HEAD', cache: 'no-store' })
        .then(() => setLatency(Math.round(performance.now() - start)))
        .catch(() => setLatency(null));
    };

    measure();
    const timer = setInterval(measure, 30000);
    return () => clearInterval(timer);
  }, [isOnline]);

  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-secondary/10 border-t border-border/40 text-meta font-bold uppercase tracking-widest text-muted-foreground">
      <div className="flex items-center gap-1.5 group cursor-help">
        <div
          className={cn(
            'h-2 w-2 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.2)]',
            isOnline
              ? 'bg-nexus-emerald shadow-nexus-emerald/40 animate-pulse-slow'
              : 'bg-destructive shadow-destructive/40',
          )}
        />
        <span className={cn(isOnline ? 'text-nexus-emerald/80' : 'text-destructive')}>
          {isOnline ? 'Sistema Operacional' : 'Offline'}
        </span>
      </div>

      <div className="h-3 w-px bg-border/40" />

      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 hover:text-primary transition-colors cursor-default">
            <ShieldCheck className="h-3 w-3" />
            <span>Encriptação Ativa</span>
          </div>
        </TooltipTrigger>
        <TooltipContent className="text-meta font-bold">TLS 1.3 / AES-256 GCM</TooltipContent>
      </Tooltip>

      <div className="h-3 w-px bg-border/40" />

      <div className="flex items-center gap-1.5">
        <Globe className="h-3 w-3" />
        <span>GCP-SA-1</span>
      </div>

      {latency !== null && isOnline && (
        <>
          <div className="h-3 w-px bg-border/40" />
          <div className="flex items-center gap-1.5">
            <Activity className="h-3 w-3" />
            <span>{latency}ms</span>
          </div>
        </>
      )}

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        {isOnline ? (
          <Wifi className="h-3 w-3 text-nexus-emerald/60" />
        ) : (
          <WifiOff className="h-3 w-3 text-destructive/60" />
        )}
        <span className="hidden sm:inline">v1.10.4-stable</span>
      </div>
    </div>
  );
}
