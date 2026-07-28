/**
 * Simulação do rebuild de vínculos automáticos template ↔ skill.
 *
 * Foco no gap corrigido: linhas `origin='auto'` que já estavam soft-deletadas
 * NÃO são atingidas pelo DELETE (que filtra `deleted_at IS NULL`), então o
 * UPSERT precisa zerar `deleted_at`/`deleted_by` explicitamente — caso
 * contrário o vínculo recalculado permaneceria invisível para a UI.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface UpsertRow {
  template_id: string;
  skill_id: string;
  origin: 'auto' | 'manual';
  is_strong_match: boolean;
  deleted_at: null;
  deleted_by: null;
}

const upsertedRows: UpsertRow[] = [];
let deleteFilters: Array<Record<string, unknown>> = [];

vi.mock('@/integrations/supabase/externalClient', () => {
  const registryRows = [
    {
      id: '00000000-0000-4000-9000-000000000001',
      name: 'Prospecção Outbound',
      slug: 'prospeccao-outbound',
      description: 'Pesquisa de leads, cadências de e-mail e qualificação de prospects.',
      version: '1.0.0',
      author: 'Nexus',
      category: 'sales',
      tags: ['vendas', 'crm', 'leads', 'prospecção', 'outbound'],
      install_count: 10,
      rating: 5,
      skill_config: {},
      is_verified: true,
      is_public: true,
      created_at: new Date(0).toISOString(),
      department: 'vendas',
      quality_score: 90,
    },
  ];

  return {
    supabaseExternal: {
      from: (table: string) => {
        if (table === 'skill_registry') {
          return {
            select: () => ({
              eq: () => Promise.resolve({ data: registryRows, error: null }),
            }),
          };
        }
        return {
          delete: () => ({
            eq: (col: string, val: unknown) => ({
              is: (isCol: string, isVal: unknown) => {
                deleteFilters.push({ [col]: val, [isCol]: isVal });
                return Promise.resolve({ error: null });
              },
            }),
          }),
          upsert: (rows: UpsertRow[]) => {
            upsertedRows.push(...rows);
            return Promise.resolve({ error: null });
          },
        };
      },
    },
  };
});

const { rebuildTemplateSkillLinks } = await import('@/services/templateSkillLinkService');

describe('rebuildTemplateSkillLinks', () => {
  beforeEach(() => {
    upsertedRows.length = 0;
    deleteFilters = [];
  });

  it('remove apenas vínculos automáticos ativos, preservando curadoria manual', async () => {
    await rebuildTemplateSkillLinks();
    expect(deleteFilters).toHaveLength(1);
    expect(deleteFilters[0]).toMatchObject({ origin: 'auto', deleted_at: null });
  });

  it('ressuscita vínculos soft-deletados zerando deleted_at/deleted_by', async () => {
    await rebuildTemplateSkillLinks();
    expect(upsertedRows.length).toBeGreaterThan(0);
    for (const row of upsertedRows) {
      expect(row.deleted_at).toBeNull();
      expect(row.deleted_by).toBeNull();
    }
  });

  it('grava somente vínculos com origem automática', async () => {
    await rebuildTemplateSkillLinks();
    expect(upsertedRows.every((r) => r.origin === 'auto')).toBe(true);
  });

  it('reporta métricas coerentes com as linhas gravadas', async () => {
    const result = await rebuildTemplateSkillLinks();
    expect(result.links).toBe(upsertedRows.length);
    expect(result.strongLinks).toBe(upsertedRows.filter((r) => r.is_strong_match).length);
    expect(result.strongLinks).toBeLessThanOrEqual(result.links);
  });

  it('é determinístico entre execuções consecutivas', async () => {
    const a = await rebuildTemplateSkillLinks();
    const first = [...upsertedRows];
    upsertedRows.length = 0;
    const b = await rebuildTemplateSkillLinks();
    expect(b).toEqual(a);
    expect(upsertedRows.map((r) => r.skill_id)).toEqual(first.map((r) => r.skill_id));
  });

  it('nunca repete o par (template_id, skill_id) no mesmo lote', async () => {
    await rebuildTemplateSkillLinks();
    const keys = upsertedRows.map((r) => `${r.template_id}::${r.skill_id}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
