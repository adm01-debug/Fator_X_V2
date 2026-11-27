/**
 * hfConfigService — `hf_config` existia no banco desde 20260404210000 e nunca teve tela:
 * a aba HuggingFace era copy estática e os edges decidiam só por env var. Estes testes
 * travam o contrato que a tela e o backend compartilham: linha ausente cai nos defaults
 * (mesmo comportamento anterior), a linha parcial é completada com eles e a gravação é
 * upsert por `workspace_id`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSharedSupabaseMock } from './utils/supabaseMock';

vi.mock('@/lib/supabaseExtended', async () => {
  const m = await import('./utils/supabaseMock');
  return {
    fromTable: (table: string) =>
      (
        m.getSharedSupabaseMock('hf-config-external').client as {
          from: (t: string) => unknown;
        }
      ).from(table),
  };
});

import {
  HF_CONFIG_DEFAULTS,
  getHfConfig,
  normalizeHfConfig,
  saveHfConfig,
} from '@/services/hfConfigService';

const ext = getSharedSupabaseMock('hf-config-external');

beforeEach(() => {
  ext.reset();
});

describe('getHfConfig', () => {
  it('sem linha no workspace devolve os defaults do backend', async () => {
    ext.setTableResult('hf_config', { data: null, error: null });

    await expect(getHfConfig('ws-1')).resolves.toEqual(HF_CONFIG_DEFAULTS);
    expect(ext.calls.from).toHaveBeenCalledWith('hf_config');
    expect(ext.calls.eq).toHaveBeenCalledWith('workspace_id', 'ws-1');
  });

  it('preenche o que faltou na linha com os defaults', async () => {
    ext.setTableResult('hf_config', {
      data: { enable_hf_reranker: false, preferred_reranker_model: '  BAAI/custom  ' },
      error: null,
    });

    const config = await getHfConfig('ws-1');

    expect(config.enable_hf_reranker).toBe(false);
    expect(config.preferred_reranker_model).toBe('BAAI/custom');
    expect(config.enable_ml_injection).toBe(HF_CONFIG_DEFAULTS.enable_ml_injection);
    expect(config.preferred_injection_model).toBe(HF_CONFIG_DEFAULTS.preferred_injection_model);
  });

  it('propaga erro de leitura em vez de fingir configuração', async () => {
    ext.setTableResult('hf_config', { data: null, error: { message: 'permission denied' } });

    await expect(getHfConfig('ws-1')).rejects.toEqual({ message: 'permission denied' });
  });
});

describe('saveHfConfig', () => {
  it('grava por upsert com onConflict workspace_id', async () => {
    ext.setTableResult('hf_config', {
      data: { workspace_id: 'ws-1', enable_ml_injection: false },
      error: null,
    });

    const saved = await saveHfConfig('ws-1', { enable_ml_injection: false });

    expect(saved.enable_ml_injection).toBe(false);
    const payload = ext.calls.upsert.mock.calls[0]?.[0] as Record<string, unknown>;
    const options = ext.calls.upsert.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload.workspace_id).toBe('ws-1');
    expect(payload.enable_ml_injection).toBe(false);
    expect(typeof payload.updated_at).toBe('string');
    expect(options.onConflict).toBe('workspace_id');
  });
});

describe('normalizeHfConfig', () => {
  it('ignora modelo vazio para não derrubar a chamada do edge', () => {
    expect(normalizeHfConfig({ preferred_injection_model: '   ' }).preferred_injection_model).toBe(
      HF_CONFIG_DEFAULTS.preferred_injection_model,
    );
  });
});
