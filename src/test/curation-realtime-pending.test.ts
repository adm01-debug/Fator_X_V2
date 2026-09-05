import { describe, it, expect } from 'vitest';
import {
  applyCurationPendingEvent,
  formatPendingLabel,
  shouldRefreshCurationFeed,
  CURATION_PENDING_CAP,
  type CurationRealtimeEvent,
} from '@/hooks/useCurationRealtime';
import type { CurationFeedFilter } from '@/services/templateSkillLinkService';

function evt(
  over: Partial<CurationRealtimeEvent['new']> = {},
  tipo: CurationRealtimeEvent['eventType'] = 'INSERT',
): CurationRealtimeEvent {
  return {
    eventType: tipo,
    new: { origin: 'manual', deleted_at: null, template_id: 't1', skill_id: 's1', ...over },
    old: null,
  };
}

const FILTROS: CurationFeedFilter[] = ['all', 'linked', 'unlinked'];
const VAZIO: ReadonlySet<string> = new Set();

describe('applyCurationPendingEvent — identidade preservada', () => {
  it('devolve o MESMO Set quando o evento é irrelevante (origin auto)', () => {
    const atual = new Set(['t0::s0']);
    expect(applyCurationPendingEvent(atual, evt({ origin: 'auto' }), 'all')).toBe(atual);
  });

  it('devolve o MESMO Set quando a linha não tem identidade', () => {
    const atual = new Set(['t0::s0']);
    expect(applyCurationPendingEvent(atual, evt({ skill_id: null }), 'all')).toBe(atual);
  });

  it('devolve o MESMO Set quando a dupla já está pendente (dedup)', () => {
    const atual = new Set(['t1::s1']);
    expect(applyCurationPendingEvent(atual, evt(), 'all')).toBe(atual);
  });

  it('devolve um novo Set apenas quando há novidade real', () => {
    const proximo = applyCurationPendingEvent(VAZIO, evt(), 'all');
    expect(proximo).not.toBe(VAZIO);
    expect(proximo.size).toBe(1);
  });

  it('nunca muta o Set recebido', () => {
    const atual = new Set(['t0::s0']);
    applyCurationPendingEvent(atual, evt(), 'all');
    expect([...atual]).toEqual(['t0::s0']);
  });
});

describe('applyCurationPendingEvent — coerência com o filtro ativo', () => {
  it('remoção não conta no filtro de vínculos', () => {
    const e = evt({ deleted_at: '2026-07-27T10:00:00Z' });
    expect(applyCurationPendingEvent(VAZIO, e, 'linked').size).toBe(0);
    expect(applyCurationPendingEvent(VAZIO, e, 'unlinked').size).toBe(1);
  });

  it('vínculo ativo não conta no filtro de remoções', () => {
    const e = evt({ deleted_at: null });
    expect(applyCurationPendingEvent(VAZIO, e, 'unlinked').size).toBe(0);
    expect(applyCurationPendingEvent(VAZIO, e, 'linked').size).toBe(1);
  });

  it.each(FILTROS)('respeita exatamente o predicado do feed (%s)', (filtro) => {
    for (let i = 0; i < 60; i++) {
      const e = evt(
        {
          origin: i % 3 === 0 ? 'auto' : 'manual',
          deleted_at: i % 2 === 0 ? null : '2026-07-27T10:00:00Z',
          template_id: i % 5 === 0 ? null : `t${i}`,
          skill_id: `s${i}`,
        },
        i % 2 === 0 ? 'INSERT' : 'UPDATE',
      );
      const contou = applyCurationPendingEvent(VAZIO, e, filtro).size === 1;
      expect(contou).toBe(shouldRefreshCurationFeed(e, filtro));
    }
  });
});

describe('applyCurationPendingEvent — saturação e monotonicidade', () => {
  it('nunca ultrapassa o teto mesmo sob rajada', () => {
    let estado: ReadonlySet<string> = new Set();
    for (let i = 0; i < 500; i++) {
      estado = applyCurationPendingEvent(estado, evt({ skill_id: `s${i}` }), 'all');
    }
    expect(estado.size).toBe(CURATION_PENDING_CAP);
  });

  it('a contagem é monotônica não-decrescente em 500 eventos aleatórios', () => {
    let estado: ReadonlySet<string> = new Set();
    let anterior = 0;
    for (let seed = 1; seed <= 500; seed++) {
      estado = applyCurationPendingEvent(
        estado,
        evt(
          {
            origin: seed % 4 === 0 ? 'auto' : 'manual',
            deleted_at: seed % 3 === 0 ? '2026-07-27T10:00:00Z' : null,
            template_id: `t${seed % 17}`,
            skill_id: `s${seed % 23}`,
          },
          'UPDATE',
        ),
        'all',
      );
      expect(estado.size).toBeGreaterThanOrEqual(anterior);
      expect(estado.size).toBeLessThanOrEqual(CURATION_PENDING_CAP);
      anterior = estado.size;
    }
  });

  it('a contagem equivale ao número de duplas distintas relevantes', () => {
    let estado: ReadonlySet<string> = new Set();
    const esperadas = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      const t = `t${seed % 7}`;
      const s = `s${seed % 11}`;
      const manual = seed % 5 !== 0;
      const e = evt({ origin: manual ? 'manual' : 'auto', template_id: t, skill_id: s });
      estado = applyCurationPendingEvent(estado, e, 'all');
      if (manual) esperadas.add(`${t}::${s}`);
    }
    expect(estado.size).toBe(Math.min(esperadas.size, CURATION_PENDING_CAP));
  });

  it('usa o lado `old` quando o evento é um DELETE físico', () => {
    const e: CurationRealtimeEvent = {
      eventType: 'DELETE',
      new: null,
      old: { origin: 'manual', deleted_at: null, template_id: 't9', skill_id: 's9' },
    };
    expect([...applyCurationPendingEvent(VAZIO, e, 'all')]).toEqual(['t9::s9']);
  });
});

describe('formatPendingLabel', () => {
  it('oculta o aviso quando não há nada pendente', () => {
    expect(formatPendingLabel(0)).toBeNull();
    expect(formatPendingLabel(-3)).toBeNull();
    expect(formatPendingLabel(Number.NaN)).toBeNull();
  });

  it('flexiona o singular corretamente', () => {
    expect(formatPendingLabel(1)).toBe('1 novidade');
    expect(formatPendingLabel(2)).toBe('2 novidades');
  });

  it('satura o rótulo no teto', () => {
    expect(formatPendingLabel(CURATION_PENDING_CAP)).toBe('99+ novidades');
    expect(formatPendingLabel(5000)).toBe('99+ novidades');
  });
});
