/**
 * Carga de skills por agente para o detector de estouro do teto.
 *
 * Estratégia deliberada: uma única leitura de `agent_installed_skills` com o
 * join mínimo (`skill_registry.name`), agregada no cliente. O motivo de não
 * usar `count` do PostgREST é que o runtime descarta skills sem nome e
 * deduplica por nome normalizado — um COUNT(*) cru reportaria estouro onde
 * não há, e alarme falso destrói a confiança no painel mais rápido do que
 * alarme nenhum.
 */

import { supabaseExternal } from '@/integrations/supabase/externalClient';
import { logger } from '@/lib/logger';
import type { AgentSkillLoad } from '@/lib/skills/promptOverflowAlert';

/** Teto de leitura: o mesmo do simulador, para o recorte ser comparável. */
const ROW_LIMIT = 5000;

interface LoadRow {
  agent_id?: string | null;
  skill_registry?: { name?: string | null } | null;
}

/** Normalização idêntica à do compilador (case/acentos/espaços). */
function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export async function fetchAgentSkillLoads(): Promise<AgentSkillLoad[]> {
  const [agentsRes, installedRes] = await Promise.all([
    supabaseExternal.from('agents').select('id, name').limit(500),
    supabaseExternal
      .from('agent_installed_skills')
      .select('agent_id, skill_registry:skill_id (name)')
      .limit(ROW_LIMIT),
  ]);

  if (agentsRes.error) {
    logger.error('fetchAgentSkillLoads agents failed', { error: agentsRes.error.message });
    throw new Error(agentsRes.error.message);
  }
  if (installedRes.error) {
    logger.error('fetchAgentSkillLoads installed failed', { error: installedRes.error.message });
    throw new Error(installedRes.error.message);
  }

  // Set por agente: dedup por nome normalizado, ignorando nomes vazios.
  const porAgente = new Map<string, Set<string>>();
  for (const row of (installedRes.data ?? []) as unknown as LoadRow[]) {
    const agentId = row?.agent_id ? String(row.agent_id) : '';
    const nome = normalizeName(String(row?.skill_registry?.name ?? ''));
    if (agentId === '' || nome === '') continue;
    const set = porAgente.get(agentId) ?? new Set<string>();
    set.add(nome);
    porAgente.set(agentId, set);
  }

  return (agentsRes.data ?? []).map((a) => ({
    agentId: String(a.id),
    agentName: String(a.name ?? 'Sem nome'),
    installed: porAgente.get(String(a.id))?.size ?? 0,
  }));
}
