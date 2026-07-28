/**
 * Artefato de evidência de auditoria do prompt compilado.
 *
 * Gera um markdown autocontido: metadados do agente, prompt final integral,
 * diagnóstico do compilador e a tabela de destino de cada skill. A intenção é
 * que o arquivo baste como prova em revisão de mudança — quem lê meses depois
 * não deveria precisar reabrir o sistema para entender por que o agente
 * conhecia (ou não) determinada skill naquele momento.
 *
 * Camada PURA — nada de DOM aqui; o download fica na UI.
 */

import {
  DISPOSITION_LABEL,
  MAX_PROMPT_SKILLS,
  SANITIZATION_LABEL,
  type PromptSimulationResult,
  type SanitizationKind,
} from '@/lib/skills/promptSimulation';

export interface PromptArtifactMeta {
  agentId: string;
  agentName: string;
  model: string;
  persona: string;
  /** ISO — injetável para tornar a geração determinística em teste. */
  generatedAt?: string;
  /** Toggles de estresse ativos; sem isso o artefato mentiria sobre a origem. */
  forcedOverflow?: boolean;
  injectedDirtySkill?: boolean;
}

/** Escapa pipes para não quebrar a tabela markdown. */
function cell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim() || '—';
}

function slug(value: string): string {
  const base = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base === '' ? 'agente' : base.slice(0, 48);
}

/** Nome de arquivo estável e seguro para o artefato. */
export function buildArtifactFilename(meta: PromptArtifactMeta): string {
  const iso = meta.generatedAt ?? new Date().toISOString();
  const stamp = iso.replace(/[:.]/g, '-').replace(/(Z|[+-]\d{2}:?\d{2})$/, '');
  return `prompt-${slug(meta.agentName || meta.agentId)}-${stamp}.md`;
}

export function buildPromptAuditArtifact(
  result: PromptSimulationResult,
  meta: PromptArtifactMeta,
): string {
  const generatedAt = meta.generatedAt ?? new Date().toISOString();
  const d = result.diagnostics;

  const sanitizacoes = (Object.keys(SANITIZATION_LABEL) as SanitizationKind[])
    .filter((k) => d.sanitizationsByKind[k] > 0)
    .map((k) => `${SANITIZATION_LABEL[k]}: ${d.sanitizationsByKind[k]}`);

  const linhas: string[] = [
    '# Evidência de auditoria — prompt compilado',
    '',
    `- **Agente:** ${meta.agentName || '—'} (\`${meta.agentId}\`)`,
    `- **Modelo:** ${meta.model || '—'}`,
    `- **Persona:** ${meta.persona || '—'}`,
    `- **Gerado em:** ${generatedAt}`,
    `- **Teto de skills:** ${MAX_PROMPT_SKILLS}`,
    `- **Simulação com overflow forçado:** ${meta.forcedOverflow ? 'sim' : 'não'}`,
    `- **Simulação com skill suja injetada:** ${meta.injectedDirtySkill ? 'sim' : 'não'}`,
    '',
    '## Diagnóstico',
    '',
    `- Recebidas: ${d.received}`,
    `- Elegíveis: ${d.eligible}`,
    `- No prompt: ${d.injected}`,
    `- Cortadas por overflow: ${d.overflow}`,
    `- Duplicadas: ${d.duplicates}`,
    `- Descartadas (sem nome): ${d.discarded}`,
    `- Sanitizadas: ${d.sanitized}${sanitizacoes.length > 0 ? ` (${sanitizacoes.join(' · ')})` : ''}`,
    `- Tokens estimados: ${result.compiled.stats.estimatedTokens} (base ${result.baseTokens} + skills ${result.skillsTokens})`,
    `- Caracteres: ${result.compiled.stats.chars} · Linhas: ${result.compiled.stats.lines}`,
  ];

  if (result.compiled.unresolvedVariables.length > 0) {
    linhas.push(
      `- ⚠️ Variáveis não resolvidas: ${result.compiled.unresolvedVariables.join(', ')}`,
    );
  }

  linhas.push('', '## Skills', '', '| Skill | Destino | Sanitização | Categoria |', '| --- | --- | --- | --- |');

  if (result.skills.length === 0) {
    linhas.push('| _(nenhuma skill instalada)_ | — | — | — |');
  } else {
    for (const s of result.skills) {
      linhas.push(
        `| ${cell(s.name || s.originalName)} | ${DISPOSITION_LABEL[s.disposition]} | ${cell(
          s.sanitizations.map((k) => SANITIZATION_LABEL[k]).join(', '),
        )} | ${cell(s.category)} |`,
      );
    }
  }

  linhas.push(
    '',
    '## Prompt final',
    '',
    // Cerca de 4 crases: o prompt pode conter blocos de código com 3.
    '````text',
    result.compiled.text,
    '````',
    '',
  );

  return linhas.join('\n');
}
