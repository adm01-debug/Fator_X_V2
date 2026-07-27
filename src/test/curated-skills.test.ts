/**
 * Guard de integridade do catálogo curado de skills.
 *
 * Estas asserções protegem a base mínima que alimenta a vinculação
 * automática template ↔ skill: se alguém remover skills ou quebrar a
 * taxonomia, os 41 templates de agentes voltam a ficar órfãos.
 */
import { describe, expect, it } from 'vitest';
import { CURATED_SKILLS, curatedCoverage } from '@/data/curatedSkills';
import { SKILL_DEPARTMENTS } from '@/config/skill-departments';

const VALID_CATEGORIES = new Set(['tools', 'knowledge', 'prompts', 'workflows', 'integrations']);
const VALID_DEPARTMENTS = new Set<string>(SKILL_DEPARTMENTS.map((d) => d));

describe('curatedSkills', () => {
  it('não possui slugs duplicados', () => {
    const slugs = CURATED_SKILLS.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('usa slugs kebab-case prefixados com nexus-', () => {
    for (const skill of CURATED_SKILLS) {
      expect(skill.slug, skill.name).toMatch(/^nexus-[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('referencia apenas departamentos da taxonomia canônica', () => {
    for (const skill of CURATED_SKILLS) {
      expect(VALID_DEPARTMENTS.has(skill.department), skill.slug).toBe(true);
    }
  });

  it('usa apenas categorias suportadas pelo registry', () => {
    for (const skill of CURATED_SKILLS) {
      expect(VALID_CATEGORIES.has(skill.category), skill.slug).toBe(true);
    }
  });

  it('cobre todos os departamentos com no mínimo 4 skills', () => {
    const coverage = curatedCoverage();
    for (const dept of SKILL_DEPARTMENTS) {
      expect(coverage[dept] ?? 0, `departamento ${dept}`).toBeGreaterThanOrEqual(4);
    }
  });

  it('mantém descrições informativas e tags suficientes para o matching', () => {
    for (const skill of CURATED_SKILLS) {
      expect(skill.description.length, skill.slug).toBeGreaterThanOrEqual(60);
      expect(skill.description.length, skill.slug).toBeLessThanOrEqual(320);
      expect(skill.tags.length, skill.slug).toBeGreaterThanOrEqual(5);
      // A primeira tag deve ser o próprio departamento (usado como sinal forte no ranking).
      expect(skill.tags[0], skill.slug).toBe(skill.department);
    }
  });

  it('atribui quality_score dentro da faixa curada', () => {
    for (const skill of CURATED_SKILLS) {
      expect(skill.qualityScore, skill.slug).toBeGreaterThanOrEqual(80);
      expect(skill.qualityScore, skill.slug).toBeLessThanOrEqual(100);
    }
  });
});
