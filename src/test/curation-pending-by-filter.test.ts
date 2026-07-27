/**
 * Simulação do contador de novidades por recorte ativo.
 *
 * Invariantes verificadas:
 *  1. `all` é sempre a união exata de `linked` e `unlinked`;
 *  2. Identidade preservada em dois níveis quando nada muda;
 *  3. Trocar de aba nunca perde contagem de outra aba;
 *  4. Limpar um recorte não afeta os demais;
 *  5. Nenhum recorte ultrapassa o teto.
 */
import { describe, expect, it } from 'vitest';
import {
  applyCurationPendingEventByFilter,
  clearPendingForFilter,
  formatPendingBadge,
  shouldRefreshCurationFeed,
  CURATION_FILTERS,
  CURATION_PENDING_CAP,
  EMPTY_PENDING_BY_FILTER,
  type CurationPendingByFilter,
  type CurationRealtimeEvent,
} from '@/hooks/useCurationRealtime';

function evt(
  over: Partial<NonNullable<CurationRealtimeEvent['new']>> = {},
  tipo: CurationRealtimeEvent['eventType'] = 'INSERT',
): CurationRealtimeEvent {
  return {
    eventType: tipo,
    new: { origin: 'manual', deleted_at: null, template_id: 't1', skill_id: 's1', ...over },
    old: null,
  };
}

describe('applyCurationPendingEventByFilter — identidade preservada', () => {
  it('devolve o MESMO objeto quando o evento é irrelevante', () => {
    const estado = EMPTY_PENDING_BY_FILTER;
    expect(applyCurationPendingEventByFilter(estado, evt({ origin: 'auto' }))).toBe(estado);
  });

  it('devolve o MESMO objeto em evento repetido (dedup por dupla)', () => {
    const primeiro = applyCurationPendingEventByFilter(EMPTY_PENDING_BY_FILTER, evt());
    expect(applyCurationPendingEventByFilter(primeiro, evt())).toBe(primeiro);
  });

  it('preserva o Set dos recortes que não mudaram', () => {
    const estado = applyCurationPendingEventByFilter(EMPTY_PENDING_BY_FILTER, evt());
    // Um vínculo ativo não toca "unlinked".
    const depois = applyCurationPendingEventByFilter(estado, evt({ skill_id: 's2' }));
    expect(depois.unlinked).toBe(estado.unlinked);
    expect(depois.all).not.toBe(estado.all);
  });

  it('nunca muta o estado recebido', () => {
    const estado = applyCurationPendingEventByFilter(EMPTY_PENDING_BY_FILTER, evt());
    const antes = estado.all.size;
    applyCurationPendingEventByFilter(estado, evt({ skill_id: 's9' }));
    expect(estado.all.size).toBe(antes);
  });
});

describe('applyCurationPendingEventByFilter — separação por recorte', () => {
  it('vínculo ativo conta em "all" e "linked", não em "unlinked"', () => {
    const e = applyCurationPendingEventByFilter(EMPTY_PENDING_BY_FILTER, evt());
    expect(e.all.size).toBe(1);
    expect(e.linked.size).toBe(1);
    expect(e.unlinked.size).toBe(0);
  });

  it('remoção conta em "all" e "unlinked", não em "linked"', () => {
    const e = applyCurationPendingEventByFilter(
      EMPTY_PENDING_BY_FILTER,
      evt({ deleted_at: '2026-07-27T10:00:00Z' }),
    );
    expect(e.all.size).toBe(1);
    expect(e.unlinked.size).toBe(1);
    expect(e.linked.size).toBe(0);
  });

  it('cada recorte concorda exatamente com o predicado do feed', () => {
    for (let i = 0; i < 300; i += 1) {
      const e = evt(
        {
          origin: i % 3 === 0 ? 'auto' : 'manual',
          deleted_at: i % 2 === 0 ? null : '2026-07-27T10:00:00Z',
          template_id: i % 7 === 0 ? null : `t${i}`,
          skill_id: `s${i}`,
        },
        i % 2 === 0 ? 'INSERT' : 'UPDATE',
      );
      const estado = applyCurationPendingEventByFilter(EMPTY_PENDING_BY_FILTER, e);
      for (const filtro of CURATION_FILTERS) {
        expect(estado[filtro].size === 1).toBe(shouldRefreshCurationFeed(e, filtro));
      }
    }
  });
});

describe('invariante da união — 500 eventos aleatórios', () => {
  it('"all" é sempre a união exata de "linked" e "unlinked"', () => {
    let estado: CurationPendingByFilter = EMPTY_PENDING_BY_FILTER;
    for (let seed = 1; seed <= 500; seed += 1) {
      estado = applyCurationPendingEventByFilter(
        estado,
        evt({
          origin: seed % 4 === 0 ? 'auto' : 'manual',
          deleted_at: seed % 3 === 0 ? '2026-07-27T10:00:00Z' : null,
          template_id: `t${seed % 13}`,
          skill_id: `s${seed % 17}`,
        }),
      );

      const uniao = new Set([...estado.linked, ...estado.unlinked]);
      // O teto pode truncar recortes de forma independente; a união só é
      // verificável exatamente enquanto nenhum recorte saturou.
      if (
        estado.all.size < CURATION_PENDING_CAP &&
        estado.linked.size < CURATION_PENDING_CAP &&
        estado.unlinked.size < CURATION_PENDING_CAP
      ) {
        expect([...estado.all].sort()).toEqual([...uniao].sort());
      }

      for (const filtro of CURATION_FILTERS) {
        expect(estado[filtro].size).toBeLessThanOrEqual(CURATION_PENDING_CAP);
      }
    }
  });
});

describe('clearPendingForFilter', () => {
  it('zera só o recorte pedido e mantém os outros intactos', () => {
    let estado = applyCurationPendingEventByFilter(EMPTY_PENDING_BY_FILTER, evt());
    estado = applyCurationPendingEventByFilter(
      estado,
      evt({ skill_id: 's2', deleted_at: '2026-07-27T10:00:00Z' }),
    );
    expect(estado.linked.size).toBe(1);
    expect(estado.unlinked.size).toBe(1);

    const limpo = clearPendingForFilter(estado, 'linked');
    expect(limpo.linked.size).toBe(0);
    expect(limpo.unlinked).toBe(estado.unlinked);
    expect(limpo.all).toBe(estado.all);
  });

  it('devolve o MESMO objeto quando o recorte já está vazio', () => {
    expect(clearPendingForFilter(EMPTY_PENDING_BY_FILTER, 'all')).toBe(EMPTY_PENDING_BY_FILTER);
  });

  it('alternar de aba não destrói a contagem da aba anterior', () => {
    let estado = EMPTY_PENDING_BY_FILTER;
    for (let i = 0; i < 20; i += 1) {
      estado = applyCurationPendingEventByFilter(
        estado,
        evt({ skill_id: `s${i}`, deleted_at: i % 2 ? '2026-07-27T10:00:00Z' : null }),
      );
    }
    const antesUnlinked = estado.unlinked.size;
    const depois = clearPendingForFilter(estado, 'linked');
    expect(depois.unlinked.size).toBe(antesUnlinked);
    expect(antesUnlinked).toBeGreaterThan(0);
  });
});

describe('formatPendingBadge', () => {
  it('oculta o badge quando não há nada pendente', () => {
    expect(formatPendingBadge(0)).toBeNull();
    expect(formatPendingBadge(-1)).toBeNull();
    expect(formatPendingBadge(Number.NaN)).toBeNull();
  });

  it('mostra o número puro abaixo do teto', () => {
    expect(formatPendingBadge(1)).toBe('1');
    expect(formatPendingBadge(42)).toBe('42');
  });

  it('satura no teto', () => {
    expect(formatPendingBadge(CURATION_PENDING_CAP)).toBe('99+');
    expect(formatPendingBadge(10_000)).toBe('99+');
  });
});
