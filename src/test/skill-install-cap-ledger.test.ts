import { describe, it, expect } from 'vitest';
import {
  parseInstallCapRows,
  summarizeInstallCapLedger,
  CAP_SEVERITY_LABEL,
  type RawInstallCapRow,
} from '@/lib/skills/installCapLedger';
import { MAX_PROMPT_SKILLS } from '@/lib/skills/promptSimulation';

function row(
  over: Partial<RawInstallCapRow> & { metadata?: Record<string, unknown> } = {},
): RawInstallCapRow {
  return {
    id: 'e1',
    created_at: '2026-07-01T10:00:00.000Z',
    entity_id: 'agent-1',
    metadata: {
      agent_name: 'Agente Um',
      slots_before: 24,
      slots_after: 27,
      cap: MAX_PROMPT_SKILLS,
      effective_adds: 3,
      redundant: 0,
      additional_dropped: 2,
      total_dropped_after: 2,
      crosses_cap: true,
      severity: 'estourou_o_teto',
      acknowledged: false,
      dropped_names: ['Skill A', 'Skill B'],
      dropped_names_truncated: 0,
      ...(over.metadata ?? {}),
    },
    ...over,
  };
}

describe('parseInstallCapRows — robustez', () => {
  it('descarta linhas sem id', () => {
    expect(parseInstallCapRows([{ id: '', metadata: {} }])).toHaveLength(0);
    expect(parseInstallCapRows([{ metadata: {} }])).toHaveLength(0);
  });

  it('não quebra com metadata nulo, array ou string', () => {
    const parsed = parseInstallCapRows([
      { id: 'a', metadata: null },
      { id: 'b', metadata: [1, 2] },
      { id: 'c', metadata: 'lixo' },
    ]);
    expect(parsed).toHaveLength(3);
    for (const e of parsed) {
      expect(e.agentName).toBe('sem nome');
      expect(e.cap).toBe(MAX_PROMPT_SKILLS);
      expect(e.totalDroppedAfter).toBe(0);
      expect(Number.isFinite(e.slotsAfter)).toBe(true);
    }
  });

  it('normaliza números negativos e NaN para zero', () => {
    const [e] = parseInstallCapRows([
      row({ metadata: { slots_before: -5, effective_adds: 'abc', redundant: NaN } }),
    ]);
    expect(e.slotsBefore).toBe(0);
    expect(e.effectiveAdds).toBe(0);
    expect(e.redundant).toBe(0);
  });

  it('deriva total_dropped_after quando o campo está ausente', () => {
    const meta = { slots_after: 30, cap: 25 } as Record<string, unknown>;
    const [e] = parseInstallCapRows([{ id: 'x', metadata: meta }]);
    expect(e.totalDroppedAfter).toBe(5);
  });

  it('preserva o cap histórico do registro', () => {
    const [e] = parseInstallCapRows([row({ metadata: { cap: 10, slots_after: 12 } })]);
    expect(e.cap).toBe(10);
  });

  it('severidade desconhecida vira dentro_do_teto', () => {
    const [e] = parseInstallCapRows([row({ metadata: { severity: 'catastrofe' } })]);
    expect(e.severity).toBe('dentro_do_teto');
    expect(CAP_SEVERITY_LABEL[e.severity]).toBe('Dentro do teto');
  });

  it('data inválida vira string vazia, nunca Invalid Date', () => {
    const [e] = parseInstallCapRows([row({ created_at: 'não é data' })]);
    expect(e.createdAt).toBe('');
  });

  it('dropped_names filtra entradas não-string e vazias', () => {
    const [e] = parseInstallCapRows([
      row({ metadata: { dropped_names: ['A', '', null, 7, { x: 1 }, '  B  '] } }),
    ]);
    expect(e.droppedNames).toEqual(['A', '7', 'B']);
  });

  it('aceita booleanos serializados como string', () => {
    const [e] = parseInstallCapRows([
      row({ metadata: { acknowledged: 'true', crosses_cap: 'true' } }),
    ]);
    expect(e.acknowledged).toBe(true);
    expect(e.crossesCap).toBe(true);
  });
});

describe('summarizeInstallCapLedger — agregação', () => {
  it('trilha vazia devolve resumo neutro', () => {
    const r = summarizeInstallCapLedger([]);
    expect(r.total).toBe(0);
    expect(r.degradedAgents).toEqual([]);
    expect(r.droppedSkillsNow).toBe(0);
  });

  it('usa a entrada mais recente por agente, sem somar eventos', () => {
    const entries = parseInstallCapRows([
      row({
        id: 'a',
        created_at: '2026-07-01T10:00:00.000Z',
        metadata: { total_dropped_after: 5 },
      }),
      row({
        id: 'b',
        created_at: '2026-07-02T10:00:00.000Z',
        metadata: { total_dropped_after: 1 },
      }),
    ]);
    const r = summarizeInstallCapLedger(entries);
    expect(r.total).toBe(2);
    expect(r.agents).toBe(1);
    expect(r.droppedSkillsNow).toBe(1);
    expect(r.degradedAgents[0].events).toBe(2);
  });

  it('entrada sem data não sobrescreve estado datado', () => {
    const entries = parseInstallCapRows([
      row({
        id: 'a',
        created_at: '2026-07-02T10:00:00.000Z',
        metadata: { total_dropped_after: 3 },
      }),
      row({ id: 'b', created_at: 'inválida', metadata: { total_dropped_after: 99 } }),
    ]);
    expect(summarizeInstallCapLedger(entries).droppedSkillsNow).toBe(3);
  });

  it('agente que voltou ao teto sai da lista de degradados', () => {
    const entries = parseInstallCapRows([
      row({
        id: 'a',
        created_at: '2026-07-01T10:00:00.000Z',
        metadata: { total_dropped_after: 4 },
      }),
      row({
        id: 'b',
        created_at: '2026-07-05T10:00:00.000Z',
        metadata: { total_dropped_after: 0 },
      }),
    ]);
    const r = summarizeInstallCapLedger(entries);
    expect(r.degradedAgents).toHaveLength(0);
    expect(r.droppedSkillsNow).toBe(0);
  });

  it('conta apenas não reconhecidos com descarte real', () => {
    const entries = parseInstallCapRows([
      row({ id: 'a', metadata: { acknowledged: false, total_dropped_after: 2 } }),
      row({
        id: 'b',
        entity_id: 'agent-2',
        metadata: { acknowledged: true, total_dropped_after: 2 },
      }),
      row({
        id: 'c',
        entity_id: 'agent-3',
        metadata: { acknowledged: false, total_dropped_after: 0 },
      }),
    ]);
    expect(summarizeInstallCapLedger(entries).unacknowledged).toBe(1);
  });

  it('ranking de skills descartadas é estável e limitado a 10', () => {
    const entries = parseInstallCapRows(
      Array.from({ length: 15 }, (_, i) =>
        row({
          id: `e${i}`,
          entity_id: `agent-${i}`,
          metadata: { dropped_names: Array.from({ length: i + 1 }, (_, j) => `S${j}`) },
        }),
      ),
    );
    const top = summarizeInstallCapLedger(entries).topDropped;
    expect(top).toHaveLength(10);
    expect(top[0].name).toBe('S0');
    expect(top[0].count).toBe(15);
    for (let i = 1; i < top.length; i += 1) {
      expect(top[i - 1].count).toBeGreaterThanOrEqual(top[i].count);
    }
  });

  it('agrupa por nome quando o agent id está ausente', () => {
    const entries = parseInstallCapRows([
      { id: 'a', entity_id: '', metadata: { agent_name: 'X', total_dropped_after: 1 } },
      { id: 'b', entity_id: '', metadata: { agent_name: 'X', total_dropped_after: 1 } },
    ]);
    expect(summarizeInstallCapLedger(entries).agents).toBe(1);
  });

  it('invariantes em ~600 combinações sintéticas', () => {
    for (let agentes = 1; agentes <= 10; agentes += 1) {
      for (let eventos = 1; eventos <= 6; eventos += 1) {
        for (let drop = 0; drop <= 9; drop += 1) {
          const raw: RawInstallCapRow[] = [];
          for (let a = 0; a < agentes; a += 1) {
            for (let e = 0; e < eventos; e += 1) {
              raw.push(
                row({
                  id: `a${a}-e${e}`,
                  entity_id: `agent-${a}`,
                  created_at: new Date(Date.UTC(2026, 6, 1, e)).toISOString(),
                  metadata: { total_dropped_after: drop, agent_name: `Agente ${a}` },
                }),
              );
            }
          }
          const r = summarizeInstallCapLedger(parseInstallCapRows(raw));
          expect(r.total).toBe(agentes * eventos);
          expect(r.agents).toBe(agentes);
          expect(r.droppedSkillsNow).toBe(drop > 0 ? agentes * drop : 0);
          expect(r.degradedAgents).toHaveLength(drop > 0 ? agentes : 0);
          expect(r.droppedSkillsNow).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});
