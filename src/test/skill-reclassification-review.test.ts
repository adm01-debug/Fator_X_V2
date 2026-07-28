/**
 * Fila de revisão manual de classificações — invariantes do serviço.
 *
 * ## Por que estes testes existem
 *
 * Este serviço fica exatamente entre uma sugestão automática e uma escrita
 * destrutiva no Registry. Três caminhos falham de forma silenciosa:
 *
 *  1. **Mapeamento da linha.** Um `department_to` fora da taxonomia (renomeada
 *     depois da proposta) não pode virar um card aprovável — o botão só
 *     produziria erro. A linha precisa ser descartada, não "consertada".
 *  2. **Classificação do erro.** A UI decide entre "recarregue" e "você não
 *     tem permissão" a partir do SQLSTATE. Ler a mensagem de texto em vez do
 *     código torna a tradução refém de refactor no servidor.
 *  3. **Lote parcial.** Uma duplicata (proposta JÁ na fila) não é falha. Se
 *     for contada como erro, o curador aprende a ignorar o aviso — e passa a
 *     ignorar também os erros reais.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getSharedSupabaseMock } from './utils/supabaseMock';

vi.mock('@/integrations/supabase/externalClient', async () => {
  const m = await import('./utils/supabaseMock');
  return { supabaseExternal: m.getSharedSupabaseMock('reclassReview').client };
});
vi.mock('@/integrations/supabase/client', async () => {
  const m = await import('./utils/supabaseMock');
  return { supabase: m.getSharedSupabaseMock('reclassReview').client };
});
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  MAX_DECISION_REASON,
  ReviewOperationError,
  classifyReviewError,
  decideReclassificationReview,
  fetchReclassificationReviews,
  mapReviewRow,
  submitReclassificationReviews,
  toThreshold,
} from '@/services/skillReclassificationReviewService';
import type { ReclassifyProposal } from '@/lib/skills/departmentReclassification';

const db = getSharedSupabaseMock('reclassReview');

/** Linha bruta válida — os testes partem daqui e degradam campo a campo. */
function linha(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r-1',
    skill_id: 's-1',
    skill_slug: 'gerar-relatorio',
    skill_name: 'Gerar relatório',
    department_from: 'financeiro',
    department_to: 'ti',
    confidence: '0.7200',
    margin: '0.1500',
    runner_up: 'operacoes',
    matched_terms: ['deploy', 'pipeline'],
    source: 'lexico',
    rationale: '',
    status: 'pendente',
    decision_reason: '',
    requested_by: 'u-1',
    reviewed_by: null,
    reviewed_at: null,
    created_at: '2026-07-28T10:00:00Z',
    ...overrides,
  };
}

function proposta(overrides: Partial<ReclassifyProposal> = {}): ReclassifyProposal {
  return {
    skillId: 's-1',
    name: 'Gerar relatório',
    slug: 'gerar-relatorio',
    from: 'financeiro',
    to: 'ti',
    confidence: 0.723456,
    margin: 0.154321,
    runnerUp: 'operacoes',
    matchedTerms: ['deploy'],
    source: 'lexico',
    ...overrides,
  } as ReclassifyProposal;
}

beforeEach(() => {
  db.reset();
  db.setUser({ id: 'u-1' });
});

describe('mapReviewRow — fronteira com o banco', () => {
  it('normaliza numéricos que o PostgREST devolve como string', () => {
    // NUMERIC vira string no JSON. Sem conversão, `confidence * 100` no
    // componente produziria concatenação em vez de porcentagem.
    const r = mapReviewRow(linha());
    expect(r?.confidence).toBeCloseTo(0.72, 4);
    expect(r?.margin).toBeCloseTo(0.15, 4);
    expect(typeof r?.confidence).toBe('number');
  });

  it('descarta a linha quando o departamento proposto saiu da taxonomia', () => {
    expect(mapReviewRow(linha({ department_to: 'departamento-extinto' }))).toBeNull();
  });

  it('trata departamento de origem desconhecido como "sem departamento"', () => {
    // Diferente do destino: origem inválida é histórico, não um destino a
    // aplicar — a revisão continua utilizável.
    const r = mapReviewRow(linha({ department_from: 'extinto' }));
    expect(r).not.toBeNull();
    expect(r?.from).toBeNull();
  });

  it('sobrevive a campos nulos sem lançar', () => {
    const r = mapReviewRow(
      linha({
        skill_name: null,
        skill_slug: null,
        matched_terms: null,
        rationale: null,
        status: null,
        decision_reason: null,
        confidence: null,
        margin: null,
      }),
    );
    expect(r).not.toBeNull();
    expect(r?.matchedTerms).toEqual([]);
    expect(r?.status).toBe('pendente');
    expect(r?.confidence).toBe(0);
    expect(r?.name).toBe('Skill sem nome');
  });

  it('status desconhecido degrada para pendente em vez de virar estado fantasma', () => {
    expect(mapReviewRow(linha({ status: 'sei-la' }))?.status).toBe('pendente');
  });

  it('reconhece a origem IA e preserva a justificativa', () => {
    const r = mapReviewRow(linha({ source: 'ia', rationale: 'Menciona pipeline de deploy.' }));
    expect(r?.source).toBe('ia');
    expect(r?.rationale).toContain('pipeline');
  });
});

describe('classifyReviewError — SQLSTATE acima da mensagem', () => {
  it.each([
    ['23505', 'duplicate'],
    ['40001', 'conflict'],
    ['55000', 'already_decided'],
    ['P0002', 'not_found'],
    ['42501', 'permission'],
  ])('mapeia o código %s para %s', (code, esperado) => {
    expect(classifyReviewError({ code, message: 'texto irrelevante' })).toBe(esperado);
  });

  it('reconhece falha de rede sem código', () => {
    expect(classifyReviewError(new Error('Failed to fetch'))).toBe('network');
  });

  it('degrada para desconhecido em vez de adivinhar', () => {
    expect(classifyReviewError(new Error('algo estranho'))).toBe('unknown');
    expect(classifyReviewError(null)).toBe('unknown');
  });
});

describe('submitReclassificationReviews — enfileiramento tolerante a falhas', () => {
  it('exige sessão: sem usuário não há autoria para a trilha', async () => {
    db.setUser(null);
    await expect(submitReclassificationReviews([proposta()])).rejects.toBeInstanceOf(
      ReviewOperationError,
    );
  });

  it('assina cada proposta com o usuário e nasce pendente', async () => {
    await submitReclassificationReviews([proposta()]);
    const payload = db.calls.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.requested_by).toBe('u-1');
    expect(payload.status).toBe('pendente');
    expect(payload.department_from).toBe('financeiro');
    expect(payload.department_to).toBe('ti');
  });

  it('arredonda numéricos para caber no NUMERIC(6,4) do banco', () => {
    return submitReclassificationReviews([proposta()]).then(() => {
      const payload = db.calls.insert.mock.calls[0][0] as Record<string, number>;
      expect(payload.confidence).toBe(0.7235);
      expect(payload.margin).toBe(0.1543);
    });
  });

  it('nunca enfileira um no-op, mesmo se a proposta vier corrompida', async () => {
    const r = await submitReclassificationReviews([proposta({ from: 'ti', to: 'ti' })]);
    expect(db.calls.insert).not.toHaveBeenCalled();
    expect(r.queued).toBe(0);
  });

  it('duplicata é informação, não falha', async () => {
    db.setTableResult('skill_reclassification_reviews', {
      data: null,
      error: { code: '23505', message: 'duplicate key' },
    });
    const r = await submitReclassificationReviews([proposta()]);
    expect(r.duplicates).toHaveLength(1);
    expect(r.failures).toHaveLength(0);
    expect(r.queued).toBe(0);
  });

  it('uma falha não aborta o lote — todas as propostas são tentadas', async () => {
    db.setTableResult('skill_reclassification_reviews', {
      data: null,
      error: { code: '42501', message: 'row-level security' },
    });
    const r = await submitReclassificationReviews([
      proposta({ skillId: 's-1', slug: 'a' }),
      proposta({ skillId: 's-2', slug: 'b' }),
      proposta({ skillId: 's-3', slug: 'c' }),
    ]);
    expect(db.calls.insert).toHaveBeenCalledTimes(3);
    expect(r.failures.map((f) => f.slug)).toEqual(['a', 'b', 'c']);
    expect(r.failures.every((f) => f.kind === 'permission')).toBe(true);
  });

  it('lote vazio não toca no banco', async () => {
    const r = await submitReclassificationReviews([]);
    expect(db.calls.insert).not.toHaveBeenCalled();
    expect(r).toMatchObject({ queued: 0, duplicates: [], failures: [] });
  });
});

describe('decideReclassificationReview — decisão autoritativa no servidor', () => {
  it('encaminha a intenção e trunca o motivo no limite do banco', async () => {
    db.setRpcResult('decide_skill_reclassification', {
      data: linha({ status: 'aprovado', reviewed_at: '2026-07-28T11:00:00Z', reviewed_by: 'u-1' }),
      error: null,
    });

    const motivo = 'x'.repeat(MAX_DECISION_REASON + 500);
    const r = await decideReclassificationReview({ reviewId: 'r-1', approve: true, reason: motivo });

    const [nome, args] = db.calls.rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(nome).toBe('decide_skill_reclassification');
    expect(args._approve).toBe(true);
    expect((args._reason as string).length).toBe(MAX_DECISION_REASON);
    expect(r.status).toBe('aprovado');
    expect(r.reviewedAt).not.toBeNull();
  });

  it('traduz conflito de concorrência em erro tipado e legível', async () => {
    db.setRpcResult('decide_skill_reclassification', {
      data: null,
      error: { code: '40001', message: 'Conflito: departamento atual...' },
    });

    await expect(
      decideReclassificationReview({ reviewId: 'r-1', approve: true }),
    ).rejects.toMatchObject({ kind: 'conflict' });
  });

  it('recusa resposta 2xx com corpo inválido em vez de fingir sucesso', async () => {
    // Aceitar um corpo vazio faria a UI marcar como decidida uma revisão que
    // talvez continue pendente no banco.
    db.setRpcResult('decide_skill_reclassification', { data: null, error: null });
    await expect(
      decideReclassificationReview({ reviewId: 'r-1', approve: false, reason: 'errado' }),
    ).rejects.toMatchObject({ kind: 'unknown' });
  });

  it('aceita a linha vinda dentro de array (RETURNS SETOF)', async () => {
    db.setRpcResult('decide_skill_reclassification', {
      data: [linha({ status: 'rejeitado', reviewed_at: '2026-07-28T11:00:00Z' })],
      error: null,
    });
    const r = await decideReclassificationReview({ reviewId: 'r-1', approve: false, reason: 'não' });
    expect(r.status).toBe('rejeitado');
  });
});

describe('fetchReclassificationReviews — leitura da fila', () => {
  it('filtra por situação e limita o volume', async () => {
    db.setTableResult('skill_reclassification_reviews', { data: [linha()], error: null });
    const lista = await fetchReclassificationReviews({ status: 'pendente', limit: 9999 });
    expect(lista).toHaveLength(1);
    expect(db.calls.eq).toHaveBeenCalledWith('status', 'pendente');
    // Teto defensivo: um limite absurdo do chamador não vira varredura total.
    expect(db.calls.limit).toHaveBeenCalledWith(500);
  });

  it('"todos" não aplica filtro de situação', async () => {
    db.setTableResult('skill_reclassification_reviews', { data: [], error: null });
    await fetchReclassificationReviews({ status: 'todos' });
    expect(db.calls.eq).not.toHaveBeenCalled();
  });

  it('remove linhas inválidas em vez de quebrar a tela inteira', async () => {
    db.setTableResult('skill_reclassification_reviews', {
      data: [linha(), linha({ id: 'r-2', department_to: 'extinto' })],
      error: null,
    });
    const lista = await fetchReclassificationReviews();
    expect(lista.map((r) => r.id)).toEqual(['r-1']);
  });

  it('erro de leitura vira ReviewOperationError tipado', async () => {
    db.setTableResult('skill_reclassification_reviews', {
      data: null,
      error: { code: '42501', message: 'permission denied' },
    });
    await expect(fetchReclassificationReviews()).rejects.toMatchObject({ kind: 'permission' });
  });
});

// ============================================================================
// Limiar de confiança na trilha de auditoria
//
// Por que estas invariantes: o limiar é a única forma de reconstruir o critério
// vigente quando a proposta foi criada. Um valor errado aqui é pior que campo
// vazio — sugere um rigor que não existiu.
// ============================================================================
describe('toThreshold', () => {
  it('preserva null para propostas anteriores à coluna', () => {
    expect(toThreshold(null)).toBeNull();
    expect(toThreshold(undefined)).toBeNull();
  });

  it('nunca converte ausência em zero (0,00 sugeriria rigor nenhum)', () => {
    expect(toThreshold(null)).not.toBe(0);
  });

  it('aceita numeric vindo como string do PostgREST', () => {
    expect(toThreshold('0.7300')).toBeCloseTo(0.73, 6);
  });

  it('aceita as bordas legítimas 0 e 1', () => {
    expect(toThreshold(0)).toBe(0);
    expect(toThreshold(1)).toBe(1);
  });

  it('descarta valores fora de [0,1] — dado corrompido vira ausente', () => {
    expect(toThreshold(1.5)).toBeNull();
    expect(toThreshold(-0.1)).toBeNull();
    expect(toThreshold(100)).toBeNull();
  });

  it('descarta NaN/Infinity e texto não numérico', () => {
    expect(toThreshold(Number.NaN)).toBeNull();
    expect(toThreshold(Number.POSITIVE_INFINITY)).toBeNull();
    expect(toThreshold('abc')).toBeNull();
    expect(toThreshold('')).toBeNull();
  });
});
