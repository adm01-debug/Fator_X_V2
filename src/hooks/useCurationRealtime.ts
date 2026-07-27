/**
 * Realtime do feed de curadoria (template ↔ skill).
 *
 * Por que um predicado puro separado do hook: a tabela recebe muito mais
 * escrita automática (origin = 'auto', recálculo em lote) do que curadoria
 * manual. Invalidar a query a cada evento faria o painel refetchar dezenas de
 * vezes durante um recálculo — o predicado descarta o ruído antes de tocar o
 * cache, e por ser puro é simulável sem WebSocket.
 */
import { useEffect } from 'react';
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
  const lados = [evento.new, evento.old].filter(
    (lado): lado is CurationRealtimeRow => Boolean(lado),
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

/**
 * Assina as mudanças da tabela e invalida o feed apenas nos eventos relevantes.
 * O canal é recriado quando o filtro muda — o predicado depende dele.
 */
export function useCurationRealtime(filtro: CurationFeedFilter, enabled = true) {
  const queryClient = useQueryClient();

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
