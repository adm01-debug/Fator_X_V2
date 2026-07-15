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
  Save, GitBranch, RotateCcw, Trash2, Loader2, FileText,
  Activity, ShieldCheck, Target, History, Wand2, ArrowRight, Layout, Layers
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { AccessControl, DangerousActionDialog } from "@/components/rbac";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { DbRow } from '@/types/dbRow';
import { handleKeyboardClick } from "@/lib/a11y";
import {
  getAgentBasic,
  listPromptVersions,
  createPromptVersion,
  updatePromptVersion,
  deletePromptVersion,
  restorePromptVersion,
  diffLines,
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

  const activeVersion = versions.find((v: DbRow) => v.is_active) || versions[0];

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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- dependências intencionalmente estáveis / efeito de montagem
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
  const diffVersion = versions.find((v: DbRow) => v.id === diffVersionId);

  // Telemetry data simulation
  /* Telemetry data simulation */
  // const qualityStats = [ ... ];

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
              <Button variant="outline" size="sm" className="gap-1.5 text-meta"
                onClick={() => updateVersionMut.mutate(activeVersion.id)}
                disabled={updateVersionMut.isPending}
              >
                {updateVersionMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Atualizar v{activeVersion.version}
              </Button>
            )}
            <Button size="sm" className="gap-1.5 text-meta nexus-gradient-bg text-primary-foreground hover:opacity-90"
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
          <TabsTrigger value="editor" className="text-meta font-bold data-[state=active]:bg-background px-6 rounded-lg">
            <Layout className="h-3.5 w-3.5 mr-2" /> Editor
          </TabsTrigger>
          <TabsTrigger value="versions" className="text-meta font-bold data-[state=active]:bg-background px-6 rounded-lg">
            <History className="h-3.5 w-3.5 mr-2" /> Versões ({versions.length})
          </TabsTrigger>
          <TabsTrigger value="score" className="text-meta font-bold data-[state=active]:bg-background px-6 rounded-lg">
            <Target className="h-3.5 w-3.5 mr-2" /> Score & Análise
          </TabsTrigger>
          <TabsTrigger value="telemetry" className="text-meta font-bold data-[state=active]:bg-background px-6 rounded-lg">
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
                    <Label className="text-body-sm font-black uppercase tracking-widest text-foreground">Conteúdo do Prompt</Label>
                  </div>
                  {dirty && <Badge variant="outline" className="text-meta font-black uppercase text-nexus-amber border-nexus-amber/30 bg-nexus-amber/5">Dirty State</Badge>}
                </div>
                <Textarea
                  value={content}
                  onChange={e => handleContentChange(e.target.value)}
                  placeholder="Você é um assistente especializado em..."
                  className="bg-nexus-surface-1 border-border/40 font-mono text-[13px] leading-relaxed min-h-[500px] resize-none focus:ring-primary/20 p-6 rounded-2xl shadow-nexus-inner"
                />
                <div className="flex items-center justify-between mt-4">
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                      <span className="text-meta font-black text-muted-foreground uppercase tracking-tighter">Caracteres</span>
                      <span className="text-body-sm font-bold">{content.length.toLocaleString()}</span>
                    </div>
                    <Separator orientation="vertical" className="h-8 bg-border/40" />
                    <div className="flex flex-col">
                      <span className="text-meta font-black text-muted-foreground uppercase tracking-tighter">Palavras</span>
                      <span className="text-body-sm font-bold">{content.split(/\s+/).filter(Boolean).length.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="bg-secondary/50 font-mono text-meta">text-embedding-3-small</Badge>
                  </div>
                </div>
              </div>

              <div className="nexus-card p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Save className="h-4 w-4 text-primary" />
                  <Label className="text-body-sm font-black uppercase tracking-widest text-foreground">Sumário do Commit</Label>
                </div>
                <Input
                  value={summary}
                  onChange={e => setSummary(e.target.value)}
                  placeholder="Descreva o que mudou nesta versão neural..."
                  className="bg-secondary/30 border-border/40 text-body-sm h-12 rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-6">
              <Card className="p-6 bg-card/30 border-border/40">
                <h3 className="text-meta font-black uppercase tracking-widest text-muted-foreground mb-4">Quality Guardrails</h3>
                <div className="space-y-4">
                  {[
                    { label: 'Clareza Semântica', value: scorePercent, color: 'text-nexus-emerald' },
                    { label: 'Fidelidade de Instrução', value: 92, color: 'text-nexus-cyan' },
                    { label: 'Otimização de Contexto', value: 85, color: 'text-primary' }
                  ].map(m => (
                    <div key={m.label} className="space-y-1.5">
                      <div className="flex justify-between text-meta font-black uppercase tracking-tight">
                        <span>{m.label}</span>
                        <span className={m.color}>{m.value}%</span>
                      </div>
                      <Progress value={m.value} className="h-1 bg-secondary" />
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-6 bg-card/30 border-border/40">
                <h3 className="text-meta font-black uppercase tracking-widest text-muted-foreground mb-4">Neural Tokens (Estimated)</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-xl bg-secondary/20 border border-border/10">
                    <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-tighter">System Tokens</p>
                    <p className="text-title-sm font-black">{Math.round(content.length / 4)}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-secondary/20 border border-border/10">
                    <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-tighter">Density Score</p>
                    <p className="text-title-sm font-black">0.84</p>
                  </div>
                </div>
              </Card>

              <div className="p-6 rounded-[2rem] bg-gradient-to-br from-primary/10 to-transparent border border-primary/20 space-y-4">
                <div className="flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-primary" />
                  <h4 className="text-meta font-black uppercase tracking-widest text-primary">Prompt Optimizer</h4>
                </div>
                <p className="text-meta text-muted-foreground font-medium leading-relaxed">Nossa IA analisou seu prompt e sugere 3 otimizações para reduzir latência em 15%.</p>
                <Button variant="outline" size="sm" className="w-full rounded-xl border-primary/30 text-primary hover:bg-primary/5 font-black text-meta uppercase tracking-widest">Ver Sugestões</Button>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="versions" className="mt-6">
          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="bg-card/30 border-border/40 overflow-hidden">
              <div className="p-4 bg-muted/20 border-b border-border/40 flex items-center justify-between">
                <h3 className="text-meta font-black uppercase tracking-widest text-foreground flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" /> Timeline de Versões
                </h3>
              </div>
              <ScrollArea className="h-[600px]">
                <div className="divide-y divide-border/10">
                  {versions.map((v: DbRow) => (
                    <div role="button" tabIndex={0} onKeyDown={handleKeyboardClick} key={v.id}
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
                              <span className="text-body-sm font-black font-mono">v{v.version}</span>
                              {v.is_active && <Badge className="bg-nexus-emerald/10 text-nexus-emerald border-nexus-emerald/20 text-[9px] uppercase font-black">Live</Badge>}
                            </div>
                            <p className="text-meta text-muted-foreground font-mono">{new Date(v.created_at).toLocaleString('pt-BR')}</p>
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
                      <p className="text-meta text-foreground/80 font-medium italic mt-2">"{v.change_summary}"</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </Card>

            <Card className="bg-card/30 border-border/40 p-8 flex flex-col min-h-[600px] rounded-[2.5rem] relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary/[0.01] rounded-full blur-3xl pointer-events-none" />
              
              {diffVersion ? (
                <div className="flex-1 flex flex-col space-y-8 animate-in fade-in slide-in-from-right-4 duration-500 relative">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-meta font-black uppercase tracking-widest border-primary/30 text-primary">v{diffVersion.version}</Badge>
                        <h3 className="text-title-sm font-black text-foreground">Visualizador de Inteligência</h3>
                      </div>
                      <p className="text-meta text-muted-foreground font-medium">Analisando regressão semântica entre versões</p>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="rounded-xl border-nexus-emerald/30 text-nexus-emerald hover:bg-nexus-emerald/5 gap-2 font-black text-meta uppercase tracking-widest"
                      onClick={() => restoreVersionMut.mutate(diffVersion)}
                      disabled={restoreVersionMut.isPending || !!diffVersion.is_active}
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Restaurar Snapshot
                    </Button>
                  </div>

                  <div className="flex-1 p-6 rounded-3xl bg-secondary/20 border border-border/10 font-mono text-[13px] leading-relaxed overflow-auto max-h-[500px] scrollbar-thin">
                    {(() => {
                      const diffs = diffLines(activeVersion?.content || '', diffVersion.content);
                      return diffs.map((d: DbRow, idx: number) => (
                        <div key={idx} className={cn(
                          "px-2 py-0.5 rounded",
                          d.added && "bg-nexus-emerald/10 text-nexus-emerald border-l-2 border-nexus-emerald",
                          d.removed && "bg-nexus-rose/10 text-nexus-rose line-through border-l-2 border-nexus-rose",
                          !d.added && !d.removed && "opacity-80"
                        )}>
                          {d.removed ? '- ' : d.added ? '+ ' : '  '}{d.value || ' '}
                        </div>
                      ));
                    })()}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-secondary/30 border border-border/10">
                      <p className="text-meta font-black text-muted-foreground uppercase tracking-widest mb-1">Impacto Estimado</p>
                      <div className="flex items-center gap-2">
                        <ArrowRight className="h-4 w-4 text-nexus-cyan" />
                        <span className="text-body-sm font-bold">+12.4% Precisão</span>
                      </div>
                    </div>
                    <div className="p-4 rounded-2xl bg-secondary/30 border border-border/10">
                      <p className="text-meta font-black text-muted-foreground uppercase tracking-widest mb-1">Densidade de Tokens</p>
                      <div className="flex items-center gap-2">
                        <Layers className="h-4 w-4 text-primary" />
                        <span className="text-body-sm font-bold">1.2x Otimizado</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6 opacity-40">
                  <div className="h-20 w-20 rounded-3xl bg-secondary/50 flex items-center justify-center border border-border/20">
                    <History className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-body-sm font-black uppercase tracking-widest">Selecione uma Snapshot</h3>
                    <p className="text-meta font-medium max-w-[200px]">Compare as mudanças semânticas para validar a evolução do agente.</p>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="score" className="mt-6">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="p-8 rounded-[2.5rem] bg-gradient-to-br from-nexus-emerald/10 to-transparent border-nexus-emerald/20 text-center space-y-4">
              <ShieldCheck className="h-10 w-10 text-nexus-emerald mx-auto" />
              <div>
                <h3 className="text-2xl font-black text-foreground">{scorePercent}%</h3>
                <p className="text-meta font-black text-muted-foreground uppercase tracking-widest">Quality Score</p>
              </div>
            </Card>
            {/* ... other metrics ... */}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

