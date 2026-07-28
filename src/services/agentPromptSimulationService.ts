/**
 * Contexto necessário para simular o prompt final de um agente.
 *
 * Lê o agente e as skills EFETIVAMENTE instaladas (`agent_installed_skills`
 * → `skill_registry`), na mesma forma que o runtime da borda usa em
 * `_shared/skills.ts::loadAgentSkills`. Qualquer divergência aqui tornaria a
 * pré-visualização inútil, então o shape das colunas é idêntico.
 */

import { supabaseExternal } from '@/integrations/supabase/externalClient';
import { logger } from '@/lib/logger';
import type { PromptSkill } from '@/lib/promptCompiler';

/** Teto de leitura — igual ao do runtime, para reproduzir o mesmo recorte. */
const INSTALLED_LIMIT = 100;

export interface AgentPromptContext {
  id: string;
  name: string;
  emoji: string;
  mission: string;
  persona: string;
  model: string;
  systemPrompt: string;
  skills: PromptSkill[];
}

export interface AgentOption {
  id: string;
  name: string;
}

/** Lista de agentes para o seletor do simulador. */
export async function fetchAgentOptions(): Promise<AgentOption[]> {
  const { data, error } = await supabaseExternal
    .from('agents')
    .select('id, name')
    .order('name', { ascending: true })
    .limit(200);

  if (error) {
    logger.error('fetchAgentOptions failed', { error: error.message });
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => ({ id: String(row.id), name: String(row.name ?? 'Sem nome') }));
}

function readConfigString(config: unknown, key: string): string {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) return '';
  const value = (config as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

interface InstalledRow {
  skill_registry?: {
    id?: string | null;
    name?: string | null;
    description?: string | null;
    category?: string | null;
  } | null;
}

/**
 * Carrega agente + skills instaladas.
 *
 * Usa `maybeSingle()`: um id inexistente (ou invisível pela RLS) é estado
 * legítimo da UI, não erro de infraestrutura.
 */
export async function fetchAgentPromptContext(agentId: string): Promise<AgentPromptContext | null> {
  if (!agentId) return null;

  const [agentRes, skillsRes] = await Promise.all([
    supabaseExternal
      .from('agents')
      .select('id, name, mission, persona, avatar_emoji, model, config')
      .eq('id', agentId)
      .maybeSingle(),
    supabaseExternal
      .from('agent_installed_skills')
      .select('skill_registry:skill_id (id, name, description, category)')
      .eq('agent_id', agentId)
      .limit(INSTALLED_LIMIT),
  ]);

  if (agentRes.error) {
    logger.error('fetchAgentPromptContext agent failed', { error: agentRes.error.message });
    throw new Error(agentRes.error.message);
  }
  if (skillsRes.error) {
    logger.error('fetchAgentPromptContext skills failed', { error: skillsRes.error.message });
    throw new Error(skillsRes.error.message);
  }
  if (!agentRes.data) return null;

  const agent = agentRes.data;
  const skills: PromptSkill[] = ((skillsRes.data ?? []) as unknown as InstalledRow[])
    .map((row) => row?.skill_registry ?? null)
    .filter((s): s is NonNullable<InstalledRow['skill_registry']> => Boolean(s?.name))
    .map((s) => ({
      id: s.id ? String(s.id) : undefined,
      name: String(s.name),
      description: s.description ? String(s.description) : undefined,
      category: s.category ? String(s.category) : undefined,
    }));

  return {
    id: String(agent.id),
    name: String(agent.name ?? ''),
    emoji: String(agent.avatar_emoji ?? '🤖'),
    mission: String(agent.mission ?? ''),
    persona: String(agent.persona ?? 'assistant'),
    model: String(agent.model ?? 'google/gemini-2.5-flash'),
    systemPrompt:
      readConfigString(agent.config, 'system_prompt') ||
      readConfigString(agent.config, 'prompt') ||
      String(agent.mission ?? ''),
    skills,
  };
}
