/**
 * Realtime do feed de curadoria (template ↔ skill).
 *
 * Por que um predicado puro separado do hook: a tabela recebe muito mais
 * escrita automática (origin = 'auto', recálculo em lote) do que curadoria
 * manual. Invalidar a query a cada evento faria o painel refetchar dezenas de
 * vezes durante um recálculo — o predicado descarta o ruído antes de tocar o
 * cache, e por ser puro é simulável sem WebSocket.
 */
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabaseExternal } from '@/integrations/supabase/externalClient';
import { logger } from '@/lib/logger';
import type { CurationFeedFilter } from '@/services/templateSkillLinkService';

/** Formato mínimo da linha que o predicado precisa enxergar. */
export interface CurationRealtimeRow {
  origin?: string | null;
  deleted_at?: string | null;
  template_id?: string | null;
  skill_id?: string | null;
}

export interface CurationRealtimeEvent {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new?: CurationRealtimeRow | null;
  old?: CurationRealtimeRow | null;
}

/**
 * Decide se um evento de mudança deve invalidar o feed do filtro ativo.
 *
 * Regras:
 *  - Só curadoria manual importa (`origin = 'manual'` em qualquer um dos lados;
 *    num UPDATE que troca a origem, os dois lados são considerados).
 *  - `unlinked` só reage quando algum dos lados está removido.
 *  - `linked` só reage quando algum dos lados está ativo.
 *  - Linhas sem identidade (sem template ou skill) são ignoradas: não há como
 *    posicioná-las no feed, então não justificam um refetch.
 */
export function shouldRefreshCurationFeed(
  evento: CurationRealtimeEvent,
  filtro: CurationFeedFilter,
): boolean {
  const lados = [evento.new, evento.old].filter((lado): lado is CurationRealtimeRow =>
    Boolean(lado),
  );
  if (lados.length === 0) return false;

  // DELETE físico só traz `old`; INSERT só traz `new`. Ambos são válidos.
  const manual = lados.some((lado) => lado.origin === 'manual');
  if (!manual) return false;

  const identificavel = lados.some((lado) => Boolean(lado.template_id && lado.skill_id));
  if (!identificavel) return false;

  if (filtro === 'unlinked') return lados.some((lado) => Boolean(lado.deleted_at));
  if (filtro === 'linked') return lados.some((lado) => !lado.deleted_at);
  return true;
}

/** Teto de acumulação: acima disso o número deixa de informar e vira ruído. */
export const CURATION_PENDING_CAP = 99;

/** Identidade estável de uma linha no feed: a dupla (template, skill). */
function chaveDoEvento(evento: CurationRealtimeEvent): string | null {
  for (const lado of [evento.new, evento.old]) {
    if (lado?.template_id && lado?.skill_id) return `${lado.template_id}::${lado.skill_id}`;
  }
  return null;
}

/**
 * Acumula novidades pendentes sem tocar no cache.
 *
 * Por que não invalidar direto: invalidar puxa o conteúdo de baixo do cursor
 * de leitura do curador e reinicia a paginação infinita — o item que ele
 * estava lendo salta de posição. Acumular e deixar a atualização a cargo de um
 * clique preserva a posição de leitura e o contexto.
 *
 * Função pura e **identity-preserving**: quando o evento é irrelevante ou
 * repetido, devolve exatamente o mesmo Set, para que o React não re-renderize
 * o painel durante um recálculo automático em lote.
 */
export function applyCurationPendingEvent(
  pendentes: ReadonlySet<string>,
  evento: CurationRealtimeEvent,
  filtro: CurationFeedFilter,
): ReadonlySet<string> {
  if (!shouldRefreshCurationFeed(evento, filtro)) return pendentes;

  const chave = chaveDoEvento(evento);
  if (!chave) return pendentes;
  if (pendentes.has(chave)) return pendentes;
  // Saturado: o rótulo já mostra "99+", contar mais não muda a tela.
  if (pendentes.size >= CURATION_PENDING_CAP) return pendentes;

  const proximo = new Set(pendentes);
  proximo.add(chave);
  return proximo;
}

/** Rótulo PT-BR do aviso de novidades. */
export function formatPendingLabel(total: number): string | null {
  if (!Number.isFinite(total) || total <= 0) return null;
  if (total >= CURATION_PENDING_CAP) return '99+ novidades';
  return total === 1 ? '1 novidade' : `${total} novidades`;
}

/** Ordem canônica dos recortes. Fonte única para iteração e para os testes. */
export const CURATION_FILTERS: readonly CurationFeedFilter[] = ['all', 'linked', 'unlinked'];

/** Contagem de novidades pendentes por recorte, avaliada em paralelo. */
export type CurationPendingByFilter = Readonly<Record<CurationFeedFilter, ReadonlySet<string>>>;

const CONJUNTO_VAZIO: ReadonlySet<string> = new Set();

/** Estado inicial compartilhado: nada pendente em nenhum recorte. */
export const EMPTY_PENDING_BY_FILTER: CurationPendingByFilter = Object.freeze({
  all: CONJUNTO_VAZIO,
  linked: CONJUNTO_VAZIO,
  unlinked: CONJUNTO_VAZIO,
});

/**
 * Acumula o evento em **todos** os recortes onde ele é relevante.
 *
 * Por que contar em paralelo: com uma contagem única, trocar de filtro obrigava
 * a zerar o acumulado — os eventos tinham sido avaliados contra o recorte
 * anterior. O curador que alternava "Vínculos" ↔ "Remoções" perdia o rastro do
 * que havia chegado. Avaliando o mesmo evento contra os três predicados de uma
 * vez, cada aba carrega sua própria contagem e nada se perde na troca.
 *
 * **Identity-preserving em dois níveis**: se nenhum recorte mudou, devolve o
 * mesmo objeto; os recortes que não mudaram mantêm o mesmo `Set`. Sem isso um
 * recálculo automático em lote re-renderizaria o painel a cada linha.
 */
export function applyCurationPendingEventByFilter(
  estado: CurationPendingByFilter,
  evento: CurationRealtimeEvent,
): CurationPendingByFilter {
  let mudou = false;
  const proximo: Record<CurationFeedFilter, ReadonlySet<string>> = { ...estado };

  for (const filtro of CURATION_FILTERS) {
    const atualizado = applyCurationPendingEvent(estado[filtro], evento, filtro);
    if (atualizado !== estado[filtro]) {
      proximo[filtro] = atualizado;
      mudou = true;
    }
  }

  return mudou ? proximo : estado;
}

/**
 * Zera apenas o recorte que acabou de ser atualizado na tela.
 *
 * Os demais continuam válidos: seus eventos ainda não foram vistos pelo
 * curador, e apagá-los esconderia novidades reais atrás de uma aba silenciosa.
 */
export function clearPendingForFilter(
  estado: CurationPendingByFilter,
  filtro: CurationFeedFilter,
): CurationPendingByFilter {
  if (estado[filtro].size === 0) return estado;
  return { ...estado, [filtro]: CONJUNTO_VAZIO };
}

/** Rótulo curto para o badge da aba (só o número, saturado no teto). */
export function formatPendingBadge(total: number): string | null {
  if (!Number.isFinite(total) || total <= 0) return null;
  return total >= CURATION_PENDING_CAP ? '99+' : String(total);
}

/**
 * Assina as mudanças da tabela e reage apenas aos eventos relevantes.
 * O canal é recriado quando o filtro muda — o predicado depende dele.
 *
 * Quando `onRelevantEvent` é fornecido, o hook **não** invalida o cache: quem
 * decide o momento da atualização é o chamador (modo "novidade chegou").
 */
export function useCurationRealtime(
  filtro: CurationFeedFilter,
  enabled = true,
  onRelevantEvent?: (evento: CurationRealtimeEvent) => void,
) {
  const queryClient = useQueryClient();
  // Ref evita recriar o canal a cada render por causa de um callback inline —
  // reassinar um canal Realtime é caro e perde eventos na janela de troca.
  const callbackRef = useRef(onRelevantEvent);
  callbackRef.current = onRelevantEvent;

  useEffect(() => {
    if (!enabled) return;

    const canal = supabaseExternal
      .channel(`curation-feed-${filtro}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'template_skill_links' },
        (payload: RealtimePostgresChangesPayload<CurationRealtimeRow>) => {
          const evento: CurationRealtimeEvent = {
            eventType: payload.eventType as CurationRealtimeEvent['eventType'],
            new: (payload.new ?? null) as CurationRealtimeRow | null,
            old: (payload.old ?? null) as CurationRealtimeRow | null,
          };

          if (!shouldRefreshCurationFeed(evento, filtro)) return;

          if (callbackRef.current) {
            callbackRef.current(evento);
            return;
          }

          queryClient.invalidateQueries({ queryKey: ['recent_curations'] });
          queryClient.invalidateQueries({ queryKey: ['template_skill_links'] });
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          logger.warn('Realtime da curadoria indisponível', { filtro });
        }
      });

    return () => {
      void supabaseExternal.removeChannel(canal);
    };
  }, [filtro, enabled, queryClient]);
}
