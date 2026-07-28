/**
 * Histórico de calibrações do limiar de revisão departamental.
 *
 * Lê `audit_log` (RLS restrita a administradores). Usuário sem permissão
 * recebe conjunto vazio do PostgREST — a UI trata "vazio" como legítimo.
 */
import { fromTable } from '@/lib/supabaseExtended';
import { logger } from '@/lib/logger';
import {
  parseThresholdCalibrations,
  THRESHOLD_CALIBRATION_ACTION,
  type ThresholdCalibration,
  type ThresholdCalibrationRowInput,
} from '@/lib/skills/thresholdCalibration';

export const THRESHOLD_CALIBRATION_LIMIT = 20;

export async function fetchThresholdCalibrations(options?: {
  limit?: number;
}): Promise<ThresholdCalibration[]> {
  const limite = Math.min(
    Math.max(Math.floor(options?.limit ?? THRESHOLD_CALIBRATION_LIMIT), 1),
    THRESHOLD_CALIBRATION_LIMIT,
  );

  const { data, error } = await fromTable('audit_log')
    .select('id, action, created_at, metadata')
    .eq('action', THRESHOLD_CALIBRATION_ACTION)
    .order('created_at', { ascending: false })
    .limit(limite);

  if (error) {
    logger.error('fetchThresholdCalibrations failed', { error: error.message });
    throw new Error(error.message);
  }

  return parseThresholdCalibrations((data ?? []) as unknown as ThresholdCalibrationRowInput[]);
}
