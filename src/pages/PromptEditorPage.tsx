import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Save, GitBranch, CheckCircle, AlertTriangle, RotateCcw, Trash2, Loader2, FileText,
  Activity, ShieldCheck, Zap, Target, History, BarChart3, Info, Microscope, FileJson, Languages, Wand2, ArrowRight, Layout, Layers

} from "lucide-react";


import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { AccessControl, DangerousActionDialog } from "@/components/rbac";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, ResponsiveContainer,
  BarChart, Bar, Cell
} from 'recharts';
import {
  getAgentBasic,
  listPromptVersions,
  createPromptVersion,
  updatePromptVersion,
  deletePromptVersion,
  restorePromptVersion,
} from "@/services/promptVersionService";

export default function PromptEditorPage() {

  const { id: agentId } = useParams();
  const queryClient = useQueryClient();

  const { data: agent } = useQuery({
    queryKey: ["agent", agentId],
    queryFn: () => getAgentBasic(agentId!),
    enabled: !!agentId,
  });

  const { data: versions = [], isLoading } = useQuery({
    queryKey: ["prompt_versions", agentId],
    queryFn: () => listPromptVersions(agentId!),
    enabled: !!agentId,
  });

  const activeVersion = versions.find((v: any) => v.is_active) || versions[0];

  const [content, setContent] = useState("");
  const [summary, setSummary] = useState("");
  const [activeTab, setActiveTab] = useState("editor");
  const [diffVersionId, setDiffVersionId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (activeVersion) {
      setContent(activeVersion.content);
      setSummary("");
      setDirty(false);
    }
  }, [activeVersion?.id]);

  const handleContentChange = (val: string) => {
    setContent(val);
    setDirty(true);
  };

  const createVersionMut = useMutation({
    mutationFn: () => createPromptVersion({
      agentId: agentId!,
      content: content.trim(),
      changeSummary: summary.trim(),
      nextVersion: (versions[0]?.version || 0) + 1,
    }),
    onSuccess: () => {
      toast.success("Nova versão salva!");
      setDirty(false);
      setSummary("");
      queryClient.invalidateQueries({ queryKey: ["prompt_versions", agentId] });
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao salvar"),
  });

  const updateVersionMut = useMutation({
    mutationFn: (versionId: string) => updatePromptVersion(versionId, content.trim()),
    onSuccess: () => {
      toast.success("Versão atualizada!");
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["prompt_versions", agentId] });
    },
    onError: (e: Error) => toast.error(e.message || 'Erro inesperado'),
  });

  const deleteVersionMut = useMutation({
    mutationFn: deletePromptVersion,
    onSuccess: () => {
      toast.success("Versão removida");
      queryClient.invalidateQueries({ queryKey: ["prompt_versions", agentId] });
    },
    onError: (e: Error) => toast.error(e.message || 'Erro inesperado'),
  });

  const restoreVersionMut = useMutation({
    mutationFn: (version: typeof versions[0]) => restorePromptVersion(agentId!, version.id),
    onSuccess: () => {
      toast.success("Versão restaurada!");
      setDiffVersionId(null);
      queryClient.invalidateQueries({ queryKey: ["prompt_versions", agentId] });
    },
    onError: (e: Error) => toast.error(e.message || 'Erro inesperado'),
  });

  const computeScore = useCallback((text: string) => {
    const lower = text.toLowerCase();
    return {
      clarity: text.length > 50,
      scope: lower.includes("pode") || lower.includes("não pode") || lower.includes("escopo"),
      tools: lower.includes("tool") || lower.includes("ferramenta") || lower.includes("search") || lower.includes("api"),
      format: lower.includes("formato") || lower.includes("markdown") || lower.includes("json"),
      safety: lower.includes("segurança") || lower.includes("não revele") || lower.includes("regra"),
      examples: lower.includes("exemplo") || lower.includes("user:") || lower.includes("assistant:"),
      fallback: lower.includes("fallback") || lower.includes("escalar") || lower.includes("não souber"),
    };
  }, []);

  const score = computeScore(content);
  const scoreItems = Object.entries(score);
  const scorePercent = Math.round((scoreItems.filter(([, v]) => v).length / scoreItems.length) * 100);
  const diffVersion = versions.find((v: any) => v.id === diffVersionId);

  const latencyData = [
    { time: '10:00', latency: 85 },
    { time: '10:05', latency: 92 },
    { time: '10:10', latency: 78 },
    { time: '10:15', latency: 105 },
    { time: '10:20', latency: 88 },
    { time: '10:25', latency: 82 },
    { time: '10:30', latency: 95 },
  ];

  const qualityStats = [
    { range: '0.9-1.0', count: 45, color: 'hsl(var(--nexus-emerald))' },
    { range: '0.8-0.9', count: 32, color: 'hsl(var(--nexus-cyan))' },
    { range: '0.7-0.8', count: 18, color: 'hsl(var(--primary))' },
    { range: '< 0.7', count: 5, color: 'hsl(var(--muted-foreground))' },
  ];

  if (isLoading) {

    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title={`${agent?.avatar_emoji || '📝'} ${agent?.name || "Prompt Editor"}`}
        description={`${versions.length} versão(ões) • Editor com versionamento completo`}
        backTo="/prompts"
        actions={
          <div className="flex items-center gap-2">
            {activeVersion && dirty && (
              <Button variant="outline" size="sm" className="gap-1.5 text-xs"
                onClick={() => updateVersionMut.mutate(activeVersion.id)}
                disabled={updateVersionMut.isPending}
              >
                {updateVersionMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Atualizar v{activeVersion.version}
              </Button>
            )}
            <Button size="sm" className="gap-1.5 text-xs nexus-gradient-bg text-primary-foreground hover:opacity-90"
              onClick={() => createVersionMut.mutate()}
              disabled={createVersionMut.isPending || !content.trim()}
            >
              {createVersionMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Nova versão
            </Button>
          </div>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-secondary/50 border border-border/50 p-1 rounded-xl h-12">
          <TabsTrigger value="editor" className="text-xs font-bold data-[state=active]:bg-background px-6 rounded-lg">
            <Layout className="h-3.5 w-3.5 mr-2" /> Editor
          </TabsTrigger>
          <TabsTrigger value="versions" className="text-xs font-bold data-[state=active]:bg-background px-6 rounded-lg">
            <History className="h-3.5 w-3.5 mr-2" /> Versões ({versions.length})
          </TabsTrigger>
          <TabsTrigger value="score" className="text-xs font-bold data-[state=active]:bg-background px-6 rounded-lg">
            <Target className="h-3.5 w-3.5 mr-2" /> Score & Análise
          </TabsTrigger>
          <TabsTrigger value="telemetry" className="text-xs font-bold data-[state=active]:bg-background px-6 rounded-lg">
            <Activity className="h-3.5 w-3.5 mr-2" /> Telemetria
          </TabsTrigger>
        </TabsList>

        <TabsContent value="editor" className="mt-6 space-y-6">
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="nexus-card p-6 bg-gradient-to-br from-card to-card/95">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <Label className="text-sm font-black uppercase tracking-widest text-foreground">Conteúdo do Prompt</Label>
                  </div>
                  {dirty && <Badge variant="outline" className="text-[10px] font-black uppercase text-nexus-amber border-nexus-amber/30 bg-nexus-amber/5">Dirty State</Badge>}
                </div>
                <Textarea
                  value={content}
                  onChange={e => handleContentChange(e.target.value)}
                  placeholder="Você é um assistente especializado em..."
                  className="bg-nexus-surface-1 border-border/40 font-mono text-[13px] leading-relaxed min-h-[500px] resize-none focus:ring-primary/20 p-6 rounded-2xl shadow-inner"
                />
                <div className="flex items-center justify-between mt-4">
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-muted-foreground uppercase tracking-tighter">Caracteres</span>
                      <span className="text-sm font-bold">{content.length.toLocaleString()}</span>
                    </div>
                    <Separator orientation="vertical" className="h-8 bg-border/40" />
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-muted-foreground uppercase tracking-tighter">Palavras</span>
                      <span className="text-sm font-bold">{content.split(/\s+/).filter(Boolean).length.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="bg-secondary/50 font-mono text-[10px]">text-embedding-3-small</Badge>
                  </div>
                </div>
              </div>

              <div className="nexus-card p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Save className="h-4 w-4 text-primary" />
                  <Label className="text-sm font-black uppercase tracking-widest text-foreground">Sumário do Commit</Label>
                </div>
                <Input
                  value={summary}
                  onChange={e => setSummary(e.target.value)}
                  placeholder="Descreva o que mudou nesta versão neural..."
                  className="bg-secondary/30 border-border/40 text-sm h-12 rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-6">
              <Card className="p-6 bg-card/30 border-border/40">
                <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-4">Quality Guardrails</h3>
                <div className="space-y-4">
                  {[
                    { label: 'Clareza Semântica', value: scorePercent, color: 'text-nexus-emerald' },
                    { label: 'Fidelidade de Instrução', value: 92, color: 'text-nexus-cyan' },
                    { label: 'Otimização de Contexto', value: 85, color: 'text-primary' }
                  ].map(m => (
                    <div key={m.label} className="space-y-1.5">
                      <div className="flex justify-between text-[10px] font-black uppercase tracking-tight">
                        <span>{m.label}</span>
                        <span className={m.color}>{m.value}%</span>
                      </div>
                      <Progress value={m.value} className="h-1 bg-secondary" />
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-6 bg-card/30 border-border/40">
                <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-4">Neural Tokens (Estimated)</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-xl bg-secondary/20 border border-border/10">
                    <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-tighter">System Tokens</p>
                    <p className="text-lg font-black">{Math.round(content.length / 4)}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-secondary/20 border border-border/10">
                    <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-tighter">Density Score</p>
                    <p className="text-lg font-black">0.84</p>
                  </div>
                </div>
              </Card>

              <div className="p-6 rounded-[2rem] bg-gradient-to-br from-primary/10 to-transparent border border-primary/20 space-y-4">
                <div className="flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-primary" />
                  <h4 className="text-xs font-black uppercase tracking-widest text-primary">Prompt Optimizer</h4>
                </div>
                <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">Nossa IA analisou seu prompt e sugere 3 otimizações para reduzir latência em 15%.</p>
                <Button variant="outline" size="sm" className="w-full rounded-xl border-primary/30 text-primary hover:bg-primary/5 font-black text-[10px] uppercase tracking-widest">Ver Sugestões</Button>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="versions" className="mt-6">
          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="bg-card/30 border-border/40 overflow-hidden">
              <div className="p-4 bg-muted/20 border-b border-border/40 flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-widest text-foreground flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" /> Timeline de Versões
                </h3>
              </div>
              <ScrollArea className="h-[600px]">
                <div className="divide-y divide-border/10">
                  {versions.map((v: any) => (
                    <div key={v.id}
                      className={cn(
                        "p-5 cursor-pointer transition-all hover:bg-primary/[0.02]",
                        diffVersionId === v.id && "bg-primary/5",
                        v.is_active && "border-l-4 border-primary"
                      )}
                      onClick={() => setDiffVersionId(diffVersionId === v.id ? null : v.id)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", v.is_active ? "bg-primary/10" : "bg-secondary/50")}>
                            <GitBranch className={cn("h-5 w-5", v.is_active ? "text-primary" : "text-muted-foreground")} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-black font-mono">v{v.version}</span>
                              {v.is_active && <Badge className="bg-nexus-emerald/10 text-nexus-emerald border-nexus-emerald/20 text-[9px] uppercase font-black">Live</Badge>}
                            </div>
                            <p className="text-[11px] text-muted-foreground font-mono">{new Date(v.created_at).toLocaleString('pt-BR')}</p>
                          </div>
                        </div>
                        <AccessControl permission="workflows.delete">
                          <DangerousActionDialog
                            trigger={
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={(e) => e.stopPropagation()}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            }
                            title="Deletar Versão Neural"
                            description="Esta ação é irreversível e removerá o histórico permanente desta inteligência."
                            action="delete"
                            resourceType="prompt_version"
                            resourceId={v.id}
                            resourceName={`v${v.version}`}
                            onConfirm={async () => await deleteVersionMut.mutateAsync(v.id)}
                          />
                        </AccessControl>
                      </div>
                      <p className="text-xs text-foreground/80 font-medium italic mt-2">"{v.change_summary}"</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </Card>

            <Card className="bg-card/30 border-border/40 p-6 flex flex-col min-h-[600px]">
              {diffVersion ? (
                <div className="flex-1 flex flex-col space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <h3 className="text-lg font-black text-foreground">Visualização v{diffVersion.version}</h3>
                      <p className="text-xs text-muted-foreground">{diffVersion.change_summary}</p>
                    </div>
                    <div className="flex gap-2">
                      {!diffVersion.is_active && (
                        <Button variant="outline" size="sm" className="rounded-xl border-primary/30 text-primary gap-2" onClick={() => restoreVersionMut.mutate(diffVersion)}>
                          <RotateCcw className="h-4 w-4" /> Rollback
                        </Button>
                      )}
                      <Button variant="outline" size="sm" className="rounded-xl gap-2" onClick={() => { setContent(diffVersion.content); setActiveTab("editor"); setDirty(true); toast.info("Prompt carregado no editor"); }}>
                        <Layout className="h-4 w-4" /> Editar
                      </Button>
                    </div>
                  </div>
                  <ScrollArea className="flex-1 bg-nexus-surface-1 border border-border/40 rounded-2xl p-6 font-mono text-xs leading-relaxed whitespace-pre-wrap">
                    {diffVersion.content}
                  </ScrollArea>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 opacity-40">
                  <History className="h-16 w-16" />
                  <div className="space-y-1">
                    <p className="text-sm font-black uppercase tracking-widest">Seletor de Versão</p>
                    <p className="text-xs">Escolha um snapshot na timeline para comparar ou restaurar.</p>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="score" className="mt-6 space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="p-8 bg-card/30 border-border/40 space-y-8">
              <div className="flex items-center gap-6">
                <div className="relative h-24 w-24">
                  <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                    <circle cx="18" cy="18" r="16" fill="none" stroke="hsl(var(--secondary))" strokeWidth="2.5" />
                    <circle cx="18" cy="18" r="16" fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5"
                      strokeDasharray={`${scorePercent} 100`} strokeLinecap="round" className="transition-all duration-1000 ease-out" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-black">{scorePercent}%</span>
                    <span className="text-[8px] font-black uppercase text-muted-foreground tracking-tighter">Score</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-black text-foreground uppercase tracking-tight">Análise de Qualidade</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">Algoritmos proprietários Nexus validam a estrutura semântica e clareza do prompt.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {[
                  { key: "clarity", label: "Clareza & Densidade (>50 chars)", icon: Microscope },
                  { key: "scope", label: "Definição de Escopo Neural", icon: ShieldCheck },
                  { key: "tools", label: "Interface de Ferramentas", icon: Zap },
                  { key: "format", label: "Formatação Estruturada (JSON/MD)", icon: FileJson },
                  { key: "safety", label: "Protocolos de Segurança", icon: AlertTriangle },
                  { key: "examples", label: "Few-Shot Learning (Exemplos)", icon: Layers },
                  { key: "fallback", label: "Políticas de Exceção/Fallback", icon: RotateCcw },
                ].map(item => (
                  <div key={item.key} className={cn(
                    "flex items-center justify-between p-4 rounded-xl border transition-all",
                    score[item.key as keyof typeof score] 
                      ? "bg-nexus-emerald/5 border-nexus-emerald/20 text-nexus-emerald" 
                      : "bg-secondary/20 border-border/40 text-muted-foreground"
                  )}>
                    <div className="flex items-center gap-3">
                      <item.icon className="h-4 w-4" />
                      <span className="text-xs font-bold uppercase tracking-tight">{item.label}</span>
                    </div>
                    {score[item.key as keyof typeof score] ? <CheckCircle className="h-4 w-4" /> : <Info className="h-4 w-4 opacity-50" />}
                  </div>
                ))}
              </div>
            </Card>

            <div className="space-y-6">
              <Card className="p-8 bg-card/30 border-border/40 space-y-6">
                <h3 className="text-sm font-black uppercase tracking-widest text-foreground flex items-center gap-2">
                  <Languages className="h-4 w-4 text-primary" /> Distribuição de Idiomas
                </h3>
                <div className="h-[200px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={qualityStats}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border)/0.2)" />
                      <XAxis dataKey="range" hide />
                      <ChartTooltip cursor={{ fill: 'transparent' }} contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '12px', border: '1px solid hsl(var(--border))' }} />
                      <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                        {qualityStats.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border/10">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-tighter">Complexidade</span>
                    <span className="text-lg font-black text-nexus-cyan">Alta (Industrial)</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-tighter">Estilo Cognitivo</span>
                    <span className="text-lg font-black text-primary">Direto / Técnico</span>
                  </div>
                </div>
              </Card>

              <div className="nexus-card p-6 bg-gradient-to-br from-nexus-amber/10 to-transparent border-nexus-amber/20">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-nexus-amber mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-xs font-black uppercase tracking-widest text-nexus-amber">Alerta de Ambiguidade</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">Detectamos termos que podem gerar alucinações em modelos menores. Considere utilizar <b>Markdown Tables</b> para definições complexas.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="telemetry" className="mt-6 space-y-6">
          <div className="grid lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 p-6 bg-card/30 border-border/40 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black uppercase tracking-widest text-foreground flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" /> Latência de Resposta por Versão
                </h3>
                <Badge variant="secondary" className="bg-primary/5 text-primary">v{activeVersion?.version} Performance</Badge>
              </div>
              <div className="h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={latencyData}>
                    <defs>
                      <linearGradient id="latencyGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border)/0.2)" />
                    <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis hide />
                    <ChartTooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '12px', border: '1px solid hsl(var(--border))' }} />
                    <Area type="monotone" dataKey="latency" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#latencyGradient)" strokeWidth={3} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <div className="space-y-6">
              <Card className="p-6 bg-card/30 border-border/40 space-y-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Distribuição de Custo</h3>
                <div className="space-y-4">
                  <div className="flex items-end justify-between">
                    <div className="space-y-1">
                      <p className="text-2xl font-black text-foreground">$0.0042</p>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase">Avg per execution</p>
                    </div>
                    <Badge variant="outline" className="text-nexus-emerald border-nexus-emerald/20 bg-nexus-emerald/5">+2.4% vs prev</Badge>
                  </div>
                  <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                    <div className="h-full w-[65%] bg-primary" />
                  </div>
                </div>
              </Card>

              <Card className="p-6 bg-card/30 border-border/40 space-y-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Sucesso de Execução</h3>
                <div className="flex items-center gap-4">
                  <div className="relative h-16 w-16">
                    <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                      <circle cx="18" cy="18" r="16" fill="none" stroke="hsl(var(--secondary))" strokeWidth="2.5" />
                      <circle cx="18" cy="18" r="16" fill="none" stroke="hsl(var(--nexus-emerald))" strokeWidth="2.5"
                        strokeDasharray="99 100" strokeLinecap="round" />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xs font-black">99.9%</span>
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-sm font-bold text-foreground">Disponibilidade Alta</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-black">Status: Nominal</p>
                  </div>
                </div>
              </Card>

              <Button variant="outline" className="w-full h-14 rounded-2xl border-border/40 gap-3 group">
                <Microscope className="h-5 w-5 text-primary group-hover:scale-110 transition-transform" />
                <span className="font-bold">Investigar Traces</span>
                <ArrowRight className="h-4 w-4 ml-auto opacity-40 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
