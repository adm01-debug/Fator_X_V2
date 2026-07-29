/**
 * Paridade entre os DOIS classificadores de departamento.
 *
 * O sistema tem duas implementações do mesmo julgamento:
 *  - `src/services/skillDepartmentClassifier.ts` — roda no cliente, usada na
 *    reclassificação em massa e na fila de curadoria;
 *  - `supabase/functions/skill-harvester/lib.ts` — roda em Deno, decide o
 *    rótulo com que a skill NASCE no staging e que a promoção copia para
 *    `skill_registry` sem recalcular.
 *
 * Enquanto o espelho Deno não tinha stopwords nem tier de plataforma, a mesma
 * skill recebia uma confiança na coleta e outra na reclassificação. O efeito
 * observável não era um erro — era pior: a fila de revisão mudava de tamanho
 * sozinha, e ninguém conseguia dizer se a curadoria tinha progredido ou se o
 * medidor havia se mexido. Um sistema que mede a si mesmo com duas réguas não
 * tem métrica, tem opinião.
 *
 * Esta suíte trava as duas implementações no mesmo veredito sobre centenas de
 * cenários gerados deterministicamente + os casos reais que motivaram cada
 * regra. Falha aqui = drift; corrija AMBOS os arquivos.
 */
import { describe, expect, it } from 'vitest';
import {
  DEPARTMENT_META,
  DOMAIN_DEPARTMENTS,
  SKILL_DEPARTMENTS,
} from '@/config/skill-departments';
import { classifyDepartment as classifyApp } from '@/services/skillDepartmentClassifier';
import {
  classifyDepartment as classifyDeno,
  PLATFORM_STOPWORDS as DENO_STOPWORDS,
} from '../../supabase/functions/skill-harvester/lib';
import { PLATFORM_STOPWORDS as APP_STOPWORDS } from '@/services/skillDepartmentClassifier';
import { DEPARTMENT_LEXICON } from '../../supabase/functions/skill-harvester/departments';

interface Caso {
  name: string;
  description?: string;
  tags?: string[];
  content?: string;
}

/** PRNG determinístico: a suíte não pode variar entre execuções. */
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const RUIDO_PLATAFORMA = [
  'agent', 'skills', 'claude', 'mcp', 'llm', 'prompt', 'openai', 'tools',
];
const RUIDO_NEUTRO = ['awesome', 'list', 'curated', 'collection', 'open', 'source', 'hacktoberfest'];

/** Casos reais que motivaram cada regra do classificador. */
const CASOS_REAIS: Caso[] = [
  { name: 'gstack', description: 'Router for the gstack skill suite', tags: [] },
  { name: 'fastmcp', description: 'Fast MCP servers and clients in Python', tags: ['mcp', 'python', 'llm', 'agent', 'tools'] },
  { name: 'TradingAgents', description: 'Multi-agent LLM financial trading framework', tags: ['trading', 'finance', 'llm'] },
  { name: 'eCommerce Skills', description: 'Skills for online store operations, catalog and checkout', tags: ['ecommerce', 'vendas'] },
  { name: 'awesome-claude-skills', description: 'A curated list of awesome Claude skills', tags: ['awesome', 'list', 'claude'] },
  { name: 'obsidian-wiki', description: 'Knowledge base agent for Obsidian vaults', tags: ['obsidian', 'knowledge'] },
  { name: 'RuView', description: 'Code review companion', tags: [] },
  { name: '', description: '', tags: [] },
  { name: '   ', tags: [] },
  { name: '🔥🔥🔥', description: '—', tags: ['', '  '] },
  { name: 'x'.repeat(3000), description: 'y'.repeat(3000), tags: [] },
];

/** Gera centenas de cenários misturando léxico de domínio, jargão e ruído. */
function gerarCenarios(qtd: number): Caso[] {
  const rng = makeRng(20260729);
  const casos: Caso[] = [];

  for (let i = 0; i < qtd; i++) {
    const dep = SKILL_DEPARTMENTS[Math.floor(rng() * SKILL_DEPARTMENTS.length)];
    const lex = DEPARTMENT_META[dep].lexicon;
    const nTermos = Math.floor(rng() * 5); // 0..4 — inclui o caso sem sinal
    const termos = Array.from({ length: nTermos }, () => lex[Math.floor(rng() * lex.length)]);
    const jargao = Array.from(
      { length: Math.floor(rng() * 5) },
      () => RUIDO_PLATAFORMA[Math.floor(rng() * RUIDO_PLATAFORMA.length)],
    );
    const neutro = Array.from(
      { length: Math.floor(rng() * 4) },
      () => RUIDO_NEUTRO[Math.floor(rng() * RUIDO_NEUTRO.length)],
    );

    casos.push({
      name: [...termos.slice(0, 2), ...jargao.slice(0, 2)].join(' ').trim() || `repo-${i}`,
      description: [...neutro, ...termos.slice(2)].join(' '),
      tags: rng() > 0.35 ? [...termos, ...jargao.slice(0, 2)] : [],
      content: rng() > 0.7 ? [...termos, ...neutro].join(' ') : undefined,
    });
  }

  return casos;
}

const CENARIOS = [...CASOS_REAIS, ...gerarCenarios(400)];

describe('paridade classificador app ↔ harvester (Deno)', () => {
  it('os léxicos das duas implementações são idênticos, departamento a departamento', () => {
    for (const dep of SKILL_DEPARTMENTS) {
      const app = [...DEPARTMENT_META[dep].lexicon].sort();
      const deno = [...(DEPARTMENT_LEXICON[dep] ?? [])].sort();
      expect(deno, `léxico de "${dep}" divergiu entre app e harvester`).toEqual(app);
    }
  });

  it('as stopwords de plataforma são idênticas', () => {
    expect([...DENO_STOPWORDS].sort()).toEqual([...APP_STOPWORDS].sort());
  });

  it.each(CENARIOS.map((c, i) => [i, c] as const))(
    'cenário %i produz o mesmo veredito nas duas implementações',
    (_i, caso) => {
      const app = classifyApp(caso);
      const deno = classifyDeno(caso);
      expect(deno.department).toBe(app.department);
      expect(deno.confidence).toBeCloseTo(app.confidence, 3);
      expect(deno.tier).toBe(app.tier);
      expect(deno.needsReview).toBe(app.needsReview);
    },
  );

  it('a procedência gravada no staging reflete o tier que produziu o rótulo', () => {
    for (const caso of CENARIOS) {
      const { tier, department, source } = classifyDeno(caso);
      const esperado =
        tier === 'platform' ? 'platform_heuristic' : department ? 'heuristic' : 'unknown';
      expect(source, `${caso.name}: procedência incoerente com o tier`).toBe(esperado);
    }
  });

  it('jargão puro nunca nasce como departamento de negócio no harvester', () => {
    for (const ruido of RUIDO_PLATAFORMA) {
      const r = classifyDeno({ name: ruido, description: ruido, tags: [ruido] });
      if (r.department === null) continue;
      expect(
        r.tier,
        `"${ruido}" virou domínio no harvester`,
      ).not.toBe('domain');
    }
  });

  it('domínio com sinal forte vence o jargão nas duas implementações', () => {
    for (const dep of DOMAIN_DEPARTMENTS) {
      const forte = DEPARTMENT_META[dep].lexicon.slice(0, 6);
      const caso: Caso = {
        name: `agent claude ${forte.slice(0, 3).join(' ')}`,
        description: forte.join(' '),
        tags: forte.slice(0, 4),
      };
      expect(classifyDeno(caso).department, `${dep} perdeu para jargão no harvester`).toBe(dep);
      expect(classifyApp(caso).department).toBe(dep);
    }
  });
});
