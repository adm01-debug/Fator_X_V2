/**
 * Livro-razão das instalações que estouraram (ou tangenciaram) o teto de
 * skills.
 *
 * A trilha `skill.install_over_cap` só é útil se alguém conseguir lê-la em
 * agregado: "quais agentes estão degradados agora?", "quantas skills o
 * runtime está descartando no total?", "quem aceitou o estouro conscientemente
 * e quem foi pego de surpresa?".
 *
 * Camada PURA: parsing defensivo + agregação. Sem rede, sem DOM — é justamente
 * a lógica que precisa aguentar metadados antigos, truncados ou corrompidos
 * sem quebrar a página inteira.
 */

import { MAX_PROMPT_SKILLS } from '@/lib/skills/promptSimulation';
import type { InstallCapSeverity } from '@/lib/skills/installCapAudit';

/* ------------------------------------------------------------------ *
 * Tipos
 * ------------------------------------------------------------------ */

/** Linha crua de `audit_log` — tudo opcional de propósito. */
export interface RawInstallCapRow {
  id?: unknown;
  created_at?: unknown;
  entity_id?: unknown;
  metadata?: unknown;
}

export interface InstallCapEntry {
  id: string;
  createdAt: string;
  agentId: string;
  agentName: string;
  slotsBefore: number;
  slotsAfter: number;
  cap: number;
  effectiveAdds: number;
  redundant: number;
  additionalDropped: number;
  totalDroppedAfter: number;
  crossesCap: boolean;
  severity: InstallCapSeverity;
  acknowledged: boolean;
  droppedNames: string[];
  droppedNamesTruncated: number;
}

/** Estado atual de um agente, derivado da entrada mais recente dele. */
export interface AgentCapState {
  agentId: string;
  agentName: string;
  /** Descarte projetado pela última operação registrada. */
  droppedNow: number;
  slotsAfter: number;
  lastAt: string;
  events: number;
  /** True se alguma operação do agente foi confirmada sem reconhecimento. */
  hasUnacknowledged: boolean;
}

export interface InstallCapSummary {
  total: number;
  /** Operações que efetivamente aumentaram o descarte. */
  degrading: number;
  /** Operações que cruzaram o teto pela primeira vez. */
  crossings: number;
  /** Operações confirmadas sem reconhecimento explícito do operador. */
  unacknowledged: number;
  /** Agentes distintos afetados. */
  agents: number;
  /** Soma do descarte atual por agente (sem dupla contagem de eventos). */
  droppedSkillsNow: number;
  /** Agentes hoje acima do teto, ordenados pelo maior descarte. */
  degradedAgents: AgentCapState[];
  /** Skills mais frequentemente descartadas, ordenadas por ocorrência. */
  topDropped: Array<{ name: string; count: number }>;
  lastAt: string;
}

/* ------------------------------------------------------------------ *
 * Coerção defensiva
 * ------------------------------------------------------------------ */

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asText(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function asCount(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function asBool(value: unknown): boolean {
  return value === true || value === 'true';
}

function asIso(value: unknown): string {
  const text = asText(value);
  if (text === '') return '';
  const t = Date.parse(text);
  return Number.isNaN(t) ? '' : new Date(t).toISOString();
}

function asNameList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const nome = asText(item);
    if (nome !== '') out.push(nome);
  }
  return out;
}

const SEVERITIES: readonly InstallCapSeverity[] = [
  'dentro_do_teto',
  'proximo_do_teto',
  'estourou_o_teto',
];

function asSeverity(value: unknown): InstallCapSeverity {
  const text = asText(value);
  return (SEVERITIES as readonly string[]).includes(text)
    ? (text as InstallCapSeverity)
    : 'dentro_do_teto';
}

/* ------------------------------------------------------------------ *
 * Parsing
 * ------------------------------------------------------------------ */

export function parseInstallCapRows(rows: readonly RawInstallCapRow[]): InstallCapEntry[] {
  const out: InstallCapEntry[] = [];

  for (const row of rows ?? []) {
    const meta = asRecord(row?.metadata);
    const id = asText(row?.id);
    // Sem id não há como dar key estável nem deduplicar — descartamos.
    if (id === '') continue;

    // `cap` histórico é preservado: um registro antigo feito sob outro teto
    // deve continuar contando com o teto da época, não com o de hoje.
    const cap = asCount(meta.cap) || MAX_PROMPT_SKILLS;
    const slotsAfter = asCount(meta.slots_after);

    out.push({
      id,
      createdAt: asIso(row?.created_at),
      agentId: asText(row?.entity_id) || asText(meta.agent_id),
      agentName: asText(meta.agent_name) || 'sem nome',
      slotsBefore: asCount(meta.slots_before),
      slotsAfter,
      cap,
      effectiveAdds: asCount(meta.effective_adds),
      redundant: asCount(meta.redundant),
      additionalDropped: asCount(meta.additional_dropped),
      // Recalculamos o fallback a partir de slots/cap quando o campo veio
      // ausente (registros anteriores ao campo) — melhor derivar que zerar.
      totalDroppedAfter:
        meta.total_dropped_after === undefined
          ? Math.max(0, slotsAfter - cap)
          : asCount(meta.total_dropped_after),
      crossesCap: asBool(meta.crosses_cap),
      severity: asSeverity(meta.severity),
      acknowledged: asBool(meta.acknowledged),
      droppedNames: asNameList(meta.dropped_names),
      droppedNamesTruncated: asCount(meta.dropped_names_truncated),
    });
  }

  return out;
}

/* ------------------------------------------------------------------ *
 * Agregação
 * ------------------------------------------------------------------ */

const EMPTY_SUMMARY: InstallCapSummary = {
  total: 0,
  degrading: 0,
  crossings: 0,
  unacknowledged: 0,
  agents: 0,
  droppedSkillsNow: 0,
  degradedAgents: [],
  topDropped: [],
  lastAt: '',
};

/**
 * Resume a trilha. Regra central: o descarte "de agora" é lido da entrada
 * MAIS RECENTE de cada agente, nunca somando eventos — somar produziria
 * números inflados (10 instalações que descartam 1 skill cada não significam
 * 10 skills perdidas se todas descreveram o mesmo slot).
 */
export function summarizeInstallCapLedger(entries: readonly InstallCapEntry[]): InstallCapSummary {
  if (!entries || entries.length === 0) return EMPTY_SUMMARY;

  let degrading = 0;
  let crossings = 0;
  let unacknowledged = 0;
  let lastAt = '';

  const porAgente = new Map<string, AgentCapState>();
  const nomeDescartado = new Map<string, number>();

  for (const e of entries) {
    if (e.additionalDropped > 0) degrading += 1;
    if (e.crossesCap) crossings += 1;
    if (!e.acknowledged && e.totalDroppedAfter > 0) unacknowledged += 1;
    if (e.createdAt > lastAt) lastAt = e.createdAt;

    for (const nome of e.droppedNames) {
      nomeDescartado.set(nome, (nomeDescartado.get(nome) ?? 0) + 1);
    }

    const chave = e.agentId !== '' ? e.agentId : `nome:${e.agentName}`;
    const atual = porAgente.get(chave);
    if (!atual) {
      porAgente.set(chave, {
        agentId: e.agentId,
        agentName: e.agentName,
        droppedNow: e.totalDroppedAfter,
        slotsAfter: e.slotsAfter,
        lastAt: e.createdAt,
        events: 1,
        hasUnacknowledged: !e.acknowledged && e.totalDroppedAfter > 0,
      });
      continue;
    }
    atual.events += 1;
    atual.hasUnacknowledged =
      atual.hasUnacknowledged || (!e.acknowledged && e.totalDroppedAfter > 0);
    // Entradas sem data não podem sobrescrever um estado datado.
    if (e.createdAt !== '' && e.createdAt > atual.lastAt) {
      atual.lastAt = e.createdAt;
      atual.droppedNow = e.totalDroppedAfter;
      atual.slotsAfter = e.slotsAfter;
      atual.agentName = e.agentName;
    }
  }

  const degradedAgents = [...porAgente.values()]
    .filter((a) => a.droppedNow > 0)
    .sort((a, b) => b.droppedNow - a.droppedNow || a.agentName.localeCompare(b.agentName, 'pt-BR'));

  const topDropped = [...nomeDescartado.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR'))
    .slice(0, 10);

  return {
    total: entries.length,
    degrading,
    crossings,
    unacknowledged,
    agents: porAgente.size,
    droppedSkillsNow: degradedAgents.reduce((acc, a) => acc + a.droppedNow, 0),
    degradedAgents,
    topDropped,
    lastAt,
  };
}

/** Rótulo PT-BR de severidade para a UI. */
export const CAP_SEVERITY_LABEL: Record<InstallCapSeverity, string> = {
  dentro_do_teto: 'Dentro do teto',
  proximo_do_teto: 'Próximo do teto',
  estourou_o_teto: 'Estourou o teto',
};
