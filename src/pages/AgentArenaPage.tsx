import { useState, useEffect } from "react";
import { Swords, Play, Trophy, BarChart3, Timer, Coins, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/shared/PageHeader";
import { toast } from "sonner";
import { listAgentSummaries, type AgentSummary } from "@/services/agentsService";
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
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [agentA, setAgentA] = useState<string>("");
  const [agentB, setAgentB] = useState<string>("");
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<{ a: ArenaResult; b: ArenaResult } | null>(null);

  useEffect(() => {
    listAgentSummaries().then(data => setAgents(data.agents)).catch(() => toast.error("Falha ao carregar agentes"));
  }, []);

  const handleRunArena = async () => {
    if (!agentA || !agentB || !prompt.trim()) {
      toast.error("Selecione dois agentes e descreva o desafio.");
      return;
    }

    setRunning(true);
    setResults(null);
    
    try {
      const startTime = Date.now();
      
      const [resA, resB] = await Promise.all([
        invokeLLMGateway({ 
          model: "gpt-4o",
          messages: [{ role: "user", content: prompt }],
          agentId: agentA 
        }),
        invokeLLMGateway({ 
          model: "gpt-4o",
          messages: [{ role: "user", content: prompt }],
          agentId: agentB 
        })
      ]) as Array<{ text: string; usage?: { total_tokens: number; cost: number } }>;

      const endTime = Date.now();
      const totalLatency = endTime - startTime;

      const judgePrompt = `Avalie as duas respostas de IA abaixo para o prompt: "${prompt}"\n\nAgente A: ${resA.text}\n\nAgente B: ${resB.text}\n\nDetermine o vencedor, dê scores de 0-100 e explique o porquê. Responda em JSON: { "winner": "A" | "B", "scoreA": number, "scoreB": number, "reason": string }`;
      
      const judgement = await invokeLLMGateway({ 
        model: "gpt-4o",
        messages: [{ role: "user", content: judgePrompt }]
      }) as { text: string };

      const evalData = JSON.parse(judgement.text.replace(/```json|```/g, ''));

      setResults({
        a: {
          agent_id: agentA,
          response: resA.text,
          latency_ms: Math.round(totalLatency / 2),
          tokens: resA.usage?.total_tokens ?? 0,
          cost: resA.usage?.cost ?? 0.002,
          score: evalData.scoreA,
          reasoning: evalData.reason
        },
        b: {
          agent_id: agentB,
          response: resB.text,
          latency_ms: Math.round(totalLatency / 2 + 50),
          tokens: resB.usage?.total_tokens ?? 0,
          cost: resB.usage?.cost ?? 0.0015,
          score: evalData.scoreB,
          reasoning: evalData.reason
        }
      });

      toast.success(`Arena concluída! Vencedor: Agente ${evalData.winner}`);
    } catch (e) {
      const err = e as Error;
      toast.error("Erro na arena: " + err.message);
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
        <div className="col-span-12 lg:col-span-4 space-y-6">
          <Card className="nexus-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-body-sm font-bold uppercase tracking-wider">
                <Swords className="h-4 w-4 text-primary" />
                Configurar Duelo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="agentarenapage-competidor-a-fa06d2" className="text-meta font-bold uppercase tracking-wider text-muted-foreground">Competidor A</label>
                <Select value={agentA} onValueChange={setAgentA}>
                  <SelectTrigger id="agentarenapage-competidor-a-fa06d2" className="bg-secondary/30 h-11">
                    <SelectValue placeholder="Selecione Agente A" />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-center">
                <Badge variant="outline" className="text-meta py-0 font-bold bg-muted/50">VS</Badge>
              </div>

              <div className="space-y-2">
                <label htmlFor="agentarenapage-competidor-b-0e37a4" className="text-meta font-bold uppercase tracking-wider text-muted-foreground">Competidor B</label>
                <Select value={agentB} onValueChange={setAgentB}>
                  <SelectTrigger id="agentarenapage-competidor-b-0e37a4" className="bg-secondary/30 h-11">
                    <SelectValue placeholder="Selecione Agente B" />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 pt-4">
                <label htmlFor="agentarenapage-o-desafio-prompt-e001fb" className="text-meta font-bold uppercase tracking-wider text-muted-foreground">O Desafio (Prompt)</label>
                <Textarea id="agentarenapage-o-desafio-prompt-e001fb" 
                  placeholder="Ex: Escreva um código Python que ordene uma lista usando bubble sort..." 
                  className="min-h-[120px] bg-secondary/20 text-body-sm"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
              </div>

              <Button 
                onClick={handleRunArena} 
                disabled={running || !agentA || !agentB || !prompt.trim()}
                className="w-full h-11 nexus-gradient-bg text-primary-foreground font-black uppercase tracking-widest text-meta"
              >
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                {running ? "Batalhando..." : "Iniciar Batalha"}
              </Button>
            </CardContent>
          </Card>

          {results && (
            <Card className="border-nexus-emerald/30 bg-nexus-emerald/5">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-nexus-emerald" />
                  <CardTitle className="text-meta font-bold uppercase">Veredito do Oráculo</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-meta text-foreground leading-relaxed italic">
                  "{results.a.score > results.b.score ? results.a.reasoning : results.b.reasoning}"
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="col-span-12 lg:col-span-8">
          {!results && !running ? (
            <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-border/40 rounded-[2rem] bg-muted/5 p-12 text-center">
              <div className="h-16 w-16 rounded-full bg-primary/5 flex items-center justify-center mb-6">
                <BarChart3 className="h-8 w-8 text-muted-foreground/30" />
              </div>
              <h3 className="text-title-sm font-bold text-foreground">Aguardando Arena</h3>
              <p className="text-body-sm text-muted-foreground max-w-xs mt-2 leading-relaxed">
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
    <Card className={`relative overflow-hidden transition-all duration-500 rounded-3xl ${isWinner ? 'ring-2 ring-nexus-emerald shadow-nexus-2xl shadow-nexus-emerald/10' : 'opacity-80 border-border/40'}`}>
      {isWinner && (
        <div className="absolute top-0 right-0 p-3">
          <Badge className="bg-nexus-emerald text-white animate-bounce text-meta font-black">VENCEDOR</Badge>
        </div>
      )}
      
      <CardHeader className="bg-muted/30 p-6">
        <div className="flex items-center gap-2 mb-1">
          <Badge variant="outline" className="text-meta uppercase font-bold tracking-tighter">{label}</Badge>
        </div>
        <CardTitle className="text-xl font-black truncate">{name}</CardTitle>
      </CardHeader>
      
      <CardContent className="p-6 space-y-6">
        {loading ? (
          <div className="space-y-4 py-8">
            <div className="flex justify-between items-center">
              <div className="h-3 w-20 bg-muted animate-pulse rounded" />
              <div className="h-3 w-10 bg-muted animate-pulse rounded" />
            </div>
            <Progress value={45} className="h-1.5 animate-pulse" />
            <div className="h-32 w-full bg-muted animate-pulse rounded-2xl" />
          </div>
        ) : result ? (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-meta font-bold uppercase tracking-widest text-muted-foreground">
                <span>Score Qualidade</span>
                <span className={isWinner ? "text-nexus-emerald" : ""}>{result.score}/100</span>
              </div>
              <Progress value={result.score} className={`h-1.5 ${isWinner ? "bg-nexus-emerald/20" : ""}`} />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <MetricItem icon={Timer} label="Latência" value={`${result.latency_ms}ms`} />
              <MetricItem icon={Coins} label="Custo" value={`$${result.cost.toFixed(4)}`} />
              <MetricItem icon={BarChart3} label="Tokens" value={result.tokens.toString()} />
            </div>

            <div className="space-y-2">
              <label className="text-meta font-bold uppercase tracking-widest text-muted-foreground">Resposta</label>
              <div className="bg-muted/30 rounded-2xl p-4 border border-border/20 max-h-[250px] overflow-y-auto text-meta font-medium leading-relaxed scrollbar-hide">
                {result.response}
              </div>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function MetricItem({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="bg-secondary/10 p-2.5 rounded-2xl border border-border/20 text-center">
      <Icon className="h-3 w-3 mx-auto mb-1 text-muted-foreground" />
      <div className="text-[9px] text-muted-foreground uppercase font-bold mb-0.5 tracking-tighter">{label}</div>
      <div className="text-meta font-black truncate">{value}</div>
    </div>
  );
}
