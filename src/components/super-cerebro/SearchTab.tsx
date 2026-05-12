import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Loader2, MessageSquare, Sparkles, ArrowUpDown, Search, 
  History, X, Layers, ShieldCheck, Zap 
} from 'lucide-react';
import { invokeCerebroQuery, queryTiered } from '@/services/cerebroService';
import { toast } from 'sonner';
import {
  rerankChunks,
  listKnowledgeBases,
  fetchChunksForRerank,
  type RerankResult,
} from '@/services/knowledgeService';
import type { ContextTier } from '@/services/contextTiersService';

const HISTORY_KEY = 'nexus-cerebro-search-history';
const HISTORY_MAX = 10;

function loadHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveHistory(items: string[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, HISTORY_MAX)));
  } catch {
    /* ignore */
  }
}

export function SearchTab() {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>(() => loadHistory());

  // Rerank state
  const [rerankQuery, setRerankQuery] = useState('');
  const [rerankTopK, setRerankTopK] = useState(5);
  const [isReranking, setIsReranking] = useState(false);
  const [rerankResults, setRerankResults] = useState<RerankResult[] | null>(null);
  const [rerankMethod, setRerankMethod] = useState<string | null>(null);

  // Tiered Search state
  const [isTieredSearching, setIsTieredSearching] = useState(false);
  const [tieredResults, setTieredResults] = useState<{ 
    l2Results: ContextTier[]; 
    tokensSaved: number;
    l0Results: number;
    l1Results: number;
  } | null>(null);

  // KB filter
  const [knowledgeBases, setKnowledgeBases] = useState<{ id: string; name: string }[]>([]);
  const [selectedKbId, setSelectedKbId] = useState<string>('all');

  useEffect(() => {
    listKnowledgeBases()
      .then((kbs) => setKnowledgeBases(kbs.map((kb: any) => ({ id: kb.id, name: kb.name }))))
      .catch(() => {
        /* KBs unavailable — search still works without filter */
      });
  }, []);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setIsSearching(true);
    setSearchResults("");
    try {
      const body = await invokeCerebroQuery({ query, mode: 'chat', stream: true });
      
      if (body instanceof ReadableStream) {
        const reader = body.getReader();
        const decoder = new TextDecoder();
        let done = false;
        let fullText = "";

        while (!done) {
          const { value, done: doneReading } = await reader.read();
          done = doneReading;
          const chunkValue = decoder.decode(value);
          fullText += chunkValue;
          setSearchResults(fullText);
        }
      } else {
        const data = body;
        setSearchResults(data?.response || 'Sem resposta');
      }

      // Persist to history
      const trimmed = query.trim();
      const next = [trimmed, ...history.filter((h) => h !== trimmed)].slice(0, HISTORY_MAX);
      setHistory(next);
      saveHistory(next);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro na consulta');
    } finally {
      setIsSearching(false);
    }
  };

  const handleRerank = async () => {
    if (!rerankQuery.trim()) {
      toast.error('Digite uma query para reranking');
      return;
    }
    setIsReranking(true);
    setRerankResults(null);
    setRerankMethod(null);

    try {
      const chunks = await fetchChunksForRerank(
        selectedKbId !== 'all' ? selectedKbId : undefined,
        50,
      );

      if (chunks.length === 0) {
        toast.warning('Nenhum chunk encontrado na base. Adicione documentos primeiro.');
        setIsReranking(false);
        return;
      }

      const result = await rerankChunks(
        rerankQuery,
        chunks.map((c: Record<string, unknown>) => ({ ...c })),
        { topK: rerankTopK, knowledgeBaseId: selectedKbId !== 'all' ? selectedKbId : undefined },
      );

      setRerankResults(result.reranked);
      setRerankMethod(result.method);
      toast.success(
        `Re-ranking concluído! Método: ${result.method} • ${result.total_input} chunks → top ${result.top_k}`,
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro no re-ranking');
    } finally {
      setIsReranking(false);
    }
  };

  const handleTieredSearch = async () => {
    if (!query.trim()) return;
    setIsTieredSearching(true);
    setTieredResults(null);
    try {
      const result = await queryTiered(query, {
        l0Limit: 20,
        l1Limit: 8,
        l2Limit: 3
      });
      setTieredResults(result);
      toast.success(`Busca hierárquica concluída! Economia: ${result.tokensSaved} tokens`);
    } catch (e: any) {
      toast.error('Erro na busca tiered: ' + e.message);
    } finally {
      setIsTieredSearching(false);
    }
  };

  const methodLabels: Record<string, string> = {
    cohere: 'Cohere Rerank v3.5',
    hf_bge_reranker: 'HuggingFace BGE Reranker',
    llm_fallback: 'LLM Fallback (Claude Haiku)',
  };

  const methodColors: Record<string, string> = {
    cohere: 'border-nexus-emerald/30 text-nexus-emerald',
    hf_bge_reranker: 'border-nexus-amber/30 text-nexus-amber',
    llm_fallback: 'border-primary/30 text-primary',
  };

  return (
    <div className="space-y-6">
      {/* ── Consulta Semântica ── */}
      <div className="nexus-card space-y-4">
        <h3 className="text-sm font-heading font-semibold text-foreground flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" /> Consultar o Super Cérebro
        </h3>
        <Textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pergunte ao Super Cérebro... Ex: Quais são nossos principais fornecedores?"
          className="bg-secondary/50 min-h-[80px] text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSearch();
            }
          }}
        />
        {history.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <History className="h-3 w-3" /> Histórico recente
              </p>
              <button
                onClick={() => {
                  setHistory([]);
                  saveHistory([]);
                }}
                className="text-[10px] text-muted-foreground hover:text-destructive flex items-center gap-0.5"
              >
                <X className="h-2.5 w-2.5" /> Limpar
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {history.map((h, i) => (
                <button
                  key={i}
                  onClick={() => setQuery(h)}
                  className="px-2 py-1 text-[10px] rounded-md bg-secondary/40 border border-border/30 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors max-w-[200px] truncate"
                  title={h}
                >
                  {h}
                </button>
              ))}
      </div>

      {/* ── Context Tiers (Hierarchical Search) ── */}
      <div className="nexus-card space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-heading font-semibold text-foreground flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" /> Busca Hierárquica (L0/L1/L2)
          </h3>
          <Badge variant="outline" className="bg-nexus-emerald/5 text-nexus-emerald border-nexus-emerald/20 gap-1.5 py-0.5 px-2 text-[9px]">
            <Zap className="h-3 w-3" /> Token Optimized
          </Badge>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Estratégia OpenViking: L0 (Abstract) para filtro → L1 (Overview) para planejamento → L2 (Full) para contexto final. 
          Economiza até 80% de tokens em bases grandes.
        </p>
        
        <div className="flex gap-3">
          <Button
            onClick={handleTieredSearch}
            disabled={isTieredSearching || !query.trim()}
            variant="outline"
            className="flex-1 gap-2 border-primary/20 hover:bg-primary/5"
          >
            {isTieredSearching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4 text-nexus-emerald" />
            )}
            {isTieredSearching ? 'Processando Camadas...' : 'Executar Busca Hierárquica'}
          </Button>
        </div>

        {tieredResults && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-secondary/30 rounded-lg p-2 text-center border border-border/20">
                <p className="text-lg font-bold text-foreground">{tieredResults.l0Results}</p>
                <p className="text-[9px] text-muted-foreground uppercase">L0 Found</p>
              </div>
              <div className="bg-secondary/30 rounded-lg p-2 text-center border border-border/20">
                <p className="text-lg font-bold text-foreground">{tieredResults.l1Results}</p>
                <p className="text-[9px] text-muted-foreground uppercase">L1 Filtered</p>
              </div>
              <div className="bg-nexus-emerald/5 rounded-lg p-2 text-center border border-nexus-emerald/20">
                <p className="text-lg font-bold text-nexus-emerald">{tieredResults.tokensSaved}</p>
                <p className="text-[9px] text-muted-foreground uppercase">Tokens Saved</p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-foreground">Top Chunks (L2 Ready):</p>
              {tieredResults.l2Results.map((tier, idx) => (
                <div key={tier.chunk_id} className="p-3 rounded-lg bg-secondary/20 border border-border/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-[9px]">Rank #{idx + 1}</Badge>
                    <span className="text-[10px] text-muted-foreground font-mono">{tier.token_count} tokens</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase text-primary tracking-widest">L0 Abstract</p>
                    <p className="text-xs text-foreground italic">"{tier.l0_abstract}..."</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase text-nexus-emerald tracking-widest">L2 Full Content</p>
                    <p className="text-[11px] text-muted-foreground line-clamp-3">{tier.l2_content}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
          </div>
        )}
        <div className="flex justify-between items-center">
          <p className="text-[11px] text-muted-foreground">
            Consulta semântica ao conhecimento da empresa (fatos + RAG + bancos externos)
          </p>
          <Button
            onClick={handleSearch}
            disabled={isSearching || !query.trim()}
            className="nexus-gradient-bg text-primary-foreground gap-2"
          >
            {isSearching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {isSearching ? 'Buscando...' : '🧠 Consultar'}
          </Button>
        </div>
        {searchResults && (
          <div className="p-4 rounded-lg bg-secondary/30 border border-border/30">
            <p className="text-xs font-semibold text-foreground mb-2">Resposta do Super Cérebro:</p>
            <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
              {searchResults}
            </div>
          </div>
        )}
      </div>

      {/* ── Re-Ranking Manual ── */}
      <div className="nexus-card space-y-4">
        <h3 className="text-sm font-heading font-semibold text-foreground flex items-center gap-2">
          <ArrowUpDown className="h-4 w-4 text-primary" /> Re-Ranking Manual de Chunks
        </h3>
        <p className="text-[11px] text-muted-foreground">
          Reordene os chunks da base de conhecimento por relevância usando Cohere, HuggingFace BGE
          ou LLM fallback.
        </p>

        <div className="flex gap-3 items-end flex-wrap">
          <div className="flex-1 min-w-[200px] space-y-1">
            <label htmlFor="rerank-query" className="text-xs text-muted-foreground">
              Query de referência
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                id="rerank-query"
                value={rerankQuery}
                onChange={(e) => setRerankQuery(e.target.value)}
                placeholder="Ex: política de devoluções"
                className="bg-secondary/50 pl-9 text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRerank();
                }}
              />
            </div>
          </div>
          <div className="w-48 space-y-1">
            <label htmlFor="rerank-kb" className="text-xs text-muted-foreground">
              Knowledge Base
            </label>
            <Select value={selectedKbId} onValueChange={setSelectedKbId}>
              <SelectTrigger className="bg-secondary/50 text-sm">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as bases</SelectItem>
                {knowledgeBases.map((kb) => (
                  <SelectItem key={kb.id} value={kb.id}>
                    {kb.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-24 space-y-1">
            <label htmlFor="rerank-topk" className="text-xs text-muted-foreground">
              Top K
            </label>
            <Input
              id="rerank-topk"
              type="number"
              min={1}
              max={50}
              value={rerankTopK}
              onChange={(e) => setRerankTopK(Number(e.target.value) || 5)}
              className="bg-secondary/50 text-sm"
            />
          </div>
          <Button
            onClick={handleRerank}
            disabled={isReranking || !rerankQuery.trim()}
            className="nexus-gradient-bg text-primary-foreground gap-2"
          >
            {isReranking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUpDown className="h-4 w-4" />
            )}
            {isReranking ? 'Reranking...' : 'Re-Rank'}
          </Button>
        </div>

        {rerankResults && rerankResults.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold text-foreground">Resultados re-rankeados</p>
              {rerankMethod && (
                <Badge
                  variant="outline"
                  className={`text-[11px] ${methodColors[rerankMethod] || 'border-border'}`}
                >
                  {methodLabels[rerankMethod] || rerankMethod}
                </Badge>
              )}
              <Badge variant="outline" className="text-[11px]">
                {rerankResults.length} chunks
              </Badge>
            </div>

            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {rerankResults.map((item, idx) => {
                const chunk = item.chunk as Record<string, unknown>;
                const score = item.relevance_score;
                const scoreColor =
                  score >= 0.8
                    ? 'text-nexus-emerald'
                    : score >= 0.5
                      ? 'text-nexus-amber'
                      : 'text-muted-foreground';
                return (
                  <div key={idx} className="nexus-card p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-primary">#{idx + 1}</span>
                        {chunk.chunk_index !== undefined && (
                          <Badge variant="outline" className="text-[11px]">
                            Chunk #{String(chunk.chunk_index)}
                          </Badge>
                        )}
                        {chunk.token_count != null && (
                          <span className="text-[11px] text-muted-foreground">
                            {String(chunk.token_count)} tokens
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-muted-foreground">Score:</span>
                        <span className={`text-xs font-bold ${scoreColor}`}>
                          {(score * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-3">
                      {String(
                        chunk.content || chunk.text || JSON.stringify(chunk).substring(0, 300),
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {rerankResults && rerankResults.length === 0 && (
          <div className="text-center py-6">
            <p className="text-xs text-muted-foreground">
              Nenhum resultado encontrado para reranking.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
