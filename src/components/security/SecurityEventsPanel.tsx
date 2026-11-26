/**
 * SecurityEventsPanel — trilha real de `public.security_events`.
 *
 * Fonte: tabela escrita apenas pelo service_role (hoje só `lgpd-manager`, que
 * registra toda ação LGPD — exportação, exclusão, consentimento). A RLS libera
 * SELECT só para admin do workspace, então lista vazia pode significar "sem
 * eventos" ou "sem permissão" — o painel diz qual dos dois.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldAlert, Loader2, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getSecurityEvents, type SecurityEventRow } from '@/services/securityService';
import { useRBAC } from '@/hooks/useRBAC';
import { cn } from '@/lib/utils';

const SEVERITY_FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'critical', label: 'Críticos' },
  { value: 'warning', label: 'Avisos' },
  { value: 'info', label: 'Informação' },
] as const;

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-destructive/10 text-destructive border-destructive/30',
  warning: 'bg-nexus-amber/10 text-nexus-amber border-nexus-amber/30',
  info: 'bg-nexus-cyan/10 text-nexus-cyan border-nexus-cyan/30',
};

export function SecurityEventsPanel() {
  const [severity, setSeverity] = useState<string>('');
  const { isAdmin, loading: rbacLoading } = useRBAC();

  const { data: events = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['security_events', severity],
    queryFn: () => getSecurityEvents({ severity: severity || undefined, limit: 100 }),
  });

  const loading = isLoading || rbacLoading;
  const criticals = events.filter((e) => e.severity === 'critical').length;

  return (
    <div className="nexus-card">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="text-body-sm font-heading font-semibold text-foreground flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-destructive" /> Eventos de Segurança
          {criticals > 0 && (
            <Badge variant="outline" className={cn('text-meta', SEVERITY_STYLES.critical)}>
              {criticals} crítico{criticals > 1 ? 's' : ''}
            </Badge>
          )}
        </h3>
        <div className="flex items-center gap-1.5">
          {SEVERITY_FILTERS.map((f) => (
            <Button
              key={f.value || 'all'}
              variant={severity === f.value ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 text-meta"
              onClick={() => setSeverity(f.value)}
            >
              {f.label}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-meta gap-1"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn('h-3 w-3', isFetching && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : events.length === 0 ? (
        <p className="text-meta text-muted-foreground py-4 text-center">
          {isAdmin
            ? 'Nenhum evento de segurança registrado para este workspace.'
            : 'Somente administradores do workspace veem esta trilha.'}
        </p>
      ) : (
        <div className="space-y-1 max-h-[360px] overflow-y-auto">
          {events.map((event) => (
            <SecurityEventRowItem key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}

function SecurityEventRowItem({ event }: { event: SecurityEventRow }) {
  const hasDetails = event.details && Object.keys(event.details).length > 0;
  return (
    <details className="group rounded hover:bg-secondary/30">
      <summary className="flex items-center gap-3 py-2 px-2 text-meta cursor-pointer list-none">
        <span className="text-muted-foreground w-[130px] shrink-0 font-mono">
          {new Date(event.created_at).toLocaleString('pt-BR')}
        </span>
        <Badge variant="outline" className="text-meta shrink-0">{event.event_type}</Badge>
        <Badge
          variant="outline"
          className={cn('text-meta shrink-0', SEVERITY_STYLES[event.severity] ?? SEVERITY_STYLES.info)}
        >
          {event.severity}
        </Badge>
        <span className="text-foreground truncate">
          {event.ip_address ? `IP ${event.ip_address}` : 'IP não registrado'}
        </span>
        <span className="text-muted-foreground ml-auto shrink-0 font-mono">
          {event.user_id ? event.user_id.slice(0, 8) : 'sistema'}
        </span>
      </summary>
      <div className="px-2 pb-2">
        {hasDetails ? (
          <pre className="text-meta bg-secondary/40 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
            {JSON.stringify(event.details, null, 2)}
          </pre>
        ) : (
          <p className="text-meta text-muted-foreground">Sem detalhes adicionais.</p>
        )}
        {event.user_agent && (
          <p className="text-meta text-muted-foreground mt-1 break-all">{event.user_agent}</p>
        )}
      </div>
    </details>
  );
}
