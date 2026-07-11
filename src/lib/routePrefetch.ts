/**
 * Lazy route prefetch — cobre todas as rotas principais.
 *
 * Estratégias:
 *  • `prefetchRoute(path)` — chamado no hover / focus de <NavLink>, baixa o
 *    chunk da rota antes do clique (percepção instantânea de navegação).
 *  • `prefetchIdleRoutes()` — na 1ª interação idle do usuário, pré-carrega em
 *    lote as rotas mais acessadas (dashboard, agents, oracle, workflows…),
 *    aproveitando janelas ociosas sem competir com o LCP.
 */

const routeImports: Record<string, () => Promise<unknown>> = {
  '/': () => import('@/pages/DashboardPage'),
  '/dashboard': () => import('@/pages/DashboardPage'),
  '/agents': () => import('@/pages/AgentsPage'),
  '/agents/new': () => import('@/pages/CreateAgentPage'),
  '/agents/templates': () => import('@/pages/AgentTemplatesPage'),
  '/agents/swarm': () => import('@/pages/SwarmOrchestrationPage'),
  '/builder': () => import('@/pages/AgentBuilder'),
  '/brain': () => import('@/pages/SuperCerebroPage'),
  '/super-cerebro': () => import('@/pages/SuperCerebroPage'),
  '/oracle': () => import('@/pages/OraclePage'),
  '/knowledge': () => import('@/pages/KnowledgePage'),
  '/knowledge-management': () => import('@/pages/KnowledgeManagementPage'),
  '/memory': () => import('@/pages/MemoryPage'),
  '/tools': () => import('@/pages/ToolsPage'),
  '/routing': () => import('@/pages/RoutingConfigPage'),
  '/prompts': () => import('@/pages/PromptsPage'),
  '/prompts/experiments': () => import('@/pages/PromptExperimentsPage'),
  '/workflows': () => import('@/pages/WorkflowsPage'),
  '/automation': () => import('@/pages/AutomationCenterPage'),
  '/automations': () => import('@/pages/AutomationsPage'),
  '/evaluations': () => import('@/pages/EvaluationsPage'),
  '/deployments': () => import('@/pages/DeploymentsPage'),
  '/monitoring': () => import('@/pages/MonitoringPage'),
  '/monitoring/metrics': () => import('@/pages/AgentMetricsPage'),
  '/data-storage': () => import('@/pages/DataStoragePage'),
  '/datahub': () => import('@/pages/DataHubPage'),
  '/admin': () => import('@/pages/AdminPage'),
  '/security': () => import('@/pages/SecurityPage'),
  '/lgpd': () => import('@/pages/LGPDCompliancePage'),
  '/approvals': () => import('@/pages/ApprovalQueuePage'),
  '/team': () => import('@/pages/TeamPage'),
  '/billing': () => import('@/pages/BillingPage'),
  '/settings': () => import('@/pages/SettingsPage'),
  '/settings/budget': () => import('@/pages/BudgetSettingsPage'),
  '/ai-studio': () => import('@/pages/AIStudioPage'),
  '/fine-tuning': () => import('@/pages/FineTuningPage'),
  '/smolagent': () => import('@/pages/SmolagentPage'),
  '/skills': () => import('@/pages/SkillsMarketplacePage'),
  '/search': () => import('@/pages/SearchPage'),
  '/nlp': () => import('@/pages/NLPPipelinePage'),
  '/traces': () => import('@/pages/TracesTimelinePage'),
  '/voice': () => import('@/pages/VoiceAgentStudioPage'),
  '/voice-agents': () => import('@/pages/VoiceAgentsPage'),
  '/browser-agent': () => import('@/pages/BrowserAgentPage'),
  '/orchestration': () => import('@/pages/AgentOrchestrationPage'),
  '/replay': () => import('@/pages/ReplayForkPage'),
  '/computer-use': () => import('@/pages/ComputerUsePage'),
  '/vision': () => import('@/pages/VisionAgentsPage'),
  '/mobile-sdk': () => import('@/pages/MobileSDKPage'),
  '/rbac/roles': () => import('@/pages/RolesPage'),
  '/rbac/permissions': () => import('@/pages/PermissionsPage'),
  '/oncall': () => import('@/pages/OncallPage'),
  '/postmortems': () => import('@/pages/PostmortemsPage'),
  '/incident-playbooks': () => import('@/pages/IncidentPlaybooksPage'),
  '/dr-drills': () => import('@/pages/DRDrillsPage'),
  '/game-days': () => import('@/pages/GameDaysPage'),
  '/sbom': () => import('@/pages/SBOMPage'),
  '/vulnerabilities': () => import('@/pages/VulnerabilitiesPage'),
  '/pentest': () => import('@/pages/PentestPage'),
  '/risk-register': () => import('@/pages/RiskRegisterPage'),
  '/vendors': () => import('@/pages/VendorsPage'),
  '/bcp': () => import('@/pages/BCPPage'),
  '/change-management': () => import('@/pages/ChangeManagementPage'),
  '/ir-playbooks': () => import('@/pages/IRPlaybooksPage'),
  '/asset-inventory': () => import('@/pages/AssetInventoryPage'),
  '/slo': () => import('@/pages/SLODashboard'),
  '/chaos-lab': () => import('@/pages/ChaosLabPage'),
  '/synthetic-monitoring': () => import('@/pages/SyntheticMonitoringPage'),
  '/cost-anomalies': () => import('@/pages/CostAnomaliesPage'),
};

const prefetched = new Set<string>();

export function prefetchRoute(path: string): void {
  if (prefetched.has(path)) return;
  const loader = routeImports[path];
  if (!loader) return;
  prefetched.add(path);
  loader().catch(() => prefetched.delete(path));
}

/** Top rotas para pré-carregar em idle após o boot. */
const IDLE_PREFETCH: readonly string[] = [
  '/agents',
  '/oracle',
  '/workflows',
  '/monitoring',
  '/monitoring/metrics',
  '/settings',
];

let idleScheduled = false;

/**
 * Agenda pré-carregamento em lote das rotas mais acessadas na próxima janela
 * ociosa do navegador. Idempotente — chame quando quiser (ex.: após login).
 */
export function prefetchIdleRoutes(): void {
  if (idleScheduled || typeof window === 'undefined') return;
  idleScheduled = true;

  const schedule =
    (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
      .requestIdleCallback ??
    ((cb: () => void) => window.setTimeout(cb, 1500));

  schedule(
    () => {
      for (const path of IDLE_PREFETCH) prefetchRoute(path);
    },
    { timeout: 4000 },
  );
}
