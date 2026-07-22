/**
 * validateCitations — garante consistência entre marcadores [n] no texto
 * e o array de citations retornado pela `cerebro-query`.
 *
 * Regras auditadas:
 *  1. Máximo 8 citações (limite de UX/RAG).
 *  2. Números em [n] devem ser únicos por citation.
 *  3. Todo [n] presente no texto deve existir no array (missing).
 *  4. Toda citation retornada deve ser referenciada no texto (unused).
 *  5. Números devem ser sequenciais a partir de 1 (sem buracos: 1..N).
 *  6. Duplicidade de `chunk_id` entre citations.
 *  7. Campos obrigatórios: n, chunk_id, document_title, snippet.
 */
import type { CerebroCitation } from '@/types/cerebroCitations';

export const MAX_CITATIONS = 8;

export type CitationIssueCode =
  | 'too_many'
  | 'duplicate_n'
  | 'missing_reference'
  | 'unused_citation'
  | 'non_sequential'
  | 'duplicate_chunk'
  | 'missing_field';

export interface CitationIssue {
  code: CitationIssueCode;
  message: string;
  n?: number;
  chunkId?: string;
}

export interface CitationValidationResult {
  valid: boolean;
  issues: CitationIssue[];
  missing: number[];
  unused: number[];
  referenced: number[];
}

const MARKER_RE = /\[(\d{1,2})\]/g;

/** Extrai todos os números [n] presentes no texto (deduplicados, em ordem de aparição). */
export function extractMarkerNumbers(text: string): number[] {
  if (!text) return [];
  const seen = new Set<number>();
  const out: number[] = [];
  let m: RegExpExecArray | null;
  MARKER_RE.lastIndex = 0;
  while ((m = MARKER_RE.exec(text)) !== null) {
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n < 1) continue;
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

export function validateCitations(
  text: string,
  citations: CerebroCitation[],
  opts: { max?: number } = {},
): CitationValidationResult {
  const max = opts.max ?? MAX_CITATIONS;
  const issues: CitationIssue[] = [];
  const referenced = extractMarkerNumbers(text);
  const referencedSet = new Set(referenced);

  if (citations.length > max) {
    issues.push({
      code: 'too_many',
      message: `Citations excedem o máximo permitido (${citations.length}/${max}).`,
    });
  }

  const byN = new Map<number, CerebroCitation>();
  const chunkSeen = new Map<string, number>();
  for (const c of citations) {
    if (!c || typeof c.n !== 'number') {
      issues.push({ code: 'missing_field', message: 'Citation sem campo `n`.' });
      continue;
    }
    if (!c.chunk_id) {
      issues.push({ code: 'missing_field', message: `Citation [${c.n}] sem chunk_id.`, n: c.n });
    }
    if (!c.document_title) {
      issues.push({
        code: 'missing_field',
        message: `Citation [${c.n}] sem document_title.`,
        n: c.n,
      });
    }
    if (typeof c.snippet !== 'string' || c.snippet.trim().length === 0) {
      issues.push({ code: 'missing_field', message: `Citation [${c.n}] sem snippet.`, n: c.n });
    }
    if (byN.has(c.n)) {
      issues.push({
        code: 'duplicate_n',
        message: `Número de citação duplicado: [${c.n}].`,
        n: c.n,
      });
    } else {
      byN.set(c.n, c);
    }
    if (c.chunk_id) {
      const prev = chunkSeen.get(c.chunk_id);
      if (prev !== undefined && prev !== c.n) {
        issues.push({
          code: 'duplicate_chunk',
          message: `chunk_id repetido entre [${prev}] e [${c.n}].`,
          n: c.n,
          chunkId: c.chunk_id,
        });
      } else {
        chunkSeen.set(c.chunk_id, c.n);
      }
    }
  }

  const missing: number[] = [];
  for (const n of referenced) {
    if (!byN.has(n)) {
      missing.push(n);
      issues.push({
        code: 'missing_reference',
        message: `Marcador [${n}] no texto não possui citation correspondente.`,
        n,
      });
    }
  }

  const unused: number[] = [];
  for (const n of byN.keys()) {
    if (!referencedSet.has(n)) {
      unused.push(n);
      issues.push({
        code: 'unused_citation',
        message: `Citation [${n}] retornada mas não referenciada no texto.`,
        n,
      });
    }
  }

  // Sequencialidade: numeração deve começar em 1 e cobrir 1..N sem lacunas.
  const numbers = Array.from(byN.keys()).sort((a, b) => a - b);
  for (let i = 0; i < numbers.length; i += 1) {
    if (numbers[i] !== i + 1) {
      issues.push({
        code: 'non_sequential',
        message: `Numeração não sequencial: esperado [${i + 1}], encontrado [${numbers[i]}].`,
        n: numbers[i],
      });
      break;
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    missing,
    unused,
    referenced,
  };
}
