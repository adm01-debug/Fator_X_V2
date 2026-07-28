/**
 * Skill Library Service — visão consolidada do pipeline da biblioteca de skills.
 *
 * Estratégia de leitura: usamos contagens `head: true` (COUNT sem payload) para
 * cada faceta do pipeline. É deliberadamente mais chamadas e menos bytes do que
 * baixar o catálogo inteiro no cliente — o registry passa de milhares de linhas
 * (import de vendas trouxe ~800 de uma vez) e materializar tudo só para contar
 * seria desperdício de banda e memória.
 */

import { supabaseExternal } from '@/integrations/supabase/externalClient';

/**
 * Origem da classificação de departamento, agregada para leitura humana.
 *
 * O banco grava rótulos mais granulares (`lexical` legado, `heuristic`,
 * `platform_heuristic`, `llm`, `human`, `unknown`). Agrupamos aqui porque o
 * card de status responde a "quem decidiu isso?", não a "qual versão do motor
 * decidiu". `heuristic` cobre o léxico determinístico (incluindo o rótulo
 * legado `lexical`) e `platform` isola o tier de jargão de plataforma, que é
 * deliberadamente de baixa confiança e vive na fila de revisão.
 */
export type DepartmentSource = 'heuristic' | 'platform' | 'llm' | 'human';


export interface SkillLibraryOverview {
  /** Total de skills públicas no catálogo. */
  total: number;
  /** Skills com `source_repo` preenchido → vieram do Harvester (GitHub). */
  harvested: number;
  /** Skills criadas internamente (sem origem externa) → Composer. */
  authored: number;
  /** Skills marcadas como verificadas pela curadoria. */
  verified: number;
  /** Soma de instalações reportadas pelo catálogo. */
  installs: number;
  /** Distribuição por origem da classificação. */
  bySource: Record<DepartmentSource, number>;
  /** Sem departamento atribuído — fila "Sem depto.". */
  unclassified: number;
  /** Classificadas por máquina com confiança abaixo do limiar de revisão. */
  needsReview: number;
}

/** Limiar abaixo do qual a classificação automática pede revisão humana. */
export const REVIEW_CONFIDENCE_THRESHOLD = 0.5;

/** Conta linhas de `skill_registry` aplicando um recorte, sem trazer payload. */
async function countSkills(
  apply: (q: ReturnType<typeof baseCountQuery>) => ReturnType<typeof baseCountQuery>,
): Promise<number> {
  const { count, error } = await apply(baseCountQuery());
  if (error) throw error;
  return count ?? 0;
}

function baseCountQuery() {
  return supabaseExternal
    .from('skill_registry')
    .select('id', { count: 'exact', head: true })
    .eq('is_public', true);
}

/**
 * Monta o panorama do pipeline. As contagens rodam em paralelo porque são
 * independentes; uma falha isolada derruba a query inteira de propósito — um
 * painel de governança com números parciais é pior que um painel com erro.
 */
export async function fetchSkillLibraryOverview(): Promise<SkillLibraryOverview> {
  const [
    total,
    harvested,
    verified,
    lexical,
    llm,
    human,
    unclassified,
    needsReview,
    installsRows,
  ] = await Promise.all([
    countSkills((q) => q),
    countSkills((q) => q.not('source_repo', 'is', null)),
    countSkills((q) => q.eq('is_verified', true)),
    countSkills((q) => q.eq('department_source', 'lexical')),
    countSkills((q) => q.eq('department_source', 'llm')),
    countSkills((q) => q.eq('department_source', 'human')),
    countSkills((q) => q.is('department', null)),
    countSkills((q) =>
      q.lt('department_confidence', REVIEW_CONFIDENCE_THRESHOLD).neq('department_source', 'human'),
    ),
    supabaseExternal
      .from('skill_registry')
      .select('install_count')
      .eq('is_public', true)
      .gt('install_count', 0)
      .limit(1000),
  ]);

  if (installsRows.error) throw installsRows.error;
  const installs = (installsRows.data ?? []).reduce<number>((acc, row) => {
    const value = (row as { install_count: number | null }).install_count;
    return acc + (typeof value === 'number' && Number.isFinite(value) ? value : 0);
  }, 0);

  return {
    total,
    harvested,
    // Nunca deixamos negativo: `total` e `harvested` vêm de round-trips
    // distintas e podem divergir se um harvest concluir no meio da leitura.
    authored: Math.max(0, total - harvested),
    verified,
    installs,
    bySource: { lexical, llm, human },
    unclassified,
    needsReview,
  };
}

/** Percentual seguro (0..100) — evita NaN quando o catálogo está vazio. */
export function share(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(100, Math.max(0, (part / total) * 100));
}

/**
 * Saúde da curadoria: proporção de skills com departamento confiável.
 * Retorna `null` quando não há catálogo — melhor omitir do que exibir "0%",
 * que seria lido como falha de curadoria em vez de ausência de dados.
 */
export function curationHealth(overview: SkillLibraryOverview): number | null {
  if (overview.total <= 0) return null;
  const pending = overview.unclassified + overview.needsReview;
  return Math.round(share(Math.max(0, overview.total - pending), overview.total));
}
