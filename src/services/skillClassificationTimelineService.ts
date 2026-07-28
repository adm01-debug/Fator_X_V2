/**
 * Timeline de decisões de classificação departamental.
 *
 * Lê o `audit_log` — não a fila de revisões — de propósito: a fila guarda o
 * QUE foi proposto, mas só a auditoria preserva o estado do Registry ANTES da
 * escrita (`previous_department_source` / `previous_department_confidence`).
 * É essa fotografia do "antes" que permite julgar o classificador em vez de
 * apenas contar cliques do curador.
 *
 * Leitura restrita a administradores pela RLS de `audit_log`; um usuário sem
 * permissão recebe conjunto vazio (não erro) do PostgREST, então a UI trata
 * "vazio" como estado legítimo.
 */
import { fromTable } from '@/lib/supabaseExtended';
import { logger } from '@/lib/logger';
import {
  parseClassificationDecisions,
  RECLASSIFICATION_AUDIT_ACTIONS,
  type AuditRowInput,
  type ClassificationDecision,
} from '@/lib/skills/classificationEfficacy';

/** Teto de linhas lidas — a timeline é diagnóstico, não relatório contábil. */
export const CLASSIFICATION_TIMELINE_LIMIT = 300;

export async function fetchClassificationTimeline(options?: {
  /** Restringe a uma skill específica (aba de detalhe). */
  skillId?: string;
  limit?: number;
}): Promise<ClassificationDecision[]> {
  const limite = Math.min(
    Math.max(Math.floor(options?.limit ?? CLASSIFICATION_TIMELINE_LIMIT), 1),
    CLASSIFICATION_TIMELINE_LIMIT,
  );

  let query = fromTable('audit_log')
    .select('id, action, entity_id, created_at, metadata')
    .in('action', [...RECLASSIFICATION_AUDIT_ACTIONS])
    .order('created_at', { ascending: false })
    .limit(limite);

  if (options?.skillId) query = query.eq('entity_id', options.skillId);

  const { data, error } = await query;
  if (error) {
    logger.error('fetchClassificationTimeline failed', { error: error.message });
    throw new Error(error.message);
  }

  return parseClassificationDecisions((data ?? []) as unknown as AuditRowInput[]);
}
