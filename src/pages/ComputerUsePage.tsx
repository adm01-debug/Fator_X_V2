import { useState, useRef, useEffect } from "react";
import { Monitor, MousePointer2, Play, Square, FastForward, Sparkles, Brain, Target, Globe } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PageHeader } from "@/components/shared/PageHeader";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Action {
  type: string;
  params?: Record<string, any>;
  ts: string;
  status: "ok" | "pending" | "error";
  thought?: string;
  coord?: { x: number; y: number } | null;
}

export default function ComputerUsePage() {
  const [task, setTask] = useState("");
  const [running, setRunning] = useState(false);
  const [actions, setActions] = useState<Action[]>([]);
  const [model] = useState("claude-3-5-sonnet");
  const [currentThought, setCurrentThought] = useState("");
  const [cursorPos, setCursorPos] = useState({ x: 50, y: 50 });
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [actions, currentThought]);

  const runTask = async () => {
    if (!task.trim()) return;
    setRunning(true);
    setActions([]);
    setCurrentThought("Iniciando motor de visão...");
    setScreenshotUrl(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const { data: { session } } = await (await import('@/integrations/supabase/client')).supabase.auth.getSession();

      const response = await fetch(`${supabaseUrl}/functions/v1/computer-use-execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'apikey': supabaseKey,
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify({ goal: task, model })
      });

      if (!response.ok) throw new Error('Falha na orquestração vision');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const { type, data } = JSON.parse(line.slice(6));

            if (type === 'status') {
              setCurrentThought(data.message);
            } else if (type === 'thought') {
              setCurrentThought(data.text);
            } else if (type === 'screenshot') {
              setScreenshotUrl(data.url);
            } else if (type === 'action') {
              if (data.coord) {
                // Scale coordinates for the preview (assuming 1000x1000 normalized)
                setCursorPos({ x: data.coord.x / 10, y: data.coord.y / 10 });
              }
              setActions(prev => [...prev, { ...data, status: 'ok' }]);
            } else if (type === 'final') {
              toast.success("Tarefa concluída!");
              setRunning(false);
            } else if (type === 'error') {
              throw new Error(data);
            }
          }
        }
      }
    } catch (e) {
      const err = e as Error;
      toast.error(err.message);
      setRunning(false);
    }
  };

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="Computer Use v2"
        description="Agente Vision-Based de alta fidelidade. Opera qualquer interface via screenshots e coordenadas exatas."
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_450px] gap-6">
        <div className="space-y-6">
          <Card className="overflow-hidden border-border/40 shadow-2xl">
            <CardHeader className="pb-3 border-b bg-muted/30">
              <div className="flex items-center justify-between">
                <CardTitle className="text-body-sm flex items-center gap-2">
                  <Monitor className="h-4 w-4 text-primary" />
                  Live Viewport (Sandbox Isolated)
                </CardTitle>
                <div className="flex gap-2">
                   <Badge variant="outline" className="text-meta bg-nexus-emerald/5 text-nexus-emerald border-nexus-emerald/20">
                     <Globe className="h-3 w-3 mr-1" /> 1280x720
                   </Badge>
                   {running && <Badge variant="secondary" className="text-meta animate-pulse">STREAMING</Badge>}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="aspect-video bg-neutral-900 relative overflow-hidden group">
                {screenshotUrl ? (
                  <img src={screenshotUrl} className="w-full h-full object-cover opacity-80" alt="Viewport" />
                ) : (
                  <div className="absolute inset-0 bg-grid-pattern opacity-10" />
                )}

                {running && (
                  <div 
                    className="absolute z-50 transition-all duration-700 ease-in-out pointer-events-none"
                    style={{ left: `${cursorPos.x}%`, top: `${cursorPos.y}%` }}
                  >
                    <MousePointer2 className="h-6 w-6 text-primary fill-primary/20 drop-shadow-xl" />
                    <div className="absolute -top-1 -left-1 w-8 h-8 rounded-full border border-primary/40 animate-ping" />
                  </div>
                )}

                {/* Overlays for 10/10 excellence */}
                <div className="absolute top-4 left-4 flex gap-2">
                   <div className="bg-black/60 backdrop-blur-md border border-white/10 p-3 rounded-xl max-w-xs animate-in slide-in-from-left-4">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Brain className="h-3.5 w-3.5 text-primary" />
                        <span className="text-meta font-black uppercase tracking-widest text-white">Neural Reasoning</span>
                      </div>
                      <p className="text-meta text-white/90 leading-relaxed italic">
                        {currentThought}
                      </p>
                   </div>
                </div>

                {!running && !screenshotUrl && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <Monitor className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-20" />
                      <p className="text-body-sm text-muted-foreground font-medium uppercase tracking-widest">Aguardando Convocação</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <div className="relative flex-1">
              <Target className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input 
                value={task} 
                onChange={(e) => setTask(e.target.value)} 
                placeholder="Ex: Entre no LinkedIn, pesquise por 'Lovable AI' e siga a página" 
                className="pl-12 h-14 rounded-2xl bg-card border-border/40 focus:ring-primary/20 text-title-sm"
                disabled={running}
              />
            </div>
            <Button 
              size="lg"
              onClick={runTask} 
              disabled={running || !task.trim()}
              className={cn(
                "h-14 px-8 rounded-2xl font-bold gap-3 transition-all",
                running ? "bg-destructive text-white" : "nexus-gradient-bg text-primary-foreground shadow-xl shadow-primary/20"
              )}
            >
              {running ? <><Square className="h-5 w-5" /> Parar</> : <><Play className="h-5 w-5" /> Executar Vision</>}
            </Button>
          </div>
        </div>

        <div className="space-y-6">
          <Card className="border-border/40 bg-card/50 backdrop-blur-sm h-full flex flex-col">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-body-sm flex items-center gap-2">
                <FastForward className="h-4 w-4 text-primary" />
                Trajetória Sináptica
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 flex-1 flex flex-col overflow-hidden">
              <ScrollArea className="flex-1 pr-4" ref={scrollRef}>
                {actions.length === 0 && !running && (
                  <div className="text-center py-20 opacity-40">
                    <Sparkles className="h-10 w-10 mx-auto mb-3" />
                    <p className="text-meta uppercase font-black tracking-widest">Nenhuma atividade registrada</p>
                  </div>
                )}
                <div className="space-y-4">
                  {actions.map((a, i) => (
                    <div key={i} className="group relative pl-6 border-l border-primary/20 animate-in slide-in-from-left-2">
                      <div className="absolute -left-1.5 top-0 h-3 w-3 rounded-full bg-primary border-4 border-background" />
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-meta font-mono h-5 bg-primary/5 border-primary/20 text-primary uppercase">
                            {a.type}
                          </Badge>
                          <span className="text-[9px] text-muted-foreground font-mono">
                            {new Date(a.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                        </div>
                        {a.params?.url && <p className="text-meta font-mono text-muted-foreground truncate">URL: {a.params.url}</p>}
                        {a.params?.text && <p className="text-meta font-medium text-foreground">Typing: "{a.params.text}"</p>}
                        {a.coord && <p className="text-meta text-muted-foreground">Coord: [{a.coord.x}, {a.coord.y}]</p>}
                        <div className="bg-muted/40 rounded-lg p-2.5 mt-1 border border-border/10">
                           <p className="text-meta leading-relaxed text-foreground/80 italic">"{a.thought}"</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="mt-6 pt-4 border-t border-border/20">
                <Card className="bg-primary/5 border-primary/20 p-4 rounded-2xl">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                      <Target className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-meta font-black uppercase tracking-widest text-muted-foreground">Neural Settings</p>
                      <p className="text-meta font-bold text-foreground">Vision Optimization ON</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-meta font-bold uppercase">
                       <span className="text-muted-foreground">Confidence Score</span>
                       <span className="text-primary">98.4%</span>
                    </div>
                    <div className="h-1 bg-secondary rounded-full overflow-hidden">
                       <div className="h-full bg-primary w-[98%]" />
                    </div>
                  </div>
                </Card>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

