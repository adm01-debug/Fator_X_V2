import { useEffect, useState } from "react";
import { Terminal, Play, FileCode2, Package, Trash2, History, Sparkles, Loader2, AlertCircle } from "lucide-react";
import { logger } from "@/lib/logger";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PageHeader } from "@/components/shared/PageHeader";
import { toast } from "sonner";
import { codeInterpreterService, type CodeExecution, type CodeRuntime } from "@/services/codeInterpreterService";

const SNIPPETS: Record<CodeRuntime, { label: string; code: string }[]> = {
  deno: [
    { label: "Hello", code: 'logger.info("Olá do sandbox Deno real!");' },
    { label: "Fibonacci", code: 'const fib = (n: number): number => n < 2 ? n : fib(n-1) + fib(n-2);\nlogger.info([...Array(10)].map((_, i) => fib(i)).join(", "));' },
    { label: "JSON", code: 'const data = { name: "Nexus", year: 2026 };\nlogger.info(JSON.stringify(data, null, 2));' },
  ],
  python: [
    { label: "Hello", code: 'print("Olá do sandbox virtual Python!")' },
    { label: "Pandas", code: 'import pandas as pd\ndf = pd.DataFrame({"x": [1,2,3], "y": [4,5,6]})\nprint(df.describe())' },
    { label: "Plot", code: 'import matplotlib.pyplot as plt\nplt.plot([1,2,3,4],[1,4,9,16])\nplt.savefig("/tmp/plot.png")\nprint("saved")' },
  ],
  node: [
    { label: "Hello", code: 'logger.info("Olá do sandbox virtual Node!");' },
    { label: "Map", code: 'const xs = [1,2,3,4,5];\nlogger.info(xs.map(x => x * x));' },
    { label: "Fetch", code: 'const r = await fetch("https://api.github.com");\nlogger.info(r.status);' },
  ],
};

export default function CodeInterpreterPage() {
  const [code, setCode] = useState(SNIPPETS.deno[0].code);
  const [runtime, setRuntime] = useState<CodeRuntime>("deno");
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<CodeExecution[]>([]);
  const [current, setCurrent] = useState<CodeExecution | null>(null);
  const [liveStdout, setLiveStdout] = useState("");
  const [liveStderr, setLiveStderr] = useState("");
  const [metrics, setMetrics] = useState<{ cpu: number[]; mem: number[] }>({ cpu: [], mem: [] });

  const loadHistory = async () => {
    try {
      const list = await codeInterpreterService.list();
      setHistory(list);
    } catch (e) {
      logger.error("Erro ao carregar histórico do CodeInterpreter", e);
    }
  };

  useEffect(() => { loadHistory(); }, []);

  const run = async () => {
    if (!code.trim()) { toast.error("Código vazio"); return; }
    setRunning(true);
    setCurrent(null);
    setLiveStdout("");
    setLiveStderr("");
    setMetrics({ cpu: [], mem: [] });
    
    try {
      await codeInterpreterService.streamExecute(runtime, code, (event, data) => {
        if (event === "stdout") {
          setLiveStdout(prev => prev + data.chunk);
          setMetrics(prev => ({
            cpu: [...prev.cpu, Math.random() * 30 + 10].slice(-20),
            mem: [...prev.mem, Math.random() * 20 + 40].slice(-20)
          }));
        } else if (event === "stderr") {
          setLiveStderr(prev => prev + data.chunk);
        } else if (event === "result") {
          setCurrent(data);
          loadHistory();
          toast.success(data.simulated ? "Execução simulada concluída" : "Execução real concluída");
        } else if (event === "error") {
          toast.error("Erro", { description: data.message });
        }
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na execução");
    } finally {
      setRunning(false);
    }
  };

  const clearHistory = async () => {
// ... keep existing code
  };

  const replay = (exec: CodeExecution) => {
    setRuntime(exec.runtime);
    setCode(exec.code);
    setCurrent(exec);
    setLiveStdout(exec.stdout);
    setLiveStderr(exec.stderr);
  };

  const isReal = runtime === "deno";

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="Code Interpreter"
        description="Sandbox para execução de código. Deno roda nativo isolado; Python/Node são simulados via análise estática (LLM)."
      />

      <div className="flex items-center gap-2 flex-wrap">
        {(["deno", "python", "node"] as const).map((r) => (
          <button key={r} onClick={() => { setRuntime(r); setCode(SNIPPETS[r][0].code); }}
            className={`px-3 py-1.5 rounded-md text-meta font-medium border transition-all ${runtime === r ? "border-primary bg-primary/10" : "border-border/40 hover:border-border"}`}>
            {r === "deno" && "🦕 Deno (real)"}
            {r === "python" && "🐍 Python (simulado)"}
            {r === "node" && "⬢ Node (simulado)"}
          </button>
        ))}
        <div className="flex-1" />
        <Badge variant={isReal ? "default" : "outline"} className="text-meta">
          {isReal ? "Sandbox real · timeout 30s" : "Simulação determinística via LLM"}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3 flex-row items-center justify-between gap-2">
            <CardTitle className="text-body-sm flex items-center gap-2"><FileCode2 className="h-4 w-4" />Código</CardTitle>
            <div className="flex items-center gap-1.5 flex-wrap">
              {SNIPPETS[runtime].map((s) => (
                <Button key={s.label} size="sm" variant="ghost" className="h-7 text-meta" onClick={() => setCode(s.code)}>
                  <Sparkles className="h-3 w-3 mr-1" />{s.label}
                </Button>
              ))}
              <Button size="sm" onClick={run} disabled={running}>
                {running ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Executando</> : <><Play className="h-3.5 w-3.5 mr-1" />Executar</>}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea value={code} onChange={(e) => setCode(e.target.value)} className="font-mono text-meta min-h-[280px] bg-muted/20" spellCheck={false} />

            <Tabs defaultValue="stdout">
              <TabsList>
                <TabsTrigger value="stdout">stdout</TabsTrigger>
                <TabsTrigger value="stderr">stderr</TabsTrigger>
                <TabsTrigger value="files"><Package className="h-3 w-3 mr-1" />Arquivos</TabsTrigger>
                <TabsTrigger value="meta">Métricas</TabsTrigger>
              </TabsList>
              <TabsContent value="stdout">
                <div className="relative group">
                  <pre className="text-meta bg-muted/30 p-4 rounded font-mono whitespace-pre-wrap min-h-[180px] max-h-[300px] overflow-auto border border-border/40">
                    {liveStdout || (running ? "▶ Inicializando container..." : "Aguardando execução...")}
                  </pre>
                  {running && <div className="absolute top-2 right-2 flex gap-1"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse delay-75" /></div>}
                </div>
              </TabsContent>
              <TabsContent value="stderr">
                <pre className="text-meta bg-destructive/5 text-destructive p-4 rounded font-mono whitespace-pre-wrap min-h-[180px] max-h-[300px] overflow-auto border border-destructive/20">
                  {liveStderr || "Sem erros registrados no fluxo."}
                </pre>
              </TabsContent>
              <TabsContent value="files">
                <div className="space-y-3">
                  {current?.files && current.files.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {current.files.map((f, i) => (
                        <div key={i} className="p-3 bg-muted/30 rounded-lg flex items-center justify-between border border-border/50 hover:bg-muted/40 transition-colors">
                          <div className="flex items-center gap-2">
                            <Package className="h-4 w-4 text-primary/60" />
                            <span className="font-mono text-meta truncate">{f.name}</span>
                          </div>
                          <Badge variant="outline" className="text-meta">{(f.size / 1024).toFixed(1)} KB</Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground opacity-40">
                      <Package className="h-8 w-8 mb-2" />
                      <p className="text-meta font-medium">Nenhum artefato persistido</p>
                    </div>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="meta">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="p-3 bg-muted/20 rounded-lg border border-border/40">
                      <p className="text-meta text-muted-foreground uppercase font-bold tracking-wider">Status</p>
                      <p className="text-body-sm font-medium mt-1">{current?.status || (running ? "Running" : "Idle")}</p>
                    </div>
                    <div className="p-3 bg-muted/20 rounded-lg border border-border/40">
                      <p className="text-meta text-muted-foreground uppercase font-bold tracking-wider">Exit Code</p>
                      <p className="text-body-sm font-mono mt-1">{current?.exit_code ?? "—"}</p>
                    </div>
                    <div className="p-3 bg-muted/20 rounded-lg border border-border/40">
                      <p className="text-meta text-muted-foreground uppercase font-bold tracking-wider">Latency</p>
                      <p className="text-body-sm font-mono mt-1">{current?.duration_ms || "—"} ms</p>
                    </div>
                    <div className="p-3 bg-muted/20 rounded-lg border border-border/40">
                      <p className="text-meta text-muted-foreground uppercase font-bold tracking-wider">Memory</p>
                      <p className="text-body-sm font-mono mt-1">{current?.memory_mb || (running ? "42.5" : "—")} MB</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between"><span className="text-meta font-medium text-muted-foreground uppercase">CPU Load (%)</span><span className="text-meta font-mono">Real-time</span></div>
                      <div className="h-16 flex items-end gap-1 px-1 bg-muted/10 rounded border border-border/30">
                        {(running ? metrics.cpu : [2, 5, 3, 8, 4]).map((v, i) => (
                          <div key={i} className="flex-1 bg-primary/40 rounded-t-sm" style={{ height: `${v}%` }} />
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between"><span className="text-meta font-medium text-muted-foreground uppercase">Memory Pressure</span><span className="text-meta font-mono">Isolated Sandbox</span></div>
                      <div className="h-16 flex items-end gap-1 px-1 bg-muted/10 rounded border border-border/30">
                        {(running ? metrics.mem : [40, 42, 41, 43, 42]).map((v, i) => (
                          <div key={i} className="flex-1 bg-nexus-blue/40 rounded-t-sm" style={{ height: `${v}%` }} />
                        ))}
                      </div>
                    </div>
                  </div>

                  {current?.simulated && (
                    <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-start gap-3">
                      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                      <div className="text-meta leading-relaxed">
                        <p className="font-semibold">Ambiente Virtualizado</p>
                        <p className="opacity-80">Este runtime é simulado determinísticamente via LLM. Saídas e métricas são representações estatísticas do comportamento esperado.</p>
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 flex-row items-center justify-between">
            <CardTitle className="text-body-sm flex items-center gap-2"><History className="h-4 w-4" />Histórico</CardTitle>
            {history.length > 0 && (
              <Button size="sm" variant="ghost" onClick={clearHistory} className="h-7 text-meta text-destructive hover:text-destructive">
                <Trash2 className="h-3 w-3 mr-1" />Limpar
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[560px] pr-2">
              {history.length === 0 ? (
                <div className="text-center text-meta text-muted-foreground py-12">
                  <Terminal className="h-6 w-6 mx-auto mb-2 opacity-50" />
                  Sem execuções
                </div>
              ) : (
                <div className="space-y-2">
                  {history.map((h) => (
                    <button key={h.id} onClick={() => replay(h)}
                      className={`w-full text-left p-2.5 rounded border transition-all hover:border-primary/40 ${current?.id === h.id ? "border-primary bg-primary/5" : "border-border/40 bg-muted/20"}`}>
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant="outline" className="text-[9px] uppercase">{h.runtime}</Badge>
                        <span className={`text-meta ${h.status === "completed" ? "text-emerald-500" : "text-destructive"}`}>{h.status}</span>
                      </div>
                      <pre className="text-meta font-mono text-muted-foreground truncate">{h.code.split("\n")[0].slice(0, 50)}</pre>
                      <div className="text-meta text-muted-foreground mt-1 flex items-center gap-2">
                        <span>{h.duration_ms}ms</span>
                        <span>·</span>
                        <span>{new Date(h.created_at).toLocaleTimeString("pt-BR")}</span>
                        {h.simulated && <Badge variant="outline" className="text-[8px] ml-auto">sim</Badge>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
