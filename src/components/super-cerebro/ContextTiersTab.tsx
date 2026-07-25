/**
 * Nexus — Context Tiers Tab
 * Painel de visualização e teste do sistema hierárquico L0/L1/L2.
 * Executa `tieredSearch` e exibe economia de tokens em cada fase.
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Layers, Search, Zap, TrendingDown, Sparkles } from 'lucide-react';
import { tieredSearch, generateTiers, type ContextTier } from '@/services/contextTiersService';
import { logger } from '@/lib/logger';

interface TieredResult {
  l0Results: number;
  l1Results: number;
  l2Results: ContextTier[];
  tokensSaved: number;
}

export function ContextTiersTab() {
  const [query, setQuery] = useState('');
  const [collectionId, setCollectionId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TieredResult | null>(null);

  // Preview generator
  const [previewContent, setPreviewContent] = useState('');
  const [preview, setPreview] = useState<{ l0: string; l1: string } | null>(null);

  async function runSearch() {
    if (!query.trim()) {
      toast.error('Informe uma consulta');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await tieredSearch(query, collectionId || undefined, {
        l0Limit: 20,
        l1Limit: 10,
        l2Limit: 5,
      });
      setResult(res);
      toast.success(`Busca concluída — ${res.tokensSaved} tokens economizados`);
    } catch (e) {
      logger.error('tieredSearch failed', { error: e });
      toast.error('Falha na busca hierárquica', {
        description: e instanceof Error ? e.message : 'Erro desconhecido',
      });
    } finally {
      setLoading(false);
    }
  }

  async function runPreview() {
    if (!previewContent.trim()) {
      toast.error('Cole um conteúdo para gerar tiers');
      return;
    }
    try {
      const p = await generateTiers(previewContent);
      setPreview(p);
      toast.success('Tiers gerados');
    } catch (e) {
      toast.error('Falha ao gerar tiers');
      logger.error('generateTiers failed', { error: e });
    }
  }

  return (
    <div className="space-y-6">
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Busca hierárquica L0 → L1 → L2
          </CardTitle>
          <p className="text-body-sm text-muted-foreground">
            L0 (100 tokens) filtra relevância · L1 (2K) planeja · L2 detalha somente o essencial. Economia média: ~80% de tokens.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_260px_auto]">
            <div>
              <Label className="text-meta">Consulta</Label>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ex: procedimento de escalonamento SLA"
                onKeyDown={(e) => e.key === 'Enter' && runSearch()}
              />
            </div>
            <div>
              <Label className="text-meta">Collection ID (opcional)</Label>
              <Input
                value={collectionId}
                onChange={(e) => setCollectionId(e.target.value)}
                placeholder="uuid da coleção"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={runSearch} disabled={loading} className="w-full md:w-auto">
                <Search className="h-4 w-4 mr-2" />
                {loading ? 'Buscando…' : 'Buscar'}
              </Button>
            </div>
          </div>

          {loading && (
            <div className="grid gap-3 md:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
          )}

          {result && (
            <>
              <div className="grid gap-3 md:grid-cols-4">
                <MetricCard
                  icon={<Layers className="h-4 w-4" />}
                  label="L0 candidatos"
                  value={String(result.l0Results)}
                  hint="filtro rápido"
                />
                <MetricCard
                  icon={<Search className="h-4 w-4" />}
                  label="L1 planejados"
                  value={String(result.l1Results)}
                  hint="overview"
                />
                <MetricCard
                  icon={<Sparkles className="h-4 w-4" />}
                  label="L2 detalhados"
                  value={String(result.l2Results.length)}
                  hint="contexto final"
                />
                <MetricCard
                  icon={<TrendingDown className="h-4 w-4" />}
                  label="Tokens economizados"
                  value={result.tokensSaved.toLocaleString('pt-BR')}
                  hint="vs. carga total"
                  highlight
                />
              </div>

              <div>
                <h4 className="text-body-sm font-medium mb-2">Chunks selecionados (L2)</h4>
                {result.l2Results.length === 0 ? (
                  <p className="text-body-sm text-muted-foreground">
                    Nenhum chunk retornado — a RPC <code>search_context_l0</code> pode não estar disponível ou a coleção está vazia.
                  </p>
                ) : (
                  <ScrollArea className="h-[280px] rounded-md border border-border/50 p-2">
                    <div className="space-y-2">
                      {result.l2Results.map((c) => (
                        <div key={c.chunk_id} className="rounded-md bg-secondary/40 p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-meta">
                              {c.token_count} tokens
                            </Badge>
                            <code className="text-meta text-muted-foreground truncate">
                              {c.chunk_id.slice(0, 8)}…
                            </code>
                          </div>
                          <p className="text-body-sm whitespace-pre-wrap line-clamp-6">{c.l2_content}</p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Gerador de tiers (preview)
          </CardTitle>
          <p className="text-body-sm text-muted-foreground">
            Cole um conteúdo bruto e veja como o resumo L0 e o overview L1 seriam gerados.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <textarea
            value={previewContent}
            onChange={(e) => setPreviewContent(e.target.value)}
            placeholder="Cole aqui um parágrafo ou documento…"
            className="w-full min-h-[120px] rounded-md border border-input bg-background p-3 text-body-sm"
          />
          <Button variant="outline" onClick={runPreview}>
            Gerar L0 / L1
          </Button>
          {preview && (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-md border border-border/50 bg-secondary/30 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Badge>L0</Badge>
                  <span className="text-meta text-muted-foreground">~100 tokens · relevância</span>
                </div>
                <p className="text-body-sm">{preview.l0}</p>
              </div>
              <div className="rounded-md border border-border/50 bg-secondary/30 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="secondary">L1</Badge>
                  <span className="text-meta text-muted-foreground">~2K tokens · planejamento</span>
                </div>
                <p className="text-body-sm whitespace-pre-wrap">{preview.l1}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  hint,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-md border p-3 ${
        highlight ? 'border-primary/50 bg-primary/5' : 'border-border/50 bg-secondary/30'
      }`}
    >
      <div className="flex items-center gap-2 text-meta text-muted-foreground mb-1">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-semibold tracking-tight">{value}</div>
      <div className="text-meta text-muted-foreground mt-0.5">{hint}</div>
    </div>
  );
}
