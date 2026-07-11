import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Terminal, 
  CheckCircle2, 
  Circle, 
  AlertCircle, 
  Clock,
  ChevronRight,
  Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface LogEntry {
  id: string;
  timestamp: string;
  stage: 'Parsing' | 'Chunking' | 'Metadata' | 'Embeddings' | 'Indexing';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  message: string;
  details?: string;
}

const mockLogs: LogEntry[] = [
  {
    id: '1',
    timestamp: '2024-05-11 14:20:01',
    stage: 'Parsing',
    status: 'completed',
    message: 'Documento PDF processado com sucesso',
    details: '15 páginas extraídas, 4 tabelas detectadas'
  },
  {
    id: '2',
    timestamp: '2024-05-11 14:20:05',
    stage: 'Chunking',
    status: 'completed',
    message: 'Segmentação concluída (RecursiveCharacter)',
    details: '42 chunks gerados, avg size: 850 tokens'
  },
  {
    id: '3',
    timestamp: '2024-05-11 14:20:08',
    stage: 'Metadata',
    status: 'completed',
    message: 'Tags neurais extraídas',
    details: 'Contexto: jurídico, financeiro'
  },
  {
    id: '4',
    timestamp: '2024-05-11 14:21:12',
    stage: 'Embeddings',
    status: 'processing',
    message: 'Gerando vetores (text-embedding-3-small)',
    details: 'Processando 22/42 chunks...'
  },
  {
    id: '5',
    timestamp: '2024-05-11 14:15:30',
    stage: 'Indexing',
    status: 'failed',
    message: 'Falha na conexão com Pinecone',
    details: 'Error: Connection timeout after 5000ms'
  }
];

export function IngestionLogsPanel() {
  const [selectedLog, setSelectedLog] = useState<string | null>(null);

  const getStatusIcon = (status: LogEntry['status']) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="h-4 w-4 text-nexus-emerald" />;
      case 'processing': return <Clock className="h-4 w-4 text-primary animate-pulse" />;
      case 'failed': return <AlertCircle className="h-4 w-4 text-destructive" />;
      default: return <Circle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <Card className="flex flex-col h-full bg-card/30 border-border/40 overflow-hidden">
      <div className="p-4 border-b border-border/40 bg-muted/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-primary" />
          <h3 className="text-meta font-bold uppercase tracking-widest">Ingestion Logs</h3>
        </div>
        <Badge variant="outline" className="text-meta font-mono border-primary/20 text-primary">Live</Badge>
      </div>

      <ScrollArea className="flex-1">
        <div className="divide-y divide-border/20">
          {mockLogs.map((log) => (
            <div 
              key={log.id}
              className={cn(
                "p-4 cursor-pointer transition-colors hover:bg-primary/5",
                selectedLog === log.id && "bg-primary/5"
              )}
              onClick={() => setSelectedLog(selectedLog === log.id ? null : log.id)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  {getStatusIcon(log.status)}
                  <div className="space-y-0.5">
                    <p className="text-meta font-black uppercase tracking-tight text-foreground">{log.stage}</p>
                    <p className="text-meta text-muted-foreground font-mono">{log.timestamp}</p>
                  </div>
                </div>
                <ChevronRight className={cn(
                  "h-3 w-3 text-muted-foreground transition-transform",
                  selectedLog === log.id && "rotate-90"
                )} />
              </div>
              
              <p className="text-meta mt-2 text-foreground/80 leading-relaxed">{log.message}</p>
              
              {selectedLog === log.id && log.details && (
                <div className="mt-3 p-2 rounded bg-background/50 border border-border/20">
                  <p className="text-meta text-muted-foreground font-mono whitespace-pre-wrap">{log.details}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="p-4 bg-muted/20 border-t border-border/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-3 w-3 text-nexus-emerald" />
            <span className="text-meta font-bold uppercase tracking-tighter text-muted-foreground">Pipeline Health</span>
          </div>
          <span className="text-meta font-bold text-nexus-emerald">99.8% Nominal</span>
        </div>
      </div>
    </Card>
  );
}
