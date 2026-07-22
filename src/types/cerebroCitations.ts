/**
 * Shared types for Super Cérebro citations.
 */
export interface CerebroCitation {
  n: number;
  chunk_id: string;
  document_id: string | null;
  document_title: string;
  page: number | null;
  section: string | null;
  snippet: string;
}

export const CITATIONS_SENTINEL = "\n\u241E";

/**
 * Splits a raw streamed cerebro-query response into visible text and citations
 * appended by the edge function after the sentinel marker.
 */
export function splitCitationsSentinel(raw: string): { text: string; citations: CerebroCitation[] } {
  const idx = raw.lastIndexOf(CITATIONS_SENTINEL);
  if (idx === -1) return { text: raw, citations: [] };
  const text = raw.slice(0, idx);
  const jsonPart = raw.slice(idx + CITATIONS_SENTINEL.length).trim();
  if (!jsonPart) return { text, citations: [] };
  try {
    const parsed = JSON.parse(jsonPart);
    return { text, citations: Array.isArray(parsed?.citations) ? parsed.citations : [] };
  } catch {
    return { text: raw, citations: [] };
  }
}
