/**
 * _shared/skills.ts — Injeção determinística de skills instaladas no runtime.
 *
 * Espelha `src/lib/promptCompiler.ts` (buildSkillsSection) para que o prompt
 * executado em produção seja idêntico ao pré-visualizado no Agent Builder.
 *
 * Garantias:
 *  - Sanitização (remove HTML/quebras de linha/controle) → sem prompt injection
 *    estrutural vindo do registry.
 *  - Deduplicação por id/nome e ordenação alfabética → prompt determinístico
 *    (cache-friendly e reprodutível em evals).
 *  - Limite defensivo de 25 skills → evita estouro de janela de contexto.
 *  - Falha suave: qualquer erro de banco retorna o prompt original.
 */

export const MAX_PROMPT_SKILLS = 25;

export interface RuntimeSkill {
  id?: string | null;
  name?: string | null;
  description?: string | null;
  category?: string | null;
}

function sanitizeSkillText(value: string, maxLen: number): string {
  const flat = value
    // Remove tags e caracteres de controle que poderiam quebrar a estrutura.
    .replace(/<[^>]*>/g, ' ')
    // deno-lint-ignore no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (flat.length <= maxLen) return flat;
  return `${flat.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

/** Constrói a seção markdown "## Skills disponíveis" (string vazia se não houver skills). */
export function buildSkillsSection(skills?: RuntimeSkill[] | null): string {
  if (!Array.isArray(skills) || skills.length === 0) return '';

  const seen = new Set<string>();
  const clean: Array<{ name: string; description: string; category: string }> = [];

  for (const skill of skills) {
    if (!skill) continue;
    const name = sanitizeSkillText(String(skill.name ?? ''), 80);
    if (!name) continue;
    const key = String(skill.id ?? name.toLowerCase()).trim();
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push({
      name,
      description: sanitizeSkillText(String(skill.description ?? ''), 160),
      category: sanitizeSkillText(String(skill.category ?? ''), 32),
    });
  }

  if (clean.length === 0) return '';

  clean.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const shown = clean.slice(0, MAX_PROMPT_SKILLS);
  const overflow = clean.length - shown.length;

  const lines = shown.map((s) => {
    const cat = s.category ? ` _(${s.category})_` : '';
    const desc = s.description ? ` — ${s.description}` : '';
    return `- **${s.name}**${cat}${desc}`;
  });

  if (overflow > 0) {
    lines.push(`- _(+${overflow} skill${overflow === 1 ? '' : 's'} adicionais não listadas)_`);
  }

  return ['## Skills disponíveis', '', ...lines].join('\n');
}

/** Anexa a seção de skills ao final de um system prompt, sem duplicar. */
export function appendSkillsToPrompt(systemPrompt: string, skills?: RuntimeSkill[] | null): string {
  const section = buildSkillsSection(skills);
  if (!section) return systemPrompt;
  if (systemPrompt.includes('## Skills disponíveis')) return systemPrompt;
  return `${systemPrompt.trimEnd()}\n\n${section}`;
}

/**
 * Carrega as skills instaladas de um agente. Nunca lança: em caso de erro,
 * retorna lista vazia para que a execução do agente continue.
 */
export async function loadAgentSkills(
  // deno-lint-ignore no-explicit-any -- cliente Supabase tipado dinamicamente na borda.
  supa: any,
  agentId: string,
): Promise<RuntimeSkill[]> {
  if (!agentId) return [];
  try {
    const { data, error } = await supa
      .from('agent_installed_skills')
      .select('skill_id, skill_registry:skill_id (id, name, description, category)')
      .eq('agent_id', agentId)
      .limit(100);
    if (error || !Array.isArray(data)) return [];
    return data
      .map((row: { skill_registry?: RuntimeSkill | null }) => row?.skill_registry ?? null)
      .filter((s: RuntimeSkill | null): s is RuntimeSkill => Boolean(s && s.name));
  } catch {
    return [];
  }
}
