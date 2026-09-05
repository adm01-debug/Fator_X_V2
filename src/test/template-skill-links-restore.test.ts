/**
 * Simulação da restauração em lote de vínculos template ↔ skill.
 *
 * Cobre a sanitização de ids, o no-op sem I/O, a atomicidade do UPDATE único
 * e as guardas que impedem filtros vazios de "suceder" silenciosamente.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface UpdateCall {
  payload: Record<string, unknown>;
  templateId?: string;
  skillIds?: string[];
}

const calls: UpdateCall[] = [];
let failNext = false;

vi.mock('@/integrations/supabase/externalClient', () => ({
  supabaseExternal: {
    from: () => ({
      update: (payload: Record<string, unknown>) => {
        const call: UpdateCall = { payload };
        calls.push(call);
        const chain = {
          eq: (_col: string, val: string) => {
            call.templateId = val;
            return chain;
          },
          in: (_col: string, vals: string[]) => {
            call.skillIds = vals;
            return chain;
          },
          is: () => Promise.resolve({ error: null }),
          not: () => Promise.resolve({ error: failNext ? { message: 'permission denied' } : null }),
        };
        return chain;
      },
    }),
  },
}));

const {
  bulkRestoreTemplateSkillLinks,
  restoreTemplateSkillLink,
  removeTemplateSkillLink,
  sanitizeSkillIds,
} = await import('@/services/templateSkillLinkService');

describe('sanitizeSkillIds', () => {
  it('remove vazios, espaços e duplicatas preservando a ordem', () => {
    expect(sanitizeSkillIds([' a ', 'b', 'a', '', '   ', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('tolera valores não-string sem quebrar', () => {
    const sujo = ['a', null, undefined, 42] as unknown as string[];
    expect(sanitizeSkillIds(sujo)).toEqual(['a']);
  });

  it('devolve lista vazia para entrada vazia', () => {
    expect(sanitizeSkillIds([])).toEqual([]);
  });
});

describe('bulkRestoreTemplateSkillLinks', () => {
  beforeEach(() => {
    calls.length = 0;
    failNext = false;
  });

  it('faz um único UPDATE com IN para N ids', async () => {
    const n = await bulkRestoreTemplateSkillLinks('tpl', ['s1', 's2', 's3']);
    expect(n).toBe(3);
    expect(calls).toHaveLength(1);
    expect(calls[0].skillIds).toEqual(['s1', 's2', 's3']);
    expect(calls[0].payload).toEqual({ deleted_at: null, deleted_by: null });
  });

  it('é no-op sem I/O quando não há ids válidos', async () => {
    expect(await bulkRestoreTemplateSkillLinks('tpl', [])).toBe(0);
    expect(await bulkRestoreTemplateSkillLinks('tpl', ['', '  '])).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('deduplica ids antes de enviar', async () => {
    const n = await bulkRestoreTemplateSkillLinks('tpl', ['s1', 's1', ' s1 ']);
    expect(n).toBe(1);
    expect(calls[0].skillIds).toEqual(['s1']);
  });

  it('rejeita templateId vazio sem tocar no banco', async () => {
    await expect(bulkRestoreTemplateSkillLinks('  ', ['s1'])).rejects.toThrow(
      'templateId é obrigatório',
    );
    expect(calls).toHaveLength(0);
  });

  it('propaga erro do banco', async () => {
    failNext = true;
    await expect(bulkRestoreTemplateSkillLinks('tpl', ['s1'])).rejects.toThrow('permission denied');
  });

  it('restoreTemplateSkillLink delega ao lote', async () => {
    await restoreTemplateSkillLink('tpl', 's9');
    expect(calls).toHaveLength(1);
    expect(calls[0].skillIds).toEqual(['s9']);
  });
});

describe('removeTemplateSkillLink — guardas', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('rejeita ids vazios em vez de aplicar filtro que não casa com nada', async () => {
    await expect(removeTemplateSkillLink('', 's1')).rejects.toThrow('obrigatórios');
    await expect(removeTemplateSkillLink('tpl', '  ')).rejects.toThrow('obrigatórios');
    expect(calls).toHaveLength(0);
  });

  it('marca deleted_at com timestamp ISO quando os ids são válidos', async () => {
    await removeTemplateSkillLink('tpl', 's1');
    expect(calls).toHaveLength(1);
    expect(typeof calls[0].payload.deleted_at).toBe('string');
    expect(Number.isNaN(Date.parse(String(calls[0].payload.deleted_at)))).toBe(false);
  });
});
