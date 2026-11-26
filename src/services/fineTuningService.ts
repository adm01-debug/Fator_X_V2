/**
 * Nexus Agents Studio — Fine-Tuning Service
 * Wraps the hf-autotrain Edge Function for dataset preparation,
 * training kickoff, and job status polling.
 */
import { logger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import type { DbRow } from '@/types/dbRow';

export type DatasetSource = 'traces' | 'test_cases' | 'custom';
export type TaskType = 'text-generation' | 'text-classification' | 'embedding';
export type TrainingMethod = 'lora' | 'qlora' | 'full';

export interface DatasetConfig {
  source: DatasetSource;
  min_quality_score: number;
  max_samples: number;
  task_type: TaskType;
}

export interface TrainingConfig {
  base_model: string;
  task: TaskType;
  epochs: number;
  learning_rate: number;
  repo_name?: string;
  /** LoRA / QLoRA / Full FT — decide os args de PEFT enviados à edge. */
  method?: TrainingMethod;
  /** Só se aplica quando method é lora ou qlora. */
  lora_rank?: number;
}

interface PrepareDatasetResult {
  samples_count?: number;
  dataset_id?: string;
  preview?: DbRow[];
}

interface StartTrainingResult {
  job_id?: string;
  status?: string;
  repo_url?: string;
}

interface JobStatusResult {
  job_id: string;
  status: string;
  hub_repo?: string;
  base_model?: string | null;
  method?: string | null;
  lora_rank?: number | null;
  created_at?: string;
  has_model_files?: boolean;
  model_url?: string | null;
  gateway_model_id?: string | null;
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('hf-autotrain', { body });
  if (error) {
    logger.error('hf-autotrain failed', { action: body.action, error: error.message });
    throw new Error(`Fine-tuning error: ${error.message}`);
  }
  return data as T;
}

export async function prepareDataset(
  agentId: string,
  config: DatasetConfig,
): Promise<PrepareDatasetResult> {
  return invoke<PrepareDatasetResult>({
    action: 'prepare_dataset',
    agent_id: agentId,
    dataset_config: config,
  });
}

export async function startTraining(config: TrainingConfig): Promise<StartTrainingResult> {
  return invoke<StartTrainingResult>({
    action: 'start_training',
    training_config: config,
  });
}

export async function getJobStatus(jobId: string): Promise<JobStatusResult> {
  return invoke<JobStatusResult>({
    action: 'check_status',
    job_id: jobId,
  });
}

export async function listTrainingJobs() {
  return invoke<{ jobs: JobStatusResult[] }>({ action: 'list_jobs' });
}
