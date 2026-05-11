import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
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
  Check, Loader2, Brain, Wrench, ShieldAlert, Info, Wand2, Sparkles, TrendingUp, Zap, LayoutTemplate, PenTool
} from "lucide-react";
import { toast } from "sonner";
import { supabaseExternal } from "@/integrations/supabase/externalClient";
import { useAuth } from "@/contexts/AuthContext";
import { AGENT_TEMPLATES as STATIC_TEMPLATES, type AgentTemplate } from "@/data/agentTemplates";
import { QuickCreateWizard } from "./wizard/QuickCreateWizard";
import { computeReadinessScore, READINESS_COLORS } from "@/lib/agentReadiness";

type WizardMode = "choose" | "template" | "scratch" | "quick";

export function CreateAgentWizard() {
  const navigate = useNavigate();
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
    await new Promise(r => setTimeout(r, 1000));
    setMagicPreview({ name: "Agente Mágico", mission: magicIdea, type: "chatbot", model: "gpt-4o", tools: ["search"], memory: ["short"] });
    setIsGeneratingMagic(false);
  };

  const confirmMagicCreate = async () => {
    if (user) {
      await supabaseExternal.from("agents").insert({ user_id: user.id, name: magicPreview.name, status: "draft" });
      navigate("/agents");
    }
  };

  if (mode === "quick") return <QuickCreateWizard onBack={() => setMode("choose")} />;

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-8">
      {mode === "choose" && (
        <>
          <div className="text-center space-y-4">
            <h1 className="text-3xl font-bold">Criação de Agente</h1>
            <p>Escolha um modo de criação</p>
          </div>
          
          <Card className="p-6">
            <h3 className="mb-4">Geração Mágica</h3>
            <div className="flex gap-2">
              <Input value={magicIdea} onChange={e => setMagicIdea(e.target.value)} />
              <Button onClick={handleMagicCreate} disabled={isGeneratingMagic}>{isGeneratingMagic ? <Loader2 className="animate-spin" /> : <Wand2 />}</Button>
            </div>
            {magicPreview && (
              <div className="mt-4 p-4 border rounded">
                <p><strong>{magicPreview.name}</strong>: {magicPreview.mission}</p>
                <Button onClick={confirmMagicCreate}>Finalizar</Button>
              </div>
            )}
          </Card>

          <div className="grid grid-cols-3 gap-4">
            <Button onClick={() => setMode("quick")}>Assistida</Button>
            <Button onClick={() => setMode("template")}>Blueprints</Button>
            <Button onClick={() => setMode("scratch")}>Custom</Button>
          </div>
        </>
      )}

      {mode === "template" && (
        <div className="grid grid-cols-3 gap-4">
          <Input placeholder="Buscar..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          <div className="flex gap-2">
            {categories.map(c => <Badge key={c} onClick={() => setSelectedCategory(c)}>{c} ({categoryCount[c]})</Badge>)}
          </div>
          {filteredTemplates.map(t => (
            <div key={t.id} className="border p-4 cursor-pointer" onClick={() => handleTemplateClick(t)}>
              {t.emoji} {t.name}
            </div>
          ))}
        </div>
      )}

      <Dialog open={isTemplateModalOpen} onOpenChange={setIsTemplateModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{viewingTemplate?.name}</DialogTitle>
            <DialogDescription>{viewingTemplate?.description}</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Brain /> {viewingTemplate?.model}
            <Wrench /> {viewingTemplate?.tools?.length} ferramentas
            <ShieldAlert /> Guardrails ativados
            <Info /> Impacto: Alta Eficiência
          </div>
          <DialogFooter>
            <Button onClick={() => viewingTemplate && applyTemplate(viewingTemplate)}>Ativar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}