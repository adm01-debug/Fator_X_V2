/**
 * buildEdgeUrl — helper para construir URLs absolutas de Edge Functions.
 * Uso: fetch(buildEdgeUrl('llm-gateway'), ...)
 */
export function buildEdgeUrl(fn: string): string {
  const base = import.meta.env.VITE_SUPABASE_URL;
  const path = fn.startsWith('/') ? fn : `/functions/v1/${fn}`;
  return `${base}${path}`;
}
