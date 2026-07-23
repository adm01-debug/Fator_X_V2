import { useMemo, useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { InfoHint } from "@/components/shared/InfoHint";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Brain, Search, Network, BookOpen,
  Activity, Users, FlaskConical, Zap, Clock, GitMerge, TrendingDown, Layers, Upload, NotebookPen,
  Plus, FileText, Sparkles, Mic
} from "lucide-react";
import { OverviewTab } from "@/components/super-cerebro/OverviewTab";
import { SearchTab } from "@/components/super-cerebro/SearchTab";
import { DocumentUploadTab } from "@/components/super-cerebro/DocumentUploadTab";
import { KnowledgeAreasTab } from "@/components/super-cerebro/KnowledgeAreasTab";
import { KnowledgeGraphTab } from "@/components/super-cerebro/KnowledgeGraphTab";
import { KnowledgeHealthTab } from "@/components/super-cerebro/KnowledgeHealthTab";
import { AutoExtractionTab } from "@/components/super-cerebro/AutoExtractionTab";
import { ExpertDiscoveryTab } from "@/components/super-cerebro/ExpertDiscoveryTab";
import { BrainSandboxTab } from "@/components/super-cerebro/BrainSandboxTab";
import { TemporalGraphTab } from "@/components/super-cerebro/TemporalGraphTab";
import { EntityResolutionTab } from "@/components/super-cerebro/EntityResolutionTab";
import { DecayDetectionTab } from "@/components/super-cerebro/DecayDetectionTab";
import { ContextTiersTab } from "@/components/super-cerebro/ContextTiersTab";
import { NotebooksTab } from "@/components/super-cerebro/NotebooksTab";
import { NotebookSelector } from "@/components/super-cerebro/NotebookSelector";
import { NotebookWorkspace } from "@/components/super-cerebro/notebook/NotebookWorkspace";
import { CommandPalette } from "@/components/super-cerebro/CommandPalette";
import type { CommandItem } from "@/lib/commands";
import { useCerebroStore } from "@/stores/cerebroStore";
import { useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";
import { createNote } from "@/services/notesService";
import { toast } from "sonner";

export default function SuperCerebroPage() {
  const [activeTab, setActiveTab] = useState('workspace');
  const activeNotebookId = useCerebroStore((s) => s.activeNotebookId);
  const setActiveNote = useCerebroStore((s) => s.setActiveNote);
  const setStudioTab = useCerebroStore((s) => s.setStudioTab);
  const { workspaceId } = useCurrentWorkspace();

  const commands = useMemo<CommandItem[]>(() => {
    const go = (tab: string): CommandItem["run"] => () => setActiveTab(tab);
    const list: CommandItem[] = [
      { id: "goto.workspace", label: "Ir para Workspace", group: "Navegação", icon: NotebookPen, run: go("workspace"), shortcut: "1" },
      { id: "goto.notebooks", label: "Ir para Notebooks", group: "Navegação", icon: NotebookPen, run: go("notebooks") },
      { id: "goto.search", label: "Ir para Busca", group: "Navegação", icon: Search, run: go("search") },
      { id: "goto.upload", label: "Ir para Upload de documentos", group: "Navegação", icon: Upload, run: go("upload") },
      { id: "goto.graph", label: "Abrir Knowledge Graph", group: "Navegação", icon: Network, run: go("graph") },
      { id: "goto.temporal", label: "Grafo Temporal", group: "Navegação", icon: Clock, run: go("temporal") },
      { id: "goto.decay", label: "Detecção de Decay", group: "Navegação", icon: TrendingDown, run: go("decay") },
      { id: "goto.health", label: "Saúde do conhecimento", group: "Navegação", icon: Activity, run: go("health") },
      { id: "goto.tiers", label: "Context Tiers", group: "Navegação", icon: Layers, run: go("tiers") },
      { id: "note.new", label: "Nova nota no notebook ativo", group: "Notas", icon: Plus, keywords: "criar nota nova", run: async () => {
        if (!workspaceId || !activeNotebookId) {
          toast.error("Selecione um notebook primeiro.");
          setActiveTab("workspace");
          return;
        }
        try {
          const n = await createNote({ workspaceId, collectionId: activeNotebookId, title: "Nova nota" });
          setActiveTab("workspace");
          setActiveNote(n.id);
          toast.success("Nota criada");
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Falha ao criar nota");
        }
      } },
      { id: "studio.backlinks", label: "Studio: Backlinks", group: "IA", icon: FileText, run: () => setStudioTab("backlinks") },
      { id: "studio.outline", label: "Studio: Outline (sumário)", group: "IA", icon: FileText, run: () => setStudioTab("outline") },
      { id: "studio.graph", label: "Studio: Grafo local", group: "IA", icon: Network, run: () => setStudioTab("graph") },
      { id: "studio.ai", label: "Studio: IA (resumo, Q&A)", group: "IA", icon: Sparkles, run: () => setStudioTab("studio") },
      { id: "studio.podcast", label: "Studio: Podcast", group: "IA", icon: Mic, run: () => setStudioTab("podcast") },
    ];
    return list;
  }, [workspaceId, activeNotebookId, setActiveNote, setStudioTab]);

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="🧠 Super Cérebro"
        description="Enterprise Memory Layer — Camada de Inteligência e Memória Institucional"
        gradient={false}
      />

      <InfoHint title="O que é o Super Cérebro?">
        O Super Cérebro é a malha de memória neural da organização. Organize o conhecimento em <strong>notebooks temáticos</strong> (Comercial, Jurídico, RH…) para que buscas e agentes fiquem restritos ao contexto correto.
      </InfoHint>

      <div className="flex items-center justify-end">
        <NotebookSelector allowAll />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-secondary/50 border border-border/50 flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="workspace" className="text-meta gap-1.5"><NotebookPen className="h-3.5 w-3.5" /> Workspace</TabsTrigger>
          <TabsTrigger value="notebooks" className="text-meta gap-1.5"><NotebookPen className="h-3.5 w-3.5" /> Notebooks</TabsTrigger>
          <TabsTrigger value="overview" className="text-meta gap-1.5"><Brain className="h-3.5 w-3.5" /> Visão Geral</TabsTrigger>
          <TabsTrigger value="search" className="text-meta gap-1.5"><Search className="h-3.5 w-3.5" /> Busca</TabsTrigger>
          <TabsTrigger value="upload" className="text-meta gap-1.5"><Upload className="h-3.5 w-3.5" /> Upload</TabsTrigger>
          <TabsTrigger value="tiers" className="text-meta gap-1.5"><Layers className="h-3.5 w-3.5" /> Context Tiers</TabsTrigger>
          <TabsTrigger value="knowledge" className="text-meta gap-1.5"><BookOpen className="h-3.5 w-3.5" /> Áreas</TabsTrigger>
          <TabsTrigger value="graph" className="text-meta gap-1.5"><Network className="h-3.5 w-3.5" /> Knowledge Graph</TabsTrigger>
          <TabsTrigger value="temporal" className="text-meta gap-1.5"><Clock className="h-3.5 w-3.5" /> Temporal</TabsTrigger>
          <TabsTrigger value="resolution" className="text-meta gap-1.5"><GitMerge className="h-3.5 w-3.5" /> Entity Resolution</TabsTrigger>
          <TabsTrigger value="decay" className="text-meta gap-1.5"><TrendingDown className="h-3.5 w-3.5" /> Decay</TabsTrigger>
          <TabsTrigger value="health" className="text-meta gap-1.5"><Activity className="h-3.5 w-3.5" /> Saúde</TabsTrigger>
          <TabsTrigger value="extract" className="text-meta gap-1.5"><Zap className="h-3.5 w-3.5" /> Extração</TabsTrigger>
          <TabsTrigger value="experts" className="text-meta gap-1.5"><Users className="h-3.5 w-3.5" /> Especialistas</TabsTrigger>
          <TabsTrigger value="sandbox" className="text-meta gap-1.5"><FlaskConical className="h-3.5 w-3.5" /> Sandbox</TabsTrigger>
        </TabsList>

        <TabsContent value="workspace" className="animate-in fade-in-50 duration-500"><NotebookWorkspace /></TabsContent>
        <TabsContent value="notebooks" className="animate-in fade-in-50 duration-500"><NotebooksTab /></TabsContent>
        <TabsContent value="overview" className="animate-in fade-in-50 duration-500"><OverviewTab /></TabsContent>
        <TabsContent value="search" className="animate-in fade-in-50 duration-500"><SearchTab /></TabsContent>
        <TabsContent value="upload" className="animate-in fade-in-50 duration-500"><DocumentUploadTab /></TabsContent>
        <TabsContent value="tiers" className="animate-in fade-in-50 duration-500"><ContextTiersTab /></TabsContent>
        <TabsContent value="knowledge" className="animate-in fade-in-50 duration-500"><KnowledgeAreasTab /></TabsContent>
        <TabsContent value="graph" className="animate-in fade-in-50 duration-500"><KnowledgeGraphTab /></TabsContent>
        <TabsContent value="temporal" className="animate-in fade-in-50 duration-500"><TemporalGraphTab /></TabsContent>
        <TabsContent value="resolution" className="animate-in fade-in-50 duration-500"><EntityResolutionTab /></TabsContent>
        <TabsContent value="decay" className="animate-in fade-in-50 duration-500"><DecayDetectionTab /></TabsContent>
        <TabsContent value="health" className="animate-in fade-in-50 duration-500"><KnowledgeHealthTab /></TabsContent>
        <TabsContent value="extract" className="animate-in fade-in-50 duration-500"><AutoExtractionTab /></TabsContent>
        <TabsContent value="experts" className="animate-in fade-in-50 duration-500"><ExpertDiscoveryTab /></TabsContent>
        <TabsContent value="sandbox" className="animate-in fade-in-50 duration-500"><BrainSandboxTab /></TabsContent>
      </Tabs>
      <CommandPalette commands={commands} />
    </div>
  );
}
