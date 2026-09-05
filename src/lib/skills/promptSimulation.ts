/**
 * Simulação do prompt final compilado com as skills instaladas.
 *
 * Camada PURA — reproduz exatamente `src/lib/promptCompiler.ts` (que por sua
 * vez é espelhado por `supabase/functions/_shared/skills.ts`) e, além do texto
 * final, devolve o DIAGNÓSTICO de tudo que o compilador silenciosamente faz:
 *
 *   - descarte de entradas sem nome utilizável
 *   - deduplicação por id (fallback: nome normalizado)
 *   - sanitização (HTML, controle, quebras de linha) e truncamento
 *   - corte em MAX_PROMPT_SKILLS com lista do que ficou de fora
 *
 * Sem esse diagnóstico o curador vê "30 skills instaladas" na UI e não entende
 * por que o agente só conhece 25 — o objetivo aqui é tornar o corte visível.
 */

import {
  compilePrompt,
  MAX_PROMPT_SKILLS,
  type CompiledPrompt,
  type CompilePromptInput,
} from '@/lib/promptCompiler';

export { MAX_PROMPT_SKILLS };

/** Limites por campo aplicados pelo compilador (espelhados aqui p/ diagnóstico). */
export const NAME_MAX_LEN = 80;
export const DESCRIPTION_MAX_LEN = 160;
export const CATEGORY_MAX_LEN = 32;

export type SanitizationKind = 'html' | 'controle' | 'quebra_linha' | 'truncado';

export const SANITIZATION_LABEL: Record<SanitizationKind, string> = {
  html: 'HTML removido',
  controle: 'Caracteres de controle',
  quebra_linha: 'Quebras de linha achatadas',
  truncado: 'Texto truncado',
};

export type SkillDisposition = 'injetada' | 'overflow' | 'duplicada' | 'descartada';

export interface SimulatedSkill {
  /** Índice de entrada — mantém rastreabilidade mesmo após ordenação. */
  inputIndex: number;
  id: string | null;
  /** Nome após sanitização (vazio quando descartada). */
  name: string;
  originalName: string;
  description: string;
  category: string;
  disposition: SkillDisposition;
  /** Transformações aplicadas em qualquer um dos campos. */
  sanitizations: SanitizationKind[];
  /** Linha markdown gerada — `null` quando não entrou no prompt. */
  line: string | null;
}

export interface PromptSimulationDiagnostics {
  /** Skills recebidas na entrada. */
  received: number;
  /** Entradas sem nome aproveitável. */
  discarded: number;
  /** Entradas removidas por já existir a mesma chave. */
  duplicates: number;
  /** Skills que sobreviveram ao saneamento (antes do corte). */
  eligible: number;
  /** Skills efetivamente listadas no prompt. */
  injected: number;
  /** Skills cortadas pelo teto de MAX_PROMPT_SKILLS. */
  overflow: number;
  /** `true` quando o teto foi atingido. */
  overflowed: boolean;
  /** Quantas skills sofreram alguma sanitização. */
  sanitized: number;
  /** Contagem por tipo de sanitização. */
  sanitizationsByKind: Record<SanitizationKind, number>;
}

export interface PromptSimulationResult {
  compiled: CompiledPrompt;
  /** Seção "## Skills disponíveis" isolada; vazia quando não há skills. */
  skillsSection: string;
  /** Tokens estimados só da seção de skills. */
  skillsTokens: number;
  /** Tokens estimados do prompt sem a seção de skills. */
  baseTokens: number;
  diagnostics: PromptSimulationDiagnostics;
  /** Uma linha por skill de entrada, na ordem final de exibição. */
  skills: SimulatedSkill[];
}

/** Estimativa de tokens pela heurística de ~4 caracteres por token. */
export function estimateTokens(text: string): number {
  return text.length === 0 ? 0 : Math.ceil(text.length / 4);
}

interface SanitizeOutcome {
  value: string;
  kinds: SanitizationKind[];
}

/**
 * Sanitiza igual ao compilador, mas REPORTANDO o que mudou.
 *
 * A ordem importa: detectamos HTML e controle no texto cru, porque depois do
 * `replace` a evidência some e o diagnóstico ficaria mudo.
 */
function sanitizeWithReport(raw: string, maxLen: number): SanitizeOutcome {
  const kinds: SanitizationKind[] = [];
  if (/<[^>]*>/.test(raw)) kinds.push('html');
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(raw.replace(/[\n\r\t]/g, ''))) kinds.push('controle');
  if (/[\n\r]/.test(raw)) kinds.push('quebra_linha');

  const flat = raw
    .replace(/<[^>]*>/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (flat.length <= maxLen) return { value: flat, kinds };
  kinds.push('truncado');
  return { value: `${flat.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`, kinds };
}

function uniqueKinds(...groups: readonly SanitizationKind[][]): SanitizationKind[] {
  const set = new Set<SanitizationKind>();
  for (const g of groups) for (const k of g) set.add(k);
  return [...set];
}

const EMPTY_KINDS: Record<SanitizationKind, number> = {
  html: 0,
  controle: 0,
  quebra_linha: 0,
  truncado: 0,
};

/**
 * Simula a compilação completa.
 *
 * O teto é sempre MAX_PROMPT_SKILLS — deliberadamente NÃO configurável: o
 * texto final vem do compilador real, e um teto divergente faria o simulador
 * mentir justamente sobre o corte que pretende auditar. Para experimentar
 * overflow, adicione skills sintéticas à entrada.
 */
export function simulatePrompt(input: CompilePromptInput): PromptSimulationResult {
  const entrada = input.skills ?? [];

  const seen = new Set<string>();
  const sobreviventes: SimulatedSkill[] = [];
  const rejeitadas: SimulatedSkill[] = [];

  entrada.forEach((skill, inputIndex) => {
    const originalName = String(skill?.name ?? '');
    const nome = sanitizeWithReport(originalName, NAME_MAX_LEN);
    const desc = sanitizeWithReport(String(skill?.description ?? ''), DESCRIPTION_MAX_LEN);
    const cat = sanitizeWithReport(String(skill?.category ?? ''), CATEGORY_MAX_LEN);
    const sanitizations = uniqueKinds(nome.kinds, desc.kinds, cat.kinds);
    const id = typeof skill?.id === 'string' && skill.id.trim() !== '' ? skill.id.trim() : null;

    const base: Omit<SimulatedSkill, 'disposition' | 'line'> = {
      inputIndex,
      id,
      name: nome.value,
      originalName,
      description: desc.value,
      category: cat.value,
      sanitizations,
    };

    if (!nome.value) {
      rejeitadas.push({ ...base, disposition: 'descartada', line: null });
      return;
    }

    const key = (id ?? nome.value.toLowerCase()).trim();
    if (seen.has(key)) {
      rejeitadas.push({ ...base, disposition: 'duplicada', line: null });
      return;
    }
    seen.add(key);
    sobreviventes.push({ ...base, disposition: 'injetada', line: null });
  });

  // Mesma ordenação do compilador — é ela que decide QUEM cai no overflow.
  sobreviventes.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  const skills = sobreviventes.map((s, index) => {
    if (index >= MAX_PROMPT_SKILLS) return { ...s, disposition: 'overflow' as const, line: null };
    const cat = s.category ? ` _(${s.category})_` : '';
    const desc = s.description ? ` — ${s.description}` : '';
    return { ...s, line: `- **${s.name}**${cat}${desc}` };
  });

  const injetadas = skills.filter((s) => s.disposition === 'injetada');
  const overflow = skills.length - injetadas.length;

  // O texto final vem do compilador REAL, nunca de uma reimplementação: se as
  // duas divergirem, o simulador estaria mentindo justamente sobre o que
  // pretende auditar.
  const compiled = compilePrompt(input);

  const marcador = '## Skills disponíveis';
  const pos = compiled.text.indexOf(marcador);
  const skillsSection =
    pos === -1
      ? ''
      : compiled.text
          .slice(pos)
          .replace(/\n<!-- meta:[\s\S]*$/, '')
          .trim();

  const sanitizationsByKind = { ...EMPTY_KINDS };
  let sanitized = 0;
  for (const s of [...skills, ...rejeitadas]) {
    if (s.sanitizations.length > 0) sanitized += 1;
    for (const k of s.sanitizations) sanitizationsByKind[k] += 1;
  }

  const diagnostics: PromptSimulationDiagnostics = {
    received: entrada.length,
    discarded: rejeitadas.filter((s) => s.disposition === 'descartada').length,
    duplicates: rejeitadas.filter((s) => s.disposition === 'duplicada').length,
    eligible: skills.length,
    injected: injetadas.length,
    overflow,
    overflowed: overflow > 0,
    sanitized,
    sanitizationsByKind,
  };

  const skillsTokens = estimateTokens(skillsSection);

  return {
    compiled,
    skillsSection,
    skillsTokens,
    baseTokens: Math.max(0, compiled.stats.estimatedTokens - skillsTokens),
    diagnostics,
    // Rejeitadas vão ao final: o que entrou no prompt tem prioridade de leitura.
    skills: [...skills, ...rejeitadas],
  };
}

/** Rótulo pt-BR de cada destino possível de uma skill. */
export const DISPOSITION_LABEL: Record<SkillDisposition, string> = {
  injetada: 'No prompt',
  overflow: 'Cortada (overflow)',
  duplicada: 'Duplicada',
  descartada: 'Sem nome válido',
};
