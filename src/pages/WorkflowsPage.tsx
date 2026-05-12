import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Play, LayoutGrid, Network, Calendar, Search, Activity, Zap, Layers, Sparkles, Loader2, ArrowRightLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { workflowSchema } from '@/lib/validations/agentSchema';
import {
  listWorkflows as listWorkflowsService,
  saveWorkflow as saveWorkflowService,
  deleteWorkflow as deleteWorkflowService,
  toggleWorkflowStatus,
  executeWorkflowStream,
} from '@/services/workflowsService';
import { AccessControl } from '@/components/rbac/AccessControl';
import { WorkflowCanvasTab } from '@/components/workflows/WorkflowCanvasTab';
import { WorkflowListTab } from '@/components/workflows/WorkflowListTab';
import { WorkflowRunsHistory } from '@/components/workflows/WorkflowRunsHistory';
import { WorkflowSchedulerTab } from '@/components/workflows/WorkflowSchedulerTab';
import { WorkflowHandoffVisualizer } from '@/components/workflows/WorkflowHandoffVisualizer';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

interface Workflow {
  id: string;
  name: string;
  steps: string[];
  status: 'draft' | 'active';
  createdAt: string;
}

const defaultTemplates: Workflow[] = [
  { id: 't1', name: 'Atendimento ao Cliente', steps: ['Classificar', 'Buscar KB', 'Responder', 'Escalar se necessário', 'Registrar'], status: 'active', createdAt: '2026-03-28' },
  { id: 't2', name: 'Prospecção Outbound', steps: ['Novo lead', 'Enriquecer perfil', 'Pesquisar empresa', 'Gerar email', 'Enviar', 'CRM update'], status: 'active', createdAt: '2026-03-27' },
  { id: 't3', name: 'Due Diligence', steps: ['Receber caso', 'Buscar regulamentação', 'Analisar documentos', 'Gerar parecer', 'Aprovação humana'], status: 'draft', createdAt: '2026-03-26' },
  { id: 't4', name: 'Suporte Técnico L2', steps: ['Triagem', 'Diagnóstico', 'Code analysis', 'Solução', 'Validar', 'Documentar'], status: 'draft', createdAt: '2026-03-25' },
];

export default function WorkflowsPage() {
  const queryClient = useQueryClient();
  const { data: workflows = defaultTemplates } = useQuery({
    queryKey: ['workflows_list'],
    queryFn: async () => {
      try {
        const wfs = await listWorkflowsService();
        if (wfs.length === 0) return defaultTemplates;
        return wfs.map((w) => ({
          id: w.id, name: w.name,
          steps: w.nodes.map((n) => String(n.data?.label || n.type)),
          status: (w.status as 'draft' | 'active') ?? 'draft',
          createdAt: w.created_at ? new Date(w.created_at).toISOString().split('T')[0] : '',
        }));
      } catch { return defaultTemplates; }
    },
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSteps, setNewSteps] = useState('');
  const [executing, setExecuting] = useState<string | null>(null);
  const [currentEvent, setCurrentEvent] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const handleCreate = async () => {
    const steps = newSteps.split(',').map((s) => s.trim()).filter(Boolean);
    const result = workflowSchema.safeParse({ name: newName, steps });
    if (!result.success) { toast.error(result.error.errors[0]?.message || 'Dados inválidos'); return; }
    try {
      await saveWorkflowService({
        name: newName.trim(), status: 'draft',
        nodes: steps.map((name, i) => ({ id: `step_${i}`, type: 'executor', position: { x: i * 200, y: 100 }, data: { label: name } })),
        edges: steps.slice(1).map((_, i) => ({ id: `e_${i}`, source: `step_${i}`, target: `step_${i + 1}` })),
      });
      toast.success('Workflow salvo no banco!');
      setDialogOpen(false); setNewName(''); setNewSteps('');
      queryClient.invalidateQueries({ queryKey: ['workflows_list'] });
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Erro inesperado'); }
  };

  const handleDelete = async (id: string) => {
    if (id.includes('-')) { try { await deleteWorkflowService(id); } catch { /* template */ } queryClient.invalidateQueries({ queryKey: ['workflows_list'] }); }
    toast.success('Workflow removido');
  };

  const handleToggleStatus = async (id: string) => {
    if (id.includes('-')) {
      const wf = workflows.find((w) => w.id === id);
      if (wf) { await toggleWorkflowStatus(id, wf.status); queryClient.invalidateQueries({ queryKey: ['workflows_list'] }); }
    }
  };

  const handleExecute = async (wf: Workflow) => {
    setExecuting(wf.id);
    setCurrentEvent(null);
    try {
      await executeWorkflowStream(wf.id, `Iniciando workflow ${wf.name}`, (event) => {
        setCurrentEvent(event);
        if (event.event === 'node_start') {
          toast.info(`Iniciando etapa: ${event.label}`, { duration: 1500 });
        }
        if (event.event === 'run_completed') {
          toast.success(`Workflow "${wf.name}" concluído com sucesso!`);
          setExecuting(null);
          queryClient.invalidateQueries({ queryKey: ['workflow_runs'] });
        }
        if (event.event === 'error') {
          toast.error(`Erro no workflow: ${event.message}`);
          setExecuting(null);
        }
      });
    } catch (e: unknown) { 
      toast.error(e instanceof Error ? e.message : 'Erro inesperado'); 
      setExecuting(null);
    }
  };

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-8 max-w-[1440px] mx-auto animate-page-enter">
      {/* Header Elevated 10/10 */}
      <div className="bg-gradient-to-br from-card to-card/50 border border-border/40 p-10 rounded-[2.5rem] shadow-xl shadow-primary/5 mb-10 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/[0.04] rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2 group-hover:bg-primary/[0.06] transition-colors duration-500 pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 relative">
          <div className="flex items-center gap-7">
            <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20 shadow-2xl shadow-primary/10 group-hover:scale-105 transition-transform duration-500">
              <Network className="h-11 w-11 text-primary animate-float" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h1 className="text-4xl font-heading font-black text-foreground tracking-tight sm:text-5xl">Workflows</h1>
                <Badge className="bg-primary/10 text-primary border-none font-bold px-3 py-1 rounded-full text-xs">BETA</Badge>
              </div>
              <p className="text-base text-muted-foreground max-w-xl font-medium leading-relaxed">
                Desenhe arquiteturas multi-agente complexas com orquestração streaming em tempo real.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <AccessControl permission="workflows.create">
                  <Button className="nexus-gradient-bg text-primary-foreground gap-2.5 h-12 px-8 rounded-2xl shadow-xl shadow-primary/25 hover:scale-[1.03] active:scale-[0.98] transition-all duration-300 group">
                    <Plus className="h-5 w-5 group-hover:rotate-90 transition-transform duration-300" /> 
                    <span className="font-bold text-lg tracking-tight">Novo Workflow</span>
                  </Button>
                </AccessControl>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[480px] rounded-[2rem] border-border/40 shadow-2xl">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-heading font-black">Orquestrar Novo Fluxo</DialogTitle>
                </DialogHeader>
                <div className="space-y-6 mt-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Nome do Workflow</Label>
                    <Input 
                      value={newName} 
                      onChange={(e) => setNewName(e.target.value)} 
                      placeholder="Ex: Pipeline de Onboarding" 
                      className="h-12 rounded-xl bg-secondary/30 border-border/30 focus:ring-primary/20" 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Nodos Iniciais</Label>
                    <Input 
                      value={newSteps} 
                      onChange={(e) => setNewSteps(e.target.value)} 
                      placeholder="Classificar, Processar, Validar, Notificar" 
                      className="h-12 rounded-xl bg-secondary/30 border-border/30 focus:ring-primary/20" 
                    />
                  </div>
                  <Button onClick={handleCreate} className="w-full h-12 nexus-gradient-bg text-primary-foreground rounded-xl font-bold text-lg shadow-lg shadow-primary/20">
                    Instanciar Workflow
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {executing && (
        <Card className="p-6 rounded-[2rem] border-primary/30 bg-primary/5 animate-in fade-in slide-in-from-top-4 duration-500 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold flex items-center gap-2 text-primary">
              <Loader2 className="h-5 w-5 animate-spin" />
              Executando Workflow: {workflows.find(w => w.id === executing)?.name}
            </h3>
            <Badge variant="outline" className="animate-pulse bg-primary/10 text-primary border-primary/20">LIVE STREAMING</Badge>
          </div>
          <div className="flex items-center gap-4">
             <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-primary animate-progress-indeterminate w-1/3" />
             </div>
             <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
               {currentEvent?.label || 'Iniciando...'}
             </span>
          </div>
          {currentEvent?.output && (
            <div className="mt-4 p-4 rounded-xl bg-card border border-border/40 font-mono text-xs max-h-40 overflow-y-auto">
              <p className="text-muted-foreground mb-2 italic">// Último output:</p>
              {typeof currentEvent.output === 'string' ? currentEvent.output : JSON.stringify(currentEvent.output, null, 2)}
            </div>
          )}
        </Card>
      )}

      {/* Workflow Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[
          { label: 'Fluxos Ativos', value: workflows.filter(w => w.status === 'active').length, icon: Zap, color: 'text-nexus-cyan', bg: 'bg-nexus-cyan/10' },
          { label: 'Etapas Totais', value: workflows.reduce((acc, w) => acc + w.steps.length, 0), icon: Layers, color: 'text-nexus-purple', bg: 'bg-nexus-purple/10' },
          { label: 'Execuções (24h)', value: 124, icon: Activity, color: 'text-nexus-emerald', bg: 'bg-nexus-emerald/10' },
          { label: 'Taxa de Sucesso', value: '99.4%', icon: Sparkles, color: 'text-nexus-amber', bg: 'bg-nexus-amber/10' },
        ].map((stat, i) => (
          <div key={i} className="bg-card border border-border/40 p-6 rounded-[2rem] flex items-center gap-5 hover:border-primary/20 transition-all group">
            <div className={cn("h-14 w-14 rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform", stat.bg)}>
              <stat.icon className={cn("h-7 w-7", stat.color)} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{stat.label}</p>
              <p className="text-2xl font-black text-foreground">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-muted-foreground" />
          <Input 
            placeholder="Buscar por nome de workflow..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-11 rounded-2xl bg-card border-border/40"
          />
        </div>
      </div>

      <Tabs defaultValue="canvas" className="space-y-6">
        <TabsList className="bg-muted/50 p-1.5 rounded-2xl border border-border/40 h-auto flex-wrap sm:flex-nowrap gap-1">
          <TabsTrigger value="canvas" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-card data-[state=active]:shadow-sm gap-2 font-bold">
            <Network className="h-4 w-4" /> Canvas Visual
          </TabsTrigger>
          <TabsTrigger value="list" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-card data-[state=active]:shadow-sm gap-2 font-bold">
            <LayoutGrid className="h-4 w-4" /> Lista Global
          </TabsTrigger>
          <TabsTrigger value="runs" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-card data-[state=active]:shadow-sm gap-2 font-bold">
            <Play className="h-4 w-4" /> Histórico de Runs
          </TabsTrigger>
          <TabsTrigger value="schedule" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-card data-[state=active]:shadow-sm gap-2 font-bold">
            <Calendar className="h-4 w-4" /> Agendamentos
          </TabsTrigger>
          <TabsTrigger value="handoffs" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-card data-[state=active]:shadow-sm gap-2 font-bold">
            <ArrowRightLeft className="h-4 w-4" /> Handoffs
          </TabsTrigger>
        </TabsList>

        <div className="min-h-[600px] bg-card/30 border border-border/40 rounded-[2.5rem] p-4">
          <TabsContent value="canvas" className="m-0 h-full"><WorkflowCanvasTab /></TabsContent>
          <TabsContent value="list" className="m-0">
            <WorkflowListTab 
              workflows={workflows.filter(w => w.name.toLowerCase().includes(searchTerm.toLowerCase()))} 
              executing={executing} 
              onToggleStatus={handleToggleStatus} 
              onExecute={handleExecute} 
              onDelete={handleDelete} 
            />
          </TabsContent>
          <TabsContent value="runs" className="m-0"><WorkflowRunsHistory /></TabsContent>
          <TabsContent value="schedule" className="m-0">
            <WorkflowSchedulerTab workflows={workflows.map(w => ({ id: w.id, name: w.name }))} />
          </TabsContent>
          <TabsContent value="handoffs" className="m-0"><WorkflowHandoffVisualizer /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
