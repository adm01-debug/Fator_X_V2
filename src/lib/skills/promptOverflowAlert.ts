/**
 * Detector de estouro do teto de skills no prompt.
 *
 * O runtime corta silenciosamente tudo acima de `MAX_PROMPT_SKILLS` (25). Do
 * ponto de vista do operador isso é o pior tipo de falha: o agente continua
 * respondendo, apenas ficou burro em algumas competências que ele jura ter
 * instalado. Este módulo transforma esse silêncio em sinal explícito.
 *
 * Camada PURA — sem rede, sem DOM. A contagem chega pronta do serviço.
 */

import { MAX_PROMPT_SKILLS } from '@/lib/skills/promptSimulation';

/** Faixa de folga (em skills) antes do teto que já merece atenção. */
export const NEAR_CAP_MARGIN = 3;

export type OverflowSeverity = 'ok' | 'atencao' | 'critico';

export interface AgentSkillLoad {
  agentId: string;
  agentName: string;
  /**
   * Skills instaladas e ELEGÍVEIS (nome não vazio, já deduplicadas). O serviço
   * aplica o mesmo recorte do runtime antes de chamar aqui — contar linhas
   * cruas superestimaria o estouro e geraria alarme falso.
   */
  installed: number;
}

export interface AgentOverflowAlert extends AgentSkillLoad {
  severity: OverflowSeverity;
  /** Quantas skills o runtime descarta hoje. Zero quando não há estouro. */
  dropped: number;
  /** Quantas ainda cabem antes do teto. Zero quando já estourou. */
  headroom: number;
  /** Percentual de ocupação do teto, arredondado. */
  utilization: number;
}

export interface OverflowFleetSummary {
  totalAgents: number;
  critical: number;
  warning: number;
  healthy: number;
  /** Soma das skills descartadas em toda a frota. */
  totalDropped: number;
  /** Ocupação média do teto, em pontos percentuais. */
  averageUtilization: number;
  /** Ordenado por severidade e depois por descarte — o pior primeiro. */
  alerts: AgentOverflowAlert[];
}

function normalizeCount(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

export function classifyAgentLoad(load: AgentSkillLoad): AgentOverflowAlert {
  const installed = normalizeCount(load.installed);
  const dropped = Math.max(0, installed - MAX_PROMPT_SKILLS);
  const headroom = Math.max(0, MAX_PROMPT_SKILLS - installed);

  // Crítico só quando há perda REAL. Exatamente no teto não é crítico: nada é
  // descartado, embora a próxima instalação passe a descartar.
  const severity: OverflowSeverity =
    dropped > 0 ? 'critico' : headroom <= NEAR_CAP_MARGIN ? 'atencao' : 'ok';

  return {
    agentId: load.agentId,
    agentName: load.agentName,
    installed,
    severity,
    dropped,
    headroom,
    utilization: Math.round((installed / MAX_PROMPT_SKILLS) * 100),
  };
}

const SEVERITY_RANK: Record<OverflowSeverity, number> = {
  critico: 0,
  atencao: 1,
  ok: 2,
};

/**
 * Consolida a frota.
 *
 * Ordena por severidade, depois por descarte e, como desempate final, por nome
 * — a estabilidade importa porque a lista alimenta uma UI que atualiza sozinha,
 * e reordenação aleatória faria o operador perder a linha que estava lendo.
 */
export function summarizeOverflowFleet(loads: AgentSkillLoad[]): OverflowFleetSummary {
  const alerts = loads.map(classifyAgentLoad).sort((a, b) => {
    if (SEVERITY_RANK[a.severity] !== SEVERITY_RANK[b.severity]) {
      return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    }
    if (a.dropped !== b.dropped) return b.dropped - a.dropped;
    if (a.installed !== b.installed) return b.installed - a.installed;
    return a.agentName.localeCompare(b.agentName, 'pt-BR');
  });

  const totalDropped = alerts.reduce((acc, a) => acc + a.dropped, 0);
  const utilizacao = alerts.reduce((acc, a) => acc + a.utilization, 0);

  return {
    totalAgents: alerts.length,
    critical: alerts.filter((a) => a.severity === 'critico').length,
    warning: alerts.filter((a) => a.severity === 'atencao').length,
    healthy: alerts.filter((a) => a.severity === 'ok').length,
    totalDropped,
    averageUtilization: alerts.length === 0 ? 0 : Math.round(utilizacao / alerts.length),
    alerts,
  };
}

/**
 * Avalia o impacto de instalar `additional` skills em um agente.
 *
 * Usado antes de instalação em lote: é mais barato avisar "isso vai jogar 4
 * skills fora" do que descobrir depois pelo comportamento errático do agente.
 */
export function projectInstallImpact(
  current: number,
  additional: number,
): { willDrop: number; resultingInstalled: number; crossesCap: boolean } {
  const atual = normalizeCount(current);
  const extra = normalizeCount(additional);
  const total = atual + extra;
  const droppedAntes = Math.max(0, atual - MAX_PROMPT_SKILLS);
  const droppedDepois = Math.max(0, total - MAX_PROMPT_SKILLS);

  return {
    willDrop: droppedDepois - droppedAntes,
    resultingInstalled: total,
    crossesCap: droppedAntes === 0 && droppedDepois > 0,
  };
}

export const SEVERITY_LABEL: Record<OverflowSeverity, string> = {
  critico: 'Skills sendo descartadas',
  atencao: 'Perto do teto',
  ok: 'Dentro do teto',
};
