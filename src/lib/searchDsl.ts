/**
 * searchDsl — parser da linguagem de busca estilo Obsidian.
 *
 * Suporta:
 *  - Texto livre: "roadmap alpha"        → match no title/body
 *  - Frase: "\"plano de ação\""          → match exato (case/acento-insensível)
 *  - Filtros: tag:foo  -tag:bar
 *             title:"Reunião"
 *             path:/pasta/           (colection name — mantido como token semântico)
 *             prop:status=doing      (frontmatter YAML)
 *             created:>=2026-01-01   created:<2026-07-01
 *             updated:>=2026-07-01
 *             is:archived  is:daily
 *  - Prefixo `-` nega o token (tag:foo -tag:draft).
 *
 * O parser é puro (sem dependências externas) para permitir testes unitários e
 * reutilização no client sem round-trip ao servidor.
 */

import { foldForSearch } from "./normalize";
import { parseFrontmatter } from "./frontmatter";

export type Comparator = "=" | "!=" | ">" | ">=" | "<" | "<=";

export interface QueryFilter {
  key: string;                // tag | title | body | prop | created | updated | is
  op: Comparator;
  value: string;
  negated: boolean;
  /** For `prop:key=value` — sub-key inside frontmatter. */
  propKey?: string;
}

export interface ParsedQuery {
  text: string[];             // termos livres (folded)
  phrases: string[];          // frases exatas (folded)
  filters: QueryFilter[];
  raw: string;
}

const TOKEN_RE = /(-?[a-zA-Z]+):("[^"]+"|[^\s]+)|"([^"]+)"|(\S+)/g;

export function parseQuery(input: string): ParsedQuery {
  const q: ParsedQuery = { text: [], phrases: [], filters: [], raw: input };
  if (!input.trim()) return q;

  for (const m of input.matchAll(TOKEN_RE)) {
    const [, keyRaw, valRaw, phrase, bare] = m;

    if (keyRaw) {
      const negated = keyRaw.startsWith("-");
      const key = (negated ? keyRaw.slice(1) : keyRaw).toLowerCase();
      const value = valRaw.startsWith('"') && valRaw.endsWith('"')
        ? valRaw.slice(1, -1)
        : valRaw;

      // `prop:key=value` — split
      if (key === "prop") {
        const [pk, ...rest] = value.split(/([=!<>]=?)/);
        const opMatch = rest.join("").match(/^([=!<>]=?)(.*)$/);
        q.filters.push({
          key,
          propKey: pk.trim().toLowerCase(),
          op: (opMatch?.[1] as Comparator) ?? "=",
          value: (opMatch?.[2] ?? "").trim(),
          negated,
        });
        continue;
      }

      // `created:>=DATE` — detecta comparadores
      const cmpMatch = value.match(/^(>=|<=|>|<|!=|=)?(.+)$/);
      q.filters.push({
        key,
        op: (cmpMatch?.[1] as Comparator) ?? "=",
        value: (cmpMatch?.[2] ?? value).trim(),
        negated,
      });
      continue;
    }

    if (phrase) {
      q.phrases.push(foldForSearch(phrase));
      continue;
    }

    if (bare) q.text.push(foldForSearch(bare));
  }

  return q;
}

// ─── evaluator ────────────────────────────────────────────────────────

export interface EvaluatableNote {
  id: string;
  title: string;
  body_md: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  is_archived: boolean;
  collection_id: string;
}

function cmp(a: string, op: Comparator, b: string): boolean {
  const na = Number(a);
  const nb = Number(b);
  const bothNumeric = !Number.isNaN(na) && !Number.isNaN(nb);
  const bothDate = /^\d{4}-\d{2}-\d{2}/.test(a) && /^\d{4}-\d{2}-\d{2}/.test(b);
  const va = bothNumeric ? na : bothDate ? Date.parse(a) : a;
  const vb = bothNumeric ? nb : bothDate ? Date.parse(b) : b;
  switch (op) {
    case "=":  return va === vb;
    case "!=": return va !== vb;
    case ">":  return va > vb;
    case ">=": return va >= vb;
    case "<":  return va < vb;
    case "<=": return va <= vb;
  }
}

export function matchNote(note: EvaluatableNote, q: ParsedQuery): boolean {
  const fTitle = foldForSearch(note.title);
  const fBody = foldForSearch(note.body_md);
  const haystack = `${fTitle}\n${fBody}`;

  // Termos livres — AND
  for (const t of q.text) if (!haystack.includes(t)) return false;
  for (const p of q.phrases) if (!haystack.includes(p)) return false;

  // Filtros
  for (const f of q.filters) {
    const ok = evalFilter(note, f, fTitle, fBody);
    if (f.negated ? ok : !ok) return false;
  }
  return true;
}

function evalFilter(note: EvaluatableNote, f: QueryFilter, fTitle: string, fBody: string): boolean {
  const v = foldForSearch(f.value);
  switch (f.key) {
    case "tag":
      return note.tags.some((t) => foldForSearch(t).includes(v));
    case "title":
      return fTitle.includes(v);
    case "body":
      return fBody.includes(v);
    case "created":
      return cmp(note.created_at, f.op, f.value);
    case "updated":
      return cmp(note.updated_at, f.op, f.value);
    case "is": {
      const flag = f.value.toLowerCase();
      if (flag === "archived") return note.is_archived === true;
      if (flag === "active") return note.is_archived === false;
      if (flag === "daily") return /^\d{4}-\d{2}-\d{2}/.test(note.title);
      return false;
    }
    case "prop": {
      if (!f.propKey) return false;
      const { data } = parseFrontmatter(note.body_md);
      const raw = data[f.propKey];
      if (raw == null) return false;
      return cmp(String(raw), f.op, f.value);
    }
    default:
      return false;
  }
}

// ─── highlight helpers ────────────────────────────────────────────────

export function extractTerms(q: ParsedQuery): string[] {
  return [...q.text, ...q.phrases].filter(Boolean);
}
