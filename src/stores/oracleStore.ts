import { create } from 'zustand';
import { saveOracleHistory } from '@/lib/oracleHistory';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

export type { OracleMode, OraclePreset, ModelResponse, ConsensusPoint, Citation, OracleResult } from './types/oracleTypes';
import type { OracleMode, OracleResult } from './types/oracleTypes';
export { ORACLE_MODES, ORACLE_PRESETS } from './presets/oraclePresets';
import { ORACLE_MODES, ORACLE_PRESETS } from './presets/oraclePresets';

interface OracleStore {
  query: string;
  mode: OracleMode;
  selectedPreset: string;
  isRunning: boolean;
  isReplaying: boolean;
  currentStage: number;
  stageLabel: string;
  results: OracleResult | null;
  error: string | null;
  history: Array<{
    query: string;
    results: OracleResult;
    timestamp: string;
    preset: string;
    mode: OracleMode;
  }>;
  enableThinking: boolean;
  chairmanModel: string;
  chairmanSelection: 'auto' | 'manual';
  abortController: AbortController | null;
  customGuardrails: string;

  setQuery: (q: string) => void;
  setMode: (m: OracleMode) => void;
  setSelectedPreset: (p: string) => void;
  setEnableThinking: (v: boolean) => void;
  setChairmanModel: (m: string) => void;
  setChairmanSelection: (s: 'auto' | 'manual') => void;
  setCustomGuardrails: (g: string) => void;
  submitQuery: () => Promise<void>;
  cancelQuery: () => void;
  clearResults: () => void;
  replayEntry: (entry: OracleResult) => Promise<void>;
}

// ═══ STORE ═══

export const useOracleStore = create<OracleStore>((set, get) => ({
  query: '',
  mode: 'council',
  selectedPreset: 'executive',
  isRunning: false,
  isReplaying: false,
  currentStage: 0,
  stageLabel: '',
  results: null,
  error: null,
  history: [],
  enableThinking: false,
  chairmanModel: 'openai/gpt-4o',
  chairmanSelection: 'auto',
  abortController: null,
  customGuardrails: '',

  setQuery: (query) => set({ query }),
  setMode: (mode) => set({ mode }),
  setSelectedPreset: (selectedPreset) => {
    const preset = ORACLE_PRESETS.find((p) => p.id === selectedPreset);
    if (preset) {
      set({
        selectedPreset,
        mode: preset.mode,
        enableThinking: preset.enableThinking,
        chairmanModel: preset.chairman,
      });
    }
  },
  setEnableThinking: (enableThinking) => set({ enableThinking }),
  setChairmanModel: (chairmanModel) => set({ chairmanModel }),
  setChairmanSelection: (chairmanSelection) => set({ chairmanSelection }),
  setCustomGuardrails: (customGuardrails) => set({ customGuardrails }),

  cancelQuery: () => {
    const { abortController } = get();
    if (abortController) {
      abortController.abort();
      set({ isRunning: false, stageLabel: 'Cancelado pelo usuário', abortController: null });
    }
  },

  replayEntry: async (entry: OracleResult) => {
    set({ isRunning: true, isReplaying: true, currentStage: 1, stageLabel: 'Iniciando Replay...', results: null, error: null });
    
    // Simulate Stage 1
    await new Promise(r => setTimeout(r, 1000));
    set({ currentStage: 1, stageLabel: 'Replay: Coletando opiniões...' });
    
    const results: Record<string, unknown> = { stage1_results: [], metrics: entry.metrics };
    for (const res of entry.stage1_results) {
      await new Promise(r => setTimeout(r, 800));
      results.stage1_results.push(res);
      set({ results: { ...results } as OracleResult });
    }

    // Simulate Stage 2
    if (entry.stage2_results?.length) {
      await new Promise(r => setTimeout(r, 1000));
      set({ currentStage: 2, stageLabel: 'Replay: Realizando Peer-Review...' });
      await new Promise(r => setTimeout(r, 1000));
      results.stage2_results = entry.stage2_results;
      set({ results: { ...results } as OracleResult });
    }

    // Simulate Stage 3
    await new Promise(r => setTimeout(r, 1000));
    set({ currentStage: 3, stageLabel: 'Replay: Síntese do Presidente...' });
    await new Promise(r => setTimeout(r, 1500));
    
    set({ 
      results: entry, 
      currentStage: 3, 
      stageLabel: 'Replay concluído', 
      isRunning: false, 
      isReplaying: false 
    });
  },

  submitQuery: async () => {
    const { query, selectedPreset, mode, enableThinking, chairmanModel, customGuardrails } = get();
    if (!query.trim()) return;

    const controller = new AbortController();
    const preset = ORACLE_PRESETS.find((p) => p.id === selectedPreset) || ORACLE_PRESETS[0];
    const modeConfig = ORACLE_MODES[mode];

    set({
      isRunning: true,
      isReplaying: false,
      currentStage: 1,
      stageLabel: modeConfig.stages[0],
      results: null,
      error: null,
      abortController: controller,
    });

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(`${supabaseUrl}/functions/v1/oracle-council`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'apikey': supabaseAnonKey,
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify({
          query,
          mode,
          members: preset.members,
          chairman_model: chairmanModel,
          enable_peer_review: preset.enablePeerReview,
          enable_thinking: enableThinking,
          preset_id: preset.id,
          custom_guardrails: customGuardrails,
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Falha na conexão com o conselho');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      const tempResults: {
        stage1_results: unknown[];
        stage2_results?: unknown[];
        consensus_points?: unknown[];
        metrics: { total_latency_ms: number; total_cost_usd: number; total_tokens: number; models_used: number };
      } = {
        stage1_results: [],
        metrics: { total_latency_ms: 0, total_cost_usd: 0, total_tokens: 0, models_used: 0 },
      };

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const { type, data } = JSON.parse(line.slice(6));
            
            if (type === 'stage') {
              set({ currentStage: data.stage, stageLabel: data.label });
            } else if (type === 'member_response') {
              tempResults.stage1_results.push(data);
              set({ results: { ...tempResults } as OracleResult });
            } else if (type === 'review_complete') {
              tempResults.stage2_results = [data];
              tempResults.consensus_points = data.consensus_points || [];
              set({ results: { ...tempResults } as OracleResult });
            } else if (type === 'final') {
              const finalResults = { ...tempResults, ...data };
              set({
                results: finalResults,
                currentStage: modeConfig.stages.length,
                stageLabel: modeConfig.stages[modeConfig.stages.length - 1],
                isRunning: false,
                abortController: null,
                history: [
                  ...get().history,
                  { query, results: finalResults, timestamp: new Date().toISOString(), preset: preset.id, mode },
                ],
              });
              
              saveOracleHistory(query, mode, preset.id, preset.name, chairmanModel, enableThinking, finalResults).catch((err) => {
                logger.error("Erro ao salvar histórico do Oráculo:", err);
                toast.error("Não foi possível salvar no histórico, mas o resultado está disponível abaixo.");
              });
            } else if (type === 'error') {
              throw new Error(data);
            }
          }
        }
      }
    } catch (e: unknown) {
      if (e.name === 'AbortError') return;
      set({
        error: e instanceof Error ? e.message : 'Erro ao consultar o Oráculo',
        isRunning: false,
        currentStage: 0,
        stageLabel: '',
        abortController: null,
      });
      
      // Auto-retry once for network errors or transient 500s
      if (e.message.includes('fetch') || e.message.includes('network') || e.message.includes('502') || e.message.includes('503')) {
        toast.info('Erro de conexão ou timeout. Tentando novamente em 3 segundos...');
        setTimeout(() => get().submitQuery(), 3000);
      }
    }
  },

  clearResults: () => set({ results: null, currentStage: 0, stageLabel: '', error: null }),
}));
