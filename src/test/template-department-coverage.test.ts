import { describe, it, expect } from 'vitest';
import { AGENT_TEMPLATES, TEMPLATE_CATEGORIES } from '@/data/agentTemplates';

/**
 * Guard de cobertura departamental. O risco real não é ter poucos templates —
 * é um template referenciar uma categoria ausente do filtro, ficando
 * invisível na galeria sem erro algum.
 */
describe('Cobertura departamental dos templates', () => {
  const categoryLabels = new Set(TEMPLATE_CATEGORIES.map((c) => c.label));

  it('toda categoria usada por um template existe no filtro da galeria', () => {
    const orphans = AGENT_TEMPLATES
      .filter((t) => !categoryLabels.has(t.category))
      .map((t) => `${t.id} → ${t.category}`);
    expect(orphans).toEqual([]);
  });

  it('toda categoria do filtro possui ao menos um template', () => {
    const used = new Set(AGENT_TEMPLATES.map((t) => t.category));
    const empty = TEMPLATE_CATEGORIES.filter((c) => !used.has(c.label)).map((c) => c.label);
    expect(empty).toEqual([]);
  });

  it('cobre os departamentos antes ausentes', () => {
    const ids = new Set(AGENT_TEMPLATES.map((t) => t.id));
    for (const id of ['spec_ti_infra', 'spec_marketing_performance', 'spec_expedicao_estoque', 'spec_posvenda_cx']) {
      expect(ids.has(id)).toBe(true);
    }
  });
});
