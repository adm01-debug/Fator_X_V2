/**
 * Provedor de IA (chat) das edge functions: OpenRouter (API compatível com OpenAI).
 * Substitui o DeepSeek direto (DEEPSEEK_API_KEY) e o Lovable AI Gateway (LOVABLE_API_KEY),
 * que não existem mais no projeto. Hermes API é suportada via HERMES_API_KEY (+ HERMES_BASE_URL).
 *
 * Secret obrigatório: OPENROUTER_API_KEY.
 * Opcionais: OPENROUTER_MODEL (padrão deepseek/deepseek-chat-v3-0324) e
 *            OPENROUTER_MODEL_PRO (padrão deepseek/deepseek-reasoner).
 */

export const AI_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const AI_API_KEY_ENV = 'OPENROUTER_API_KEY';

// Modelos "topo de linha" vão para o modelo pro; o resto para o flash.
const DIRECT_MODELS = new Set([
  'deepseek/deepseek-chat-v3-0324',
  'deepseek/deepseek-reasoner',
  'anthropic/claude-3.5-haiku',
]);
const PRO_HINT = /(-pro\b|\bpro\b|gpt-5(?!-(mini|nano))|opus|sonnet|reasoner)/i;

/** Converte qualquer id de modelo legado (deepseek-flash, google/…, openai/…, anthropic/…) para OpenRouter. */
export function aiModel(requested?: string | null): string {
  const flash = Deno.env.get('OPENROUTER_MODEL') || 'deepseek/deepseek-chat-v3-0324';
  const pro = Deno.env.get('OPENROUTER_MODEL_PRO') || 'deepseek/deepseek-reasoner';
  if (!requested) return flash;
  // Só repassa nomes aceitos pela API (ids OpenRouter completos); ids legados são convertidos.
  if (DIRECT_MODELS.has(requested.toLowerCase())) return requested.toLowerCase();
  if (/^deepseek-reasoner$/i.test(requested)) return pro;
  if (/^(deepseek-flash|deepseek-v4-flash)$/i.test(requested)) return flash;
  if (/^deepseek-v4-pro$/i.test(requested)) return pro;
  return PRO_HINT.test(requested) ? pro : flash;
}

// USD por 1M tokens na OpenRouter (entrada sem cache, saída) — conservador; via ai-restricted no pico.
// Fonte: https://openrouter.ai/models (consultada em 21/11/2026).
const PRICES_PER_1M: Record<string, [number, number]> = {
  'deepseek/deepseek-chat-v3-0324': [0.28, 0.42],
  'deepseek/deepseek-reasoner': [0.55, 2.19],
  'anthropic/claude-3.5-haiku': [0.8, 4.0],
};

/** Custo em USD de uma chamada; null se o modelo não estiver na tabela OpenRouter conhecida. */
export function aiCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number | null {
  const p = PRICES_PER_1M[model.toLowerCase()];
  if (!p) return null;
  return (promptTokens / 1_000_000) * p[0] + (completionTokens / 1_000_000) * p[1];
}
