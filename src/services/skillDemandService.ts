/**
 * Skill Demand Service — cruza o Registry de skills com os vínculos ativos
 * template ↔ skill para medir a demanda real de cada skill.
 *
 * Leitura apenas: a agregação acontece no cliente porque ambos os conjuntos
 * são pequenos (centenas de linhas) e a política RLS de leitura já permite
 * qualquer usuário autenticado. Evita criar uma RPC só para um COUNT.
 */
import { supabaseExternal } from '@/integrations/supabase/externalClient';
import { logger } from '@/lib/logger';
import {
  buildSkillDemandRows,
  type DemandLinkInput,
  type DemandSkillInput,
  type SkillDemandRow,
} from '@/lib/skills/skillDemand';

/** Lê catálogo + vínculos e devolve as linhas de demanda já ordenadas. */
export async function fetchSkillDemand(): Promise<SkillDemandRow[]> {
  const [skillsResult, linksResult] = await Promise.all([
    supabaseExternal
      .from('skill_registry')
      .select('id, name, slug, department, quality_score, source_repo'),
    supabaseExternal
      .from('template_skill_links')
      .select('skill_id, template_id')
      .is('deleted_at', null),
  ]);

  if (skillsResult.error) {
    logger.error('fetchSkillDemand: skills failed', { error: skillsResult.error.message });
    throw new Error(skillsResult.error.message);
  }
  if (linksResult.error) {
    logger.error('fetchSkillDemand: links failed', { error: linksResult.error.message });
    throw new Error(linksResult.error.message);
  }

  return buildSkillDemandRows(
    (skillsResult.data ?? []) as unknown as DemandSkillInput[],
    (linksResult.data ?? []) as unknown as DemandLinkInput[],
  );
}
