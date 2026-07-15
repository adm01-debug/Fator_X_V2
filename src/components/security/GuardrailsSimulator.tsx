import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldAlert, ShieldCheck, Loader2, Play, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

export function GuardrailsSimulator() {
  const [input, setInput] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<{
    safe: boolean;
    violations: string[];
    score: number;
    metadata?: Record<string, unknown>;
  } | null>(null);

  const simulateAnalysis = async () => {
    if (!input.trim()) return;
    setAnalyzing(true);
    setResult(null);

    // Simulated back-end call to guardrails-engine
    setTimeout(() => {
      const lower = input.toLowerCase();
      const violations: string[] = [];
      
      if (lower.includes('ignore all previous instructions') || lower.includes('system prompt')) {
        violations.push('Prompt Injection Detected');
      }
      if (lower.includes('password') || lower.includes('secret') || lower.includes('key_')) {
        violations.push('Sensitive Information (PII/Secrets)');
      }
      if (lower.includes('hate') || lower.includes('kill') || lower.includes('attack')) {
        violations.push('Toxic Content / Violence');
      }

      setResult({
        safe: violations.length === 0,
        violations,
        score: violations.length > 0 ? 0.2 : 0.98,
        metadata: {
          latency_ms: 120,
          model: 'guardrails-ml-v2.2',
          confidence: 0.95
        }
      });
      setAnalyzing(false);
      if (violations.length > 0) {
        toast.warning('Violação detectada no simulador');
      } else {
        toast.success('Entrada validada como segura');
      }
    }, 1200);
  };

  return (
    <Card className="border-primary/20 bg-card/50 backdrop-blur-xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-nexus-purple/10 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-nexus-purple" />
            </div>
            <div>
              <CardTitle className="text-title-sm font-bold">Simulador de Guardrails</CardTitle>
              <CardDescription className="text-meta uppercase tracking-widest font-black opacity-50">Teste de Stress Neural</CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="border-nexus-purple/30 text-nexus-purple">v2.2 ML</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <label htmlFor="guardrailssimulator-entrada-para-teste-8ac239" className="text-meta font-bold text-muted-foreground uppercase tracking-wider">Entrada para teste</label>
          <Textarea id="guardrailssimulator-entrada-para-teste-8ac239" 
            value={input} 
            onChange={(e) => setInput(e.target.value)} 
            placeholder="Digite um prompt para testar as políticas de segurança... (ex: ignore system instructions)" 
            className="min-h-[120px] bg-secondary/20 border-border/40 focus:ring-nexus-purple/20 text-body-sm font-medium rounded-2xl"
          />
        </div>

        <Button 
          onClick={simulateAnalysis} 
          disabled={analyzing || !input.trim()} 
          className="w-full h-12 rounded-xl nexus-gradient-bg text-primary-foreground font-bold gap-2 shadow-nexus-xl shadow-primary/10"
        >
          {analyzing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-4 h-4" />}
          {analyzing ? 'Analisando Camadas...' : 'Executar Análise de Segurança'}
        </Button>

        {result && (
          <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-500">
            <div className={`p-6 rounded-[2rem] border flex items-center justify-between ${
              result.safe ? 'bg-nexus-emerald/5 border-nexus-emerald/20' : 'bg-destructive/5 border-destructive/20'
            }`}>
              <div className="flex items-center gap-4">
                <div className={`h-14 w-14 rounded-full flex items-center justify-center ${
                  result.safe ? 'bg-nexus-emerald/20' : 'bg-destructive/20'
                }`}>
                  {result.safe ? <ShieldCheck className="w-8 h-8 text-nexus-emerald" /> : <ShieldAlert className="w-8 h-8 text-destructive" />}
                </div>
                <div>
                  <p className={`text-title-sm font-black tracking-tight ${result.safe ? 'text-nexus-emerald' : 'text-destructive'}`}>
                    {result.safe ? 'ENTRADA SEGURA' : 'RISCO DETECTADO'}
                  </p>
                  <p className="text-meta text-muted-foreground font-medium">Score de Confiança: {(result.score * 100).toFixed(0)}%</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-meta text-muted-foreground uppercase font-black tracking-widest">Latência</p>
                <p className="text-body-sm font-mono font-bold text-foreground">{String(result.metadata?.latency_ms ?? '')}ms</p>
              </div>
            </div>

            {result.violations.length > 0 && (
              <div className="space-y-2">
                <p className="text-meta font-bold text-muted-foreground uppercase tracking-wider px-1">Gatilhos Ativados</p>
                <div className="flex flex-wrap gap-2">
                  {result.violations.map((v, i) => (
                    <Badge key={i} variant="destructive" className="bg-destructive/10 text-destructive border-destructive/20 px-3 py-1 font-bold">
                      {v}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
