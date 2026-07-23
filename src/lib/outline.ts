/**
 * Extrai o outline (sumário) de um markdown: heading level + texto + linha.
 * Ignora headings dentro de blocos de código cercados por ```.
 */
export interface OutlineHeading {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
  line: number;
  /** Slug estável para âncora (kebab, sem acentos). */
  slug: string;
}

function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

export function parseOutline(markdown: string): OutlineHeading[] {
  if (!markdown) return [];
  const lines = markdown.split("\n");
  const out: OutlineHeading[] = [];
  let inFence = false;
  const seen = new Map<string, number>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = HEADING_RE.exec(line);
    if (!m) continue;
    const level = m[1].length as OutlineHeading["level"];
    const text = m[2].trim();
    if (!text) continue;
    let slug = slugify(text);
    const n = seen.get(slug) ?? 0;
    seen.set(slug, n + 1);
    if (n > 0) slug = `${slug}-${n}`;
    out.push({ level, text, line: i, slug });
  }
  return out;
}
