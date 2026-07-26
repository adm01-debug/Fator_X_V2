/**
 * crmScoringService — testes do motor de lead scoring.
 *
 * O foco é a regra de negócio pura: normalização de acentos, faixas de porte,
 * decaimento de engajamento, pesos degenerados e classificação em tiers.
 * São exatamente os pontos onde um erro silencioso zera o funil inteiro.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getSharedSupabaseMock } from '@/test/utils/supabaseMock';

vi.mock('@/integrations/supabase/client', async () => {
  const { getSharedSupabaseMock: get } = await import('@/test/utils/supabaseMock');
  return { supabase: get('crm-scoring').client };
});
vi.mock('@/lib/supabaseExtended', async () => {
  const { getSharedSupabaseMock: get } = await import('@/test/utils/supabaseMock');
  const client = get('crm-scoring').client as {
    from: (t: string) => unknown;
    rpc: (f: string, a?: unknown) => unknown;
  };
  return {
    fromTable: (table: string) => client.from(table),
    rpcCall: (fn: string, args?: unknown) => client.rpc(fn, args),
  };
});
vi.mock('@/lib/agentService', () => ({ getWorkspaceId: vi.fn(async () => 'ws-alpha') }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  scoreLead,
  normalizeTerm,
  parseSizeBand,
  listIcpProfiles,
  persistDealScore,
  DEFAULT_ICP_INPUT,
  type IcpProfile,
} from '@/services/crmScoringService';

const db = getSharedSupabaseMock('crm-scoring');

const profile: IcpProfile = {
  id: 'icp-1',
  workspace_id: 'ws-alpha',
  name: 'ICP Teste',
  description: null,
  is_default: true,
  weight_industry: 25,
  weight_company_size: 25,
  weight_job_title: 25,
  weight_engagement: 25,
  target_industries: ['Tecnologia da Informação'],
  target_job_titles: ['Diretor', 'Head'],
  min_company_size: 11,
  max_company_size: 1000,
  qualified_threshold: 70,
  hot_threshold: 85,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  deleted_at: null,
};

const NOW = new Date('2026-07-26T12:00:00Z');

beforeEach(() => db.reset());

describe('normalizeTerm', () => {
  it('remove acentos e caixa', () => {
    expect(normalizeTerm('Tecnologia da Informação')).toBe('tecnologia da informacao');
  });

  it('apara espaços nas bordas', () => {
    expect(normalizeTerm('  Saúde  ')).toBe('saude');
  });
});

describe('parseSizeBand', () => {
  it('faixa com hífen vira a média', () => {
    expect(parseSizeBand('11-50')).toBe(31);
  });

  it('aceita separador "a" e pontuação de milhar', () => {
    expect(parseSizeBand('1.000 a 5.000')).toBe(3000);
  });

  it('faixa aberta usa o piso', () => {
    expect(parseSizeBand('500+')).toBe(500);
  });

  it('texto livre devolve null em vez de 0', () => {
    // 0 seria interpretado como "empresa sem funcionários" e puniria o lead.
    expect(parseSizeBand('grande porte')).toBeNull();
    expect(parseSizeBand(null)).toBeNull();
    expect(parseSizeBand('')).toBeNull();
  });
});

describe('scoreLead — casamento perfeito', () => {
  it('lead ideal atinge 100 e tier hot', () => {
    const r = scoreLead(
      {
        industry: 'tecnologia da informacao',
        sizeBand: '51-200',
        jobTitle: 'Diretora de Tecnologia',
        recentActivityCount: 5,
        lastActivityAt: NOW.toISOString(),
      },
      profile,
      NOW,
    );
    expect(r.score).toBe(100);
    expect(r.tier).toBe('hot');
    expect(r.missingSignals).toEqual([]);
  });

  it('acentuação divergente ainda casa o setor', () => {
    const r = scoreLead({ industry: 'Tecnologia da Informação' }, profile, NOW);
    expect(r.criteria.find((c) => c.key === 'industry')?.match).toBe(1);
  });
});

describe('scoreLead — sinais ausentes', () => {
  it('lead vazio pontua 0 e lista todos os sinais faltantes', () => {
    const r = scoreLead({}, profile, NOW);
    expect(r.score).toBe(0);
    expect(r.tier).toBe('cold');
    expect(r.missingSignals).toHaveLength(4);
  });

  it('faltar um sinal não invalida os demais', () => {
    const r = scoreLead({ industry: 'tecnologia da informacao' }, profile, NOW);
    expect(r.score).toBe(25);
    expect(r.missingSignals).toContain('Cargo');
  });
});

describe('scoreLead — porte fora da faixa', () => {
  it('decai proporcionalmente em vez de zerar de vez', () => {
    const r = scoreLead({ sizeBand: '1100' }, profile, NOW);
    const size = r.criteria.find((c) => c.key === 'company_size')!;
    expect(size.match).toBeGreaterThan(0);
    expect(size.match).toBeLessThan(1);
  });

  it('desvio extremo satura em 0, nunca negativo', () => {
    const r = scoreLead({ employeeCount: 500000 }, profile, NOW);
    const size = r.criteria.find((c) => c.key === 'company_size')!;
    expect(size.match).toBe(0);
    expect(size.points).toBe(0);
  });

  it('employeeCount tem precedência sobre sizeBand', () => {
    const r = scoreLead({ employeeCount: 100, sizeBand: '1-5' }, profile, NOW);
    expect(r.criteria.find((c) => c.key === 'company_size')?.match).toBe(1);
  });
});

describe('scoreLead — engajamento', () => {
  it('satura em 5 atividades', () => {
    const a = scoreLead({ recentActivityCount: 5, lastActivityAt: NOW.toISOString() }, profile, NOW);
    const b = scoreLead({ recentActivityCount: 50, lastActivityAt: NOW.toISOString() }, profile, NOW);
    expect(a.score).toBe(b.score);
  });

  it('decai com o tempo desde o último toque', () => {
    const recente = scoreLead({ recentActivityCount: 3, lastActivityAt: '2026-07-25T12:00:00Z' }, profile, NOW);
    const antigo = scoreLead({ recentActivityCount: 3, lastActivityAt: '2026-06-01T12:00:00Z' }, profile, NOW);
    expect(recente.score).toBeGreaterThan(antigo.score);
  });

  it('data inválida não produz NaN', () => {
    const r = scoreLead({ recentActivityCount: 2, lastActivityAt: 'não é data' }, profile, NOW);
    expect(Number.isFinite(r.score)).toBe(true);
  });

  it('data futura não infla o score acima do teto', () => {
    const r = scoreLead({ recentActivityCount: 5, lastActivityAt: '2027-01-01T00:00:00Z' }, profile, NOW);
    expect(r.criteria.find((c) => c.key === 'engagement')!.match).toBeLessThanOrEqual(1);
  });
});

describe('scoreLead — pesos degenerados', () => {
  it('todos os pesos zerados distribui igualmente em vez de dividir por zero', () => {
    const zerado: IcpProfile = {
      ...profile,
      weight_industry: 0,
      weight_company_size: 0,
      weight_job_title: 0,
      weight_engagement: 0,
    };
    const r = scoreLead({ industry: 'tecnologia da informacao' }, zerado, NOW);
    expect(Number.isFinite(r.score)).toBe(true);
    expect(r.score).toBe(25);
  });

  it('peso único concentra 100% no critério', () => {
    const soCargo: IcpProfile = {
      ...profile,
      weight_industry: 0,
      weight_company_size: 0,
      weight_job_title: 10,
      weight_engagement: 0,
    };
    const r = scoreLead({ jobTitle: 'Head de Vendas' }, soCargo, NOW);
    expect(r.score).toBe(100);
  });

  it('pesos que não somam 100 são normalizados', () => {
    const desbalanceado: IcpProfile = { ...profile, weight_industry: 90, weight_job_title: 90 };
    const total = scoreLead({}, desbalanceado, NOW).criteria.reduce((s, c) => s + c.weight, 0);
    expect(total).toBeCloseTo(1, 3);
  });
});

describe('scoreLead — perfil sem alvos', () => {
  it('setor sem alvo cadastrado é neutro, não penalidade', () => {
    const semAlvo: IcpProfile = { ...profile, target_industries: [] };
    const r = scoreLead({ industry: 'Varejo' }, semAlvo, NOW);
    expect(r.criteria.find((c) => c.key === 'industry')?.match).toBe(0.5);
  });
});

describe('classificação em tiers', () => {
  const tierDe = (score: number) => {
    // Constrói um lead sintético usando só o critério de cargo, calibrado
    // para produzir o score desejado via peso único.
    const p: IcpProfile = {
      ...profile,
      weight_industry: 100 - score,
      weight_company_size: 0,
      weight_job_title: score,
      weight_engagement: 0,
      target_industries: ['inexistente'],
    };
    return scoreLead({ industry: 'outro', jobTitle: 'Diretor' }, p, NOW).tier;
  };

  it('acima do limiar quente vira hot', () => expect(tierDe(90)).toBe('hot'));
  it('entre qualificado e quente vira qualified', () => expect(tierDe(75)).toBe('qualified'));
  it('metade do limiar vira nurture', () => expect(tierDe(50)).toBe('nurture'));
  it('abaixo de tudo vira cold', () => expect(tierDe(10)).toBe('cold'));
});

describe('persistência', () => {
  it('listIcpProfiles escopa por workspace e converte NUMERIC string', async () => {
    db.setTableResult('crm_icp_profiles', {
      data: [{ ...profile, weight_industry: '40', qualified_threshold: '65', min_company_size: '10' }],
      error: null,
    });

    const [p] = await listIcpProfiles();
    expect(db.calls.eq).toHaveBeenCalledWith('workspace_id', 'ws-alpha');
    expect(p.weight_industry).toBe(40);
    expect(p.qualified_threshold).toBe(65);
    expect(p.min_company_size).toBe(10);
  });

  it('persistDealScore grava score, tier e motivo com escopo de workspace', async () => {
    db.setResult({ data: null, error: null });
    const result = scoreLead({ jobTitle: 'Diretor' }, profile, NOW);

    await persistDealScore('deal-1', profile, result);

    const patch = db.calls.update.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(patch.lead_score).toBe(result.score);
    expect(patch.icp_profile_id).toBe('icp-1');
    expect((patch.score_reason as { tier: string }).tier).toBe(result.tier);
    expect(db.calls.eq).toHaveBeenCalledWith('workspace_id', 'ws-alpha');
  });

  it('erro de escrita propaga em vez de falhar em silêncio', async () => {
    db.setResult({ data: null, error: { message: 'permission denied' } });
    await expect(persistDealScore('deal-1', profile, scoreLead({}, profile, NOW))).rejects.toMatchObject({
      message: 'permission denied',
    });
  });
});

describe('DEFAULT_ICP_INPUT', () => {
  it('limiares são coerentes com a constraint do banco', () => {
    expect(DEFAULT_ICP_INPUT.hot_threshold).toBeGreaterThanOrEqual(DEFAULT_ICP_INPUT.qualified_threshold);
    expect(DEFAULT_ICP_INPUT.min_company_size).toBeLessThanOrEqual(DEFAULT_ICP_INPUT.max_company_size);
  });
});

describe('rescoreOpenDeals', () => {
  const setupTables = (overrides: Record<string, unknown[]> = {}) => {
    db.setTableResult('crm_deals', {
      data: overrides.deals ?? [
        {
          id: 'd1',
          title: 'Negócio A',
          workspace_id: 'ws-alpha',
          company_id: 'c1',
          contact_id: 'p1',
          score_reason: { tier: 'cold' },
        },
      ],
      error: null,
    });
    db.setTableResult('crm_companies', {
      data: overrides.companies ?? [{ id: 'c1', industry: 'Tecnologia da Informação', size_band: '51-200' }],
      error: null,
    });
    db.setTableResult('crm_contacts', {
      data: overrides.contacts ?? [{ id: 'p1', job_title: 'Diretor de TI' }],
      error: null,
    });
    db.setTableResult('crm_activities', {
      data: overrides.activities ?? [{ deal_id: 'd1', occurred_at: NOW.toISOString() }],
      error: null,
    });
  };

  it('pontua o negócio a partir de empresa, contato e atividades', async () => {
    const { rescoreOpenDeals } = await import('@/services/crmScoringService');
    setupTables();

    const outcome = await rescoreOpenDeals(profile, NOW);

    expect(outcome.evaluated).toBe(1);
    expect(outcome.updated).toBe(1);
    const rows = db.calls.upsert.mock.calls.at(-1)?.[0] as Array<Record<string, unknown>>;
    expect(rows[0].lead_score).toBeGreaterThan(0);
    expect(rows[0].icp_profile_id).toBe('icp-1');
  });

  it('inclui workspace_id e title no payload — colunas NOT NULL sem default', async () => {
    const { rescoreOpenDeals } = await import('@/services/crmScoringService');
    setupTables();
    await rescoreOpenDeals(profile, NOW);

    const rows = db.calls.upsert.mock.calls.at(-1)?.[0] as Array<Record<string, unknown>>;
    // Sem esses campos o caminho de INSERT do upsert violaria NOT NULL.
    expect(rows[0].workspace_id).toBe('ws-alpha');
    expect(rows[0].title).toBe('Negócio A');
    expect(db.calls.upsert.mock.calls.at(-1)?.[1]).toEqual({ onConflict: 'id' });
  });

  it('reporta mudança de faixa em relação ao score anterior', async () => {
    const { rescoreOpenDeals } = await import('@/services/crmScoringService');
    setupTables();
    const outcome = await rescoreOpenDeals(profile, NOW);

    expect(outcome.tierChanges).toHaveLength(1);
    expect(outcome.tierChanges[0]).toMatchObject({ dealId: 'd1', from: 'cold' });
  });

  it('score_reason ausente ou malformado não quebra a detecção de faixa', async () => {
    const { rescoreOpenDeals } = await import('@/services/crmScoringService');
    setupTables({
      deals: [
        { id: 'd1', title: 'A', workspace_id: 'ws-alpha', company_id: null, contact_id: null, score_reason: null },
        { id: 'd2', title: 'B', workspace_id: 'ws-alpha', company_id: null, contact_id: null, score_reason: 'lixo' },
      ],
    });

    const outcome = await rescoreOpenDeals(profile, NOW);
    expect(outcome.evaluated).toBe(2);
    expect(outcome.tierChanges.every((c) => c.from === null)).toBe(true);
  });

  it('negócio sem empresa e sem contato ainda é pontuado, com sinais faltantes', async () => {
    const { rescoreOpenDeals } = await import('@/services/crmScoringService');
    setupTables({
      deals: [
        { id: 'd9', title: 'Órfão', workspace_id: 'ws-alpha', company_id: null, contact_id: null, score_reason: {} },
      ],
      activities: [],
    });

    await rescoreOpenDeals(profile, NOW);
    const rows = db.calls.upsert.mock.calls.at(-1)?.[0] as Array<Record<string, unknown>>;
    expect(rows[0].lead_score).toBe(0);
    expect((rows[0].score_reason as { missing_signals: string[] }).missing_signals).toHaveLength(4);
  });

  it('funil vazio não dispara escrita', async () => {
    const { rescoreOpenDeals } = await import('@/services/crmScoringService');
    setupTables({ deals: [] });

    const outcome = await rescoreOpenDeals(profile, NOW);
    expect(outcome.updated).toBe(0);
    expect(db.calls.upsert).not.toHaveBeenCalled();
  });

  it('erro em qualquer leitura aborta antes de escrever', async () => {
    const { rescoreOpenDeals } = await import('@/services/crmScoringService');
    setupTables();
    db.setTableResult('crm_contacts', { data: null, error: { message: 'timeout' } });

    await expect(rescoreOpenDeals(profile, NOW)).rejects.toMatchObject({ message: 'timeout' });
    expect(db.calls.upsert).not.toHaveBeenCalled();
  });
});
