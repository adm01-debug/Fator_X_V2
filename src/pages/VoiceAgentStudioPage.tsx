import { useState, useRef, useEffect } from "react";
import { Mic, MicOff, Phone, PhoneOff, Volume2, Settings2, Activity, Waves, ShieldCheck, Database, Zap, Brain } from "lucide-react";
import { logger } from "@/lib/logger";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PageHeader } from "@/components/shared/PageHeader";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AudioVisualizer } from "@/components/voice/AudioVisualizer";
import { toast } from "sonner";

type Turn = { role: "user" | "agent"; text: string; ms: number; ts: string };

export default function VoiceAgentStudioPage() {
  const [connected, setConnected] = useState(false);
  const [, setRecording] = useState(false);
  const [vadEnabled, setVadEnabled] = useState(true);
  const [bargeIn, setBargeIn] = useState(true);
  const [voice, setVoice] = useState("alloy");
  const [latencyMs, setLatencyMs] = useState(380);
  const [vadThreshold, setVadThreshold] = useState([0.5]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [audioLevel, setAudioLevel] = useState(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      setRecording(true);

      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setAudioLevel(avg / 255);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      toast.error("Erro ao acessar microfone", { description: "Verifique as permissões do seu navegador." });
      logger.error("Erro ao acessar microfone no VoiceAgentStudio", e);
    }
  };

  const stopRecording = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setRecording(false);
    setAudioLevel(0);
  };

  useEffect(() => () => { stopRecording(); }, []);

  const toggleConnection = () => {
    if (connected) {
      stopRecording();
      setConnected(false);
      toast.info("Conexão encerrada");
    } else {
      setConnected(true);
      startRecording();
      setTurns([
        { role: "agent", text: "Olá! Sou o agente de voz do Nexus. Como posso ajudar você hoje?", ms: 320, ts: new Date().toISOString() },
      ]);
      toast.success("Conexão estabelecida", { description: "Streaming WebRTC ativado com latência reduzida." });
    }
  };

  const simulateTurn = () => {
    const userTurn: Turn = { role: "user", text: "Quero saber sobre meus pedidos e o status da última entrega.", ms: 0, ts: new Date().toISOString() };
    setTurns((t) => [...t, userTurn]);
    setTimeout(() => {
      setTurns((t) => [...t, { 
        role: "agent", 
        text: "Verifiquei aqui. Você tem 3 pedidos. O último (#8821) está em rota de entrega e deve chegar até as 18h.", 
        ms: latencyMs + Math.random() * 50, 
        ts: new Date().toISOString() 
      }]);
    }, latencyMs);
  };

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="🎙️ Voice Agent Studio 10/10"
        description="Pipeline industrial WebRTC ↔ Real-time LLM ↔ Low-latency TTS com suporte a Barge-in e VAD avançado."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-primary/20 bg-card/50 backdrop-blur-xl shadow-2xl overflow-hidden relative">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-nexus-purple via-primary to-nexus-blue opacity-50" />
            
            <CardContent className="p-10">
              <div className="flex flex-col items-center gap-8">
                <div className="relative group">
                  <div
                    className={`w-40 h-40 rounded-full border-[6px] flex items-center justify-center transition-all duration-500 ${
                      connected 
                        ? "border-primary bg-primary/10 shadow-[0_0_60px_hsl(var(--primary)/0.5)]" 
                        : "border-border/40 bg-muted/20"
                    }`}
                    style={{ transform: `scale(${1 + audioLevel * 0.4})` }}
                  >
                    {connected ? (
                      <Mic className="h-20 w-20 text-primary animate-pulse" />
                    ) : (
                      <MicOff className="h-16 w-16 text-muted-foreground/40" />
                    )}
                  </div>
                  
                  {connected && (
                    <div className="absolute -top-2 -right-2">
                      <Badge className="bg-destructive text-white border-0 px-2 py-0.5 animate-pulse flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-white" /> LIVE
                      </Badge>
                    </div>
                  )}
                  
                  <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-[280px]">
                    <AudioVisualizer 
                      stream={streamRef.current} 
                      connected={connected} 
                      color="hsl(var(--primary))" 
                    />
                  </div>
                </div>

                <div className="text-center space-y-2 mt-4">
                  <div className="text-title-sm font-bold tracking-tight">
                    {connected ? "Monitoramento em Tempo Real" : "Sessão Inativa"}
                  </div>
                  <div className="flex items-center justify-center gap-4 text-meta text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Zap className="h-3 w-3 text-nexus-amber" /> 
                      Latência: <span className="text-foreground font-mono font-bold">{latencyMs}ms</span>
                    </span>
                    <span className="w-1 h-1 rounded-full bg-border" />
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="h-3 w-3 text-nexus-emerald" /> 
                      VAD: <span className={vadEnabled ? "text-nexus-emerald" : "text-destructive"}>{vadEnabled ? "Ativo" : "Off"}</span>
                    </span>
                    <span className="w-1 h-1 rounded-full bg-border" />
                    <span className="flex items-center gap-1.5">
                      <Activity className="h-3 w-3 text-primary" /> 
                      Barge-in: <span className={bargeIn ? "text-primary" : "text-muted-foreground"}>{bargeIn ? "On" : "Off"}</span>
                    </span>
                  </div>
                </div>

                <div className="flex gap-4">
                  <Button 
                    size="lg" 
                    variant={connected ? "destructive" : "default"} 
                    onClick={toggleConnection}
                    className="h-14 px-8 rounded-2xl font-bold shadow-xl shadow-primary/10 transition-all hover:scale-105"
                  >
                    {connected ? (
                      <><PhoneOff className="h-5 w-5 mr-3" /> Encerrar Chamada</>
                    ) : (
                      <><Phone className="h-5 w-5 mr-3" /> Iniciar Estúdio</>
                    )}
                  </Button>
                  {connected && (
                    <Button 
                      size="lg" 
                      variant="outline" 
                      onClick={simulateTurn}
                      className="h-14 px-8 rounded-2xl border-primary/20 bg-background/50 hover:bg-primary/5"
                    >
                      <Waves className="h-5 w-5 mr-3 text-primary" /> Testar Interação
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/40 bg-card/30">
            <CardHeader className="pb-3 flex-row items-center justify-between">
              <CardTitle className="text-body-sm font-bold flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" /> Transcrição Neural (Live)
              </CardTitle>
              <Badge variant="outline" className="text-meta font-mono">Real-time STT</Badge>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[320px] pr-4">
                <div className="space-y-4">
                  {turns.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-24 text-muted-foreground/40 gap-3">
                      <Mic className="h-12 w-12 opacity-20" />
                      <p className="text-meta font-black uppercase tracking-widest">Aguardando fluxo de áudio...</p>
                    </div>
                  )}
                  {turns.map((t, i) => (
                    <div key={i} className={`flex items-start gap-3 ${t.role === "user" ? "flex-row-reverse" : ""}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border shadow-sm ${
                        t.role === "user" ? "bg-primary/10 border-primary/30" : "bg-nexus-purple/10 border-nexus-purple/30"
                      }`}>
                        {t.role === "user" ? <Mic className="h-4 w-4 text-primary" /> : <Brain className="h-4 w-4 text-nexus-purple" />}
                      </div>
                      <div className={`max-w-[85%] space-y-1 ${t.role === "user" ? "text-right" : ""}`}>
                        <div className="flex items-center gap-2 text-meta font-bold uppercase tracking-widest text-muted-foreground">
                          {t.role === "user" ? "Você (Humano)" : "Agente Nexus"}
                          {t.ms > 0 && <Badge variant="outline" className="h-4 text-[8px] border-nexus-amber/20 text-nexus-amber">{t.ms}ms</Badge>}
                        </div>
                        <div className={`p-4 rounded-2xl text-body-sm leading-relaxed shadow-sm border ${
                          t.role === "user" 
                            ? "bg-primary text-primary-foreground border-primary/20 rounded-tr-none" 
                            : "bg-muted/50 text-foreground border-border/20 rounded-tl-none"
                        }`}>
                          {t.text}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-border/40 shadow-lg">
            <CardHeader className="pb-3">
              <CardTitle className="text-body-sm font-bold flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-primary" /> Parâmetros do Motor
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-meta font-bold uppercase tracking-wider opacity-60">Voz Neural (TTS)</Label>
                  <Badge variant="secondary" className="text-meta">OpenAI/Eleven</Badge>
                </div>
                <Select value={voice} onValueChange={setVoice}>
                  <SelectTrigger className="h-10 bg-muted/20 border-border/40 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alloy">Alloy (Neutra/Equilibrada)</SelectItem>
                    <SelectItem value="nova">Nova (Feminina/Energética)</SelectItem>
                    <SelectItem value="echo">Echo (Masculina/Profissional)</SelectItem>
                    <SelectItem value="onyx">Onyx (Masculina/Grave)</SelectItem>
                    <SelectItem value="shimmer">Shimmer (Suave/Empática)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between text-meta font-bold">
                  <Label className="uppercase tracking-wider opacity-60">Sensibilidade VAD</Label>
                  <span className="text-primary font-mono">{vadThreshold[0].toFixed(2)}</span>
                </div>
                <Slider value={vadThreshold} onValueChange={setVadThreshold} min={0} max={1} step={0.05} className="cursor-pointer" />
                <p className="text-meta text-muted-foreground italic">
                  {vadThreshold[0] < 0.3 ? "Muito sensível — pode capturar ruído de fundo." : 
                   vadThreshold[0] > 0.7 ? "Rígido — requer voz clara e alta." : "Ideal para ambientes de escritório."}
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between text-meta font-bold">
                  <Label className="uppercase tracking-wider opacity-60">Latência Alvo</Label>
                  <span className="text-nexus-amber font-mono">{latencyMs}ms</span>
                </div>
                <Slider value={[latencyMs]} onValueChange={(v) => setLatencyMs(v[0])} min={200} max={1000} step={50} />
              </div>

              <div className="space-y-4 pt-4 border-t border-border/40">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-meta font-bold">Smart VAD</Label>
                    <p className="text-meta text-muted-foreground leading-tight">Silêncio inteligente entre turnos.</p>
                  </div>
                  <Switch checked={vadEnabled} onCheckedChange={setVadEnabled} />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-meta font-bold">Barge-in Protection</Label>
                    <p className="text-meta text-muted-foreground leading-tight">Permite interrupção do agente.</p>
                  </div>
                  <Switch checked={bargeIn} onCheckedChange={setBargeIn} />
                </div>
              </div>

              <div className="p-4 bg-muted/30 rounded-2xl border border-border/40 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-meta font-black uppercase tracking-widest text-muted-foreground">Volume Inbound</span>
                  <Volume2 className="h-3 w-3 text-muted-foreground" />
                </div>
                <div className="h-2.5 bg-background rounded-full overflow-hidden border border-border/20">
                  <div 
                    className="h-full bg-gradient-to-r from-nexus-emerald via-nexus-amber to-destructive transition-all duration-75" 
                    style={{ width: `${audioLevel * 100}%` }} 
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/40 bg-primary/5">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Database className="h-4 w-4 text-primary" />
                <span className="text-meta font-bold uppercase tracking-wider">Storage & Analytics</span>
              </div>
              <p className="text-meta text-muted-foreground leading-relaxed">
                Todas as sessões são gravadas e processadas para análise de sentimento e extração de intenção no modulo Oráculo.
              </p>
              <Button variant="link" size="sm" className="h-auto p-0 text-primary text-meta font-bold uppercase">Ver logs de áudio →</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
