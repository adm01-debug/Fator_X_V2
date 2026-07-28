/**
 * Simulação exaustiva da guarda pré-instalação do teto de skills.
 *
 * Cobre: matriz combinatória de ocupação x seleção, duplicatas por
 * normalização, nomes inválidos, estouro pré-existente e invariantes
 * algébricas do trim.
 */
import { describe, it, expect } from 'vitest';
import {
  evaluateInstallImpact,
  trimSelectionToCap,
  normalizeSkillName,
  type NamedSkillRef,
} from '@/lib/skills/installGuard';
import { MAX_PROMPT_SKILLS } from '@/lib/skills/promptSimulation';

const ref = (n: number, prefix = 'skill'): NamedSkillRef => ({
  id: `${prefix}-${n}`,
  name: `${prefix} ${n}`,
});
const many = (count: number, prefix = 'skill'): NamedSkillRef[] =>
  Array.from({ length: count }, (_, i) => ref(i, prefix));

describe('normalizeSkillName', () => {
  it('remove acentos, caixa e espaços redundantes', () => {
    expect(normalizeSkillName('  Análise   DE Dados ')).toBe('analise de dados');
  });

  it('trata entradas não string como vazio', () => {
    expect(normalizeSkillName(undefined)).toBe('');
    expect(normalizeSkillName(42 as unknown as string)).toBe('');
  });
});

describe('evaluateInstallImpact — matriz combinatória', () => {
  it('mantém invariantes em ~900 combinações de ocupação x seleção', () => {
    for (let instaladas = 0; instaladas <= 29; instaladas++) {
      for (let novas = 0; novas <= 29; novas++) {
        const r = evaluateInstallImpact({
          installed: many(instaladas, 'inst'),
          selected: many(novas, 'nova'),
        });

        expect(r.currentSlots).toBe(instaladas);
        expect(r.effectiveAdds).toBe(novas);
        expect(r.projectedSlots).toBe(instaladas + novas);
        expect(r.totalDroppedAfter).toBe(
          Math.max(0, instaladas + novas - MAX_PROMPT_SKILLS),
        );
        expect(r.additionalDropped).toBeGreaterThanOrEqual(0);
        expect(r.headroomAfter).toBeGreaterThanOrEqual(0);
        // Não pode haver folga e descarte ao mesmo tempo.
        expect(r.headroomAfter > 0 && r.totalDroppedAfter > 0).toBe(false);
        expect(r.message.length).toBeGreaterThan(10);

        if (r.additionalDropped > 0) expect(r.verdict).toBe('bloqueio_recomendado');
        else if (r.headroomAfter > 3 && novas > 0) expect(r.verdict).toBe('ok');
      }
    }
  });

  it('exatamente no teto não é bloqueio, mas é atenção', () => {
    const r = evaluateInstallImpact({
      installed: many(MAX_PROMPT_SKILLS - 1, 'inst'),
      selected: [ref(999, 'nova')],
    });
    expect(r.projectedSlots).toBe(MAX_PROMPT_SKILLS);
    expect(r.additionalDropped).toBe(0);
    expect(r.verdict).toBe('atencao');
  });

  it('marca crossesCap apenas na primeira travessia', () => {
    const primeira = evaluateInstallImpact({
      installed: many(MAX_PROMPT_SKILLS, 'inst'),
      selected: [ref(1, 'nova')],
    });
    expect(primeira.crossesCap).toBe(true);

    const jaEstourado = evaluateInstallImpact({
      installed: many(MAX_PROMPT_SKILLS + 4, 'inst'),
      selected: [ref(1, 'nova')],
    });
    expect(jaEstourado.crossesCap).toBe(false);
    expect(jaEstourado.additionalDropped).toBe(1);
  });
});

describe('evaluateInstallImpact — redundâncias', () => {
  it('não conta seleção duplicada por normalização', () => {
    const r = evaluateInstallImpact({
      installed: [{ id: 'a', name: 'Análise de Dados' }],
      selected: [
        { id: 'b', name: '  ANALISE   de dados ' },
        { id: 'c', name: 'Nova Skill' },
        { id: 'd', name: 'nova skill' },
      ],
    });
    expect(r.effectiveAdds).toBe(1);
    expect(r.redundant).toHaveLength(2);
  });

  it('ignora nomes vazios ou inválidos', () => {
    const r = evaluateInstallImpact({
      installed: [],
      selected: [
        { id: 'a', name: '   ' },
        { id: 'b', name: '' },
        { id: 'c', name: 'Válida' },
      ],
    });
    expect(r.effectiveAdds).toBe(1);
    expect(r.redundant).toHaveLength(2);
  });

  it('seleção 100% redundante vira atenção, não ok', () => {
    const r = evaluateInstallImpact({
      installed: [{ id: 'a', name: 'Skill' }],
      selected: [{ id: 'b', name: 'skill' }],
    });
    expect(r.effectiveAdds).toBe(0);
    expect(r.verdict).toBe('atencao');
    expect(r.message).toContain('Nenhuma skill nova');
  });

  it('entradas nulas não quebram a avaliação', () => {
    const r = evaluateInstallImpact({
      installed: [null as unknown as NamedSkillRef],
      selected: [undefined as unknown as NamedSkillRef],
    });
    expect(r.currentSlots).toBe(0);
    expect(r.effectiveAdds).toBe(0);
  });
});

describe('trimSelectionToCap', () => {
  it('nunca deixa a instalação estourar o teto (300 cenários)', () => {
    for (let instaladas = 0; instaladas <= 29; instaladas++) {
      for (let novas = 0; novas <= 9; novas++) {
        const selected = many(novas, 'nova');
        const aceitas = trimSelectionToCap({
          installed: many(instaladas, 'inst'),
          selected,
        });
        const depois = evaluateInstallImpact({
          installed: many(instaladas, 'inst'),
          selected: aceitas,
        });
        expect(depois.additionalDropped).toBe(0);
        expect(aceitas.length).toBeLessThanOrEqual(selected.length);
      }
    }
  });

  it('descarta redundantes antes de contar slots', () => {
    const aceitas = trimSelectionToCap({
      installed: [{ id: 'a', name: 'Skill A' }],
      selected: [
        { id: 'b', name: 'skill a' },
        { id: 'c', name: 'Skill B' },
      ],
    });
    expect(aceitas.map((s) => s.id)).toEqual(['c']);
  });

  it('retorna vazio quando o agente já está no teto', () => {
    expect(
      trimSelectionToCap({
        installed: many(MAX_PROMPT_SKILLS, 'inst'),
        selected: many(5, 'nova'),
      }),
    ).toHaveLength(0);
  });
});
