/**
 * Guarda de paridade entre a taxonomia do frontend (`src/config/skill-departments.ts`)
 * e o espelho Deno consumido pela Edge Function `skill-harvester`
 * (`supabase/functions/skill-harvester/departments.ts`).
 *
 * Por que existe: Deno não importa de `src/`, então o léxico vive duplicado.
 * Uma divergência silenciosa faz o harvester gravar departamentos que a UI
 * classificaria de outro jeito — inconsistência que só aparece semanas depois,
 * já com centenas de linhas contaminadas no registry. Este teste lê os DOIS
 * arquivos-fonte e falha no exato commit que os separa.
 *
 * Também trava as duas colisões de unigrama já corrigidas por simulação:
 * `resources` (roubava awesome-lists para RH) e `learning` (roubava conteúdo
 * educacional para Dados). Reintroduzi-las quebra o build.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEPARTMENT_META,
  SKILL_DEPARTMENTS,
  type SkillDepartment,
} from '@/config/skill-departments';

const MIRROR_PATH = resolve(
  process.cwd(),
  'supabase/functions/skill-harvester/departments.ts',
);

const mirrorSource = readFileSync(MIRROR_PATH, 'utf8');

/**
 * Extrai o léxico de um departamento do texto-fonte do espelho Deno.
 * O espelho declara `DEPARTMENT_LEXICON: Record<SkillDepartment, string[]>`,
 * ou seja, `dept: [ ...termos ]` — sem a chave `lexicon:` do frontend.
 */
function extractMirrorLexicon(dept: SkillDepartment): string[] {
  const blocoRe = new RegExp(`\\n\\s*${dept}:\\s*\\[([\\s\\S]*?)\\n\\s*\\]`, 'm');
  const match = mirrorSource.match(blocoRe);
  if (!match) return [];
  return Array.from(match[1].matchAll(/'([^']+)'/g)).map((m) => m[1]);
}

describe('paridade taxonomia frontend x espelho Deno', () => {
  it('o espelho declara exatamente os mesmos departamentos', () => {
    for (const dept of SKILL_DEPARTMENTS) {
      expect(mirrorSource, `departamento ${dept} ausente no espelho`).toContain(`${dept}:`);
    }
  });

  it('cada léxico é idêntico como conjunto, sem termos órfãos dos dois lados', () => {
    for (const dept of SKILL_DEPARTMENTS) {
      const frontend = [...DEPARTMENT_META[dept].lexicon].sort();
      const espelho = [...new Set(extractMirrorLexicon(dept))].sort();
      expect(espelho.length, `léxico de ${dept} não foi encontrado no espelho`).toBeGreaterThan(0);
      expect(espelho, `divergência de léxico em ${dept}`).toEqual(frontend);
    }
  });
});

describe('colisões de unigrama corrigidas por simulação', () => {
  it('resources não volta ao léxico de RH (roubava awesome-lists)', () => {
    expect(DEPARTMENT_META.rh.lexicon).not.toContain('resources');
    expect(extractMirrorLexicon('rh')).not.toContain('resources');
  });

  it('learning não volta ao léxico de Dados (roubava conteúdo educacional)', () => {
    expect(DEPARTMENT_META.dados.lexicon).not.toContain('learning');
    expect(extractMirrorLexicon('dados')).not.toContain('learning');
  });

  it('RH e Dados preservam sinal próprio suficiente após a remoção', () => {
    for (const termo of ['rh', 'hr', 'recursos', 'humanos', 'human', 'people']) {
      expect(DEPARTMENT_META.rh.lexicon).toContain(termo);
    }
    for (const termo of ['machine', 'statistics', 'estatistica']) {
      expect(DEPARTMENT_META.dados.lexicon).toContain(termo);
    }
  });

  /**
   * Sobreposição de termos entre departamentos é legítima (`pipeline` serve a
   * Comercial e a TI; `analytics` a Marketing e a Dados) — o score ponderado
   * resolve o desempate. O que NÃO pode acontecer é uma colisão nova entrar
   * sem revisão humana, porque foi exatamente assim que `resources` e
   * `learning` passaram a roubar classificações. O conjunto abaixo é o
   * snapshot revisado; qualquer termo novo compartilhado quebra o build e
   * exige simulação antes de ser aceito aqui.
   */
  it('o conjunto de termos compartilhados é exatamente o snapshot revisado', () => {
    const COLISOES_REVISADAS = [
      'analytics: marketing x dados',
      'engajamento: rh x marketing',
      'forecast: comercial x dados',
      'funil: comercial x marketing',
      'helpdesk: ti x pos_venda',
      'inventory: ti x logistica',
      'kpi: dados x executivo',
      'meta: marketing x executivo',
      'meta: marketing x transversal',
      'nfe: financeiro x logistica',
      'orcamento: financeiro x comercial',
      'pipeline: comercial x dados',
      'pipeline: comercial x ti',
      'warehouse: logistica x dados',
    ];

    const dono = new Map<string, SkillDepartment>();
    const colisoes: string[] = [];
    for (const dept of SKILL_DEPARTMENTS) {
      for (const termo of DEPARTMENT_META[dept].lexicon) {
        const anterior = dono.get(termo);
        if (anterior && anterior !== dept) colisoes.push(`${termo}: ${anterior} x ${dept}`);
        else dono.set(termo, dept);
      }
    }

    expect(colisoes.sort()).toEqual([...COLISOES_REVISADAS].sort());
  });
});
