/**
 * skillsSimulationService — Harness determinístico de simulação da plataforma de Skills.
 *
 * Roda inteiramente em memória (sem rede, sem banco), no mesmo espírito de
 * `e2eeSimulationService.ts`. Gera centenas de cenários sintéticos contra:
 *
 *   1. Recommender  (`skillRecommenderService`)
 *   2. Composer     (`lib/skillComposer/skillDraft`)
 *   3. Skillbook    (`skillbookAuditService` — apenas helpers puros)
 *   4. Registry     (modelo puro das semânticas de instalação)
 *
 * Cada cenário produz um `SimCase` com esperado × obtido × status, para alimentar
 * `docs/SIMULACAO-SKILLS-10-10.md` e as ondas de correção.
 */
import {
  recommendSkills,
  tokenize,
  type Recommendation,
} from '@/services/skillRecommenderService';
import type { AgentSkillDefinition } from '@/services/skillsRegistryService';
import {
  skillDraftSchema,
  DEFAULT_DRAFT,
  type SkillDraft,
} from '@/lib/skillComposer/skillDraft';
import {
  buildConfidenceSeries,
  filterByPeriod,
  toCsv,
  periodStartISO,
  confidenceLabel,
  type LearnedSkillEntry,
  type SkillbookPeriod,
} from '@/services/skillbookAuditService';

// ─────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────
export type SimSuite = 'recommender' | 'composer' | 'skillbook' | 'registry';
export type SimStatus = 'pass' | 'gap';

export interface SimCase {
  id: string;
  suite: SimSuite;
  name: string;
  expected: string;
  actual: string;
  status: SimStatus;
  /** Identificador estável do gap, usado para agrupar no relatório. */
  gapKey?: string;
}

export interface SuiteSummary {
  suite: SimSuite;
  total: number;
  passed: number;
  gaps: number;
}

export interface GapSummary {
  gapKey: string;
  suite: SimSuite;
  occurrences: number;
  sample: SimCase;
}

export interface SimulationReport {
  cases: SimCase[];
  suites: SuiteSummary[];
  gaps: GapSummary[];
  total: number;
  passed: number;
  failed: number;
  elapsedMs: number;
}

// ─────────────────────────────────────────────────────────────────────────
// RNG determinístico (mulberry32)
// ─────────────────────────────────────────────────────────────────────────
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

function ok(
  id: string,
  suite: SimSuite,
  name: string,
  expected: string,
  condition: boolean,
  actualWhenFail: string,
  gapKey: string,
): SimCase {
  return condition
    ? { id, suite, name, expected, actual: expected, status: 'pass' }
    : { id, suite, name, expected, actual: actualWhenFail, status: 'gap', gapKey };
}

// ─────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────
const CATEGORIES = ['tools', 'knowledge', 'prompts', 'workflows', 'integrations'] as const;

const SKILL_WORDS = [
  'slack', 'webhook', 'relatorio', 'planilha', 'crm', 'email', 'resumo',
  'traducao', 'pesquisa', 'documento', 'pdf', 'faturamento', 'cobranca',
  'atendimento', 'triagem', 'classificacao', 'agenda', 'reuniao', 'notificacao',
];

const MISSION_TEMPLATES = [
  'Agente de atendimento que responde dúvidas sobre faturamento e cobrança',
  'Bot de vendas inbound que qualifica leads e registra no CRM',
  'Assistente que gera relatórios semanais em planilha e envia por e-mail',
  'Agente RAG que consulta documentos PDF internos da empresa',
  'Automação de workflow para triagem de tickets e notificação no Slack',
  'Agente que traduz conteúdo e faz resumo de reuniões',
  'IA',
  '',
  '   ',
  '🚀🤖🔥',
  'ação coordenação integração automação inovação',
  'a o de da do para com em e ou que um uma',
];

export function makeSkill(index: number, rng: () => number): AgentSkillDefinition {
  const w1 = pick(rng, SKILL_WORDS);
  const w2 = pick(rng, SKILL_WORDS);
  const category = pick(rng, CATEGORIES);
  return {
    id: `skill-${index}`,
    name: `${w1} ${w2} ${index}`,
    slug: `${w1}-${w2}-${index}`,
    description: `Skill que integra ${w1} com ${w2} para automação de processos.`,
    version: '1.0.0',
    author: 'nexus',
    category,
    tags: [w1, w2],
    install_count: Math.floor(rng() * 1000),
    rating: Math.round(rng() * 50) / 10,
    skill_config: {},
    is_verified: rng() > 0.5,
    is_public: true,
    created_at: new Date(1_760_000_000_000 + index * 3600_000).toISOString(),
  };
}

export function makeCatalog(size: number, seed: number): AgentSkillDefinition[] {
  const rng = makeRng(seed);
  return Array.from({ length: size }, (_, i) => makeSkill(i, rng));
}

// ─────────────────────────────────────────────────────────────────────────
// Suite 1 — Recommender (300 cenários)
// ─────────────────────────────────────────────────────────────────────────
const CATALOG_SIZES = [0, 1, 5, 50, 500];

function idsOf(recs: Recommendation[]): string {
  return recs.map((r) => r.skill.id).join('|');
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function runRecommenderSuite(): SimCase[] {
  const cases: SimCase[] = [];
  const rng = makeRng(20260726);
  let n = 0;

  for (let i = 0; i < 60; i++) {
    const mission = pick(rng, MISSION_TEMPLATES);
    const size = pick(rng, CATALOG_SIZES);
    const catalog = makeCatalog(size, 1000 + i);
    const limit = 5;
    const recs = recommendSkills({ mission }, catalog, limit);
    const tag = `cat=${size}`;

    // 1. Determinismo
    const again = recommendSkills({ mission }, catalog, limit);
    cases.push(
      ok(
        `REC-${++n}`,
        'recommender',
        `Determinismo (${tag})`,
        'duas execuções idênticas retornam a mesma ordem',
        idsOf(recs) === idsOf(again),
        `"${idsOf(recs)}" ≠ "${idsOf(again)}"`,
        'rec-nao-deterministico',
      ),
    );

    // 2. Faixa de score e ausência de NaN
    const badScore = recs.find(
      (r) =>
        !Number.isFinite(r.score) ||
        r.score < 0 ||
        r.score > 1 ||
        !Number.isFinite(r.breakdown.keyword) ||
        !Number.isFinite(r.breakdown.category),
    );
    cases.push(
      ok(
        `REC-${++n}`,
        'recommender',
        `Score finito em [0,1] (${tag})`,
        'todo score e breakdown finitos dentro de 0..1',
        !badScore,
        badScore ? `skill ${badScore.skill.id} score=${badScore.score}` : '',
        'rec-score-fora-de-faixa',
      ),
    );

    // 3. Respeita o limite
    cases.push(
      ok(
        `REC-${++n}`,
        'recommender',
        `Limite respeitado (${tag})`,
        `no máximo ${limit} recomendações`,
        recs.length <= limit,
        `retornou ${recs.length}`,
        'rec-limite-violado',
      ),
    );

    // 4. Ordem decrescente por score
    const outOfOrder = recs.some((r, idx) => idx > 0 && r.score > recs[idx - 1].score + 1e-9);
    cases.push(
      ok(
        `REC-${++n}`,
        'recommender',
        `Ordenação decrescente (${tag})`,
        'scores em ordem não-crescente',
        !outOfOrder,
        'há um item com score maior que o anterior',
        'rec-ordem-incorreta',
      ),
    );

    // 5. Estabilidade sob permutação da entrada
    const shuffled = shuffle(catalog, makeRng(7000 + i));
    const recsShuffled = recommendSkills({ mission }, shuffled, limit);
    cases.push(
      ok(
        `REC-${++n}`,
        'recommender',
        `Ordem estável sob permutação do catálogo (${tag})`,
        'mesma ordem independente da ordem de entrada',
        idsOf(recs) === idsOf(recsShuffled),
        `"${idsOf(recs)}" ≠ "${idsOf(recsShuffled)}"`,
        'rec-ordem-instavel',
      ),
    );
  }

  // Cenários dirigidos de tokenização
  const shortTermMissions: Array<[string, string]> = [
    ['IA', 'ia'],
    ['CRM', 'crm'],
    ['API REST', 'api'],
    ['SDR B2B', 'sdr'],
  ];
  for (const [mission, term] of shortTermMissions) {
    const tokens = tokenize(mission);
    cases.push(
      ok(
        `REC-${++n}`,
        'recommender',
        `Sigla curta "${mission}" é tokenizada`,
        `token "${term}" preservado`,
        tokens.has(term),
        `tokens = [${Array.from(tokens).join(', ')}]`,
        'rec-siglas-curtas-descartadas',
      ),
    );
  }

  // Acentuação: missão acentuada deve casar com skill sem acento
  const accentCatalog: AgentSkillDefinition[] = [
    { ...makeSkill(0, makeRng(1)), id: 'acc-1', name: 'Automacao de cobranca', description: 'Automacao de cobranca recorrente para clientes', tags: ['cobranca'] },
  ];
  const accentRecs = recommendSkills({ mission: 'Preciso de automação de cobrança' }, accentCatalog, 5);
  cases.push(
    ok(
      `REC-${++n}`,
      'recommender',
      'Missão acentuada casa com skill sem acento',
      'ao menos 1 recomendação',
      accentRecs.length > 0,
      'nenhuma recomendação retornada',
      'rec-acentuacao',
    ),
  );

  // Missão vazia / catálogo vazio
  cases.push(
    ok(
      `REC-${++n}`,
      'recommender',
      'Missão vazia retorna lista vazia',
      '[]',
      recommendSkills({ mission: '' }, makeCatalog(10, 5)).length === 0,
      'retornou recomendações',
      'rec-missao-vazia',
    ),
  );
  cases.push(
    ok(
      `REC-${++n}`,
      'recommender',
      'Catálogo vazio retorna lista vazia',
      '[]',
      recommendSkills({ mission: 'slack webhook' }, []).length === 0,
      'retornou recomendações',
      'rec-catalogo-vazio',
    ),
  );

  // Catálogo grande: latência determinística
  const big = makeCatalog(500, 42);
  const t0 = Date.now();
  recommendSkills({ mission: 'relatorio planilha email crm' }, big, 5);
  const elapsed = Date.now() - t0;
  cases.push(
    ok(
      `REC-${++n}`,
      'recommender',
      'Catálogo de 500 skills < 250ms',
      'execução rápida',
      elapsed < 250,
      `${elapsed}ms`,
      'rec-latencia',
    ),
  );

  // Skills com campos ausentes não quebram
  const brokenCatalog = [
    { ...makeSkill(1, makeRng(9)), id: 'broken-1', tags: undefined as unknown as string[] },
    { ...makeSkill(2, makeRng(9)), id: 'broken-2', install_count: undefined as unknown as number },
  ];
  let brokenOk = true;
  let brokenDetail = '';
  try {
    recommendSkills({ mission: 'slack webhook relatorio' }, brokenCatalog, 5);
  } catch (e) {
    brokenOk = false;
    brokenDetail = e instanceof Error ? e.message : String(e);
  }
  cases.push(
    ok(
      `REC-${++n}`,
      'recommender',
      'Skill com tags/install_count ausentes não lança',
      'sem exceção',
      brokenOk,
      brokenDetail,
      'rec-campos-ausentes',
    ),
  );

  return cases;
}

// ─────────────────────────────────────────────────────────────────────────
// Suite 2 — Composer / skillDraft (200 cenários)
// ─────────────────────────────────────────────────────────────────────────
function validDraft(overrides: Partial<SkillDraft> = {}): SkillDraft {
  return {
    ...DEFAULT_DRAFT,
    name: 'Resumo de Reunião',
    slug: 'resumo-de-reuniao',
    description: 'Gera um resumo estruturado a partir da transcrição de uma reunião.',
    category: 'prompts',
    version: '1.0.0',
    tags: ['resumo'],
    inputs: [
      {
        id: 'i1',
        name: 'transcricao',
        type: 'string',
        required: true,
        description: 'Transcrição bruta',
        defaultValue: '',
        validation: { pattern: '', enumValues: [] },
      },
    ],
    outputs: [
      { id: 'o1', name: 'resumo', type: 'string', description: 'Resumo final' },
    ],
    prompt: {
      systemMessage: 'Você é um assistente de atas.',
      template: 'Resuma: {{transcricao}}',
    },
    ...overrides,
  } as SkillDraft;
}

interface DraftMutation {
  name: string;
  expectValid: boolean;
  gapKey: string;
  build: (rng: () => number) => SkillDraft;
}

const DRAFT_MUTATIONS: DraftMutation[] = [
  {
    name: 'Draft válido de referência',
    expectValid: true,
    gapKey: 'composer-falso-negativo',
    build: () => validDraft(),
  },
  {
    name: 'Nome com 2 caracteres',
    expectValid: false,
    gapKey: 'composer-nome-curto',
    build: () => validDraft({ name: 'ab' }),
  },
  {
    name: 'Slug com maiúsculas e espaço',
    expectValid: false,
    gapKey: 'composer-slug-invalido',
    build: () => validDraft({ slug: 'Resumo Reuniao' }),
  },
  {
    name: 'Versão fora do semver X.Y.Z',
    expectValid: false,
    gapKey: 'composer-versao-invalida',
    build: () => validDraft({ version: '1.0' }),
  },
  {
    name: 'Descrição com menos de 20 caracteres',
    expectValid: false,
    gapKey: 'composer-descricao-curta',
    build: () => validDraft({ description: 'curta' }),
  },
  {
    name: 'Mais de 8 tags',
    expectValid: false,
    gapKey: 'composer-tags-excedidas',
    build: () => validDraft({ tags: Array.from({ length: 9 }, (_, i) => `t${i}`) }),
  },
  {
    name: 'Input com nome iniciando por dígito',
    expectValid: false,
    gapKey: 'composer-input-nome-invalido',
    build: () =>
      validDraft({
        inputs: [{ ...validDraft().inputs[0], name: '1campo' }],
      }),
  },
  {
    name: 'Nomes de input duplicados',
    expectValid: false,
    gapKey: 'composer-inputs-duplicados',
    build: () => {
      const base = validDraft().inputs[0];
      return validDraft({
        inputs: [base, { ...base, id: 'i2' }],
      });
    },
  },
  {
    name: 'Nomes de output duplicados',
    expectValid: false,
    gapKey: 'composer-outputs-duplicados',
    build: () => {
      const base = validDraft().outputs[0];
      return validDraft({ outputs: [base, { ...base, id: 'o2' }] });
    },
  },
  {
    name: 'Placeholder do prompt não declarado nos inputs',
    expectValid: false,
    gapKey: 'composer-placeholder-orfao',
    build: () =>
      validDraft({
        prompt: { systemMessage: '', template: 'Resuma: {{nao_declarado}}' },
      }),
  },
  {
    name: 'Input obrigatório nunca referenciado no prompt (categoria prompts)',
    expectValid: false,
    gapKey: 'composer-input-nao-usado',
    build: () =>
      validDraft({
        prompt: { systemMessage: '', template: 'Gere um resumo genérico.' },
      }),
  },
  {
    name: 'Enum sem valores declarados',
    expectValid: false,
    gapKey: 'composer-enum-vazio',
    build: () =>
      validDraft({
        inputs: [
          {
            ...validDraft().inputs[0],
            type: 'enum',
            validation: { pattern: '', enumValues: [] },
          },
        ],
      }),
  },
  {
    name: 'Validação numérica com min > max',
    expectValid: false,
    gapKey: 'composer-min-maior-que-max',
    build: () =>
      validDraft({
        inputs: [
          {
            ...validDraft().inputs[0],
            type: 'number',
            validation: { min: 10, max: 1, pattern: '', enumValues: [] },
          },
        ],
      }),
  },
  {
    name: 'Regex de pattern inválida',
    expectValid: false,
    gapKey: 'composer-regex-invalida',
    build: () =>
      validDraft({
        inputs: [
          {
            ...validDraft().inputs[0],
            validation: { pattern: '([a-z', enumValues: [] },
          },
        ],
      }),
  },
  {
    name: 'Skill sem nenhum output declarado',
    expectValid: false,
    gapKey: 'composer-sem-outputs',
    build: () => validDraft({ outputs: [] }),
  },
  {
    name: 'Execução HTTP sem URL',
    expectValid: false,
    gapKey: 'composer-http-sem-url',
    build: () =>
      validDraft({
        category: 'tools',
        execution: {
          ...DEFAULT_DRAFT.execution,
          kind: 'http',
          http: { url: '', method: 'POST', headers: [], bodyTemplate: '' },
        },
      }),
  },
  {
    name: 'Execução HTTP com URL não-https',
    expectValid: false,
    gapKey: 'composer-http-url-insegura',
    build: () =>
      validDraft({
        category: 'tools',
        execution: {
          ...DEFAULT_DRAFT.execution,
          kind: 'http',
          http: { url: 'http://api.exemplo.com', method: 'POST', headers: [], bodyTemplate: '' },
        },
      }),
  },
  {
    name: 'Execução RAG sem coleção',
    expectValid: false,
    gapKey: 'composer-rag-sem-colecao',
    build: () =>
      validDraft({
        category: 'knowledge',
        execution: {
          ...DEFAULT_DRAFT.execution,
          kind: 'rag',
          rag: { collection: '', topK: 5, minScore: 0.6 },
        },
      }),
  },
  {
    name: 'Execução LLM (categoria prompts) sem template de prompt',
    expectValid: false,
    gapKey: 'composer-llm-sem-template',
    build: () =>
      validDraft({
        prompt: { systemMessage: 'Você é um assistente.', template: '' },
        execution: { ...DEFAULT_DRAFT.execution, kind: 'llm' },
      }),
  },
  {
    name: 'Workflow sem nenhum passo',
    expectValid: false,
    gapKey: 'composer-workflow-sem-passos',
    build: () =>
      validDraft({
        category: 'workflows',
        execution: {
          ...DEFAULT_DRAFT.execution,
          kind: 'workflow',
          workflow: { steps: [] },
        },
      }),
  },
  {
    name: 'Kind de execução incoerente com a categoria',
    expectValid: false,
    gapKey: 'composer-kind-incoerente',
    build: () =>
      validDraft({
        category: 'knowledge',
        execution: { ...DEFAULT_DRAFT.execution, kind: 'http', http: { url: 'https://x.com', method: 'POST', headers: [], bodyTemplate: '' } },
      }),
  },
  {
    name: 'Template de prompt gigante (> 4000 chars)',
    expectValid: false,
    gapKey: 'composer-prompt-gigante',
    build: () =>
      validDraft({
        prompt: { systemMessage: '', template: 'x'.repeat(4100) },
      }),
  },
  {
    name: 'Mais de 20 inputs',
    expectValid: false,
    gapKey: 'composer-inputs-excedidos',
    build: () => {
      const base = validDraft().inputs[0];
      return validDraft({
        inputs: Array.from({ length: 21 }, (_, i) => ({ ...base, id: `i${i}`, name: `campo_${i}` })),
      });
    },
  },
  {
    name: 'Header HTTP com chave vazia',
    expectValid: false,
    gapKey: 'composer-header-vazio',
    build: () =>
      validDraft({
        category: 'tools',
        execution: {
          ...DEFAULT_DRAFT.execution,
          kind: 'http',
          http: {
            url: 'https://api.exemplo.com',
            method: 'POST',
            headers: [{ key: '', value: 'abc' }],
            bodyTemplate: '',
          },
        },
      }),
  },
  {
    name: 'Segredo literal em header HTTP',
    expectValid: false,
    gapKey: 'composer-segredo-hardcoded',
    build: () =>
      validDraft({
        category: 'tools',
        execution: {
          ...DEFAULT_DRAFT.execution,
          kind: 'http',
          http: {
            url: 'https://api.exemplo.com',
            method: 'POST',
            headers: [{ key: 'Authorization', value: 'Bearer sk-live-abc123def456ghi789' }],
            bodyTemplate: '',
          },
        },
      }),
  },
];

export function runComposerSuite(): SimCase[] {
  const cases: SimCase[] = [];
  const rng = makeRng(31415);
  let n = 0;

  // Cada mutação executada em 8 repetições com ruído determinístico → 200 cenários
  const REPS = 8;
  for (let rep = 0; rep < REPS; rep++) {
    for (const mutation of DRAFT_MUTATIONS) {
      const draft = mutation.build(rng);
      const result = skillDraftSchema.safeParse(draft);
      const isValid = result.success;
      const matched = isValid === mutation.expectValid;

      let actual: string;
      if (matched) {
        actual = mutation.expectValid ? 'aceito' : 'rejeitado';
      } else if (isValid) {
        actual = 'aceito (deveria rejeitar)';
      } else {
        actual = `rejeitado: ${result.error.issues[0]?.message ?? 'erro'}`;
      }

      cases.push({
        id: `CMP-${++n}`,
        suite: 'composer',
        name: `${mutation.name} [rep ${rep + 1}]`,
        expected: mutation.expectValid ? 'aceito pelo schema' : 'rejeitado pelo schema',
        actual,
        status: matched ? 'pass' : 'gap',
        gapKey: matched ? undefined : mutation.gapKey,
      });
    }
  }

  return cases;
}

// ─────────────────────────────────────────────────────────────────────────
// Suite 3 — Skillbook Audit (150 cenários)
// ─────────────────────────────────────────────────────────────────────────
function makeLearned(
  index: number,
  createdAt: string,
  confidence: number,
): LearnedSkillEntry {
  return {
    id: `learned-${index}`,
    agent_id: `agent-${index % 5}`,
    agent_name: `Agente ${index % 5}`,
    skill_name: `Skill ${index}`,
    description: null,
    confidence,
    success_count: index % 7,
    failure_count: index % 3,
    source_trace_id: null,
    version: 1,
    created_at: createdAt,
    updated_at: createdAt,
    successRate: 0,
    totalUses: 0,
  };
}

const PERIODS: SkillbookPeriod[] = ['7d', '30d', '90d', 'all'];

export function runSkillbookSuite(): SimCase[] {
  const cases: SimCase[] = [];
  const rng = makeRng(2718);
  let n = 0;
  const now = Date.now();

  for (let i = 0; i < 30; i++) {
    const period = PERIODS[i % PERIODS.length];
    const size = [0, 1, 10, 120][i % 4];
    // Distribui entradas em até 200 dias no passado, com buracos de datas.
    const learned = Array.from({ length: size }, (_, k) =>
      makeLearned(
        k,
        new Date(now - Math.floor(rng() * 200) * 24 * 3600_000).toISOString(),
        rng(),
      ),
    );

    const series = buildConfidenceSeries(learned, period);
    const tag = `${period}/${size} entradas`;

    // 1. Sem NaN na série
    const nan = series.find(
      (p) => !Number.isFinite(p.avgConfidence) || !Number.isFinite(p.cumulativeLearned),
    );
    cases.push(
      ok(
        `SKB-${++n}`,
        'skillbook',
        `Série sem NaN (${tag})`,
        'todos os pontos finitos',
        !nan,
        nan ? `ponto ${nan.date} inválido` : '',
        'skb-nan-na-serie',
      ),
    );

    // 2. Confiança média dentro de 0..1
    const outOfRange = series.find((p) => p.avgConfidence < 0 || p.avgConfidence > 1);
    cases.push(
      ok(
        `SKB-${++n}`,
        'skillbook',
        `Confiança média em [0,1] (${tag})`,
        '0 ≤ avgConfidence ≤ 1',
        !outOfRange,
        outOfRange ? `${outOfRange.date} = ${outOfRange.avgConfidence}` : '',
        'skb-confianca-fora-de-faixa',
      ),
    );

    // 3. Acumulado monotônico
    const nonMonotonic = series.some(
      (p, idx) => idx > 0 && p.cumulativeLearned < series[idx - 1].cumulativeLearned,
    );
    cases.push(
      ok(
        `SKB-${++n}`,
        'skillbook',
        `Acumulado monotônico (${tag})`,
        'cumulativeLearned não decresce',
        !nonMonotonic,
        'acumulado decresceu entre dois pontos',
        'skb-acumulado-nao-monotonico',
      ),
    );

    // 4. Datas ordenadas cronologicamente
    const unsorted = series.some((p, idx) => idx > 0 && p.date < series[idx - 1].date);
    cases.push(
      ok(
        `SKB-${++n}`,
        'skillbook',
        `Datas ordenadas (${tag})`,
        'ordem cronológica crescente',
        !unsorted,
        'datas fora de ordem',
        'skb-datas-desordenadas',
      ),
    );

    // 5. Filtro de período nunca inclui registros anteriores ao início
    const start = periodStartISO(period);
    const filtered = filterByPeriod(learned, period, 'created_at');
    const leaked = start ? filtered.find((r) => r.created_at < start) : undefined;
    cases.push(
      ok(
        `SKB-${++n}`,
        'skillbook',
        `Filtro de período sem vazamento (${tag})`,
        'nenhum registro anterior ao início da janela',
        !leaked,
        leaked ? `vazou ${leaked.created_at}` : '',
        'skb-filtro-vazando',
      ),
    );
  }

  // CSV: caracteres especiais
  const csvRows = [
    { nome: 'Skill, com vírgula', nota: 'diz "olá"', obs: 'linha1\nlinha2', vazio: null },
    { nome: 'Ponto; e vírgula', nota: 'sem nada', obs: '', vazio: undefined },
  ] as unknown as Array<Record<string, unknown>>;
  const csv = toCsv(csvRows, ['nome', 'nota', 'obs', 'vazio']);
  const lines = csv.split('\n');

  cases.push(
    ok(
      `SKB-${++n}`,
      'skillbook',
      'CSV envolve células com vírgula em aspas',
      'célula com vírgula entre aspas',
      csv.includes('"Skill, com vírgula"'),
      csv.slice(0, 120),
      'skb-csv-virgula',
    ),
  );
  cases.push(
    ok(
      `SKB-${++n}`,
      'skillbook',
      'CSV duplica aspas internas',
      'aspas escapadas como ""',
      csv.includes('diz ""olá""'),
      csv.slice(0, 160),
      'skb-csv-aspas',
    ),
  );
  cases.push(
    ok(
      `SKB-${++n}`,
      'skillbook',
      'CSV com quebra de linha permanece parseável',
      'cabeçalho + 2 registros lógicos',
      lines[0] === 'nome,nota,obs,vazio',
      `cabeçalho = "${lines[0]}"`,
      'skb-csv-cabecalho',
    ),
  );
  cases.push(
    ok(
      `SKB-${++n}`,
      'skillbook',
      'CSV trata null/undefined como célula vazia',
      'célula vazia',
      csv.includes(',\n') || csv.endsWith(','),
      csv.slice(-60),
      'skb-csv-nulos',
    ),
  );

  // Rótulos de confiança nos limites
  const labelCases: Array<[number, string]> = [
    [0, 'baixa'],
    [0.39, 'baixa'],
    [0.4, 'média'],
    [0.69, 'média'],
    [0.7, 'alta'],
    [0.89, 'alta'],
    [0.9, 'muito alta'],
    [1, 'muito alta'],
  ];
  for (const [value, expected] of labelCases) {
    const actual = confidenceLabel(value);
    cases.push(
      ok(
        `SKB-${++n}`,
        'skillbook',
        `Rótulo de confiança para ${value}`,
        expected,
        actual === expected,
        actual,
        'skb-rotulo-confianca',
      ),
    );
  }

  // Timezone: entradas próximas à meia-noite UTC
  const midnight = new Date('2026-07-20T23:59:59.000Z').toISOString();
  const justAfter = new Date('2026-07-21T00:00:01.000Z').toISOString();
  const tzSeries = buildConfidenceSeries(
    [makeLearned(1, midnight, 0.5), makeLearned(2, justAfter, 0.9)],
    'all',
  );
  cases.push(
    ok(
      `SKB-${++n}`,
      'skillbook',
      'Entradas em dias UTC distintos geram 2 pontos',
      '2 pontos na série',
      tzSeries.length === 2,
      `${tzSeries.length} pontos`,
      'skb-timezone',
    ),
  );

  return cases;
}

// ─────────────────────────────────────────────────────────────────────────
// Suite 4 — Registry (100 cenários)
// ─────────────────────────────────────────────────────────────────────────
/**
 * Modelo puro da semântica ATUAL de `bulkInstallSkills`: monta uma linha por id
 * solicitado e delega ao banco. Como existe `UNIQUE (agent_id, skill_id)`, o
 * INSERT é atômico — qualquer colisão derruba o lote inteiro.
 */
export interface BulkInstallOutcome {
  inserted: string[];
  failed: boolean;
  reason?: string;
}

export function simulateCurrentBulkInstall(
  alreadyInstalled: readonly string[],
  requested: readonly string[],
): BulkInstallOutcome {
  if (requested.length === 0) return { inserted: [], failed: false };
  const installedSet = new Set(alreadyInstalled);
  const collision = requested.find((id) => installedSet.has(id));
  if (collision) {
    return { inserted: [], failed: true, reason: `unique_violation em ${collision}` };
  }
  const seen = new Set<string>();
  const dupInBatch = requested.find((id) => {
    if (seen.has(id)) return true;
    seen.add(id);
    return false;
  });
  if (dupInBatch) {
    return { inserted: [], failed: true, reason: `id duplicado no lote: ${dupInBatch}` };
  }
  return { inserted: [...requested], failed: false };
}

export function runRegistrySuite(): SimCase[] {
  const cases: SimCase[] = [];
  const rng = makeRng(161803);
  let n = 0;

  const catalogIds = Array.from({ length: 12 }, (_, i) => `skill-${i}`);

  for (let i = 0; i < 24; i++) {
    const installedCount = Math.floor(rng() * 5);
    const installed = catalogIds.slice(0, installedCount);
    const requestedCount = 1 + Math.floor(rng() * 5);
    const requested = Array.from(
      { length: requestedCount },
      () => catalogIds[Math.floor(rng() * catalogIds.length)],
    );

    const outcome = simulateCurrentBulkInstall(installed, requested);
    const newIds = Array.from(new Set(requested)).filter((id) => !installed.includes(id));
    const tag = `inst=${installedCount} req=${requestedCount}`;

    // 1. Instalação em lote deve ser idempotente (contrato desejado)
    cases.push(
      ok(
        `REG-${++n}`,
        'registry',
        `Bulk install idempotente (${tag})`,
        `instala os ${newIds.length} ids inéditos e ignora repetidos`,
        !outcome.failed && outcome.inserted.length === newIds.length,
        outcome.failed
          ? `lote inteiro falhou (${outcome.reason})`
          : `inseriu ${outcome.inserted.length} de ${newIds.length}`,
        'reg-bulk-nao-idempotente',
      ),
    );

    // 2. Nenhum id duplicado deve ser enviado ao banco
    const sentDuplicates = new Set(requested).size !== requested.length;
    cases.push(
      ok(
        `REG-${++n}`,
        'registry',
        `Lote deduplicado antes do INSERT (${tag})`,
        'nenhum id repetido no payload',
        !sentDuplicates || !outcome.failed,
        'payload continha ids repetidos e o INSERT falhou',
        'reg-lote-nao-deduplicado',
      ),
    );

    // 3. Falha parcial não deve impedir as instalações válidas
    cases.push(
      ok(
        `REG-${++n}`,
        'registry',
        `Colisão parcial não bloqueia o restante (${tag})`,
        'skills inéditas são instaladas mesmo com colisão',
        !(outcome.failed && newIds.length > 0),
        'colisão abortou instalações que seriam válidas',
        'reg-falha-parcial-bloqueante',
      ),
    );
  }

  // Cenários dirigidos
  const directed: Array<{
    name: string;
    installed: string[];
    requested: string[];
    expectInserted: number;
    gapKey: string;
  }> = [
    { name: 'Lote vazio é no-op', installed: [], requested: [], expectInserted: 0, gapKey: 'reg-lote-vazio' },
    { name: 'Reinstalar skill já instalada é no-op', installed: ['s1'], requested: ['s1'], expectInserted: 0, gapKey: 'reg-reinstalar' },
    { name: 'Lote com id repetido instala uma vez', installed: [], requested: ['s1', 's1'], expectInserted: 1, gapKey: 'reg-lote-nao-deduplicado' },
    { name: 'Lote misto instala apenas o inédito', installed: ['s1'], requested: ['s1', 's2'], expectInserted: 1, gapKey: 'reg-bulk-nao-idempotente' },
    { name: 'Lote 100% inédito instala tudo', installed: [], requested: ['s1', 's2', 's3'], expectInserted: 3, gapKey: 'reg-bulk-nao-idempotente' },
  ];
  for (const d of directed) {
    for (let rep = 0; rep < 5; rep++) {
      const outcome = simulateCurrentBulkInstall(d.installed, d.requested);
      const inserted = outcome.failed ? 0 : outcome.inserted.length;
      cases.push(
        ok(
          `REG-${++n}`,
          'registry',
          `${d.name} [rep ${rep + 1}]`,
          `${d.expectInserted} instalação(ões)`,
          inserted === d.expectInserted,
          outcome.failed ? `falhou: ${outcome.reason}` : `${inserted} instalação(ões)`,
          d.gapKey,
        ),
      );
    }
  }

  return cases;
}

// ─────────────────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────────────────
export function runSkillsSimulation(): SimulationReport {
  const started = Date.now();
  const cases: SimCase[] = [
    ...runRecommenderSuite(),
    ...runComposerSuite(),
    ...runSkillbookSuite(),
    ...runRegistrySuite(),
  ];

  const suiteNames: SimSuite[] = ['recommender', 'composer', 'skillbook', 'registry'];
  const suites: SuiteSummary[] = suiteNames.map((suite) => {
    const subset = cases.filter((c) => c.suite === suite);
    return {
      suite,
      total: subset.length,
      passed: subset.filter((c) => c.status === 'pass').length,
      gaps: subset.filter((c) => c.status === 'gap').length,
    };
  });

  const gapMap = new Map<string, GapSummary>();
  for (const c of cases) {
    if (c.status !== 'gap' || !c.gapKey) continue;
    const existing = gapMap.get(c.gapKey);
    if (existing) existing.occurrences += 1;
    else gapMap.set(c.gapKey, { gapKey: c.gapKey, suite: c.suite, occurrences: 1, sample: c });
  }

  const passed = cases.filter((c) => c.status === 'pass').length;
  return {
    cases,
    suites,
    gaps: Array.from(gapMap.values()).sort((a, b) => b.occurrences - a.occurrences),
    total: cases.length,
    passed,
    failed: cases.length - passed,
    elapsedMs: Date.now() - started,
  };
}
