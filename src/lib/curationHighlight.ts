/**
 * Destaque temporário das linhas recém-chegadas no feed de curadoria.
 *
 * Por que existe: quando o curador clica em "N novidades — atualizar", o feed
 * recarrega e as linhas novas entram misturadas às antigas, na ordem
 * cronológica. Sem marcação visual, ele precisa reler o bloco inteiro para
 * descobrir o que mudou — exatamente o trabalho que o aviso de novidades
 * pretendia poupar.
 *
 * Por que com expiração: o destaque é um sinal de transição, não um estado.
 * Se persistisse, ele se acumularia e passaria a mentir sobre o que é "novo".
 *
 * Módulo puro e sem dependência de relógio implícito (`agora` é sempre
 * parâmetro): assim a lógica é simulável sem timers falsos e sem flakiness.
 */

/** Janela de destaque. Longa o bastante para ser notada, curta para não virar estado. */
export const CURATION_HIGHLIGHT_TTL_MS = 8_000;

/**
 * Teto de linhas destacadas simultaneamente. Acima disso o realce deixa de
 * distinguir qualquer coisa (tudo destacado = nada destacado) e ainda segura
 * memória à toa na aba.
 */
export const CURATION_HIGHLIGHT_CAP = 99;

/** Mapa imutável chave → instante de expiração (epoch ms). */
export type CurationHighlightMap = ReadonlyMap<string, number>;

/** Mapa vazio compartilhado: evita alocar um Map novo no caminho "nada a fazer". */
export const EMPTY_HIGHLIGHTS: CurationHighlightMap = new Map();

/**
 * Identidade estável de uma linha do feed. Precisa ser idêntica à chave usada
 * pelo acumulador de pendentes — é assim que o que foi contado vira o que é
 * destacado.
 */
export function highlightKey(templateId: string, skillId: string): string {
  return `${templateId}::${skillId}`;
}

/**
 * Abre a janela de destaque para um conjunto de chaves.
 *
 * Substitui o mapa anterior em vez de mesclar: o clique em "atualizar" delimita
 * um novo recorte de novidades, e manter destaques de um ciclo antigo faria a
 * tela apontar como recente algo que o curador já viu.
 */
export function beginHighlight(
  chaves: Iterable<string>,
  agora: number,
  ttlMs: number = CURATION_HIGHLIGHT_TTL_MS,
): CurationHighlightMap {
  if (!Number.isFinite(agora) || !Number.isFinite(ttlMs) || ttlMs <= 0) return EMPTY_HIGHLIGHTS;

  const expiraEm = agora + ttlMs;
  const mapa = new Map<string, number>();
  for (const chave of chaves) {
    if (typeof chave !== 'string' || chave.length === 0) continue;
    if (mapa.size >= CURATION_HIGHLIGHT_CAP) break;
    mapa.set(chave, expiraEm);
  }
  return mapa.size === 0 ? EMPTY_HIGHLIGHTS : mapa;
}

/**
 * Remove destaques expirados.
 *
 * **Identity-preserving de propósito**: quando nada expirou, devolve
 * exatamente o mesmo mapa, para que o tick periódico não force re-render do
 * painel inteiro a cada segundo.
 */
export function pruneHighlights(
  mapa: CurationHighlightMap,
  agora: number,
): CurationHighlightMap {
  if (mapa.size === 0) return mapa;
  if (!Number.isFinite(agora)) return mapa;

  let expirou = false;
  for (const expiraEm of mapa.values()) {
    if (expiraEm <= agora) {
      expirou = true;
      break;
    }
  }
  if (!expirou) return mapa;

  const proximo = new Map<string, number>();
  for (const [chave, expiraEm] of mapa) {
    if (expiraEm > agora) proximo.set(chave, expiraEm);
  }
  return proximo.size === 0 ? EMPTY_HIGHLIGHTS : proximo;
}

/** Um destaque vale enquanto sua expiração for estritamente futura. */
export function isHighlighted(
  mapa: CurationHighlightMap,
  chave: string,
  agora: number,
): boolean {
  const expiraEm = mapa.get(chave);
  if (expiraEm === undefined) return false;
  if (!Number.isFinite(agora)) return false;
  return expiraEm > agora;
}

/** Quantas linhas ainda estão destacadas neste instante. */
export function countHighlighted(mapa: CurationHighlightMap, agora: number): number {
  let total = 0;
  for (const expiraEm of mapa.values()) {
    if (expiraEm > agora) total += 1;
  }
  return total;
}
