import { describe, it, expect } from 'vitest';
import { compileAgentForOpenclaw } from '@/lib/openclawCompiler';
import type { AgentConfig } from '@/types/agentTypes';

function baseAgent(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    version: 1,
    status: 'production',
    tags: [],
    name: 'Bot de Vendas',
    mission: 'Qualificar leads inbound',
    persona: 'sdr',
    formality: 6,
    proactivity: 8,
    creativity: 4,
    verbosity: 5,
    scope: 'Vendas B2B',
    avatar_emoji: '🤖',
    model: 'gpt-4o-mini',
    reasoning: 'react',
    temperature: 0.4,
    top_p: 0.9,
    max_tokens: 2048,
    retry_count: 2,
    memory_short_term: true,
    memory_short_term_config: {} as never,
    memory_episodic: false,
    memory_episodic_config: {} as never,
    memory_semantic: false,
    memory_semantic_config: {} as never,
    memory_procedural: false,
    memory_procedural_config: {} as never,
    memory_profile: false,
    memory_profile_config: {} as never,
    memory_shared: false,
    memory_shared_config: {} as never,
    memory_external_sources: [],
    memory_consolidation: 'none' as never,
    rag_architecture: 'naive' as never,
    rag_vector_db: 'pgvector' as never,
    rag_embedding_model: 'text-embedding-3-small',
    rag_chunk_size: 512,
    rag_chunk_overlap: 64,
    rag_top_k: 5,
    rag_similarity_threshold: 0.7,
    rag_reranker: false,
    rag_hybrid_search: false,
    rag_metadata_filtering: false,
    rag_sources: [],
    tools: [
      {
        id: 'crm.lookup',
        name: 'CRM Lookup',
        description: 'Consulta lead no CRM',
        category: 'data',
        enabled: true,
        permission_level: 'read_only',
        requires_approval: false,
        max_calls_per_session: 5,
        max_calls_per_day: 100,
        allowed_conditions: '',
        output_validation: 'schema',
        cost_per_call: 0.001,
        audit_log: true,
      },
    ],
    mcp_servers: [],
    custom_apis: [],
    system_prompt: 'Você é um SDR consultivo.',
    system_prompt_version: 1,
    prompt_techniques: [],
    few_shot_examples: [],
    output_format: 'natural' as never,
    orchestration_pattern: 'single' as never,
    sub_agents: [],
    human_in_loop: false,
    human_in_loop_triggers: [],
    max_iterations: 5,
    timeout_seconds: 30,
    guardrails: [
      {
        id: 'pii-filter',
        category: 'output_safety',
        name: 'PII Filter',
        description: 'Bloqueia vazamento de dados pessoais',
        enabled: true,
        severity: 'block',
      },
    ],
    input_max_length: 4000,
    output_max_length: 2000,
    token_budget_per_session: 8000,
    allowed_domains: ['promobrindes.com.br'],
    blocked_topics: [],
    test_cases: [],
    eval_metrics: [],
    deploy_environment: 'production' as never,
    deploy_channels: [
      { id: 'wa', channel: 'whatsapp', enabled: true, config: {} } as never,
    ],
    monitoring_kpis: [],
    logging_enabled: true,
    alerting_enabled: true,
    ab_testing_enabled: false,
    auto_scaling: true,
    budget_alert_threshold: 80,
    budget_kill_switch: false,
    ...overrides,
  } as AgentConfig;
}

describe('compileAgentForOpenclaw', () => {
  it('gera SOUL.md com system prompt e tom', () => {
    const m = compileAgentForOpenclaw(baseAgent());
    expect(m.soul_md).toContain('# SOUL — Bot de Vendas');
    expect(m.soul_md).toContain('Você é um SDR consultivo.');
    expect(m.soul_md).toContain('Formalidade 6/10');
  });

  it('lista guardrails ativos e ferramentas em AGENTS.md', () => {
    const m = compileAgentForOpenclaw(baseAgent());
    expect(m.agents_md).toContain('PII Filter');
    expect(m.agents_md).toContain('CRM Lookup');
    expect(m.agents_md).toContain('gpt-4o-mini');
  });

  it('cria um SKILL.md por ferramenta com filename normalizado', () => {
    const m = compileAgentForOpenclaw(baseAgent());
    expect(m.skills).toHaveLength(1);
    expect(m.skills[0].filename).toBe('skills/crm-lookup/SKILL.md');
    expect(m.skills[0].content).toContain('Consulta lead no CRM');
  });

  it('inclui canais habilitados no openclaw.json', () => {
    const m = compileAgentForOpenclaw(baseAgent());
    const cfg = m.openclaw_json as { channels: Array<{ channel: string }> };
    expect(cfg.channels.map((c) => c.channel)).toContain('whatsapp');
  });

  it('checksum é estável e determinístico', () => {
    const a = compileAgentForOpenclaw(baseAgent());
    const b = compileAgentForOpenclaw(baseAgent());
    expect(a.checksum).toBe(b.checksum);
    expect(a.checksum).toMatch(/^[0-9a-f]{8}$/);
  });

  it('lança erro se agent não tem nome', () => {
    expect(() => compileAgentForOpenclaw(baseAgent({ name: '   ' }))).toThrow(/sem nome/);
  });
});
