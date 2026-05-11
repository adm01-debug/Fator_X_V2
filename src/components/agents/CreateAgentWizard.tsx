import { useState, useEffect, useMemo } from "react";
// useNavigate removed as it was unused
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Check, Loader2, Brain, Wrench, ShieldAlert, Info, Wand2, Sparkles, TrendingUp, Zap, LayoutTemplate, PenTool, Search
} from "lucide-react";
import { toast } from "sonner";
import { supabaseExternal } from "@/integrations/supabase/externalClient";
import { useAuth } from "@/contexts/AuthContext";
import { AGENT_TEMPLATES as STATIC_TEMPLATES, type AgentTemplate } from "@/data/agentTemplates";
import { QuickCreateWizard } from "./wizard/QuickCreateWizard";
import { computeReadinessScore, READINESS_COLORS } from "@/lib/agentReadiness";

type WizardMode = "choose" | "template" | "scratch" | "quick";

export function CreateAgentWizard() {
  const { user } = useAuth();
  const [mode, setMode] = useState<WizardMode>("choose");
  const [AGENT_TEMPLATES_LIST, setAgentTemplates] = useState<AgentTemplate[]>(STATIC_TEMPLATES);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [magicIdea, setMagicIdea] = useState("");
  const [isGeneratingMagic, setIsGeneratingMagic] = useState(false);
  const [magicPreview, setMagicPreview] = useState<any>(null);
  const [viewingTemplate, setViewingTemplate] = useState<AgentTemplate | null>(null);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);

  const filteredTemplates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return AGENT_TEMPLATES_LIST.filter(t => {
      if (selectedCategory !== "all" && t.category !== selectedCategory) return false;
      if (!q) return true;
      const hay = `${t.name} ${t.description} ${t.category} ${(t.tags || []).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [AGENT_TEMPLATES_LIST, searchQuery, selectedCategory]);

  const categoryCount = useMemo(() => {
    const counts: Record<string, number> = { all: AGENT_TEMPLATES_LIST.length };
    AGENT_TEMPLATES_LIST.forEach(t => {
      if (t.category) counts[t.category] = (counts[t.category] || 0) + 1;
    });
    return counts;
  }, [AGENT_TEMPLATES_LIST]);

  const categories = useMemo(() => {
    const s = new Set<string>();
    AGENT_TEMPLATES_LIST.forEach(t => t.category && s.add(t.category));
    return ["all", ...Array.from(s).sort()];
  }, [AGENT_TEMPLATES_LIST]);

  useEffect(() => {
    supabaseExternal.from('agent_templates').select('*').eq('is_public', true).then(({ data }) => {
      if (data && data.length > 0) {
        setAgentTemplates(data as any);
      }
    });
  }, []);

  const handleTemplateClick = (t: AgentTemplate) => {
    setViewingTemplate(t);
    setIsTemplateModalOpen(true);
  };

  const applyTemplate = (t: AgentTemplate) => {
    toast.success(`Template ${t.name} ativado!`);
    setIsTemplateModalOpen(false);
    setViewingTemplate(null);
  };

  const handleMagicCreate = async () => {
    if (!magicIdea.trim()) return;
    setIsGeneratingMagic(true);
    // Simulate IA call - in a real app this would call an Edge Function
    await new Promise(r => setTimeout(r, 1500));
    
    // Heuristic-based generation from idea
    const idea = magicIdea.toLowerCase();
    const result = { 
      name: idea.split(' ').slice(0, 2).map(w => w[0].toUpperCase() + w.slice(1)).join(' ') || "Agente Especialista", 
      mission: magicIdea, 
      type: idea.includes('suporte') ? 'support' : idea.includes('analis') ? 'analyst' : 'chatbot', 
      model: idea.includes('complexo') || idea.includes('avançado') ? 'gpt-4o' : 'claude-haiku-4.5', 
      emoji: idea.includes('suporte') ? '🎧' : idea.includes('venda') ? '💰' : '🤖',
      tools: idea.includes('busca') || idea.includes('internet') ? [{ name: "search", enabled: true }] : [], 
      guardrails: [{ name: "toxicity", enabled: true }],
      system_prompt: `Você é um agente especializado em: ${magicIdea}.\nSua missão é ajudar o usuário da melhor forma possível seguindo as diretrizes de segurança.`
    };
    setMagicPreview(result);
    setIsGeneratingMagic(false);
    toast.success("Plano de agente gerado com sucesso!");
  };

  const readiness = useMemo(() => {
    if (!magicPreview) return null;
    return computeReadinessScore(magicPreview);
  }, [magicPreview]);

  const confirmMagicCreate = async () => {
    if (user && magicPreview) {
      // Option A: Save and go to dashboard
      // await supabaseExternal.from("agents").insert({ user_id: user.id, name: magicPreview.name, status: "draft" });
      // navigate("/agents");
      
      // Option B: Go to Assisted Creation with these values (satisfies "automate filling wizard steps")
      setMode("quick");
    }
  };

  if (mode === "quick") {
    return (
      <QuickCreateWizard 
        onBack={() => setMode("choose")} 
        initialData={magicPreview ? {
          name: magicPreview.name,
          emoji: magicPreview.emoji || "🤖",
          mission: magicPreview.mission,
          description: `Agente gerado magicamente para: ${magicPreview.mission}`,
          type: magicPreview.type,
          model: magicPreview.model,
          prompt: magicPreview.system_prompt
        } : undefined}
      />
    );
  }

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-8">
      {mode === "choose" && (
        <>
          <div className="text-center space-y-4">
            <h1 className="text-3xl font-bold">Criação de Agente</h1>
            <p className="text-muted-foreground">Escolha um modo de criação</p>
          </div>
          
          <Card className="p-6 bg-gradient-to-br from-primary/5 to-background border-primary/20">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="text-primary" />
              <h3 className="font-bold">Geração Mágica</h3>
            </div>
            <div className="flex gap-2">
              <Input value={magicIdea} onChange={e => setMagicIdea(e.target.value)} placeholder="Descreva seu agente..." />
              <Button onClick={handleMagicCreate} disabled={isGeneratingMagic}>{isGeneratingMagic ? <Loader2 className="animate-spin" /> : <Wand2 />}</Button>
            </div>
            {magicPreview && readiness && (
              <div className="mt-4 p-4 border rounded-xl bg-background/50 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="text-primary h-4 w-4" />
                    <p className="font-bold">{magicPreview.name}</p>
                  </div>
                  <Badge className={READINESS_COLORS[readiness.level].bg + " " + READINESS_COLORS[readiness.level].text}>
                    {readiness.score}/10 {READINESS_COLORS[readiness.level].label}
                  </Badge>
                </div>
                <p className="text-sm italic mb-4">"{magicPreview.mission}"</p>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setMagicPreview(null)}>Descartar</Button>
                  <Button size="sm" onClick={confirmMagicCreate} className="gap-1.5"><Check className="h-4 w-4" /> Finalizar</Button>
                </div>
              </div>
            )}
          </Card>

          <div className="grid grid-cols-3 gap-4">
            <Button onClick={() => setMode("quick")} variant="outline" className="h-32 flex flex-col gap-2">
              <Zap className="h-6 w-6 text-nexus-amber" />
              <span>Criação Assistida</span>
            </Button>
            <Button onClick={() => setMode("template")} variant="outline" className="h-32 flex flex-col gap-2">
              <LayoutTemplate className="h-6 w-6 text-primary" />
              <span>Blueprints</span>
            </Button>
            <Button onClick={() => setMode("scratch")} variant="outline" className="h-32 flex flex-col gap-2">
              <PenTool className="h-6 w-6 text-muted-foreground" />
              <span>Custom Total</span>
            </Button>
          </div>
        </>
      )}

      {mode === "template" && (
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => setMode("choose")}>Voltar</Button>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar blueprints..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map(c => <Badge key={c} className="cursor-pointer" onClick={() => setSelectedCategory(c)} variant={selectedCategory === c ? "default" : "secondary"}>{c} ({categoryCount[c]})</Badge>)}
          </div>
          <div className="grid grid-cols-3 gap-4">
            {filteredTemplates.map(t => (
              <Card key={t.id} className="p-4 cursor-pointer hover:border-primary transition-colors" onClick={() => handleTemplateClick(t)}>
                <div className="flex items-center gap-3"><span className="text-2xl">{t.emoji}</span><div className="font-medium text-sm">{t.name}</div></div>
                <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{t.description}</p>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Dialog open={isTemplateModalOpen} onOpenChange={setIsTemplateModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">{viewingTemplate?.emoji} {viewingTemplate?.name}</DialogTitle>
            <DialogDescription>{viewingTemplate?.description}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="flex items-center gap-2 text-sm"><Brain className="h-4 w-4 text-primary" /> {viewingTemplate?.model}</div>
            <div className="flex items-center gap-2 text-sm"><Wrench className="h-4 w-4 text-primary" /> {viewingTemplate?.tools?.length} ferramentas</div>
            <div className="flex items-center gap-2 text-sm"><ShieldAlert className="h-4 w-4 text-primary" /> Guardrails ativos</div>
            <div className="flex items-center gap-2 text-sm"><Info className="h-4 w-4 text-primary" /> Alta Eficiência</div>
          </div>
          <DialogFooter>
            <Button onClick={() => viewingTemplate && applyTemplate(viewingTemplate)}>Ativar Blueprint</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}