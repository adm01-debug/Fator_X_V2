import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Trash2, Eye, FileText, Clock, Filter, Play, Download, FileJson } from 'lucide-react';
import {
  fetchOracleHistory,
  deleteOracleHistory,
  type OracleHistoryEntry,
  type HistoryFilters,
} from '@/lib/oracleHistory';
import { exportToMarkdown, downloadText, exportToPdf, exportToJson } from '@/lib/oracleExport';
import {
  useOracleStore,
  ORACLE_MODES,
  ORACLE_PRESETS,
  type OracleMode,
} from '@/stores/oracleStore';
import { toast } from 'sonner';

interface OracleHistoryProps {
  onClose?: () => void;
}

export function OracleHistory({ onClose }: OracleHistoryProps) {
  const store = useOracleStore();
  const [entries, setEntries] = useState<OracleHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<HistoryFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchOracleHistory(filters);
    setEntries(data);
    setLoading(false);
  }, [filters]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: run-on-mount/derived deps; adding unstable deps would loop
  useEffect(() => {
    load();
  }, [filters]);

  const handleDelete = async (id: string) => {
    if (await deleteOracleHistory(id)) {
      setEntries((prev) => prev.filter((e) => e.id !== id));
      toast.success('Histórico removido');
    }
  };

  const handleExportMd = (entry: OracleHistoryEntry) => {
    const md = exportToMarkdown(
      entry.query,
      entry.results,
      entry.preset_name || entry.preset_id,
      entry.mode,
      entry.chairman_model || '',
    );
    downloadText(md, `oraculo_${entry.id.slice(0, 8)}.md`);
    toast.success('Markdown exportado!');
  };

  const handleExportPdf = (entry: OracleHistoryEntry) => {
    exportToPdf(
      entry.query,
      entry.results,
      entry.preset_name || entry.preset_id,
      entry.mode,
      entry.chairman_model || '',
    );
    toast.success('Relatório PDF gerado!');
  };

  const handleExportJson = (entry: OracleHistoryEntry) => {
    const json = exportToJson(
      entry.query,
      entry.results,
      entry.preset_name || entry.preset_id,
      entry.mode,
      entry.chairman_model || '',
    );
    downloadText(json, `oraculo_${entry.id.slice(0, 8)}.json`);
    toast.success('JSON exportado!');
  };

  if (loading) {
    return (
      <div className="nexus-card text-center py-8 text-body-sm text-muted-foreground">
        Carregando histórico...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-body-sm font-medium text-foreground">
            Histórico ({entries.length})
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowFilters(!showFilters)}
          className="text-meta gap-1"
        >
          <Filter className="h-3.5 w-3.5" /> Filtros
        </Button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="overflow-hidden">
          <div className="p-3 rounded-lg bg-secondary/30 border border-border/30 grid grid-cols-3 gap-3">
            <Select
              value={filters.mode || '__all'}
              onValueChange={(v) =>
                setFilters((f) => ({ ...f, mode: v === '__all' ? undefined : (v as OracleMode) }))
              }
            >
              <SelectTrigger className="h-8 text-meta">
                <SelectValue placeholder="Modo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all" className="text-meta">
                  Todos os modos
                </SelectItem>
                {Object.entries(ORACLE_MODES).map(([k, v]) => (
                  <SelectItem key={k} value={k} className="text-meta">
                    {v.icon} {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.presetId || '__all'}
              onValueChange={(v) =>
                setFilters((f) => ({ ...f, presetId: v === '__all' ? undefined : v }))
              }
            >
              <SelectTrigger className="h-8 text-meta">
                <SelectValue placeholder="Preset" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all" className="text-meta">
                  Todos os presets
                </SelectItem>
                {ORACLE_PRESETS.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-meta">
                    {p.icon} {p.name.replace(/^[^\s]+\s/, '')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              className="h-8 text-meta"
              value={filters.dateFrom || ''}
              onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value || undefined }))}
            />
          </div>
        </div>
      )}

      {/* Entries */}
      {entries.length === 0 ? (
        <div className="nexus-card text-center py-8 text-body-sm text-muted-foreground">
          Nenhuma consulta no histórico
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => {
            const modeConf = ORACLE_MODES[entry.mode as OracleMode];
            return (
              <div key={entry.id} className="nexus-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-meta text-foreground line-clamp-2 font-medium">
                      {entry.query}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <Badge variant="outline" className="text-meta">
                        {modeConf?.icon} {modeConf?.label}
                      </Badge>
                      <Badge variant="outline" className="text-meta text-muted-foreground">
                        {entry.preset_name || entry.preset_id}
                      </Badge>
                      {entry.confidence_score != null && (
                        <Badge
                          variant="outline"
                          className={`text-meta ${Number(entry.confidence_score) >= 80 ? 'text-nexus-emerald border-nexus-emerald/30' : Number(entry.confidence_score) >= 50 ? 'text-nexus-amber border-nexus-amber/30' : 'text-nexus-rose border-nexus-rose/30'}`}
                        >
                          {entry.confidence_score}%
                        </Badge>
                      )}
                      <span className="text-meta text-muted-foreground">
                        {new Date(entry.created_at).toLocaleString('pt-BR')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-nexus-emerald hover:bg-nexus-emerald/10"
                      onClick={() => {
                        store.replayEntry(entry.results);
                        onClose?.();
                        toast.info('Iniciando replay da sessão histórica...');
                      }}
                    >
                      <Play className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => handleExportMd(entry)}
                      title="Exportar MD"
                    >
                      <FileText className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => handleExportPdf(entry)}
                      title="Exportar PDF"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => handleExportJson(entry)}
                      title="Exportar JSON"
                    >
                      <FileJson className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      onClick={() => handleDelete(entry.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {expandedId === entry.id && (
                  <div className="overflow-hidden mt-3 pt-3 border-t border-border/30">
                    <div className="text-meta text-foreground whitespace-pre-wrap max-h-[300px] overflow-y-auto bg-secondary/30 p-3 rounded-lg">
                      {entry.results?.final_response || 'Sem resposta'}
                    </div>
                    <div className="flex gap-2 mt-2 text-meta text-muted-foreground">
                      <span>💰 ${Number(entry.total_cost_usd || 0).toFixed(4)}</span>
                      <span>⏱️ {((entry.total_latency_ms || 0) / 1000).toFixed(1)}s</span>
                      <span>📊 {entry.total_tokens?.toLocaleString()} tokens</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
