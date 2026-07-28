/**
 * Espelho Deno da lista canônica de departamentos.
 *
 * Deno não importa de `src/`, e importar de outra pasta de função não é
 * garantido no deploy — então a lista vive duplicada aqui. O teste
 * `src/test/skill-departments-parity.test.ts` lê este arquivo e falha no exato
 * commit que o separar de `src/config/skill-departments.ts`.
 *
 * Só os IDs: esta função não usa léxico (quem classifica é o LLM). O que
 * importa é que o veredito do modelo seja validado contra a MESMA taxonomia
 * que o frontend conhece — um departamento alucinado precisa ser rejeitado no
 * servidor, antes de virar uma proposta na tela do curador.
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

/** Descrições curtas para ancorar o modelo na semântica de cada balde. */
export const DEPARTMENT_HINT: Record<SkillDepartment, string> = {
  financeiro: 'contabilidade, faturamento, fluxo de caixa, impostos, folha de pagamento',
  comercial: 'vendas, CRM, leads, pipeline, propostas, prospecção',
  rh: 'recrutamento, admissão, avaliação de desempenho, treinamento, benefícios',
  ti: 'infraestrutura, DevOps, deploy, monitoramento, segurança, suporte técnico',
  marketing: 'campanhas, conteúdo, SEO, redes sociais, anúncios, branding',
  juridico: 'contratos, compliance, LGPD, pareceres, propriedade intelectual',
  logistica: 'expedição, frete, estoque, armazém, suprimentos, compras',
  pos_venda: 'suporte ao cliente, tickets, NPS, retenção, garantia, devolução',
  dados: 'BI, dashboards, SQL, ETL, métricas, modelagem, RAG e embeddings',
  executivo: 'estratégia, OKRs, planejamento, governança, análise competitiva',
  transversal:
    'AGREGADORES sem domínio de negócio: awesome-lists, catálogos, boilerplates, coletâneas',
};

export function isDepartment(value: unknown): value is SkillDepartment {
  return typeof value === 'string' && (SKILL_DEPARTMENTS as readonly string[]).includes(value);
}
