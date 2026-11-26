/**
 * hf-config — configuração HuggingFace por workspace.
 *
 * `hf_config` existe desde a migration 20260404210000 (Phase 4) com toggles e modelos
 * preferidos por workspace, e nunca teve consumidor: os edges decidiam só por env var,
 * com o modelo fixo no código. Aqui a linha do workspace passa a valer.
 *
 * Sem linha — ou em qualquer falha de leitura — o resultado são os defaults, que são os
 * mesmos do banco e os mesmos que o código já usava. Ausência de configuração, portanto,
 * preserva exatamente o comportamento anterior.
 *
 * A env var segue como kill-switch global: ENABLE_*=false desliga para todos os
 * workspaces, mesmo que a linha do banco diga o contrário.
 */

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

const COLUMNS =
  'enable_ml_injection, enable_hf_reranker, enable_hf_embeddings, enable_auto_classify, ' +
  'preferred_embedding_model, preferred_reranker_model, preferred_injection_model, ' +
  'preferred_classify_model';

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asModel(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

/** Normaliza a linha de `hf_config` (ou a ausência dela) no contrato completo. */
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

interface HfConfigQueryable {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
      };
    };
  };
}

/**
 * Lê a configuração do workspace. O client entra como `unknown` porque o edge usa o
 * client do usuário (a RLS de `hf_config` já libera SELECT para membros) e o tipo
 * gerado do banco não conhece esta tabela.
 */
export async function loadHfConfig(
  client: unknown,
  workspaceId: string | null | undefined,
): Promise<HfConfig> {
  if (!workspaceId) return { ...HF_CONFIG_DEFAULTS };
  try {
    const { data, error } = await (client as HfConfigQueryable)
      .from('hf_config')
      .select(COLUMNS)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (error) {
      console.warn('loadHfConfig: defaults aplicados —', error.message ?? error);
      return { ...HF_CONFIG_DEFAULTS };
    }
    return normalizeHfConfig(data as Record<string, unknown> | null);
  } catch (err) {
    console.warn(
      'loadHfConfig: defaults aplicados —',
      err instanceof Error ? err.message : String(err),
    );
    return { ...HF_CONFIG_DEFAULTS };
  }
}

/** Kill-switch global por env var: `ENABLE_X=false` desliga para todos os workspaces. */
export function envDisabled(flag: string): boolean {
  return Deno.env.get(flag) === 'false';
}
