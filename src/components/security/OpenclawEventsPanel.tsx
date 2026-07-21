/**
 * OpenclawEventsPanel — últimos eventos emitidos pelas Edge Functions do OpenClaw.
 * Fonte: tabela public.openclaw_events (workspace-scoped via RLS).
 */
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Loader2 } from 'lucide-react';
import { supabaseExternal } from '@/integrations/supabase/externalClient';
import { logger } from '@/lib/logger';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface OpenclawEvent {
  id: string;
  kind: string;
  level: 'info' | 'warn' | 'error';
  source: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

const LEVEL_STYLES: Record<OpenclawEvent['level'], string> = {
  info: 'bg-nexus-cyan/10 text-nexus-cyan border-nexus-cyan/30',
  warn: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
  error: 'bg-destructive/10 text-destructive border-destructive/30',
};

export function OpenclawEventsPanel() {
  const [events, setEvents] = useState<OpenclawEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [counters, setCounters] = useState({ total: 0, errors: 0, warns: 0 });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data, error } = await supabaseExternal
          .from('openclaw_events')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);
        if (error) throw error;
        if (!mounted) return;
        const rows = (data ?? []) as unknown as OpenclawEvent[];
        setEvents(rows);
        const recent = rows.filter((r) => r.created_at >= since);
        setCounters({
          total: recent.length,
          errors: recent.filter((r) => r.level === 'error').length,
          warns: recent.filter((r) => r.level === 'warn').length,
        });
      } catch (err) {
        logger.error('Failed to load openclaw events', err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-title-sm">
          <Activity className="h-4 w-4 text-nexus-cyan" /> OpenClaw — Eventos (últimos 100)
          <span className="ml-auto flex items-center gap-2">
            <Badge variant="outline">{counters.total} / 24h</Badge>
            {counters.errors > 0 && (
              <Badge className="bg-destructive/10 text-destructive border-destructive/30">
                {counters.errors} erros
              </Badge>
            )}
            {counters.warns > 0 && (
              <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/30">
                {counters.warns} alertas
              </Badge>
            )}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40" />
          </div>
        ) : events.length === 0 ? (
          <p className="text-body-sm text-muted-foreground text-center py-8">
            Nenhum evento OpenClaw registrado ainda.
          </p>
        ) : (
          <div className="space-y-1 max-h-[420px] overflow-y-auto">
            {events.map((ev) => (
              <div
                key={ev.id}
                className="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-muted/40 transition-colors"
              >
                <Badge variant="outline" className={LEVEL_STYLES[ev.level]}>
                  {ev.level}
                </Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-body-sm font-medium text-foreground truncate">
                    <span className="font-mono">{ev.kind}</span>
                    {ev.source && (
                      <span className="text-muted-foreground"> · {ev.source}</span>
                    )}
                  </p>
                  {ev.payload && Object.keys(ev.payload).length > 0 && (
                    <p className="text-meta text-muted-foreground truncate font-mono">
                      {JSON.stringify(ev.payload)}
                    </p>
                  )}
                </div>
                <span className="text-meta text-muted-foreground whitespace-nowrap">
                  {format(new Date(ev.created_at), 'dd/MM HH:mm:ss', { locale: ptBR })}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
