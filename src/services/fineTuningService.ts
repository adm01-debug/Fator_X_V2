/**
 * Nexus Agents Studio — Fine-Tuning Service
 * Wraps the hf-autotrain Edge Function for dataset preparation,
 * training kickoff, and job status polling.
 */
import { logger } from '@/lib/logger';
import { fromTable } from '@/lib/supabaseExtended';
import { getWorkspaceId } from '@/lib/agentService';
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

// ═══ Histórico persistido (`finetune_jobs`) ═══
//
// A tabela nasceu na migration 20260404210000 com RLS por workspace e nunca foi
// escrita: o histórico dos treinos vivia só na resposta do HuggingFace Hub, então sumia
// quando o token mudava ou a API não respondia. Aqui o job passa a ter registro local.

export type FineTuneJobStatus =
  | 'preparing'
  | 'uploading'
  | 'training'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface FineTuneJobRecord {
  id: string;
  workspace_id: string | null;
  agent_id: string | null;
  user_id: string;
  hf_repo_id: string;
  hf_model_url: string | null;
  base_model: string;
  task: string;
  status: FineTuneJobStatus;
  error: string | null;
  result_model_id: string | null;
  created_at: string;
  updated_at: string | null;
}

const TERMINAL_STATUSES = new Set<FineTuneJobStatus>(['completed', 'failed', 'cancelled']);

/** Traduz o status bruto do HuggingFace Hub para o enum de `finetune_jobs`. */
export function mapHubStatus(raw: string | null | undefined): FineTuneJobStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'completed':
    case 'succeeded':
    case 'success':
      return 'completed';
    case 'failed':
    case 'error':
      return 'failed';
    case 'cancelled':
    case 'canceled':
      return 'cancelled';
    case 'running':
    case 'training':
    case 'in_progress':
      return 'training';
    case 'uploading':
      return 'uploading';
    default:
      return 'preparing';
  }
}

export interface RecordFineTuneJobInput {
  hfRepoId: string;
  baseModel: string;
  task: TaskType;
  config: Record<string, unknown>;
  agentId?: string | null;
  hfModelUrl?: string | null;
  datasetSize?: number;
}

/** Cria o registro local do treino (RLS: membro do workspace pode inserir). */
export async function recordFineTuneJob(
  input: RecordFineTuneJobInput,
): Promise<FineTuneJobRecord> {
  const [{ data: auth, error: authError }, workspaceId] = await Promise.all([
    supabase.auth.getUser(),
    getWorkspaceId(),
  ]);
  if (authError || !auth?.user) {
    throw new Error('Sessão expirada — entre novamente para registrar o job');
  }
  const { data, error } = await fromTable('finetune_jobs')
    .insert({
      workspace_id: workspaceId,
      agent_id: input.agentId ?? null,
      user_id: auth.user.id,
      hf_repo_id: input.hfRepoId,
      hf_model_url: input.hfModelUrl ?? `https://huggingface.co/${input.hfRepoId}`,
      base_model: input.baseModel,
      task: input.task,
      config: input.config,
      dataset_size: input.datasetSize ?? 0,
      status: 'preparing',
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as FineTuneJobRecord;
}

/** Histórico do workspace, mais recente primeiro. */
export async function listFineTuneJobs(limit = 20): Promise<FineTuneJobRecord[]> {
  const workspaceId = await getWorkspaceId();
  const { data, error } = await fromTable('finetune_jobs')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as FineTuneJobRecord[];
}

/**
 * Leva o status do Hub para o registro local. Casa por `hf_repo_id` dentro do workspace;
 * devolve `null` quando não existe registro (job antigo, de antes desta camada).
 */
export async function syncFineTuneJob(input: {
  hfRepoId: string;
  statusRaw: string | null | undefined;
  resultModelId?: string | null;
}): Promise<FineTuneJobRecord | null> {
  const workspaceId = await getWorkspaceId();
  const status = mapHubStatus(input.statusRaw);
  const { data, error } = await fromTable('finetune_jobs')
    .update({
      status,
      updated_at: new Date().toISOString(),
      ...(TERMINAL_STATUSES.has(status) ? { completed_at: new Date().toISOString() } : {}),
      ...(input.resultModelId ? { result_model_id: input.resultModelId } : {}),
    })
    .eq('workspace_id', workspaceId)
    .eq('hf_repo_id', input.hfRepoId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return (data as FineTuneJobRecord | null) ?? null;
}
