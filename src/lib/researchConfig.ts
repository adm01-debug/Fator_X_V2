/**
 * Configuração persistente do Deep Research.
 * Persiste no banco (por usuário) via tabela `user_research_configs`.
 * Mantém fallback em localStorage para uso offline / sessão anônima e faz
 * migração transparente do valor legado ao autenticar pela primeira vez.
 */
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

export type ResearchDepth = 'quick' | 'standard' | 'deep';
export type SearchStrategy = 'broad' | 'balanced' | 'focused';
export type SynthesisModel =
  | 'claude-sonnet-4-6'
  | 'claude-opus-4-8'
  | 'gpt-5-large'
  | 'gemini-2-5-pro';
export type Language = 'pt' | 'en' | 'es';

export interface ResearchConfig {
  defaultDepth: ResearchDepth;
  maxIterations: number;
  queriesPerIteration: number;
  strategy: SearchStrategy;
  synthesisModel: SynthesisModel;
  language: Language;
  includeInternal: boolean;
  maxTokens: number;
  maxSources: number;
  maxLatencySec: number;
  maxCostUsd: number;
  stopOnNoGaps: boolean;
}

export const DEFAULT_RESEARCH_CONFIG: ResearchConfig = {
  defaultDepth: 'standard',
  maxIterations: 5,
  queriesPerIteration: 3,
  strategy: 'balanced',
  synthesisModel: 'claude-sonnet-4-6',
  language: 'pt',
  includeInternal: true,
  maxTokens: 60_000,
  maxSources: 20,
  maxLatencySec: 180,
  maxCostUsd: 2.0,
  stopOnNoGaps: true,
};

const STORAGE_KEY = 'oracle-research-config-v1';
const CHANGE_EVENT = 'oracle-research-config-changed';

function mergeWithDefaults(raw: unknown): ResearchConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_RESEARCH_CONFIG;
  return { ...DEFAULT_RESEARCH_CONFIG, ...(raw as Partial<ResearchConfig>) };
}

function loadFromLocalStorage(): ResearchConfig {
  if (typeof window === 'undefined') return DEFAULT_RESEARCH_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? mergeWithDefaults(JSON.parse(raw)) : DEFAULT_RESEARCH_CONFIG;
  } catch {
    return DEFAULT_RESEARCH_CONFIG;
  }
}

function writeLocalStorage(cfg: ResearchConfig): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

async function fetchRemoteConfig(userId: string): Promise<ResearchConfig | null> {
  const { data, error } = await supabase
    .from('user_research_configs')
    .select('config')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    logger.warn('researchConfig.fetchRemote failed', { error: error.message });
    return null;
  }
  return data?.config ? mergeWithDefaults(data.config) : null;
}

async function upsertRemoteConfig(userId: string, cfg: ResearchConfig): Promise<void> {
  const { error } = await supabase
    .from('user_research_configs')
    .upsert(
      { user_id: userId, config: cfg as unknown as Record<string, unknown> },
      { onConflict: 'user_id' },
    );
  if (error) {
    logger.warn('researchConfig.upsertRemote failed', { error: error.message });
    throw error;
  }
}

/**
 * Hook reativo: busca a config do banco quando há sessão, cai para localStorage
 * quando anônimo/offline. Ao salvar, grava no banco e no localStorage.
 */
export function useResearchConfig(): [
  ResearchConfig,
  (cfg: ResearchConfig) => Promise<void>,
  { loading: boolean; userId: string | null },
] {
  const [cfg, setCfg] = useState<ResearchConfig>(() => loadFromLocalStorage());
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Reage a mudanças no cache local (ex.: entre múltiplas abas)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => setCfg(loadFromLocalStorage());
    window.addEventListener(CHANGE_EVENT, handler);
    return () => window.removeEventListener(CHANGE_EVENT, handler);
  }, []);

  // Bootstrap: autentica → busca no banco → migra localStorage legado se necessário
  useEffect(() => {
    let cancelled = false;

    const bootstrap = async (uid: string | null) => {
      setLoading(true);
      if (!uid) {
        if (!cancelled) {
          setCfg(loadFromLocalStorage());
          setUserId(null);
          setLoading(false);
        }
        return;
      }

      const remote = await fetchRemoteConfig(uid);
      if (cancelled) return;

      if (remote) {
        setCfg(remote);
        writeLocalStorage(remote);
      } else {
        // Sem registro no banco → migra o localStorage (ou default) para o banco
        const local = loadFromLocalStorage();
        try {
          await upsertRemoteConfig(uid, local);
        } catch {
          /* mantém local */
        }
        if (!cancelled) setCfg(local);
      }

      if (!cancelled) {
        setUserId(uid);
        setLoading(false);
      }
    };

    supabase.auth.getSession().then(({ data }) => {
      void bootstrap(data.session?.user.id ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      void bootstrap(session?.user.id ?? null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const update = useCallback(
    async (next: ResearchConfig) => {
      setCfg(next);
      writeLocalStorage(next);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
      }
      if (userId) {
        try {
          await upsertRemoteConfig(userId, next);
        } catch {
          // Erro já logado; localStorage garante persistência local
        }
      }
    },
    [userId],
  );

  return [cfg, update, { loading, userId }];
}
