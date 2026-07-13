import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Palette, Globe, Bell, Key, Save, Server, Share2, Database, Activity, Radio, Cpu, ShieldCheck, Shield } from "lucide-react";
import { MCPServerManager } from "@/components/integrations/MCPServerManager";
import { MCPServersPanel } from "@/components/settings/MCPServersPanel";
import { Bitrix24Connect } from "@/components/integrations/Bitrix24Connect";
import { Bitrix24WebhookPanel } from "@/components/integrations/Bitrix24WebhookPanel";
import { Bitrix24ApiTester } from "@/components/integrations/Bitrix24ApiTester";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { getWorkspace } from "@/services/settingsService";
import { getWorkspaceId } from "@/lib/agentService";
import { useTheme } from "next-themes";
import { EnvironmentsManager } from "@/components/settings/EnvironmentsManager";
import { ApiKeysTab } from "@/components/settings/ApiKeysTab";
import { HuggingFaceTab } from "@/components/settings/HuggingFaceTab";
import { Badge } from "@/components/ui/badge";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [notifications, setNotifications] = useState({ 
    email: true, 
    errors: true, 
    billing: false, 
    weekly: true,
    slack: true,
    webhooks: false
  });

  const { data: workspace } = useQuery({
    queryKey: ['workspace_settings'],
    queryFn: async () => { const wsId = await getWorkspaceId(); return getWorkspace(wsId); },
  });

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-10 max-w-[1440px] mx-auto animate-page-enter">
      {/* Header Elevated 10/10 */}
      <div className="bg-gradient-to-br from-card to-card/50 border border-border/40 p-10 rounded-[2.5rem] shadow-nexus-2xl shadow-primary/5 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/[0.04] rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2 group-hover:bg-primary/[0.06] transition-colors duration-500 pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 relative">
          <div className="flex items-center gap-7">
            <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20 shadow-nexus-2xl shadow-primary/10 group-hover:scale-105 transition-transform duration-500">
              <Cpu className="h-11 w-11 text-primary animate-float" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h1 className="text-4xl font-heading font-black text-foreground tracking-tight sm:text-5xl">Control Center</h1>
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-meta font-bold uppercase tracking-widest border border-primary/20">
                  <Radio className="h-3 w-3 animate-pulse" /> Operational
                </div>
              </div>
              <p className="text-title-sm text-muted-foreground max-w-xl font-medium leading-relaxed">
                Orquestração global do seu ecossistema neural. Gerencie o workspace, infraestrutura e governança de IA.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2 text-nexus-emerald font-black text-body-sm uppercase tracking-tighter">
                <ShieldCheck className="h-4 w-4" /> Nexus Verified
              </div>
              <p className="text-meta text-muted-foreground font-bold tracking-widest uppercase">v1.2.0 Industrial Grade</p>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <div className="flex overflow-x-auto pb-2 scrollbar-hide">
          <TabsList className="bg-secondary/30 border border-border/50 p-1 h-auto flex-nowrap shrink-0">
            <TabsTrigger value="general" className="text-meta gap-1.5 px-3 py-2"><Globe className="h-3.5 w-3.5" /> Geral</TabsTrigger>
            <TabsTrigger value="appearance" className="text-meta gap-1.5 px-3 py-2"><Palette className="h-3.5 w-3.5" /> Aparência</TabsTrigger>
            <TabsTrigger value="apikeys" className="text-meta gap-1.5 px-3 py-2"><Key className="h-3.5 w-3.5" /> API Keys</TabsTrigger>
            <TabsTrigger value="security" className="text-meta gap-1.5 px-3 py-2"><Shield className="h-3.5 w-3.5" /> Segurança</TabsTrigger>
            <TabsTrigger value="notifications" className="text-meta gap-1.5 px-3 py-2"><Bell className="h-3.5 w-3.5" /> Alertas</TabsTrigger>
            <TabsTrigger value="environments" className="text-meta gap-1.5 px-3 py-2"><Activity className="h-3.5 w-3.5" /> Ciclo de Vida</TabsTrigger>
            <TabsTrigger value="huggingface" className="text-meta gap-1.5 px-3 py-2"><Database className="h-3.5 w-3.5" /> Modelos ML</TabsTrigger>
            <TabsTrigger value="mcp" className="text-meta gap-1.5 px-3 py-2"><Server className="h-3.5 w-3.5" /> MCP Servers</TabsTrigger>
            <TabsTrigger value="integrations" className="text-meta gap-1.5 px-3 py-2"><Share2 className="h-3.5 w-3.5" /> Conexões</TabsTrigger>
          </TabsList>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mt-6">
          <div className="lg:col-span-3 space-y-6">
            <TabsContent value="general" className="m-0 focus-visible:outline-none">
              <div className="nexus-card bg-card/50 backdrop-blur-sm border-border/40 p-6 space-y-6">
                <div className="flex items-center justify-between border-b border-border/40 pb-4">
                  <div>
                    <h3 className="text-title-sm font-semibold text-foreground">Identidade do Workspace</h3>
                    <p className="text-meta text-muted-foreground">Configurações globais e identificação da organização</p>
                  </div>
                  <Badge className="bg-primary/10 text-primary border-none hover:bg-primary/20 uppercase tracking-wider text-meta">Enterprise</Badge>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-meta font-medium uppercase tracking-tight text-muted-foreground">Nome da Organização</Label>
                    <Input defaultValue={workspace?.name || 'Nexus Intelligence'} className="bg-background/50 border-border/40 focus:border-primary/40 transition-colors" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-meta font-medium uppercase tracking-tight text-muted-foreground">Status do Plano</Label>
                    <div className="relative">
                      <Input value="Plano Enterprise (Ativo)" disabled className="bg-background/30 border-border/20 text-foreground font-medium" />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-nexus-emerald shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-meta font-medium uppercase tracking-tight text-muted-foreground">Idioma Regional</Label>
                    <Select defaultValue="pt-BR">
                      <SelectTrigger className="bg-background/50 border-border/40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pt-BR">Português (BR)</SelectItem>
                        <SelectItem value="en-US">English (US)</SelectItem>
                        <SelectItem value="es">Español</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-meta font-medium uppercase tracking-tight text-muted-foreground">Fuso Horário Operacional</Label>
                    <Select defaultValue="America/Sao_Paulo">
                      <SelectTrigger className="bg-background/50 border-border/40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="America/Sao_Paulo">São Paulo (UTC-3)</SelectItem>
                        <SelectItem value="America/New_York">New York (UTC-5)</SelectItem>
                        <SelectItem value="Europe/London">London (UTC+0)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="pt-4 flex justify-end gap-3">
                  <Button variant="ghost" size="sm" className="text-meta text-muted-foreground hover:text-foreground">Resetar Alterações</Button>
                  <Button size="sm" className="nexus-gradient-bg text-primary-foreground gap-1.5 px-6 shadow-nexus-lg shadow-primary/10 transition-all hover:scale-[1.02]">
                    <Save className="h-3.5 w-3.5" /> Aplicar Configurações
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="appearance" className="m-0 focus-visible:outline-none">
              <div className="nexus-card bg-card/50 backdrop-blur-sm border-border/40 p-6 space-y-6">
                <div>
                  <h3 className="text-title-sm font-semibold text-foreground">Motor de Renderização e Temas</h3>
                  <p className="text-meta text-muted-foreground">Personalize a interface para máxima eficiência visual</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { value: 'dark', label: 'Modo Escuro (HQ)', icon: '🌙', desc: 'Contraste otimizado para longas sessões' },
                    { value: 'light', label: 'Modo Claro', icon: '☀️', desc: 'Ideal para ambientes externos' },
                    { value: 'system', label: 'Sincronizar OS', icon: '💻', desc: 'Segue as diretrizes do hardware' },
                  ].map(t => (
                    <button 
                      key={t.value} 
                      onClick={() => setTheme(t.value)} 
                      className={`group p-5 rounded-xl border text-left transition-all relative overflow-hidden ${
                        theme === t.value 
                          ? 'border-primary bg-primary/5 shadow-nexus-inner' 
                          : 'border-border/30 bg-background/20 hover:border-border/60 hover:bg-background/40'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-2xl">{t.icon}</span>
                        {theme === t.value && <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />}
                      </div>
                      <p className={`text-body-sm font-bold ${theme === t.value ? 'text-primary' : 'text-foreground'}`}>{t.label}</p>
                      <p className="text-meta text-muted-foreground mt-1 leading-relaxed">{t.desc}</p>
                      {theme === t.value && <div className="absolute bottom-0 right-0 p-1 opacity-20"><Palette className="h-8 w-8 text-primary" /></div>}
                    </button>
                  ))}
                </div>

                <div className="p-4 rounded-lg bg-secondary/10 border border-border/20 flex items-start gap-4">
                  <div className="p-2 bg-primary/10 rounded-full shrink-0"><Palette className="h-4 w-4 text-primary" /></div>
                  <div className="space-y-1">
                    <p className="text-meta font-semibold">Customização Avançada</p>
                    <p className="text-meta text-muted-foreground leading-relaxed">Você pode injetar CSS customizado e definir paletas de cores específicas para sua marca através do módulo de White-label nas configurações de administrador.</p>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="apikeys" className="m-0 focus-visible:outline-none"><ApiKeysTab /></TabsContent>
            <TabsContent value="huggingface" className="m-0 focus-visible:outline-none"><HuggingFaceTab /></TabsContent>
            <TabsContent value="environments" className="m-0 focus-visible:outline-none"><EnvironmentsManager /></TabsContent>
            <TabsContent value="mcp" className="m-0 focus-visible:outline-none"><div className="space-y-6"><MCPServersPanel /><MCPServerManager /></div></TabsContent>
            
            <TabsContent value="notifications" className="m-0 focus-visible:outline-none">
              <div className="nexus-card bg-card/50 backdrop-blur-sm border-border/40 p-6 space-y-6">
                <div>
                  <h3 className="text-title-sm font-semibold text-foreground">Matriz de Notificações e Alertas</h3>
                  <p className="text-meta text-muted-foreground">Defina a prioridade e canais de resposta para eventos críticos</p>
                </div>

                <div className="space-y-2">
                  {[
                    { key: 'errors', label: 'Fail-Safe & Erros Críticos', desc: 'Alertas imediatos quando um agente ou workflow atinge o estado terminal' },
                    { key: 'email', label: 'Digest de Operações', desc: 'Resumo periódico de performance via email para stakeholders' },
                    { key: 'slack', label: 'Slack Webhook Stream', desc: 'Encaminha eventos em tempo real para o canal de monitoramento' },
                    { key: 'billing', label: 'Quota & Budget Guardrails', desc: 'Notificações proativas ao atingir 80% do limite de tokens mensal' },
                    { key: 'webhooks', label: 'External Service Callbacks', desc: 'Aciona URLs externas para automação de resposta a incidentes' },
                  ].map(n => (
                    <div key={n.key} className="flex items-center justify-between p-4 rounded-lg bg-background/20 border border-border/20 hover:border-border/40 transition-all">
                      <div className="space-y-1">
                        <p className="text-body-sm font-medium text-foreground">{n.label}</p>
                        <p className="text-meta text-muted-foreground leading-relaxed">{n.desc}</p>
                      </div>
                      <Switch 
                        checked={notifications[n.key as keyof typeof notifications]} 
                        onCheckedChange={v => setNotifications(prev => ({ ...prev, [n.key]: v }))} 
                        className="data-[state=checked]:bg-nexus-emerald"
                      />
                    </div>
                  ))}
                </div>
                
                <div className="flex justify-end pt-2">
                  <Button size="sm" onClick={() => toast.success('Matriz de alertas atualizada!')} className="nexus-gradient-bg text-primary-foreground gap-1.5 px-8">
                    <Save className="h-3.5 w-3.5" /> Sincronizar Preferências
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="integrations" className="m-0 focus-visible:outline-none">
              <div className="nexus-card bg-card/50 backdrop-blur-sm border-border/40 p-6 space-y-6">
                <div className="flex items-center justify-between border-b border-border/40 pb-4">
                  <div>
                    <h3 className="text-title-sm font-semibold text-foreground">Bitrix24 CRM Sync</h3>
                    <p className="text-meta text-muted-foreground">Ponte de dados para automação comercial e gestão de leads</p>
                  </div>
                  <div className="h-8 w-8 rounded bg-nexus-blue/10 flex items-center justify-center border border-nexus-blue/20">
                    <span className="text-nexus-blue text-meta font-bold italic">B24</span>
                  </div>
                </div>
                <Bitrix24Connect />
              </div>

              <div className="nexus-card bg-card/50 backdrop-blur-sm border-border/40 p-6 space-y-4 mt-6">
                <div className="border-b border-border/40 pb-4">
                  <h3 className="text-title-sm font-semibold text-foreground">Console de Webhooks Bitrix24</h3>
                  <p className="text-meta text-muted-foreground">Auditoria dos eventos recebidos, status de roteamento e assinatura HMAC</p>
                </div>
                <Bitrix24WebhookPanel />
              </div>

              <div className="nexus-card bg-card/50 backdrop-blur-sm border-border/40 p-6 space-y-4 mt-6">
                <div className="border-b border-border/40 pb-4">
                  <h3 className="text-title-sm font-semibold text-foreground">Testador de API Bitrix24</h3>
                  <p className="text-meta text-muted-foreground">Dispare chamadas REST autenticadas para validar credenciais e endpoints</p>
                </div>
                <Bitrix24ApiTester />
              </div>
            </TabsContent>
          </div>

          <div className="space-y-6">
            <div className="nexus-card bg-primary/5 border-primary/20 p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                <h4 className="text-meta font-bold uppercase tracking-widest text-primary">Score de Segurança</h4>
              </div>
              <div className="relative pt-1">
                <div className="flex mb-2 items-center justify-between">
                  <div><span className="text-meta font-semibold inline-block py-1 px-2 uppercase rounded-full text-nexus-emerald bg-nexus-emerald/10">Excelente</span></div>
                  <div className="text-right"><span className="text-meta font-semibold inline-block text-nexus-emerald">92%</span></div>
                </div>
                <div className="overflow-hidden h-2 mb-4 text-meta flex rounded bg-primary/10">
                  <div style={{ width: "92%" }} className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-nexus-emerald transition-all duration-1000"></div>
                </div>
              </div>
              <p className="text-meta text-muted-foreground leading-relaxed">
                Seu workspace utiliza criptografia AES-256 em repouso e políticas de RLS granulares.
              </p>
              <Button variant="outline" size="sm" className="w-full text-meta h-8 border-primary/20 hover:bg-primary/5">Ver Auditoria</Button>
            </div>

            <div className="nexus-card p-5 space-y-4">
              <h4 className="text-meta font-bold uppercase tracking-widest text-muted-foreground">Status do Cluster</h4>
              <div className="space-y-3">
                {[
                  { label: 'Inference Engine', status: 'Nominal', time: '14ms' },
                  { label: 'Vector Database', status: 'Nominal', time: '8ms' },
                  { label: 'MCP Mesh', status: 'Aviso', time: '210ms' },
                ].map(s => (
                  <div key={s.label} className="flex items-center justify-between">
                    <div>
                      <p className="text-meta font-medium">{s.label}</p>
                      <p className="text-meta text-muted-foreground">{s.time} latency</p>
                    </div>
                    <Badge variant="outline" className={`text-[9px] h-5 ${s.status === 'Nominal' ? 'border-nexus-emerald/30 text-nexus-emerald' : 'border-nexus-amber/30 text-nexus-amber'}`}>
                      {s.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            <div className="nexus-card p-5 space-y-3 bg-gradient-to-br from-secondary/50 to-background border-border/40">
              <h4 className="text-meta font-bold uppercase tracking-widest text-muted-foreground">Uso de Recursos</h4>
              <div className="space-y-1">
                <div className="flex justify-between text-meta mb-1">
                  <span>Tokens Mensais</span>
                  <span className="font-mono">4.2M / 10M</span>
                </div>
                <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-primary w-[42%]" />
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-meta mb-1">
                  <span>Storage (RAG)</span>
                  <span className="font-mono">1.2GB / 10GB</span>
                </div>
                <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-primary w-[12%]" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </Tabs>
    </div>
  );
}

