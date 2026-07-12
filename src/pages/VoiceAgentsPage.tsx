import { useEffect, useRef, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Mic, Square, Trash2, Clock, DollarSign, Bot, Loader2, Radio, Activity, Volume2, ShieldCheck, Headphones } from "lucide-react";
import { toast } from "sonner";
import { listAgentSummaries } from "@/services/agentsService";
import {
  startSession, endSession, transcribeAudio, synthesizeReply,
  listSessions, deleteSession, speakText, stopSpeaking,
  type VoiceSession, type VoiceTurn,
} from "@/services/voiceAgentService";
import { VoiceWaveform } from "@/components/voice/VoiceWaveform";
import { cn } from "@/lib/utils";

type State = "idle" | "listening" | "processing" | "speaking";

export default function VoiceAgentsPage() {
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [agentId, setAgentId] = useState<string>("");
  const [state, setState] = useState<State>("idle");
  const [session, setSession] = useState<VoiceSession | null>(null);
  const [transcript, setTranscript] = useState<VoiceTurn[]>([]);
  const [history, setHistory] = useState<VoiceSession[]>([]);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const silenceTimerRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    listAgentSummaries(50).then(data => setAgents(((data as { agents?: { id: string; name: string }[] }).agents) || [])).catch(() => {});
    refreshHistory();
  }, []);

  const refreshHistory = useCallback(() => {
    listSessions(20).then(setHistory).catch(() => {});
  }, []);

  const sendTurn = useCallback(async (audioBlob: Blob, sess: VoiceSession) => {
    setState("processing");
    try {
      const { text } = await transcribeAudio(audioBlob, sess.id);
      if (!text || text.length < 2) { setState("listening"); return; }
      setTranscript((prev) => [...prev, { role: "user", text, ts: new Date().toISOString() }]);

      const { reply } = await synthesizeReply(text, sess.id, agentId || null);
      setTranscript((prev) => [...prev, { role: "assistant", text: reply, ts: new Date().toISOString() }]);

      setState("speaking");
      await speakText(reply);
      setState("listening");
    } catch (e: unknown) {
      toast.error(e?.message || "Erro no turno");
      setState("listening");
    }
  }, [agentId]);

  const setupVAD = useCallback((mediaStream: MediaStream, sess: VoiceSession) => {
    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    const source = audioCtx.createMediaStreamSource(mediaStream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let speaking = false;

    const tick = () => {
      if (!recorderRef.current || recorderRef.current.state === "inactive") return;
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      const isVoice = avg > 12;

      if (isVoice) {
        speaking = true;
        if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
      } else if (speaking && !silenceTimerRef.current) {
        silenceTimerRef.current = window.setTimeout(() => {
          if (recorderRef.current?.state === "recording" && chunksRef.current.length > 0) {
            recorderRef.current.requestData();
            recorderRef.current.stop();
            const blob = new Blob(chunksRef.current, { type: "audio/webm" });
            chunksRef.current = [];
            speaking = false;
            silenceTimerRef.current = null;
            sendTurn(blob, sess).then(() => {
              if (recorderRef.current && audioCtxRef.current) {
                const newRec = new MediaRecorder(mediaStream, { mimeType: "audio/webm" });
                newRec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
                recorderRef.current = newRec;
                newRec.start(250);
              }
            });
          }
        }, 1500);
      }
      requestAnimationFrame(tick);
    };
    tick();
  }, [sendTurn]);

  const handleStart = async () => {
    try {
      const sess = await startSession(agentId || null);
      setSession(sess);
      setTranscript([]);
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      setStream(mediaStream);
      const rec = new MediaRecorder(mediaStream, { mimeType: "audio/webm" });
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorderRef.current = rec;
      rec.start(250);
      setState("listening");
      setupVAD(mediaStream, sess);
      toast.success("Conversa iniciada — fale naturalmente");
    } catch (e: unknown) {
      toast.error(e?.message || "Erro ao iniciar");
    }
  };

  const handleStop = async () => {
    try {
      stopSpeaking();
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (audioCtxRef.current) audioCtxRef.current.close().catch(() => {});
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (session) await endSession(session.id);
      setSession(null);
      setStream(null);
      setState("idle");
      refreshHistory();
      toast.success("Sessão encerrada");
    } catch (e: unknown) {
      toast.error(e?.message || "Erro ao encerrar");
    }
  };

  const handleDelete = async (id: string) => {
    await deleteSession(id);
    refreshHistory();
    toast.success("Sessão removida");
  };

  const totalMinutes = history.reduce((s, h) => s + (h.duration_ms || 0), 0) / 60000;
  const totalCost = history.reduce((s, h) => s + (h.cost_cents || 0), 0) / 100;

  const stateLabel: Record<State, string> = {
    idle: "Nominal",
    listening: "Live Listening",
    processing: "Neural Processing",
    speaking: "Voice Synthesizing",
  };
  const stateColor: Record<State, string> = {
    idle: "bg-muted text-muted-foreground",
    listening: "bg-nexus-cyan/10 text-nexus-cyan border-nexus-cyan/20",
    processing: "bg-nexus-purple/10 text-nexus-purple border-nexus-purple/20",
    speaking: "bg-nexus-emerald/10 text-nexus-emerald border-nexus-emerald/20",
  };

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-10 max-w-[1440px] mx-auto animate-page-enter">
      {/* Header Elevated 10/10 */}
      <div className="bg-gradient-to-br from-card to-card/50 border border-border/40 p-10 rounded-[2.5rem] shadow-2xl shadow-primary/5 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/[0.04] rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2 group-hover:bg-primary/[0.06] transition-colors duration-500 pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 relative">
          <div className="flex items-center gap-7">
            <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20 shadow-2xl shadow-primary/10 group-hover:scale-105 transition-transform duration-500">
              <Headphones className="h-11 w-11 text-primary animate-pulse" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h1 className="text-4xl font-heading font-black text-foreground tracking-tight sm:text-5xl">Interface de Voz</h1>
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-nexus-cyan/10 text-nexus-cyan text-meta font-bold uppercase tracking-widest border border-nexus-cyan/20">
                  <Radio className="h-3 w-3 animate-pulse" /> Real-time
                </div>
              </div>
              <p className="text-title-sm text-muted-foreground max-w-xl font-medium leading-relaxed">
                Orquestração neural de áudio. Converse por voz com seus agentes através de STT, LLM e síntese de alta fidelidade.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2 text-nexus-emerald font-black text-body-sm uppercase tracking-tighter">
                <ShieldCheck className="h-4 w-4" /> Gateway Ativo
              </div>
              <p className="text-meta text-muted-foreground font-bold tracking-widest uppercase">Latência Sub-500ms</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Sessões Totais', value: history.length, icon: Activity, color: 'text-nexus-cyan', bg: 'bg-nexus-cyan/10' },
          { label: 'Minutos Neurais', value: totalMinutes.toFixed(1), icon: Clock, color: 'text-nexus-purple', bg: 'bg-nexus-purple/10' },
          { label: 'Custo Alocado', value: `$${totalCost.toFixed(3)}`, icon: DollarSign, color: 'text-nexus-emerald', bg: 'bg-nexus-emerald/10' },
          { label: 'Vozes Ativas', value: '6', icon: Volume2, color: 'text-nexus-amber', bg: 'bg-nexus-amber/10' },
        ].map((stat, i) => (
          <div key={i} className="bg-card border border-border/40 p-6 rounded-[2rem] flex items-center gap-5 hover:border-primary/20 transition-all group">
            <div className={cn("h-14 w-14 rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform", stat.bg)}>
              <stat.icon className={cn("h-7 w-7", stat.color)} />
            </div>
            <div>
              <p className="text-meta font-bold uppercase tracking-widest text-muted-foreground">{stat.label}</p>
              <p className="text-2xl font-black text-foreground">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5" /> Conversa Ativa</CardTitle>
            <Badge className={stateColor[state]}>{stateLabel[state]}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {state === "idle" ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Select value={agentId} onValueChange={setAgentId}>
                  <SelectTrigger className="max-w-sm"><SelectValue placeholder="Selecione um agente (opcional)" /></SelectTrigger>
                  <SelectContent>
                    {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button size="lg" variant="gradient" className="h-16 text-title-sm w-full md:w-auto" onClick={handleStart}>
                <Mic className="mr-2 h-5 w-5" /> Iniciar Conversa
              </Button>
              <p className="text-meta text-muted-foreground">
                Microfone necessário. Use Chrome/Edge para melhor reconhecimento de voz pt-BR.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <VoiceWaveform stream={stream} active={state === "listening"} />
              <ScrollArea className="h-[320px] rounded-lg border p-4 bg-secondary/20">
                <div className="space-y-3">
                  {transcript.length === 0 && <p className="text-body-sm text-muted-foreground text-center py-8">Aguardando sua fala...</p>}
                  {transcript.map((t, i) => (
                    <div key={i} className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-body-sm ${t.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border"}`}>
                        {t.text}
                      </div>
                    </div>
                  ))}
                  {state === "processing" && (
                    <div className="flex justify-start">
                      <div className="bg-card border rounded-2xl px-4 py-2 flex items-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span className="text-meta text-muted-foreground">processando...</span>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
              <Button variant="destructive" onClick={handleStop} className="w-full md:w-auto">
                <Square className="mr-2 h-4 w-4" /> Encerrar Sessão
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Histórico</CardTitle></CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-body-sm text-muted-foreground text-center py-8">Nenhuma sessão ainda.</p>
          ) : (
            <div className="space-y-2">
              {history.map((h) => (
                <div key={h.id} className="flex items-center justify-between rounded-lg border px-4 py-3 hover:bg-secondary/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant={h.status === "ended" ? "secondary" : "default"} className="text-meta">{h.status}</Badge>
                      <span className="text-body-sm font-medium">
                        {(h.duration_ms / 1000).toFixed(1)}s · {h.transcript.length} turnos
                      </span>
                    </div>
                    <p className="text-meta text-muted-foreground mt-0.5">
                      {new Date(h.started_at).toLocaleString("pt-BR")} · ${(h.cost_cents / 100).toFixed(4)}
                    </p>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => handleDelete(h.id)} aria-label="Excluir sessão">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
