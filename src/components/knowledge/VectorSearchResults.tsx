import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Search, 
  FileText, 
  Link as LinkIcon, 
  BarChart2,
  CheckCircle2,
  ExternalLink
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SearchResult {
  id: string;
  score: number;
  content: string;
  source: string;
  metadata: {
    page?: number;
    tokens?: number;
  }
}

const mockResults: SearchResult[] = [
  {
    id: '1',
    score: 0.982,
    content: 'O sistema Nexus utiliza arquitetura distribuída para orquestração de agentes neurais, garantindo latência sub-100ms em operações de RAG complexas através de indexação HNSW otimizada.',
    source: 'nexus_architecture_whitepaper.pdf',
    metadata: { page: 12, tokens: 45 }
  },
  {
    id: '2',
    score: 0.854,
    content: 'A camada de segurança (RBAC) é integrada diretamente ao fluxo de consulta vetorial, permitindo filtragem de contexto em tempo real baseada em permissões de nível de usuário.',
    source: 'security_protocols_v2.docx',
    metadata: { page: 4, tokens: 38 }
  },
  {
    id: '3',
    score: 0.721,
    content: 'Configurações de embedding podem ser alternadas dinamicamente entre provedores como OpenAI e Anthropic sem necessidade de reprocessamento total da base.',
    source: 'integration_guide.md',
    metadata: { page: 1, tokens: 32 }
  }
];

export function VectorSearchResults() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Search className="h-5 w-5 text-primary" />
          <h3 className="text-title-sm font-bold">Neural Retrieval Results</h3>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="bg-nexus-emerald/10 text-nexus-emerald border-nexus-emerald/20 font-black">3 Matches Found</Badge>
          <Badge variant="outline" className="text-meta font-mono">Query: "Arquitetura Nexus"</Badge>
        </div>
      </div>

      <ScrollArea className="h-[400px] pr-4">
        <div className="space-y-4">
          {mockResults.map((result) => (
            <Card key={result.id} className="p-5 bg-card/30 border-border/40 group hover:border-primary/40 transition-all hover:shadow-xl hover:shadow-primary/5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "px-2 py-1 rounded text-meta font-black uppercase tracking-tighter",
                    result.score > 0.9 ? "bg-nexus-emerald/10 text-nexus-emerald border border-nexus-emerald/20" : 
                    result.score > 0.8 ? "bg-nexus-cyan/10 text-nexus-cyan border border-nexus-cyan/20" :
                    "bg-muted text-muted-foreground border border-border/40"
                  )}>
                    Score: {(result.score * 100).toFixed(1)}%
                  </div>
                  <div className="flex items-center gap-1.5 text-meta font-bold text-muted-foreground uppercase tracking-widest">
                    <FileText className="h-3 w-3" />
                    {result.source}
                  </div>
                </div>
                <button className="text-muted-foreground hover:text-primary transition-colors">
                  <ExternalLink className="h-4 w-4" />
                </button>
              </div>

              <p className="text-body-sm text-foreground/90 leading-relaxed font-medium mb-4 italic border-l-2 border-primary/20 pl-4">
                "{result.content}"
              </p>

              <div className="flex items-center gap-4 pt-4 border-t border-border/10">
                <div className="flex items-center gap-1.5">
                  <LinkIcon className="h-3 w-3 text-primary/60" />
                  <span className="text-meta font-bold text-muted-foreground uppercase">Page {result.metadata.page}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <BarChart2 className="h-3 w-3 text-primary/60" />
                  <span className="text-meta font-bold text-muted-foreground uppercase">{result.metadata.tokens} Tokens</span>
                </div>
                <div className="flex items-center gap-1.5 ml-auto">
                  <CheckCircle2 className="h-3 w-3 text-nexus-emerald" />
                  <span className="text-meta font-bold text-nexus-emerald uppercase">Verified Source</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
