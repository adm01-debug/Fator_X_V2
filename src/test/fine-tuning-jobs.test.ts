/**
 * fineTuningService — camada de histórico (`finetune_jobs`).
 *
 * A tabela existia desde 20260404210000, com RLS por workspace, e nunca era escrita: o
 * histórico dos treinos só existia na resposta do HuggingFace Hub. Estes testes travam o
 * que a tela passou a depender: registro com o usuário autenticado, leitura escopada no
 * workspace e tradução do status do Hub para o enum da tabela.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSharedSupabaseMock } from './utils/supabaseMock';

vi.mock('@/lib/supabaseExtended', async () => {
  const m = await import('./utils/supabaseMock');
  return {
    fromTable: (table: string) =>
      (
        m.getSharedSupabaseMock('finetune-jobs').client as {
          from: (t: string) => unknown;
        }
      ).from(table),
  };
});

const getUser = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: vi.fn() },
    auth: { getUser: () => getUser() },
  },
}));

vi.mock('@/lib/agentService', () => ({
  getWorkspaceId: vi.fn(async () => 'ws-1'),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  listFineTuneJobs,
  mapHubStatus,
  recordFineTuneJob,
  syncFineTuneJob,
} from '@/services/fineTuningService';

const db = getSharedSupabaseMock('finetune-jobs');

beforeEach(() => {
  db.reset();
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
});

describe('mapHubStatus', () => {
  it('traduz o status do Hub para o enum de finetune_jobs', () => {
    expect(mapHubStatus('succeeded')).toBe('completed');
    expect(mapHubStatus('error')).toBe('failed');
    expect(mapHubStatus('running')).toBe('training');
    expect(mapHubStatus('queued')).toBe('preparing');
    expect(mapHubStatus(null)).toBe('preparing');
  });
});

describe('recordFineTuneJob', () => {
  it('grava o job com o usuário autenticado e o workspace do contexto', async () => {
    db.setTableResult('finetune_jobs', {
      data: { id: 'job-1', hf_repo_id: 'adm01/bot', status: 'preparing' },
      error: null,
    });

    const record = await recordFineTuneJob({
      hfRepoId: 'adm01/bot',
      baseModel: 'meta-llama/Llama-3.1-8B-Instruct',
      task: 'text-generation',
      config: { epochs: 3, method: 'qlora', lora_rank: 32 },
      agentId: 'agent-9',
    });

    expect(record.id).toBe('job-1');
    const payload = db.calls.insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.workspace_id).toBe('ws-1');
    expect(payload.user_id).toBe('user-1');
    expect(payload.agent_id).toBe('agent-9');
    expect(payload.hf_repo_id).toBe('adm01/bot');
    expect(payload.status).toBe('preparing');
    expect(payload.hf_model_url).toBe('https://huggingface.co/adm01/bot');
  });

  it('recusa registrar sem sessão em vez de gravar user_id vazio', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    await expect(
      recordFineTuneJob({
        hfRepoId: 'adm01/bot',
        baseModel: 'm',
        task: 'text-generation',
        config: {},
      }),
    ).rejects.toThrow(/Sessão expirada/);
    expect(db.calls.insert).not.toHaveBeenCalled();
  });
});

describe('listFineTuneJobs', () => {
  it('escopa no workspace e traz o mais recente primeiro', async () => {
    db.setTableResult('finetune_jobs', {
      data: [{ id: 'job-1', hf_repo_id: 'adm01/bot' }],
      error: null,
    });

    const jobs = await listFineTuneJobs(5);

    expect(jobs).toHaveLength(1);
    expect(db.calls.eq).toHaveBeenCalledWith('workspace_id', 'ws-1');
    expect(db.calls.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(db.calls.limit).toHaveBeenCalledWith(5);
  });
});

describe('syncFineTuneJob', () => {
  it('fecha o registro com status terminal e o modelo resultante', async () => {
    db.setTableResult('finetune_jobs', {
      data: { id: 'job-1', status: 'completed' },
      error: null,
    });

    await syncFineTuneJob({
      hfRepoId: 'adm01/bot',
      statusRaw: 'succeeded',
      resultModelId: 'adm01/bot',
    });

    const payload = db.calls.update.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.status).toBe('completed');
    expect(payload.result_model_id).toBe('adm01/bot');
    expect(typeof payload.completed_at).toBe('string');
    expect(db.calls.eq).toHaveBeenCalledWith('hf_repo_id', 'adm01/bot');
  });
});
