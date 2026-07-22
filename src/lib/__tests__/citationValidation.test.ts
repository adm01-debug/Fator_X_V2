import { describe, it, expect } from 'vitest';
import {
  validateCitations,
  extractMarkerNumbers,
  MAX_CITATIONS,
} from '@/lib/citationValidation';
import type { CerebroCitation } from '@/types/cerebroCitations';

const cit = (n: number, over: Partial<CerebroCitation> = {}): CerebroCitation => ({
  n,
  chunk_id: `chunk-${n}`,
  document_id: `00000000-0000-0000-0000-00000000000${n}`,
  document_title: `Doc ${n}`,
  page: n,
  section: null,
  snippet: `Trecho ${n}`,
  ...over,
});

describe('extractMarkerNumbers', () => {
  it('extrai números únicos em ordem', () => {
    expect(extractMarkerNumbers('a [1] b [2] c [1] d [3]')).toEqual([1, 2, 3]);
  });
  it('ignora string vazia', () => {
    expect(extractMarkerNumbers('')).toEqual([]);
  });
  it('ignora [0] e valores fora do padrão', () => {
    expect(extractMarkerNumbers('lorem [0] ipsum [12] dolor')).toEqual([12]);
  });
});

describe('validateCitations', () => {
  it('aceita cenário consistente 1..N', () => {
    const r = validateCitations('foo [1] bar [2]', [cit(1), cit(2)]);
    expect(r.valid).toBe(true);
    expect(r.issues).toHaveLength(0);
    expect(r.missing).toEqual([]);
    expect(r.unused).toEqual([]);
  });

  it('detecta marcador sem citation correspondente', () => {
    const r = validateCitations('foo [1] [3]', [cit(1)]);
    expect(r.valid).toBe(false);
    expect(r.missing).toEqual([3]);
    expect(r.issues.some((i) => i.code === 'missing_reference' && i.n === 3)).toBe(true);
  });

  it('detecta citation não referenciada', () => {
    const r = validateCitations('só [1]', [cit(1), cit(2)]);
    expect(r.unused).toEqual([2]);
    expect(r.issues.some((i) => i.code === 'unused_citation' && i.n === 2)).toBe(true);
  });

  it('bloqueia mais de 8 citations', () => {
    const many = Array.from({ length: MAX_CITATIONS + 1 }, (_, i) => cit(i + 1));
    const text = many.map((c) => `[${c.n}]`).join(' ');
    const r = validateCitations(text, many);
    expect(r.issues.some((i) => i.code === 'too_many')).toBe(true);
  });

  it('detecta n duplicado', () => {
    const r = validateCitations('[1] [1]', [cit(1), cit(1, { chunk_id: 'other' })]);
    expect(r.issues.some((i) => i.code === 'duplicate_n')).toBe(true);
  });

  it('detecta chunk_id duplicado entre n diferentes', () => {
    const r = validateCitations('[1] [2]', [cit(1), cit(2, { chunk_id: 'chunk-1' })]);
    expect(r.issues.some((i) => i.code === 'duplicate_chunk')).toBe(true);
  });

  it('detecta numeração não-sequencial (lacuna)', () => {
    const r = validateCitations('[1] [3]', [cit(1), cit(3)]);
    expect(r.issues.some((i) => i.code === 'non_sequential')).toBe(true);
  });

  it('detecta campos obrigatórios faltando', () => {
    const bad = cit(1, { chunk_id: '', document_title: '', snippet: '' });
    const r = validateCitations('[1]', [bad]);
    const codes = r.issues.filter((i) => i.code === 'missing_field').map((i) => i.message);
    expect(codes.length).toBeGreaterThanOrEqual(3);
  });

  it('permite limite exato de 8', () => {
    const eight = Array.from({ length: MAX_CITATIONS }, (_, i) => cit(i + 1));
    const text = eight.map((c) => `[${c.n}]`).join(' ');
    const r = validateCitations(text, eight);
    expect(r.valid).toBe(true);
  });
});
