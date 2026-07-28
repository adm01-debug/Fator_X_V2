/**
 * Espelho da taxonomia de departamentos para o runtime Deno.
 *
 * ⚠️ Mantido em sincronia com `src/config/skill-departments.ts`.
 * O teste `src/test/skill-departments-parity.test.ts` falha se divergirem.
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

export const DEPARTMENT_LEXICON: Record<SkillDepartment, string[]> = {
  financeiro: [
    'financeiro', 'finance', 'financial', 'contabil', 'contabilidade', 'accounting',
    'fatura', 'faturamento', 'invoice', 'invoicing', 'billing', 'cobranca', 'dunning',
    'fluxo', 'caixa', 'cashflow', 'orcamento', 'budget', 'despesa', 'expense',
    'conciliacao', 'reconciliation', 'ledger', 'balancete', 'dre', 'tax', 'imposto',
    'tributario', 'nfe', 'nota', 'fiscal', 'payroll', 'folha', 'pagamento', 'payment',
    'receivable', 'payable', 'stripe', 'quickbooks', 'xero', 'erp',
  ],
  comercial: [
    'comercial', 'vendas', 'sales', 'crm', 'lead', 'leads', 'prospect', 'prospeccao',
    'prospecting', 'pipeline', 'funil', 'funnel', 'deal', 'negocio', 'oportunidade',
    'opportunity', 'proposta', 'proposal', 'quote', 'orcamento', 'cotacao',
    'cadence', 'cadencia', 'outreach', 'outbound', 'inbound', 'sdr', 'closer',
    'bitrix', 'hubspot', 'salesforce', 'pipedrive', 'zoho', 'forecast', 'quota',
    'icp', 'scoring', 'enrichment', 'enriquecimento',
  ],
  rh: [
    'rh', 'hr', 'recursos', 'humanos', 'human', 'resources', 'people', 'talento',
    'talent', 'recrutamento', 'recruiting', 'recruitment', 'vaga', 'vacancy', 'job',
    'candidato', 'candidate', 'curriculo', 'resume', 'cv', 'entrevista', 'interview',
    'onboarding', 'offboarding', 'admissao', 'desligamento', 'colaborador', 'employee',
    'clima', 'engajamento', 'engagement', 'performance', 'avaliacao', 'feedback',
    'treinamento', 'training', 'ponto', 'ferias', 'beneficios', 'benefits', 'ats',
  ],
  ti: [
    'ti', 'it', 'infra', 'infraestrutura', 'infrastructure', 'devops', 'sre',
    'servidor', 'server', 'kubernetes', 'docker', 'container', 'deploy', 'deployment',
    'ci', 'cd', 'pipeline', 'terraform', 'ansible', 'monitoramento', 'monitoring',
    'observability', 'observabilidade', 'log', 'logs', 'alerta', 'alert', 'incidente',
    'incident', 'oncall', 'backup', 'restore', 'network', 'rede', 'firewall',
    'seguranca', 'security', 'vulnerability', 'patch', 'inventario', 'inventory',
    'helpdesk', 'troubleshooting', 'sysadmin', 'cloud', 'aws', 'azure', 'gcp',
  ],
  marketing: [
    'marketing', 'campanha', 'campaign', 'ads', 'anuncio', 'trafego', 'traffic',
    'seo', 'sem', 'conteudo', 'content', 'copywriting', 'copy', 'blog', 'newsletter',
    'email', 'social', 'instagram', 'facebook', 'linkedin', 'tiktok', 'youtube',
    'branding', 'marca', 'persona', 'audiencia', 'audience', 'engajamento',
    'analytics', 'conversao', 'conversion', 'landing', 'funil', 'growth',
    'influencer', 'ppc', 'adwords', 'meta', 'criativo', 'creative', 'brief',
  ],
  juridico: [
    'juridico', 'legal', 'lawyer', 'advogado', 'contrato', 'contract', 'clausula',
    'clause', 'compliance', 'conformidade', 'lgpd', 'gdpr', 'privacidade', 'privacy',
    'termo', 'terms', 'politica', 'policy', 'regulatorio', 'regulatory', 'auditoria',
    'audit', 'litigio', 'litigation', 'processo', 'peticao', 'parecer', 'nda',
    'propriedade', 'intelectual', 'trademark', 'licenca', 'license', 'risco', 'risk',
  ],
  logistica: [
    'logistica', 'logistics', 'expedicao', 'shipping', 'frete', 'freight', 'entrega',
    'delivery', 'transportadora', 'carrier', 'rastreio', 'tracking', 'estoque',
    'inventory', 'stock', 'armazem', 'warehouse', 'wms', 'picking', 'packing',
    'separacao', 'romaneio', 'lote', 'batch', 'fefo', 'fifo', 'ruptura', 'overflow',
    'supply', 'chain', 'suprimentos', 'compras', 'procurement', 'fornecedor',
    'supplier', 'correios', 'nfe', 'cte', 'roteirizacao', 'routing',
  ],
  pos_venda: [
    'pos', 'venda', 'posvenda', 'suporte', 'support', 'atendimento', 'customer',
    'service', 'success', 'cs', 'helpdesk', 'ticket', 'chamado', 'sac', 'faq',
    'satisfacao', 'satisfaction', 'nps', 'csat', 'churn', 'retencao', 'retention',
    'reclamacao', 'complaint', 'garantia', 'warranty', 'troca', 'devolucao', 'refund',
    'zendesk', 'freshdesk', 'intercom', 'whatsapp', 'chatbot', 'escalation',
  ],
  dados: [
    'dados', 'data', 'bi', 'analytics', 'analise', 'analysis', 'dashboard',
    'relatorio', 'report', 'reporting', 'sql', 'query', 'etl', 'elt', 'pipeline',
    'warehouse', 'lakehouse', 'bigquery', 'snowflake', 'databricks', 'dbt',
    'metrica', 'metric', 'kpi', 'visualizacao', 'visualization', 'chart', 'grafico',
    'estatistica', 'statistics', 'machine', 'learning', 'modelo', 'forecast',
    'pandas', 'notebook', 'rag', 'embedding', 'vector', 'semantic',
  ],
  executivo: [
    'executivo', 'executive', 'estrategia', 'strategy', 'strategic', 'ceo', 'cfo',
    'coo', 'cto', 'board', 'conselho', 'okr', 'kpi', 'planejamento', 'planning',
    'roadmap', 'meta', 'goal', 'governanca', 'governance', 'briefing', 'resumo',
    'summary', 'decisao', 'decision', 'competitivo', 'competitive', 'benchmark',
    'mercado', 'market', 'swot', 'investidor', 'investor', 'pitch',
  ],
  transversal: [
    'awesome', 'list', 'lists', 'curated', 'collection', 'collections',
    'cheatsheet', 'handbook', 'catalog', 'catalogo', 'directory', 'index',
    'compendium', 'bookmarks', 'links', 'showcase', 'hacktoberfest',
    'starter', 'boilerplate', 'repositorio', 'repository', 'agregador',
    'meta', 'generico', 'generic', 'misc', 'geral',
  ],
};

export const ALLOWED_LICENSES = [
  'MIT', 'MIT-0', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause',
  'ISC', 'CC0-1.0', 'Unlicense', '0BSD',
];

export const BLOCKED_LICENSES = [
  'GPL-2.0', 'GPL-3.0', 'AGPL-3.0', 'LGPL-2.1', 'LGPL-3.0', 'SSPL-1.0', 'BUSL-1.1',
];

export function isLicenseAllowed(spdx: string | null | undefined): boolean {
  if (!spdx) return false;
  const n = spdx.trim().toUpperCase();
  return ALLOWED_LICENSES.some((l) => l.toUpperCase() === n);
}

/** Queries semente por departamento (PT-BR + EN). */
export const DEPARTMENT_QUERIES: Record<SkillDepartment, string[]> = {
  financeiro: ['finance agent skill', 'accounting ai agent', 'agente financeiro llm', 'invoice automation agent'],
  comercial: ['sales agent skill', 'crm ai agent', 'agente de vendas llm', 'sales automation agent'],
  rh: ['hr agent skill', 'recruiting ai agent', 'agente rh llm', 'resume screening agent'],
  ti: ['devops agent skill', 'sre ai agent', 'infrastructure agent llm', 'incident response agent'],
  marketing: ['marketing agent skill', 'content marketing ai agent', 'seo agent llm', 'ads optimization agent'],
  juridico: ['legal agent skill', 'contract analysis ai agent', 'compliance agent llm'],
  logistica: ['logistics agent skill', 'supply chain ai agent', 'inventory agent llm', 'shipping automation agent'],
  pos_venda: ['customer support agent skill', 'customer success ai agent', 'helpdesk agent llm'],
  dados: ['data analyst agent skill', 'sql ai agent', 'bi agent llm', 'analytics agent'],
  executivo: ['executive assistant agent skill', 'strategy ai agent', 'okr agent llm'],
};

/** Tópicos GitHub padrão da varredura. */
export const DEFAULT_TOPICS = [
  'agent-skills',
  'claude-skills',
  'ai-agent-skills',
  'awesome-agents',
  'mcp-servers',
  'llm-tools',
  'ai-agents',
  'agent-tools',
];

/** Busca por código (GitHub code search). */
export const CODE_QUERIES = [
  'path:**/SKILL.md',
  'filename:agent.json ai agent',
  'path:.claude/skills',
];
