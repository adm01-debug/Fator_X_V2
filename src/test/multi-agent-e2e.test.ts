/**
 * Multi-Agent E2E Scenarios
 *
 * Simulates realistic multi-agent orchestration flows end-to-end:
 * triage → specialist → escalation, with rule evaluation, context
 * preparation and chained handoffs. Uses only pure/deterministic
 * functions so the suite runs without DB or network.
 */
import { describe, it, expect } from 'vitest';
import {
  evaluateHandoffRules,
  prepareHandoffContext,
  triageHandoff,
  type HandoffRule,
  type HandoffContext,
} from '@/services/agentHandoffService';

const specialists = [
  {
    id: 'billing',
    name: 'Billing Specialist',
    description: 'Handles invoices billing payments refunds',
    skills: ['invoice', 'payment', 'refund', 'billing'],
  },
  {
    id: 'tech',
    name: 'Tech Support',
    description: 'Handles technical issues bugs errors integrations',
    skills: ['bug', 'error', 'crash', 'integration', 'api'],
  },
  {
    id: 'sales',
    name: 'Sales Agent',
    description: 'Handles pricing plans upgrades enterprise deals',
    skills: ['pricing', 'plan', 'upgrade', 'enterprise', 'quote'],
  },
];

function baseHistory(userText: string): HandoffContext['messages'] {
  return [
    { role: 'system', content: 'You are a triage agent.' },
    { role: 'user', content: userText },
  ];
}

describe('Multi-Agent E2E — Triage routing', () => {
  it('routes billing questions to the billing specialist', async () => {
    const req = await triageHandoff(
      'triage',
      'I need a refund for my invoice from last month',
      specialists,
      baseHistory('I need a refund for my invoice'),
    );
    expect(req).not.toBeNull();
    expect(req!.targetAgentId).toBe('billing');
    expect(req!.reason).toBe('triage');
    expect(req!.context.instructions).toContain('Billing Specialist');
  });

  it('routes technical issues to tech support', async () => {
    const req = await triageHandoff(
      'triage',
      'The API integration is throwing a crash error',
      specialists,
      baseHistory('crash error api integration'),
    );
    expect(req!.targetAgentId).toBe('tech');
  });

  it('routes pricing questions to sales', async () => {
    const req = await triageHandoff(
      'triage',
      'What is the pricing for the enterprise plan?',
      specialists,
      baseHistory('enterprise pricing plan'),
    );
    expect(req!.targetAgentId).toBe('sales');
  });

  it('returns null when no specialist matches', async () => {
    const req = await triageHandoff(
      'triage',
      'hello there',
      specialists,
      baseHistory('hello there'),
    );
    expect(req).toBeNull();
  });
});

describe('Multi-Agent E2E — Escalation chain via rules', () => {
  const escalationRules: HandoffRule[] = [
    {
      id: 'low-confidence',
      name: 'Escalate on low confidence',
      description: '',
      sourceAgentId: 'tech',
      targetAgentId: 'senior-tech',
      reason: 'escalation',
      autoAccept: true,
      priority: 10,
      enabled: true,
      condition: { type: 'threshold', field: 'confidence', operator: 'lt', value: 0.5 },
    },
    {
      id: 'vip-user',
      name: 'VIP customers to human',
      description: '',
      sourceAgentId: 'tech',
      targetAgentId: 'human-agent',
      reason: 'escalation',
      autoAccept: true,
      priority: 20,
      enabled: true,
      condition: { type: 'custom', expression: 'is_vip' },
    },
    {
      id: 'angry-keyword',
      name: 'Angry -> human',
      description: '',
      sourceAgentId: 'tech',
      targetAgentId: 'human-agent',
      reason: 'escalation',
      autoAccept: false,
      priority: 15,
      enabled: true,
      condition: { type: 'keyword', keywords: ['refund', 'cancel', 'angry', 'lawsuit'] },
    },
  ];

  it('sorts VIP escalation before angry keyword when both match', () => {
    const matches = evaluateHandoffRules(escalationRules, {
      lastMessage: 'I am very angry, want a refund',
      state: { is_vip: true, confidence: 0.9 },
    });
    expect(matches[0].id).toBe('vip-user');
    expect(matches[1].id).toBe('angry-keyword');
  });

  it('picks low-confidence escalation when confidence drops', () => {
    const matches = evaluateHandoffRules(escalationRules, {
      lastMessage: 'random message',
      state: { confidence: 0.2 },
    });
    expect(matches.map((r) => r.id)).toContain('low-confidence');
  });

  it('yields no matches when nothing triggers', () => {
    const matches = evaluateHandoffRules(escalationRules, {
      lastMessage: 'all good, thanks',
      state: { confidence: 0.95, is_vip: false },
    });
    expect(matches).toHaveLength(0);
  });
});

describe('Multi-Agent E2E — Context preservation across hops', () => {
  it('preserves system prompt and trims history when exceeding limit', () => {
    const messages: HandoffContext['messages'] = [
      { role: 'system', content: 'triage system prompt' },
      ...Array.from({ length: 40 }, (_, i) => ({
        role: 'user' as const,
        content: `msg-${i}`,
      })),
    ];
    const ctx = prepareHandoffContext(messages, { step: 'first-hop' }, { maxMessages: 10 });
    expect(ctx.messages[0].role).toBe('system');
    expect(ctx.messages).toHaveLength(11);
    expect(ctx.messages[ctx.messages.length - 1].content).toBe('msg-39');
    expect(ctx.state.step).toBe('first-hop');
  });

  it('threads instructions and artifacts through a two-hop escalation', async () => {
    // Hop 1: triage → tech
    const hop1 = await triageHandoff(
      'triage',
      'my api integration has a bug',
      specialists,
      baseHistory('my api integration has a bug'),
    );
    expect(hop1!.targetAgentId).toBe('tech');

    // Hop 2: tech → senior-tech (escalation) — reuse context, append state
    const hop2Ctx = prepareHandoffContext(
      hop1!.context.messages,
      { ...hop1!.context.state, confidence: 0.3, escalatedFrom: 'tech' },
      {
        instructions: 'Escalating: unable to resolve integration bug at tier 1',
        artifacts: [{ type: 'log', content: 'stacktrace...' } as never],
      },
    );

    expect(hop2Ctx.state.escalatedFrom).toBe('tech');
    expect(hop2Ctx.state.triageScore).toBeDefined();
    expect(hop2Ctx.instructions).toContain('Escalating');
    expect(hop2Ctx.artifacts).toHaveLength(1);
  });
});

describe('Multi-Agent E2E — Disabled rules and edge cases', () => {
  it('ignores disabled rules even with matching conditions', () => {
    const rules: HandoffRule[] = [
      {
        id: 'r',
        name: '',
        description: '',
        sourceAgentId: 'a',
        targetAgentId: 'b',
        reason: 'delegation',
        autoAccept: false,
        priority: 1,
        enabled: false,
        condition: { type: 'keyword', keywords: ['x'] },
      },
    ];
    expect(evaluateHandoffRules(rules, { lastMessage: 'x', state: {} })).toHaveLength(0);
  });

  it('handles empty message safely in triage', async () => {
    const req = await triageHandoff('triage', '', specialists, baseHistory(''));
    expect(req).toBeNull();
  });
});
