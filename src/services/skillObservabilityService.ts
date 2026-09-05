/**
 * Coleta dos sinais de observabilidade da biblioteca de skills.
 *
 * Fontes:
 *   - `skill_harvest_runs` .................. ingestão (RLS: admins)
 *   - `skill_reclassification_reviews` ...... fila de curadoria
 *   - `audit_log` ........................... decisões e calibrações
 *
 * Todas as tabelas têm RLS restrita; um usuário sem permissão recebe conjunto
 * VAZIO do PostgREST (não erro), então a UI trata "vazio" como estado legítimo.
 */

import { fromTable } from '@/lib/supabaseExtended';
import { logger } from '@/lib/logger';
import { fetchClassificationTimeline } from '@/services/skillClassificationTimelineService';
import { fetchThresholdCalibrations } from '@/services/thresholdCalibrationService';
import {
  deriveObservabilityAlerts,
  summarizeHumanReclassification,
  summarizeIngestion,
  summarizeQueue,
  type HarvestRunInput,
  type HumanReclassificationSummary,
  type IngestionSummary,
  type ObservabilityAlert,
  type QueueSummary,
  type ReviewQueueRowInput,
} from '@/lib/skills/observability';
import type {
  CalibrationInstability,
  ThresholdCalibration,
} from '@/lib/skills/thresholdCalibration';

/** Janela padrão do painel, em dias. */
export const OBSERVABILITY_WINDOW_DAYS = 14;
/** Teto de linhas lidas por fonte — painel é diagnóstico, não relatório. */
const ROW_LIMIT = 200;

export interface SkillObservabilitySnapshot {
  windowDays: number;
  ingestion: IngestionSummary;
  queue: QueueSummary;
  human: HumanReclassificationSummary;
  calibrations: ThresholdCalibration[];
  instability: CalibrationInstability;
  alerts: ObservabilityAlert[];
  /** Momento da coleta — exibido para o curador saber o quão fresco é o dado. */
  collectedAt: string;
}

async function fetchHarvestRuns(windowDays: number): Promise<HarvestRunInput[]> {
  const desde = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await fromTable('skill_harvest_runs')
    .select(
      'id, status, repos_scanned, candidates_found, candidates_accepted, duration_ms, created_at',
    )
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(ROW_LIMIT);

  if (error) {
    logger.error('fetchHarvestRuns failed', { error: error.message });
    throw new Error(error.message);
  }
  return (data ?? []) as unknown as HarvestRunInput[];
}

async function fetchReviewQueue(): Promise<ReviewQueueRowInput[]> {
  // Sem filtro de data: pendentes antigos são exatamente o que o painel precisa
  // enxergar — recortar por janela esconderia o backlog esquecido.
  const { data, error } = await fromTable('skill_reclassification_reviews')
    .select('id, status, source, confidence, created_at, reviewed_at')
    .order('created_at', { ascending: false })
    .limit(ROW_LIMIT);

  if (error) {
    logger.error('fetchReviewQueue failed', { error: error.message });
    throw new Error(error.message);
  }
  return (data ?? []) as unknown as ReviewQueueRowInput[];
}

/**
 * Monta o snapshot completo. As leituras rodam em paralelo por serem
 * independentes; uma falha derruba o conjunto de propósito — painel de
 * governança com números parciais engana mais do que ajuda.
 */
export async function fetchSkillObservability(options?: {
  windowDays?: number;
}): Promise<SkillObservabilitySnapshot> {
  const windowDays = Math.min(
    Math.max(Math.floor(options?.windowDays ?? OBSERVABILITY_WINDOW_DAYS), 1),
    90,
  );
  const now = new Date();

  const [runs, reviews, decisions, calibrations] = await Promise.all([
    fetchHarvestRuns(windowDays),
    fetchReviewQueue(),
    fetchClassificationTimeline(),
    fetchThresholdCalibrations(),
  ]);

  const ingestion = summarizeIngestion(runs, { now, windowDays });
  const queue = summarizeQueue(reviews, { now });
  const human = summarizeHumanReclassification(decisions);
  const { alerts, instability } = deriveObservabilityAlerts({
    ingestion,
    queue,
    human,
    calibrations,
    now,
  });

  return {
    windowDays,
    ingestion,
    queue,
    human,
    calibrations,
    instability,
    alerts,
    collectedAt: now.toISOString(),
  };
}
