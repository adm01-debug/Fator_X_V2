/**
 * EmbeddingCoverageCard — cobertura de embeddings semânticos + Dead-Letter Queue.
 *
 * Consome:
 *  - RPC `get_embedding_coverage(_workspace_id)` → total, embedded, dead_letter, pct
 *  - RPC `reset_embedding_dead_letter(_workspace_id)` → reprocessamento manual
 *  - RPC `get_chunk_embedding_coverage(_workspace_id)` → cobertura dos chunks de
 *    documentos (RAG), pipeline separado das memórias
 */
import { useEffect, useState } from 'react';
import { Sparkles, RefreshCcw, AlertTriangle, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

interface Coverage {
  total: number;
  embedded: number;
  dead_letter: number;
  pct: number;
}

interface ChunkCoverage {
  total: number;
  embedded: number;
  pending: number;
  pct: number;
  models: number;
}

interface Props {
  workspaceId: string | null | undefined;
}

function toneFor(pct: number): { label: string; variant: 'default' | 'secondary' | 'outline' } {
  if (pct >= 95) return { label: 'Semântica ativa', variant: 'default' };
  if (pct >= 50) return { label: 'Backfill em andamento', variant: 'secondary' };
  return { label: 'Backfill pendente', variant: 'outline' };
}

export function EmbeddingCoverageCard({ workspaceId }: Props) {
  const [data, setData] = useState<Coverage | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chunks, setChunks] = useState<ChunkCoverage | null>(null);

  async function load() {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rows, error: rpcErr } = await (supabase.rpc as any)('get_embedding_coverage', {
        _workspace_id: workspaceId,
      });
      if (rpcErr) throw rpcErr;
      const row = Array.isArray(rows) ? rows[0] : rows;
      setData({
        total: Number(row?.total ?? 0),
        embedded: Number(row?.embedded ?? 0),
        dead_letter: Number(row?.dead_letter ?? 0),
        pct: Number(row?.pct ?? 0),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      logger.warn('[EmbeddingCoverageCard] load failed', { error: msg });
      setError(msg);
    } finally {
      setLoading(false);
    }
    await loadChunkCoverage();
  }

  /**
   * Cobertura dos chunks de documentos (pipeline de RAG, separado das memórias).
   * Falha aqui não derruba o card: a cobertura de memórias continua visível.
   */
  async function loadChunkCoverage() {
    if (!workspaceId) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rows, error: rpcErr } = await (supabase.rpc as any)(
        'get_chunk_embedding_coverage',
        { _workspace_id: workspaceId },
      );
      if (rpcErr) throw rpcErr;
      const row = Array.isArray(rows) ? rows[0] : rows;
      setChunks({
        total: Number(row?.total_chunks ?? 0),
        embedded: Number(row?.embedded_chunks ?? 0),
        pending: Number(row?.pending_chunks ?? 0),
        pct: Number(row?.coverage_pct ?? 0),
        models: Number(row?.distinct_models ?? 0),
      });
    } catch (err) {
      logger.warn('[EmbeddingCoverageCard] chunk coverage failed', {
        error: err instanceof Error ? err.message : 'unknown',
      });
      setChunks(null);
    }
  }

  async function resetDeadLetter() {
    if (!workspaceId) return;
    setResetting(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: count, error: rpcErr } = await (supabase.rpc as any)('reset_embedding_dead_letter', {
        _workspace_id: workspaceId,
      });
      if (rpcErr) throw rpcErr;
      toast.success(`${count ?? 0} memórias reenfileiradas para reprocessamento`);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      toast.error(msg === 'unauthorized' ? 'Apenas administradores podem reprocessar' : `Falha: ${msg}`);
    } finally {
      setResetting(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const tone = data ? toneFor(data.pct) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Cobertura de embeddings
          </span>
          <Button size="icon" variant="ghost" onClick={() => void load()} disabled={loading} aria-label="Atualizar">
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && !data ? (
          <Skeleton className="h-20 w-full" />
        ) : error ? (
          <p className="text-meta text-destructive">Falha: {error}</p>
        ) : !data || data.total === 0 ? (
          <p className="text-meta text-muted-foreground">
            Nenhuma memória neste workspace ainda. A cobertura será computada assim que agentes escreverem em <code>agent_memories_v2</code>.
          </p>
        ) : (
          <>
            <div className="flex items-baseline justify-between">
              <div>
                <p className="text-heading-lg font-heading font-semibold">{data.pct.toFixed(1)}%</p>
                <p className="text-meta text-muted-foreground">
                  {data.embedded.toLocaleString('pt-BR')} de {data.total.toLocaleString('pt-BR')} memórias com embedding
                </p>
              </div>
              {tone && <Badge variant={tone.variant}>{tone.label}</Badge>}
            </div>
            <Progress value={data.pct} className="h-2" />

            {data.dead_letter > 0 && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 flex items-center justify-between gap-3">
                <div className="flex items-start gap-2 text-body-sm">
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">
                      {data.dead_letter.toLocaleString('pt-BR')} memória(s) em Dead-Letter
                    </p>
                    <p className="text-meta text-muted-foreground">Falharam 3× consecutivas — reprocessar zera o contador.</p>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => void resetDeadLetter()} disabled={resetting}>
                  <RotateCcw className={`h-3.5 w-3.5 mr-1 ${resetting ? 'animate-spin' : ''}`} />
                  Reprocessar
                </Button>
              </div>
            )}

            <p className="text-meta text-muted-foreground">
              Backfill roda a cada 5 min · até 200 memórias por ciclo · máx. 3 tentativas.
            </p>
          </>
        )}

        {chunks && chunks.total > 0 && (
          <div className="rounded-lg border border-border/60 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-body-sm font-medium text-foreground">Chunks de documentos</p>
              <span className="text-meta text-muted-foreground">{chunks.pct.toFixed(1)}%</span>
            </div>
            <Progress value={chunks.pct} className="h-1.5" />
            <p className="text-meta text-muted-foreground">
              {chunks.embedded.toLocaleString('pt-BR')} de {chunks.total.toLocaleString('pt-BR')} chunks com embedding
              {chunks.pending > 0 ? ` · ${chunks.pending.toLocaleString('pt-BR')} pendentes` : ''}
              {chunks.models > 0 ? ` · ${chunks.models} modelo(s)` : ''}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
