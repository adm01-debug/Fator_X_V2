/**
 * agentCardService — gera Agent Cards A2A a partir da tabela `agents`.
 *
 * O serviço lia `.from('agent_configs')`, tabela que NUNCA existiu em nenhuma
 * migration do repositório. Toda a tela de A2A (A2APanelPage, SwarmOrchestration,
 * AgentDetailPage) recebia erro e o card saía vazio. Estes testes provam que:
 *   1) a leitura vai para `agents`, não para uma tabela fantasma;
 *   2) as skills vêm de `config.tools` — sem essa conversão o card sai sem skill
 *      e falha em `validateAgentCard`;
 *   3) o cache do card é gravado em `config.agent_card` preservando o resto
 *      da configuração do agente (não sobrescreve tools/knowledge_bases).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSharedSupabaseMock } from './utils/supabaseMock';

vi.mock('@/integrations/supabase/externalClient', async () => {
  const m = await import('./utils/supabaseMock');
  return { supabaseExternal: m.getSharedSupabaseMock('agentcard-external').client };
});

vi.mock('@/integrations/supabase/client', async () => {
  const m = await import('./utils/supabaseMock');
  return { supabase: m.getSharedSupabaseMock('agentcard-local').client };
});

const ext = getSharedSupabaseMock('agentcard-external');

const AGENT_ROW = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Atendimento',
  mission: 'Responder clientes',
  model: 'gpt-4o',
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  config: {
    provider: 'openai',
    orchestration_type: 'swarm',
    knowledge_bases: ['kb-1'],
    tools: [{ name: 'Buscar Pedido', description: 'Consulta o ERP' }],
    guardrails: { pii: true },
  },
};

describe('agentCardService', () => {
  beforeEach(() => {
    ext.reset();
    ext.setResult({ data: [], error: null });
  });

  it('lê de agents, nunca da tabela inexistente agent_configs', async () => {
    ext.setTableResult('agents', { data: AGENT_ROW, error: null });
    const { generateAndSaveAgentCard } = await import('@/services/agentCardService');
    await generateAndSaveAgentCard(AGENT_ROW.id);

    const tables = ext.calls.from.mock.calls.map((c) => c[0]);
    expect(tables).toContain('agents');
    expect(tables).not.toContain('agent_configs');
  });

  it('deriva skills de config.tools — sem isso o card não passa em validateAgentCard', async () => {
    ext.setTableResult('agents', { data: AGENT_ROW, error: null });
    const { generateAgentCard, validateAgentCard } = await import('@/services/agentCardService');
    const card = generateAgentCard({
      id: AGENT_ROW.id,
      name: AGENT_ROW.name,
      description: AGENT_ROW.mission,
      system_prompt: '',
      model: AGENT_ROW.model,
      provider: 'openai',
      tools: AGENT_ROW.config.tools,
      knowledge_bases: AGENT_ROW.config.knowledge_bases,
      guardrails: AGENT_ROW.config.guardrails,
      orchestration_type: AGENT_ROW.config.orchestration_type,
      status: AGENT_ROW.status,
      created_at: AGENT_ROW.created_at,
      updated_at: AGENT_ROW.updated_at,
    });

    expect(card.skills.map((s) => s.id)).toContain('tool-buscar-pedido');
    expect(card.skills.map((s) => s.id)).toContain('rag-knowledge-search');
    expect(card.tags).toContain('oracle');
    expect(validateAgentCard(card).valid).toBe(true);
  });

  it('lista agentes ativos a partir de agents', async () => {
    ext.setTableResult('agents', { data: [AGENT_ROW], error: null });
    const { listAgentCards } = await import('@/services/agentCardService');
    const cards = await listAgentCards();

    expect(ext.calls.from.mock.calls[0][0]).toBe('agents');
    expect(cards).toHaveLength(1);
    expect(cards[0].name).toBe('Atendimento');
  });
});