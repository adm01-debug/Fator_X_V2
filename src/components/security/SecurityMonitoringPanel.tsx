import { useState, useEffect, useCallback } from "react";
import { ShieldAlert, ShieldCheck, CheckCircle, Loader2, Bell, Clock, Filter } from "lucide-react";
import { supabaseExternal } from "@/integrations/supabase/externalClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { logger } from "@/lib/logger";

interface SecurityAlert {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  message: string;
  metadata: Record<string, unknown>;
  is_resolved: boolean;
  created_at: string;
}

export function SecurityMonitoringPanel() {
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unresolved'>('unresolved');

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabaseExternal
        .from('security_alerts')
        .select('*')
        .order('created_at', { ascending: false });

      if (filter === 'unresolved') {
        query = query.eq('is_resolved', false);
      }

      const { data, error } = await query;
      if (error) throw error;
      setAlerts((data || []) as unknown as SecurityAlert[]);
    } catch (err) {
      logger.error('Failed to load alerts', err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadAlerts();

    // Subscribe to new alerts
    const channel = (supabaseExternal as unknown as {
      channel: (name: string) => {
        on: (
          event: string,
          filter: { event: string; table: string },
          cb: (payload: { new: SecurityAlert }) => void,
        ) => { subscribe: () => unknown };
      };
    })
      .channel('security_alerts_changes')
      .on('postgres_changes', { event: 'INSERT', table: 'security_alerts' }, (payload) => {
        setAlerts(prev => [payload.new, ...prev]);
        toast.error(`Alerta de Segurança: ${payload.new.message}`);
      })
      .subscribe();

    return () => {
      supabaseExternal.removeChannel(channel as Parameters<typeof supabaseExternal.removeChannel>[0]);
    };
  }, [loadAlerts]);

  async function resolveAlert(id: string) {
    try {
      const { error } = await supabaseExternal
        .from('security_alerts')
        .update({ is_resolved: true, resolved_at: new Date().toISOString() })
        .eq('id', id);
      
      if (error) throw error;
      setAlerts(prev => prev.filter(a => a.id !== id));
      toast.success('Alerta resolvido');
    } catch {
      toast.error('Falha ao resolver alerta');
    }
  }

  const getSeverityColor = (sev: string) => {
    switch (sev) {
      case 'critical': return 'bg-destructive/20 text-destructive border-destructive/30';
      case 'high': return 'bg-orange-500/20 text-orange-500 border-orange-500/30';
      case 'medium': return 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30';
      default: return 'bg-blue-500/20 text-blue-500 border-blue-500/30';
    }
  };

  return (
    <Card className="border-border/40 shadow-sm overflow-hidden bg-card/50 backdrop-blur-sm">
      <CardHeader className="border-b border-border/40 bg-muted/20">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" /> Central de Monitoramento
            </CardTitle>
            <CardDescription>Alertas em tempo real sobre RLS e RBAC</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Tabs value={filter} onValueChange={(v) => { setFilter(v as 'all' | 'unresolved'); loadAlerts(); }} className="w-auto">
              <TabsList className="h-8 p-1 bg-secondary/50">
                <TabsTrigger value="unresolved" className="text-[10px] px-3 h-6">Pendentes</TabsTrigger>
                <TabsTrigger value="all" className="text-[10px] px-3 h-6">Todos</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={loadAlerts}>
              <Filter className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-primary/20" />
            <p className="text-sm font-medium text-muted-foreground animate-pulse">Sincronizando...</p>
          </div>
        ) : alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <div className="h-16 w-16 rounded-full bg-nexus-emerald/10 flex items-center justify-center mb-4">
              <ShieldCheck className="h-8 w-8 text-nexus-emerald" />
            </div>
            <h3 className="text-lg font-bold text-foreground">Sistema Íntegro</h3>
            <p className="text-sm text-muted-foreground max-w-xs mt-2 font-medium">
              Nenhum alerta detectado.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {alerts.map((alert) => (
              <div key={alert.id} className="p-5 flex items-start gap-4 hover:bg-muted/30 transition-colors group">
                <div className={cn("p-2 rounded-xl border", getSeverityColor(alert.severity))}>
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[9px] uppercase tracking-widest font-black py-0 px-1.5 h-4">
                        {alert.category}
                      </Badge>
                      <span className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
                        <Clock className="h-3 w-3" />
                        {format(new Date(alert.created_at), "HH:mm, dd 'de' MMM", { locale: ptBR })}
                      </span>
                    </div>
                    {!alert.is_resolved && (
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="opacity-0 group-hover:opacity-100 h-7 text-[10px] px-2 rounded-lg hover:bg-nexus-emerald/10 hover:text-nexus-emerald"
                        onClick={() => resolveAlert(alert.id)}
                      >
                        <CheckCircle className="h-3 w-3 mr-1" /> Resolver
                      </Button>
                    )}
                  </div>
                  <h4 className="text-sm font-bold text-foreground leading-snug">{alert.message}</h4>
                  {alert.metadata && Object.keys(alert.metadata).length > 0 && (
                    <div className="bg-secondary/20 p-2 rounded-lg border border-border/20 mt-2">
                      <pre className="text-[10px] font-mono text-muted-foreground overflow-auto">
                        {JSON.stringify(alert.metadata, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function cn(...inputs: unknown[]) {
  return inputs.filter(Boolean).join(' ');
}
