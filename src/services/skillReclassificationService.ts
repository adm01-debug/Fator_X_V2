/**
 * Aplicação do plano de reclassificação de departamento.
 *
 * Separado do módulo puro de propósito: aqui mora o efeito colateral (UPDATE
 * no Registry) e o tratamento de erro por linha. Regras:
 *
 *  - Atualiza uma skill por vez com `.eq('id', ...)` e guarda de estado
 *    (`.eq('department', from)` quando havia valor): se outro curador mudou o
 *    departamento entre o cálculo do plano e o clique, a linha é reportada
 *    como conflito em vez de sobrescrever silenciosamente (optimistic locking
 *    sem coluna de versão).
 *  - Nunca aborta o lote inteiro por causa de uma linha: cada falha é
 *    classificada e devolvida para a UI decidir o retry.
 *  - `curated_by` / `curated_at` são preenchidos por trigger no banco, não
 *    pelo cliente — cliente não é fonte confiável de identidade.
 */
import { supabaseExternal } from '@/integrations/supabase/externalClient';
import { logger } from '@/lib/logger';
import type { ReclassifyProposal } from '@/lib/skills/departmentReclassification';

export type ReclassifyFailureKind = 'permission' | 'conflict' | 'network' | 'unknown';

export interface ReclassifyFailure {
  skillId: string;
  slug: string;
  kind: ReclassifyFailureKind;
  message: string;
}

export interface ReclassifyOutcome {
  applied: ReclassifyProposal[];
  failures: ReclassifyFailure[];
}

/** Traduz o erro do PostgREST em uma categoria acionável para o curador. */
export function classifyReclassifyError(error: unknown): ReclassifyFailureKind {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const msg = raw.toLowerCase();
  if (msg.includes('row-level security') || msg.includes('permission') || msg.includes('42501')) {
    return 'permission';
  }
  if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('timeout')) {
    return 'network';
  }
  return 'unknown';
}

/** Aplica as propostas selecionadas, uma a uma, tolerando falhas parciais. */
export async function applyReclassification(
  proposals: readonly ReclassifyProposal[],
): Promise<ReclassifyOutcome> {
  const applied: ReclassifyProposal[] = [];
  const failures: ReclassifyFailure[] = [];

  for (const proposal of proposals) {
    try {
      let query = supabaseExternal
        .from('skill_registry')
        .update({ department: proposal.to })
        .eq('id', proposal.skillId);

      // Guarda de estado: só troca se o departamento continua o que o plano viu.
      query = proposal.from === null ? query.is('department', null) : query.eq('department', proposal.from);

      const { data, error } = await query.select('id');

      if (error) {
        failures.push({
          skillId: proposal.skillId,
          slug: proposal.slug,
          kind: classifyReclassifyError(error),
          message: error.message,
        });
        continue;
      }

      if (!data || data.length === 0) {
        // Zero linhas afetadas = RLS bloqueou OU o estado mudou. Ambos exigem
        // atenção humana, mas 'conflict' é a hipótese mais provável e a menos
        // alarmante; a UI orienta recarregar o plano.
        failures.push({
          skillId: proposal.skillId,
          slug: proposal.slug,
          kind: 'conflict',
          message: 'Nenhuma linha atualizada — o departamento mudou ou você não tem permissão.',
        });
        continue;
      }

      applied.push(proposal);
    } catch (error) {
      failures.push({
        skillId: proposal.skillId,
        slug: proposal.slug,
        kind: classifyReclassifyError(error),
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }
  }

  if (failures.length > 0) {
    logger.warn('applyReclassification: falhas parciais', {
      applied: applied.length,
      failed: failures.length,
    });
  }

  return { applied, failures };
}
