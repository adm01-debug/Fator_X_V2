/**
 * Simulação exaustiva da paginação por cursor do feed de curadoria.
 *
 * Invariantes verificadas:
 *  1. `resolveNextCursor` só devolve cursor quando a página veio cheia
 *     (página parcial = fim do dataset, sem COUNT caro);
 *  2. O cursor é sempre o carimbo da ORDENAÇÃO (`updated_at`), nunca o de
 *     remoção — paginar por coluna diferente da ordenada abre buracos;
 *  3. A mescla de páginas preserva ordem cronológica decrescente entre dias
 *     e dentro de cada dia;
 *  4. Nenhuma entrada duplicada sobrevive à mescla (a mais recente vence);
 *  5. Nenhum dia vazio é produzido;
 *  6. Mesclar páginas fatiadas == construir o feed inteiro de uma vez.
 */
import { describe, expect, it } from 'vitest';
import {
  buildCurationFeed,
  mergeCurationFeeds,
  resolveNextCursor,
  type CurationFeedDay,
  type RecentCurationRow,
} from '@/services/templateSkillLinkService';

const NOW = new Date('2026-07-27T15:00:00-03:00');
const UID = '11111111-2222-3333-4444-555555555555';

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function row(over: Partial<RecentCurationRow> = {}): RecentCurationRow {
  return {
    template_id: 'customer_support',
    skill_id: 'skill-a',
    reason: 'Curadoria manual',
    updated_at: NOW.toISOString(),
    created_at: NOW.toISOString(),
    updated_by: UID,
    created_by: UID,
    skill: { name: 'Skill A' },
    ...over,
  };
}

/** Achata o feed em pares (template, skill) na ordem de renderização. */
function chaves(feed: CurationFeedDay[]): string[] {
  return feed.flatMap((d) => d.entries.map((e) => `${e.templateId}::${e.skillId}`));
}

/** Carimbos na ordem de renderização (para checar monotonicidade). */
function carimbos(feed: CurationFeedDay[]): number[] {
  return feed.flatMap((d) => d.entries.map((e) => new Date(e.at ?? 0).getTime()));
}

describe('resolveNextCursor', () => {
  it('devolve null quando a página veio incompleta (fim do dataset)', () => {
    expect(resolveNextCursor([row(), row()], 30)).toBeNull();
  });

  it('devolve null para página vazia', () => {
    expect(resolveNextCursor([], 30)).toBeNull();
  });

  it('devolve o updated_at da última linha quando a página veio cheia', () => {
    const antiga = '2026-07-20T10:00:00.000Z';
    const cursor = resolveNextCursor([row(), row({ updated_at: antiga })], 2);
    expect(cursor).toBe(antiga);
  });

  it('usa updated_at mesmo em remoções (coluna da ordenação, não deleted_at)', () => {
    const linha = row({
      updated_at: '2026-07-20T10:00:00.000Z',
      deleted_at: '2026-07-19T10:00:00.000Z',
    });
    expect(resolveNextCursor([linha], 1)).toBe('2026-07-20T10:00:00.000Z');
  });

  it('cai para created_at quando updated_at é nulo', () => {
    const linha = row({ updated_at: null, created_at: '2026-07-18T10:00:00.000Z' });
    expect(resolveNextCursor([linha], 1)).toBe('2026-07-18T10:00:00.000Z');
  });
});

describe('mergeCurationFeeds — casos determinísticos', () => {
  it('lista vazia devolve feed vazio', () => {
    expect(mergeCurationFeeds([])).toEqual([]);
  });

  it('uma única página é idêntica a si mesma', () => {
    const feed = buildCurationFeed([row(), row({ skill_id: 'skill-b' })], UID, NOW);
    expect(mergeCurationFeeds([feed])).toEqual(feed);
  });

  it('funde entradas do mesmo dia em um único grupo', () => {
    const p1 = buildCurationFeed([row({ skill_id: 's1' })], UID, NOW);
    const p2 = buildCurationFeed(
      [row({ skill_id: 's2', updated_at: '2026-07-27T10:00:00-03:00' })],
      UID,
      NOW,
    );
    const merged = mergeCurationFeeds([p1, p2]);
    expect(merged).toHaveLength(1);
    expect(merged[0].entries).toHaveLength(2);
  });

  it('a página mais recente vence na deduplicação', () => {
    const p1 = buildCurationFeed([row({ reason: 'novo' })], UID, NOW);
    const p2 = buildCurationFeed([row({ reason: 'antigo' })], UID, NOW);
    const merged = mergeCurationFeeds([p1, p2]);
    expect(merged[0].entries).toHaveLength(1);
    expect(merged[0].entries[0].reason).toBe('novo');
  });

  it('nunca produz dia sem entradas', () => {
    const merged = mergeCurationFeeds([[{ dayKey: '2026-07-27', dayLabel: 'Hoje', entries: [] }]]);
    expect(merged).toEqual([]);
  });

  it('não muta as páginas de entrada', () => {
    const p1 = buildCurationFeed([row({ skill_id: 's1' })], UID, NOW);
    const antes = p1[0].entries.length;
    mergeCurationFeeds([p1, buildCurationFeed([row({ skill_id: 's2' })], UID, NOW)]);
    expect(p1[0].entries).toHaveLength(antes);
  });
});

describe('mergeCurationFeeds — 500 cenários aleatórios de paginação', () => {
  it('mesclar páginas equivale a construir o feed inteiro', () => {
    for (let cenario = 0; cenario < 500; cenario += 1) {
      const rand = rng(cenario + 7331);
      const total = 1 + Math.floor(rand() * 40);
      const linhas: RecentCurationRow[] = [];

      for (let i = 0; i < total; i += 1) {
        const offsetMin = Math.floor(rand() * 60 * 24 * 6);
        const at = new Date(NOW.getTime() - offsetMin * 60_000).toISOString();
        const removido = rand() < 0.35;
        linhas.push(
          row({
            template_id: rand() < 0.5 ? 'customer_support' : 'sales_assistant',
            skill_id: `skill-${Math.floor(rand() * 12)}`,
            updated_at: at,
            created_at: at,
            deleted_at: removido ? at : null,
            deleted_by: removido ? UID : null,
          }),
        );
      }

      // Ordena como o banco faria (updated_at desc) antes de fatiar em páginas.
      linhas.sort(
        (a, b) => new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime(),
      );

      const pageSize = 1 + Math.floor(rand() * 8);
      const paginas: CurationFeedDay[][] = [];
      for (let i = 0; i < linhas.length; i += pageSize) {
        paginas.push(buildCurationFeed(linhas.slice(i, i + pageSize), UID, NOW));
      }

      const paginado = mergeCurationFeeds(paginas);
      const inteiro = buildCurationFeed(linhas, UID, NOW);

      // 6. Equivalência com a construção monolítica.
      expect(chaves(paginado)).toEqual(chaves(inteiro));

      // 4. Sem duplicatas.
      const ks = chaves(paginado);
      expect(new Set(ks).size).toBe(ks.length);

      // 3. Monotonicidade decrescente global.
      const ts = carimbos(paginado);
      for (let i = 1; i < ts.length; i += 1) {
        expect(ts[i]).toBeLessThanOrEqual(ts[i - 1]);
      }

      // 5. Nenhum dia vazio.
      expect(paginado.every((d) => d.entries.length > 0)).toBe(true);

      // 1./2. Cursor coerente com a última linha de cada página cheia.
      for (let i = 0; i + pageSize <= linhas.length; i += pageSize) {
        const fatia = linhas.slice(i, i + pageSize);
        expect(resolveNextCursor(fatia, pageSize)).toBe(fatia[fatia.length - 1].updated_at);
      }
    }
  });
});
