/**
 * Template Skill Link Service — persistência dos vínculos entre os templates
 * de agentes (`src/data/agentTemplates.ts`) e as skills reais do Registry.
 *
 * Por que persistir? O cálculo em `linkSkillsToTemplate` é determinístico, mas
 * percorre TODO o registry para cada template. Persistir o resultado permite
 * que a galeria e o wizard leiam os vínculos com uma única consulta indexada,
 * além de permitir curadoria manual (origin = 'manual') por cima do automático.
 *
 * Escrita exige admin de workspace (política RLS da tabela).
 */
import { supabaseExternal } from '@/integrations/supabase/externalClient';
import { AGENT_TEMPLATES } from '@/data/agentTemplates';
import { linkSkillsToTemplate } from './templateSkillRegistry';
import type { AgentSkillDefinition } from './skillsRegistryService';
import { logger } from '@/lib/logger';

/** Quantidade máxima de skills vinculadas por template. */
export const MAX_LINKS_PER_TEMPLATE = 6;

export interface TemplateSkillLink {
  id: string;
  template_id: string;
  skill_id: string;
  score: number;
  reason: string;
  is_strong_match: boolean;
  department_match: boolean;
  matched_keywords: string[];
  origin: 'auto' | 'manual';
  /** Autor da curadoria manual (NULL em vínculos automáticos). */
  created_by?: string | null;
  /** Último admin que alterou a curadoria (NULL em vínculos automáticos). */
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

/** Vínculo já resolvido com a skill correspondente, pronto para a UI. */
export interface ResolvedTemplateSkillLink extends TemplateSkillLink {
  skill: AgentSkillDefinition | null;
}


/**
 * Lê os vínculos persistidos de um template, do mais forte para o mais fraco.
 */
export async function fetchTemplateSkillLinks(
  templateId: string,
  limit = MAX_LINKS_PER_TEMPLATE,
): Promise<ResolvedTemplateSkillLink[]> {
  const { data, error } = await supabaseExternal
    .from('template_skill_links')
    .select('*, skill:skill_registry(*)')
    .eq('template_id', templateId)
    .order('is_strong_match', { ascending: false })
    .order('score', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('fetchTemplateSkillLinks failed', { templateId, error: error.message });
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => {
    const { skill, ...link } = row as unknown as TemplateSkillLink & {
      skill: AgentSkillDefinition | null;
    };
    return { ...link, skill: skill ?? null };
  });
}

/** Contagem de vínculos por template — usado nos badges da galeria. */
export async function fetchTemplateLinkCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabaseExternal
    .from('template_skill_links')
    .select('template_id');

  if (error) {
    logger.error('fetchTemplateLinkCounts failed', { error: error.message });
    throw new Error(error.message);
  }

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const id = (row as { template_id: string }).template_id;
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

/** Forma normalizada consumida pela UI, independente da origem do vínculo. */
export interface DisplayTemplateSkillLink {
  skillId: string;
  skillName: string;
  reason: string;
  isStrongMatch: boolean;
  origin: 'auto' | 'manual';
  /** Trilha de auditoria — presente apenas em curadoria manual. */
  curatedBy?: string | null;
  curatedAt?: string | null;
}


/**
 * Mescla vínculos persistidos com o cálculo local (fallback), garantindo:
 * 1. Curadoria manual sempre no topo e nunca descartada pelo limite;
 * 2. Deduplicação por `skillId` (manual vence auto);
 * 3. Ordenação estável: manual → match forte → score/ordem de entrada.
 *
 * Função pura: é ela que os cenários de simulação exercitam.
 */
export function mergeDisplayLinks(
  persisted: DisplayTemplateSkillLink[],
  computedFallback: DisplayTemplateSkillLink[],
  limit = MAX_LINKS_PER_TEMPLATE,
): DisplayTemplateSkillLink[] {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : MAX_LINKS_PER_TEMPLATE;

  // Só usamos o fallback quando não há NADA persistido — evita misturar um
  // recálculo local desatualizado com a curadoria salva pelo admin.
  const source = persisted.length > 0 ? persisted : computedFallback;

  const seen = new Set<string>();
  const manual: DisplayTemplateSkillLink[] = [];
  const auto: DisplayTemplateSkillLink[] = [];

  for (const link of source) {
    if (!link?.skillId || seen.has(link.skillId)) continue;
    seen.add(link.skillId);
    (link.origin === 'manual' ? manual : auto).push(link);
  }

  const sortedAuto = [...auto].sort(
    (a, b) => Number(b.isStrongMatch) - Number(a.isStrongMatch),
  );

  // Manuais nunca são cortados: o limite se aplica ao restante.
  return [...manual, ...sortedAuto.slice(0, Math.max(0, safeLimit - manual.length))];
}

/** Converte um vínculo persistido resolvido para a forma de exibição. */
export function toDisplayLink(link: ResolvedTemplateSkillLink): DisplayTemplateSkillLink | null {
  if (!link.skill) return null;
  const isManual = link.origin === 'manual';
  return {
    skillId: link.skill.id,
    skillName: link.skill.name,
    reason: link.reason,
    isStrongMatch: link.is_strong_match,
    origin: link.origin,
    // Auditoria só faz sentido na curadoria humana; o gatilho no banco
    // garante NULL para vínculos automáticos, mas normalizamos aqui também.
    curatedBy: isManual ? (link.updated_by ?? link.created_by ?? null) : null,
    curatedAt: isManual ? (link.updated_at ?? link.created_at ?? null) : null,
  };
}

/**
 * Renderiza a trilha de auditoria de um vínculo em PT-BR.
 * Retorna `null` quando não há curadoria manual a atribuir — a UI então não
 * exibe nada, em vez de mostrar um rótulo vazio ou "desconhecido".
 *
 * Função pura: exercitada pelos cenários de simulação.
 */
export function formatCurationTrail(
  link: Pick<DisplayTemplateSkillLink, 'origin' | 'curatedBy' | 'curatedAt'>,
  currentUserId?: string | null,
): string | null {
  if (link.origin !== 'manual') return null;
  if (!link.curatedBy && !link.curatedAt) return null;

  const autor = link.curatedBy
    ? link.curatedBy === currentUserId
      ? 'você'
      : `admin ${link.curatedBy.slice(0, 8)}`
    : null;

  let quando: string | null = null;
  if (link.curatedAt) {
    const data = new Date(link.curatedAt);
    if (!Number.isNaN(data.getTime())) {
      quando = data.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    }
  }

  if (autor && quando) return `Curado por ${autor} em ${quando}`;
  if (autor) return `Curado por ${autor}`;
  if (quando) return `Curado em ${quando}`;
  return null;
}


/**
 * Cria (ou promove) um vínculo manual entre um template e uma skill.
 * Requer admin de workspace — a RLS rejeita os demais.
 */
export async function addManualTemplateSkillLink(
  templateId: string,
  skillId: string,
  reason = 'Curadoria manual',
): Promise<void> {
  if (!templateId || !skillId) throw new Error('templateId e skillId são obrigatórios');

  const { error } = await supabaseExternal.from('template_skill_links').upsert(
    {
      template_id: templateId,
      skill_id: skillId,
      score: 1,
      reason,
      is_strong_match: true,
      department_match: false,
      matched_keywords: [],
      origin: 'manual',
    },
    { onConflict: 'template_id,skill_id' },
  );

  if (error) {
    logger.error('addManualTemplateSkillLink failed', { templateId, skillId, error: error.message });
    throw new Error(error.message);
  }
}

/** Remove um vínculo (manual ou automático) de um template. */
export async function removeTemplateSkillLink(
  templateId: string,
  skillId: string,
): Promise<void> {
  const { error } = await supabaseExternal
    .from('template_skill_links')
    .delete()
    .eq('template_id', templateId)
    .eq('skill_id', skillId);

  if (error) {
    logger.error('removeTemplateSkillLink failed', { templateId, skillId, error: error.message });
    throw new Error(error.message);
  }
}

export interface RebuildResult {
  templates: number;
  links: number;
  strongLinks: number;
  templatesWithoutLinks: string[];
}

/**
 * Recalcula e regrava TODOS os vínculos automáticos.
 *
 * Vínculos manuais (`origin = 'manual'`) são preservados: apenas as linhas
 * automáticas são removidas antes da regravação. Requer permissão de admin.
 */
export async function rebuildTemplateSkillLinks(
  limitPerTemplate = MAX_LINKS_PER_TEMPLATE,
): Promise<RebuildResult> {
  const { data: registryRows, error: registryError } = await supabaseExternal
    .from('skill_registry')
    .select('*')
    .eq('is_public', true);

  if (registryError) {
    logger.error('rebuildTemplateSkillLinks: registry read failed', {
      error: registryError.message,
    });
    throw new Error(registryError.message);
  }

  const registry = (registryRows ?? []) as unknown as AgentSkillDefinition[];
  const templatesWithoutLinks: string[] = [];
  const rows: Omit<TemplateSkillLink, 'id'>[] = [];

  for (const template of AGENT_TEMPLATES) {
    const links = linkSkillsToTemplate(template, registry, limitPerTemplate);
    if (links.length === 0) {
      templatesWithoutLinks.push(template.id);
      continue;
    }
    for (const link of links) {
      rows.push({
        template_id: template.id,
        skill_id: link.skill.id,
        score: Number(link.score.toFixed(3)),
        reason: link.reason,
        is_strong_match: link.isStrongMatch,
        department_match: link.departmentMatch,
        matched_keywords: Array.from(
          new Set([...link.affinities, ...link.matchedKeywords]),
        ).slice(0, 8),
        origin: 'auto',
      });
    }
  }

  const { error: deleteError } = await supabaseExternal
    .from('template_skill_links')
    .delete()
    .eq('origin', 'auto');

  if (deleteError) {
    logger.error('rebuildTemplateSkillLinks: cleanup failed', { error: deleteError.message });
    throw new Error(deleteError.message);
  }

  // Lotes evitam payloads grandes demais em registries extensos.
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabaseExternal
      .from('template_skill_links')
      .upsert(rows.slice(i, i + CHUNK), { onConflict: 'template_id,skill_id' });

    if (error) {
      logger.error('rebuildTemplateSkillLinks: write failed', { error: error.message });
      throw new Error(error.message);
    }
  }

  const result: RebuildResult = {
    templates: AGENT_TEMPLATES.length - templatesWithoutLinks.length,
    links: rows.length,
    strongLinks: rows.filter((r) => r.is_strong_match).length,
    templatesWithoutLinks,
  };

  logger.info('rebuildTemplateSkillLinks completed', result);
  return result;
}
