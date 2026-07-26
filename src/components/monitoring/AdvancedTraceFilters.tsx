/**
 * AdvancedTraceFilters — Date range, latency range, cost range, level filter for monitoring.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, SlidersHorizontal } from 'lucide-react';

export interface TraceFilters {
  dateFrom: string;
  dateTo: string;
  minLatency: string;
  maxLatency: string;
  minCost: string;
  maxCost: string;
  level: string;
  event: string;
}

const EMPTY_FILTERS: TraceFilters = {
  dateFrom: '',
  dateTo: '',
  minLatency: '',
  maxLatency: '',
  minCost: '',
  maxCost: '',
  level: 'all',
  event: '',
};

interface Props {
  filters: TraceFilters;
  onChange: (filters: TraceFilters) => void;
}

export function AdvancedTraceFilters({ filters, onChange }: Props) {
  const [expanded, setExpanded] = useState(false);
  
  const activeCount = Object.entries(filters).filter(([k, v]) => {
    if (k === 'level') return v !== 'all';
    return v !== '';
  }).length;

  const handleClear = () => onChange(EMPTY_FILTERS);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          variant={expanded ? 'default' : 'outline'}
          size="sm"
          className="gap-1.5 text-meta h-8"
          onClick={() => setExpanded(!expanded)}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filtros avançados
          {activeCount > 0 && (
            <Badge variant="secondary" className="text-meta h-4 px-1 ml-1">{activeCount}</Badge>
          )}
        </Button>
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" className="gap-1 text-meta h-7 text-muted-foreground" onClick={handleClear}>
            <X className="h-3 w-3" /> Limpar
          </Button>
        )}
      </div>

      {expanded && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 rounded-lg bg-secondary/30 border border-border/30 animate-fade-in">
          <div className="space-y-1">
            <label htmlFor="tf-date-from" className="text-meta font-medium text-muted-foreground">Data início</label>
            <Input
              id="tf-date-from"
              type="date"
              value={filters.dateFrom}
              onChange={e => onChange({ ...filters, dateFrom: e.target.value })}
              className="h-8 text-meta bg-background"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="tf-date-to" className="text-meta font-medium text-muted-foreground">Data fim</label>
            <Input
              id="tf-date-to"
              type="date"
              value={filters.dateTo}
              onChange={e => onChange({ ...filters, dateTo: e.target.value })}
              className="h-8 text-meta bg-background"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="tf-min-latency" className="text-meta font-medium text-muted-foreground">Latência mín (ms)</label>
            <Input
              id="tf-min-latency"
              type="number"
              placeholder="0"
              value={filters.minLatency}
              onChange={e => onChange({ ...filters, minLatency: e.target.value })}
              className="h-8 text-meta bg-background"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="tf-max-latency" className="text-meta font-medium text-muted-foreground">Latência máx (ms)</label>
            <Input
              id="tf-max-latency"
              type="number"
              placeholder="∞"
              value={filters.maxLatency}
              onChange={e => onChange({ ...filters, maxLatency: e.target.value })}
              className="h-8 text-meta bg-background"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="tf-min-cost" className="text-meta font-medium text-muted-foreground">Custo mín ($)</label>
            <Input
              id="tf-min-cost"
              type="number"
              step="0.001"
              placeholder="0"
              value={filters.minCost}
              onChange={e => onChange({ ...filters, minCost: e.target.value })}
              className="h-8 text-meta bg-background"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="tf-max-cost" className="text-meta font-medium text-muted-foreground">Custo máx ($)</label>
            <Input
              id="tf-max-cost"
              type="number"
              step="0.001"
              placeholder="∞"
              value={filters.maxCost}
              onChange={e => onChange({ ...filters, maxCost: e.target.value })}
              className="h-8 text-meta bg-background"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="tf-level" className="text-meta font-medium text-muted-foreground">Nível</label>
            <Select value={filters.level} onValueChange={v => onChange({ ...filters, level: v })}>
              <SelectTrigger id="tf-level" className="h-8 text-meta bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="debug">Debug</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label htmlFor="tf-event" className="text-meta font-medium text-muted-foreground">Evento</label>
            <Input
              id="tf-event"
              placeholder="Buscar evento..."
              value={filters.event}
              onChange={e => onChange({ ...filters, event: e.target.value })}
              className="h-8 text-meta bg-background"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export interface FilterableTrace {
  created_at: string;
  latency_ms?: number | null;
  cost_usd?: number | string | null;
  level?: string | null;
  event?: string | null;
}

 
export function applyTraceFilters<T extends FilterableTrace>(traces: T[], filters: TraceFilters): T[] {
  return traces.filter(t => {
    if (filters.dateFrom) {
      const traceDate = new Date(t.created_at).toISOString().split('T')[0];
      if (traceDate < filters.dateFrom) return false;
    }
    if (filters.dateTo) {
      const traceDate = new Date(t.created_at).toISOString().split('T')[0];
      if (traceDate > filters.dateTo) return false;
    }
    if (filters.minLatency && t.latency_ms != null && t.latency_ms < Number(filters.minLatency)) return false;
    if (filters.maxLatency && t.latency_ms != null && t.latency_ms > Number(filters.maxLatency)) return false;
    if (filters.minCost && t.cost_usd != null && Number(t.cost_usd) < Number(filters.minCost)) return false;
    if (filters.maxCost && t.cost_usd != null && Number(t.cost_usd) > Number(filters.maxCost)) return false;
    if (filters.level !== 'all' && t.level !== filters.level) return false;
    if (filters.event && !t.event?.toLowerCase().includes(filters.event.toLowerCase())) return false;
    return true;
  });
}

 
export { EMPTY_FILTERS };
