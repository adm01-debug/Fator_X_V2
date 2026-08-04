/**
 * HarvestCheckpointsCard — varreduras interrompidas prontas para retomada.
 *
 * Torna visível o estado que antes só existia implicitamente: quais monorepos
 * pararam no meio, em que arquivo, e quais já passaram do TTL de 24h (o
 * progresso será descartado ao retomar porque o repositório pode ter mudado).
 */
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { History, Trash2, Loader2, RotateCcw } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  listHarvestCheckpoints,
  deleteHarvestCheckpointByKey,
  deleteStaleHarvestCheckpoints,
  type HarvestCheckpointRow,
} from '@/services/skillHarvestService';

export interface HarvestCheckpointsCardProps {
  /** Preenche o formulário de varredura com os repos do checkpoint. */
  onResume?: (repos: string[]) => void;
  /** Muda para forçar recarga (ex.: após concluir uma varredura). */
  refreshToken?: number;
  className?: string;
}

/** Idade legível sem dependência de lib de datas. */
function formatAge(hours: number): string {
  if (!Number.isFinite(hours)) return 'data desconhecida';
  if (hours < 1) return `há ${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 24) return `há ${Math.round(hours)} h`;
  return `há ${Math.round(hours / 24)} d`;
}

export function HarvestCheckpointsCard({
  onResume,
  refreshToken = 0,
  className,
}: HarvestCheckpointsCardProps) {
  const [rows, setRows] = useState<HarvestCheckpointRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listHarvestCheckpoints());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  const handleDelete = async (repoKey: string) => {
    setRemoving(repoKey);
    try {
      await deleteHarvestCheckpointByKey(repoKey);
      setRows((prev) => prev.filter((r) => r.repoKey !== repoKey));
      toast.success('Retomada descartada');
    } catch (e) {
      toast.error('Não foi possível descartar', {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setRemoving(null);
    }
  };

  /** Estado derivado — nunca duplicado em useState/useEffect. */
  const staleCount = rows.filter((r) => r.stale).length;

  const handlePurgeStale = async () => {
    setPurging(true);
    try {
      const removed = await deleteStaleHarvestCheckpoints();
      setRows((prev) => prev.filter((r) => !r.stale));
      toast.success(
        removed === 1 ? '1 retomada expirada removida' : `${removed} retomadas expiradas removidas`,
      );
    } catch (e) {
      toast.error('Não foi possível limpar as expiradas', {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setPurging(false);
    }
  };

  if (!loading && rows.length === 0) return null;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-body flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            Varreduras interrompidas
          </CardTitle>
          {staleCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void handlePurgeStale()}
              disabled={purging}
              aria-label={`Limpar ${staleCount} varreduras expiradas`}
            >
              {purging ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              )}
              Limpar expiradas ({staleCount})
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <>
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </>
        ) : (
          rows.map((row) => {
            const pct = row.total > 0 ? Math.min(100, (row.offset / row.total) * 100) : 0;
            return (
              <div key={row.repoKey} className="rounded-lg border border-border/60 p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-body-sm font-medium truncate">
                      {row.repos.join(', ') || row.repoKey}
                    </p>
                    <p className="text-meta text-muted-foreground">
                      Arquivo {row.offset}
                      {row.total > 0 ? ` de ${row.total}` : ''} · {row.insertedTotal} candidatos ·{' '}
                      {formatAge(row.ageHours)}
                    </p>
                  </div>
                  {row.stale && (
                    <Badge variant="outline" className="shrink-0 text-meta">
                      Expirado
                    </Badge>
                  )}
                </div>

                {row.total > 0 && <Progress value={pct} className="h-1.5" />}

                <div className="flex items-center gap-2">
                  {!row.stale && onResume && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onResume(row.repos)}
                      disabled={row.repos.length === 0}
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                      Retomar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void handleDelete(row.repoKey)}
                    disabled={removing === row.repoKey}
                  >
                    {removing === row.repoKey ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Descartar
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
