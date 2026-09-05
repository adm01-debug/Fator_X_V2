/**
 * Simulação do destaque temporário de linhas recém-chegadas.
 *
 * Invariantes verificadas:
 *  1. Destaque nunca sobrevive à sua expiração;
 *  2. `pruneHighlights` preserva identidade quando nada expirou (zero re-render);
 *  3. O conjunto destacado nunca cresce sem prune (monotonicidade decrescente);
 *  4. O teto nunca é ultrapassado, mesmo sob rajada;
 *  5. Entradas inválidas (chave vazia, tempo NaN) são inertes.
 */
import { describe, expect, it } from 'vitest';
import {
  beginHighlight,
  countHighlighted,
  highlightKey,
  isHighlighted,
  pruneHighlights,
  CURATION_HIGHLIGHT_CAP,
  CURATION_HIGHLIGHT_TTL_MS,
  EMPTY_HIGHLIGHTS,
} from '@/lib/curationHighlight';

const T0 = 1_800_000_000_000;

describe('highlightKey', () => {
  it('casa exatamente com a chave usada pelo acumulador de pendentes', () => {
    expect(highlightKey('t1', 's1')).toBe('t1::s1');
  });

  it('distingue duplas diferentes', () => {
    expect(highlightKey('t1', 's2')).not.toBe(highlightKey('t2', 's1'));
  });
});

describe('beginHighlight', () => {
  it('destaca todas as chaves recebidas', () => {
    const m = beginHighlight(['a', 'b', 'c'], T0);
    expect(m.size).toBe(3);
    for (const k of ['a', 'b', 'c']) expect(isHighlighted(m, k, T0)).toBe(true);
  });

  it('substitui o ciclo anterior em vez de acumular', () => {
    const primeiro = beginHighlight(['a'], T0);
    const segundo = beginHighlight(['b'], T0 + 100);
    expect(isHighlighted(segundo, 'a', T0 + 100)).toBe(false);
    expect(isHighlighted(primeiro, 'a', T0)).toBe(true);
  });

  it('devolve o mapa vazio compartilhado quando não há nada a destacar', () => {
    expect(beginHighlight([], T0)).toBe(EMPTY_HIGHLIGHTS);
    expect(beginHighlight([''], T0)).toBe(EMPTY_HIGHLIGHTS);
  });

  it('é inerte com tempo ou TTL inválido', () => {
    expect(beginHighlight(['a'], Number.NaN)).toBe(EMPTY_HIGHLIGHTS);
    expect(beginHighlight(['a'], T0, 0)).toBe(EMPTY_HIGHLIGHTS);
    expect(beginHighlight(['a'], T0, -5)).toBe(EMPTY_HIGHLIGHTS);
  });

  it('satura no teto sob rajada', () => {
    const chaves = Array.from({ length: 500 }, (_, i) => `k${i}`);
    expect(beginHighlight(chaves, T0).size).toBe(CURATION_HIGHLIGHT_CAP);
  });

  it('aceita um Set diretamente (formato do acumulador de pendentes)', () => {
    const pendentes: ReadonlySet<string> = new Set(['t1::s1', 't2::s2']);
    const m = beginHighlight(pendentes, T0);
    expect(countHighlighted(m, T0)).toBe(2);
  });
});

describe('isHighlighted — fronteira da expiração', () => {
  it('vale antes do instante de expiração', () => {
    const m = beginHighlight(['a'], T0);
    expect(isHighlighted(m, 'a', T0 + CURATION_HIGHLIGHT_TTL_MS - 1)).toBe(true);
  });

  it('não vale exatamente no instante de expiração', () => {
    const m = beginHighlight(['a'], T0);
    expect(isHighlighted(m, 'a', T0 + CURATION_HIGHLIGHT_TTL_MS)).toBe(false);
  });

  it('chave ausente nunca está destacada', () => {
    expect(isHighlighted(beginHighlight(['a'], T0), 'z', T0)).toBe(false);
  });

  it('tempo inválido não destaca nada', () => {
    expect(isHighlighted(beginHighlight(['a'], T0), 'a', Number.NaN)).toBe(false);
  });
});

describe('pruneHighlights — identidade preservada', () => {
  it('devolve o MESMO mapa quando nada expirou', () => {
    const m = beginHighlight(['a', 'b'], T0);
    expect(pruneHighlights(m, T0 + 1)).toBe(m);
  });

  it('devolve o MESMO mapa quando já está vazio', () => {
    expect(pruneHighlights(EMPTY_HIGHLIGHTS, T0)).toBe(EMPTY_HIGHLIGHTS);
  });

  it('devolve o MESMO mapa com tempo inválido (nunca perde estado por erro)', () => {
    const m = beginHighlight(['a'], T0);
    expect(pruneHighlights(m, Number.NaN)).toBe(m);
  });

  it('remove somente o que expirou', () => {
    const mapa: ReadonlyMap<string, number> = new Map([
      ['a', T0 + 1_000],
      ['b', T0 + 9_000],
    ]);
    const podado = pruneHighlights(mapa, T0 + 5_000);
    expect([...podado.keys()]).toEqual(['b']);
  });

  it('colapsa para o vazio compartilhado quando tudo expira', () => {
    const m = beginHighlight(['a', 'b'], T0);
    expect(pruneHighlights(m, T0 + CURATION_HIGHLIGHT_TTL_MS)).toBe(EMPTY_HIGHLIGHTS);
  });

  it('nunca muta o mapa recebido', () => {
    const m = beginHighlight(['a', 'b'], T0);
    pruneHighlights(m, T0 + CURATION_HIGHLIGHT_TTL_MS);
    expect(m.size).toBe(2);
  });
});

describe('ciclo de vida completo — 600 instantes simulados', () => {
  it('a contagem é monotônica não-crescente e chega a zero', () => {
    let mapa = beginHighlight(
      Array.from({ length: 40 }, (_, i) => `k${i}`),
      T0,
    );
    let anterior = countHighlighted(mapa, T0);
    expect(anterior).toBe(40);

    for (let passo = 1; passo <= 600; passo += 1) {
      const agora = T0 + passo * 25;
      mapa = pruneHighlights(mapa, agora);
      const atual = countHighlighted(mapa, agora);
      expect(atual).toBeLessThanOrEqual(anterior);
      // Invariante 1: nada sobrevive à expiração.
      if (agora >= T0 + CURATION_HIGHLIGHT_TTL_MS) expect(atual).toBe(0);
      anterior = atual;
    }
    expect(anterior).toBe(0);
  });

  it('ciclos sucessivos de atualização nunca acumulam além do teto', () => {
    let mapa = EMPTY_HIGHLIGHTS;
    for (let ciclo = 1; ciclo <= 120; ciclo += 1) {
      const agora = T0 + ciclo * 500;
      const novas = Array.from({ length: ciclo % 7 }, (_, i) => `c${ciclo}-${i}`);
      mapa = beginHighlight(novas, agora);
      mapa = pruneHighlights(mapa, agora);
      expect(mapa.size).toBeLessThanOrEqual(CURATION_HIGHLIGHT_CAP);
      expect(countHighlighted(mapa, agora)).toBe(novas.length);
    }
  });

  it('prune intercalado nunca ressuscita uma chave', () => {
    const mapa = beginHighlight(['a'], T0);
    const morto = pruneHighlights(mapa, T0 + CURATION_HIGHLIGHT_TTL_MS);
    for (let i = 0; i < 50; i += 1) {
      expect(isHighlighted(morto, 'a', T0 + i)).toBe(false);
    }
  });
});
