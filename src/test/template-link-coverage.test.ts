/**
 * Invariantes de cobertura Template ↔ Skill.
 *
 * Estes testes protegem a propriedade que o harness
 * `scripts/template-link-coverage.ts` valida contra o catálogo real:
 * todo template de agente precisa nascer com skills recomendadas,
 * de forma determinística e sem duplicatas.
 */
import { describe, it, expect } from 'vitest';
import { AGENT_TEMPLATES } from '@/data/agentTemplates';
import { CURATED_SKILLS } from '@/data/curatedSkills';
import { linkSkillsToTemplate } from '@/services/templateSkillRegistry';
import type { AgentSkillDefinition } from '@/services/skillsRegistryService';

const MAX_LINKS = 6;

/** Converte o catálogo curado no formato do Registry (sem tocar na rede). */
const CATALOG: AgentSkillDefinition[] = CURATED_SKILLS.map((s, index) => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  name: s.name,
  slug: s.slug,
  description: s.description,
  version: '1.0.0',
  author: 'Nexus',
  category: s.category,
  tags: s.tags,
  install_count: 0,
  rating: 0,
  skill_config: {},
  is_verified: true,
  is_public: true,
  created_at: '2026-01-01T00:00:00.000Z',
  department: s.department,
  quality_score: s.qualityScore,
}));

describe('cobertura de vínculos template ↔ skill', () => {
  it('gera ao menos um vínculo para todo template', () => {
    const vazios = AGENT_TEMPLATES.filter(
      (t) => linkSkillsToTemplate(t, CATALOG, MAX_LINKS).length === 0,
    ).map((t) => t.id);
    expect(vazios).toEqual([]);
  });

  it('nunca ultrapassa o teto de vínculos nem repete skills', () => {
    for (const template of AGENT_TEMPLATES) {
      const links = linkSkillsToTemplate(template, CATALOG, MAX_LINKS);
      expect(links.length).toBeLessThanOrEqual(MAX_LINKS);
      const ids = links.map((l) => l.skill.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('é determinístico entre execuções', () => {
    for (const template of AGENT_TEMPLATES) {
      const a = linkSkillsToTemplate(template, CATALOG, MAX_LINKS).map((l) => [
        l.skill.id,
        l.score,
      ]);
      const b = linkSkillsToTemplate(template, CATALOG, MAX_LINKS).map((l) => [
        l.skill.id,
        l.score,
      ]);
      expect(a).toEqual(b);
    }
  });

  it('ordena do maior para o menor score', () => {
    for (const template of AGENT_TEMPLATES) {
      const scores = linkSkillsToTemplate(template, CATALOG, MAX_LINKS).map((l) => l.score);
      const ordenado = [...scores].sort((x, y) => y - x);
      expect(scores).toEqual(ordenado);
    }
  });

  it('tolera catálogo vazio sem lançar exceção', () => {
    for (const template of AGENT_TEMPLATES) {
      expect(linkSkillsToTemplate(template, [], MAX_LINKS)).toEqual([]);
    }
  });
});
