/**
 * Invariantes do classificador de departamento.
 *
 * Esta suíte nasceu de três hipóteses de melhoria que foram REFUTADAS por
 * simulação contra o catálogo real (142 skills). Os testes existem para
 * impedir que alguém "conserte" o classificador reintroduzindo justamente as
 * ideias que os dados já descartaram:
 *
 *  1. Enriquecer léxicos com os tokens mais frequentes do corpus.
 *     Refutada: o topo da lista é boilerplate transversal ("skills", "agent",
 *     "claude", "awesome", "list"), presente em todo departamento. Absorvê-lo
 *     destruiria o poder discriminativo. → `nao acumula termos transversais`.
 *
 *  2. Filtrar tokens por document frequency (IDF) para tirar o ruído do
 *     denominador. Refutada: o corte não move a cobertura (78 → 78 skills
 *     acima do limiar) porque o boilerplate não pertence a léxico nenhum e só
 *     entra no denominador; cortes agressivos derrubam sinal junto (78 → 69).
 *     → `ruido fora do lexico nao inverte o vencedor`.
 *
 *  3. O scorer estaria punindo skills bem-tagueadas. Refutada: 1.420 pares
 *     (skill × departamento) sem uma única violação. → `monotonicidade`.
 *
 * Conclusão registrada: a baixa confiança em ~64 skills não é defeito do
 * classificador — é ausência real de vocabulário de domínio nesses repos
 * (agregadores do tipo "awesome-list"). Baixar o limiar produziria
 * reclassificações erradas com aparência de progresso.
 */
import { describe, expect, it } from 'vitest';
import { DEPARTMENT_META, DOMAIN_DEPARTMENTS, FALLBACK_DEPARTMENT, SKILL_DEPARTMENTS } from '@/config/skill-departments';
import { classifyDepartment, LOW_CONFIDENCE_THRESHOLD } from '@/services/skillDepartmentClassifier';

/** PRNG determinístico — a suíte não pode variar entre execuções. */
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** Boilerplate real observado no catálogo, transversal a todo departamento. */
const RUIDO_TRANSVERSAL = [
  'skills',
  'agent',
  'agents',
  'claude',
  'code',
  'tools',
  'awesome',
  'list',
  'curated',
  'collection',
  'hacktoberfest',
  'open',
  'source',
] as const;

function scoreDe(
  input: Parameters<typeof classifyDepartment>[0],
  dep: (typeof SKILL_DEPARTMENTS)[number],
): number {
  return classifyDepartment(input).ranking.find((r) => r.department === dep)!.score;
}

describe('classificador de departamento — invariantes', () => {
  it('monotonicidade: somar um termo do léxico nunca reduz o score daquele departamento', () => {
    const rng = makeRng(20260728);
    let testes = 0;

    for (let i = 0; i < 60; i++) {
      // Skill sintética com tags aleatórias tiradas de vários léxicos.
      const tagsIniciais = Array.from({ length: Math.floor(rng() * 8) }, () => {
        const dep = SKILL_DEPARTMENTS[Math.floor(rng() * SKILL_DEPARTMENTS.length)];
        const lex = DEPARTMENT_META[dep].lexicon;
        return lex[Math.floor(rng() * lex.length)];
      });
      const base = {
        name: `skill sintetica ${i}`,
        description: RUIDO_TRANSVERSAL.slice(0, Math.floor(rng() * 5)).join(' '),
        tags: tagsIniciais,
      };

      for (const dep of SKILL_DEPARTMENTS) {
        const lex = DEPARTMENT_META[dep].lexicon;
        const termo = lex[Math.floor(rng() * lex.length)];
        const antes = scoreDe(base, dep);
        const depois = scoreDe({ ...base, tags: [...base.tags, termo] }, dep);
        testes++;
        expect(
          depois,
          `somar "${termo}" baixou ${dep} de ${antes} para ${depois}`,
        ).toBeGreaterThanOrEqual(antes - 1e-9);
      }
    }

    expect(testes).toBeGreaterThanOrEqual(60 * SKILL_DEPARTMENTS.length);
  });

  it('não acumula termos transversais: boilerplate puro nunca vira departamento de negócio', () => {
    // Se algum dia alguém enfiar "agent" ou "awesome" num léxico de domínio,
    // este teste cai. O balde `transversal` é o único destino aceitável.
    for (const ruido of RUIDO_TRANSVERSAL) {
      const r = classifyDepartment({ name: ruido, description: ruido, tags: [ruido] });
      if (r.department === FALLBACK_DEPARTMENT) continue;
      expect(r.department, `"${ruido}" virou sinal de departamento`).toBeNull();
      expect(r.confidence, `"${ruido}" pontuou em domínio`).toBeLessThan(
        LOW_CONFIDENCE_THRESHOLD,
      );
    }
  });

  it('transversal jamais compete com um departamento de negócio com sinal', () => {
    for (const ruido of RUIDO_TRANSVERSAL) {
      for (const dep of DOMAIN_DEPARTMENTS) {
        const forte = DEPARTMENT_META[dep].lexicon.slice(0, 6).join(' ');
        const r = classifyDepartment({
          name: `${ruido} ${forte}`,
          description: forte,
          tags: DEPARTMENT_META[dep].lexicon.slice(0, 4),
        });
        expect(r.department, `${dep} perdeu para transversal por causa de "${ruido}"`).toBe(dep);
      }
    }
  });

  it('ruído fora do léxico não inverte o vencedor', () => {
    const rng = makeRng(7);
    for (const dep of SKILL_DEPARTMENTS) {
      const lex = DEPARTMENT_META[dep].lexicon;
      if (lex.length < 3) continue;
      const base = { name: lex.slice(0, 3).join(' '), description: '', tags: lex.slice(0, 3) };
      const vencedorLimpo = classifyDepartment(base).department;

      // Injeta boilerplate: pode diluir a confiança, mas não trocar o líder.
      const sujo = {
        ...base,
        description: Array.from(
          { length: 6 },
          () => RUIDO_TRANSVERSAL[Math.floor(rng() * RUIDO_TRANSVERSAL.length)],
        ).join(' '),
      };
      expect(classifyDepartment(sujo).department).toBe(vencedorLimpo);
    }
  });

  it('determinismo: a mesma entrada produz exatamente o mesmo ranking', () => {
    const entrada = {
      name: 'pipeline de dados analitico',
      description: 'etl warehouse dashboards',
      tags: ['sql', 'bi'],
    };
    const a = classifyDepartment(entrada);
    const b = classifyDepartment(entrada);
    expect(a).toEqual(b);
    // Ranking sempre decrescente e cobrindo todos os departamentos.
    expect(a.ranking).toHaveLength(SKILL_DEPARTMENTS.length);
    for (let i = 1; i < a.ranking.length; i++) {
      expect(a.ranking[i - 1].score).toBeGreaterThanOrEqual(a.ranking[i].score);
    }
  });

  it('entradas vazias ou hostis degradam para nulo em vez de quebrar', () => {
    for (const entrada of [
      { name: '', description: '', tags: [] },
      { name: '   ', description: undefined, tags: undefined },
      { name: '🔥🔥🔥', description: '—', tags: ['', '  '] },
      { name: 'x'.repeat(5000), description: 'y'.repeat(5000), tags: [] },
    ]) {
      const r = classifyDepartment(entrada);
      expect(Number.isFinite(r.confidence)).toBe(true);
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.ranking).toHaveLength(SKILL_DEPARTMENTS.length);
    }
  });
});
