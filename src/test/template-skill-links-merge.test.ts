/**
 * Simulação exaustiva da mesclagem de vínculos template ↔ skill.
 *
 * Cobre curadoria manual, deduplicação, limites inválidos e fallback,
 * além de centenas de cenários aleatórios determinísticos (seed fixa).
 */
import { describe, it, expect } from 'vitest';
import {
  mergeDisplayLinks,
  formatCurationTrail,
  MAX_LINKS_PER_TEMPLATE,
  type DisplayTemplateSkillLink,
} from '@/services/templateSkillLinkService';

function link(
  skillId: string,
  origin: 'auto' | 'manual' = 'auto',
  isStrongMatch = false,
): DisplayTemplateSkillLink {
  return { skillId, skillName: `Skill ${skillId}`, reason: 'r', isStrongMatch, origin };
}

/** PRNG determinístico (mulberry32) — cenários reproduzíveis. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('mergeDisplayLinks — cenários determinísticos', () => {
  it('usa o fallback apenas quando não há persistência', () => {
    const fallback = [link('a'), link('b')];
    expect(mergeDisplayLinks([], fallback)).toHaveLength(2);
    expect(mergeDisplayLinks([link('z')], fallback).map((l) => l.skillId)).toEqual(['z']);
  });

  it('coloca curadoria manual no topo', () => {
    const out = mergeDisplayLinks([link('a', 'auto', true), link('m', 'manual')], []);
    expect(out[0].skillId).toBe('m');
  });

  it('nunca descarta vínculos manuais mesmo acima do limite', () => {
    const manuais = Array.from({ length: 9 }, (_, i) => link(`m${i}`, 'manual'));
    const out = mergeDisplayLinks([...manuais, link('a')], [], 3);
    expect(out.filter((l) => l.origin === 'manual')).toHaveLength(9);
    expect(out.filter((l) => l.origin === 'auto')).toHaveLength(0);
  });

  it('deduplica por skillId preservando a primeira ocorrência', () => {
    const out = mergeDisplayLinks([link('x', 'manual'), link('x', 'auto', true)], []);
    expect(out).toHaveLength(1);
    expect(out[0].origin).toBe('manual');
  });

  it('prioriza match forte entre os automáticos', () => {
    const out = mergeDisplayLinks([link('a'), link('b', 'auto', true), link('c')], [], 2);
    expect(out[0].skillId).toBe('b');
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'limite inválido (%s) cai no padrão sem quebrar',
    (limit) => {
      const links = Array.from({ length: 20 }, (_, i) => link(`s${i}`));
      const out = mergeDisplayLinks(links, [], limit as number);
      expect(out).toHaveLength(MAX_LINKS_PER_TEMPLATE);
    },
  );

  it('ignora entradas sem skillId', () => {
    const out = mergeDisplayLinks([link(''), link('ok')], []);
    expect(out.map((l) => l.skillId)).toEqual(['ok']);
  });

  it('lista vazia em ambas as fontes retorna vazio', () => {
    expect(mergeDisplayLinks([], [])).toEqual([]);
  });
});

describe('mergeDisplayLinks — 500 cenários aleatórios', () => {
  it('mantém invariantes em toda a amostra', () => {
    const random = rng(20260727);
    for (let scenario = 0; scenario < 500; scenario += 1) {
      const total = Math.floor(random() * 25);
      const persisted: DisplayTemplateSkillLink[] = [];
      for (let i = 0; i < total; i += 1) {
        // IDs repetidos de propósito para forçar colisões.
        const id = `s${Math.floor(random() * 10)}`;
        persisted.push(link(id, random() > 0.75 ? 'manual' : 'auto', random() > 0.5));
      }
      const limit = Math.floor(random() * 8);
      const out = mergeDisplayLinks(persisted, [link('fb')], limit);

      const ids = out.map((l) => l.skillId);
      // 1. Sem duplicatas
      expect(new Set(ids).size).toBe(ids.length);
      // 2. Manuais sempre antes dos automáticos
      const firstAuto = out.findIndex((l) => l.origin === 'auto');
      const lastManual = out.map((l) => l.origin).lastIndexOf('manual');
      if (firstAuto >= 0 && lastManual >= 0) expect(lastManual).toBeLessThan(firstAuto);
      // 3. Fallback só aparece quando não havia persistência
      if (persisted.length > 0) expect(ids).not.toContain('fb');
      // 4. Limite respeitado para os automáticos
      const effective = limit > 0 ? limit : MAX_LINKS_PER_TEMPLATE;
      const manualCount = out.filter((l) => l.origin === 'manual').length;
      expect(out.length - manualCount).toBeLessThanOrEqual(Math.max(0, effective - manualCount));
    }
  });
});

// ---------------------------------------------------------------------------
// Simulação exaustiva da trilha de auditoria (formatCurationTrail)
// ---------------------------------------------------------------------------
describe('formatCurationTrail — simulação de cenários', () => {
  const ME = '11111111-2222-3333-4444-555555555555';
  const OUTRO = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  it('nunca atribui autoria a vínculos automáticos', () => {
    expect(
      formatCurationTrail({ origin: 'auto', curatedBy: ME, curatedAt: '2026-07-01T10:00:00Z' }, ME),
    ).toBeNull();
  });

  it('identifica o próprio usuário como "você"', () => {
    const out = formatCurationTrail(
      { origin: 'manual', curatedBy: ME, curatedAt: '2026-07-01T10:00:00Z' },
      ME,
    );
    expect(out).toContain('você');
    expect(out).toContain('01/07/2026');
  });

  it('mostra um identificador curto para outro admin', () => {
    const out = formatCurationTrail(
      { origin: 'manual', curatedBy: OUTRO, curatedAt: '2026-07-01T10:00:00Z' },
      ME,
    );
    expect(out).toContain('admin aaaaaaaa');
    expect(out).not.toContain('você');
  });

  it('degrada com elegância sem data ou sem autor', () => {
    expect(formatCurationTrail({ origin: 'manual', curatedBy: ME, curatedAt: null }, ME)).toBe(
      'Curado por você',
    );
    expect(
      formatCurationTrail(
        { origin: 'manual', curatedBy: null, curatedAt: '2026-07-01T10:00:00Z' },
        ME,
      ),
    ).toBe('Curado em 01/07/2026');
    expect(
      formatCurationTrail({ origin: 'manual', curatedBy: null, curatedAt: null }, ME),
    ).toBeNull();
  });

  it('ignora datas inválidas sem lançar exceção', () => {
    expect(
      formatCurationTrail({ origin: 'manual', curatedBy: ME, curatedAt: 'nao-e-data' }, ME),
    ).toBe('Curado por você');
  });

  it('mantém invariantes em 500 cenários aleatórios determinísticos', () => {
    let seed = 20260727;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    for (let i = 0; i < 500; i += 1) {
      const origin = rand() > 0.5 ? 'manual' : 'auto';
      const curatedBy = rand() > 0.3 ? (rand() > 0.5 ? ME : OUTRO) : null;
      const curatedAt =
        rand() > 0.3
          ? new Date(
              Date.UTC(2026, Math.floor(rand() * 12), 1 + Math.floor(rand() * 28)),
            ).toISOString()
          : null;

      const out = formatCurationTrail({ origin, curatedBy, curatedAt }, ME);

      if (origin === 'auto') {
        expect(out).toBeNull();
        continue;
      }
      if (!curatedBy && !curatedAt) {
        expect(out).toBeNull();
        continue;
      }
      expect(out).toBeTruthy();
      expect(out).toContain('Curado');
      // Jamais vazamos o UUID completo de outro administrador.
      if (curatedBy === OUTRO) expect(out).not.toContain(OUTRO);
    }
  });
});
