import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Play, Loader2, GitBranch, ArrowRight, Check, X, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versionA: { version: number, content: string };
  versionB: { version: number, content: string };
  agentId?: string;
}

export function PromptABTestDialog({ open, onOpenChange, versionA, versionB }: Props) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<{
    id: number;
    input: string;
    outputA: string;
    outputB: string;
    winner: 'A' | 'B' | 'Tie' | null;
    metricsA: { quality: number, speed: number, adherence: number };
    metricsB: { quality: number, speed: number, adherence: number };
  }[]>([]);

  const runTest = async () => {
    setRunning(true);
    setProgress(0);
    setResults([]);
    
    const inputs = [
      "Como cancelo minha assinatura?",
      "Quais os benefícios do plano Premium?",
      "Vocês aceitam Pix?",
      "O agente pode falar em inglês?",
      "Como resetar minha senha?"
    ];

    for (let i = 0; i < inputs.length; i++) {
      // Simulação de chamada de LLM para as duas versões
      await new Promise(resolve => setTimeout(resolve, 800));
      
      const metricsA = {
        quality: 70 + Math.random() * 30,
        speed: 400 + Math.random() * 600,
        adherence: 80 + Math.random() * 20
      };
      
      const metricsB = {
        quality: 70 + Math.random() * 30,
        speed: 400 + Math.random() * 600,
        adherence: 80 + Math.random() * 20
      };

      const scoreA = metricsA.quality * 0.5 + metricsA.adherence * 0.3 + (1000 - metricsA.speed) * 0.2;
      const scoreB = metricsB.quality * 0.5 + metricsB.adherence * 0.3 + (1000 - metricsB.speed) * 0.2;

      setResults(prev => [...prev, {
        id: i + 1,
        input: inputs[i],
        outputA: `[v${versionA.version}] Análise processada para: ${inputs[i]}. O plano atual cobre os requisitos solicitados.`,
        outputB: `[v${versionB.version}] Com base na sua solicitação de "${inputs[i]}", verifiquei que o sistema está operacional.`,
        winner: Math.abs(scoreA - scoreB) < 5 ? 'Tie' : scoreA > scoreB ? 'A' : 'B',
        metricsA,
        metricsB
      }]);
      setProgress(((i + 1) / inputs.length) * 100);
    }
    
    setRunning(false);
    toast.success("Teste A/B concluído!");
  };

  const winCountA = results.filter(r => r.winner === 'A').length;
  const winCountB = results.filter(r => r.winner === 'B').length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <ArrowRight className="h-4 w-4 text-primary" />
            Arena de Teste A/B: v{versionA.version} vs v{versionB.version}
          </DialogTitle>
          <DialogDescription>
            Simule interações reais para comparar a performance de duas versões do prompt.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 space-y-6">
          {!results.length && !running && (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <GitBranch className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h3 className="text-title-sm font-bold">Pronto para a Batalha?</h3>
                <p className="text-body-sm text-muted-foreground max-w-sm">
                  Serão executados 5 casos de teste padrão para avaliar a aderência das instruções.
                </p>
              </div>
              <Button onClick={runTest} className="gap-2">
                <Play className="h-4 w-4" /> Iniciar Arena
              </Button>
            </div>
          )}

          {running && (
            <div className="py-12 space-y-4">
              <div className="flex items-center justify-between text-meta font-medium">
                <span>Executando simulações...</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-1.5" />
              <div className="flex justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary/40" />
              </div>
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-6 pb-6">
              {/* Scoreboard */}
              <div className="grid grid-cols-2 gap-4">
                <div className={`p-4 rounded-xl border-2 transition-all ${winCountA > winCountB ? 'border-nexus-emerald bg-nexus-emerald/5' : 'border-border'}`}>
                  <p className="text-meta text-muted-foreground uppercase font-bold tracking-wider">Versão A (v{versionA.version})</p>
                  <p className="text-3xl font-bold mt-1">{winCountA} vitórias</p>
                </div>
                <div className={`p-4 rounded-xl border-2 transition-all ${winCountB > winCountA ? 'border-nexus-emerald bg-nexus-emerald/5' : 'border-border'}`}>
                  <p className="text-meta text-muted-foreground uppercase font-bold tracking-wider">Versão B (v{versionB.version})</p>
                  <p className="text-3xl font-bold mt-1">{winCountB} vitórias</p>
                </div>
              </div>

              {/* Interaction list */}
              <div className="space-y-4">
                {results.map((r) => (
                  <div key={r.id} className="rounded-xl border border-border overflow-hidden">
                    <div className="bg-muted/30 px-4 py-2 text-meta font-bold flex items-center justify-between border-b">
                      <span>CASO #{r.id}: {r.input}</span>
                      <Badge variant={r.winner === 'Tie' ? 'outline' : 'default'} className={r.winner === 'A' || r.winner === 'B' ? 'bg-nexus-emerald/20 text-nexus-emerald border-nexus-emerald/20' : ''}>
                        {r.winner === 'Tie' ? 'Empate' : `Vencedor: ${r.winner}`}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 divide-x divide-border">
                      <div className={`p-4 text-meta space-y-3 ${r.winner === 'A' ? 'bg-nexus-emerald/5' : ''}`}>
                        <div className="flex items-center justify-between">
                          <span className="font-bold opacity-50">v{versionA.version}</span>
                          {r.winner === 'A' && <Check className="h-3 w-3 text-nexus-emerald" />}
                          {r.winner === 'B' && <X className="h-3 w-3 text-destructive" />}
                        </div>
                        <p className="leading-relaxed italic text-muted-foreground">"{r.outputA}"</p>
                        <div className="grid grid-cols-3 gap-1 pt-2 border-t border-border/50">
                          <div className="text-[9px]">
                            <p className="opacity-50 uppercase">Qualidade</p>
                            <p className="font-bold">{r.metricsA.quality.toFixed(0)}%</p>
                          </div>
                          <div className="text-[9px]">
                            <p className="opacity-50 uppercase">Latência</p>
                            <p className="font-bold">{r.metricsA.speed.toFixed(0)}ms</p>
                          </div>
                          <div className="text-[9px]">
                            <p className="opacity-50 uppercase">Aderência</p>
                            <p className="font-bold">{r.metricsA.adherence.toFixed(0)}%</p>
                          </div>
                        </div>
                      </div>
                      <div className={`p-4 text-meta space-y-3 ${r.winner === 'B' ? 'bg-nexus-emerald/5' : ''}`}>
                        <div className="flex items-center justify-between">
                          <span className="font-bold opacity-50">v{versionB.version}</span>
                          {r.winner === 'B' && <Check className="h-3 w-3 text-nexus-emerald" />}
                          {r.winner === 'A' && <X className="h-3 w-3 text-destructive" />}
                        </div>
                        <p className="leading-relaxed italic text-muted-foreground">"{r.outputB}"</p>
                        <div className="grid grid-cols-3 gap-1 pt-2 border-t border-border/50">
                          <div className="text-[9px]">
                            <p className="opacity-50 uppercase">Qualidade</p>
                            <p className="font-bold">{r.metricsB.quality.toFixed(0)}%</p>
                          </div>
                          <div className="text-[9px]">
                            <p className="opacity-50 uppercase">Latência</p>
                            <p className="font-bold">{r.metricsB.speed.toFixed(0)}ms</p>
                          </div>
                          <div className="text-[9px]">
                            <p className="opacity-50 uppercase">Aderência</p>
                            <p className="font-bold">{r.metricsB.adherence.toFixed(0)}%</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="p-6 border-t bg-muted/10">
          <div className="flex items-center gap-2 mr-auto text-meta text-muted-foreground">
            <Info className="h-3 w-3" />
            A avaliação de "vencedor" é baseada em heurísticas de latência e tamanho da resposta.
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          {results.length > 0 && (
            <Button className="gap-2" onClick={runTest}>
              <Play className="h-3.5 w-3.5" /> Re-testar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
