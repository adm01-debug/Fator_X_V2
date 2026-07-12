/**
 * Configuração persistente do Deep Research.
 * Persiste em localStorage; consumido pelo DeepResearchPanel.
 */
import { useEffect, useState } from 'react';

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
  maxIterations: number;          // 1..10
  queriesPerIteration: number;    // 1..5
  strategy: SearchStrategy;
  synthesisModel: SynthesisModel;
  language: Language;
  includeInternal: boolean;
  maxTokens: number;              // teto por execução
  maxSources: number;             // 5..50
  maxLatencySec: number;          // 30..600
  maxCostUsd: number;             // 0.1..20
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

export function loadResearchConfig(): ResearchConfig {
  if (typeof window === 'undefined') return DEFAULT_RESEARCH_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_RESEARCH_CONFIG;
    const parsed = JSON.parse(raw) as Partial<ResearchConfig>;
    return { ...DEFAULT_RESEARCH_CONFIG, ...parsed };
  } catch {
    return DEFAULT_RESEARCH_CONFIG;
  }
}

export function saveResearchConfig(cfg: ResearchConfig): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  window.dispatchEvent(new CustomEvent('oracle-research-config-changed'));
}

export function useResearchConfig(): [ResearchConfig, (cfg: ResearchConfig) => void] {
  const [cfg, setCfg] = useState<ResearchConfig>(() => loadResearchConfig());
  useEffect(() => {
    const handler = () => setCfg(loadResearchConfig());
    window.addEventListener('oracle-research-config-changed', handler);
    return () => window.removeEventListener('oracle-research-config-changed', handler);
  }, []);
  const update = (next: ResearchConfig) => {
    setCfg(next);
    saveResearchConfig(next);
  };
  return [cfg, update];
}
