import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Check, ArrowLeft, ArrowRight, ChevronRight, Shield, Search,
  LayoutTemplate, PenTool, Database, Rocket, Zap, Sparkles, Wand2, 
  Loader2, Info, Brain, Wrench, ShieldAlert, TrendingUp
} from "lucide-react";
import { toast } from "sonner";
import { supabaseExternal } from "@/integrations/supabase/externalClient";
import { useAuth } from "@/contexts/AuthContext";
import { AGENT_TEMPLATES as STATIC_TEMPLATES, type AgentTemplate } from "@/data/agentTemplates";
import {
  STEPS, TEMPLATE_STEPS, AGENT_TYPES, MODELS, TOOLS, MEMORY_OPTIONS,
} from "./wizard/wizardConstants";
import { QuickCreateWizard } from "./wizard/QuickCreateWizard";

type WizardMode = "choose" | "template" | "scratch" | "quick";

export function CreateAgentWizard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mode, setMode] = useState<WizardMode>("choose");
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<AgentTemplate | null>(null);
  const [AGENT_TEMPLATES_LIST, setAgentTemplates] = useState<AgentTemplate[]>(STATIC_TEMPLATES);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [magicIdea, setMagicIdea] = useState("");
  const [isGeneratingMagic, setIsGeneratingMagic] = useState(false);
  const [magicPreview, setMagicPreview] = useState<any>(null);
  const [viewingTemplate, setViewingTemplate] = useState<AgentTemplate | null>(null);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);

  const categoryCount = useMemo(() => {
    const counts: Record<string, number> = { all: AGENT_TEMPLATES_LIST.length };
    AGENT_TEMPLATES_LIST.forEach(t => {
      if (t.category) counts[t.category] = (counts[t.category] || 0) + 1;
    });
    return counts;
  }, [AGENT_TEMPLATES_LIST]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    AGENT_TEMPLATES_LIST.forEach(t => t.category && set.add(t.category));
    return ["all", ...Array.from(set).sort()];
  }, [AGENT_TEMPLATES_LIST]);

  const [dbTemplateIds, setDbTemplateIds] = useState<Set<string>>(new Set());

  const filteredTemplates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return AGENT_TEMPLATES_LIST.filter(t => {
      if (selectedCategory !== "all" && t.category !== selectedCategory) return false;
      if (!q) return true;
      const hay = `${t.name} ${t.description} ${t.category} ${(t.tags || []).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [AGENT_TEMPLATES_LIST, searchQuery, selectedCategory]);

  useEffect(() => {
    supabaseExternal.from('agent_templates').select('*').eq('is_public', true).order('usage_count', { ascending: false }).then(({ data }) => {
      if (data && data.length > 0) {
        const dbTemplates: AgentTemplate[] = data.map((t) => {
          const cfg = t.config as Record<string, unknown> | null;
          const rawTools = cfg?.tools;
          const toolNames: string[] = Array.isArray(rawTools)
            ? rawTools.map((tool) => typeof tool === 'string' ? tool : (tool as { name?: string })?.name ?? '').filter(Boolean)
            : [];
          const memoryTypes = (cfg?.memory_types as string[]) || (cfg?.memory as string[]) || [];
          return {
            id: t.id, name: t.name, icon: t.icon || '🤖', category: t.category || 'general',
            description: t.description || '', tags: [],
            config: { persona: (cfg?.persona as string) || 'assistant', model: (cfg?.model as string) || 'gpt-4o', temperature: (cfg?.temperature as number) || 0.3, system_prompt: (cfg?.system_prompt as string) || '', tools: toolNames, guardrails: (cfg?.guardrails as string[]) || [], memory_types: memoryTypes },
            emoji: t.icon || '🤖', type: (cfg?.persona as string) || 'assistant', model: (cfg?.model as string) || 'gpt-4o',
            prompt: (cfg?.system_prompt as string) || '', tools: toolNames, memory: memoryTypes,
          };
        });
        const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
        const dbNames = new Set(dbTemplates.map(t => norm(t.name)));
        const merged = [...dbTemplates, ...STATIC_TEMPLATES.filter(t => !dbNames.has(norm(t.name)))];
        setAgentTemplates(merged);
        setDbTemplateIds(new Set(dbTemplates.map(t => t.id)));
      }
    }).then(undefined, () => {});
  }, []);

  const [form, setForm] = useState({
    name: "", description: "", objective: "", type: "", model: "gpt-4o",
    prompt: "", tools: [] as string[], memory: [] as string[],
    knowledgeBases: [] as string[], environment: "development" as string,
  });

  const applyTemplate = (t: AgentTemplate) => {
    setSelectedTemplate(t);
    setForm(prev => ({ ...prev, name: t.name, description: t.description, type: t.type, model: t.model, prompt: t.prompt, tools: t.tools, memory: t.memory }));
    setIsTemplateModalOpen(false);
    setViewingTemplate(null);
  };

  const handleTemplateClick = (t: AgentTemplate) => {
    setViewingTemplate(t);
    setIsTemplateModalOpen(true);
  };

  const handleMagicCreate = async () => {
    if (!magicIdea.trim()) return;
    setIsGeneratingMagic(true);
    setMagicPreview(null);
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const mockResult = {
        name: `Agente ${magicIdea.split(' ')[0]}`,
        mission: `Auxiliar no processo de ${magicIdea} com foco em eficiência.`,
        type: 'chatbot',
        model: 'gpt-4o',
        prompt: `Você é um assistente especializado em ${magicIdea}.\n\n## Missão\nSua missão é facilitar as tarefas relacionadas a ${magicIdea} garantindo qualidade e agilidade.\n\n## Diretrizes\n1. Responda com clareza e precisão.\n2. Utilize o contexto fornecido para personalizar o atendimento.\n3. Siga as normas de segurança e privacidade da empresa.`,
        tools: ['web_search', 'knowledge_base'],
        memory: ['short_term', 'user_profile']
      };
      setMagicPreview(mockResult);
      toast.success("IA estruturou seu agente!", { description: "Veja a prévia abaixo antes de prosseguir." });
    } catch {
      toast.error("Falha na geração mágica");
    } finally {
      setIsGeneratingMagic(false);
    }
  };

  const confirmMagicCreate = async () => {
    if (!magicPreview) return;
    setForm(prev => ({ ...prev, name: magicPreview.name, description: magicPreview.mission, objective: magicPreview.mission, type: magicPreview.type, model: magicPreview.model, prompt: magicPreview.prompt, tools: magicPreview.tools, memory: magicPreview.memory }));

    if (user) {
      try {
        const { data } = await supabaseExternal.from("agents").insert({
          user_id: user.id,
          name: magicPreview.name,
          mission: magicPreview.mission,
          persona: "assistant",
          model: magicPreview.model,
          avatar_emoji: "🪄",
          status: "draft",
          config: { type: magicPreview.type, prompt: magicPreview.prompt, tools: magicPreview.tools, memory: magicPreview.memory, is_magic_draft: true },
        }).select('id').single();
        if (data?.id) {
          toast.success("Rascunho salvo e versionado!");
          navigate(`/builder/${data.id}`);
          return;
        }
      } catch (e) { console.error("Auto-save draft failed", e); }
    }
    setMode("scratch");
    setStep(0);
    setMagicPreview(null);
    setMagicIdea("");
  };

  if (mode === "quick") return <QuickCreateWizard onBack={() => setMode("choose")} />;

  return (
    <div className="p-6 sm:p-10 max-w-[1200px] mx-auto space-y-12 animate-page-enter">
      {mode === "choose" && (
        <>
          <div className="text-center space-y-4 max-w-2xl mx-auto">
            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">Novo Agente de IA</Badge>
            <h1 className="text-4xl font-heading font-extrabold text-foreground tracking-tight">Qual o seu objetivo hoje?</h1>
            <p className="text-muted-foreground text-lg">Escolha o caminho ideal para dar vida ao seu novo membro da frota digital.</p>
          </div>

          <Card className="p-8 bg-gradient-to-br from-primary/10 via-primary/5 to-background border-primary/20 shadow-xl shadow-primary/5 relative overflow-hidden group">
            <div className="relative flex flex-col md:flex-row items-center gap-6">
              <div className="h-16 w-16 rounded-2xl bg-primary/20 flex items-center justify-center shrink-0 border border-primary/30">
                <Sparkles className="h-8 w-8 text-primary animate-pulse" />
              </div>
              <div className="flex-1 space-y-2 text-center md:text-left">
                <h3 className="text-xl font-bold text-foreground">Geração Mágica via IA</h3>
                <p className="text-sm text-muted-foreground">Descreva sua ideia em poucas palavras e deixe nossa IA estruturar o agente completo para você.</p>
              </div>
              <div className="w-full md:w-[400px] flex gap-2">
                <Input placeholder="Ex: Suporte para e-commerce de moda..." value={magicIdea} onChange={(e) => setMagicIdea(e.target.value)} className="bg-background/80 border-primary/30 focus:ring-primary h-12 rounded-xl" />
                <Button onClick={handleMagicCreate} disabled={isGeneratingMagic || !magicIdea.trim()} className="nexus-gradient-bg text-primary-foreground h-12 px-6 rounded-xl shadow-lg shadow-primary/20">{isGeneratingMagic ? <Loader2 className="h-5 w-5 animate-spin" /> : <Wand2 className="h-5 w-5" />}</Button>
              </div>
            </div>
            {magicPreview && (
              <div className="mt-8 p-6 bg-background/60 border border-primary/20 rounded-2xl animate-in fade-in slide-in-from-top-4 duration-500">
                <div className="flex flex-col md:flex-row gap-6">
                  <div className="flex-1 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-xl">🪄</div>
                      <div><h4 className="font-bold text-foreground">{magicPreview.name}</h4><p className="text-xs text-muted-foreground uppercase font-bold tracking-widest">{magicPreview.type} • {magicPreview.model}</p></div>
                    </div>
                    <p className="text-sm text-muted-foreground italic leading-relaxed">"{magicPreview.mission}"</p>
                    <div className="flex flex-wrap gap-2">{magicPreview.tools.map((t: string) => <Badge key={t} variant="secondary" className="text-[10px] bg-primary/5 text-primary border-primary/10">{t}</Badge>)}</div>
                  </div>
                  <div className="flex items-end gap-3">
                    <Button variant="ghost" size="sm" onClick={() => setMagicPreview(null)} className="h-10 px-4 rounded-xl text-muted-foreground">Descartar</Button>
                    <Button onClick={confirmMagicCreate} className="nexus-gradient-bg text-primary-foreground h-10 px-6 rounded-xl shadow-lg shadow-primary/20 gap-2 font-bold"><Check className="h-4 w-4" /> Finalizar e Editar</Button>
                  </div>
                </div>
              </div>
            )}
          </Card>

          <div className="grid gap-6 md:grid-cols-3">
            <button onClick={() => { setMode("quick"); setStep(0); }} className="nexus-card p-8">
              <Zap className="h-8 w-8 text-primary mb-6" />
              <h2 className="text-xl font-bold text-foreground mb-3">Criação Assistida</h2>
              <p className="text-sm text-muted-foreground mb-4">Fluxo otimizado em 4 passos com validações em tempo real.</p>
            </button>
            <button onClick={() => { setMode("template"); setStep(0); }} className="nexus-card p-8">
              <LayoutTemplate className="h-8 w-8 text-muted-foreground mb-6" />
              <h2 className="text-xl font-bold text-foreground mb-3">Galeria de Blueprints</h2>
              <p className="text-sm text-muted-foreground mb-4">Biblioteca com {AGENT_TEMPLATES_LIST.length} modelos pré-validados.</p>
            </button>
            <button onClick={() => { setMode("scratch"); setStep(0); }} className="nexus-card p-8">
              <PenTool className="h-8 w-8 text-muted-foreground mb-6" />
              <h2 className="text-xl font-bold text-foreground mb-3">Customização Total</h2>
              <p className="text-sm text-muted-foreground mb-4">Controle granular sobre memória, RAG e governança.</p>
            </button>
          </div>
        </>
      )}

      {mode === "template" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredTemplates.map(t => (
            <button key={t.id} onClick={() => handleTemplateClick(t)} className="nexus-card p-4 hover:bg-secondary/60 transition-all">
              <div className="flex items-center gap-3"><span className="text-2xl">{t.emoji}</span><div className="font-medium text-sm">{t.name}</div></div>
            </button>
          ))}
        </div>
      )}

      <Dialog open={isTemplateModalOpen} onOpenChange={setIsTemplateModalOpen}>
        <DialogContent className="max-w-3xl">
          {viewingTemplate && (
            <>
              <DialogHeader>
                <DialogTitle>{viewingTemplate.name}</DialogTitle>
                <DialogDescription>{viewingTemplate.description}</DialogDescription>
              </DialogHeader>
              <div className="py-4 space-y-4">
                <h4 className="font-bold">Ferramentas:</h4>
                <div className="flex gap-2">{viewingTemplate.tools.map(t => <Badge key={t}>{t}</Badge>)}</div>
              </div>
              <DialogFooter>
                <Button onClick={() => applyTemplate(viewingTemplate)}>Ativar Template</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
