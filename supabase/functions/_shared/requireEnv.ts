/**
 * Nexus Agents Studio — Edge Function Environment Variable Validation
 *
 * PROBLEMA: Deno.env.get('VAR')! com ! pode falhar silenciosamente
 * em produção se a variável não estiver setada.
 *
 * SOLUÇÃO: requireEnv('VAR') que:
 *   1. Lança erro DESCRITIVO no startup (não em runtime tardio)
 *   2. Validates the variable exists
 *   3. Supports type coercion (boolean, number, JSON)
 *   4. Logs qual variável falta (facilita debug no dashboard)
 *
 * Uso:
 *   const { SUPABASE_URL, OPENAI_API_KEY } = getRequiredEnv();
 *   const PORT = requireEnv.number('PORT', 3000);
 */

const MISSING_ENV_PREFIX = "[ENV-MISSING]";

function isDeno(): boolean {
  return typeof Deno !== "undefined";
}

function getEnv(key: string): string | undefined {
  if (isDeno()) {
    return Deno.env.get(key);
  }
  // Fallback para testes / SSR
  return typeof process !== "undefined"
    ? (process.env as Record<string, string | undefined>)?.[key]
    : undefined;
}

/**
 * Lança erro descritivo se a variável não existir.
 * Uso: const url = requireEnv('SUPABASE_URL');
 */
export function requireEnv(key: string): string {
  const value = getEnv(key);
  if (value === undefined || value === "") {
    const error = new Error(
      `${MISSING_ENV_PREFIX} Required environment variable "${key}" is not set. ` +
      `Edge Function cannot start without this variable. ` +
      `Set it via: supabase secrets set ${key}=<value>`
    );
    // Gera stack trace no logs para debugging
    console.error(`[ENV-FATAL] ${error.message}`);
    throw error;
  }
  return value;
}

/**
 * Versão com valor padrão — não lança, retorna default.
 * Uso: const port = requireEnv.default('PORT', 8080);
 */
export function requireEnvDefault(key: string, defaultValue: string): string {
  const value = getEnv(key);
  return value !== undefined && value !== "" ? value : defaultValue;
}

/**
 * Validação de tipos — lança se o valor não for um número válido.
 * Uso: const port = requireEnv.number('PORT', 3000);
 */
export function requireEnvNumber(key: string, defaultValue?: number): number {
  const raw = getEnv(key);
  if (raw === undefined || raw === "") {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(
      `${MISSING_ENV_PREFIX} Required environment variable "${key}" (number) is not set.`
    );
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(
      `${MISSING_ENV_PREFIX} Environment variable "${key}" must be a valid number, got: "${raw}"`
    );
  }
  return parsed;
}

/**
 * Boolean parsing — aceita 'true', 'false', '1', '0', 'yes', 'no'.
 * Uso: const debug = requireEnv.bool('DEBUG', false);
 */
export function requireEnvBool(key: string, defaultValue = false): boolean {
  const raw = getEnv(key);
  if (raw === undefined || raw === "") return defaultValue;
  return ["true", "1", "yes", "on"].includes(raw.toLowerCase());
}

/**
 * JSON parsing — parseia strings JSON de environment variables.
 * Útil para configurações complexas como arrays e objetos.
 * Uso: const cors = requireEnv.json<CorsConfig>('CORS_ORIGINS', []);
 */
export function requireEnvJson<T>(key: string, defaultValue: T): T {
  const raw = getEnv(key);
  if (raw === undefined || raw === "") return defaultValue;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(
      `${MISSING_ENV_PREFIX} Environment variable "${key}" must be valid JSON. Got: "${raw.substring(0, 100)}"`
    );
  }
}

/**
 * Validação de URL — lança se não for URL válido.
 * Uso: const webhookUrl = requireEnv.url('WEBHOOK_URL');
 */
export function requireEnvUrl(key: string): string {
  const value = requireEnv(key);
  try {
    new URL(value);
    return value;
  } catch {
    throw new Error(
      `${MISSING_ENV_PREFIX} Environment variable "${key}" must be a valid URL, got: "${value}"`
    );
  }
}

/**
 * Obtém múltiplas variáveis de uma vez — falha todas se alguma faltar.
 * Útil para configs agrupadas.
 * Uso: const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = requireEnvGroup(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
 */
export function requireEnvGroup(keys: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  const missing: string[] = [];
  for (const key of keys) {
    try {
      result[key] = requireEnv(key);
    } catch {
      missing.push(key);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `${MISSING_ENV_PREFIX} Missing required environment variables: ${missing.map(k => `"${k}"`).join(", ")}`
    );
  }
  return result;
}

/**
 * Helper para variáveis "opcionais" — retorna undefined se não existir.
 * Uso: const opt = optionalEnv('OPTIONAL_VAR');
 */
export function optionalEnv(key: string): string | undefined {
  const value = getEnv(key);
  return value !== "" ? value : undefined;
}

/**
 * Valida TODAS as variáveis críticas de uma Edge Function.
 * Chamar esta função no topo do handler para fail-fast.
 * Uso: validateRequiredEnv(['SUPABASE_URL', 'OPENAI_API_KEY']);
 */
export function validateRequiredEnv(keys: string[]): void {
  const missing: string[] = [];
  for (const key of keys) {
    if (!getEnv(key)) missing.push(key);
  }
  if (missing.length > 0) {
    throw new Error(
      `${MISSING_ENV_PREFIX} Edge Function startup failed. Missing env vars: ${missing.join(", ")}`
    );
  }
}

/**
 * Cache de variáveis já validadas (evita repeated lookups).
 * WARNING: só usar se as vars não mudam em runtime.
 */
const validatedCache = new Map<string, string>();

export function requireEnvCached(key: string): string {
  if (validatedCache.has(key)) {
    return validatedCache.get(key)!;
  }
  const value = requireEnv(key);
  validatedCache.set(key, value);
  return value;
}

/**
 * Clear do cache — útil para testes.
 */
export function clearEnvCache(): void {
  validatedCache.clear();
}
