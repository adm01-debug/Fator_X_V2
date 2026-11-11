/**
 * Provedor de IA (chat) das edge functions: DeepSeek, API compatível com OpenAI.
 * Substitui o Lovable AI Gateway (LOVABLE_API_KEY), que não existe neste projeto.
 *
 * Secret obrigatório: DEEPSEEK_API_KEY.
 * Opcionais: DEEPSEEK_MODEL (padrão deepseek-flash) e DEEPSEEK_MODEL_PRO (padrão deepseek-v4-pro).
 */

export const AI_CHAT_COMPLETIONS_URL = 'https://api.deepseek.com/chat/completions';
export const AI_API_KEY_ENV = 'DEEPSEEK_API_KEY';

// Pedidos de modelo "topo de linha" vão para o modelo pro; o resto para o flash.
const DIRECT_MODELS = new Set(['deepseek-flash', 'deepseek-v4-flash', 'deepseek-v4-pro']);
const PRO_HINT = /(-pro\b|\bpro\b|gpt-5(?!-(mini|nano))|opus|sonnet|reasoner)/i;

/** Converte qualquer id de modelo legado (google/…, openai/…, anthropic/…) para um modelo DeepSeek. */
export function aiModel(requested?: string | null): string {
  const flash = Deno.env.get('DEEPSEEK_MODEL') || 'deepseek-flash';
  const pro = Deno.env.get('DEEPSEEK_MODEL_PRO') || 'deepseek-v4-pro';
  if (!requested) return flash;
  // Só repassa nomes aceitos pela API; ids do HuggingFace (deepseek-ai/…) e legados são convertidos.
  if (DIRECT_MODELS.has(requested.toLowerCase())) return requested.toLowerCase();
  if (/^deepseek-reasoner$/i.test(requested)) return pro;
  return PRO_HINT.test(requested) ? pro : flash;
}
