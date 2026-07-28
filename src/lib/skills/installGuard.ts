/**
 * Guarda pré-instalação do teto de skills.
 *
 * Problema real que este módulo resolve: `bulkInstallSkills` é idempotente e
 * sempre "dá certo". O que ele NÃO diz é que o runtime compila no máximo
 * `MAX_PROMPT_SKILLS` skills por prompt — instalar a 26ª não gera erro algum,
 * apenas faz o agente perder silenciosamente uma competência. A falha só
 * aparece semanas depois como "o agente ficou pior" e ninguém liga o efeito à
 * causa.
 *
 * Decisões de projeto:
 * - Contamos por NOME NORMALIZADO, não por linha. O compilador deduplica por
 *   nome; contar linhas superestimaria a ocupação e produziria alarme falso.
 * - Skills sem nome útil são ignoradas: o compilador as descarta antes do
 *   corte, então elas não ocupam slot.
 * - Camada PURA: sem rede, sem DOM, sem React. Testável em massa.
 */

import { MAX_PROMPT_SKILLS } from '@/lib/skills/promptSimulation';
import { NEAR_CAP_MARGIN } from '@/lib/skills/promptOverflowAlert';

export type InstallGuardVerdict = 'ok' | 'atencao' | 'bloqueio_recomendado';

export interface NamedSkillRef {
  id: string;
  name: string;
}

export interface InstallGuardInput {
  /** Skills já instaladas no agente-alvo. */
  installed: readonly NamedSkillRef[];
  /** Skills que o operador acabou de selecionar para instalar. */
  selected: readonly NamedSkillRef[];
}

export interface InstallGuardResult {
  verdict: InstallGuardVerdict;
  /** Slots ocupados hoje (nomes distintos e não vazios). */
  currentSlots: number;
  /** Slots ocupados depois da instalação. */
  projectedSlots: number;
  /** Slots realmente adicionados (já descontando duplicatas e vazios). */
  effectiveAdds: number;
  /** Selecionadas que não somam slot: nome vazio ou já presente/duplicado. */
  redundant: NamedSkillRef[];
  /** Quantas skills o runtime passará a descartar por causa desta operação. */
  additionalDropped: number;
  /** Total descartado após a operação (inclui estouro pré-existente). */
  totalDroppedAfter: number;
  /** Folga restante depois da instalação. */
  headroomAfter: number;
  /** Ocupação projetada do teto, em pontos percentuais. */
  projectedUtilization: number;
  /** True quando a operação é o que cruza o teto pela primeira vez. */
  crossesCap: boolean;
  /** Mensagem pronta para UI, em PT-BR. */
  message: string;
}

/** Normalização idêntica à do compilador (acentos/caixa/espaços). */
export function normalizeSkillName(name: unknown): string {
  if (typeof name !== 'string') return '';
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function distinctNames(refs: readonly NamedSkillRef[]): Set<string> {
  const set = new Set<string>();
  for (const ref of refs ?? []) {
    const nome = normalizeSkillName(ref?.name);
    if (nome !== '') set.add(nome);
  }
  return set;
}

function buildMessage(r: Omit<InstallGuardResult, 'message'>): string {
  if (r.verdict === 'bloqueio_recomendado') {
    return (
      `Esta instalação faz o agente ultrapassar o teto de ${MAX_PROMPT_SKILLS} skills. ` +
      `${r.additionalDropped} skill(s) serão descartadas silenciosamente no prompt. ` +
      `Remova skills antes de continuar ou aceite a perda de forma consciente.`
    );
  }
  if (r.verdict === 'atencao') {
    if (r.effectiveAdds === 0) {
      return `Nenhuma skill nova será adicionada: todas as selecionadas já estão presentes ou não têm nome válido.`;
    }
    return (
      `Depois desta instalação o agente ficará com ${r.projectedSlots}/${MAX_PROMPT_SKILLS} skills ` +
      `(${r.headroomAfter} de folga). Planeje as próximas instalações.`
    );
  }
  return `Instalação segura: ${r.projectedSlots}/${MAX_PROMPT_SKILLS} skills, ${r.headroomAfter} de folga.`;
}

export function evaluateInstallImpact(input: InstallGuardInput): InstallGuardResult {
  const instaladas = distinctNames(input?.installed ?? []);
  const currentSlots = instaladas.size;

  const vistos = new Set<string>(instaladas);
  const redundant: NamedSkillRef[] = [];
  let effectiveAdds = 0;

  for (const ref of input?.selected ?? []) {
    const nome = normalizeSkillName(ref?.name);
    if (nome === '' || vistos.has(nome)) {
      redundant.push({ id: String(ref?.id ?? ''), name: String(ref?.name ?? '') });
      continue;
    }
    vistos.add(nome);
    effectiveAdds += 1;
  }

  const projectedSlots = currentSlots + effectiveAdds;
  const droppedAntes = Math.max(0, currentSlots - MAX_PROMPT_SKILLS);
  const totalDroppedAfter = Math.max(0, projectedSlots - MAX_PROMPT_SKILLS);
  const additionalDropped = totalDroppedAfter - droppedAntes;
  const headroomAfter = Math.max(0, MAX_PROMPT_SKILLS - projectedSlots);

  const verdict: InstallGuardVerdict =
    additionalDropped > 0
      ? 'bloqueio_recomendado'
      : headroomAfter <= NEAR_CAP_MARGIN || effectiveAdds === 0
        ? 'atencao'
        : 'ok';

  const parcial = {
    verdict,
    currentSlots,
    projectedSlots,
    effectiveAdds,
    redundant,
    additionalDropped,
    totalDroppedAfter,
    headroomAfter,
    projectedUtilization: Math.round((projectedSlots / MAX_PROMPT_SKILLS) * 100),
    crossesCap: droppedAntes === 0 && totalDroppedAfter > 0,
  };

  return { ...parcial, message: buildMessage(parcial) };
}

/**
 * Sugere quantas skills da seleção cabem sem estourar o teto — usado para
 * oferecer ao operador a opção "instalar só o que cabe" em vez de tudo ou nada.
 */
export function trimSelectionToCap(input: InstallGuardInput): NamedSkillRef[] {
  const vistos = distinctNames(input?.installed ?? []);
  const aceitas: NamedSkillRef[] = [];

  for (const ref of input?.selected ?? []) {
    const nome = normalizeSkillName(ref?.name);
    if (nome === '' || vistos.has(nome)) continue;
    if (vistos.size >= MAX_PROMPT_SKILLS) break;
    vistos.add(nome);
    aceitas.push(ref);
  }

  return aceitas;
}

export const VERDICT_LABEL: Record<InstallGuardVerdict, string> = {
  ok: 'Seguro',
  atencao: 'Atenção',
  bloqueio_recomendado: 'Estoura o teto',
};
