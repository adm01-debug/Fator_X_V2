import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
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
      {/* ── Context Tiers (Hierarchical Search) ── */}
      <div className="nexus-card space-y-4 border-primary/20 bg-primary/5 shadow-lg">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-heading font-bold text-foreground flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" /> Context Tiers L0/L1/L2
          </h3>
          <Badge className="bg-primary text-primary-foreground gap-1.5 py-1 px-3 text-[10px] font-bold">
            <Zap className="h-3.5 w-3.5" /> AGENT BRAIN OPTIMIZED
          </Badge>
        </div>
        
        <div className="bg-background/50 p-4 rounded-xl space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            O Nexus utiliza uma arquitetura de contexto hierárquica inspirada no <span className="text-foreground font-semibold">OpenViking</span>. 
            Este mecanismo permite que os agentes consultem bases massivas mantendo a precisão e economizando até <span className="text-nexus-emerald font-bold">80% de tokens</span>.
          </p>
          <div className="grid grid-cols-3 gap-2 py-2">
             <div className="text-center space-y-1">
               <div className="text-[10px] font-black uppercase text-muted-foreground">L0 Abstract</div>
               <div className="text-xs font-mono text-primary">Relevance</div>
             </div>
             <div className="text-center space-y-1">
               <div className="text-[10px] font-black uppercase text-muted-foreground">L1 Overview</div>
               <div className="text-xs font-mono text-nexus-amber">Planning</div>
             </div>
             <div className="text-center space-y-1">
               <div className="text-[10px] font-black uppercase text-muted-foreground">L2 Full</div>
               <div className="text-xs font-mono text-nexus-emerald">Context</div>
             </div>
          </div>
        </div>

        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Consulte o cérebro usando tiers... Ex: Qual o histórico de negociação com a Ambev?"
            className="h-14 pl-12 bg-background border-primary/20 focus:ring-primary/20 text-base rounded-2xl shadow-inner"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleTieredSearch();
            }}
          />
        </div>

        <div className="flex gap-3">
          <Button
            onClick={handleTieredSearch}
            disabled={isTieredSearching || !query.trim()}
            size="lg"
            className="flex-1 gap-2 nexus-gradient-bg text-primary-foreground shadow-xl shadow-primary/20 h-12 font-bold"
          >
            {isTieredSearching ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <ShieldCheck className="h-5 w-5" />
            )}
            {isTieredSearching ? 'Filtrando Camadas...' : 'Executar Busca Hierárquica'}
          </Button>
          
          <Button
            onClick={handleSearch}
            disabled={isSearching || !query.trim()}
            variant="outline"
            size="lg"
            className="gap-2 h-12 px-6 border-primary/20"
          >
            {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-primary" />}
            Modo Chat
          </Button>
        </div>

        {tieredResults && (
          <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-background/40 backdrop-blur-sm rounded-xl p-3 text-center border border-border/20 shadow-sm">
                <p className="text-xl font-black text-primary">{tieredResults.l0Results}</p>
                <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold">L0 Matches</p>
              </div>
              <div className="bg-background/40 backdrop-blur-sm rounded-xl p-3 text-center border border-border/20 shadow-sm">
                <p className="text-xl font-black text-nexus-amber">{tieredResults.l1Results}</p>
                <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold">L1 Filtered</p>
              </div>
              <div className="bg-nexus-emerald/5 backdrop-blur-sm rounded-xl p-3 text-center border border-nexus-emerald/20 shadow-sm ring-1 ring-nexus-emerald/10">
                <p className="text-xl font-black text-nexus-emerald">{tieredResults.tokensSaved}</p>
                <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold">Tokens Saved</p>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2 px-1">
                <div className="w-1 h-3 bg-primary rounded-full" /> Top Relevant Context (L2 Tier)
              </h4>
              <div className="grid grid-cols-1 gap-2">
                {tieredResults.l2Results.map((tier, idx) => (
                  <div key={tier.chunk_id} className="group p-4 rounded-2xl bg-background/60 border border-border/40 hover:border-primary/40 transition-all hover:shadow-md">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[9px] font-black">RANK #{idx + 1}</Badge>
                        <span className="text-[10px] text-muted-foreground font-mono bg-secondary/50 px-1.5 py-0.5 rounded">ID: {tier.chunk_id.slice(0, 8)}</span>
                      </div>
                      <span className="text-[10px] font-bold text-nexus-emerald">{tier.token_count} tokens</span>
                    </div>
                    <div className="space-y-3">
                      <div className="bg-secondary/20 p-2 rounded-lg border border-border/10">
                        <p className="text-[9px] font-black uppercase text-primary/60 mb-1">L0 Abstract (Relevance)</p>
                        <p className="text-xs text-foreground italic leading-relaxed">"{tier.l0_abstract}..."</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black uppercase text-nexus-emerald/60 mb-1">L2 Full Content (Context)</p>
                        <p className="text-[11px] text-muted-foreground line-clamp-4 leading-relaxed">{tier.l2_content}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {searchResults && !tieredResults && (
          <div className="p-5 rounded-2xl bg-secondary/20 border border-border/40 animate-in fade-in slide-in-from-top-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-primary" />
              <p className="text-xs font-bold uppercase tracking-widest text-foreground">Resposta do Super Cérebro</p>
            </div>
            <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
              {searchResults}
            </div>
          </div>
        )}
      </div>

      <div className="nexus-card opacity-60 hover:opacity-100 transition-opacity">
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
          <History className="h-3.5 w-3.5" /> Histórico Sináptico
        </h3>
        {history.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {history.map((h, i) => (
              <button
                key={i}
                onClick={() => setQuery(h)}
                className="px-3 py-1.5 text-[10px] font-medium rounded-xl bg-secondary/50 border border-border/30 text-muted-foreground hover:text-primary hover:border-primary/40 transition-all max-w-[200px] truncate"
              >
                {h}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[10px] italic text-muted-foreground">Nenhuma consulta recente registrada.</p>
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
