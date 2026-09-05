/**
 * json.ts — Parsing tolerante de JSON vindo de LLMs.
 *
 * Existe porque modelos frequentemente devolvem JSON embrulhado em cercas de
 * markdown ou cercado de prosa. `JSON.parse` cru falha nesses casos e derruba
 * a função inteira por um problema puramente cosmético da resposta.
 */

/** Remove cercas ```json ... ``` e recorta o primeiro objeto/array balanceado. */
function extractJsonCandidate(raw: string): string {
  let text = raw.trim();

  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) text = fence[1].trim();

  const firstObj = text.indexOf('{');
  const firstArr = text.indexOf('[');
  const start =
    firstObj === -1 ? firstArr : firstArr === -1 ? firstObj : Math.min(firstObj, firstArr);
  if (start === -1) return text;

  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === open) depth++;
    else if (char === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return text.slice(start);
}

/**
 * Tenta interpretar `raw` como JSON, devolvendo `fallback` em vez de lançar.
 * Use quando a ausência do dado é aceitável (ex.: metadados opcionais).
 */
export function safeJsonParse<T = unknown>(raw: unknown, fallback: T): T {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw === 'object') return raw as T;
  if (typeof raw !== 'string') return fallback;

  try {
    return JSON.parse(extractJsonCandidate(raw)) as T;
  } catch {
    return fallback;
  }
}

/**
 * Igual a `safeJsonParse`, mas lança quando o conteúdo é inválido.
 * Use quando o JSON é contratual e seguir sem ele produziria dado corrompido.
 */
export function parseJsonStrict<T = unknown>(raw: string, context = 'resposta'): T {
  try {
    return JSON.parse(extractJsonCandidate(raw)) as T;
  } catch (error) {
    throw new Error(
      `JSON inválido em ${context}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
