/**
 * Simulação exaustiva do feed de curadoria recente.
 *
 * Invariantes verificadas:
 *  1. Ordem cronológica decrescente entre dias E dentro de cada dia;
 *  2. Deduplicação por (template, skill) — vence o registro mais recente;
 *  3. Rótulos relativos corretos (Hoje/Ontem/data) sem vazamento de fuso;
 *  4. Nenhum ID de autor é exposto por inteiro (privacidade: só 8 chars);
 *  5. Linhas sem data utilizável nunca entram no feed.
 */
import { describe, expect, it } from 'vitest';
import { buildCurationFeed, type RecentCurationRow } from '@/services/templateSkillLinkService';
import { AGENT_TEMPLATES } from '@/data/agentTemplates';

const NOW = new Date('2026-07-27T15:00:00-03:00');
const UID = '11111111-2222-3333-4444-555555555555';
const OUTRO = '99999999-8888-7777-6666-555555555555';

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

/** PRNG determinístico (mulberry32) — reprodutibilidade dos 500 cenários. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('buildCurationFeed — cenários determinísticos', () => {
  it('rotula o dia atual como "Hoje"', () => {
    const feed = buildCurationFeed([row()], UID, NOW);
    expect(feed[0].dayLabel).toBe('Hoje');
  });

  it('rotula o dia anterior como "Ontem"', () => {
    const feed = buildCurationFeed(
      [row({ updated_at: '2026-07-26T10:00:00-03:00' })],
      UID,
      NOW,
    );
    expect(feed[0].dayLabel).toBe('Ontem');
  });

  it('usa data absoluta para dias mais antigos', () => {
    const feed = buildCurationFeed(
      [row({ updated_at: '2026-07-01T10:00:00-03:00' })],
      UID,
      NOW,
    );
    expect(feed[0].dayLabel).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it('não joga curadoria noturna local para o dia seguinte', () => {
    // 21h em GMT-3 é 00h UTC do dia seguinte — agrupar por UTC quebraria isto.
    const feed = buildCurationFeed(
      [row({ updated_at: '2026-07-27T21:30:00-03:00' })],
      UID,
      NOW,
    );
    expect(feed[0].dayLabel).toBe('Hoje');
  });

  it('deduplica template+skill mantendo o registro mais recente', () => {
    const feed = buildCurationFeed(
      [
        row({ reason: 'antiga', updated_at: '2026-07-20T10:00:00-03:00' }),
        row({ reason: 'nova', updated_at: '2026-07-27T10:00:00-03:00' }),
      ],
      UID,
      NOW,
    );
    const total = feed.flatMap((d) => d.entries);
    expect(total).toHaveLength(1);
    expect(total[0].reason).toBe('nova');
  });

  it('mantém vínculos da mesma skill em templates distintos', () => {
    const feed = buildCurationFeed(
      [row(), row({ template_id: 'onboarding' })],
      UID,
      NOW,
    );
    expect(feed.flatMap((d) => d.entries)).toHaveLength(2);
  });

  it('descarta linhas sem data utilizável', () => {
    const feed = buildCurationFeed(
      [row({ updated_at: null, created_at: null }), row({ updated_at: 'não-é-data', created_at: null, skill_id: 'skill-b' })],
      UID,
      NOW,
    );
    expect(feed).toHaveLength(0);
  });

  it('identifica o usuário atual como "você"', () => {
    const feed = buildCurationFeed([row()], UID, NOW);
    expect(feed[0].entries[0].actorLabel).toBe('você');
  });

  it('abrevia autores terceiros e nunca expõe o UUID completo', () => {
    const feed = buildCurationFeed([row({ updated_by: OUTRO, created_by: OUTRO })], UID, NOW);
    const label = feed[0].entries[0].actorLabel ?? '';
    expect(label).toBe(`admin ${OUTRO.slice(0, 8)}`);
    expect(label).not.toContain(OUTRO);
  });

  it('omite o autor quando não há atribuição', () => {
    const feed = buildCurationFeed([row({ updated_by: null, created_by: null })], UID, NOW);
    expect(feed[0].entries[0].actorLabel).toBeNull();
  });

  it('resolve o nome legível do template da galeria', () => {
    const alvo = AGENT_TEMPLATES[0];
    const feed = buildCurationFeed([row({ template_id: alvo.id })], UID, NOW);
    expect(feed[0].entries[0].templateName).toBe(alvo.name);
  });

  it('faz fallback para o id quando o template é desconhecido', () => {
    const feed = buildCurationFeed([row({ template_id: 'template_fantasma' })], UID, NOW);
    expect(feed[0].entries[0].templateName).toBe('template_fantasma');
  });

  it('faz fallback para o id quando a skill não tem nome', () => {
    const feed = buildCurationFeed([row({ skill: { name: '   ' } })], UID, NOW);
    expect(feed[0].entries[0].skillName).toBe('skill-a');
  });

  it('cai para created_at quando updated_at é nulo', () => {
    const feed = buildCurationFeed(
      [row({ updated_at: null, created_at: '2026-07-26T09:00:00-03:00' })],
      UID,
      NOW,
    );
    expect(feed[0].dayLabel).toBe('Ontem');
  });

  it('retorna feed vazio para entrada vazia', () => {
    expect(buildCurationFeed([], UID, NOW)).toEqual([]);
  });
});

describe('buildCurationFeed — 500 cenários aleatórios', () => {
  it('preserva todas as invariantes sob entrada arbitrária', () => {
    const random = rng(20260727);
    const templateIds = [...AGENT_TEMPLATES.slice(0, 8).map((t) => t.id), 'template_fantasma'];

    for (let cenario = 0; cenario < 500; cenario++) {
      const total = Math.floor(random() * 25);
      const rows: RecentCurationRow[] = [];

      for (let i = 0; i < total; i++) {
        const diasAtras = Math.floor(random() * 10);
        const quebrada = random() < 0.15;
        const d = new Date(NOW.getTime() - diasAtras * 86_400_000 - Math.floor(random() * 8) * 3_600_000);
        rows.push(
          row({
            template_id: templateIds[Math.floor(random() * templateIds.length)],
            skill_id: `skill-${Math.floor(random() * 6)}`,
            updated_at: quebrada ? null : d.toISOString(),
            created_at: quebrada ? null : d.toISOString(),
            updated_by: random() < 0.3 ? null : random() < 0.5 ? UID : OUTRO,
            created_by: null,
          }),
        );
      }

      const feed = buildCurationFeed(rows, UID, NOW);
      const entries = feed.flatMap((d) => d.entries);

      // 1. Ordem cronológica global decrescente
      const tempos = entries.map((e) => new Date(e.at ?? 0).getTime());
      for (let i = 1; i < tempos.length; i++) {
        expect(tempos[i]).toBeLessThanOrEqual(tempos[i - 1]);
      }

      // 2. Deduplicação por (template, skill)
      const chaves = entries.map((e) => `${e.templateId}::${e.skillId}`);
      expect(new Set(chaves).size).toBe(chaves.length);

      // 3. Dias únicos e coerentes com as entradas que contêm
      const dias = feed.map((d) => d.dayKey);
      expect(new Set(dias).size).toBe(dias.length);
      for (const dia of feed) {
        expect(dia.entries.length).toBeGreaterThan(0);
        expect(dia.dayLabel.length).toBeGreaterThan(0);
      }

      // 4. Privacidade: nunca o UUID completo
      for (const e of entries) {
        if (e.actorLabel) expect(e.actorLabel.length).toBeLessThanOrEqual(20);
        expect(e.actorLabel ?? '').not.toContain(OUTRO);
        expect(e.skillName.length).toBeGreaterThan(0);
        expect(e.templateName.length).toBeGreaterThan(0);
        // 5. Toda entrada tem data utilizável
        expect(Number.isNaN(new Date(e.at ?? '').getTime())).toBe(false);
      }
    }
  });
});
