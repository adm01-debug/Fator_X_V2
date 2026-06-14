import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getUnresolvedAlerts, subscribeToAlerts } from '@/services/dashboardService';

interface Alert {
  id: string;
  title: string;
  severity: string;
  created_at?: string | null;
  is_resolved?: boolean | null;
}

export function DashboardAlerts() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: alerts = [] } = useQuery({
    queryKey: ['dashboard_alerts'],
    queryFn: () => getUnresolvedAlerts(5),
    retry: 1,
  });

  useEffect(() => {
    return subscribeToAlerts(() => {
      queryClient.invalidateQueries({ queryKey: ['dashboard_alerts'] });
    });
  }, [queryClient]);

  if (alerts.length === 0) return null;

  return (
    <div className="nexus-card border-destructive/20 bg-destructive/5 relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-24 h-24 bg-destructive/[0.03] rounded-full blur-xl -translate-y-1/2 translate-x-1/2" />
      <div className="flex items-center justify-between mb-3 relative">
        <h3 className="text-sm font-heading font-semibold text-foreground flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-destructive animate-ping" />
          Alertas Críticos ({alerts.length})
        </h3>
        <button onClick={() => navigate('/monitoring')} className="text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors bg-primary/10 px-2 py-0.5 rounded">Ver todos</button>
      </div>
      <div className="space-y-2 relative">
        {alerts.map((a: Alert) => (
          <div
            key={a.id}
            role="button"
            tabIndex={0}
            className="flex items-center gap-3 text-xs p-2 rounded-lg bg-background/50 border border-border/50 hover:border-destructive/30 transition-all cursor-pointer group/alert"
            onClick={() => navigate('/monitoring')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                navigate('/monitoring');
              }
            }}
          >
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${a.severity === 'critical' ? 'bg-destructive shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-nexus-amber'}`} />
            <span className="text-foreground font-medium truncate flex-1">{a.title}</span>
            <span className="text-muted-foreground shrink-0 text-[10px] font-mono opacity-60">{new Date(a.created_at || '').toLocaleDateString('pt-BR')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
