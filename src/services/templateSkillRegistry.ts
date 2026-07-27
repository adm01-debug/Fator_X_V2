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
  suprimentos: ['estoque', 'compras', 'fornecedor', 'logistica', 'expedicao', 'lote', 'ruptura', 'inventario'],
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
  const missionText = [objective, department?.label ?? '', getDepartmentKeywords(department?.id).join(' ')]
    .join(' ')
    .trim();

  // Sem objetivo e sem departamento não há sinal suficiente para recomendar.
  if (!missionText) return [];

  const recommendations = recommendSkills({ mission: missionText }, catalog, limit);

  // Com departamento selecionado, garante retorno útil mesmo quando o objetivo
  // não gera interseção de tokens: completa com os templates do departamento.
  const results = recommendations.length > 0
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
