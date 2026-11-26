/**
 * hfConfigService — configuração HuggingFace por workspace (`hf_config`).
 *
 * A tabela nasceu na migration 20260404210000 com toggles e modelos preferidos por
 * workspace e ficou sem nenhum consumidor: os edges decidiam só por env var, com o
 * modelo fixo no código. Esta camada é a leitura/gravação da tela; o backend segue o
 * mesmo contrato em `supabase/functions/_shared/hf-config.ts`.
 *
 * `hf_config` não está no schema gerado (`src/integrations/supabase/types.ts`), então o
 * acesso passa por `fromTable`, o escape tipado-relaxado do repo sobre o mesmo banco.
 *
 * Os defaults abaixo são idênticos aos do banco e aos do helper dos edges: quando não
 * existe linha, a tela mostra exatamente o que o backend está aplicando.
 */
import { fromTable } from '@/lib/supabaseExtended';

export interface HfConfig {
  enable_ml_injection: boolean;
  enable_hf_reranker: boolean;
  enable_hf_embeddings: boolean;
  enable_auto_classify: boolean;
  preferred_embedding_model: string;
  preferred_reranker_model: string;
  preferred_injection_model: string;
  preferred_classify_model: string;
}

export const HF_CONFIG_DEFAULTS: HfConfig = {
  enable_ml_injection: true,
  enable_hf_reranker: true,
  enable_hf_embeddings: true,
  enable_auto_classify: true,
  preferred_embedding_model: 'BAAI/bge-m3',
  preferred_reranker_model: 'BAAI/bge-reranker-v2-m3',
  preferred_injection_model: 'protectai/deberta-v3-base-prompt-injection-v2',
  preferred_classify_model: 'joeddav/xlm-roberta-large-xnli',
};

export type HfToggleKey = {
  [K in keyof HfConfig]: HfConfig[K] extends boolean ? K : never;
}[keyof HfConfig];

export type HfModelKey = {
  [K in keyof HfConfig]: HfConfig[K] extends string ? K : never;
}[keyof HfConfig];

export interface HfToggleField {
  key: HfToggleKey;
  label: string;
  description: string;
  /** Onde o valor é lido de fato — evita prometer efeito que não existe. */
  effect: string;
}

export interface HfModelField {
  key: HfModelKey;
  label: string;
  effect: string;
}

export const HF_TOGGLE_FIELDS: HfToggleField[] = [
  {
    key: 'enable_ml_injection',
    label: 'Detecção de injeção de prompt (ML)',
    description: 'Classificador ProtectAI antes de qualquer chamada ao modelo.',
    effect: 'Lido pelo llm-gateway (camada 1 de guardrail).',
  },
  {
    key: 'enable_hf_reranker',
    label: 'Reranker do RAG',
    description: 'Cross-encoder multilíngue como segunda camada de ordenação dos chunks.',
    effect: 'Lido pelo rag-rerank (camada 2, depois do Cohere).',
  },
  {
    key: 'enable_hf_embeddings',
    label: 'Embeddings HuggingFace',
    description: 'Preferência de embeddings por workspace.',
    effect: 'Gravado aqui; nenhum edge lê este toggle hoje.',
  },
  {
    key: 'enable_auto_classify',
    label: 'Auto-classificação de traces',
    description: 'Classificação zero-shot das execuções dos agentes.',
    effect: 'Gravado aqui; nenhum edge lê este toggle hoje.',
  },
];

export const HF_MODEL_FIELDS: HfModelField[] = [
  {
    key: 'preferred_injection_model',
    label: 'Modelo de detecção de injeção',
    effect: 'Usado pelo llm-gateway.',
  },
  {
    key: 'preferred_reranker_model',
    label: 'Modelo de reranking',
    effect: 'Usado pelo rag-rerank.',
  },
  {
    key: 'preferred_embedding_model',
    label: 'Modelo de embeddings',
    effect: 'Gravado aqui; nenhum edge lê este modelo hoje.',
  },
  {
    key: 'preferred_classify_model',
    label: 'Modelo de classificação',
    effect: 'Gravado aqui; nenhum edge lê este modelo hoje.',
  },
];

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asModel(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

/** Espelha `normalizeHfConfig` de `_shared/hf-config.ts`. */
export function normalizeHfConfig(row: Record<string, unknown> | null | undefined): HfConfig {
  if (!row) return { ...HF_CONFIG_DEFAULTS };
  return {
    enable_ml_injection: asBool(row.enable_ml_injection, HF_CONFIG_DEFAULTS.enable_ml_injection),
    enable_hf_reranker: asBool(row.enable_hf_reranker, HF_CONFIG_DEFAULTS.enable_hf_reranker),
    enable_hf_embeddings: asBool(row.enable_hf_embeddings, HF_CONFIG_DEFAULTS.enable_hf_embeddings),
    enable_auto_classify: asBool(row.enable_auto_classify, HF_CONFIG_DEFAULTS.enable_auto_classify),
    preferred_embedding_model: asModel(
      row.preferred_embedding_model,
      HF_CONFIG_DEFAULTS.preferred_embedding_model,
    ),
    preferred_reranker_model: asModel(
      row.preferred_reranker_model,
      HF_CONFIG_DEFAULTS.preferred_reranker_model,
    ),
    preferred_injection_model: asModel(
      row.preferred_injection_model,
      HF_CONFIG_DEFAULTS.preferred_injection_model,
    ),
    preferred_classify_model: asModel(
      row.preferred_classify_model,
      HF_CONFIG_DEFAULTS.preferred_classify_model,
    ),
  };
}

/** Lê a configuração do workspace. Sem linha, devolve os defaults do banco. */
export async function getHfConfig(workspaceId: string): Promise<HfConfig> {
  const { data, error } = await fromTable('hf_config')
    .select('*')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (error) throw error;
  return normalizeHfConfig(data as Record<string, unknown> | null);
}

/** Grava a configuração (uma linha por workspace — UNIQUE em `workspace_id`). */
export async function saveHfConfig(
  workspaceId: string,
  patch: Partial<HfConfig>,
): Promise<HfConfig> {
  const { data, error } = await fromTable('hf_config')
    .upsert(
      { workspace_id: workspaceId, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'workspace_id' },
    )
    .select('*')
    .single();
  if (error) throw error;
  return normalizeHfConfig(data as Record<string, unknown> | null);
}
