/**
 * EmbeddingCoverageCard — mostra a cobertura de embeddings semânticos
 * em `agent_memories_v2` para o workspace atual.
 *
 * Consome a RPC `get_embedding_coverage(_workspace_id)`.
 */
import { useEffect, useState } from 'react';
import { Sparkles, RefreshCcw } from 'lucide-react';
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
  pct: number;
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
  const [error, setError] = useState<string | null>(null);

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
      if (row) {
        setData({
          total: Number(row.total ?? 0),
          embedded: Number(row.embedded ?? 0),
          pct: Number(row.pct ?? 0),
        });
      } else {
        setData({ total: 0, embedded: 0, pct: 0 });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      logger.warn('[EmbeddingCoverageCard] load failed', { error: msg });
      setError(msg);
    } finally {
      setLoading(false);
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
            <p className="text-meta text-muted-foreground">
              Backfill roda a cada 5 min · até 200 memórias por ciclo.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
