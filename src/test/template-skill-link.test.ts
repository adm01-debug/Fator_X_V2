import { describe, it, expect } from 'vitest';
import { AGENT_TEMPLATES } from '@/data/agentTemplates';
import { buildTemplateSignals, linkSkillsToTemplate } from '@/services/templateSkillRegistry';
import type { AgentSkillDefinition } from '@/services/skillsRegistryService';

function skill(partial: Partial<AgentSkillDefinition>): AgentSkillDefinition {
  return {
    id: partial.id ?? 'sk-1',
    name: partial.name ?? 'Skill',
    slug: partial.slug ?? 'skill',
    description: partial.description ?? 'desc',
    version: '1.0.0',
    author: 'Nexus',
    category: partial.category ?? 'tools',
    tags: partial.tags ?? [],
    install_count: partial.install_count ?? 0,
    rating: 0,
    skill_config: {},
    is_verified: true,
    is_public: true,
    created_at: new Date(0).toISOString(),
  } as AgentSkillDefinition;
}

describe('linkSkillsToTemplate', () => {
  const template = AGENT_TEMPLATES[0];

  it('gera sinais normalizados do template', () => {
    const signals = buildTemplateSignals(template);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((s) => s === s.toLowerCase())).toBe(true);
  });

  it('marca match forte quando há tag em comum', () => {
    const signals = buildTemplateSignals(template);
    const linked = linkSkillsToTemplate(
      template,
      [skill({ id: 'a', tags: [signals[0]] }), skill({ id: 'b', tags: ['zzz-inexistente'] })],
      5,
    );
    const strong = linked.find((l) => l.skill.id === 'a');
    expect(strong?.isStrongMatch).toBe(true);
  });

  it('ignora skills virtuais de template', () => {
    const linked = linkSkillsToTemplate(template, [skill({ id: 'tpl:x', tags: ['vendas'] })], 5);
    expect(linked).toHaveLength(0);
  });

  it('respeita o limite', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      skill({ id: `s${i}`, tags: buildTemplateSignals(template).slice(0, 2) }),
    );
    expect(linkSkillsToTemplate(template, many, 3)).toHaveLength(3);
  });
});
