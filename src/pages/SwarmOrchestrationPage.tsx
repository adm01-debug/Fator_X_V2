import { useState, useRef, useEffect } from "react";
import { A2ARegistry } from "@/components/agents/A2ARegistry";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Network, Send, Terminal, Loader2, Play, 
  Activity, ArrowRightLeft, ShieldCheck, Share2 
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { invokeA2AServer } from "@/services/llmGatewayService";

interface A2ALog {
  id: string;
  timestamp: string;
  direction: 'inbound' | 'outbound';
  type: 'handshake' | 'task' | 'response' | 'error';
  agent: string;
  payload: unknown;
}

export default function SwarmOrchestrationPage() {
  const [logs, setLogs] = useState<A2ALog[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Initial system log
    const initialLog: A2ALog = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      direction: 'inbound',
      type: 'handshake',
      agent: 'A2A-Hub',
      payload: { status: 'ready', version: '0.3', protocol: 'Google A2A' }
    };
    setLogs([initialLog]);
  }, []);

  const addLog = (log: Omit<A2ALog, 'id' | 'timestamp'>) => {
    const newLog: A2ALog = {
      ...log,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString(),
    };
    setLogs(prev => [...prev, newLog]);
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    
    setSending(true);
    addLog({
      direction: 'outbound',
      type: 'task',
      agent: 'Oracle-Council',
      payload: { message: { parts: [{ type: 'text', text: input }] } }
    });

    try {
      const response = await invokeA2AServer({
        message: { parts: [{ type: 'text', text: input }] }
      });

      addLog({
        direction: 'inbound',
        type: 'response',
        agent: 'Nexus-A2A-Server',
        payload: response as Record<string, unknown>
      });
      
      toast.success("Comunicação A2A concluída");
    } catch (err) {
      addLog({
        direction: 'inbound',
        type: 'error',
        agent: 'Nexus-A2A-Server',
        payload: { error: err instanceof Error ? err.message : String(err) }
      });
      toast.error("Erro na comunicação A2A");
    } finally {
      setSending(false);
      setInput("");
    }
  };

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-8 max-w-[1440px] mx-auto animate-page-enter">
      {/* Header */}
      <div className="bg-gradient-to-br from-card to-card/50 border border-border/40 p-10 rounded-[2.5rem] shadow-nexus-xl shadow-primary/5 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/[0.04] rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 relative">
          <div className="flex items-center gap-7">
            <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20 shadow-nexus-2xl shadow-primary/10">
              <Network className="h-11 w-11 text-primary animate-float" />
            </div>
            <div className="space-y-1">
              <h1 className="text-4xl font-heading font-black text-foreground tracking-tight sm:text-5xl">Swarm Orchestration</h1>
              <p className="text-title-sm text-muted-foreground max-w-xl font-medium leading-relaxed">
                Orquestração descentralizada de agentes via protocolo A2A. Gerencie a comunicação inter-agente com descoberta automática.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="px-4 py-2 border-primary/20 bg-primary/5 gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <span className="font-bold">A2A v0.3 Compatible</span>
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-8">
        {/* Left: Registry */}
        <div className="col-span-12 lg:col-span-8 space-y-8">
          <A2ARegistry />
          
          <Card className="nexus-card overflow-hidden">
            <CardHeader className="bg-muted/30 border-b border-border/40">
              <CardTitle className="text-body-sm flex items-center gap-2">
                <Play className="h-4 w-4 text-primary" />
                Trigger Swarm Deliberation
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex gap-4">
                <Input 
                  placeholder="Descreva a missão para o enxame..." 
                  className="flex-1 h-12 rounded-xl bg-background border-border/60"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  disabled={sending}
                />
                <Button 
                  onClick={handleSend} 
                  disabled={sending || !input.trim()}
                  className="nexus-gradient-bg text-primary-foreground h-12 px-8 rounded-xl"
                >
                  {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                  <span className="ml-2 font-bold">Enviar Missão</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Traffic Monitor */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          <Card className="nexus-card h-full flex flex-col min-h-[600px]">
            <CardHeader className="border-b border-border/40 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="h-5 w-5 text-primary" />
                <CardTitle className="text-title-sm">A2A Traffic Monitor</CardTitle>
              </div>
              <Activity className="h-4 w-4 text-nexus-emerald animate-pulse" />
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-hidden">
              <ScrollArea className="h-full max-h-[700px]">
                <div className="p-4 space-y-4" ref={scrollRef}>
                  {logs.map((log) => (
                    <div key={log.id} className="space-y-1.5 animate-in fade-in slide-in-from-right-2">
                      <div className="flex items-center justify-between text-meta">
                        <div className="flex items-center gap-2">
                          {log.direction === 'outbound' ? 
                            <ArrowRightLeft className="h-3 w-3 text-primary" /> : 
                            <Share2 className="h-3 w-3 text-nexus-cyan" />
                          }
                          <span className="font-bold text-muted-foreground uppercase">{log.agent}</span>
                        </div>
                        <span className="text-muted-foreground/60">{log.timestamp}</span>
                      </div>
                      <div className={`p-3 rounded-xl border ${
                        log.type === 'error' ? 'bg-destructive/5 border-destructive/20' :
                        log.type === 'handshake' ? 'bg-primary/5 border-primary/20' :
                        'bg-muted/50 border-border/40'
                      }`}>
                        <div className="flex items-center justify-between mb-2">
                          <Badge variant="outline" className="text-[9px] uppercase tracking-tighter h-4">
                            {log.type}
                          </Badge>
                        </div>
                        <pre className="text-meta font-mono text-foreground whitespace-pre-wrap overflow-x-auto">
                          {JSON.stringify(log.payload, null, 2)}
                        </pre>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
