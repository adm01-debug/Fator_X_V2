/**
 * Cenários de simulação para a restauração em massa de remoções do feed.
 *
 * Foco: determinismo do plano (função pura) e tolerância a falha parcial —
 * RLS pode negar um template específico sem que isso invalide os demais.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  groupRemovalsByTemplate,
  bulkRestoreAllRemovals,
  shouldConfirmBulkRestore,
  BULK_RESTORE_CONFIRM_THRESHOLD,
  type CurationFeedDay,
} from '@/services/templateSkillLinkService';

const updateMock = vi.fn();

vi.mock('@/integrations/supabase/externalClient', () => ({
  supabaseExternal: {
    from: () => ({
      update: (...args: unknown[]) => updateMock(...args),
    }),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

/** Encadeamento .eq().in().not() que resolve no erro informado (ou sucesso). */
function chain(error: { message: string } | null) {
  const terminal = Promise.resolve({ error });
  return {
    eq: () => ({
      in: () => ({
        not: () => terminal,
      }),
    }),
  };
}

function entry(
  templateId: string,
  skillId: string,
  kind: 'linked' | 'unlinked' = 'unlinked',
) {
  return {
    kind,
    templateId,
    templateName: templateId,
    skillId,
    skillName: skillId,
    reason: 'teste',
    actorId: null,
    actorLabel: null,
    at: null,
    timeLabel: null,
  };
}

function day(entries: ReturnType<typeof entry>[]): CurationFeedDay {
  return { dayKey: '2026-07-28', dayLabel: 'Hoje', entries };
}

beforeEach(() => {
  updateMock.mockReset();
});

describe('groupRemovalsByTemplate', () => {
  it('ignora vínculos ativos e agrupa apenas remoções', () => {
    const feed = [day([entry('t1', 's1'), entry('t1', 's2', 'linked'), entry('t2', 's3')])];
    expect(groupRemovalsByTemplate(feed)).toEqual([
      { templateId: 't1', skillIds: ['s1'] },
      { templateId: 't2', skillIds: ['s3'] },
    ]);
  });

  it('deduplica a mesma skill repetida em dias diferentes', () => {
    const feed = [day([entry('t1', 's1')]), day([entry('t1', 's1'), entry('t1', 's2')])];
    expect(groupRemovalsByTemplate(feed)).toEqual([
      { templateId: 't1', skillIds: ['s1', 's2'] },
    ]);
  });

  it('descarta ids vazios ou só com espaços', () => {
    const feed = [day([entry('  ', 's1'), entry('t1', '   '), entry('t1', 's2')])];
    expect(groupRemovalsByTemplate(feed)).toEqual([{ templateId: 't1', skillIds: ['s2'] }]);
  });

  it('é determinístico entre execuções', () => {
    const feed = [day([entry('t2', 's9'), entry('t1', 's1')])];
    expect(groupRemovalsByTemplate(feed)).toEqual(groupRemovalsByTemplate(feed));
  });

  it('devolve lista vazia para feed vazio', () => {
    expect(groupRemovalsByTemplate([])).toEqual([]);
  });
});

describe('bulkRestoreAllRemovals', () => {
  it('emite um UPDATE por template e soma os restaurados', async () => {
    updateMock.mockImplementation(() => chain(null));
    const feed = [day([entry('t1', 's1'), entry('t1', 's2'), entry('t2', 's3')])];

    const resultado = await bulkRestoreAllRemovals(feed);

    expect(updateMock).toHaveBeenCalledTimes(2);
    expect(updateMock).toHaveBeenCalledWith({ deleted_at: null, deleted_by: null });
    expect(resultado).toEqual({ restored: 3, failedTemplates: [] });
  });

  it('não dispara I/O quando não há remoções visíveis', async () => {
    const resultado = await bulkRestoreAllRemovals([day([entry('t1', 's1', 'linked')])]);
    expect(updateMock).not.toHaveBeenCalled();
    expect(resultado).toEqual({ restored: 0, failedTemplates: [] });
  });

  it('continua após falha de um template e reporta a falha', async () => {
    let call = 0;
    updateMock.mockImplementation(() => {
      call += 1;
      return chain(call === 1 ? { message: 'permission denied' } : null);
    });

    const resultado = await bulkRestoreAllRemovals([
      day([entry('t1', 's1'), entry('t2', 's2')]),
    ]);

    expect(resultado).toEqual({ restored: 1, failedTemplates: ['t1'] });
  });
});

describe('shouldConfirmBulkRestore', () => {
  it('não confirma lotes pequenos', () => {
    expect(shouldConfirmBulkRestore(1)).toBe(false);
    expect(shouldConfirmBulkRestore(BULK_RESTORE_CONFIRM_THRESHOLD - 1)).toBe(false);
  });

  it('confirma a partir do limiar', () => {
    expect(shouldConfirmBulkRestore(BULK_RESTORE_CONFIRM_THRESHOLD)).toBe(true);
    expect(shouldConfirmBulkRestore(999)).toBe(true);
  });

  it('trata zero, negativos e NaN como "sem confirmação"', () => {
    expect(shouldConfirmBulkRestore(0)).toBe(false);
    expect(shouldConfirmBulkRestore(-3)).toBe(false);
    expect(shouldConfirmBulkRestore(Number.NaN)).toBe(false);
  });

  it('aceita limiar customizado', () => {
    expect(shouldConfirmBulkRestore(2, 2)).toBe(true);
    expect(shouldConfirmBulkRestore(2, 3)).toBe(false);
  });
});
