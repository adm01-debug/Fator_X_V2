/**
 * Skills Registry Service — Foundation for Agent Skills Marketplace
 * Inspired by LobeHub Skills, akm, OpenClaw skill repos
 */

import { supabaseExternal } from '@/integrations/supabase/externalClient';

export interface AgentSkillDefinition {
  id: string;
  name: string;
  slug: string;
  description: string;
  version: string;
  author: string;
  category: 'tools' | 'knowledge' | 'prompts' | 'workflows' | 'integrations';
  tags: string[];
  install_count: number;
  rating: number;
  skill_config: Record<string, unknown>;
  mcp_server_url?: string;
  is_verified: boolean;
  is_public: boolean;
  created_at: string;
  /** Departamento canônico (taxonomia SKILL_DEPARTMENTS). Preenchido pelo harvester. */
  department?: string | null;
  /** Nota de qualidade 0..100 atribuída na coleta. */
  quality_score?: number;
  /** Origem: `owner/repo` quando a skill foi portada de terceiros. */
  source_repo?: string | null;
  /** Origem: URL canônica do material de referência. */
  source_url?: string | null;
  /** Licença declarada da origem (SPDX quando reconhecida). */
  source_license?: string | null;
}


// List available skills from registry
export async function listSkills(options?: {
  category?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<{ skills: AgentSkillDefinition[]; total: number }> {
  const { category, search, page = 1, limit = 20 } = options || {};

  let query = supabaseExternal
    .from('skill_registry')
    .select('*', { count: 'exact' })
    .eq('is_public', true)
    .order('install_count', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (category) query = query.eq('category', category);
  if (search) query = query.ilike('name', `%${search}%`);

  const { data, error, count } = await query;
  if (error) throw error;
  return { skills: (data ?? []) as unknown as AgentSkillDefinition[], total: count || 0 };
}

/**
 * Busca skills por IDs (chunked para evitar URLs longas no PostgREST).
 * Usado no preview/teste do wizard para injetar skills no prompt antes de salvar.
 */
export async function getSkillsByIds(ids: string[]): Promise<AgentSkillDefinition[]> {
  const unique = Array.from(new Set(ids.filter((id) => typeof id === 'string' && id.length > 0)));
  if (unique.length === 0) return [];

  const CHUNK = 50;
  const out: AgentSkillDefinition[] = [];
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const { data, error } = await supabaseExternal
      .from('skill_registry')
      .select('*')
      .in('id', chunk);
    if (error) throw error;
    out.push(...((data ?? []) as unknown as AgentSkillDefinition[]));
  }
  return out;
}

// Install a skill for an agent
export interface BulkInstallResult {
  /** Ids efetivamente inseridos nesta chamada. */
  installed: string[];
  /** Ids ignorados por já estarem instalados (ou repetidos no lote). */
  skipped: string[];
}

/** Limite defensivo de ids por lote (evita payloads absurdos vindos de drafts). */
export const MAX_BULK_INSTALL = 100;

/** Normaliza: remove não-strings, espaços, vazios, duplicatas e aplica limite. */
export function normalizeSkillIdList(ids: readonly unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    if (typeof raw !== 'string') continue;
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_BULK_INSTALL) break;
  }
  return out;
}

/**
 * Instala uma única skill. Retorna `true` quando a linha foi realmente inserida
 * e `false` quando a skill já estava instalada (no-op idempotente).
 */
export async function installSkill(agentId: string, skillId: string): Promise<boolean> {
  const { installed } = await bulkInstallSkills(agentId, [skillId]);
  return installed.length > 0;
}


/**
 * Instala skills em lote de forma **idempotente**.
 *
 * Usa UPSERT com `ignoreDuplicates` sobre a constraint UNIQUE (agent_id, skill_id),
 * de modo que reinstalar uma skill já presente não aborta o lote inteiro
 * (comportamento anterior: erro 23505 derrubava todas as instalações válidas).
 * Os contadores de instalação são incrementados apenas para as linhas realmente
 * inseridas e em modo best-effort — falha de telemetria nunca invalida a operação.
 */
export async function bulkInstallSkills(
  agentId: string,
  skillIds: readonly string[],
): Promise<BulkInstallResult> {
  const requested = normalizeSkillIdList(skillIds);
  if (requested.length === 0) return { installed: [], skipped: [] };

  const rows = requested.map((skill_id) => ({ agent_id: agentId, skill_id }));
  const { data, error } = await supabaseExternal
    .from('agent_installed_skills')
    .upsert(rows, { onConflict: 'agent_id,skill_id', ignoreDuplicates: true })
    .select('skill_id');
  if (error) throw error;

  const installed = (data ?? [])
    .map((r) => (r as { skill_id: string }).skill_id)
    .filter((id): id is string => typeof id === 'string');
  const installedSet = new Set(installed);
  const skipped = requested.filter((id) => !installedSet.has(id));

  if (installed.length > 0) {
    await Promise.allSettled(
      installed.map((id) => supabaseExternal.rpc('increment_skill_installs', { p_skill_id: id })),
    );
  }
  return { installed, skipped };
}


// Get installed skills for an agent
export async function getInstalledSkills(agentId: string): Promise<AgentSkillDefinition[]> {
  const { data, error } = await supabaseExternal
    .from('agent_installed_skills')
    .select('skill_id, skill_registry(*)')
    .eq('agent_id', agentId);
  if (error) throw error;
  return (data ?? []).map((d) => d.skill_registry as unknown as AgentSkillDefinition);
}

// Uninstall a skill
export async function uninstallSkill(agentId: string, skillId: string): Promise<void> {
  await bulkUninstallSkills(agentId, [skillId]);
}

/**
 * Remove skills em lote em uma única round-trip (`DELETE ... WHERE skill_id IN (...)`),
 * evitando N chamadas sequenciais e estados parcialmente aplicados.
 * Retorna os ids efetivamente removidos (sanitizados e deduplicados).
 */
export async function bulkUninstallSkills(
  agentId: string,
  skillIds: readonly string[],
): Promise<string[]> {
  const requested = normalizeSkillIdList(skillIds as unknown[]);
  if (requested.length === 0) return [];

  const { data, error } = await supabaseExternal
    .from('agent_installed_skills')
    .delete()
    .eq('agent_id', agentId)
    .in('skill_id', requested)
    .select('skill_id');
  if (error) throw error;

  return (data ?? [])
    .map((r) => (r as { skill_id: string }).skill_id)
    .filter((id): id is string => typeof id === 'string');
}


// Publish a skill to the registry
export async function publishSkill(skill: Omit<AgentSkillDefinition, 'id' | 'install_count' | 'rating' | 'created_at'>): Promise<AgentSkillDefinition> {
  const { data, error } = await supabaseExternal
    .from('skill_registry')
    .insert([{
      name: skill.name,
      slug: skill.slug,
      description: skill.description,
      version: skill.version,
      author: skill.author,
      category: skill.category,
      tags: skill.tags,
      skill_config: skill.skill_config as Record<string, unknown> & { [key: string]: string | number | boolean | null },
      mcp_server_url: skill.mcp_server_url ?? null,
      is_verified: false,
      is_public: skill.is_public,
    }])
    .select()
    .single();
  if (error) throw error;
  return data as unknown as AgentSkillDefinition;
}

// Built-in skill categories
export const SKILL_CATEGORIES = [
  { id: 'tools', name: 'Ferramentas', icon: '🔧', description: 'APIs, webhooks, integrações' },
  { id: 'knowledge', name: 'Conhecimento', icon: '📚', description: 'RAG, bases de conhecimento' },
  { id: 'prompts', name: 'Prompts', icon: '💬', description: 'Templates e chains de prompt' },
  { id: 'workflows', name: 'Workflows', icon: '⚡', description: 'Automações pré-construídas' },
  { id: 'integrations', name: 'Integrações', icon: '🔗', description: 'Conectores externos' },
] as const;

/**
 * Diff determinístico entre o conjunto instalado e a nova seleção do picker.
 * Sanitiza ids, deduplica e nunca marca o mesmo id em `toAdd` e `toRemove`.
 */
export function computeSkillSelectionDiff(
  installedIds: readonly string[],
  nextIds: readonly string[],
): { toAdd: string[]; toRemove: string[] } {
  const installed = normalizeSkillIdList(installedIds as unknown[]);
  const next = normalizeSkillIdList(nextIds as unknown[]);
  const installedSet = new Set(installed);
  const nextSet = new Set(next);
  return {
    toAdd: next.filter((id) => !installedSet.has(id)),
    toRemove: installed.filter((id) => !nextSet.has(id)),
  };
}
