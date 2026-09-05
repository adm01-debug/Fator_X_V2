/**
 * Simulação exaustiva do cross-mapping wizard rápido ↔ galeria.
 *
 * Valida o contrato do mapa (todo id existe na galeria) e as invariantes de
 * priorização de `aggregateTemplateSkillLinks`, incluindo centenas de cenários
 * aleatórios determinísticos (seed fixa).
 */
import { describe, it, expect } from 'vitest';
import { AGENT_TEMPLATES } from '@/data/agentTemplates';
import { QUICK_AGENT_TEMPLATES } from '@/data/quickAgentTemplates';
import {
  QUICK_TYPE_TEMPLATE_MAP,
  resolveQuickTypeTemplateIds,
} from '@/services/quickTypeTemplateMap';
import {
  aggregateTemplateSkillLinks,
  MAX_LINKS_PER_TEMPLATE,
  type DisplayTemplateSkillLink,
} from '@/services/templateSkillLinkService';

function link(
  skillId: string,
  origin: 'auto' | 'manual' = 'auto',
  isStrongMatch = false,
): DisplayTemplateSkillLink {
  return { skillId, skillName: `Skill ${skillId}`, reason: 'r', isStrongMatch, origin };
}

describe('QUICK_TYPE_TEMPLATE_MAP — contrato', () => {
  const galleryIds = new Set(AGENT_TEMPLATES.map((t) => t.id));

  it('cobre todos os tipos do wizard rápido', () => {
    for (const type of Object.keys(QUICK_AGENT_TEMPLATES)) {
      expect(QUICK_TYPE_TEMPLATE_MAP[type as keyof typeof QUICK_TYPE_TEMPLATE_MAP]).toBeDefined();
    }
  });

  it('referencia apenas templates existentes na galeria', () => {
    for (const [type, ids] of Object.entries(QUICK_TYPE_TEMPLATE_MAP)) {
      for (const id of ids) {
        expect(galleryIds.has(id), `${type} → ${id} não existe na galeria`).toBe(true);
      }
    }
  });

  it('não repete o mesmo template dentro de um tipo', () => {
    for (const [type, ids] of Object.entries(QUICK_TYPE_TEMPLATE_MAP)) {
      expect(new Set(ids).size, `${type} tem ids duplicados`).toBe(ids.length);
    }
  });

  it('devolve lista vazia para tipos desconhecidos, sem lançar', () => {
    expect(resolveQuickTypeTemplateIds('inexistente')).toEqual([]);
    expect(resolveQuickTypeTemplateIds('')).toEqual([]);
  });
});

describe('aggregateTemplateSkillLinks — invariantes', () => {
  it('deduplica e soma recorrência entre templates', () => {
    const out = aggregateTemplateSkillLinks([
      { templateId: 't1', links: [link('a'), link('b')] },
      { templateId: 't2', links: [link('a'), link('c')] },
    ]);
    expect(out).toHaveLength(3);
    expect(out.find((l) => l.skillId === 'a')?.templateCount).toBe(2);
    expect(out[0].skillId).toBe('a');
  });

  it('promove curadoria manual acima de match forte', () => {
    const out = aggregateTemplateSkillLinks([
      { templateId: 't1', links: [link('forte', 'auto', true)] },
      { templateId: 't2', links: [link('curada', 'manual', false)] },
    ]);
    expect(out[0].skillId).toBe('curada');
  });

  it('promove um vínculo auto para manual quando outro template o curou', () => {
    const out = aggregateTemplateSkillLinks([
      { templateId: 't1', links: [link('x', 'auto')] },
      { templateId: 't2', links: [{ ...link('x', 'manual'), reason: 'curado' }] },
    ]);
    expect(out[0].origin).toBe('manual');
    expect(out[0].reason).toBe('curado');
    expect(out[0].templateCount).toBe(2);
  });

  it('respeita o limite e trata limites inválidos', () => {
    const groups = [
      { templateId: 't', links: Array.from({ length: 20 }, (_, i) => link(`s${i}`)) },
    ];
    expect(aggregateTemplateSkillLinks(groups, 3)).toHaveLength(3);
    expect(aggregateTemplateSkillLinks(groups, 0)).toHaveLength(MAX_LINKS_PER_TEMPLATE);
    expect(aggregateTemplateSkillLinks(groups, -5)).toHaveLength(MAX_LINKS_PER_TEMPLATE);
    expect(aggregateTemplateSkillLinks(groups, Number.NaN)).toHaveLength(MAX_LINKS_PER_TEMPLATE);
  });

  it('tolera grupos vazios, nulos e ids ausentes', () => {
    const out = aggregateTemplateSkillLinks([
      { templateId: 't1', links: [] },
      { templateId: 't2', links: undefined as unknown as DisplayTemplateSkillLink[] },
      { templateId: 't3', links: [{ ...link(''), skillId: '' }] },
    ]);
    expect(out).toEqual([]);
  });

  it('mantém 4 invariantes em 500 cenários aleatórios determinísticos', () => {
    let seed = 987654321;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    for (let n = 0; n < 500; n += 1) {
      const templates = 1 + Math.floor(rand() * 4);
      const limit = 1 + Math.floor(rand() * 8);
      const groups = Array.from({ length: templates }, (_, ti) => ({
        templateId: `t${ti}`,
        links: Array.from({ length: Math.floor(rand() * 7) }, () =>
          link(`s${Math.floor(rand() * 10)}`, rand() > 0.75 ? 'manual' : 'auto', rand() > 0.5),
        ),
      }));

      const out = aggregateTemplateSkillLinks(groups, limit);

      // 1. nunca excede o limite
      expect(out.length).toBeLessThanOrEqual(limit);
      // 2. sem duplicatas
      expect(new Set(out.map((l) => l.skillId)).size).toBe(out.length);
      // 3. manuais sempre antes de automáticos
      const firstAuto = out.findIndex((l) => l.origin !== 'manual');
      const lastManual = out.map((l) => l.origin).lastIndexOf('manual');
      if (firstAuto !== -1 && lastManual !== -1) expect(lastManual).toBeLessThan(firstAuto);
      // 4. recorrência nunca ultrapassa o número de templates
      for (const l of out) {
        expect(l.templateCount).toBeGreaterThanOrEqual(1);
        expect(l.templateCount).toBeLessThanOrEqual(templates);
        expect(l.sourceTemplateId).toBeTruthy();
      }
    }
  });
});
