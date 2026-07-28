/**
 * Trilha de auditoria para instalações que cruzam o teto de skills.
 *
 * Contexto: `evaluateInstallImpact` avisa o operador antes de instalar, mas o
 * aviso é dispensável — ele pode confirmar mesmo assim. Quando isso acontece o
 * runtime passa a descartar skills silenciosamente, e sem registro ninguém
 * consegue reconstruir DEPOIS quem aceitou a perda, quando e de quanto foi.
 *
 * Decisões de projeto:
 * - Camada PURA: monta o registro; a gravação fica no `auditService`. Assim o
 *   cálculo é testável em massa sem rede.
 * - Só grava NOMES de skills, nunca conteúdo/instruções — a trilha não pode
 *   virar cópia paralela dos prompts.
 * - A lista de descartadas é limitada: um lote patológico de 500 seleções não
 *   pode inflar uma linha de audit_log a ponto de degradar a tabela.
 */

import { MAX_PROMPT_SKILLS } from '@/lib/skills/promptSimulation';
import type { InstallGuardResult, NamedSkillRef } from '@/lib/skills/installGuard';
import { normalizeSkillName } from '@/lib/skills/installGuard';

/** Teto de nomes gravados na trilha para não inflar a linha de auditoria. */
export const MAX_AUDITED_NAMES = 20;

export type InstallCapSeverity = 'dentro_do_teto' | 'proximo_do_teto' | 'estourou_o_teto';

export interface InstallCapAuditRecord {
  agentId: string;
  agentName: string;
  /** Slots antes e depois, já deduplicados por nome normalizado. */
  slotsBefore: number;
  slotsAfter: number;
  cap: number;
  /** Skills efetivamente novas no lote. */
  effectiveAdds: number;
  /** Selecionadas sem efeito (duplicadas ou sem nome). */
  redundant: number;
  /** Skills que passarão a ser descartadas por causa desta operação. */
  additionalDropped: number;
  totalDroppedAfter: number;
  /** True quando esta operação é a que cruza o teto pela primeira vez. */
  crossesCap: boolean;
  severity: InstallCapSeverity;
  /** Nomes das skills que provavelmente serão descartadas (cauda do lote). */
  droppedNames: string[];
  /** Quantos nomes ficaram de fora da lista por causa do teto de auditoria. */
  droppedNamesTruncated: number;
  /** Operador viu o alerta e confirmou mesmo assim. */
  acknowledged: boolean;
}

/** Severidade derivada exclusivamente do resultado da guarda. */
export function classifyInstallCap(guard: InstallGuardResult): InstallCapSeverity {
  if (guard.totalDroppedAfter > 0) return 'estourou_o_teto';
  if (guard.headroomAfter === 0) return 'estourou_o_teto';
  if (guard.verdict === 'atencao') return 'proximo_do_teto';
  return 'dentro_do_teto';
}

/**
 * Reconstrói quais nomes o compilador descartaria: ele corta a CAUDA da lista
 * ordenada (instaladas primeiro, depois as novas na ordem de seleção).
 */
export function projectDroppedNames(
  installed: readonly NamedSkillRef[],
  selected: readonly NamedSkillRef[],
): string[] {
  const vistos = new Set<string>();
  const ordenadas: string[] = [];

  for (const ref of [...(installed ?? []), ...(selected ?? [])]) {
    const nome = normalizeSkillName(ref?.name);
    if (nome === '' || vistos.has(nome)) continue;
    vistos.add(nome);
    ordenadas.push(String(ref?.name ?? '').trim());
  }

  return ordenadas.slice(MAX_PROMPT_SKILLS);
}

export interface BuildInstallCapRecordInput {
  agentId: string;
  agentName?: string | null;
  installed: readonly NamedSkillRef[];
  selected: readonly NamedSkillRef[];
  guard: InstallGuardResult;
  acknowledged?: boolean;
}

export function buildInstallCapRecord(
  input: BuildInstallCapRecordInput,
): InstallCapAuditRecord {
  const { guard } = input;
  const todos = projectDroppedNames(input.installed ?? [], input.selected ?? []);

  return {
    agentId: String(input.agentId ?? ''),
    agentName: (input.agentName ?? '').trim() || 'sem nome',
    slotsBefore: guard.currentSlots,
    slotsAfter: guard.projectedSlots,
    cap: MAX_PROMPT_SKILLS,
    effectiveAdds: guard.effectiveAdds,
    redundant: guard.redundant.length,
    additionalDropped: guard.additionalDropped,
    totalDroppedAfter: guard.totalDroppedAfter,
    crossesCap: guard.crossesCap,
    severity: classifyInstallCap(guard),
    droppedNames: todos.slice(0, MAX_AUDITED_NAMES),
    droppedNamesTruncated: Math.max(0, todos.length - MAX_AUDITED_NAMES),
    acknowledged: input.acknowledged ?? false,
  };
}

/**
 * Só vale a pena gravar quando houve perda real ou quando a operação cruzou o
 * teto. Registrar instalações saudáveis transformaria a trilha em ruído e
 * esconderia justamente os eventos que importam.
 */
export function shouldAuditInstall(record: InstallCapAuditRecord): boolean {
  return record.additionalDropped > 0 || record.crossesCap || record.totalDroppedAfter > 0;
}
