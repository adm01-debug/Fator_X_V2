/**
 * Cross-mapping entre os TIPOS do wizard rápido (`QuickAgentType`) e os
 * TEMPLATES da galeria (`AGENT_TEMPLATES`).
 *
 * Por quê? O wizard rápido recomendava skills apenas por similaridade textual
 * com a missão digitada — ignorando os vínculos já curados (e persistidos em
 * `template_skill_links`) para os blueprints equivalentes da galeria. Este mapa
 * permite reaproveitar essa curadoria: escolher "SDR" no wizard passa a herdar
 * as skills vinculadas aos templates de SDR/closer/inteligência de vendas.
 *
 * Regras de manutenção:
 * - Todo id listado aqui DEVE existir em `AGENT_TEMPLATES` (há teste guardando);
 * - A ordem importa: o primeiro template é o "canônico" do tipo e tem
 *   precedência no desempate de agregação.
 */
import { AGENT_TEMPLATES } from '@/data/agentTemplates';
import type { QuickAgentType } from '@/data/quickAgentTemplates';

export const QUICK_TYPE_TEMPLATE_MAP: Record<QuickAgentType, string[]> = {
  chatbot: ['customer_support', 'spec_posvenda_cx', 'onboarding'],
  copilot: ['spec_prompt_engineer', 'scheduler', 'email_triage'],
  analyst: ['document_analyst', 'report_generator', 'spec_financeiro_cpcr', 'spec_okr_kpi'],
  sdr: ['spec_vendas_sdr', 'lead_qualifier', 'spec_vendas_intel'],
  support: ['customer_support', 'spec_posvenda_cx', 'spec_ti_infra'],
  researcher: ['market_researcher', 'spec_vendas_intel', 'spec_marketing_performance'],
  orchestrator: ['multi_agent_blank', 'spec_processos_kaizen', 'spec_logistica'],
};

/** Conjunto de ids válidos — calculado uma vez, usado na sanitização abaixo. */
const VALID_TEMPLATE_IDS = new Set(AGENT_TEMPLATES.map((t) => t.id));

/**
 * Resolve os templates da galeria equivalentes a um tipo do wizard.
 *
 * Defensivo por design: ids removidos da galeria (refactor futuro) são
 * descartados silenciosamente em runtime em vez de gerar consulta inválida —
 * o teste de contrato é quem falha em CI para avisar o time.
 */
export function resolveQuickTypeTemplateIds(type: string): string[] {
  const ids = QUICK_TYPE_TEMPLATE_MAP[type as QuickAgentType];
  if (!ids) return [];
  return ids.filter((id) => VALID_TEMPLATE_IDS.has(id));
}
