/**
 * Guard de integridade dos vínculos template ↔ skill.
 *
 * Garante que TODO template departamental encontre skills instaláveis no
 * registry curado e que coletâneas (awesome-lists) nunca subam como vínculo
 * forte. Sem rede: usa o catálogo curado local como registry.
 */
import { describe, expect, it } from 'vitest';
import { AGENT_TEMPLATES } from '@/data/agentTemplates';
import { CURATED_SKILLS } from '@/data/curatedSkills';
import { linkSkillsToTemplate } from '@/services/templateSkillRegistry';
import type { AgentSkillDefinition } from '@/services/skillsRegistryService';

const registry = CURATED_SKILLS as unknown as AgentSkillDefinition[];

/** Coletânea sintética: deve ser penalizada e nunca virar vínculo forte. */
const genericSkill: AgentSkillDefinition = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'awesome ai agents',
  slug: 'awesome-ai-agents',
  description: 'A curated list of awesome AI agent resources',
  version: '1.0.0',
  author: 'github',
  category: 'knowledge',
  tags: ['awesome', 'list', 'ia'],
  install_count: 99999,
  rating: 5,
  skill_config: {},
  is_verified: false,
  is_public: true,
  created_at: new Date(0).toISOString(),
  department: 'ia',
  quality_score: 90,
};

describe('template ↔ skill links', () => {
  it('vincula todos os templates a pelo menos uma skill', () => {
    const semVinculo = AGENT_TEMPLATES.filter(
      (t) => linkSkillsToTemplate(t, registry, 6).length === 0,
    ).map((t) => t.id);

    expect(semVinculo).toEqual([]);
  });

  it('produz apenas vínculos fortes com o catálogo curado', () => {
    for (const template of AGENT_TEMPLATES) {
      const links = linkSkillsToTemplate(template, registry, 4);
      expect(links.some((l) => l.isStrongMatch)).toBe(true);
    }
  });

  it('nunca marca coletâneas como vínculo forte', () => {
    const comGenerica = [...registry, genericSkill];
    for (const template of AGENT_TEMPLATES) {
      const links = linkSkillsToTemplate(template, comGenerica, 6);
      const generica = links.find((l) => l.skill.id === genericSkill.id);
      if (generica) expect(generica.isStrongMatch).toBe(false);
    }
  });

  it('mantém a coletânea fora do topo do ranking', () => {
    const comGenerica = [...registry, genericSkill];
    for (const template of AGENT_TEMPLATES) {
      const links = linkSkillsToTemplate(template, comGenerica, 6);
      expect(links[0]?.skill.id).not.toBe(genericSkill.id);
    }
  });

  it('respeita o limite solicitado de vínculos por template', () => {
    for (const template of AGENT_TEMPLATES) {
      expect(linkSkillsToTemplate(template, registry, 3).length).toBeLessThanOrEqual(3);
    }
  });
});
