import { logger } from '@/lib/logger';
import { useLocation, useNavigate } from 'react-router-dom';
import fatorxIcon from '@/assets/fatorx-icon.png';
import { NavLink } from '@/components/NavLink';
import {
  LayoutDashboard,
  Bot,
  BookOpen,
  Brain,
  Puzzle,
  FileText,
  GitBranch,
  Zap,
  Download,
  FlaskConical,
  Rocket,
  Activity,
  Database,
  Shield,
  Users,
  CreditCard,
  Settings,
  Sparkles,
  PanelLeftClose,
  PanelLeft,
  LogOut,
  ServerCog,
  ChevronDown,
  Palette,
  Dna,
  Workflow,
  Package,
  Library,
  ShieldCheck,
  CircleCheckBig,
  Crown,
  Route as RouteIcon,
  Languages,
  Mic,
  GitBranch as GitBranchIcon,
  KeyRound,
  Globe2,
  Monitor,
  Eye,
  Smartphone,
  TestTube2,
  MessageCircle,
  Store,
  Cpu,
  Wand2,
  GitMerge,
  Terminal,
  Mail,
  Bug,
  FileCheck2,
  PhoneCall,
  Network,
  FlaskRound,
  TrendingDown,
  Calculator,
  Share2,
  Building2,
  Radar,
  ShieldAlert,
  Wallet,
  Swords,
  Phone,
  Archive,
  AlertOctagon,
  LifeBuoy,
  GitPullRequest,
  Boxes,
  MessageSquare,
  Fingerprint,
  Snowflake,
  Briefcase,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState, useCallback } from 'react';
import { getWorkspaceInfo } from '@/lib/agentService';
import { useI18n } from '@/hooks/useI18n';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

const navSections = [
  {
    label: 'Geral',
    key: 'geral',
    items: [
      { title: 'Dashboard', url: '/', icon: LayoutDashboard },
      { title: 'Agentes', url: '/agents', icon: Bot },
      { title: 'Conversar', url: '/chat', icon: MessageCircle },
      { title: 'Super Cérebro', url: '/brain', icon: Brain },
      { title: 'Oráculo', url: '/oracle', icon: Sparkles },
      { title: 'AI Studio', url: '/ai-studio', icon: Palette },
    ],
  },
  {
    label: 'Vendas',
    key: 'vendas',
    items: [
      { title: 'CRM', url: '/crm', icon: Briefcase },
      { title: 'Roteamento CRM', url: '/routing', icon: RouteIcon },
    ],
  },
  {
    label: 'Desenvolvimento',
    key: 'dev',
    items: [
      { title: 'Conhecimento / RAG', url: '/knowledge', icon: BookOpen },
      { title: 'Memória', url: '/memory', icon: Brain },
      { title: 'Ferramentas', url: '/tools', icon: Puzzle },
      { title: 'MCP Servers', url: '/mcp-servers', icon: Boxes },
      { title: 'Prompts', url: '/prompts', icon: FileText },
      { title: 'Workflows', url: '/workflows', icon: GitBranch },
      { title: 'Orquestração Multi-Agente', url: '/orchestration', icon: Network },
      { title: 'Painel A2A', url: '/a2a', icon: Share2 },
      { title: 'Automação', url: '/automation', icon: Zap },
      { title: 'Roteamento', url: '/routing', icon: RouteIcon },
      { title: 'Fine-tuning', url: '/fine-tuning', icon: Dna },
      { title: 'Smolagent', url: '/smolagent', icon: Workflow },
      { title: 'Biblioteca de Skills', url: '/skills/library', icon: Library },
      { title: 'Skills Marketplace', url: '/skills', icon: Package },
      { title: 'Skillbook · Auditoria', url: '/skills/audit', icon: BookOpen },
      { title: 'Coleta de Skills', url: '/skills/harvest', icon: Download },
      { title: 'Skills dos Agentes', url: '/agents/installed-skills', icon: Puzzle },
      { title: 'Workflows de Agentes', url: '/agents/workflows', icon: GitBranch },
      { title: 'Engenharia de Caos', url: '/security/chaos-experiments', icon: Zap },
      { title: 'Testes BCP', url: '/security/bcp-tests', icon: LifeBuoy },
      { title: 'Sessões de Agentes', url: '/agent-sessions', icon: Mic },
      { title: 'Execuções de Grafos', url: '/graph-executions', icon: GitBranch },
      { title: 'Resolução de Entidades', url: '/entity-resolution', icon: GitMerge },
      { title: 'Custo LLM por Função', url: '/llm-cost-by-caller', icon: Calculator },

      { title: 'NLP Pipeline', url: '/nlp', icon: Languages },
      { title: 'Computer Use', url: '/computer-use', icon: Monitor },
      { title: 'Browser Agent', url: '/browser-agent', icon: Globe2 },
      { title: 'Vision Agents', url: '/vision', icon: Eye },
      { title: 'Mobile SDK', url: '/mobile-sdk', icon: Smartphone },
      { title: 'A/B Test Prompts', url: '/ab-test', icon: TestTube2 },
      { title: 'Marketplace Pro', url: '/marketplace-pro', icon: Store },
      { title: 'Fine-Tuning', url: '/fine-tuning', icon: Cpu },
      { title: 'Synthetic Data', url: '/synthetic-data', icon: Wand2 },
      { title: 'Canary Deploys', url: '/canary', icon: GitMerge },
      { title: 'Code Interpreter', url: '/code-interpreter', icon: Terminal },
      { title: 'Email Triggers', url: '/email-triggers', icon: Mail },
      { title: 'Agent Debugger', url: '/debugger', icon: Bug },
      { title: 'Compliance Reports', url: '/compliance-reports', icon: FileCheck2 },
      { title: 'Frameworks Compliance', url: '/compliance-frameworks', icon: ShieldCheck },
      { title: 'Voice & Telefonia', url: '/voice-telephony', icon: PhoneCall },
      { title: 'Knowledge Graph', url: '/knowledge-graph', icon: Network },
      { title: 'Simulation Lab', url: '/simulation', icon: FlaskRound },
      { title: 'Cost Optimizer', url: '/cost-optimizer', icon: TrendingDown },
      { title: 'Federated Learning', url: '/federated-learning', icon: Share2 },
      { title: 'Multi-Tenancy', url: '/multi-tenancy', icon: Building2 },
      { title: 'Observability', url: '/observability', icon: Radar },
      { title: 'Disaster Recovery', url: '/disaster-recovery', icon: ShieldAlert },
    ],
  },
  {
    label: 'Operações',
    key: 'ops',
    items: [
      { title: 'Avaliações', url: '/evaluations', icon: FlaskConical },
      { title: 'Eval de Agente', url: '/agent-evals', icon: FlaskConical },
      { title: 'Experimentos A/B', url: '/agent-experiments', icon: FlaskConical },
      { title: 'Decaimento de Conhecimento', url: '/knowledge-decay', icon: Archive },
      { title: 'Jobs de Sistema', url: '/system-jobs', icon: ServerCog },
      { title: 'Playbook Particionamento', url: '/docs/partitioning', icon: BookOpen },
      { title: 'Eventos de Webhook', url: '/webhook-events', icon: Zap },
      { title: 'Governança', url: '/governance', icon: ShieldCheck },
      { title: 'Janelas de Congelamento', url: '/governance/freeze-windows', icon: Snowflake },
      { title: 'Orçamentos', url: '/budgets', icon: Wallet },
      { title: 'Implantações', url: '/deployments', icon: Rocket },
      { title: 'Runtime OpenClaw', url: '/openclaw', icon: ServerCog },
      { title: 'Templates OpenClaw', url: '/openclaw/templates', icon: Sparkles },
      { title: 'Widget Builder', url: '/widget-builder', icon: MessageSquare },
      { title: 'Monitoramento', url: '/monitoring', icon: Activity },
      { title: 'Métricas Diárias', url: '/monitoring/metrics', icon: Activity },
      { title: 'Traces & Spans', url: '/traces', icon: Activity },
      { title: 'SLO Dashboard', url: '/observability/slo', icon: Activity },
      { title: 'Chaos Lab', url: '/observability/chaos', icon: Zap },
      { title: 'Synthetic Monitoring', url: '/observability/synthetic', icon: Radar },
      { title: 'Anomalias de Custo', url: '/observability/cost-anomalies', icon: TrendingDown },
      { title: 'Simulador de Custos', url: '/cost-simulator', icon: Calculator },
      { title: 'Game Days', url: '/observability/game-days', icon: Swords },
      { title: 'Playbooks', url: '/observability/playbooks', icon: BookOpen },
      { title: 'On-Call', url: '/observability/oncall', icon: Phone },
      { title: 'DR Drills', url: '/observability/dr-drills', icon: Archive },
      { title: 'Postmortems', url: '/observability/postmortems', icon: FileText },
      { title: 'Replay & Fork', url: '/replay', icon: GitBranchIcon },
      { title: 'Agent Battle Arena', url: '/arena', icon: Swords },
      { title: 'Voice Agent', url: '/voice', icon: Mic },
      { title: 'Voice Realtime', url: '/voice-agents', icon: Mic },
      { title: 'Dados & Storage', url: '/data-storage', icon: Database },
      { title: 'DataHub', url: '/datahub', icon: ServerCog },
    ],
  },
  {
    label: 'Administração',
    key: 'admin',
    items: [
      { title: 'Segurança', url: '/security', icon: Shield },
      { title: 'SBOM', url: '/security/sbom', icon: Package },
      { title: 'Vulnerabilidades', url: '/security/vulnerabilities', icon: ShieldAlert },
      { title: 'Rotação de Secrets', url: '/security/secrets-rotation', icon: KeyRound },
      { title: 'Pentests', url: '/security/pentests', icon: Bug },
      { title: 'Findings de Pentest', url: '/security/pentest-findings', icon: Swords },
      { title: 'Registro de Riscos', url: '/security/risks', icon: AlertOctagon },
      { title: 'Fornecedores', url: '/security/vendors', icon: Building2 },
      { title: 'Continuidade (BCP)', url: '/security/bcp', icon: LifeBuoy },
      { title: 'Mudanças (CAB)', url: '/security/changes', icon: GitPullRequest },
      { title: 'Playbooks (IR)', url: '/security/ir', icon: BookOpen },
      { title: 'Inventário (CMDB)', url: '/security/assets', icon: Boxes },
      { title: 'IP Whitelist', url: '/security/ip-whitelist', icon: Network },
      { title: 'Pentest & Achados', url: '/security/pentests', icon: ShieldCheck },
      { title: 'Snapshots Forenses', url: '/security/forensic-snapshots', icon: Fingerprint },
      { title: 'SSO Enterprise', url: '/sso', icon: KeyRound },
      { title: 'Data Residency', url: '/residency', icon: Globe2 },
      { title: 'LGPD', url: '/lgpd', icon: ShieldCheck },
      { title: 'Aprovações', url: '/approvals', icon: CircleCheckBig },
      { title: 'Equipe', url: '/team', icon: Users },
      { title: 'Faturamento', url: '/billing', icon: CreditCard },
      { title: 'Payouts do Criador', url: '/creator-payouts', icon: Wallet },
      { title: 'Orçamento', url: '/settings/budget', icon: Wallet },
      { title: 'Configurações', url: '/settings', icon: Settings },
      { title: 'Admin BD', url: '/admin', icon: ServerCog },
    ],
  },
];

const COLLAPSED_KEY = 'nexus-sidebar-sections';

function getInitialCollapsed(): Record<string, boolean> {
  try {
    const stored = localStorage.getItem(COLLAPSED_KEY);
    if (stored) return JSON.parse(stored);
  } catch (err) {
    logger.error('Operation failed:', err);
  }
  // Default: only "Geral" expanded
  return { geral: false, dev: false, ops: true, admin: true };
}

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { locale, setLocale } = useI18n();
  const [wsInfo, setWsInfo] = useState<{
    name: string;
    plan: string;
    maxAgents: number;
    agentCount: number;
    userName: string;
    email: string;
  } | null>(null);
  const [sectionCollapsed, setSectionCollapsed] =
    useState<Record<string, boolean>>(getInitialCollapsed);

  // Auto-expand the section containing the active route
  useEffect(() => {
    setSectionCollapsed((prev) => {
      for (const section of navSections) {
        const hasActive = section.items.some((item) =>
          item.url === '/' ? location.pathname === '/' : location.pathname.startsWith(item.url),
        );
        if (hasActive && prev[section.key]) {
          const next = { ...prev, [section.key]: false };
          try {
            localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
          } catch (err) {
            logger.error('Operation failed:', err); /* noop */
          }
          return next;
        }
      }
      return prev;
    });
  }, [location.pathname]);

  const toggleSection = useCallback((key: string) => {
    setSectionCollapsed((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
      } catch (err) {
        logger.error('Operation failed:', err);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (user) {
      getWorkspaceInfo().then((info) => info && setWsInfo(info));
    }
    // Depend on the stable user id, not the user object reference: an
    // unstable `user` identity would re-run this on every render and, via
    // setWsInfo, cause an infinite render loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const planLabel =
    wsInfo?.plan === 'pro' ? 'Pro' : wsInfo?.plan === 'enterprise' ? 'Enterprise' : 'Free';
  const agentCount = wsInfo?.agentCount ?? 0;
  const maxAgents = wsInfo?.maxAgents ?? 5;
  const usage = maxAgents > 0 ? Math.min((agentCount / maxAgents) * 100, 100) : 0;

  const badgeCounts: Record<string, number> = {
    '/agents': agentCount,
  };

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-border/40 bg-sidebar"
      aria-label="Navegação principal"
    >
      <SidebarHeader className="p-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-nexus-lg shadow-primary/20 shrink-0">
            <img src={fatorxIcon} alt="" className="h-6 w-6 invert brightness-0" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span
                className="font-black text-title-sm tracking-tight leading-none text-foreground uppercase"
                aria-label="Fator X"
              >
                Fator<span className="text-primary">X</span>
              </span>
              <span className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em] mt-1">
                Industrial Intelligence
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2" role="navigation" aria-label="Menu principal">
        {navSections.map((section, sectionIdx) => {
          const isCollapsedSection = sectionCollapsed[section.key] && !collapsed;
          return (
            <SidebarGroup key={section.label}>
              {!collapsed ? (
                <button
                  onClick={() => toggleSection(section.key)}
                  className="flex items-center justify-between w-full px-2.5 mb-1 group/label hover:bg-secondary/30 rounded-md py-1 transition-colors"
                  aria-expanded={!isCollapsedSection}
                  aria-controls={`nav-section-${section.key}`}
                >
                  <SidebarGroupLabel className="text-meta font-black uppercase tracking-[0.2em] text-muted-foreground pointer-events-none p-0 h-auto">
                    {section.label}
                  </SidebarGroupLabel>
                  <ChevronDown
                    className={`h-3 w-3 text-muted-foreground/40 transition-all duration-300 group-hover/label:text-primary ${isCollapsedSection ? '-rotate-90' : ''}`}
                    aria-hidden="true"
                  />
                </button>
              ) : (
                sectionIdx > 0 && <Separator className="my-1.5 mx-auto w-6 bg-border/40" />
              )}
              <SidebarGroupContent
                id={`nav-section-${section.key}`}
                className={`transition-all duration-200 overflow-hidden ${isCollapsedSection ? 'max-h-0 opacity-0' : 'max-h-[500px] opacity-100'}`}
              >
                <SidebarMenu>
                  {section.items.map((item) => {
                    const isActive =
                      item.url === '/'
                        ? location.pathname === '/'
                        : location.pathname.startsWith(item.url);
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
                          <NavLink
                            to={item.url}
                            end={item.url === '/'}
                            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-body-sm transition-all duration-300 group/navitem ${
                              isActive
                                ? 'text-primary font-black bg-primary/10 shadow-nexus-sm shadow-primary/5'
                                : 'text-sidebar-foreground/70 hover:bg-secondary/40 hover:text-foreground hover:translate-x-1'
                            }`}
                            activeClassName=""
                            aria-current={isActive ? 'page' : undefined}
                          >
                            <item.icon
                              className={`h-4 w-4 shrink-0 transition-all duration-200 group-hover/navitem:scale-110 ${isActive ? 'text-primary' : ''}`}
                            />
                            {!collapsed && (
                              <span className="transition-colors duration-150">{item.title}</span>
                            )}
                            {!collapsed && badgeCounts[item.url] > 0 && (
                              <span className="ml-auto text-meta font-semibold bg-primary/15 text-primary rounded-full px-1.5 py-0.5 tabular-nums leading-none">
                                {badgeCounts[item.url]}
                              </span>
                            )}
                            {isActive && !collapsed && !badgeCounts[item.url] && (
                              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary animate-glow-pulse nexus-pulse-ring" />
                            )}
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="p-2 space-y-1.5">
        {!collapsed && (
          <>
            <Separator className="bg-border/30" />
            <div className="rounded-2xl bg-secondary/30 border border-border/40 p-4 shadow-nexus-sm">
              <div className="flex items-center justify-between mb-3">
                <p className="text-meta font-black uppercase tracking-widest text-muted-foreground/80">
                  Vazão do Workspace
                </p>
                <Badge
                  variant="outline"
                  className="bg-primary/5 text-primary border-none text-[9px] font-black"
                >
                  {planLabel}
                </Badge>
              </div>
              <div
                className="h-1.5 rounded-full bg-secondary/50 mb-2 overflow-hidden"
                role="progressbar"
                aria-valuenow={usage}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Uso de agentes"
              >
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-1000',
                    usage >= 100 ? 'bg-destructive' : 'nexus-gradient-bg',
                  )}
                  style={{ width: `${Math.max(usage, 4)}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-meta font-bold text-muted-foreground mb-3">
                <span>{agentCount} Agentes</span>
                <span>Limit {maxAgents}</span>
              </div>
              {usage >= 80 && planLabel === 'Free' && (
                <Button
                  onClick={() => navigate('/billing')}
                  className="w-full h-8 rounded-xl bg-nexus-amber/10 border border-nexus-amber/20 text-nexus-amber hover:bg-nexus-amber/20 text-meta font-black uppercase tracking-widest gap-2"
                >
                  <Crown className="h-3 w-3" /> UPGRADE
                </Button>
              )}
            </div>
            <Separator className="bg-border/30" />
            {user && (
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-secondary/20 border border-border/40 hover:bg-secondary/30 transition-all group">
                <div className="relative shrink-0">
                  {user.user_metadata?.avatar_url ? (
                    <img
                      src={user.user_metadata.avatar_url}
                      alt=""
                      className="h-9 w-9 rounded-xl object-cover border border-white/10"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="h-9 w-9 rounded-xl nexus-gradient-bg flex items-center justify-center text-meta font-black text-primary-foreground shadow-nexus-sm">
                      {(wsInfo?.userName?.[0] || user.email?.[0] || 'U').toUpperCase()}
                    </div>
                  )}
                  <div className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-nexus-emerald border-2 border-background shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-meta font-black text-foreground uppercase tracking-tight truncate">
                    {wsInfo?.userName || 'Operador'}
                  </p>
                  <p className="text-meta font-medium text-muted-foreground truncate">
                    {user.email}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl"
                  onClick={signOut}
                  aria-label="Sair da conta"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            )}
            <div className="flex items-center justify-between px-3 pt-1">
              <p className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em] select-none">
                Fator X Core v1.0
              </p>
              <button
                onClick={() => setLocale(locale === 'pt-BR' ? 'en' : 'pt-BR')}
                className="text-[9px] font-black text-muted-foreground hover:text-primary transition-colors uppercase tracking-widest"
                aria-label="Alternar idioma"
              >
                {locale === 'pt-BR' ? 'EN' : 'PT'}
              </button>
            </div>
          </>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleSidebar}
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground text-meta h-8"
          aria-label={collapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
        >
          {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          {!collapsed && <span>Recolher</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
