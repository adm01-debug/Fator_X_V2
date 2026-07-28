/**
 * Comparação entre dois prompts compilados (agente A × agente B, ou duas
 * versões do mesmo agente).
 *
 * Camada PURA. Duas dimensões de diff, porque elas respondem perguntas
 * diferentes e uma não substitui a outra:
 *
 *   1. TEXTO — diff de linhas do prompt final (o que o modelo realmente lê).
 *   2. SKILLS — o que entrou/saiu do "contrato de capacidades", incluindo o
 *      caso silencioso e mais perigoso: a skill continua instalada nos dois
 *      lados, mas em um deles caiu no overflow do teto e o agente deixou de
 *      conhecê-la. Um diff só de texto mostraria isso como "linha removida",
 *      sem explicar a causa.
 */

import { computeLineDiff, diffStats, type DiffLine } from '@/lib/lineDiff';
import type { PromptSimulationResult, SkillDisposition } from '@/lib/skills/promptSimulation';

/** Como uma skill mudou entre os dois lados. */
export type SkillChangeKind =
  | 'adicionada'
  | 'removida'
  | 'entrou_no_prompt'
  | 'saiu_do_prompt'
  | 'alterada'
  | 'inalterada';

export const SKILL_CHANGE_LABEL: Record<SkillChangeKind, string> = {
  adicionada: 'Adicionada',
  removida: 'Removida',
  entrou_no_prompt: 'Entrou no prompt',
  saiu_do_prompt: 'Saiu do prompt (overflow)',
  alterada: 'Texto alterado',
  inalterada: 'Inalterada',
};

export interface SkillChange {
  /** Chave de correlação: id quando existe, senão o nome normalizado. */
  key: string;
  name: string;
  kind: SkillChangeKind;
  before: SkillDisposition | null;
  after: SkillDisposition | null;
  /** Linha markdown de cada lado (null quando não entrou no prompt). */
  beforeLine: string | null;
  afterLine: string | null;
}

export interface PromptDiffTotals {
  added: number;
  removed: number;
  enteredPrompt: number;
  leftPrompt: number;
  changed: number;
  unchanged: number;
}

export interface PromptDiffResult {
  /** Diff linha a linha do prompt final. */
  lines: DiffLine[];
  lineStats: { added: number; removed: number; same: number };
  /** Diff no nível de skill, ordenado por relevância e depois por nome. */
  skills: SkillChange[];
  totals: PromptDiffTotals;
  tokenDelta: number;
  charDelta: number;
  /** `true` quando prompt final e conjunto de skills são idênticos. */
  identical: boolean;
}

/** Ordem de leitura: primeiro o que quebra comportamento, depois o ruído. */
const CHANGE_WEIGHT: Record<SkillChangeKind, number> = {
  saiu_do_prompt: 0,
  removida: 1,
  adicionada: 2,
  entrou_no_prompt: 3,
  alterada: 4,
  inalterada: 5,
};

/** Mesma regra de chave do compilador: id quando presente, senão o nome. */
function skillKey(id: string | null, name: string): string {
  const raw = id ?? name.toLowerCase();
  return raw.trim();
}

function indexSkills(result: PromptSimulationResult) {
  const map = new Map<string, { name: string; disposition: SkillDisposition; line: string | null }>();
  for (const s of result.skills) {
    // Descartadas não têm identidade utilizável — o compilador as ignora e o
    // diff também deve ignorar, senão elas colidiriam todas na chave vazia.
    if (s.disposition === 'descartada') continue;
    const key = skillKey(s.id, s.name);
    if (key === '' || map.has(key)) continue;
    map.set(key, { name: s.name, disposition: s.disposition, line: s.line });
  }
  return map;
}

function classify(
  before: { disposition: SkillDisposition; line: string | null } | undefined,
  after: { disposition: SkillDisposition; line: string | null } | undefined,
): SkillChangeKind {
  if (!before) return 'adicionada';
  if (!after) return 'removida';
  const antes = before.disposition === 'injetada';
  const depois = after.disposition === 'injetada';
  if (antes && !depois) return 'saiu_do_prompt';
  if (!antes && depois) return 'entrou_no_prompt';
  if (before.line !== after.line) return 'alterada';
  return 'inalterada';
}

/**
 * Compara duas simulações.
 *
 * `before` é a referência (esquerda) e `after` o candidato (direita); a
 * nomenclatura é intencionalmente temporal para que "saiu do prompt" tenha
 * leitura óbvia numa revisão de mudança.
 */
export function diffPromptSimulations(
  before: PromptSimulationResult,
  after: PromptSimulationResult,
): PromptDiffResult {
  const lines = computeLineDiff(before.compiled.text.split('\n'), after.compiled.text.split('\n'));
  const lineStats = diffStats(lines);

  const mapA = indexSkills(before);
  const mapB = indexSkills(after);
  const keys = new Set<string>([...mapA.keys(), ...mapB.keys()]);

  const skills: SkillChange[] = [];
  for (const key of keys) {
    const a = mapA.get(key);
    const b = mapB.get(key);
    const kind = classify(a, b);
    skills.push({
      key,
      name: b?.name ?? a?.name ?? key,
      kind,
      before: a?.disposition ?? null,
      after: b?.disposition ?? null,
      beforeLine: a?.line ?? null,
      afterLine: b?.line ?? null,
    });
  }

  skills.sort((x, y) => {
    const w = CHANGE_WEIGHT[x.kind] - CHANGE_WEIGHT[y.kind];
    return w !== 0 ? w : x.name.localeCompare(y.name, 'pt-BR');
  });

  const totals: PromptDiffTotals = {
    added: skills.filter((s) => s.kind === 'adicionada').length,
    removed: skills.filter((s) => s.kind === 'removida').length,
    enteredPrompt: skills.filter((s) => s.kind === 'entrou_no_prompt').length,
    leftPrompt: skills.filter((s) => s.kind === 'saiu_do_prompt').length,
    changed: skills.filter((s) => s.kind === 'alterada').length,
    unchanged: skills.filter((s) => s.kind === 'inalterada').length,
  };

  const identical =
    before.compiled.text === after.compiled.text &&
    skills.every((s) => s.kind === 'inalterada');

  return {
    lines,
    lineStats,
    skills,
    totals,
    tokenDelta: after.compiled.stats.estimatedTokens - before.compiled.stats.estimatedTokens,
    charDelta: after.compiled.stats.chars - before.compiled.stats.chars,
    identical,
  };
}
