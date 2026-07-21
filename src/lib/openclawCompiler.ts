/**
 * openclawCompiler — converte AgentConfig (Fator X) em pacote OpenClaw
 * (SOUL.md, AGENTS.md, SKILL.md por skill, openclaw.json patch).
 *
 * Regra: pura, sem I/O. Fácil de testar e versionar.
 */
import type { AgentConfig } from '@/types/agentTypes';

export interface OpenclawSkillFile {
  name: string;
  filename: string;
  content: string;
}

export interface OpenclawManifest {
  soul_md: string;
  agents_md: string;
  skills: OpenclawSkillFile[];
  openclaw_json: Record<string, unknown>;
  version: number;
  agent_name: string;
  checksum: string;
}

function slug(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || 'agent';
}

function toneLine(a: AgentConfig): string {
  const bits: string[] = [];
  bits.push(`Formalidade ${a.formality}/10`);
  bits.push(`Proatividade ${a.proactivity}/10`);
  bits.push(`Criatividade ${a.creativity}/10`);
  bits.push(`Verbosidade ${a.verbosity}/10`);
  return bits.join(' · ');
}

function buildSoul(a: AgentConfig): string {
  return [
    `# SOUL — ${a.name}`,
    '',
    `**Persona:** ${a.persona}`,
    `**Missão:** ${a.mission || '(não definida)'}`,
    `**Escopo:** ${a.scope || '(livre)'}`,
    `**Tom:** ${toneLine(a)}`,
    '',
    '## System Prompt',
    '',
    a.system_prompt?.trim() || '(system prompt vazio — configure em Prompt → System Prompt)',
    '',
    '## Formato de saída',
    `- Formato preferido: ${a.output_format ?? 'natural'}`,
    `- Máx tokens por resposta: ${a.max_tokens ?? 2048}`,
  ].join('\n');
}

function buildAgentsMd(a: AgentConfig): string {
  const activeGuardrails = (a.guardrails ?? []).filter((g) => g.enabled);
  const tools = a.tools ?? [];
  const mcp = a.mcp_servers ?? [];
  return [
    `# AGENTS.md — ${a.name}`,
    '',
    '## Modelo',
    `- Primário: \`${a.model}\``,
    a.model_fallback ? `- Fallback: \`${a.model_fallback}\`` : '- Fallback: (nenhum)',
    `- Temperatura: ${a.temperature} · top_p: ${a.top_p}`,
    `- Reasoning: ${a.reasoning}`,
    `- Retry: ${a.retry_count}× · Timeout: ${a.timeout_seconds}s`,
    '',
    '## Ferramentas habilitadas',
    tools.length === 0
      ? '- (nenhuma)'
      : tools.map((t) => `- \`${t.id}\` — ${t.name ?? t.id}`).join('\n'),
    '',
    '## MCP Servers',
    mcp.length === 0 ? '- (nenhum)' : mcp.map((m) => `- ${m.name ?? m.id}`).join('\n'),
    '',
    '## Guardrails ativos',
    activeGuardrails.length === 0
      ? '- (nenhum — recomendado ativar pelo menos 3)'
      : activeGuardrails
          .map((g) => `- **${g.name ?? g.id}** — ${g.description ?? 'sem descrição'}`)
          .join('\n'),
    '',
    '## Limites operacionais',
    `- Input máx: ${a.input_max_length} chars`,
    `- Output máx: ${a.output_max_length} chars`,
    `- Budget de tokens por sessão: ${a.token_budget_per_session}`,
    a.allowed_domains?.length
      ? `- Domínios permitidos: ${a.allowed_domains.join(', ')}`
      : '',
    a.blocked_topics?.length
      ? `- Tópicos bloqueados: ${a.blocked_topics.join(', ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildSkillFiles(a: AgentConfig): OpenclawSkillFile[] {
  const tools = a.tools ?? [];
  return tools.map((t) => {
    const name = t.name ?? t.id;
    const filename = `skills/${slug(name)}/SKILL.md`;
    const content = [
      `# SKILL — ${name}`,
      '',
      `**Id:** \`${t.id}\``,
      `**Tipo:** ${t.type ?? 'tool'}`,
      '',
      '## Descrição',
      t.description ?? '(sem descrição)',
      '',
      '## Config',
      '```json',
      JSON.stringify(t.config ?? {}, null, 2),
      '```',
    ].join('\n');
    return { name, filename, content };
  });
}

function buildOpenclawJson(a: AgentConfig): Record<string, unknown> {
  const enabledChannels = (a.deploy_channels ?? [])
    .filter((c) => c.enabled)
    .map((c) => ({ channel: c.channel, config: c.config }));
  return {
    agent: {
      name: a.name,
      slug: slug(a.name),
      version: a.version,
      status: a.status,
    },
    llm: {
      primary: a.model,
      fallback: a.model_fallback ?? null,
      temperature: a.temperature,
      top_p: a.top_p,
      max_tokens: a.max_tokens,
    },
    channels: enabledChannels,
    hooks: {
      allowedSessionKeyPrefixes: ['hook:nexus'],
    },
    limits: {
      timeout_seconds: a.timeout_seconds,
      max_iterations: a.max_iterations,
    },
  };
}

function checksum(input: string): string {
  // FNV-1a 32-bit — determinístico, sem dependências, suficiente para dedupe.
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function compileAgentForOpenclaw(agent: AgentConfig): OpenclawManifest {
  if (!agent?.name?.trim()) {
    throw new Error('Agent sem nome — impossível compilar para OpenClaw');
  }
  const soul_md = buildSoul(agent);
  const agents_md = buildAgentsMd(agent);
  const skills = buildSkillFiles(agent);
  const openclaw_json = buildOpenclawJson(agent);
  const digest = checksum(
    soul_md + agents_md + skills.map((s) => s.content).join('|') + JSON.stringify(openclaw_json),
  );
  return {
    soul_md,
    agents_md,
    skills,
    openclaw_json,
    version: agent.version ?? 1,
    agent_name: agent.name,
    checksum: digest,
  };
}
