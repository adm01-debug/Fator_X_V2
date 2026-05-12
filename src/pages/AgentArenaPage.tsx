import { useState } from "react";
import { Swords, Play, Trophy, BarChart3, ShieldCheck, Timer, Coins, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/PageHeader";
import { toast } from "sonner";
import { useAgents } from "@/hooks/use-agents";
import { invokeLLMGateway } from "@/services/llmGatewayService";

interface ArenaResult {
  agent_id: string;
  response: string;
  latency_ms: number;
  tokens: number;
  cost: number;
  score: number;
  reasoning: string;
}

export default function AgentArenaPage() {
  const { agents = [] } = useAgents();
  const [agentA, setAgentA] = useState<string>("");
  const [agentB, setAgentB] = useState<string>("");
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<{ a: ArenaResult; b: ArenaResult } | null>(null);

  const handleRunArena = async () => {
    if (!agentA || !agentB || !prompt.trim()) {
      toast.error("Selecione dois agentes e descreva o desafio.");
      return;
    }

    setRunning(true);
    setResults(null);
    
    try {
      // Simulate parallel execution via LLM Gateway
      const startTime = Date.now();
      
      const [resA, resB] = await Promise.all([
        invokeLLMGateway({ prompt, agent_id: agentA }),
        invokeLLMGateway({ prompt, agent_id: agentB })
      ]);

      const endTime = Date.now();
      const totalLatency = endTime - startTime;

      // Oracle Judgement (Simulated via a 3rd call or logic)
      const judgePrompt = `Avalie as duas respostas de IA abaixo para o prompt: "${prompt}"\n\nAgente A: ${resA.text}\n\nAgente B: ${resB.text}\n\nDetermine o vencedor, dê scores de 0-100 e explique o porquê. Responda em JSON: { "winner": "A" | "B", "scoreA": number, "scoreB": number, "reason": string }`;
      
      const judgement = await invokeLLMGateway({ prompt: judgePrompt, model: "gpt-4o" });
      const evalData = JSON.parse(judgement.text.replace(/```json|```/g, ''));

      setResults({
        a: {
          agent_id: agentA,
          response: resA.text,
          latency_ms: totalLatency / 2, // simplified
          tokens: resA.usage?.total_tokens ?? 0,
          cost: resA.usage?.cost ?? 0.002,
          score: evalData.scoreA,
          reasoning: evalData.reason
        },
        b: {
          agent_id: agentB,
          response: resB.text,
          latency_ms: totalLatency / 2 + 50,
          tokens: resB.usage?.total_tokens ?? 0,
          cost: resB.usage?.cost ?? 0.0015,
          score: evalData.scoreB,
          reasoning: evalData.reason
        }
      });

      toast.success(`Arena concluída! Vencedor: Agente ${evalData.winner}`);
    } catch (e: any) {
      toast.error("Erro na arena: " + e.message);
    } finally {
      setRunning(false);
    }
  };

  const getAgentName = (id: string) => agents.find(a => a.id === id)?.name || id;

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-8 max-w-[1440px] mx-auto animate-page-enter">
      <PageHeader 
        title="Agent Battle Arena" 
        description="Duelo de inteligências. Coloque dois agentes frente a frente e deixe o Oráculo julgar a performance."
        gradient={true}
      />

      <div className="grid grid-cols-12 gap-6">
        {/* Setup Column */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          <Card className="nexus-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Swords className="h-5 w-5 text-primary" />
                Configurar Duelo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Competidor A</label>
                <Select value={agentA} onValueChange={setAgentA}>
                  <SelectTrigger className="bg-secondary/30 h-12">
                    <SelectValue placeholder="Selecione Agente A" />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-center">
                <Badge variant="outline" className="text-[10px] py-0 font-bold bg-muted">VS</Badge>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Competidor B</label>
                <Select value={agentB} onValueChange={setAgentB}>
                  <SelectTrigger className="bg-secondary/30 h-12">
                    <SelectValue placeholder="Selecione Agente B" />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 pt-4">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">O Desafio (Prompt)</label>
                <Textarea 
                  placeholder="Ex: Escreva um código Python que ordene uma lista usando bubble sort..." 
                  className="min-h-[120px] bg-secondary/20"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
              </div>

              <Button 
                onClick={handleRunArena} 
                disabled={running || !agentA || !agentB || !prompt.trim()}
                className="w-full h-12 nexus-gradient-bg text-primary-foreground font-black uppercase tracking-widest"
              >
                {running ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5 mr-2" />}
                {running ? "Batalhando..." : "Iniciar Batalha"}
              </Button>
            </CardContent>
          </Card>

          {results && (
            <Card className="border-nexus-emerald/30 bg-nexus-emerald/5">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-nexus-emerald" />
                  <CardTitle className="text-sm">Veredito do Oráculo</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-foreground leading-relaxed italic">
                  "{results.a.score > results.b.score ? results.a.reasoning : results.b.reasoning}"
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Results Column */}
        <div className="col-span-12 lg:col-span-8">
          {!results && !running ? (
            <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-border/40 rounded-[2rem] bg-muted/5 p-12 text-center">
              <div className="h-20 w-20 rounded-full bg-primary/5 flex items-center justify-center mb-6">
                <BarChart3 className="h-10 w-10 text-muted-foreground/30" />
              </div>
              <h3 className="text-lg font-bold text-foreground">Aguardando Arena</h3>
              <p className="text-sm text-muted-foreground max-w-xs mt-2">
                Selecione os competidores e inicie a batalha para ver as métricas de performance lado a lado.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4">
              <CompetidorResult 
                label="Agente A" 
                name={getAgentName(agentA)} 
                result={results?.a || null} 
                isWinner={!!results && results.a.score > results.b.score}
                loading={running}
              />
              <CompetidorResult 
                label="Agente B" 
                name={getAgentName(agentB)} 
                result={results?.b || null} 
                isWinner={!!results && results.b.score > results.a.score}
                loading={running}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CompetidorResult({ label, name, result, isWinner, loading }: { label: string; name: string; result: ArenaResult | null; isWinner: boolean; loading: boolean }) {
  return (
    <Card className={`relative overflow-hidden transition-all duration-500 ${isWinner ? 'ring-2 ring-nexus-emerald shadow-2xl shadow-nexus-emerald/10' : 'opacity-80'}`}>
      {isWinner && (
        <div className="absolute top-0 right-0 p-3">
          <Badge className="bg-nexus-emerald text-white animate-bounce">VENCEDOR</Badge>
        </div>
      )}
      
      <CardHeader className="bg-muted/30">
        <div className="flex items-center gap-2 mb-1">
          <Badge variant="outline" className="text-[10px] uppercase font-bold">{label}</Badge>
        </div>
        <CardTitle className="text-xl font-black truncate">{name}</CardTitle>
      </CardHeader>
      
      <CardContent className="p-6 space-y-6">
        {loading ? (
          <div className="space-y-4 py-8">
            <div className="flex justify-between items-center">
              <div className="h-4 w-24 bg-muted animate-pulse rounded" />
              <div className="h-4 w-12 bg-muted animate-pulse rounded" />
            </div>
            <Progress value={45} className="h-2 animate-pulse" />
            <div className="h-32 w-full bg-muted animate-pulse rounded-xl" />
          </div>
        ) : result ? (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-muted-foreground">
                <span>Score Qualidade</span>
                <span className={isWinner ? "text-nexus-emerald" : ""}>{result.score}/100</span>
              </div>
              <Progress value={result.score} className={`h-2 ${isWinner ? "bg-nexus-emerald/20" : ""}`} />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <MetricItem icon={Timer} label="Latência" value={`${result.latency_ms}ms`} />
              <MetricItem icon={Coins} label="Custo" value={`$${result.cost.toFixed(4)}`} />
              <MetricItem icon={BarChart3} label="Tokens" value={result.tokens.toString()} />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Resposta</label>
              <div className="bg-muted/30 rounded-xl p-4 border border-border/40 max-h-[250px] overflow-y-auto text-sm font-medium leading-relaxed">
                {result.response}
              </div>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function MetricItem({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="bg-secondary/10 p-2 rounded-xl border border-border/20 text-center">
      <Icon className="h-3.5 w-3.5 mx-auto mb-1 text-muted-foreground" />
      <div className="text-[10px] text-muted-foreground uppercase font-bold mb-0.5">{label}</div>
      <div className="text-xs font-black truncate">{value}</div>
    </div>
  );
}
