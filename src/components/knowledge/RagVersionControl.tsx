import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  History, 
  Copy, 
  ArrowUpCircle, 
  ArrowDownCircle, 
  Trash2,
  Check,
  Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PipelineVersion {
  id: string;
  version: string;
  status: 'active' | 'archived';
  date: string;
  author: string;
  description: string;
  stats: {
    latency: string;
    precision: string;
  }
}

const versions: PipelineVersion[] = [
  {
    id: '1',
    version: 'v2.4.0',
    status: 'active',
    date: '2024-05-10 18:30',
    author: 'Admin',
    description: 'Switch to OpenAI v3 Large + HNSW 128 clusters',
    stats: { latency: '85ms', precision: '94.2%' }
  },
  {
    id: '2',
    version: 'v2.3.1',
    status: 'archived',
    date: '2024-05-08 12:15',
    author: 'System',
    description: 'BGE-Large fallback enabled for Portuguese queries',
    stats: { latency: '120ms', precision: '91.5%' }
  },
  {
    id: '3',
    version: 'v2.2.0',
    status: 'archived',
    date: '2024-05-01 09:00',
    author: 'Dev',
    description: 'Initial Pinecone migration with hybrid search',
    stats: { latency: '210ms', precision: '88.0%' }
  }
];

export function RagVersionControl() {
  return (
    <Card className="p-6 bg-card/30 border-border/40 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <History className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">Pipeline Versioning</h3>
            <p className="text-meta text-muted-foreground">Gerencie o histórico e reversão do pipeline RAG</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-2 border-primary/20 text-primary hover:bg-primary/5">
          <Copy className="h-3.5 w-3.5" /> Clonar Atual
        </Button>
      </div>

      <div className="space-y-3">
        {versions.map((v) => (
          <div 
            key={v.id}
            className={cn(
              "p-4 rounded-[1.5rem] border transition-all duration-300",
              v.status === 'active' 
                ? "bg-primary/[0.03] border-primary/30 shadow-lg shadow-primary/5" 
                : "bg-secondary/10 border-border/40 hover:border-primary/20"
            )}
          >
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-body-sm font-black uppercase tracking-tight text-foreground">{v.version}</span>
                  {v.status === 'active' && (
                    <Badge className="bg-nexus-emerald/10 text-nexus-emerald border-nexus-emerald/20 text-[9px] uppercase font-black">
                      Live
                    </Badge>
                  )}
                </div>
                <p className="text-meta text-muted-foreground font-medium">{v.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right mr-3">
                  <p className="text-meta text-muted-foreground font-mono">{v.date}</p>
                  <p className="text-meta font-bold text-foreground uppercase tracking-tighter">By {v.author}</p>
                </div>
                {v.status === 'active' ? (
                  <div className="h-8 w-8 rounded-full bg-nexus-emerald/10 flex items-center justify-center">
                    <Check className="h-4 w-4 text-nexus-emerald" />
                  </div>
                ) : (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:bg-primary/10">
                    <ArrowUpCircle className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-border/10 grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <Zap className="h-3 w-3 text-primary" />
                <span className="text-meta font-bold uppercase text-muted-foreground">Latency: <span className="text-foreground">{v.stats.latency}</span></span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-3 w-3 text-nexus-emerald" />
                <span className="text-meta font-bold uppercase text-muted-foreground">Precision: <span className="text-foreground">{v.stats.precision}</span></span>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button variant="ghost" size="sm" className="h-7 text-[9px] gap-1 font-black uppercase tracking-widest">
                <ArrowDownCircle className="h-3 w-3" /> Reverter
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-[9px] gap-1 font-black uppercase tracking-widest text-destructive hover:text-destructive hover:bg-destructive/5">
                <Trash2 className="h-3 w-3" /> Deletar
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
