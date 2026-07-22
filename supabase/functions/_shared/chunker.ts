/**
 * Shared chunker for RAG ingestion.
 *
 * Strategies:
 *   - fixed:     hard slice by character window with overlap.
 *   - paragraph: split by blank lines; pack paragraphs up to target size, then overlap trailing chars.
 *   - sentence:  split by sentence terminators; pack sentences up to target size, then overlap trailing chars.
 *
 * All strategies respect `size` and `overlap` and never emit empty chunks.
 */
export type ChunkStrategy = 'fixed' | 'paragraph' | 'sentence';

export interface ChunkOptions {
  size: number;
  overlap: number;
  strategy: ChunkStrategy;
}

export const CHUNK_LIMITS = {
  minSize: 200,
  maxSize: 4000,
  minOverlap: 0,
} as const;

export function normalizeChunkOptions(o: Partial<ChunkOptions>): ChunkOptions {
  const size = Math.max(
    CHUNK_LIMITS.minSize,
    Math.min(CHUNK_LIMITS.maxSize, Math.floor(o.size ?? 1000)),
  );
  const overlap = Math.max(
    CHUNK_LIMITS.minOverlap,
    Math.min(size - 1, Math.floor(o.overlap ?? 200)),
  );
  const strategy: ChunkStrategy =
    o.strategy === 'paragraph' || o.strategy === 'sentence' ? o.strategy : 'fixed';
  return { size, overlap, strategy };
}

function fixedChunk(text: string, size: number, overlap: number): string[] {
  const out: string[] = [];
  const step = Math.max(1, size - overlap);
  for (let start = 0; start < text.length; start += step) {
    const end = Math.min(start + size, text.length);
    const slice = text.slice(start, end).trim();
    if (slice) out.push(slice);
    if (end === text.length) break;
  }
  return out;
}

function packUnits(units: string[], size: number, overlap: number): string[] {
  const out: string[] = [];
  let buf = '';
  for (const u of units) {
    const candidate = buf ? `${buf}\n${u}` : u;
    if (candidate.length <= size) {
      buf = candidate;
      continue;
    }
    if (buf) {
      out.push(buf.trim());
      // Carry a tail of size `overlap` into the next buffer
      const tail = overlap > 0 && buf.length > overlap ? buf.slice(-overlap) : '';
      buf = tail ? `${tail}\n${u}` : u;
    } else {
      // Single unit larger than size — fallback slice
      out.push(...fixedChunk(u, size, overlap));
      buf = '';
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter(Boolean);
}

export function chunkText(text: string, opts: Partial<ChunkOptions> = {}): string[] {
  const { size, overlap, strategy } = normalizeChunkOptions(opts);
  const clean = text.replace(/\r\n/g, '\n');
  if (!clean.trim()) return [];

  if (strategy === 'paragraph') {
    const paragraphs = clean.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
    return packUnits(paragraphs, size, overlap);
  }
  if (strategy === 'sentence') {
    // Naive sentence splitter — handles ., !, ?, and paragraph breaks.
    const sentences = clean.split(/(?<=[.!?])\s+|\n{2,}/).map(s => s.trim()).filter(Boolean);
    return packUnits(sentences, size, overlap);
  }
  return fixedChunk(clean, size, overlap);
}
