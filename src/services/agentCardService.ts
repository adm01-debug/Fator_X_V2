/**
 * Nexus Agents Studio — Agent Card Service (A2A Discovery)
 *
 * Generates A2A-compliant Agent Cards following the official spec:
 * https://a2a-protocol.org/latest/specification/
 *
 * Agent Cards are JSON documents published at /.well-known/agent-card.json
 * that describe an agent's identity, capabilities, skills, and auth requirements.
 * This enables automatic discovery and interoperability between agents.
 */

// supabaseExternal import removed — this service uses fromTable for untyped tables

import { fromTable } from '@/lib/supabaseExtended';

// ──────── A2A Agent Card Types (following official spec) ────────

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  inputModes: string[];
  outputModes: string[];
  examples?: string[];
  tags?: string[];
}

export interface AgentProvider {
  organization: string;
  url?: string;
  support_contact?: string;
}

export interface AgentCapabilities {
  streaming: boolean;
  pushNotifications: boolean;
  stateTransitionHistory: boolean;
  a2aVersion: string;
  mcpVersion?: string;
  supportedMessageParts: string[];
}

export interface AgentAuthentication {
  schemes: Array<{
    scheme: string;
    description?: string;
    tokenUrl?: string;
    scopes?: string[];
  }>;
}

export interface AgentCard {
  schemaVersion: string;
  humanReadableId: string;
  agentVersion: string;
  name: string;
  description: string;
  url: string;
  provider: AgentProvider;
  capabilities: AgentCapabilities;
  authentication: AgentAuthentication;
  skills: AgentSkill[];
  tags?: string[];
  documentationUrl?: string;
  lastUpdated: string;
  _nexus?: {
    agentId: string;
    workspaceId?: string;
    oracleEnabled: boolean;
    guardrailsActive: number;
    ragEnabled: boolean;
  };
}

// ──────── Agent Config Interface (from Nexus DB) ────────

interface AgentConfig {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  model: string;
  provider: string;
  tools: Array<{ name: string; description?: string }>;
  knowledge_bases?: string[];
  guardrails?: Record<string, unknown>;
  orchestration_type?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

/** Linha real de public.agents (o schema baseline + fix_stub_schemas). */
interface AgentRow {
  id: string;
  name: string;
  mission?: string | null;
  model?: string | null;
  status?: string | null;
  config?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
}

/**
 * Converte a linha de `agents` para a forma que generateAgentCard entende.
 * Os campos que nao tem coluna propria (provider, tools, knowledge_bases,
 * guardrails, orchestration_type) vivem em `config`, gravados pelo editor de
 * agente. Sem esta conversao o card sai sem skills e sem tags.
 */
function rowToConfig(row: AgentRow): AgentConfig {
  const cfg = (row.config ?? {}) as Record<string, unknown>;
  const asArray = <T,>(v: unknown): T[] | undefined => (Array.isArray(v) ? (v as T[]) : undefined);
  return {
    id: row.id,
    name: row.name,
    description: row.mission ?? '',
    system_prompt: typeof cfg.system_prompt === 'string' ? cfg.system_prompt : '',
    model: row.model ?? '',
    provider: typeof cfg.provider === 'string' ? cfg.provider : '',
    tools: asArray<{ name: string; description?: string }>(cfg.tools) ?? [],
    knowledge_bases: asArray<string>(cfg.knowledge_bases),
    guardrails:
      cfg.guardrails && typeof cfg.guardrails === 'object'
        ? (cfg.guardrails as Record<string, unknown>)
        : undefined,
    orchestration_type:
      typeof cfg.orchestration_type === 'string' ? cfg.orchestration_type : undefined,
    status: row.status ?? 'draft',
    created_at: row.created_at ?? '',
    updated_at: row.updated_at ?? '',
  };
}

// ──────── Constants ────────

const DEFAULT_PROVIDER: AgentProvider = {
  organization: 'Promo Brindes',
  url: 'https://promobrindes.com.br',
  support_contact: 'suporte@promobrindes.com.br',
};

const NEXUS_BASE_URL =
  typeof window !== 'undefined' ? window.location.origin : 'https://nexus.promobrindes.com.br';

// ──────── Card Generation ────────

/**
 * Generate an A2A Agent Card from a Nexus agent configuration.
 * This card can be served at /.well-known/agent-card.json for discovery.
 */
export function generateAgentCard(
  agent: AgentConfig,
  options?: {
    baseUrl?: string;
    provider?: AgentProvider;
    extraSkills?: AgentSkill[];
    extraTags?: string[];
  },
): AgentCard {
  const baseUrl = options?.baseUrl ?? NEXUS_BASE_URL;
  const provider = options?.provider ?? DEFAULT_PROVIDER;

  // Derive skills from agent tools
  const toolSkills: AgentSkill[] = (agent.tools ?? []).map((tool) => ({
    id: `tool-${tool.name.toLowerCase().replace(/\s+/g, '-')}`,
    name: tool.name,
    description: tool.description ?? `Skill: ${tool.name}`,
    inputModes: ['text'],
    outputModes: ['text'],
    tags: ['tool'],
  }));

  // Add knowledge-based skills if RAG is configured
  const ragSkills: AgentSkill[] =
    (agent.knowledge_bases ?? []).length > 0
      ? [
          {
            id: 'rag-knowledge-search',
            name: 'Knowledge Search',
            description:
              'Search through configured knowledge bases using hybrid RAG (BM25 + pgvector + RRF)',
            inputModes: ['text'],
            outputModes: ['text'],
            tags: ['rag', 'knowledge'],
          },
        ]
      : [];

  // Detect capabilities from agent config
  const hasOracle =
    agent.orchestration_type === 'swarm' || agent.orchestration_type === 'hierarchical';
  const guardrailCount = agent.guardrails
    ? Object.values(agent.guardrails).filter(Boolean).length
    : 0;

  const allSkills = [...toolSkills, ...ragSkills, ...(options?.extraSkills ?? [])];

  // Build tags from agent capabilities
  const tags = [
    agent.provider,
    agent.model,
    agent.orchestration_type ?? 'single',
    ...(guardrailCount > 0 ? ['guardrails'] : []),
    ...(hasOracle ? ['multi-llm', 'oracle'] : []),
    ...((agent.knowledge_bases ?? []).length > 0 ? ['rag'] : []),
    ...(options?.extraTags ?? []),
  ].filter(Boolean) as string[];

  return {
    schemaVersion: '1.0',
    humanReadableId: `promobrindes/${agent.name.toLowerCase().replace(/\s+/g, '-')}`,
    agentVersion: '1.0.0',
    name: agent.name,
    description: agent.description || `Nexus Agent: ${agent.name}`,
    url: `${baseUrl}/api/a2a/agents/${agent.id}`,
    provider,
    capabilities: {
      streaming: true,
      pushNotifications: false,
      stateTransitionHistory: true,
      a2aVersion: '1.0',
      mcpVersion: '0.6',
      supportedMessageParts: ['text', 'file', 'data'],
    },
    authentication: {
      schemes: [
        {
          scheme: 'Bearer',
          description: 'JWT token from Nexus authentication',
        },
      ],
    },
    skills: allSkills,
    tags,
    documentationUrl: `${baseUrl}/docs/agents/${agent.id}`,
    lastUpdated: agent.updated_at || new Date().toISOString(),
    _nexus: {
      agentId: agent.id,
      oracleEnabled: hasOracle,
      guardrailsActive: guardrailCount,
      ragEnabled: (agent.knowledge_bases ?? []).length > 0,
    },
  };
}

/**
 * Generate Agent Card JSON string (formatted for serving)
 */
export function generateAgentCardJSON(
  agent: AgentConfig,
  options?: Parameters<typeof generateAgentCard>[1],
): string {
  const card = generateAgentCard(agent, options);
  return JSON.stringify(card, null, 2);
}

// ──────── Card Storage & Retrieval ────────

/**
 * Save an agent card to the database for caching/serving
 */
export async function saveAgentCard(agentId: string, card: AgentCard): Promise<void> {
  const { data: current, error: readError } = await fromTable('agents')
    .select('config')
    .eq('id', agentId)
    .single();

  if (readError) throw new Error(`Failed to save agent card: ${readError.message}`);

  // Merge preserva o resto da configuração do agente; `agent_configs` nunca
  // existiu no banco, então o card passa a viver em `agents.config`.
  const config = ((current?.config as Record<string, unknown>) ?? {});
  const { error } = await fromTable('agents')
    .update({
      config: {
        ...config,
        agent_card: card,
        agent_card_updated_at: new Date().toISOString(),
      },
    })
    .eq('id', agentId);

  if (error) throw new Error(`Failed to save agent card: ${error.message}`);
}

/**
 * Get a cached agent card from the database
 */
export async function getAgentCard(agentId: string): Promise<AgentCard | null> {
  const { data, error } = await fromTable('agents')
    .select('config')
    .eq('id', agentId)
    .single();

  if (error) {
    // Supabase .single() returns error also for "not found" (PGRST116).
    // Only return null for "not found"; surface all other errors.
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to fetch agent card: ${error.message}`);
  }
  const config = data?.config as Record<string, unknown> | null;
  return (config?.agent_card as AgentCard) ?? null;
}

/**
 * Generate and save agent card for a given agent ID.
 * Fetches agent config from DB, generates card, saves it back.
 */
export async function generateAndSaveAgentCard(
  agentId: string,
  options?: Parameters<typeof generateAgentCard>[1],
): Promise<AgentCard> {
  const { data, error } = await fromTable('agents')
    .select('id, name, mission, model, status, config, created_at, updated_at')
    .eq('id', agentId)
    .single();

  if (error) throw new Error(`Agent not found: ${error.message}`);

  const agent = rowToConfig(data as AgentRow);
  const card = generateAgentCard(agent, options);
  await saveAgentCard(agentId, card);
  return card;
}

// ──────── Discovery Registry ────────

/**
 * List all agent cards in the workspace (for registry/marketplace)
 */
export async function listAgentCards(): Promise<AgentCard[]> {
  const { data, error } = await fromTable('agents')
    .select('id, name, mission, model, status, config, created_at, updated_at')
    .eq('status', 'active');

  if (error) throw new Error(`Failed to list agents: ${error.message}`);

  return (data ?? []).map((row: AgentRow) => {
    const cached = (row.config as Record<string, unknown> | null)?.agent_card as
      | AgentCard
      | undefined;
    if (cached) return cached;

    // Generate on-the-fly if not cached
    return generateAgentCard(rowToConfig(row));
  });
}

/**
 * Search agent cards by skill/tag/name
 */
export async function searchAgentCards(query: string): Promise<AgentCard[]> {
  const allCards = await listAgentCards();
  const q = query.toLowerCase();

  return allCards.filter(
    (card) =>
      card.name.toLowerCase().includes(q) ||
      card.description.toLowerCase().includes(q) ||
      card.skills.some(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          (s.tags ?? []).some((t) => t.toLowerCase().includes(q)),
      ) ||
      (card.tags ?? []).some((t) => t.toLowerCase().includes(q)),
  );
}

/**
 * Validate an Agent Card against the A2A spec
 */
export function validateAgentCard(card: Partial<AgentCard>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!card.schemaVersion) errors.push('Missing schemaVersion');
  if (!card.name) errors.push('Missing name');
  if (!card.description) errors.push('Missing description');
  if (!card.url) errors.push('Missing url');
  if (!card.provider?.organization) errors.push('Missing provider.organization');
  if (!card.capabilities?.a2aVersion) errors.push('Missing capabilities.a2aVersion');
  if (!card.authentication?.schemes?.length) errors.push('Missing authentication.schemes');
  if (!card.skills?.length) errors.push('Agent must have at least one skill');

  // Validate skills
  card.skills?.forEach((skill, idx) => {
    if (!skill.id) errors.push(`Skill[${idx}] missing id`);
    if (!skill.name) errors.push(`Skill[${idx}] missing name`);
    if (!skill.inputModes?.length) errors.push(`Skill[${idx}] missing inputModes`);
    if (!skill.outputModes?.length) errors.push(`Skill[${idx}] missing outputModes`);
  });

  return { valid: errors.length === 0, errors };
}
