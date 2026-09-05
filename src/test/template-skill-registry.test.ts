import { describe, it, expect } from 'vitest';
import { AGENT_TEMPLATES } from '@/data/agentTemplates';
import {
  DEPARTMENTS,
  TEMPLATE_SKILL_PREFIX,
  buildTemplateSkillCatalog,
  isTemplateSkillId,
  recommendTemplates,
  resolveDepartmentId,
  templateIdFromSkillId,
} from '@/services/templateSkillRegistry';

describe('templateSkillRegistry', () => {
  it('converte todos os templates para o formato do registry', () => {
    const catalog = buildTemplateSkillCatalog();
    expect(catalog).toHaveLength(AGENT_TEMPLATES.length);
    for (const skill of catalog) {
      expect(isTemplateSkillId(skill.id)).toBe(true);
      expect(skill.id.startsWith(TEMPLATE_SKILL_PREFIX)).toBe(true);
      expect(skill.name.length).toBeGreaterThan(0);
      expect(skill.tags.length).toBeGreaterThan(0);
    }
  });

  it('resolve o id original do template a partir do id virtual', () => {
    expect(templateIdFromSkillId(`${TEMPLATE_SKILL_PREFIX}spec_ti_infra`)).toBe('spec_ti_infra');
    expect(templateIdFromSkillId('skill_real')).toBe('skill_real');
  });

  it('mapeia cada template para um departamento conhecido', () => {
    const known = new Set(DEPARTMENTS.map((d) => d.id));
    for (const t of AGENT_TEMPLATES) {
      const dep = resolveDepartmentId(t);
      expect(dep, `template ${t.id} sem departamento`).toBeDefined();
      expect(known.has(dep!)).toBe(true);
    }
  });

  it('recomenda apenas templates do departamento selecionado', () => {
    const recs = recommendTemplates({ objective: '', departmentId: 'ti' }, 5);
    expect(recs.length).toBeGreaterThan(0);
    for (const r of recs) expect(r.departmentId).toBe('ti');
  });

  it('recomenda por objetivo em linguagem natural', () => {
    const recs = recommendTemplates(
      { objective: 'controlar ruptura e lote de estoque na expedição' },
      5,
    );
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.some((r) => r.template.id === 'spec_expedicao_estoque')).toBe(true);
  });

  it('recomenda marketing de performance para objetivo de tráfego pago', () => {
    const recs = recommendTemplates(
      { objective: 'melhorar roas das campanhas de trafego pago' },
      5,
    );
    expect(recs.some((r) => r.template.id === 'spec_marketing_performance')).toBe(true);
  });

  it('retorna vazio sem objetivo e sem departamento', () => {
    expect(recommendTemplates({ objective: '   ' })).toEqual([]);
  });

  it('respeita o limite solicitado', () => {
    const recs = recommendTemplates(
      { objective: 'suporte de rede e servidor', departmentId: 'ti' },
      2,
    );
    expect(recs.length).toBeLessThanOrEqual(2);
  });
});
