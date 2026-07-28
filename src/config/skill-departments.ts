/**
 * Taxonomia canônica de departamentos para skills de agentes.
 *
 * Fonte única da verdade no frontend. A Edge Function `skill-harvester`
 * mantém uma cópia espelhada em `supabase/functions/skill-harvester/departments.ts`
 * (Deno não consegue importar de `src/`). O teste
 * `src/test/skill-departments-parity.test.ts` garante que as duas listas não divirjam.
 */

export const SKILL_DEPARTMENTS = [
  'financeiro',
  'comercial',
  'rh',
  'ti',
  'marketing',
  'juridico',
  'logistica',
  'pos_venda',
  'dados',
  'executivo',
  'transversal',
] as const;

export type SkillDepartment = (typeof SKILL_DEPARTMENTS)[number];

/**
 * `transversal` NÃO é um domínio de negócio: é o balde de fallback para
 * repositórios agregadores ("awesome-lists", catálogos, boilerplates) que não
 * possuem vocabulário de domínio. O classificador só o atribui quando nenhum
 * departamento real apresenta sinal — nunca compete com eles.
 */
export const FALLBACK_DEPARTMENT = 'transversal' satisfies SkillDepartment;

/** Departamentos de negócio reais (exclui o balde de fallback). */
export const DOMAIN_DEPARTMENTS = SKILL_DEPARTMENTS.filter(
  (d) => d !== FALLBACK_DEPARTMENT,
) as ReadonlyArray<Exclude<SkillDepartment, typeof FALLBACK_DEPARTMENT>>;

export interface DepartmentMeta {
  id: SkillDepartment;
  label: string;
  icon: string;
  /** Meta mínima de skills no registry para considerar o departamento coberto. */
  coverageTarget: number;
  /** Léxico PT-BR + EN usado pelo classificador determinístico. */
  lexicon: string[];
}

export const DEPARTMENT_META: Record<SkillDepartment, DepartmentMeta> = {
  financeiro: {
    id: 'financeiro',
    label: 'Financeiro',
    icon: '💰',
    coverageTarget: 12,
    lexicon: [
      'financeiro', 'finance', 'financial', 'contabil', 'contabilidade', 'accounting',
      'fatura', 'faturamento', 'invoice', 'invoicing', 'billing', 'cobranca', 'dunning',
      'fluxo', 'caixa', 'cashflow', 'orcamento', 'budget', 'despesa', 'expense',
      'conciliacao', 'reconciliation', 'ledger', 'balancete', 'dre', 'tax', 'imposto',
      'tributario', 'nfe', 'nota', 'fiscal', 'payroll', 'folha', 'pagamento', 'payment',
      'receivable', 'payable', 'stripe', 'quickbooks', 'xero', 'erp',
    ],
  },
  comercial: {
    id: 'comercial',
    label: 'Comercial / Vendas',
    icon: '🤝',
    coverageTarget: 15,
    lexicon: [
      'comercial', 'vendas', 'sales', 'crm', 'lead', 'leads', 'prospect', 'prospeccao',
      'prospecting', 'pipeline', 'funil', 'funnel', 'deal', 'negocio', 'oportunidade',
      'opportunity', 'proposta', 'proposal', 'quote', 'orcamento', 'cotacao',
      'cadence', 'cadencia', 'outreach', 'outbound', 'inbound', 'sdr', 'closer',
      'bitrix', 'hubspot', 'salesforce', 'pipedrive', 'zoho', 'forecast', 'quota',
      'icp', 'scoring', 'enrichment', 'enriquecimento',
    ],
  },
  rh: {
    id: 'rh',
    label: 'Recursos Humanos',
    icon: '👥',
    coverageTarget: 10,
    lexicon: [
      'rh', 'hr', 'recursos', 'humanos', 'human', 'people', 'talento',
      'talent', 'recrutamento', 'recruiting', 'recruitment', 'vaga', 'vacancy', 'job',
      'candidato', 'candidate', 'curriculo', 'resume', 'cv', 'entrevista', 'interview',
      'onboarding', 'offboarding', 'admissao', 'desligamento', 'colaborador', 'employee',
      'clima', 'engajamento', 'engagement', 'performance', 'avaliacao', 'feedback',
      'treinamento', 'training', 'ponto', 'ferias', 'beneficios', 'benefits', 'ats',
    ],
  },
  ti: {
    id: 'ti',
    label: 'TI / Infraestrutura',
    icon: '🖥️',
    coverageTarget: 15,
    lexicon: [
      'ti', 'it', 'infra', 'infraestrutura', 'infrastructure', 'devops', 'sre',
      'servidor', 'server', 'kubernetes', 'docker', 'container', 'deploy', 'deployment',
      'ci', 'cd', 'pipeline', 'terraform', 'ansible', 'monitoramento', 'monitoring',
      'observability', 'observabilidade', 'log', 'logs', 'alerta', 'alert', 'incidente',
      'incident', 'oncall', 'backup', 'restore', 'network', 'rede', 'firewall',
      'seguranca', 'security', 'vulnerability', 'patch', 'inventario', 'inventory',
      'helpdesk', 'troubleshooting', 'sysadmin', 'cloud', 'aws', 'azure', 'gcp',
      // Vocabulário de engenharia de software e tooling de agentes de IA.
      // Motivo: o catálogo importado do GitHub é majoritariamente em inglês e
      // fala de "agent skills", "mcp", "cli", "sdk" — termos ausentes do léxico
      // original, o que empurrava 39 skills para "não classificada" ou, pior,
      // para departamentos aleatórios com confiança < 0.1.
      'agent', 'agents', 'agentic', 'skill', 'skills', 'mcp', 'llm', 'llms',
      'prompt', 'prompts', 'coding', 'code', 'developer', 'engineering',
      'framework', 'sdk', 'cli', 'api', 'apis', 'runtime', 'plugin', 'plugins',
      'typescript', 'javascript', 'python', 'rust', 'golang', 'compiler',
      'debugging', 'refactoring', 'tdd', 'testing', 'lint', 'git', 'github',
      'repo', 'orchestration', 'orquestracao', 'workflow', 'automation',
      'automacao', 'claude', 'codex', 'cursor', 'copilot', 'anthropic',
      'openai', 'gateway', 'webhook', 'http', 'client', 'server-side',
    ],
  },
  marketing: {
    id: 'marketing',
    label: 'Marketing',
    icon: '📣',
    coverageTarget: 12,
    lexicon: [
      'marketing', 'campanha', 'campaign', 'ads', 'anuncio', 'trafego', 'traffic',
      'seo', 'sem', 'conteudo', 'content', 'copywriting', 'copy', 'blog', 'newsletter',
      'email', 'social', 'instagram', 'facebook', 'linkedin', 'tiktok', 'youtube',
      'branding', 'marca', 'persona', 'audiencia', 'audience', 'engajamento',
      'analytics', 'conversao', 'conversion', 'landing', 'funil', 'growth',
      'influencer', 'ppc', 'adwords', 'meta', 'criativo', 'creative', 'brief',
    ],
  },
  juridico: {
    id: 'juridico',
    label: 'Jurídico / Compliance',
    icon: '⚖️',
    coverageTarget: 8,
    lexicon: [
      'juridico', 'legal', 'lawyer', 'advogado', 'contrato', 'contract', 'clausula',
      'clause', 'compliance', 'conformidade', 'lgpd', 'gdpr', 'privacidade', 'privacy',
      'termo', 'terms', 'politica', 'policy', 'regulatorio', 'regulatory', 'auditoria',
      'audit', 'litigio', 'litigation', 'processo', 'peticao', 'parecer', 'nda',
      'propriedade', 'intelectual', 'trademark', 'licenca', 'license', 'risco', 'risk',
    ],
  },
  logistica: {
    id: 'logistica',
    label: 'Logística / Expedição',
    icon: '📦',
    coverageTarget: 10,
    lexicon: [
      'logistica', 'logistics', 'expedicao', 'shipping', 'frete', 'freight', 'entrega',
      'delivery', 'transportadora', 'carrier', 'rastreio', 'tracking', 'estoque',
      'inventory', 'stock', 'armazem', 'warehouse', 'wms', 'picking', 'packing',
      'separacao', 'romaneio', 'lote', 'batch', 'fefo', 'fifo', 'ruptura', 'overflow',
      'supply', 'chain', 'suprimentos', 'compras', 'procurement', 'fornecedor',
      'supplier', 'correios', 'nfe', 'cte', 'roteirizacao', 'routing',
    ],
  },
  pos_venda: {
    id: 'pos_venda',
    label: 'Pós-venda / Suporte',
    icon: '🎧',
    coverageTarget: 10,
    lexicon: [
      'pos', 'venda', 'posvenda', 'suporte', 'support', 'atendimento', 'customer',
      'service', 'success', 'cs', 'helpdesk', 'ticket', 'chamado', 'sac', 'faq',
      'satisfacao', 'satisfaction', 'nps', 'csat', 'churn', 'retencao', 'retention',
      'reclamacao', 'complaint', 'garantia', 'warranty', 'troca', 'devolucao', 'refund',
      'zendesk', 'freshdesk', 'intercom', 'whatsapp', 'chatbot', 'escalation',
    ],
  },
  dados: {
    id: 'dados',
    label: 'Dados / BI',
    icon: '📊',
    coverageTarget: 12,
    lexicon: [
      'dados', 'data', 'bi', 'analytics', 'analise', 'analysis', 'dashboard',
      'relatorio', 'report', 'reporting', 'sql', 'query', 'etl', 'elt', 'pipeline',
      'warehouse', 'lakehouse', 'bigquery', 'snowflake', 'databricks', 'dbt',
      'metrica', 'metric', 'kpi', 'visualizacao', 'visualization', 'chart', 'grafico',
      'estatistica', 'statistics', 'machine', 'modelo', 'forecast',
      'pandas', 'notebook', 'rag', 'embedding', 'vector', 'semantic',
    ],
  },
  executivo: {
    id: 'executivo',
    label: 'Executivo / Estratégia',
    icon: '🎯',
    coverageTarget: 8,
    lexicon: [
      'executivo', 'executive', 'estrategia', 'strategy', 'strategic', 'ceo', 'cfo',
      'coo', 'cto', 'board', 'conselho', 'okr', 'kpi', 'planejamento', 'planning',
      'roadmap', 'meta', 'goal', 'governanca', 'governance', 'briefing', 'resumo',
      'summary', 'decisao', 'decision', 'competitivo', 'competitive', 'benchmark',
      'mercado', 'market', 'swot', 'investidor', 'investor', 'pitch',
    ],
  },
  transversal: {
    id: 'transversal',
    label: 'Transversal / Agregadores',
    icon: '🧩',
    coverageTarget: 8,
    lexicon: [
      'awesome', 'list', 'lists', 'curated', 'collection', 'collections',
      'cheatsheet', 'handbook', 'catalog', 'catalogo', 'directory', 'index',
      'compendium', 'bookmarks', 'links', 'showcase', 'hacktoberfest',
      'starter', 'boilerplate', 'repositorio', 'repository', 'agregador',
      'meta', 'generico', 'generic', 'misc', 'geral',
    ],
  },
};

/** Licenças permitidas para importação automática. */
export const ALLOWED_LICENSES = [
  'MIT',
  'MIT-0',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  'CC0-1.0',
  'Unlicense',
  '0BSD',
] as const;

/** Licenças bloqueadas explicitamente (copyleft forte). */
export const BLOCKED_LICENSES = [
  'GPL-2.0',
  'GPL-3.0',
  'AGPL-3.0',
  'LGPL-2.1',
  'LGPL-3.0',
  'SSPL-1.0',
  'BUSL-1.1',
] as const;

export function isLicenseAllowed(spdx: string | null | undefined): boolean {
  if (!spdx) return false;
  const normalized = spdx.trim().toUpperCase();
  return (ALLOWED_LICENSES as readonly string[]).some((l) => l.toUpperCase() === normalized);
}

export function isDepartment(value: string): value is SkillDepartment {
  return (SKILL_DEPARTMENTS as readonly string[]).includes(value);
}

export function departmentLabel(value: string | null | undefined): string {
  if (!value || !isDepartment(value)) return 'Não classificado';
  return DEPARTMENT_META[value].label;
}
