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
  filterRemovalPlan,
  buildTemplateNameMap,
  classifyRestoreFailure,
  isRetriableFailure,
  retryFailedRestores,
  shouldConfirmBulkRestore,
  restoreBackoffDelay,
  buildRestoreFailuresCsv,
  buildRestoreFailuresFilename,
  parseStoredRestoreFailures,
  pruneExpiredRestoreFailures,
  dedupeRestoreFailures,
  dismissRestoreFailure,
  summarizeRestoreFailures,
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

function entry(templateId: string, skillId: string, kind: 'linked' | 'unlinked' = 'unlinked') {
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
    expect(groupRemovalsByTemplate(feed)).toEqual([{ templateId: 't1', skillIds: ['s1', 's2'] }]);
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
    expect(resultado).toEqual({ restored: 3, failedTemplates: [], failures: [] });
  });

  it('não dispara I/O quando não há remoções visíveis', async () => {
    const resultado = await bulkRestoreAllRemovals([day([entry('t1', 's1', 'linked')])]);
    expect(updateMock).not.toHaveBeenCalled();
    expect(resultado).toEqual({ restored: 0, failedTemplates: [], failures: [] });
  });

  it('continua após falha de um template e reporta a falha', async () => {
    let call = 0;
    updateMock.mockImplementation(() => {
      call += 1;
      return chain(call === 1 ? { message: 'permission denied' } : null);
    });

    const resultado = await bulkRestoreAllRemovals([day([entry('t1', 's1'), entry('t2', 's2')])]);

    expect(resultado.restored).toBe(1);
    expect(resultado.failedTemplates).toEqual(['t1']);
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

describe('filterRemovalPlan', () => {
  it('mantém apenas os templates informados', () => {
    const feed = [day([entry('t1', 's1'), entry('t2', 's2'), entry('t3', 's3')])];
    expect(filterRemovalPlan(feed, ['t1', 't3'])).toEqual([
      { templateId: 't1', skillIds: ['s1'] },
      { templateId: 't3', skillIds: ['s3'] },
    ]);
  });

  it('normaliza espaços e ignora ids vazios', () => {
    const feed = [day([entry('t1', 's1')])];
    expect(filterRemovalPlan(feed, ['  t1  ', '', '   '])).toEqual([
      { templateId: 't1', skillIds: ['s1'] },
    ]);
  });

  it('devolve vazio quando não há alvos', () => {
    const feed = [day([entry('t1', 's1')])];
    expect(filterRemovalPlan(feed, [])).toEqual([]);
  });

  it('ignora templates que não estão no feed', () => {
    const feed = [day([entry('t1', 's1')])];
    expect(filterRemovalPlan(feed, ['inexistente'])).toEqual([]);
  });
});

describe('retryFailedRestores', () => {
  it('reprocessa somente os templates que falharam', async () => {
    updateMock.mockImplementation(() => chain(null));
    const feed = [day([entry('t1', 's1'), entry('t2', 's2')])];

    const resultado = await retryFailedRestores(feed, ['t2']);

    expect(resultado).toEqual({ restored: 1, failedTemplates: [], failures: [] });
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it('não dispara I/O quando a lista de falhas está vazia', async () => {
    const feed = [day([entry('t1', 's1')])];
    const resultado = await retryFailedRestores(feed, []);

    expect(resultado).toEqual({ restored: 0, failedTemplates: [], failures: [] });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('reporta a falha novamente quando o retry também é negado', async () => {
    updateMock.mockImplementation(() => chain({ message: 'RLS negou' }));
    const feed = [day([entry('t1', 's1')])];

    const resultado = await retryFailedRestores(feed, ['t1']);

    expect(resultado.failures).toEqual([
      {
        templateId: 't1',
        templateName: 't1',
        skillCount: 1,
        message: 'RLS negou',
        kind: 'permission',
        failedAt: expect.any(String),
        attempts: 1,
      },
    ]);
  });
});

describe('buildTemplateNameMap', () => {
  it('usa o primeiro nome visto e cai para o id quando vazio', () => {
    const semNome = { ...entry('t2', 's2'), templateName: '  ' };
    const feed = [day([entry('t1', 's1'), semNome])];
    const mapa = buildTemplateNameMap(feed);
    expect(mapa.get('t1')).toBe('t1');
    expect(mapa.get('t2')).toBe('t2');
  });
});

describe('classifyRestoreFailure', () => {
  it.each([
    ['new row violates row-level security policy', 'permission'],
    ['permission denied for table', 'permission'],
    ['JWT expired', 'permission'],
    ['Failed to fetch', 'network'],
    ['request timed out', 'network'],
    ['ECONNRESET', 'network'],
    ['algo estranho aconteceu', 'unknown'],
    ['', 'unknown'],
  ])('classifica %s como %s', (mensagem, esperado) => {
    expect(classifyRestoreFailure(mensagem)).toBe(esperado);
  });

  it('não oferece retry para falha de permissão', () => {
    expect(isRetriableFailure('permission')).toBe(false);
    expect(isRetriableFailure('network')).toBe(true);
    expect(isRetriableFailure('unknown')).toBe(true);
  });
});

describe('restoreBackoffDelay', () => {
  it('cresce exponencialmente e sanitiza tentativa inválida', () => {
    expect(restoreBackoffDelay(1, 200)).toBe(200);
    expect(restoreBackoffDelay(2, 200)).toBe(400);
    expect(restoreBackoffDelay(3, 200)).toBe(800);
    expect(restoreBackoffDelay(0, 200)).toBe(200);
    expect(restoreBackoffDelay(Number.NaN, 200)).toBe(200);
  });
});

describe('summarizeRestoreFailures', () => {
  it('agrega vínculos pendentes por natureza', () => {
    const resumo = summarizeRestoreFailures([
      {
        templateId: 't1',
        templateName: 't1',
        skillCount: 3,
        message: 'rls',
        kind: 'permission',
        failedAt: new Date().toISOString(),
        attempts: 1,
      },
      {
        templateId: 't2',
        templateName: 't2',
        skillCount: 2,
        message: 'fetch',
        kind: 'network',
        failedAt: new Date().toISOString(),
        attempts: 1,
      },
      {
        templateId: 't3',
        templateName: 't3',
        skillCount: 1,
        message: 'x',
        kind: 'network',
        failedAt: new Date().toISOString(),
        attempts: 1,
      },
    ]);
    expect(resumo).toEqual({ permission: 3, network: 3, unknown: 0 });
  });

  it('devolve zeros para lista vazia', () => {
    expect(summarizeRestoreFailures([])).toEqual({ permission: 0, network: 0, unknown: 0 });
  });
});

describe('buildRestoreFailuresCsv', () => {
  it('escapa aspas, vírgulas e quebras de linha nas mensagens', () => {
    const csv = buildRestoreFailuresCsv([
      {
        templateId: 't1',
        templateName: 'Vendas, B2B',
        skillCount: 2,
        message: 'erro "grave"\nlinha 2',
        kind: 'permission',
        failedAt: new Date().toISOString(),
        attempts: 1,
      },
    ]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"Vendas, B2B"');
    expect(csv).toContain('"erro ""grave""\nlinha 2"');
    expect(csv).toContain('"Sem permissão"');
  });

  it('gera apenas cabeçalho quando não há falhas', () => {
    const csv = buildRestoreFailuresCsv([]);
    expect(csv.trim().split('\r\n')).toHaveLength(1);
  });
});

describe('buildRestoreFailuresFilename', () => {
  it('usa a data ISO e cai para hoje em data inválida', () => {
    expect(buildRestoreFailuresFilename(new Date('2026-07-28T10:00:00Z'))).toBe(
      'restauracoes-parciais-2026-07-28.csv',
    );
    expect(buildRestoreFailuresFilename(new Date('inválida'))).toMatch(
      /^restauracoes-parciais-\d{4}-\d{2}-\d{2}\.csv$/,
    );
  });
});

describe('parseStoredRestoreFailures', () => {
  it('rejeita JSON inválido, não-array e itens sem templateId', () => {
    expect(parseStoredRestoreFailures(null)).toEqual([]);
    expect(parseStoredRestoreFailures('{{')).toEqual([]);
    expect(parseStoredRestoreFailures('{"a":1}')).toEqual([]);
    expect(parseStoredRestoreFailures('[{"templateId":"  "},null,3]')).toEqual([]);
  });

  it('normaliza campos ausentes ou corrompidos', () => {
    const parsed = parseStoredRestoreFailures(
      JSON.stringify([{ templateId: ' t1 ', skillCount: '4', kind: 'hackeado' }]),
    );
    expect(parsed).toEqual([
      {
        templateId: 't1',
        templateName: 't1',
        skillCount: 4,
        message: '',
        kind: 'unknown',
        failedAt: expect.any(String),
        attempts: 1,
      },
    ]);
  });

  it('faz round-trip com falhas válidas', () => {
    const original = [
      {
        templateId: 't1',
        templateName: 'Vendas',
        skillCount: 2,
        message: 'rls',
        kind: 'permission' as const,
        failedAt: new Date('2026-07-28T10:00:00.000Z').toISOString(),
        attempts: 1,
      },
    ];
    expect(parseStoredRestoreFailures(JSON.stringify(original))).toEqual(original);
  });
});

describe('pruneExpiredRestoreFailures', () => {
  const base = (failedAt: string) => ({
    templateId: 't1',
    templateName: 'Vendas',
    skillCount: 1,
    message: 'fetch',
    kind: 'network' as const,
    failedAt,
    attempts: 1,
  });

  it('mantém falhas dentro da janela de TTL', () => {
    const agora = Date.parse('2026-07-28T12:00:00.000Z');
    const recente = base('2026-07-28T11:00:00.000Z');
    expect(pruneExpiredRestoreFailures([recente], agora)).toEqual([recente]);
  });

  it('descarta falhas mais antigas que o TTL', () => {
    const agora = Date.parse('2026-07-28T12:00:00.000Z');
    expect(pruneExpiredRestoreFailures([base('2026-07-26T12:00:00.000Z')], agora)).toEqual([]);
  });

  it('descarta registros com data inválida', () => {
    expect(pruneExpiredRestoreFailures([base('não-é-data')], Date.now())).toEqual([]);
  });
});

describe('dedupeRestoreFailures', () => {
  const falha = (templateId: string, failedAt: string, skillCount = 1) => ({
    templateId,
    templateName: templateId,
    skillCount,
    message: 'fetch',
    kind: 'network' as const,
    failedAt,
    attempts: 1,
  });

  it('mantém apenas a ocorrência mais recente por template', () => {
    const antiga = falha('t1', '2026-07-28T10:00:00.000Z', 5);
    const nova = falha('t1', '2026-07-28T11:00:00.000Z', 2);
    expect(dedupeRestoreFailures([antiga, nova])).toEqual([{ ...nova, attempts: 2 }]);
  });

  it('ordena da falha mais nova para a mais antiga', () => {
    const a = falha('t1', '2026-07-28T09:00:00.000Z');
    const b = falha('t2', '2026-07-28T12:00:00.000Z');
    expect(dedupeRestoreFailures([a, b]).map((f) => f.templateId)).toEqual(['t2', 't1']);
  });

  it('prefere a entrada com data válida quando há lixo', () => {
    const invalida = falha('t1', 'não-é-data');
    const valida = falha('t1', '2026-07-28T09:00:00.000Z');
    expect(dedupeRestoreFailures([invalida, valida])).toEqual([{ ...valida, attempts: 2 }]);
  });

  it('ignora entradas sem templateId', () => {
    expect(dedupeRestoreFailures([falha('', '2026-07-28T09:00:00.000Z')])).toEqual([]);
  });
});

describe('dismissRestoreFailure', () => {
  const falha = (templateId: string) => ({
    templateId,
    templateName: templateId,
    skillCount: 1,
    message: 'fetch',
    kind: 'network' as const,
    failedAt: '2026-07-28T10:00:00.000Z',
    attempts: 1,
  });

  it('remove apenas o template indicado', () => {
    const lista = [falha('t1'), falha('t2')];
    expect(dismissRestoreFailure(lista, 't1').map((f) => f.templateId)).toEqual(['t2']);
  });

  it('tolera espaços no id', () => {
    expect(dismissRestoreFailure([falha('t1')], ' t1 ')).toEqual([]);
  });

  it('devolve a lista intacta para id vazio', () => {
    const lista = [falha('t1')];
    expect(dismissRestoreFailure(lista, '  ')).toEqual(lista);
  });
});
