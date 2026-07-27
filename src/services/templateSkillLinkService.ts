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
