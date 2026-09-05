/**
 * Template Skill Registry — ponte entre os templates de agentes especialistas
 * (`src/data/agentTemplates.ts`) e o Registry de Skills.
 *
 * Objetivo: permitir que os templates participem do mesmo motor de recomendação
 * usado pelas skills, habilitando sugestão automática por DEPARTAMENTO e por
 * OBJETIVO declarado pelo usuário — sem chamadas de rede e sem LLM.
 *
 * Os itens produzidos aqui são "virtuais": possuem prefixo `tpl:` no id e não
 * existem na tabela `skill_registry`, portanto NUNCA devem ser instalados via
 * `installSkill`. Use `isTemplateSkillId` para separar os dois mundos.
 */
import { AGENT_TEMPLATES, TEMPLATE_CATEGORIES, type AgentTemplate } from '@/data/agentTemplates';
import { DEPARTMENT_META } from '@/config/skill-departments';
import {
  isDepartmentCompatible,
  isGenericCatalogSkill,
  skillDepartmentsForTemplateCategory,
} from '@/config/department-bridge';
import type { AgentSkillDefinition } from './skillsRegistryService';
import { recommendSkills, type Recommendation } from './skillRecommenderService';

export const TEMPLATE_SKILL_PREFIX = 'tpl:';

export interface Department {
  /** Slug estável do departamento (ex.: 'ti'). */
  id: string;
  /** Rótulo exibido na UI (ex.: 'TI & Infraestrutura'). */
  label: string;
  icon: string;
}

/** Departamentos disponíveis, derivados das categorias de template. */
export const DEPARTMENTS: Department[] = TEMPLATE_CATEGORIES.map((c) => ({
  id: c.id,
  label: c.label,
  icon: c.icon,
}));

/**
 * Palavras-chave adicionais por departamento. Enriquecem o vocabulário do
 * matching para que objetivos escritos em linguagem natural cheguem ao
 * departamento certo mesmo sem usar o nome da categoria.
 */
const DEPARTMENT_KEYWORDS: Record<string, string[]> = {
  vendas: ['vendas', 'comercial', 'cliente', 'proposta', 'orcamento', 'negociacao', 'crm'],
  rh: ['rh', 'recrutamento', 'colaborador', 'folha', 'admissao', 'treinamento'],
  produtividade: ['produtividade', 'tarefa', 'agenda', 'rotina', 'organizacao'],
  estrategia: ['estrategia', 'okr', 'meta', 'planejamento', 'indicador'],
  marketing: ['marketing', 'trafego', 'campanha', 'anuncio', 'conteudo', 'seo', 'roas', 'funil'],
  avancado: ['avancado', 'tecnico', 'customizado', 'engenharia'],
  artes: ['arte', 'design', 'layout', 'criativo', 'gravacao'],
  financeiro: ['financeiro', 'custo', 'fluxo', 'caixa', 'cobranca', 'contabil', 'imposto'],
  juridico: ['juridico', 'contrato', 'compliance', 'lgpd', 'clausula', 'risco'],
  ia: ['automacao', 'workflow', 'integracao', 'agente', 'pipeline'],
  suprimentos: [
    'estoque',
    'compras',
    'fornecedor',
    'logistica',
    'expedicao',
    'lote',
    'ruptura',
    'inventario',
  ],
  gestao: ['gestao', 'processo', 'qualidade', 'auditoria', 'indicador'],
  pessoas: ['cultura', 'clima', 'bem', 'estar', 'coach', 'motivacao'],
  producao: ['producao', 'maquina', 'laser', 'dtf', 'operacao', 'fabrica'],
  ti: ['infraestrutura', 'suporte', 'rede', 'servidor', 'backup', 'chamado', 'troubleshooting'],
};

/** Mapeia o rótulo da categoria do template para o slug do departamento. */
const LABEL_TO_DEPARTMENT = new Map<string, string>(
  TEMPLATE_CATEGORIES.map((c) => [c.label.toLowerCase(), c.id]),
);

/** Resolve o departamento de um template a partir da sua categoria. */
export function resolveDepartmentId(template: AgentTemplate): string | undefined {
  return LABEL_TO_DEPARTMENT.get(template.category.toLowerCase());
}

/** Retorna as palavras-chave associadas a um departamento. */
export function getDepartmentKeywords(departmentId?: string): string[] {
  if (!departmentId) return [];
  return DEPARTMENT_KEYWORDS[departmentId] ?? [];
}

/** true quando o id pertence a um template virtual e não ao registry real. */
export function isTemplateSkillId(id: string): boolean {
  return id.startsWith(TEMPLATE_SKILL_PREFIX);
}

/** Extrai o id original do template a partir do id virtual. */
export function templateIdFromSkillId(id: string): string {
  return isTemplateSkillId(id) ? id.slice(TEMPLATE_SKILL_PREFIX.length) : id;
}

/**
 * Converte um template de agente em uma definição compatível com o registry,
 * enriquecendo as tags com o departamento e suas palavras-chave.
 */
export function templateToSkillDefinition(template: AgentTemplate): AgentSkillDefinition {
  const departmentId = resolveDepartmentId(template);
  const tags = Array.from(
    new Set([
      ...(template.tags ?? []),
      ...(departmentId ? [departmentId] : []),
      ...template.category.split(/[\s&]+/).filter(Boolean),
      ...getDepartmentKeywords(departmentId),
      ...template.config.tools,
    ]),
  );

  return {
    id: `${TEMPLATE_SKILL_PREFIX}${template.id}`,
    name: template.name,
    slug: template.id,
    description: template.description,
    version: '1.0.0',
    author: 'Nexus',
    category: 'prompts',
    tags,
    install_count: 0,
    rating: 0,
    skill_config: {
      source: 'agent_template',
      template_id: template.id,
      department: departmentId ?? null,
      persona: template.config.persona,
      model: template.config.model,
      tools: template.config.tools,
      memory_types: template.config.memory_types,
    },
    is_verified: true,
    is_public: true,
    created_at: new Date(0).toISOString(),
  };
}

/** Catálogo completo dos templates no formato do registry. */
export function buildTemplateSkillCatalog(): AgentSkillDefinition[] {
  return AGENT_TEMPLATES.map(templateToSkillDefinition);
}

/** Índice id-virtual → template original, para resolver a seleção na UI. */
export function buildTemplateIndex(): Map<string, AgentTemplate> {
  return new Map(AGENT_TEMPLATES.map((t) => [`${TEMPLATE_SKILL_PREFIX}${t.id}`, t]));
}

export interface TemplateRecommendationInput {
  /** Objetivo declarado pelo usuário, em linguagem natural. */
  objective: string;
  /** Filtro/impulso opcional por departamento. */
  departmentId?: string;
}

export interface TemplateRecommendation extends Recommendation {
  template: AgentTemplate;
  departmentId?: string;
}

/**
 * Recomenda templates de agente combinando objetivo + departamento.
 *
 * Quando `departmentId` é informado, apenas templates daquele departamento são
 * considerados e as palavras-chave do departamento reforçam o texto de busca.
 */
export function recommendTemplates(
  input: TemplateRecommendationInput,
  limit = 5,
): TemplateRecommendation[] {
  const index = buildTemplateIndex();
  const department = input.departmentId
    ? DEPARTMENTS.find((d) => d.id === input.departmentId)
    : undefined;

  let catalog = buildTemplateSkillCatalog();
  if (department) {
    catalog = catalog.filter(
      (s) => (s.skill_config as { department?: string | null }).department === department.id,
    );
  }
  if (catalog.length === 0) return [];

  const objective = input.objective.trim();
  const missionText = [
    objective,
    department?.label ?? '',
    getDepartmentKeywords(department?.id).join(' '),
  ]
    .join(' ')
    .trim();

  // Sem objetivo e sem departamento não há sinal suficiente para recomendar.
  if (!missionText) return [];

  const recommendations = recommendSkills({ mission: missionText }, catalog, limit);

  // Com departamento selecionado, garante retorno útil mesmo quando o objetivo
  // não gera interseção de tokens: completa com os templates do departamento.
  const results =
    recommendations.length > 0
      ? recommendations
      : catalog.slice(0, limit).map<Recommendation>((skill) => ({
          skill,
          score: 0,
          reason: department
            ? `Template do departamento ${department.label}`
            : 'Template disponível na galeria',
          matchedKeywords: [],
          breakdown: { keyword: 0, category: 0, weightedKeyword: 0, weightedCategory: 0 },
        }));

  return results.flatMap<TemplateRecommendation>((rec) => {
    const template = index.get(rec.skill.id);
    if (!template) return [];
    return [{ ...rec, template, departmentId: resolveDepartmentId(template) }];
  });
}

// ---------------------------------------------------------------------------
// Vínculo template → skills reais do Registry
// ---------------------------------------------------------------------------

/** Peso somado ao score por cada afinidade explícita encontrada. */
const AFFINITY_WEIGHT = 0.15;
/** Bônus quando o departamento da skill é compatível com a categoria do template. */
const DEPARTMENT_MATCH_WEIGHT = 0.35;
/** Fator multiplicador aplicado a repositórios "meta" (awesome-lists, coletâneas). */
const GENERIC_PENALTY = 0.25;
/** Score mínimo para considerar uma skill vinculada ao template. */
const LINK_THRESHOLD = 0.02;

export interface LinkedSkill extends Recommendation {
  /** Sinais explícitos que ligaram a skill ao template (tags, tools, departamento). */
  affinities: string[];
  /** true quando há afinidade explícita (não apenas similaridade textual). */
  isStrongMatch: boolean;
  /** true quando a skill é uma coletânea/lista curada, não uma skill executável. */
  isGenericCatalog: boolean;
  /** true quando o departamento da skill é compatível com a categoria do template. */
  departmentMatch: boolean;
}

/** Sinais canônicos de um template usados para casar com tags/slug de skills. */
export function buildTemplateSignals(template: AgentTemplate): string[] {
  const departmentId = resolveDepartmentId(template);
  const bridged = skillDepartmentsForTemplateCategory(departmentId);
  const bridgedLexicon = bridged.flatMap((d) => DEPARTMENT_META[d].lexicon);

  return Array.from(
    new Set(
      [
        ...(template.tags ?? []),
        ...template.config.tools,
        ...(template.config.memory_types ?? []),
        ...(departmentId ? [departmentId, ...getDepartmentKeywords(departmentId)] : []),
        ...bridged,
        ...bridgedLexicon,
      ]
        .map((s) =>
          s
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim(),
        )
        .filter((s) => s.length >= 3),
    ),
  );
}

/**
 * Vincula um template às skills reais do Registry.
 *
 * Combina o motor determinístico de recomendação (similaridade textual entre a
 * missão do template e nome/descrição/tags da skill) com afinidades explícitas
 * — tags, ferramentas, tipos de memória e departamento (via ponte de taxonomia)
 * — que recebem bônus de score. Repositórios "meta" (awesome-lists) são
 * penalizados e nunca contam como vínculo forte. Skills virtuais (`tpl:`) são
 * descartadas: elas não são instaláveis.
 */
export function linkSkillsToTemplate(
  template: AgentTemplate,
  registry: AgentSkillDefinition[],
  limit = 5,
): LinkedSkill[] {
  const installable = registry.filter((s) => !isTemplateSkillId(s.id));
  if (installable.length === 0) return [];

  const departmentId = resolveDepartmentId(template);
  const signals = buildTemplateSignals(template);
  const mission = [
    template.name,
    template.description,
    template.config.persona ?? '',
    template.category,
    signals.join(' '),
  ]
    .join(' ')
    .trim();

  const scored = recommendSkills(
    { mission, role: template.config.persona ?? undefined, tools: template.config.tools },
    installable,
    installable.length,
  );

  const byId = new Map(scored.map((r) => [r.skill.id, r]));

  const linked = installable.map<LinkedSkill>((skill) => {
    const base = byId.get(skill.id);
    const haystack = new Set(
      [skill.slug, ...(skill.tags ?? []), skill.category].filter(Boolean).map((s) =>
        s
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, ''),
      ),
    );
    const affinities = signals.filter((sig) => haystack.has(sig));
    const departmentMatch = isDepartmentCompatible(departmentId, skill.department ?? null);
    const isGenericCatalog = isGenericCatalogSkill(skill);

    const rawScore =
      (base?.score ?? 0) +
      affinities.length * AFFINITY_WEIGHT +
      (departmentMatch ? DEPARTMENT_MATCH_WEIGHT : 0);
    const score = isGenericCatalog ? rawScore * GENERIC_PENALTY : rawScore;

    const reason = departmentMatch
      ? `Mesmo departamento (${skill.department})`
      : affinities.length > 0
        ? `Afinidade com ${affinities.slice(0, 3).join(', ')}`
        : (base?.reason ?? 'Similaridade com a missão do template');

    return {
      skill,
      score,
      reason,
      matchedKeywords: base?.matchedKeywords ?? [],
      breakdown: base?.breakdown ?? {
        keyword: 0,
        category: 0,
        weightedKeyword: 0,
        weightedCategory: 0,
      },
      affinities,
      isGenericCatalog,
      departmentMatch,
      // Coletâneas nunca são vínculo forte: não são instaláveis como skill.
      isStrongMatch: !isGenericCatalog && (departmentMatch || affinities.length > 0),
    };
  });

  return linked
    .filter((l) => l.isStrongMatch || l.score >= LINK_THRESHOLD)
    .sort((a, b) => {
      // Vínculos fortes sempre acima dos meramente textuais.
      if (a.isStrongMatch !== b.isStrongMatch) return a.isStrongMatch ? -1 : 1;
      return b.score - a.score || (b.skill.install_count ?? 0) - (a.skill.install_count ?? 0);
    })
    .slice(0, limit);
}
