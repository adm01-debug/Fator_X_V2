/**
 * Ponte entre as DUAS taxonomias de departamento do Nexus.
 *
 * 1. `TEMPLATE_CATEGORIES` (src/data/agentTemplates.ts) — categorias dos
 *    templates de agentes especialistas: `vendas`, `pessoas`, `suprimentos`…
 * 2. `SKILL_DEPARTMENTS` (src/config/skill-departments.ts) — taxonomia canônica
 *    usada pelo harvester/classificador: `comercial`, `rh`, `logistica`…
 *
 * Sem esta ponte o motor de vínculo template → skill nunca encontra afinidade
 * explícita (uma skill classificada como `comercial` jamais casa com um
 * template da categoria `vendas`), e a recomendação degrada para similaridade
 * textual pura — que é dominada por repositórios genéricos.
 *
 * Regras de manutenção:
 * - Toda categoria de template DEVE aparecer aqui (garantido por teste).
 * - Todo departamento de skill DEVE ser alcançável por ao menos uma categoria.
 */
import { SKILL_DEPARTMENTS, type SkillDepartment } from '@/config/skill-departments';

/** Categoria de template → departamentos de skill equivalentes, em ordem de afinidade. */
export const TEMPLATE_CATEGORY_TO_SKILL_DEPARTMENTS: Record<string, SkillDepartment[]> = {
  vendas: ['comercial', 'pos_venda'],
  rh: ['rh'],
  pessoas: ['rh'],
  produtividade: ['executivo', 'dados', 'transversal'],
  estrategia: ['executivo', 'dados'],
  marketing: ['marketing'],
  avancado: ['ti', 'dados', 'transversal'],
  artes: ['marketing'],
  financeiro: ['financeiro'],
  juridico: ['juridico'],
  ia: ['ti', 'dados', 'transversal'],
  suprimentos: ['logistica', 'financeiro'],
  gestao: ['executivo', 'dados'],
  producao: ['logistica', 'ti'],
  ti: ['ti'],
};

/** Índice inverso: departamento de skill → categorias de template. */
export const SKILL_DEPARTMENT_TO_TEMPLATE_CATEGORIES: Record<SkillDepartment, string[]> =
  SKILL_DEPARTMENTS.reduce(
    (acc, dep) => {
      acc[dep] = Object.entries(TEMPLATE_CATEGORY_TO_SKILL_DEPARTMENTS)
        .filter(([, deps]) => deps.includes(dep))
        .map(([category]) => category);
      return acc;
    },
    {} as Record<SkillDepartment, string[]>,
  );

/** Departamentos de skill equivalentes a uma categoria de template. */
export function skillDepartmentsForTemplateCategory(categoryId?: string): SkillDepartment[] {
  if (!categoryId) return [];
  return TEMPLATE_CATEGORY_TO_SKILL_DEPARTMENTS[categoryId] ?? [];
}

/** true quando a skill pertence (direta ou indiretamente) à categoria do template. */
export function isDepartmentCompatible(
  templateCategoryId: string | undefined,
  skillDepartment?: string | null,
): boolean {
  if (!templateCategoryId || !skillDepartment) return false;
  return skillDepartmentsForTemplateCategory(templateCategoryId).includes(
    skillDepartment as SkillDepartment,
  );
}

/**
 * Padrões de repositórios "meta" — listas curadas, coletâneas e livros de
 * links. São úteis como leitura, mas NÃO são skills instaláveis: sem esta
 * penalização eles dominam qualquer ranking por casarem com todo vocabulário.
 */
const GENERIC_PATTERNS = [
  /\bawesome\b/,
  /\bawesome-/,
  /-awesome\b/,
  /\bbook-of\b/,
  /\bcurated\b/,
  /\bcollection\b/,
  /\bcheat-?sheet\b/,
  /\blist-of\b/,
  /\bresources?\b$/,
];

/** true quando o repositório é uma coletânea/lista e não uma skill executável. */
export function isGenericCatalogSkill(input: {
  name?: string;
  slug?: string;
  description?: string;
  tags?: string[];
}): boolean {
  const haystack = [input.name ?? '', input.slug ?? '', input.description?.slice(0, 200) ?? '']
    .join(' ')
    .toLowerCase();
  if (GENERIC_PATTERNS.some((re) => re.test(haystack))) return true;
  const tags = (input.tags ?? []).map((t) => t.toLowerCase());
  return (
    tags.includes('awesome') || tags.includes('awesome-list') || tags.includes('awesome-lists')
  );
}
