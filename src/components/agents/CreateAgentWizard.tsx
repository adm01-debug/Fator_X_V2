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
  Check, ArrowLeft, ArrowRight, ChevronRight, Shield, Search,
  LayoutTemplate, PenTool, Database, Rocket, Zap, Sparkles, Wand2, 
  Loader2
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

  // Track which templates came from the database (verified)
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
        // Dedup por nome normalizado (IDs do banco são UUIDs, dos estáticos são slugs).
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
    prompt: `Você é um assistente profissional da empresa.\n\n## Persona\n- Tom profissional e acolhedor\n- Respostas precisas e concisas\n\n## Escopo\n- Responder dúvidas sobre o produto\n- Guiar integrações e configurações\n- Escalar para humano quando fora do escopo\n\n## Formato\n- Use markdown para formatação\n- Máximo 300 palavras por resposta`,
    tools: [] as string[], memory: ["short_term", "user_profile"] as string[],
    knowledgeBases: [] as string[], environment: "development" as string,
  });

  const update = (key: string, value: unknown) => setForm(prev => ({ ...prev, [key]: value }));
  const toggleArrayItem = (key: string, item: string) => {
    const arr = form[key as keyof typeof form] as string[];
    update(key, arr.includes(item) ? arr.filter(i => i !== item) : [...arr, item]);
  };

  const currentSteps = mode === "template" ? TEMPLATE_STEPS : STEPS;
  const next = () => step < currentSteps.length - 1 && setStep(step + 1);
  const prev = () => step > 0 && setStep(step - 1);

  const applyTemplate = (t: AgentTemplate) => {
    setSelectedTemplate(t);
    setForm(prev => ({ ...prev, name: t.name, description: t.description, type: t.type, model: t.model, prompt: t.prompt, tools: t.tools, memory: t.memory }));
  };

  const handleMagicCreate = async () => {
    if (!magicIdea.trim()) return;
    setIsGeneratingMagic(true);
    setMagicPreview(null);
    try {
      // Simulação de IA gerando agente a partir de ideia
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
    
    // Auto-fill form with generated values
    setForm(prev => ({
      ...prev,
      name: magicPreview.name,
      description: magicPreview.mission,
      objective: magicPreview.mission,
      type: magicPreview.type,
      model: magicPreview.model,
      prompt: magicPreview.prompt,
      tools: magicPreview.tools,
      memory: magicPreview.memory
    }));

    // Auto-save as draft if user is logged in
    if (user) {
      try {
        const { data, error } = await supabaseExternal.from("agents").insert({
          user_id: user.id,
          name: magicPreview.name,
          mission: magicPreview.mission,
          persona: "assistant",
          model: magicPreview.model,
          avatar_emoji: "🪄",
          status: "draft",
          config: { 
            type: magicPreview.type, 
            prompt: magicPreview.prompt, 
            tools: magicPreview.tools, 
            memory: magicPreview.memory,
            is_magic_draft: true
          },
        }).select('id').single();
        
        if (data?.id) {
          toast.success("Rascunho salvo e versionado!");
          navigate(`/builder/${data.id}`);
          return;
        }
      } catch (e) {
        console.error("Auto-save draft failed", e);
      }
    }

    setMode("scratch");
    setStep(0);
    setMagicPreview(null);
    setMagicIdea("");
  };

  const saveAgent = async () => {
    if (!user) { toast.error("Faça login para criar agentes"); navigate("/auth"); return; }
    setSaving(true);
    const { error } = await supabaseExternal.from("agents").insert({
      user_id: user.id, name: form.name, mission: form.objective || form.description,
      persona: "assistant", model: form.model, avatar_emoji: selectedTemplate?.emoji || "🤖", status: "draft" as const,
      config: { type: form.type, prompt: form.prompt, tools: form.tools, memory: form.memory, knowledgeBases: form.knowledgeBases, environment: form.environment, description: form.description },
    });
    setSaving(false);
    if (error) { toast.error("Erro ao salvar agente", { description: error.message }); }
    else { toast.success("Agente criado com sucesso!", { description: `${form.name} foi salvo no banco de dados.` }); navigate("/agents"); }
  };

  const canProceed = () => {
    if (mode === "template") { if (step === 0) return selectedTemplate !== null; if (step === 1) return form.name.trim().length > 0; return true; }
    if (step === 0) return form.name.trim().length > 0;
    if (step === 1) return form.type.length > 0;
    return true;
  };

  if (mode === "quick") {
    return <QuickCreateWizard onBack={() => setMode("choose")} />;
  }

  if (mode === "choose") {
    return (
      <div className="p-6 sm:p-10 max-w-[1200px] mx-auto space-y-12 animate-page-enter">
        <div className="text-center space-y-4 max-w-2xl mx-auto">
          <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
            Novo Agente de IA
          </Badge>
          <h1 className="text-4xl font-heading font-extrabold text-foreground tracking-tight">Qual o seu objetivo hoje?</h1>
          <p className="text-muted-foreground text-lg">Escolha o caminho ideal para dar vida ao seu novo membro da frota digital.</p>
        </div>

        {/* Magic Idea Box */}
        <Card className="p-8 bg-gradient-to-br from-primary/10 via-primary/5 to-background border-primary/20 shadow-xl shadow-primary/5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:scale-110 transition-transform duration-700" />
          <div className="relative flex flex-col md:flex-row items-center gap-6">
            <div className="h-16 w-16 rounded-2xl bg-primary/20 flex items-center justify-center shrink-0 border border-primary/30">
              <Sparkles className="h-8 w-8 text-primary animate-pulse" />
            </div>
            <div className="flex-1 space-y-2 text-center md:text-left">
              <h3 className="text-xl font-bold text-foreground">Geração Mágica via IA</h3>
              <p className="text-sm text-muted-foreground">Descreva sua ideia em poucas palavras e deixe nossa IA estruturar o agente completo para você.</p>
            </div>
            <div className="w-full md:w-[400px] flex gap-2">
              <Input 
                placeholder="Ex: Suporte para e-commerce de moda..." 
                value={magicIdea}
                onChange={(e) => setMagicIdea(e.target.value)}
                className="bg-background/80 border-primary/30 focus:ring-primary h-12 rounded-xl"
              />
              <Button 
                onClick={handleMagicCreate} 
                disabled={isGeneratingMagic || !magicIdea.trim()}
                className="nexus-gradient-bg text-primary-foreground h-12 px-6 rounded-xl shadow-lg shadow-primary/20"
              >
                {isGeneratingMagic ? <Loader2 className="h-5 w-5 animate-spin" /> : <Wand2 className="h-5 w-5" />}
              </Button>
            </div>
          </div>

          {magicPreview && (
            <div className="mt-8 p-6 bg-background/60 border border-primary/20 rounded-2xl animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-1 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-xl">🪄</div>
                    <div>
                      <h4 className="font-bold text-foreground">{magicPreview.name}</h4>
                      <p className="text-xs text-muted-foreground uppercase font-bold tracking-widest">{magicPreview.type} • {magicPreview.model}</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground italic leading-relaxed">"{magicPreview.mission}"</p>
                  <div className="flex flex-wrap gap-2">
                    {magicPreview.tools.map((t: string) => (
                      <Badge key={t} variant="secondary" className="text-[10px] bg-primary/5 text-primary border-primary/10">{t}</Badge>
                    ))}
                  </div>
                </div>
                <div className="flex items-end gap-3">
                  <Button variant="ghost" size="sm" onClick={() => setMagicPreview(null)} className="h-10 px-4 rounded-xl text-muted-foreground">Descartar</Button>
                  <Button onClick={confirmMagicCreate} className="nexus-gradient-bg text-primary-foreground h-10 px-6 rounded-xl shadow-lg shadow-primary/20 gap-2 font-bold">
                    <Check className="h-4 w-4" />
                    Finalizar e Editar
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>

        <div className="grid gap-6 md:grid-cols-3">
          <button onClick={() => { setMode("quick"); setStep(0); }} className="nexus-card text-left transition-all hover:scale-[1.02] hover:border-primary/50 group p-8 relative overflow-hidden">
            <div className="absolute top-4 right-4 text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-1 rounded-full uppercase tracking-tighter">RECOMENDADO</div>
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 group-hover:bg-primary/20 transition-colors">
              <Zap className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-3">Criação Assistida</h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">Fluxo otimizado em 4 passos com validações em tempo real e templates contextuais.</p>
            <div className="flex items-center gap-1.5 text-xs text-primary font-bold">
              <span>COMEÇAR AGORA</span>
              <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </button>

          <button onClick={() => { setMode("template"); setStep(0); }} className="nexus-card text-left transition-all hover:scale-[1.02] hover:border-primary/50 group p-8 relative overflow-hidden">
            <div className="h-14 w-14 rounded-2xl bg-secondary flex items-center justify-center mb-6 group-hover:bg-primary/10 transition-colors">
              <LayoutTemplate className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-3">Galeria de Blueprints</h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">Acesse nossa biblioteca com {AGENT_TEMPLATES_LIST.length} modelos pré-validados para casos de uso comuns.</p>
            <div className="flex flex-wrap gap-1.5">
              {AGENT_TEMPLATES_LIST.slice(0, 2).map(t => <span key={t.id} className="text-[10px] bg-secondary/80 px-2 py-0.5 rounded-md text-muted-foreground border border-border/50">{t.emoji} {t.name}</span>)}
              <span className="text-[10px] bg-secondary/80 px-2 py-0.5 rounded-md text-muted-foreground">+{AGENT_TEMPLATES_LIST.length - 2}</span>
            </div>
          </button>

          <button onClick={() => { setMode("scratch"); setStep(0); }} className="nexus-card text-left transition-all hover:scale-[1.02] hover:border-primary/50 group p-8 relative overflow-hidden">
            <div className="h-14 w-14 rounded-2xl bg-secondary flex items-center justify-center mb-6 group-hover:bg-primary/10 transition-colors">
              <PenTool className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-3">Customização Total</h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">Para arquitetos de IA. Controle granular sobre memória, RAG, ferramentas e governança.</p>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-bold group-hover:text-foreground transition-colors">
              <span>EXPLORAR OPÇÕES</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </div>
          </button>
        </div>
      </div>
    );
  }

  const renderTemplateStep = () => {
    switch (step) {
      case 0: return (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-heading font-semibold text-foreground">Escolha um template</h2>
            <p className="text-sm text-muted-foreground">{filteredTemplates.length} de {AGENT_TEMPLATES_LIST.length} templates disponíveis</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar por nome, categoria, descrição ou tag..."
                className="pl-9 bg-secondary/50 border-border/50"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors inline-flex items-center gap-1.5 ${
                  selectedCategory === cat
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary/50 text-muted-foreground border-border/50 hover:bg-secondary"
                }`}
              >
                <span>{cat === "all" ? "Todos" : cat}</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                  selectedCategory === cat
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-background/60 text-muted-foreground"
                }`}>
                  {categoryCount[cat] || 0}
                </span>
              </button>
            ))}
          </div>
          {filteredTemplates.length === 0 ? (
            <div className="nexus-card text-center py-10 text-sm text-muted-foreground">
              Nenhum template encontrado para esta busca.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredTemplates.map(t => {
                const selected = selectedTemplate?.id === t.id;
                const isVerified = dbTemplateIds.has(t.id);
                return (
                  <button key={t.id} onClick={() => applyTemplate(t)} className={`nexus-card text-left transition-all relative ${selected ? "ring-2 ring-primary bg-primary/5" : "hover:bg-secondary/60"}`}>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl">{t.emoji}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-medium text-sm text-foreground truncate">{t.name}</p>
                          {isVerified && (
                            <span title="Template verificado e otimizado" className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-full">
                              <Shield className="h-2.5 w-2.5" /> Verificado
                            </span>
                          )}
                        </div>
                        <Badge variant="outline" className="text-[11px] mt-0.5">{t.category}</Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                    {selected && <Check className="h-4 w-4 text-primary absolute top-3 right-3" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      );
      case 1: return (
        <div className="nexus-card space-y-5">
          <h2 className="text-lg font-heading font-semibold text-foreground">Personalizar</h2>
          <div className="grid gap-4">
            <div><Label className="text-sm">Nome do agente *</Label><Input value={form.name} onChange={e => update("name", e.target.value)} placeholder="Ex: Atlas, Scout..." className="mt-1.5 bg-secondary/50 border-border/50" /></div>
            <div><Label className="text-sm">Descrição</Label><Input value={form.description} onChange={e => update("description", e.target.value)} placeholder="Descreva o propósito..." className="mt-1.5 bg-secondary/50 border-border/50" /></div>
            <div><Label className="text-sm">System Prompt</Label><Textarea value={form.prompt} onChange={e => update("prompt", e.target.value)} rows={10} className="mt-1.5 bg-secondary/50 border-border/50 font-mono text-xs resize-none" /></div>
          </div>
        </div>
      );
      case 2: return (
        <div className="space-y-4">
          <h2 className="text-lg font-heading font-semibold text-foreground">Revisar & Criar</h2>
          <div className="nexus-card space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Resumo</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><span className="text-muted-foreground">Nome:</span> <strong className="text-foreground ml-1">{form.name}</strong></div>
              <div><span className="text-muted-foreground">Template:</span> <strong className="text-foreground ml-1">{selectedTemplate?.name}</strong></div>
              <div><span className="text-muted-foreground">Modelo:</span> <strong className="text-foreground ml-1">{MODELS.find(m => m.id === form.model)?.name}</strong></div>
              <div><span className="text-muted-foreground">Ferramentas:</span> <strong className="text-foreground ml-1">{form.tools.length} selecionadas</strong></div>
              <div><span className="text-muted-foreground">Memória:</span> <strong className="text-foreground ml-1">{form.memory.length} camadas</strong></div>
              <div><span className="text-muted-foreground">Tipo:</span> <strong className="text-foreground ml-1">{AGENT_TYPES.find(t => t.id === form.type)?.label}</strong></div>
            </div>
          </div>
        </div>
      );
      default: return null;
    }
  };

  const renderScratchStep = () => {
    switch (step) {
      case 0: return <StepIdentity form={form} update={update} />;
      case 1: return <StepType form={form} update={update} />;
      case 2: return <StepModel form={form} update={update} />;
      case 3: return <StepPrompt form={form} update={update} />;
      case 4: return <StepTools form={form} toggle={(id: string) => toggleArrayItem("tools", id)} />;
      case 5: return <StepMemory form={form} toggle={(id: string) => toggleArrayItem("memory", id)} />;
      case 6: return <StepKnowledge form={form} toggle={(id: string) => toggleArrayItem("knowledgeBases", id)} />;
      case 7: return <StepDeploy form={form} update={update} />;
      default: return null;
    }
  };

  const isLastStep = step === currentSteps.length - 1;

  return (
    <div className="p-6 max-w-[1100px] mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => step === 0 ? setMode("choose") : prev()} className="text-muted-foreground"><ArrowLeft className="h-4 w-4" /></Button>
        <div><h1 className="text-xl font-heading font-bold text-foreground">{mode === "template" ? "Criar via template" : "Criar do zero"}</h1><p className="text-sm text-muted-foreground">Passo {step + 1} de {currentSteps.length}</p></div>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {currentSteps.map((s, i) => {
          const isActive = i === step;
          const isDone = i < step;
          return (
            <button key={s.key} onClick={() => i <= step && setStep(i)} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all whitespace-nowrap ${isActive ? "bg-primary/15 text-primary" : isDone ? "bg-secondary/60 text-foreground cursor-pointer hover:bg-secondary" : "text-muted-foreground"}`}>
              <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${isDone ? "bg-primary text-primary-foreground" : isActive ? "bg-primary/20 text-primary border border-primary/40" : "bg-secondary text-muted-foreground"}`}>
                {isDone ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              <span className="hidden sm:inline">{s.label}</span>
              {i < currentSteps.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground/40 ml-1" />}
            </button>
          );
        })}
      </div>

      <div key={`${mode}-${step}`}>{mode === "template" ? renderTemplateStep() : renderScratchStep()}</div>

      <div className="flex items-center justify-between pt-4 border-t border-border/50">
        <Button variant="ghost" onClick={() => step === 0 ? setMode("choose") : prev()} className="gap-2"><ArrowLeft className="h-4 w-4" /> Voltar</Button>
        <div className="text-xs text-muted-foreground">{step + 1} de {currentSteps.length}</div>
        {!isLastStep ? (
          <Button onClick={next} disabled={!canProceed()} className="gap-2 nexus-gradient-bg text-primary-foreground hover:opacity-90">Próximo <ArrowRight className="h-4 w-4" /></Button>
        ) : (
          <Button onClick={saveAgent} disabled={saving} className="gap-2 nexus-gradient-bg text-primary-foreground hover:opacity-90">{saving ? "Salvando..." : <><Rocket className="h-4 w-4" /> Criar agente</>}</Button>
        )}
      </div>
    </div>
  );
}

/* ─── Step Components (scratch mode) ─── */

function StepIdentity({ form, update }: { form: Record<string, string | string[]>; update: (k: string, v: unknown) => void }) {
  return (
    <div className="nexus-card space-y-5">
      <h2 className="text-lg font-heading font-semibold text-foreground">Identidade do agente</h2>
      <div className="grid gap-4">
        <div><Label className="text-sm">Nome do agente *</Label><Input value={form.name} onChange={e => update("name", e.target.value)} placeholder="Ex: Atlas, Scout, Sentinel..." className="mt-1.5 bg-secondary/50 border-border/50" /></div>
        <div><Label className="text-sm">Descrição</Label><Textarea value={form.description} onChange={e => update("description", e.target.value)} placeholder="Descreva o propósito deste agente..." rows={3} className="mt-1.5 bg-secondary/50 border-border/50 resize-none" /></div>
        <div><Label className="text-sm">Objetivo principal</Label><Input value={form.objective} onChange={e => update("objective", e.target.value)} placeholder="Ex: Atender dúvidas técnicas de clientes premium" className="mt-1.5 bg-secondary/50 border-border/50" /></div>
      </div>
    </div>
  );
}

function StepType({ form, update }: { form: Record<string, string | string[]>; update: (k: string, v: unknown) => void }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-heading font-semibold text-foreground">Tipo do agente</h2>
      <p className="text-sm text-muted-foreground">Selecione o tipo que melhor descreve o papel deste agente.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {AGENT_TYPES.map(t => { const Icon = t.icon; const selected = form.type === t.id; return (
          <button key={t.id} onClick={() => update("type", t.id)} className={`nexus-card text-left transition-all ${selected ? "ring-2 ring-primary bg-primary/5" : "hover:bg-secondary/60"}`}>
            <div className="flex items-center gap-3 mb-2"><div className={`h-10 w-10 rounded-xl flex items-center justify-center ${selected ? "bg-primary/20" : "bg-secondary"}`}><Icon className={`h-5 w-5 ${selected ? "text-primary" : "text-muted-foreground"}`} /></div><span className="font-medium text-sm text-foreground">{t.label}</span></div>
            <p className="text-xs text-muted-foreground">{t.desc}</p>
          </button>
        ); })}
      </div>
    </div>
  );
}

function StepModel({ form, update }: { form: Record<string, string | string[]>; update: (k: string, v: unknown) => void }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-heading font-semibold text-foreground">Modelo base</h2>
      <p className="text-sm text-muted-foreground">Escolha o modelo de linguagem para este agente.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {MODELS.map(m => { const selected = form.model === m.id; return (
          <button key={m.id} onClick={() => update("model", m.id)} className={`nexus-card text-left transition-all ${selected ? "ring-2 ring-primary bg-primary/5" : "hover:bg-secondary/60"}`}>
            <div className="flex items-center justify-between mb-2"><span className="font-semibold text-sm text-foreground">{m.name}</span><Badge variant="outline" className="text-[11px]">{m.provider}</Badge></div>
            <div className="flex gap-3 text-xs text-muted-foreground"><span>Custo: <strong className="text-foreground">{m.cost}</strong></span><span>Velocidade: <strong className="text-foreground">{m.speed}</strong></span><span>Qualidade: <strong className="text-foreground">{m.quality}</strong></span></div>
          </button>
        ); })}
      </div>
    </div>
  );
}

function StepPrompt({ form, update }: { form: Record<string, string | string[]>; update: (k: string, v: unknown) => void }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-heading font-semibold text-foreground">System Prompt</h2>
      <p className="text-sm text-muted-foreground">Defina as instruções de comportamento do agente.</p>
      <div className="nexus-card"><Textarea value={form.prompt} onChange={e => update("prompt", e.target.value)} rows={14} className="bg-secondary/50 border-border/50 font-mono text-xs leading-relaxed resize-none" /></div>
    </div>
  );
}

function StepTools({ form, toggle }: { form: Record<string, string | string[]>; toggle: (id: string) => void }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-heading font-semibold text-foreground">Ferramentas</h2>
      <p className="text-sm text-muted-foreground">Habilite as ferramentas que o agente poderá utilizar.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TOOLS.map(t => { const Icon = t.icon; const selected = (form.tools as string[]).includes(t.id); return (
          <button key={t.id} onClick={() => toggle(t.id)} className={`nexus-card text-left transition-all relative ${selected ? "ring-2 ring-primary bg-primary/5" : "hover:bg-secondary/60"}`}>
            <div className="flex items-center gap-2.5"><div className={`h-9 w-9 rounded-lg flex items-center justify-center ${selected ? "bg-primary/20" : "bg-secondary"}`}><Icon className={`h-4 w-4 ${selected ? "text-primary" : "text-muted-foreground"}`} /></div><div><p className="text-xs font-medium text-foreground">{t.name}</p><p className="text-[11px] text-muted-foreground">{t.category}</p></div></div>
            {selected && <Check className="h-3.5 w-3.5 text-primary absolute top-2 right-2" />}
          </button>
        ); })}
      </div>
    </div>
  );
}

function StepMemory({ form, toggle }: { form: Record<string, string | string[]>; toggle: (id: string) => void }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-heading font-semibold text-foreground">Memória</h2>
      <p className="text-sm text-muted-foreground">Configure as camadas de memória do agente.</p>
      <div className="space-y-3">
        {MEMORY_OPTIONS.map(m => { const enabled = (form.memory as string[]).includes(m.id); return (
          <div key={m.id} className="nexus-card flex items-center justify-between"><div><p className="text-sm font-medium text-foreground">{m.label}</p><p className="text-xs text-muted-foreground">{m.desc}</p></div><Switch checked={enabled} onCheckedChange={() => toggle(m.id)} /></div>
        ); })}
      </div>
    </div>
  );
}

function StepKnowledge({ form, toggle }: { form: Record<string, string | string[]>; toggle: (id: string) => void }) {
  const kbs = [
    { id: "kb-docs", name: "Documentação Técnica", docs: 342, status: "synced" },
    { id: "kb-faq", name: "FAQ & Suporte", docs: 89, status: "synced" },
    { id: "kb-legal", name: "Políticas & Compliance", docs: 156, status: "syncing" },
  ];
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-heading font-semibold text-foreground">Knowledge Base</h2>
      <p className="text-sm text-muted-foreground">Vincule bases de conhecimento para RAG.</p>
      <div className="space-y-3">
        {kbs.map(kb => { const selected = (form.knowledgeBases as string[]).includes(kb.id); return (
          <button key={kb.id} onClick={() => toggle(kb.id)} className={`nexus-card w-full text-left flex items-center justify-between transition-all ${selected ? "ring-2 ring-primary bg-primary/5" : "hover:bg-secondary/60"}`}>
            <div className="flex items-center gap-3"><div className={`h-10 w-10 rounded-xl flex items-center justify-center ${selected ? "bg-primary/20" : "bg-secondary"}`}><Database className={`h-5 w-5 ${selected ? "text-primary" : "text-muted-foreground"}`} /></div><div><p className="text-sm font-medium text-foreground">{kb.name}</p><p className="text-xs text-muted-foreground">{kb.docs} documentos • {kb.status === "synced" ? "Sincronizado" : "Sincronizando..."}</p></div></div>
            {selected && <Check className="h-4 w-4 text-primary" />}
          </button>
        ); })}
      </div>
    </div>
  );
}

function StepDeploy({ form, update }: { form: Record<string, string | string[]>; update: (k: string, v: unknown) => void }) {
  const envs = [
    { id: "development", label: "Development", desc: "Testes internos" },
    { id: "staging", label: "Staging", desc: "Validação pré-produção" },
    { id: "production", label: "Production", desc: "Acesso por usuários finais" },
  ];
  const selectedType = AGENT_TYPES.find(t => t.id === form.type);
  const selectedModel = MODELS.find(m => m.id === form.model);
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-heading font-semibold text-foreground">Revisão & Deploy</h2>
      <div className="nexus-card space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Resumo</h3>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div><span className="text-muted-foreground">Nome:</span> <strong className="text-foreground ml-1">{String(form.name || "—")}</strong></div>
          <div><span className="text-muted-foreground">Tipo:</span> <strong className="text-foreground ml-1">{selectedType?.label || "—"}</strong></div>
          <div><span className="text-muted-foreground">Modelo:</span> <strong className="text-foreground ml-1">{selectedModel?.name || "—"}</strong></div>
          <div><span className="text-muted-foreground">Ferramentas:</span> <strong className="text-foreground ml-1">{(form.tools as string[]).length} selecionadas</strong></div>
          <div><span className="text-muted-foreground">Memória:</span> <strong className="text-foreground ml-1">{(form.memory as string[]).length} camadas</strong></div>
          <div><span className="text-muted-foreground">Knowledge:</span> <strong className="text-foreground ml-1">{(form.knowledgeBases as string[]).length} bases</strong></div>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {envs.map(e => { const selected = form.environment === e.id; return (
          <button key={e.id} onClick={() => update("environment", e.id)} className={`nexus-card text-left transition-all ${selected ? "ring-2 ring-primary bg-primary/5" : "hover:bg-secondary/60"}`}>
            <div className="flex items-center gap-2 mb-1"><div className={`h-2 w-2 rounded-full ${e.id === "production" ? "bg-nexus-emerald" : e.id === "staging" ? "bg-nexus-amber" : "bg-muted-foreground"}`} /><span className="text-sm font-medium text-foreground">{e.label}</span></div>
            <p className="text-xs text-muted-foreground">{e.desc}</p>
          </button>
        ); })}
      </div>
      <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 flex items-start gap-3">
        <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div><p className="text-sm font-medium text-foreground">Guardrails recomendados</p><p className="text-xs text-muted-foreground mt-1">Após a criação, configure PII masking, limites de custo e moderação na aba Security.</p></div>
      </div>
    </div>
  );
}
