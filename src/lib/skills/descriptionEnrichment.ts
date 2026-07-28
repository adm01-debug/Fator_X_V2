/**
 * Enriquecimento de descrições vazias — regras puras de decisão.
 *
 * Contexto: o harvester promove skills a partir de repositórios públicos. Uma
 * fatia delas chega ao Registry com `description = ''` porque o repositório não
 * trazia texto aproveitável. Skill sem descrição é invisível na busca e inútil
 * para o recomendador: existe no banco e não existe para o usuário.
 *
 * Este módulo NÃO fala com rede nem com banco. Ele responde a três perguntas,
 * e são exatamente as três onde um erro é caro:
 *
 *  1. **Quem é elegível?** Só o que veio de importação e cuja descrição atual
 *     não é texto humano. Sobrescrever curadoria manual é dano irreversível.
 *  2. **O texto gerado presta?** Tamanho, idioma plausível e — o modo de falha
 *     real — se não é apenas o nome da skill parafraseado.
 *  3. **Aplica ou manda revisar?** Alta confiança grava direto; o resto vira
 *     sugestão. O limiar do cliente é conveniência; a RPC revalida no servidor.
 *
 * Por ser puro, o comportamento é verificável por simulação exaustiva sem
 * mocks de rede — ver `src/test/skill-description-enrichment.test.ts`.
 */

/**
 * Piso para gravar automaticamente.
 *
 * Espelha o piso da RPC `apply_skill_description`. Duplicado de propósito:
 * aqui evita a ida ao servidor para um pedido que seria recusado; lá é a
 * garantia real, porque um cliente adulterado não é uma autoridade.
 */
export const MIN_ENRICH_CONFIDENCE = 0.75;

/** Abaixo disto a sugestão nem chega ao curador — é ruído. */
export const MIN_SUGGEST_CONFIDENCE = 0.4;

/** Limites de tamanho — espelham o CHECK da RPC. */
export const MIN_DESCRIPTION_LENGTH = 40;
export const MAX_DESCRIPTION_LENGTH = 600;

/**
 * Descrições que existem mas não informam nada. Sem esta lista, `length > 0`
 * bastaria para bloquear o enriquecimento — e a skill ficaria presa para
 * sempre com "TODO" no catálogo.
 */
const PLACEHOLDERS = new Set([
  'todo',
  'tbd',
  'n/a',
  'na',
  'sem descricao',
  'sem descrição',
  'no description',
  'no description provided',
  'description',
  'descricao',
  'descrição',
  'wip',
  '-',
  '--',
  '...',
]);

/** Procedência da descrição, espelhando o CHECK da coluna no banco. */
export type DescriptionSource = 'humano' | 'repositorio' | 'ia';

export function isDescriptionSource(value: unknown): value is DescriptionSource {
  return value === 'humano' || value === 'repositorio' || value === 'ia';
}

export interface EnrichCandidate {
  skillId: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  department: string | null;
  tags: string[];
  sourceRepo: string | null;
  sourceUrl: string | null;
  descriptionSource: DescriptionSource | null;
}

/** Normaliza para comparação: sem acento, sem pontuação, minúsculo. */
export function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** `true` quando o texto atual é vazio ou um marcador sem informação. */
export function isDescriptionEmpty(description: string | null | undefined): boolean {
  const t = (description ?? '').trim();
  if (t.length === 0) return true;
  return PLACEHOLDERS.has(fold(t));
}

export type IneligibleReason =
  | 'nao_importada'
  | 'ja_descrita'
  | 'descricao_humana';

/**
 * Decide se a skill pode receber uma descrição gerada.
 *
 * A ordem das checagens é a ordem da gravidade: `descricao_humana` é verificada
 * mesmo com texto em branco porque um curador pode ter esvaziado a descrição
 * de propósito, e a automação não deve desfazer essa decisão.
 */
export function eligibilityReason(candidate: EnrichCandidate): IneligibleReason | null {
  // Só automatizamos o que foi importado. Skills criadas na plataforma têm dono
  // humano — gerar texto por cima seria a automação opinando sobre autoria.
  if (!candidate.sourceRepo && !candidate.sourceUrl) return 'nao_importada';
  if (candidate.descriptionSource === 'humano') return 'descricao_humana';
  if (!isDescriptionEmpty(candidate.description)) return 'ja_descrita';
  return null;
}

export function isEligible(candidate: EnrichCandidate): boolean {
  return eligibilityReason(candidate) === null;
}

export function selectEligible(candidates: readonly EnrichCandidate[]): EnrichCandidate[] {
  return candidates.filter(isEligible);
}

/**
 * Mede o sinal textual disponível ANTES de chamar o modelo.
 *
 * Sem isto, cada slug sem contexto viraria uma chamada de LLM cujo melhor
 * resultado possível é um eco do nome. Em um lote de harvest isso é a maior
 * parte do custo, e todo ele desperdiçado.
 */
export function hasEnoughSignal(candidate: EnrichCandidate): boolean {
  const tags = candidate.tags.filter((t) => t.trim().length > 0);
  const repo = (candidate.sourceRepo ?? '').trim();
  return tags.length > 0 || repo.length > 0;
}

// ============================================================================
// Validação do texto gerado
// ============================================================================

export type RejectionReason =
  | 'vazia'
  | 'curta'
  | 'longa'
  | 'eco'
  | 'confianca_baixa'
  | 'insuficiente';

export const REJECTION_LABEL: Record<RejectionReason, string> = {
  vazia: 'O modelo não produziu texto.',
  curta: 'Descrição curta demais para ser útil.',
  longa: 'Descrição longa demais para o catálogo.',
  eco: 'A descrição apenas repete o nome da skill.',
  confianca_baixa: 'Confiança abaixo do mínimo para sugerir.',
  insuficiente: 'Material insuficiente para descrever a skill.',
};

/**
 * Muletas que aparecem em qualquer descrição e não contam como informação
 * nova ao comparar o texto com o nome da skill.
 */
const STOPWORDS = new Set([
  'skill', 'para', 'de', 'do', 'da', 'com', 'que', 'uma', 'um', 'o', 'a', 'e',
  'em', 'no', 'na', 'ferramenta', 'permite', 'usada', 'usado', 'agente',
]);

/** Mínimo de palavras informativas além do nome/slug. */
export const MIN_NOVEL_WORDS = 5;

/**
 * Detecta a paráfrase do próprio nome ("Skill para pdf-extract.").
 *
 * Este é o modo de falha dominante quando o único sinal é o slug. Passa em
 * qualquer checagem de tamanho e é PIOR que o vazio: parece conteúdo, então
 * ninguém volta para revisá-lo.
 *
 * Mantido em paridade com `supabase/functions/skill-describe-llm/index.ts`
 * (Deno não importa de `src/`) — ver o teste de paridade.
 */
export function isEcho(description: string, name: string, slug: string): boolean {
  const d = fold(description);
  const alvos = [fold(name), fold(slug)].filter((t) => t.length >= 3);
  if (alvos.length === 0) return false;
  const nomeTokens = new Set(alvos.flatMap((t) => t.split(' ')));
  const novas = d
    .split(' ')
    .filter((w) => w.length > 2 && !nomeTokens.has(w) && !STOPWORDS.has(w));
  return novas.length < MIN_NOVEL_WORDS;
}

/** Resposta bruta da Edge Function `skill-describe-llm`. */
export interface DescriptionVerdict {
  skill_id: string;
  description: string;
  confidence: number;
  model: string;
  sufficient: boolean;
  rationale: string;
}

export interface DescriptionProposal {
  skillId: string;
  slug: string;
  name: string;
  description: string;
  confidence: number;
  model: string;
  rationale: string;
  /** `true` quando a confiança autoriza gravação automática. */
  autoApply: boolean;
}

export interface RejectedProposal {
  skillId: string;
  slug: string;
  reason: RejectionReason;
  confidence: number;
}

/**
 * Converte o veredito do modelo em proposta, ou explica a recusa.
 *
 * Devolve um par em vez de `null` porque "por que esta skill continuou vazia?"
 * é a pergunta que o curador faz depois de rodar o lote. Um `null` mudo
 * transformaria a resposta em arqueologia de logs.
 */
export function proposalFromVerdict(
  candidate: EnrichCandidate,
  verdict: DescriptionVerdict,
): { proposal: DescriptionProposal | null; rejection: RejectedProposal | null } {
  const slug = candidate.slug || candidate.skillId;
  const conf = Number.isFinite(verdict.confidence)
    ? Math.min(1, Math.max(0, verdict.confidence))
    : 0;

  const reject = (reason: RejectionReason) => ({
    proposal: null,
    rejection: { skillId: candidate.skillId, slug, reason, confidence: conf },
  });

  if (!verdict.sufficient) return reject('insuficiente');

  const texto = (verdict.description ?? '').trim();
  if (texto.length === 0) return reject('vazia');
  if (texto.length < MIN_DESCRIPTION_LENGTH) return reject('curta');
  if (texto.length > MAX_DESCRIPTION_LENGTH) return reject('longa');
  if (isEcho(texto, candidate.name, candidate.slug)) return reject('eco');
  if (conf < MIN_SUGGEST_CONFIDENCE) return reject('confianca_baixa');

  return {
    proposal: {
      skillId: candidate.skillId,
      slug,
      name: candidate.name,
      description: texto,
      confidence: Number(conf.toFixed(3)),
      model: verdict.model || '',
      rationale: verdict.rationale ?? '',
      autoApply: conf >= MIN_ENRICH_CONFIDENCE,
    },
    rejection: null,
  };
}

/** Propostas que podem ser gravadas sem revisão humana. */
export function autoApplicable(
  proposals: readonly DescriptionProposal[],
): DescriptionProposal[] {
  return proposals.filter((p) => p.autoApply && p.confidence >= MIN_ENRICH_CONFIDENCE);
}

/** Propostas que precisam de olho humano antes de virar catálogo. */
export function needsReview(
  proposals: readonly DescriptionProposal[],
): DescriptionProposal[] {
  return proposals.filter((p) => !p.autoApply || p.confidence < MIN_ENRICH_CONFIDENCE);
}

/** Exportação para auditoria da rodada. */
export function proposalsToCsv(proposals: readonly DescriptionProposal[]): string {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const linhas = [
    ['slug', 'nome', 'confianca', 'auto_aplicavel', 'modelo', 'descricao'].join(','),
    ...proposals.map((p) =>
      [
        escape(p.slug),
        escape(p.name),
        p.confidence.toFixed(3),
        p.autoApply ? 'sim' : 'nao',
        escape(p.model),
        escape(p.description),
      ].join(','),
    ),
  ];
  return linhas.join('\n');
}
