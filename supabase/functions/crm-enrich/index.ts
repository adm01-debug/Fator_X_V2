/**
 * crm-enrich — Enriquecimento cascata de empresas do CRM.
 *
 * Por que cascata: cada camada é mais cara e menos confiável que a anterior,
 * então só rodamos a seguinte quando a anterior não resolveu o sinal.
 *
 *   1. Determinístico — deriva o domínio a partir dos e-mails corporativos dos
 *      contatos e o país a partir do TLD. Custo zero, precisão alta.
 *   2. Heurística     — classifica setor por palavras-chave no nome/domínio.
 *      Custo zero, precisão média, totalmente auditável.
 *   3. LLM            — só para empresas que sobraram sem setor. Custo por
 *      chamada, então roda em lote único e com teto rígido.
 *
 * O que NÃO fazemos: sobrescrever dado existente. Enriquecimento preenche
 * lacunas; um valor confirmado pelo time sempre vence a inferência.
 */
import {
  authenticateRequest,
  checkRateLimit,
  createAdminClient,
  createRateLimitResponse,
  errorResponse,
  getRateLimitIdentifier,
  handleCorsPreflight,
  jsonResponse,
  parseBody,
  RATE_LIMITS,
  validateWorkspaceMembership,
  z,
} from '../_shared/mod.ts';

const EnrichInput = z.object({
  workspace_id: z.string().uuid(),
  /** Teto de empresas por execução — protege custo de LLM e tempo de resposta. */
  limit: z.number().int().min(1).max(200).default(50),
  /** Desliga a camada 3 quando o operador quer apenas o gratuito. */
  use_llm: z.boolean().default(true),
  company_ids: z.array(z.string().uuid()).max(200).optional(),
});

/** Provedores pessoais nunca identificam a empresa — descartá-los evita "gmail.com" como domínio. */
const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'hotmail.com',
  'outlook.com',
  'yahoo.com',
  'yahoo.com.br',
  'icloud.com',
  'live.com',
  'bol.com.br',
  'uol.com.br',
  'terra.com.br',
  'proton.me',
  'protonmail.com',
  'aol.com',
  'msn.com',
  'me.com',
]);

const TLD_COUNTRY: Record<string, string> = {
  br: 'BR',
  pt: 'PT',
  ar: 'AR',
  mx: 'MX',
  cl: 'CL',
  co: 'CO',
  uk: 'GB',
  de: 'DE',
  fr: 'FR',
  es: 'ES',
  it: 'IT',
  us: 'US',
  ca: 'CA',
};

/** Palavras-chave em PT-BR e EN — o CRM tem dados nos dois idiomas. */
const INDUSTRY_KEYWORDS: Array<[string, string[]]> = [
  [
    'Tecnologia da Informação',
    ['tech', 'software', 'digital', 'sistemas', 'ti ', 'cloud', 'dev', 'data', 'app', 'cyber'],
  ],
  [
    'Saúde',
    [
      'saude',
      'saúde',
      'health',
      'clinica',
      'clínica',
      'hospital',
      'medic',
      'farma',
      'odonto',
      'lab',
    ],
  ],
  [
    'Educação',
    [
      'educa',
      'escola',
      'colegio',
      'colégio',
      'faculdade',
      'universidade',
      'ensino',
      'curso',
      'school',
    ],
  ],
  [
    'Finanças',
    [
      'banco',
      'financ',
      'credito',
      'crédito',
      'invest',
      'capital',
      'seguros',
      'pagamento',
      'fintech',
      'bank',
    ],
  ],
  [
    'Varejo',
    ['varejo', 'loja', 'store', 'shop', 'comercio', 'comércio', 'market', 'retail', 'magazine'],
  ],
  [
    'Indústria',
    [
      'industria',
      'indústria',
      'metal',
      'quimic',
      'químic',
      'fabrica',
      'fábrica',
      'manufatur',
      'usina',
    ],
  ],
  [
    'Construção',
    ['construtora', 'construc', 'construç', 'engenharia', 'empreiteira', 'incorporadora'],
  ],
  [
    'Logística',
    ['logistic', 'logístic', 'transporte', 'frete', 'express', 'cargo', 'distribuidora'],
  ],
  ['Agronegócio', ['agro', 'fazenda', 'rural', 'graos', 'grãos', 'pecuar', 'pecuár', 'farm']],
  ['Jurídico', ['advocacia', 'advogados', 'juridic', 'jurídic', 'law', 'legal']],
  [
    'Marketing',
    [
      'marketing',
      'publicidade',
      'agencia',
      'agência',
      'midia',
      'mídia',
      'comunicac',
      'comunicaç',
      'branding',
    ],
  ],
  ['Serviços', ['consultoria', 'servic', 'serviç', 'assessoria', 'consulting']],
];

interface CompanyRow {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  size_band: string | null;
  country: string | null;
  enrichment_json: Record<string, unknown> | null;
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Camada 1 — domínio corporativo a partir dos e-mails dos contatos vinculados. */
function deriveDomain(emails: string[]): string | null {
  const tally = new Map<string, number>();
  for (const email of emails) {
    const domain = email.split('@')[1]?.trim().toLowerCase();
    if (!domain || FREE_EMAIL_DOMAINS.has(domain)) continue;
    tally.set(domain, (tally.get(domain) ?? 0) + 1);
  }
  // Empate é resolvido pelo mais frequente; a ordem de inserção decide o resto.
  let best: string | null = null;
  let bestCount = 0;
  for (const [domain, count] of tally) {
    if (count > bestCount) {
      best = domain;
      bestCount = count;
    }
  }
  return best;
}

function deriveCountry(domain: string | null): string | null {
  if (!domain) return null;
  const parts = domain.split('.');
  const tld = parts[parts.length - 1];
  return TLD_COUNTRY[tld] ?? null;
}

/** Camada 2 — classificação por palavra-chave. Determinística e explicável. */
function guessIndustry(name: string, domain: string | null): string | null {
  const haystack = normalize(`${name} ${domain ?? ''}`);
  for (const [industry, keywords] of INDUSTRY_KEYWORDS) {
    if (keywords.some((kw) => haystack.includes(normalize(kw)))) return industry;
  }
  return null;
}

const KNOWN_INDUSTRIES = INDUSTRY_KEYWORDS.map(([industry]) => industry);

/**
 * Camada 3 — LLM em lote único.
 *
 * Falha aqui é degradação, não erro: as camadas 1 e 2 já foram persistidas e o
 * setor continua nulo até a próxima execução. Por isso o catch devolve {}.
 */
async function classifyWithLlm(
  companies: Array<{ id: string; name: string; domain: string | null }>,
): Promise<Record<string, string>> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey || companies.length === 0) return {};

  const prompt = [
    'Classifique cada empresa em EXATAMENTE um destes setores:',
    KNOWN_INDUSTRIES.join(', ') + ', Outros.',
    'Responda apenas JSON no formato {"<id>": "<setor>"}.',
    '',
    ...companies.map((c) => `${c.id} :: ${c.name}${c.domain ? ` (${c.domain})` : ''}`),
  ].join('\n');

  try {
    const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'Você classifica empresas por setor. Responda somente JSON válido.',
          },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    if (!resp.ok) {
      console.error('crm-enrich llm status', resp.status);
      return {};
    }
    const body = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = body.choices?.[0]?.message?.content;
    if (!content) return {};
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [id, value] of Object.entries(parsed)) {
      // Só aceitamos rótulos do vocabulário fechado — LLM não define taxonomia.
      if (typeof value === 'string' && KNOWN_INDUSTRIES.includes(value)) out[id] = value;
    }
    return out;
  } catch (err) {
    console.error('crm-enrich llm falhou', err);
    return {};
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req);
  if (req.method !== 'POST') return errorResponse(req, 'Método não permitido', 405);

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return auth.error;
    const { user } = auth;

    const rate = await checkRateLimit(getRateLimitIdentifier(req, user.id), RATE_LIMITS.heavy);
    if (!rate.allowed) return createRateLimitResponse(rate);

    const parsed = await parseBody(req, EnrichInput);
    if (parsed.error) return parsed.error;
    const { workspace_id, limit, use_llm, company_ids } = parsed.data;

    const admin = createAdminClient();
    // O workspace vem do cliente: sem esta checagem, enriqueceríamos dados alheios.
    const isMember = await validateWorkspaceMembership(admin, user.id, workspace_id);
    if (!isMember) return errorResponse(req, 'Sem acesso a este workspace', 403);

    let query = admin
      .from('crm_companies')
      .select('id, name, domain, industry, size_band, country, enrichment_json')
      .eq('workspace_id', workspace_id)
      .is('deleted_at', null)
      .limit(limit);
    if (company_ids?.length) query = query.in('id', company_ids);
    else query = query.or('domain.is.null,industry.is.null,country.is.null');

    const { data: companyData, error: companyError } = await query;
    if (companyError) throw companyError;
    const companies = (companyData ?? []) as CompanyRow[];

    if (companies.length === 0) {
      return jsonResponse(req, {
        ok: true,
        evaluated: 0,
        updated: 0,
        layers: { deterministic: 0, heuristic: 0, llm: 0 },
      });
    }

    // Uma leitura de contatos para todas as empresas — evita N+1 no lote.
    const { data: contactData, error: contactError } = await admin
      .from('crm_contacts')
      .select('company_id, email')
      .eq('workspace_id', workspace_id)
      .is('deleted_at', null)
      .in(
        'company_id',
        companies.map((c) => c.id),
      )
      .not('email', 'is', null)
      .limit(5000);
    if (contactError) throw contactError;

    const emailsByCompany = new Map<string, string[]>();
    for (const row of (contactData ?? []) as Array<{
      company_id: string | null;
      email: string | null;
    }>) {
      if (!row.company_id || !row.email) continue;
      const list = emailsByCompany.get(row.company_id) ?? [];
      list.push(row.email);
      emailsByCompany.set(row.company_id, list);
    }

    const layers = { deterministic: 0, heuristic: 0, llm: 0 };
    const patches = new Map<string, Record<string, unknown>>();
    const needsLlm: Array<{ id: string; name: string; domain: string | null }> = [];

    for (const company of companies) {
      const patch: Record<string, unknown> = {};
      const sources: string[] = [];

      const domain = company.domain ?? deriveDomain(emailsByCompany.get(company.id) ?? []);
      if (!company.domain && domain) {
        patch.domain = domain;
        sources.push('email_domain');
        layers.deterministic++;
      }

      if (!company.country) {
        const country = deriveCountry(domain);
        if (country) {
          patch.country = country;
          sources.push('tld');
          layers.deterministic++;
        }
      }

      if (!company.industry) {
        const industry = guessIndustry(company.name, domain);
        if (industry) {
          patch.industry = industry;
          sources.push('keyword');
          layers.heuristic++;
        } else if (use_llm) {
          needsLlm.push({ id: company.id, name: company.name, domain });
        }
      }

      if (Object.keys(patch).length > 0) {
        patch.enrichment_json = {
          ...(company.enrichment_json ?? {}),
          enriched_at: new Date().toISOString(),
          sources,
        };
        patches.set(company.id, patch);
      }
    }

    if (needsLlm.length > 0) {
      const classified = await classifyWithLlm(needsLlm);
      for (const [id, industry] of Object.entries(classified)) {
        const existing = patches.get(id) ?? {};
        const previousSources =
          (existing.enrichment_json as { sources?: string[] } | undefined)?.sources ?? [];
        patches.set(id, {
          ...existing,
          industry,
          enrichment_json: {
            ...(companies.find((c) => c.id === id)?.enrichment_json ?? {}),
            enriched_at: new Date().toISOString(),
            sources: [...previousSources, 'llm'],
          },
        });
        layers.llm++;
      }
    }

    let updated = 0;
    for (const [id, patch] of patches) {
      const { error } = await admin
        .from('crm_companies')
        .update(patch)
        .eq('id', id)
        .eq('workspace_id', workspace_id);
      if (error) {
        // Uma empresa problemática não invalida o lote inteiro.
        console.error('crm-enrich update falhou', id, error.message);
        continue;
      }
      updated++;
    }

    await admin.from('crm_activities').insert({
      workspace_id,
      activity_type: 'system',
      source: 'crm-enrich',
      body: `Enriquecimento concluído: ${updated} empresa(s) atualizada(s)`,
      metadata: { evaluated: companies.length, updated, layers, actor: user.id },
      actor_id: user.id,
    });

    return jsonResponse(req, { ok: true, evaluated: companies.length, updated, layers });
  } catch (error) {
    console.error('crm-enrich error', error);
    return errorResponse(req, error instanceof Error ? error.message : 'Erro interno', 500);
  }
});
