import { PageHeader } from '@/components/shared/PageHeader';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  Loader2,
  Wrench,
  Globe,
  Database,
  Mail,
  FileSearch,
  Code,
  Webhook,
  Plus,
  Trash2,
  Cpu,
  Zap,
  Activity,
  Network,
  Puzzle,
  LayoutGrid,
  List,
  Filter,
  ArrowUpRight,
} from 'lucide-react';
import { AccessControl, DangerousActionDialog } from '@/components/rbac';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listToolIntegrations,
  createToolIntegration,
  toggleToolIntegration,
  deleteToolIntegration,
} from '@/services/toolsService';
import { getWorkspaceId } from '@/lib/agentService';

import { toast } from 'sonner';
import { MCPServerManager } from '@/components/integrations/MCPServerManager';
import { Bitrix24Connect } from '@/components/integrations/Bitrix24Connect';
import { Bitrix24ApiTester } from '@/components/integrations/Bitrix24ApiTester';
import { Bitrix24WebhookPanel } from '@/components/integrations/Bitrix24WebhookPanel';
import { WhatsAppWebhookPanel } from '@/components/integrations/WhatsAppWebhookPanel';
import { ProductMockupPanel } from '@/components/tools/ProductMockupPanel';
import { ImageAnalysisDialog } from '@/components/tools/ImageAnalysisDialog';
import { SKILL_CATEGORIES } from '@/services/skillsRegistryService';
import { Progress } from '@/components/ui/progress';

const builtInTools = [
  {
    name: 'Web Search',
    category: 'Pesquisa',
    icon: Globe,
    desc: 'Busca na web em tempo real com filtragem de conteúdo',
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    latency: '142ms',
  },
  {
    name: 'Knowledge Search',
    category: 'RAG',
    icon: FileSearch,
    desc: 'Busca semântica avançada em bases vetoriais',
    color: 'text-purple-500',
    bg: 'bg-purple-500/10',
    latency: '24ms',
  },
  {
    name: 'SQL Query',
    category: 'Database',
    icon: Database,
    desc: 'Consultas otimizadas com guardrails de segurança',
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    latency: '8ms',
  },
  {
    name: 'Email Service',
    category: 'Comunicação',
    icon: Mail,
    desc: 'Envio transacional com templates dinâmicos',
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    latency: '85ms',
  },
  {
    name: 'Code Sandbox',
    category: 'Código',
    icon: Code,
    desc: 'Execução isolada de Python e Node.js em containers',
    color: 'text-cyan-500',
    bg: 'bg-cyan-500/10',
    latency: '310ms',
  },
  {
    name: 'Neural Webhook',
    category: 'Integração',
    icon: Webhook,
    desc: 'Requisições HTTP adaptativas com retry exponencial',
    color: 'text-orange-500',
    bg: 'bg-orange-500/10',
    latency: '62ms',
  },
];

const iconMap: Record<string, React.ElementType> = {
  api: Globe,
  webhook: Webhook,
  database: Database,
  custom: Wrench,
};

export default function ToolsPage() {
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const queryClient = useQueryClient();
  const [newToolOpen, setNewToolOpen] = useState(false);
  const [toolName, setToolName] = useState('');
  const [toolDesc, setToolDesc] = useState('');
  const [toolType, setToolType] = useState('api');
  const [saving, setSaving] = useState(false);

  // Tool integrations from DB
  const { data: toolIntegrations = [], isLoading } = useQuery({
    queryKey: ['tool_integrations'],
    queryFn: listToolIntegrations,
  });

  const handleCreateTool = async () => {
    if (!toolName.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }
    setSaving(true);
    try {
      const wsId = await getWorkspaceId();
      await createToolIntegration({
        workspaceId: wsId,
        name: toolName,
        description: toolDesc,
        type: toolType,
      });
      toast.success('Capacidade integrada com sucesso!');
      setNewToolOpen(false);
      setToolName('');
      setToolDesc('');
      queryClient.invalidateQueries({ queryKey: ['tool_integrations'] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Falha na integração');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleTool = async (id: string, enabled: boolean) => {
    try {
      await toggleToolIntegration(id, enabled);
      toast.success(enabled ? 'Ferramenta ativada' : 'Ferramenta desativada');
      queryClient.invalidateQueries({ queryKey: ['tool_integrations'] });
    } catch (e: unknown) {
      toast.error('Erro ao atualizar estado');
    }
  };

  const handleDeleteTool = async (id: string) => {
    try {
      await deleteToolIntegration(id);
      toast.success('Integração descontinuada');
      queryClient.invalidateQueries({ queryKey: ['tool_integrations'] });
    } catch (e: unknown) {
      toast.error('Erro ao remover integração');
    }
  };

  const allItems = [
    ...builtInTools.map((t) => ({ ...t, built_in: true, id: t.name, is_enabled: true })),
    ...toolIntegrations.map((t) => ({
      name: t.name,
      category: t.type,
      icon: iconMap[t.type] || Wrench,
      desc: t.description || 'Integração customizada ativa',
      built_in: false,
      id: t.id,
      is_enabled: t.is_enabled ?? true,
      color: 'text-primary',
      bg: 'bg-primary/10',
      latency: '---',
    })),
  ];

  const filtered = allItems.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.category.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-8 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <PageHeader
          title="Mesh de Ferramentas & Capacidades"
          description="Orquestre as habilidades cognitivas e integrações sistêmicas dos seus agentes"
          actions={
            <div className="flex items-center gap-3">
              <AccessControl permission="tools.read">
                <ImageAnalysisDialog />
              </AccessControl>
              <Dialog open={newToolOpen} onOpenChange={setNewToolOpen}>
                <DialogTrigger asChild>
                  <Button className="nexus-gradient-bg text-primary-foreground gap-2 shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all">
                    <Plus className="h-4 w-4" /> Nova Capacidade
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[420px] bg-card/95 backdrop-blur-xl border-border/40">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Puzzle className="h-5 w-5 text-primary" /> Forjar Nova Ferramenta
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <Label className="text-meta uppercase tracking-wider text-muted-foreground font-bold">Identificador da Ferramenta</Label>
                      <Input
                        value={toolName}
                        onChange={(e) => setToolName(e.target.value)}
                        className="bg-background/50 border-border/40 focus:border-primary/40"
                        placeholder="Ex: Customer_Insight_Sync"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-meta uppercase tracking-wider text-muted-foreground font-bold">Resumo Operacional</Label>
                      <Input
                        value={toolDesc}
                        onChange={(e) => setToolDesc(e.target.value)}
                        className="bg-background/50 border-border/40 focus:border-primary/40"
                        placeholder="Descreva o que esta tool faz"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-meta uppercase tracking-wider text-muted-foreground font-bold">Protocolo de Conexão</Label>
                      <Select value={toolType} onValueChange={setToolType}>
                        <SelectTrigger className="bg-background/50 border-border/40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="api">REST API (JSON/Standard)</SelectItem>
                          <SelectItem value="webhook">Real-time Webhook</SelectItem>
                          <SelectItem value="database">Direct DB Connection</SelectItem>
                          <SelectItem value="custom">Custom SDK/MCP</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      onClick={handleCreateTool}
                      disabled={saving}
                      className="w-full nexus-gradient-bg text-primary-foreground h-11"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Zap className="h-4 w-4 mr-2" />} 
                      Integrar ao Ecossistema
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          }
        />
        <div className="flex gap-2 mb-2">
          <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 gap-1.5 py-1 px-3">
            <Cpu className="h-3 w-3" /> Runtime: Active
          </Badge>
          <Badge variant="outline" className="bg-nexus-emerald/5 text-nexus-emerald border-nexus-emerald/20 gap-1.5 py-1 px-3">
            <Activity className="h-3 w-3" /> 1.2k req/min
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <div className="xl:col-span-3 space-y-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Filtrar capacidades cognitivas..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 bg-card/50 border-border/40 focus:ring-primary/20"
                />
              </div>
              <div className="flex border border-border/40 rounded-lg p-1 bg-card/50">
                <Button 
                  variant={viewMode === 'grid' ? 'secondary' : 'ghost'} 
                  size="icon" className="h-8 w-8" 
                  onClick={() => setViewMode('grid')}
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button 
                  variant={viewMode === 'list' ? 'secondary' : 'ghost'} 
                  size="icon" className="h-8 w-8" 
                  onClick={() => setViewMode('list')}
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="text-meta gap-1.5 border-border/40">
                <Filter className="h-3.5 w-3.5" /> Categorias
              </Button>
              <Button variant="outline" size="sm" className="text-meta gap-1.5 border-border/40">
                <Activity className="h-3.5 w-3.5" /> Performance
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-40 gap-4">
              <div className="relative">
                <div className="h-12 w-12 rounded-full border-t-2 border-primary animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Wrench className="h-4 w-4 text-primary/50" />
                </div>
              </div>
              <p className="text-body-sm text-muted-foreground animate-pulse font-mono uppercase tracking-widest">Sincronizando mesh de ferramentas...</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map((tool) => (
                <div key={tool.id} className="nexus-card group hover:border-primary/40 transition-all hover:shadow-2xl hover:shadow-primary/5 p-0 overflow-hidden flex flex-col">
                  <div className="p-5 flex-1">
                    <div className="flex items-center justify-between mb-4">
                      <div className={`h-11 w-11 rounded-2xl ${tool.bg} flex items-center justify-center border border-border/20 group-hover:scale-110 transition-transform`}>
                        <tool.icon className={`h-5 w-5 ${tool.color}`} />
                      </div>
                      <div className="flex items-center gap-2">
                        {tool.built_in && (
                          <Badge className="bg-primary/10 text-primary border-none text-[8px] uppercase tracking-widest h-5">Core</Badge>
                        )}
                        {!tool.built_in && (
                          <Switch
                            checked={tool.is_enabled}
                            onCheckedChange={(v) => handleToggleTool(tool.id, v)}
                            className="data-[state=checked]:bg-nexus-emerald scale-75"
                          />
                        )}
                      </div>
                    </div>
                    
                    <div className="space-y-1 mb-3">
                      <h3 className="text-body-sm font-bold text-foreground group-hover:text-primary transition-colors truncate">{tool.name}</h3>
                      <p className="text-meta text-muted-foreground uppercase tracking-tight">{tool.category}</p>
                    </div>
                    
                    <p className="text-meta text-muted-foreground line-clamp-2 h-8 leading-relaxed mb-4">{tool.desc}</p>
                    
                    <div className="flex items-center justify-between pt-4 border-t border-border/20">
                      <div className="flex items-center gap-1.5">
                        <Activity className="h-3 w-3 text-muted-foreground" />
                        <span className="text-meta font-mono text-muted-foreground">{tool.latency}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="h-1 w-1 rounded-full bg-nexus-emerald" />
                        <span className="text-meta text-nexus-emerald uppercase font-bold">Stable</span>
                      </div>
                    </div>
                  </div>

                  {!tool.built_in && (
                    <div className="bg-secondary/10 px-5 py-3 border-t border-border/30 flex items-center justify-between">
                      <Button variant="ghost" size="sm" className="h-7 text-meta font-bold uppercase tracking-wider p-0 hover:bg-transparent hover:text-primary">
                        Configurar <ArrowUpRight className="h-3 w-3 ml-1" />
                      </Button>
                      <AccessControl permission="agents.delete">
                        <DangerousActionDialog
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/5"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          }
                          title="Desvincular Integração"
                          description="Esta ferramenta será removida do catálogo global. Todos os agentes vinculados perderão esta capacidade operacional."
                          action="delete"
                          resourceType="tool_integration"
                          resourceId={tool.id}
                          resourceName={tool.name}
                          minReasonLength={8}
                          confirmLabel="Remover do Mesh"
                          onConfirm={async () => await handleDeleteTool(tool.id)}
                        />
                      </AccessControl>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="nexus-card p-0 overflow-hidden border-border/40">
              <table className="w-full text-left">
                <thead className="bg-secondary/30 border-b border-border/40">
                  <tr>
                    <th className="px-6 py-3 text-meta font-bold text-muted-foreground uppercase tracking-widest">Capacidade</th>
                    <th className="px-6 py-3 text-meta font-bold text-muted-foreground uppercase tracking-widest">Protocolo / Tipo</th>
                    <th className="px-6 py-3 text-meta font-bold text-muted-foreground uppercase tracking-widest">Latência</th>
                    <th className="px-6 py-3 text-meta font-bold text-muted-foreground uppercase tracking-widest">Status</th>
                    <th className="px-6 py-3 text-meta font-bold text-muted-foreground uppercase tracking-widest text-right">Controle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {filtered.map((tool) => (
                    <tr key={tool.id} className="hover:bg-primary/5 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`h-8 w-8 rounded-lg ${tool.bg} flex items-center justify-center shrink-0`}>
                            <tool.icon className={`h-4 w-4 ${tool.color}`} />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-body-sm font-semibold">{tool.name}</span>
                            <span className="text-meta text-muted-foreground line-clamp-1">{tool.desc}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant="outline" className="text-meta font-mono border-border/40">{tool.category}</Badge>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-meta font-mono text-muted-foreground">{tool.latency}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-1.5 rounded-full bg-nexus-emerald shadow-[0_0_4px_rgba(16,185,129,0.5)]" />
                          <span className="text-meta text-foreground font-medium">Nominal</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {!tool.built_in ? (
                          <div className="flex items-center justify-end gap-2">
                            <Switch
                              checked={tool.is_enabled}
                              onCheckedChange={(v) => handleToggleTool(tool.id, v)}
                              className="scale-75"
                            />
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary">
                              <ArrowUpRight className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-meta text-muted-foreground uppercase font-bold tracking-tighter">System Core</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="nexus-card bg-primary/5 border-primary/20 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-meta font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                <Network className="h-4 w-4" /> Mesh Health
              </h4>
              <Badge className="bg-nexus-emerald/10 text-nexus-emerald border-none text-[9px]">Optimal</Badge>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex justify-between text-meta font-bold uppercase tracking-tight">
                  <span>Throughput Global</span>
                  <span className="text-primary">98.4%</span>
                </div>
                <Progress value={98} className="h-1 bg-primary/10" />
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-meta font-bold uppercase tracking-tight">
                  <span>Segurança das Chamadas</span>
                  <span className="text-nexus-emerald">100% AES-256</span>
                </div>
                <Progress value={100} className="h-1 bg-nexus-emerald/10" />
              </div>
            </div>
            <p className="text-meta text-muted-foreground leading-relaxed">
              Monitoramento granular de latência e payloads ativos em 128 endpoints.
            </p>
          </div>

          <div className="nexus-card p-5 space-y-4">
            <h4 className="text-meta font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Puzzle className="h-4 w-4" /> Skills Marketplace
            </h4>
            <p className="text-meta text-muted-foreground leading-relaxed mb-4">
              Instale pacotes de habilidades cognitivas pré-configuradas para resposta imediata.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {SKILL_CATEGORIES.slice(0, 4).map((cat) => (
                <div
                  key={cat.id}
                  className="bg-secondary/20 rounded-xl p-3 text-center cursor-pointer hover:border-primary/40 border border-border/10 transition-all hover:bg-secondary/40 group"
                >
                  <div className="text-xl mb-1 group-hover:scale-110 transition-transform">{cat.icon}</div>
                  <div className="text-[9px] font-bold text-foreground uppercase tracking-tighter truncate">{cat.name}</div>
                </div>
              ))}
            </div>
            <Button variant="outline" className="w-full text-meta h-8 border-border/40 hover:bg-primary/5 mt-2 font-bold uppercase tracking-widest">
              Explorar Store
            </Button>
          </div>

          <div className="nexus-card p-5 space-y-4 bg-gradient-to-br from-secondary/50 to-background border-border/40">
            <h4 className="text-meta font-bold uppercase tracking-widest text-muted-foreground">Últimos Eventos</h4>
            <div className="space-y-3">
              {[
                { label: 'Bitrix24_Sync', event: 'Webhook Received', time: '2m ago' },
                { label: 'Web_Search', event: 'Search Executed', time: '14m ago' },
                { label: 'Email_Service', event: 'Quota Threshold', time: '1h ago' },
              ].map((ev, i) => (
                <div key={i} className="flex flex-col border-l-2 border-primary/20 pl-3 py-0.5">
                  <div className="flex justify-between items-center">
                    <span className="text-meta font-bold text-foreground truncate max-w-[100px]">{ev.label}</span>
                    <span className="text-[9px] text-muted-foreground">{ev.time}</span>
                  </div>
                  <span className="text-meta text-muted-foreground">{ev.event}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="nexus-card bg-card/50 backdrop-blur-sm border-border/40 p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-border/40 pb-4">
            <div>
              <h3 className="text-title-sm font-bold text-foreground">Conectores Enterprise</h3>
              <p className="text-meta text-muted-foreground">Pontes de dados de alto volume e CRM Sync</p>
            </div>
            <Badge variant="outline" className="border-primary/30 text-primary">Priority</Badge>
          </div>
          <div className="space-y-6">
            <AccessControl permission="integrations.write">
              <Bitrix24Connect />
            </AccessControl>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Bitrix24WebhookPanel />
              <WhatsAppWebhookPanel />
            </div>
            <AccessControl permission="integrations.read">
              <Bitrix24ApiTester />
            </AccessControl>
          </div>
        </div>

        <div className="space-y-6">
          <div className="nexus-card bg-card/50 backdrop-blur-sm border-border/40 p-6">
            <MCPServerManager />
          </div>
          
          <AccessControl permission="tools.write">
            <ProductMockupPanel />
          </AccessControl>
        </div>
      </div>
    </div>
  );
}

