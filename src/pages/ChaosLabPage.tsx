import { useEffect, useState, useCallback } from 'react';
import { Zap, Power, Activity, Clock, ShieldAlert, BarChart3, Globe, Loader2, Play, FlaskConical } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import {
  listChaosExperiments,
  createChaosExperiment,
  disableChaosExperiment,
  disableAllChaos,
  type ChaosExperiment,
  type ChaosTarget,
  type ChaosFaultType,
} from '@/services/chaosService';
import { getWorkspaceId } from '@/lib/agentService';
import { cn } from '@/lib/utils';

const TARGETS: { value: ChaosTarget; label: string }[] = [
  { value: 'llm-gateway', label: 'LLM Gateway' },
  { value: 'agent-workflow-runner', label: 'Agent Workflow Runner' },
];

const FAULT_TYPES: { value: ChaosFaultType; label: string; desc: string }[] = [
  { value: 'latency', label: 'Latência', desc: 'Adiciona delay artificial antes da chamada' },
  { value: 'error_500', label: 'Erro 500', desc: 'Simula erro interno do servidor' },
  { value: 'error_429', label: 'Rate Limit 429', desc: 'Simula limite de requisições atingido' },
  { value: 'timeout', label: 'Timeout', desc: 'Simula timeout de 30s' },
];

export default function ChaosLabPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [experiments, setExperiments] = useState<ChaosExperiment[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [target, setTarget] = useState<ChaosTarget>('llm-gateway');
  const [faultType, setFaultType] = useState<ChaosFaultType>('latency');
  const [probability, setProbability] = useState([5]); // percent
  const [latencyMs, setLatencyMs] = useState(500);
  const [durationMin, setDurationMin] = useState(10);

  const refresh = useCallback(async () => {
    try {
      const wsId = await getWorkspaceId();
      setWorkspaceId(wsId);
      const list = await listChaosExperiments(wsId);
      setExperiments(list);
    } catch {
      toast.error('Falha ao carregar experimentos');
    } finally {
      // Refresh done
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [refresh]);

  const handleCreate = async () => {
    if (!workspaceId || !name.trim()) {
      toast.error('Nome obrigatório');
      return;
    }
    setSubmitting(true);
    try {
      await createChaosExperiment({
        workspace_id: workspaceId,
        name: name.trim(),
        target,
        fault_type: faultType,
        probability: probability[0] / 100,
        latency_ms: faultType === 'latency' ? latencyMs : undefined,
        duration_seconds: durationMin * 60,
      });
      toast.success('Experimento criado');
      setName('');
      refresh();
    } catch {
      toast.error('Falha ao criar experimento');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDisable = async (id: string) => {
    try {
      await disableChaosExperiment(id);
      toast.success('Experimento desativado');
      refresh();
    } catch {
      toast.error('Falha ao desativar');
    }
  };

  const handleKillSwitch = async () => {
    if (!workspaceId) return;
    if (!confirm('Desativar TODOS os experimentos ativos?')) return;
    try {
      await disableAllChaos(workspaceId);
      toast.success('Kill switch ativado: todos os experimentos parados');
      refresh();
    } catch {
      toast.error('Falha no kill switch');
    }
  };

  const isActive = (exp: ChaosExperiment) =>
    exp.enabled && new Date(exp.expires_at) > new Date();

  const activeExperiments = experiments.filter(isActive);

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-8 max-w-[1440px] mx-auto animate-page-enter">
      <div className="bg-gradient-to-br from-card to-card/50 border border-border/40 p-10 rounded-[2.5rem] shadow-nexus-xl shadow-nexus-amber/5 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-96 h-96 bg-nexus-amber/[0.04] rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 relative">
          <div className="flex items-center gap-7">
            <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-nexus-amber/20 to-nexus-amber/5 flex items-center justify-center border border-nexus-amber/20 shadow-nexus-2xl shadow-nexus-amber/10 group-hover:scale-105 transition-transform duration-500">
              <Zap className="h-11 w-11 text-nexus-amber" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h1 className="text-4xl font-heading font-black text-foreground tracking-tight sm:text-5xl">Chaos Lab</h1>
                <Badge className="bg-nexus-amber/10 text-nexus-amber border-none font-black px-3 py-1 rounded-full text-meta tracking-widest uppercase">Injeção de Falhas</Badge>
              </div>
              <p className="text-title-sm text-muted-foreground max-w-xl font-medium leading-relaxed">
                Valide a resiliência do Nexus injetando latência e erros controlados. Teste seus SLOs e mecanismos de autocura sob stress.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {activeExperiments.length > 0 && (
              <Button variant="destructive" size="lg" onClick={handleKillSwitch} className="h-14 px-8 rounded-2xl font-bold shadow-nexus-xl shadow-destructive/20 animate-pulse">
                <Power className="h-5 w-5 mr-3" />
                Pânico: Parar Tudo ({activeExperiments.length})
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
           <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-card/50 border-border/40 rounded-3xl p-6 text-center">
                 <p className="text-meta font-black uppercase tracking-widest text-muted-foreground mb-1">Impacto P95</p>
                 <p className={cn("text-3xl font-black", activeExperiments.length > 0 ? "text-nexus-amber" : "text-nexus-emerald")}>
                    {activeExperiments.length > 0 ? "+420ms" : "Nominal"}
                 </p>
              </Card>
              <Card className="bg-card/50 border-border/40 rounded-3xl p-6 text-center">
                 <p className="text-meta font-black uppercase tracking-widest text-muted-foreground mb-1">Taxa de Erro</p>
                 <p className={cn("text-3xl font-black", activeExperiments.length > 0 ? "text-nexus-orange" : "text-nexus-emerald")}>
                    {activeExperiments.length > 0 ? "2.4%" : "0.01%"}
                 </p>
              </Card>
              <Card className="bg-card/50 border-border/40 rounded-3xl p-6 text-center">
                 <p className="text-meta font-black uppercase tracking-widest text-muted-foreground mb-1">Recuperação</p>
                 <p className="text-3xl font-black text-nexus-blue">100%</p>
              </Card>
           </div>

           <Card className="border-border/40 rounded-[2rem] overflow-hidden">
             <CardHeader className="p-8 border-b bg-muted/20">
               <div className="flex items-center gap-3">
                 <FlaskConical className="w-5 h-5 text-nexus-amber" />
                 <CardTitle>Configurar Experimento</CardTitle>
               </div>
             </CardHeader>
             <CardContent className="p-8 space-y-6">
               <div className="grid md:grid-cols-2 gap-6">
                 <div className="space-y-2">
                   <Label className="text-meta font-bold uppercase tracking-wider opacity-60">Nome do Experimento</Label>
                   <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: baseline-stress-test" className="h-12 rounded-xl" />
                 </div>
                 <div className="space-y-2">
                   <Label className="text-meta font-bold uppercase tracking-wider opacity-60">Alvo (Target)</Label>
                   <Select value={target} onValueChange={(v) => setTarget(v as ChaosTarget)}>
                     <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
                     <SelectContent>
                       {TARGETS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                     </SelectContent>
                   </Select>
                 </div>
               </div>

               <div className="grid md:grid-cols-2 gap-6">
                 <div className="space-y-2">
                   <Label className="text-meta font-bold uppercase tracking-wider opacity-60">Tipo de Falha</Label>
                   <Select value={faultType} onValueChange={(v) => setFaultType(v as ChaosFaultType)}>
                     <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
                     <SelectContent>
                       {FAULT_TYPES.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                     </SelectContent>
                   </Select>
                   <p className="text-meta text-muted-foreground italic px-1">{FAULT_TYPES.find(f => f.value === faultType)?.desc}</p>
                 </div>
                 <div className="space-y-2">
                   <div className="flex justify-between items-center mb-1">
                     <Label className="text-meta font-bold uppercase tracking-wider opacity-60">Probabilidade</Label>
                     <span className="text-body-sm font-mono font-bold text-nexus-amber">{probability[0]}%</span>
                   </div>
                   <Slider value={probability} onValueChange={setProbability} min={1} max={50} step={1} />
                 </div>
               </div>

               {faultType === 'latency' && (
                 <div className="space-y-2 animate-in slide-in-from-top-2">
                   <Label className="text-meta font-bold uppercase tracking-wider opacity-60">Latência Artificial (ms)</Label>
                   <Input type="number" value={latencyMs} onChange={(e) => setLatencyMs(Number(e.target.value))} className="h-12 rounded-xl" />
                 </div>
               )}

               <div className="space-y-2">
                 <div className="flex justify-between items-center mb-1">
                   <Label className="text-meta font-bold uppercase tracking-wider opacity-60">Duração</Label>
                   <span className="text-body-sm font-mono font-bold text-primary">{durationMin} min</span>
                 </div>
                 <Slider value={[durationMin]} onValueChange={(v) => setDurationMin(v[0])} min={1} max={60} step={1} />
               </div>

               <Button onClick={handleCreate} disabled={submitting || !name.trim()} className="w-full h-14 rounded-2xl nexus-gradient-bg text-primary-foreground font-bold text-title-sm shadow-nexus-xl shadow-primary/20">
                 {submitting ? <Loader2 className="animate-spin mr-2" /> : <Play className="mr-2 h-5 w-5" />}
                 Disparar Experimento
               </Button>
             </CardContent>
           </Card>
        </div>

        <div className="space-y-8">
           <Card className="border-border/40 rounded-[2rem]">
             <CardHeader className="p-8 border-b">
               <div className="flex items-center justify-between">
                 <CardTitle className="text-title-sm font-bold flex items-center gap-2">
                   <Activity className="w-4 h-4 text-primary" /> Histórico Live
                 </CardTitle>
                 <Badge variant="outline">{experiments.length}</Badge>
               </div>
             </CardHeader>
             <CardContent className="p-6">
               <ScrollArea className="h-[600px] pr-4">
                 {experiments.length === 0 ? (
                   <div className="py-20 text-center opacity-30">
                     <FlaskConical className="w-12 h-12 mx-auto mb-4" />
                     <p className="text-meta font-black uppercase tracking-widest">Nenhum rastro de caos</p>
                   </div>
                 ) : (
                   <div className="space-y-3">
                     {experiments.map((exp) => {
                       const active = isActive(exp);
                       return (
                         <div key={exp.id} className={cn(
                           "p-4 rounded-2xl border transition-all",
                           active ? "bg-nexus-amber/5 border-nexus-amber/30 ring-1 ring-nexus-amber/10" : "bg-muted/20 border-border/40 opacity-60"
                         )}>
                           <div className="flex items-center justify-between mb-2">
                             <p className="font-bold text-body-sm truncate max-w-[150px]">{exp.name}</p>
                             {active && <Badge className="bg-nexus-amber text-background text-[9px] font-black animate-pulse">LIVE</Badge>}
                           </div>
                           <div className="grid grid-cols-2 gap-2 text-meta text-muted-foreground font-mono">
                             <div className="flex items-center gap-1"><Globe className="w-3 h-3" /> {exp.target}</div>
                             <div className="flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> {exp.fault_type}</div>
                             <div className="flex items-center gap-1"><BarChart3 className="w-3 h-3" /> {(exp.probability * 100).toFixed(0)}% prob.</div>
                             <div className="flex items-center gap-1"><Clock className="w-3 h-3" /> {active ? 'Ativo' : 'Encerrado'}</div>
                           </div>
                           {active && (
                             <Button variant="ghost" size="sm" onClick={() => handleDisable(exp.id)} className="w-full mt-3 h-8 rounded-lg text-destructive hover:bg-destructive/10 text-meta font-bold uppercase tracking-tighter">
                               Interromper Ciclo
                             </Button>
                           )}
                         </div>
                       );
                     })}
                   </div>
                 )}
               </ScrollArea>
             </CardContent>
           </Card>
        </div>
      </div>
    </div>
  );
}
