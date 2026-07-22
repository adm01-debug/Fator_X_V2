/**
 * Parser de wikilinks e tags no estilo Obsidian.
 *
 * Suporta:
 *   [[Título]]                → note
 *   [[Título|alias]]          → note com alias
 *   [[Título#seção]]          → note âncora
 *   [[doc:Nome do PDF]]       → document
 *   [[@Entidade]]             → entity
 *   #tag                      → tag (kebab/underscore aceitos)
 *
 * Retorna também o `context` (trecho ao redor do link) usado para preview
 * de backlinks (padrão Obsidian "linked mentions").
 */

export type WikilinkTargetType = "note" | "document" | "entity" | "tag";

export interface ParsedWikilink {
  raw: string;
  targetType: WikilinkTargetType;
  /** título/nome usado para resolver o alvo */
  label: string;
  /** alias exibido no texto (após |) — cai no label se ausente */
  alias: string | null;
  /** âncora após # */
  section: string | null;
  /** trecho ao redor da menção, para preview de backlinks */
  context: string;
  /** offset absoluto no texto original */
  index: number;
}

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;
const TAG_RE = /(^|[\s(])(#[a-zA-Z0-9][\w-]{0,63})(?=$|[\s.,;:!?)])/g;

function contextAround(text: string, index: number, length: number, radius = 60): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + length + radius);
  const before = start > 0 ? "…" : "";
  const after = end < text.length ? "…" : "";
  return (before + text.slice(start, end) + after).replace(/\s+/g, " ").trim();
}

export function parseWikilinks(text: string): ParsedWikilink[] {
  if (!text) return [];
  const out: ParsedWikilink[] = [];
  let m: RegExpExecArray | null;
  WIKILINK_RE.lastIndex = 0;

  while ((m = WIKILINK_RE.exec(text)) !== null) {
    const raw = m[0];
    let inner = m[1].trim();
    if (!inner) continue;

    let alias: string | null = null;
    const pipeIdx = inner.indexOf("|");
    if (pipeIdx !== -1) {
      alias = inner.slice(pipeIdx + 1).trim() || null;
      inner = inner.slice(0, pipeIdx).trim();
    }

    let section: string | null = null;
    const hashIdx = inner.indexOf("#");
    if (hashIdx !== -1) {
      section = inner.slice(hashIdx + 1).trim() || null;
      inner = inner.slice(0, hashIdx).trim();
    }

    let targetType: WikilinkTargetType = "note";
    let label = inner;
    if (/^doc:/i.test(inner)) {
      targetType = "document";
      label = inner.slice(4).trim();
    } else if (inner.startsWith("@")) {
      targetType = "entity";
      label = inner.slice(1).trim();
    }
    if (!label) continue;

    out.push({
      raw,
      targetType,
      label,
      alias,
      section,
      context: contextAround(text, m.index, raw.length),
      index: m.index,
    });
  }
  return out;
}

export function parseTags(text: string): string[] {
  if (!text) return [];
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(text)) !== null) {
    set.add(m[2].slice(1).toLowerCase());
  }
  return [...set].sort();
}

export interface ExtractedLinks {
  wikilinks: ParsedWikilink[];
  tags: string[];
}

export function extractLinks(text: string): ExtractedLinks {
  return { wikilinks: parseWikilinks(text), tags: parseTags(text) };
}

/**
 * Substitui `[[…]]` por HTML/Markdown clicável. `resolve(label,type)` deve
 * devolver `href` ou `null` (quando alvo desconhecido — link "vermelho"
 * padrão Obsidian: cria a nota sob demanda no clique).
 */
export function renderWikilinksToMarkdown(
  text: string,
  resolve: (label: string, type: WikilinkTargetType) => string | null,
): string {
  const links = parseWikilinks(text);
  if (links.length === 0) return text;
  let out = "";
  let cursor = 0;
  for (const l of links) {
    out += text.slice(cursor, l.index);
    const display = l.alias ?? l.label + (l.section ? ` › ${l.section}` : "");
    const href = resolve(l.label, l.targetType);
    if (href) {
      out += `[${display}](${href})`;
    } else {
      // link não-resolvido — marcador visível para o usuário criar
      out += `[${display}](wikilink:new/${encodeURIComponent(l.targetType)}/${encodeURIComponent(l.label)})`;
    }
    cursor = l.index + l.raw.length;
  }
  out += text.slice(cursor);
  return out;
}
