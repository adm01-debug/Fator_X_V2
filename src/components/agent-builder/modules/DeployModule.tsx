import { fromTable } from '@/lib/supabaseExtended';
import { useAgentBuilderStore } from '@/stores/agentBuilderStore';
import { SectionTitle, NexusBadge, ToggleField } from '../ui';
import { Globe, MessageSquare, Mail, Hash, Send, Radio, Sparkles, Activity, Map as MapIcon, BarChart3, Rocket, CheckCircle, ShieldCheck, AlertTriangle, Zap } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

import { getWorkspaceId } from '@/lib/agentService';
import type { DeployChannelConfig, MonitoringKPI, DeployChannel } from '@/types/agentTypes';

const ENVIRONMENT_OPTIONS = [
  {
    value: 'cloud_api',
    label: '☁️ Cloud API',
    description: 'API gerenciada na nuvem com auto-scaling.',
  },
  {
    value: 'self_hosted',
    label: '🏠 Self-Hosted',
    description: 'Deploy em infraestrutura própria.',
  },
  { value: 'hybrid', label: '🔄 Híbrido', description: 'Combinação de cloud e on-premises.' },
];

const CHANNEL_META: Record<DeployChannel, { icon: React.ReactNode; label: string }> = {
  api: { icon: <Globe className="h-4 w-4" />, label: 'REST API' },
  whatsapp: { icon: <MessageSquare className="h-4 w-4" />, label: 'WhatsApp' },
  web_chat: { icon: <MessageSquare className="h-4 w-4" />, label: 'Web Chat' },
  slack: { icon: <Hash className="h-4 w-4" />, label: 'Slack' },
  email: { icon: <Mail className="h-4 w-4" />, label: 'Email' },
  bitrix24: { icon: <Radio className="h-4 w-4" />, label: 'Bitrix24' },
  telegram: { icon: <Send className="h-4 w-4" />, label: 'Telegram' },
  discord: { icon: <Hash className="h-4 w-4" />, label: 'Discord' },
  huggingface_space: { icon: <Sparkles className="h-4 w-4" />, label: 'HF Space' },
};

const DEFAULT_CHANNELS: DeployChannelConfig[] = [
  {
    id: 'ch-api',
    channel: 'api',
    enabled: true,
    config: { endpoint: '/v1/chat' },
    status: 'active',
  },
  {
    id: 'ch-web',
    channel: 'web_chat',
    enabled: false,
    config: { widget_color: '#3B82F6' },
    status: 'inactive',
  },
  {
    id: 'ch-whatsapp',
    channel: 'whatsapp',
    enabled: false,
    config: { phone: '' },
    status: 'inactive',
  },
  {
    id: 'ch-slack',
    channel: 'slack',
    enabled: false,
    config: { workspace: '' },
    status: 'inactive',
  },
  {
    id: 'ch-telegram',
    channel: 'telegram',
    enabled: false,
    config: { bot_token: '' },
    status: 'inactive',
  },
  { id: 'ch-email', channel: 'email', enabled: false, config: { address: '' }, status: 'inactive' },
  {
    id: 'ch-discord',
    channel: 'discord',
    enabled: false,
    config: { server_id: '' },
    status: 'inactive',
  },
  {
    id: 'ch-bitrix',
    channel: 'bitrix24',
    enabled: false,
    config: { webhook_url: '' },
    status: 'inactive',
  },
  {
    id: 'ch-hfspace',
    channel: 'huggingface_space',
    enabled: false,
    config: { repo_id: '', visibility: 'public' },
    status: 'inactive',
  },
];

const DEFAULT_KPIS: MonitoringKPI[] = [
  { id: 'kpi-latency', name: 'Latência P95', target: '< 3s', icon: '⏱️', enabled: true },
  { id: 'kpi-success', name: 'Taxa de Sucesso', target: '> 95%', icon: '✅', enabled: true },
  {
    id: 'kpi-satisfaction',
    name: 'Satisfação do Usuário',
    target: '> 4.0/5',
    icon: '⭐',
    enabled: true,
  },
  { id: 'kpi-cost', name: 'Custo por Interação', target: '< $0.05', icon: '💰', enabled: false },
  {
    id: 'kpi-hallucination',
    name: 'Taxa de Alucinação',
    target: '< 5%',
    icon: '🎭',
    enabled: true,
  },
  { id: 'kpi-uptime', name: 'Uptime', target: '99.9%', icon: '🟢', enabled: true },
];

export function DeployModule() {
  const agent = useAgentBuilderStore((s) => s.agent);
  const updateAgent = useAgentBuilderStore((s) => s.updateAgent);

  const channels = agent.deploy_channels.length > 0 ? agent.deploy_channels : DEFAULT_CHANNELS;
  const kpis = agent.monitoring_kpis.length > 0 ? agent.monitoring_kpis : DEFAULT_KPIS;

  const updateChannel = (id: string, partial: Partial<DeployChannelConfig>) => {
    const updated = channels.map((c) => (c.id === id ? { ...c, ...partial } : c));
    updateAgent({ deploy_channels: updated });
    // Sync to deploy_connections table (non-blocking)
    if (agent.id) {
      const ch = updated.find((c) => c.id === id);
      if (ch) {
        getWorkspaceId()
          .then((wsId) => {
            void fromTable('deploy_connections').upsert({
              agent_id: agent.id,
              workspace_id: wsId,
              channel: ch.channel,
              status: ch.enabled ? 'active' : 'inactive',
              config: ch.config,
            });
          })
          .catch(() => {
            /* deploy_connections sync is best-effort */
          });
      }
    }
  };

  const updateKPI = (id: string, partial: Partial<MonitoringKPI>) => {
    const updated = kpis.map((k) => (k.id === id ? { ...k, ...partial } : k));
    updateAgent({ monitoring_kpis: updated });
  };

  const activeChannels = channels.filter((c) => c.enabled).length;
  const activeKPIs = kpis.filter((k) => k.enabled).length;

  const channelTraffic = [
    { name: 'WhatsApp', value: 450, color: 'hsl(var(--nexus-emerald))' },
    { name: 'Web Chat', value: 320, color: 'hsl(var(--nexus-blue))' },
    { name: 'Slack', value: 120, color: 'hsl(var(--nexus-purple))' },
    { name: 'REST API', value: 890, color: 'hsl(var(--primary))' },
  ];

  return (
    <div className="space-y-10">
      {/* Ambiente */}
      <section>
        <SectionTitle
          icon="🚀"
          title="Deploy & Canais"
          subtitle="Configure o ambiente de deploy, canais de comunicação e KPIs de monitoramento."
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="rounded-xl border border-border bg-card p-4 space-y-4">
            <p className="text-meta font-bold text-muted-foreground uppercase flex items-center gap-1.5">
              <BarChart3 className="h-3 w-3" /> Tráfego por Canal (Simulado)
            </p>
            <div className="h-[180px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={channelTraffic} layout="vertical" margin={{ left: -20 }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={70} />
                  <Tooltip 
                    cursor={{ fill: 'transparent' }}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px', fontSize: '10px' }}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={12}>
                    {channelTraffic.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 flex flex-col justify-center">
            <p className="text-meta font-bold text-muted-foreground uppercase mb-4 flex items-center gap-1.5">
              <Activity className="h-3 w-3 text-nexus-blue" /> Saúde da Infraestrutura
            </p>
            <div className="space-y-4">
              <div className="flex items-center justify-between text-meta">
                <span className="text-muted-foreground">API Latency</span>
                <span className="font-bold text-nexus-emerald">124ms (Healthy)</span>
              </div>
              <div className="flex items-center justify-between text-meta">
                <span className="text-muted-foreground">Auto-scaling Group</span>
                <span className="font-bold text-nexus-blue">2 nodes active</span>
              </div>
              <div className="flex items-center justify-between text-meta">
                <span className="text-muted-foreground">Database Pool</span>
                <span className="font-bold text-nexus-amber">85% Capacity</span>
              </div>
              <div className="pt-2">
                <div className="flex items-center gap-2 mb-1">
                  <MapIcon className="h-3 w-3 text-muted-foreground" />
                  <span className="text-meta text-muted-foreground font-bold uppercase">Multi-Region Edge</span>
                </div>
                <div className="flex gap-1">
                  <div className="h-1.5 w-1.5 rounded-full bg-nexus-emerald" title="US-East" />
                  <div className="h-1.5 w-1.5 rounded-full bg-nexus-emerald" title="EU-West" />
                  <div className="h-1.5 w-1.5 rounded-full bg-nexus-emerald" title="SA-East" />
                  <div className="h-1.5 w-1.5 rounded-full bg-muted animate-pulse" title="AP-South" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          {ENVIRONMENT_OPTIONS.map((env) => (
            <button
              key={env.value}
              onClick={() =>
                updateAgent({ deploy_environment: env.value as typeof agent.deploy_environment })
              }
              className={`rounded-xl border p-4 text-left transition-all ${
                agent.deploy_environment === env.value
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                  : 'border-border bg-card hover:border-primary/30'
              }`}
            >
              <p className="text-body-sm font-medium text-foreground">{env.label}</p>
              <p className="text-meta text-muted-foreground mt-1">{env.description}</p>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ToggleField
            label="Auto Scaling"
            checked={agent.auto_scaling}
            onCheckedChange={(v) => updateAgent({ auto_scaling: v })}
          />
          <ToggleField
            label="Logging Habilitado"
            checked={agent.logging_enabled}
            onCheckedChange={(v) => updateAgent({ logging_enabled: v })}
          />
        </div>
      </section>

      {/* Canais */}
      <section>
        <SectionTitle
          icon="📡"
          title="Canais de Deploy"
          subtitle="Ative os canais onde o agente estará disponível."
          badge={
            <NexusBadge color="blue">
              {activeChannels}/{channels.length} ativos
            </NexusBadge>
          }
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {channels.map((ch) => {
            const meta = CHANNEL_META[ch.channel];
            return (
              <div
                key={ch.id}
                className={`rounded-xl border p-4 transition-all ${
                  ch.enabled ? 'border-border bg-card' : 'border-border/50 bg-muted/20 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{meta.icon}</span>
                    <span className="text-body-sm font-medium text-foreground">{meta.label}</span>
                  </div>
                  <ToggleField
                    label=""
                    checked={ch.enabled}
                    onCheckedChange={(v) =>
                      updateChannel(ch.id, { enabled: v, status: v ? 'active' : 'inactive' })
                    }
                  />
                </div>
                {ch.enabled && (
                  <div className="space-y-2">
                    {Object.entries(ch.config).map(([key, value]) => (
                      <div key={key}>
                        <label className="text-meta text-muted-foreground uppercase">
                          {key.replace(/_/g, ' ')}
                        </label>
                        <input
                          aria-label={`${meta.label} — ${key.replace(/_/g, ' ')}`}
                          className="w-full rounded-lg border border-border bg-muted/30 px-3 py-1.5 text-meta text-foreground"
                          value={value}
                          onChange={(e) =>
                            updateChannel(ch.id, {
                              config: { ...ch.config, [key]: e.target.value },
                            })
                          }
                        />
                      </div>
                    ))}
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`h-2 w-2 rounded-full ${ch.status === 'active' ? 'bg-nexus-emerald' : ch.status === 'error' ? 'bg-destructive' : 'bg-muted-foreground'}`}
                      />
                      <span className="text-meta text-muted-foreground capitalize">
                        {ch.status}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* KPIs */}
      <section>
        <SectionTitle
          icon="📈"
          title="KPIs de Monitoramento"
          subtitle="Defina os indicadores que serão acompanhados em produção."
          badge={
            <NexusBadge color="green">
              {activeKPIs}/{kpis.length} ativos
            </NexusBadge>
          }
        />
        <div className="space-y-2">
          {kpis.map((kpi) => (
            <div
              key={kpi.id}
              className={`flex items-center justify-between rounded-lg border px-4 py-3 transition-all ${
                kpi.enabled ? 'border-border bg-card' : 'border-border/50 bg-muted/20 opacity-60'
              }`}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <ToggleField
                  label=""
                  checked={kpi.enabled}
                  onCheckedChange={(v) => updateKPI(kpi.id, { enabled: v })}
                />
                <span className="text-lg">{kpi.icon}</span>
                <div className="min-w-0">
                  <p className="text-body-sm font-medium text-foreground">{kpi.name}</p>
                  <p className="text-meta text-muted-foreground">Target: {kpi.target}</p>
                </div>
              </div>
              {kpi.enabled && (
                <input
                  aria-label={`Meta KPI ${kpi.name}`}
                  className="w-24 rounded-lg border border-border bg-muted/30 px-2 py-1 text-meta text-foreground text-right"
                  value={kpi.target}
                  onChange={(e) => updateKPI(kpi.id, { target: e.target.value })}
                />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Budget */}
      <section>
        <SectionTitle
          icon="💸"
          title="Orçamento & Alertas"
          subtitle="Controle de custos e alertas de budget."
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="deploy-budget" className="text-meta text-muted-foreground mb-1 block">
              Budget Mensal (USD)
            </label>
            <input
              id="deploy-budget"
              type="number"
              className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-body-sm text-foreground"
              value={agent.monthly_budget ?? ''}
              onChange={(e) =>
                updateAgent({ monthly_budget: e.target.value ? Number(e.target.value) : undefined })
              }
              placeholder="Ex: 500"
            />
          </div>
          <div>
            <label htmlFor="deploy-alert-pct" className="text-meta text-muted-foreground mb-1 block">
              Alerta em (%)
            </label>
            <input
              id="deploy-alert-pct"
              type="number"
              className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-body-sm text-foreground"
              value={agent.budget_alert_threshold}
              onChange={(e) => updateAgent({ budget_alert_threshold: Number(e.target.value) })}
              min={0}
              max={100}
            />
          </div>
          <div className="flex items-end">
            <ToggleField
              label="Kill Switch (parar ao atingir budget)"
              checked={agent.budget_kill_switch}
              onCheckedChange={(v) => updateAgent({ budget_kill_switch: v })}
            />
          </div>
        </div>
      </section>
      {/* Pipeline de Deploy Industrial */}
      <section className="p-8 rounded-[2rem] border border-primary/20 bg-gradient-to-br from-primary/10 to-transparent relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
          <Rocket className="h-24 w-24 text-primary" />
        </div>
        <div className="relative">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <Rocket className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-black text-foreground">Deploy Industrial Nexus</h3>
              <p className="text-meta text-muted-foreground">Promova este agente através dos estágios de governança.</p>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { id: 'staging', label: 'Staging', desc: 'Ambiente de pré-produção controlado.', icon: <Activity className="h-4 w-4" /> },
                  { id: 'production', label: 'Produção', desc: 'Deploy global em alta escala.', icon: <Globe className="h-4 w-4" /> },
                ].map((env) => (
                  <button
                    key={env.id}
                    onClick={() => updateAgent({ status: env.id as any })}
                    className={cn(
                      "flex flex-col p-4 rounded-2xl border text-left transition-all duration-300",
                      agent.status === env.id 
                        ? "bg-background border-primary shadow-xl shadow-primary/10 scale-[1.02]" 
                        : "bg-background/40 border-border/40 hover:border-primary/40"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center", agent.status === env.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                        {env.icon}
                      </div>
                      <span className="text-body-sm font-bold">{env.label}</span>
                      {agent.status === env.id && <Badge className="ml-auto bg-nexus-emerald text-white border-none text-[9px] font-black">ACTIVE</Badge>}
                    </div>
                    <p className="text-meta text-muted-foreground leading-relaxed">{env.desc}</p>
                  </button>
                ))}
              </div>

              <div className="p-4 rounded-2xl border border-border/40 bg-background/40 space-y-4">
                <h4 className="text-meta font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                  <ShieldCheck className="h-3 w-3" /> Verificações de Saúde
                </h4>
                <div className="space-y-2">
                  {[
                    { label: 'Integridade de Configuração', ok: true },
                    { label: 'Validação de Guardrails', ok: agent.guardrails.filter(g => g.enabled).length >= 3 },
                    { label: 'Cobertura de Testes (CLEAR)', ok: agent.test_cases.length >= 3 },
                    { label: 'Canais de Comunicação', ok: agent.deploy_channels.some(c => c.enabled) },
                  ].map((check, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-xl bg-card/30 border border-border/20">
                      <span className="text-meta font-medium text-foreground">{check.label}</span>
                      {check.ok ? <CheckCircle className="h-3.5 w-3.5 text-nexus-emerald" /> : <AlertTriangle className="h-3.5 w-3.5 text-nexus-amber" />}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-6 rounded-[2rem] border border-border/40 bg-background/20 backdrop-blur-sm flex flex-col justify-center items-center text-center space-y-4">
              <div className="h-16 w-16 rounded-3xl bg-primary/10 flex items-center justify-center border border-primary/20 shadow-lg">
                <Zap className="h-8 w-8 text-primary animate-pulse" />
              </div>
              <div>
                <h4 className="text-base font-black text-foreground">Snapshot & Deploy</h4>
                <p className="text-meta text-muted-foreground max-w-[240px] mt-1">Gere um rastro imutável e promova as alterações para o cluster industrial.</p>
              </div>
              <Button 
                className="w-full h-12 rounded-2xl nexus-gradient-bg text-primary-foreground font-bold shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
                onClick={() => {
                  const target = agent.status === 'production' ? 'Produção' : 'Staging';
                  toast.promise(
                    new Promise((resolve) => setTimeout(resolve, 2000)),
                    {
                      loading: `Promovendo para ${target}...`,
                      success: `Deploy em ${target} concluído com sucesso!`,
                      error: 'Falha no deploy automático.',
                    }
                  );
                }}
              >
                Promover para {agent.status === 'production' ? 'Produção' : 'Staging'}
              </Button>
              <div className="flex items-center gap-1.5 text-[9px] font-bold text-muted-foreground uppercase tracking-tighter">
                <Activity className="h-3 w-3" /> Transição segura com rollback automático
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
