/**
 * Simulação do predicado de realtime do feed de curadoria.
 *
 * Invariantes verificadas:
 *  1. Escrita automática (origin != 'manual') NUNCA invalida o feed;
 *  2. Linha sem identidade (template/skill ausente) nunca invalida;
 *  3. "all" é a união exata de "linked" e "unlinked";
 *  4. Um evento manual identificável sempre dispara em pelo menos um filtro;
 *  5. Payload vazio (sem new e sem old) é inerte — nunca derruba o painel.
 */
import { describe, expect, it } from 'vitest';
import {
  shouldRefreshCurationFeed,
  type CurationRealtimeEvent,
} from '@/hooks/useCurationRealtime';
import type { CurationFeedFilter } from '@/services/templateSkillLinkService';

const FILTROS: CurationFeedFilter[] = ['all', 'linked', 'unlinked'];

function linha(over: Record<string, unknown> = {}) {
  return { origin: 'manual', template_id: 't1', skill_id: 's1', deleted_at: null, ...over };
}

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('shouldRefreshCurationFeed — casos determinísticos', () => {
  it('INSERT manual ativo dispara em "all" e "linked", não em "unlinked"', () => {
    const e: CurationRealtimeEvent = { eventType: 'INSERT', new: linha() };
    expect(shouldRefreshCurationFeed(e, 'all')).toBe(true);
    expect(shouldRefreshCurationFeed(e, 'linked')).toBe(true);
    expect(shouldRefreshCurationFeed(e, 'unlinked')).toBe(false);
  });

  it('soft delete dispara nos dois filtros (sai de um, entra no outro)', () => {
    const e: CurationRealtimeEvent = {
      eventType: 'UPDATE',
      new: linha({ deleted_at: '2026-07-27T10:00:00Z' }),
      old: linha({ deleted_at: null }),
    };
    expect(shouldRefreshCurationFeed(e, 'linked')).toBe(true);
    expect(shouldRefreshCurationFeed(e, 'unlinked')).toBe(true);
  });

  it('escrita automática é ignorada em todos os filtros', () => {
    const e: CurationRealtimeEvent = { eventType: 'INSERT', new: linha({ origin: 'auto' }) };
    for (const f of FILTROS) expect(shouldRefreshCurationFeed(e, f)).toBe(false);
  });

  it('UPDATE que promove auto → manual dispara (o lado novo é manual)', () => {
    const e: CurationRealtimeEvent = {
      eventType: 'UPDATE',
      new: linha({ origin: 'manual' }),
      old: linha({ origin: 'auto' }),
    };
    expect(shouldRefreshCurationFeed(e, 'all')).toBe(true);
  });

  it('DELETE físico só com "old" ainda dispara', () => {
    const e: CurationRealtimeEvent = { eventType: 'DELETE', old: linha() };
    expect(shouldRefreshCurationFeed(e, 'all')).toBe(true);
  });

  it('payload vazio é inerte', () => {
    const e: CurationRealtimeEvent = { eventType: 'DELETE', new: null, old: null };
    for (const f of FILTROS) expect(shouldRefreshCurationFeed(e, f)).toBe(false);
  });

  it('linha sem skill_id não dispara', () => {
    const e: CurationRealtimeEvent = { eventType: 'INSERT', new: linha({ skill_id: null }) };
    for (const f of FILTROS) expect(shouldRefreshCurationFeed(e, f)).toBe(false);
  });

  it('restauração (deleted_at volta a null) dispara nos dois filtros', () => {
    const e: CurationRealtimeEvent = {
      eventType: 'UPDATE',
      new: linha({ deleted_at: null }),
      old: linha({ deleted_at: '2026-07-26T10:00:00Z' }),
    };
    expect(shouldRefreshCurationFeed(e, 'linked')).toBe(true);
    expect(shouldRefreshCurationFeed(e, 'unlinked')).toBe(true);
  });
});

describe('shouldRefreshCurationFeed — 600 cenários aleatórios', () => {
  it('preserva as invariantes sob payload arbitrário', () => {
    for (let cenario = 0; cenario < 600; cenario += 1) {
      const rand = rng(cenario + 4242);

      const lado = () =>
        rand() < 0.15
          ? null
          : linha({
              origin: rand() < 0.5 ? 'manual' : 'auto',
              deleted_at: rand() < 0.4 ? '2026-07-27T10:00:00Z' : null,
              template_id: rand() < 0.9 ? 't1' : null,
              skill_id: rand() < 0.9 ? 's1' : null,
            });

      const evento: CurationRealtimeEvent = {
        eventType: (['INSERT', 'UPDATE', 'DELETE'] as const)[Math.floor(rand() * 3)],
        new: lado(),
        old: lado(),
      };

      const all = shouldRefreshCurationFeed(evento, 'all');
      const linked = shouldRefreshCurationFeed(evento, 'linked');
      const unlinked = shouldRefreshCurationFeed(evento, 'unlinked');

      // 3. "all" é a união dos dois filtros específicos.
      expect(all).toBe(linked || unlinked);

      const lados = [evento.new, evento.old].filter(Boolean) as Array<
        ReturnType<typeof linha>
      >;

      // 1. Nada automático passa.
      if (lados.length > 0 && lados.every((l) => l.origin !== 'manual')) {
        expect(all).toBe(false);
      }

      // 2. Sem identidade, nada passa.
      if (lados.every((l) => !(l.template_id && l.skill_id))) {
        expect(all).toBe(false);
      }

      // 4. Manual + identificável sempre dispara em algum filtro.
      if (
        lados.some((l) => l.origin === 'manual') &&
        lados.some((l) => l.template_id && l.skill_id)
      ) {
        expect(all).toBe(true);
      }

      // 5. Payload vazio é inerte.
      if (lados.length === 0) {
        expect(all || linked || unlinked).toBe(false);
      }
    }
  });
});
