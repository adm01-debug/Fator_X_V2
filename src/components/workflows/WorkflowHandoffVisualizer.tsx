import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, ArrowRightLeft, User, Bot, CheckCircle2, Clock } from 'lucide-react';
import { getHandoffHistory } from '@/services/agentHandoffService';
import type { HandoffRecord } from '@/services/types/agentHandoffTypes';

export function WorkflowHandoffVisualizer() {
  const { data: handoffs = [], isLoading } = useQuery({
    queryKey: ['handoff_history'],
    queryFn: () => getHandoffHistory('all', 30), // Fetching all for now
  });

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (handoffs.length === 0) return <div className="text-center py-12 text-sm text-muted-foreground">Nenhuma transferência entre agentes registrada.</div>;

  const statusColors: Record<string, string> = {
    pending: 'text-nexus-amber border-nexus-amber/20 bg-nexus-amber/5',
    accepted: 'text-primary border-primary/20 bg-primary/5',
    completed: 'text-nexus-emerald border-nexus-emerald/20 bg-nexus-emerald/5',
    failed: 'text-destructive border-destructive/20 bg-destructive/5',
    rejected: 'text-muted-foreground border-border bg-muted/10',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
            Fluxo de Handoffs
          </h3>
          <p className="text-xs text-muted-foreground">Visualização de transferências de contexto e escalonamento</p>
        </div>
        <Badge variant="outline" className="px-3 py-1 font-mono uppercase tracking-widest text-[10px] bg-primary/5">
          {handoffs.length} Eventos Recentes
        </Badge>
      </div>

      <div className="grid gap-4">
        {handoffs.map((handoff: any) => {
          const h = handoff as HandoffRecord;
          return (
            <Card key={h.id} className="nexus-card border-border/40 hover:border-primary/30 transition-all overflow-hidden">
              <CardContent className="p-0">
                <div className="flex flex-col md:flex-row items-stretch">
                  {/* Source */}
                  <div className="flex-1 p-4 bg-muted/10 flex flex-col justify-center items-center text-center gap-2 border-r border-border/20">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Bot className="h-5 w-5 text-primary" />
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[10px] font-black uppercase text-muted-foreground tracking-tighter">Origem</p>
                      <p className="text-xs font-bold truncate max-w-[120px]">{h.source_agent_id.split('-')[0]}</p>
                    </div>
                  </div>

                  {/* Connection */}
                  <div className="flex flex-col justify-center items-center px-6 gap-2 bg-background/40 relative">
                    <div className="absolute inset-0 flex items-center justify-center opacity-10">
                       <ArrowRightLeft className="h-12 w-12" />
                    </div>
                    <Badge variant="outline" className={`text-[9px] uppercase font-black tracking-widest z-10 ${statusColors[h.status]}`}>
                      {h.status}
                    </Badge>
                    <div className="flex flex-col items-center gap-1 z-10">
                       <p className="text-[10px] font-bold text-foreground">{h.reason}</p>
                       <p className="text-[9px] text-muted-foreground">{new Date(h.created_at).toLocaleTimeString()}</p>
                    </div>
                  </div>

                  {/* Target */}
                  <div className="flex-1 p-4 bg-muted/10 flex flex-col justify-center items-center text-center gap-2 border-l border-border/20">
                    <div className="h-10 w-10 rounded-full bg-nexus-purple/10 flex items-center justify-center">
                      {h.reason === 'human_required' ? <User className="h-5 w-5 text-nexus-purple" /> : <Bot className="h-5 w-5 text-nexus-purple" />}
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[10px] font-black uppercase text-muted-foreground tracking-tighter">Destino</p>
                      <p className="text-xs font-bold truncate max-w-[120px]">{h.target_agent_id.split('-')[0]}</p>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="flex-[2] p-4 bg-secondary/5 space-y-2 border-l border-border/20">
                    <div className="flex items-center gap-2">
                       {h.status === 'completed' ? <CheckCircle2 className="h-3.5 w-3.5 text-nexus-emerald" /> : <Clock className="h-3.5 w-3.5 text-nexus-amber" />}
                       <p className="text-xs font-medium text-foreground line-clamp-1">{h.reason_text || 'Transferência de contexto operacional'}</p>
                    </div>
                    <div className="bg-background/40 rounded-lg p-2 border border-border/10">
                       <p className="text-[10px] text-muted-foreground italic line-clamp-2">
                         {h.context?.messages?.[h.context.messages.length - 1]?.content || 'Nenhum log de mensagem'}
                       </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
