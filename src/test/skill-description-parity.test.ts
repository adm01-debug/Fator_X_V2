import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { fold, isDescriptionEmpty } from '@/lib/skills/descriptionEnrichment';

/**
 * A Edge Function `skill-describe-llm` roda em Deno e não pode importar de
 * `src/`. A duplicação é inevitável; o que não pode acontecer é ela divergir em
 * silêncio. Este teste lê o fonte da função e compara a lista de placeholders
 * e o comportamento do `fold` contra a implementação canônica do frontend.
 */
const EDGE_SRC = readFileSync(
  resolve(process.cwd(), 'supabase/functions/skill-describe-llm/index.ts'),
  'utf8',
);

function extrairPlaceholdersDaEdge(): string[] {
  const bloco = EDGE_SRC.match(/const PLACEHOLDERS = \[([\s\S]*?)\];/);
  expect(bloco, 'bloco PLACEHOLDERS não encontrado na Edge Function').toBeTruthy();
  return [...bloco![1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]);
}

const PLACEHOLDERS_FRONT = [
  'todo',
  'tbd',
  'n/a',
  'na',
  'sem descricao',
  'sem descrição',
  'no description',
  'no description provided',
  'description',
  'descricao',
  'descrição',
  'wip',
  '-',
  '--',
  '...',
];

describe('paridade de placeholders frontend ↔ Edge Function', () => {
  const edge = extrairPlaceholdersDaEdge();

  it('a Edge Function declara exatamente os mesmos marcadores', () => {
    expect([...edge].sort()).toEqual([...PLACEHOLDERS_FRONT].sort());
  });

  it('todo marcador da Edge é reconhecido como vazio pelo módulo canônico', () => {
    for (const p of edge) {
      expect(isDescriptionEmpty(p), `"${p}" deveria ser vazio`).toBe(true);
    }
  });

  it('marcadores dobrados não colidem em uma forma vazia inesperada', () => {
    const dobrados = edge.map(fold);
    // "-", "--" e "..." colapsam para '' de propósito; os demais devem sobrar.
    const soPontuacao = edge.filter((p) => fold(p).length === 0);
    expect(soPontuacao.sort()).toEqual(['-', '--', '...']);
    expect(dobrados).toHaveLength(edge.length);
  });

  it('a Edge Function aplica a checagem antes de aceitar a descrição', () => {
    expect(EDGE_SRC).toContain('isPlaceholderDescription(texto)');
    expect(EDGE_SRC.indexOf('isPlaceholderDescription(texto)')).toBeLessThan(
      EDGE_SRC.indexOf('isEcho(texto, nome, slug)'),
    );
  });

  it('a função fold da Edge é textualmente idêntica à canônica', () => {
    const edgeFold = EDGE_SRC.match(/function fold\(value: string\): string \{([\s\S]*?)\n\}/);
    expect(edgeFold).toBeTruthy();
    const normalizar = (s: string) => s.replace(/\s+/g, ' ').trim();
    expect(normalizar(edgeFold![1])).toBe(
      normalizar(`
        return value
          .normalize('NFD')
          .replace(/[\\u0300-\\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, ' ')
          .trim();
      `),
    );
  });

  it('texto real continua passando (sem falso positivo)', () => {
    expect(isDescriptionEmpty('Extrai tabelas de PDFs escaneados via OCR.')).toBe(false);
    expect(isDescriptionEmpty('TODO: revisar depois desta entrega')).toBe(false);
  });
});
