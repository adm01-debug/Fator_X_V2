/**
 * Parser leve de frontmatter YAML no estilo Obsidian.
 *
 * Suporta subset seguro (sem eval): strings, números, booleans, null,
 * datas ISO, listas inline `[a, b]` e listas em bloco (`- item`).
 * Retorna também o corpo (markdown) sem o bloco frontmatter, para o
 * preview e o parser de wikilinks operarem só no conteúdo real.
 */

export type FrontmatterValue =
  | string
  | number
  | boolean
  | null
  | FrontmatterValue[]
  | { [k: string]: FrontmatterValue };

export interface ParsedFrontmatter {
  data: Record<string, FrontmatterValue>;
  body: string;
  /** Se havia bloco frontmatter (mesmo vazio). */
  present: boolean;
  /** Offset (em linhas) onde o corpo começa — útil para line-mapping. */
  bodyLineOffset: number;
}

const FENCE = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/;

function coerceScalar(raw: string): FrontmatterValue {
  const s = raw.trim();
  if (s === "" || s === "~" || s.toLowerCase() === "null") return null;
  if (s === "true") return true;
  if (s === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  // string aspada
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  // lista inline [a, b, "c"]
  if (s.startsWith("[") && s.endsWith("]")) {
    const inner = s.slice(1, -1).trim();
    if (inner === "") return [];
    return inner.split(",").map((it) => coerceScalar(it));
  }
  return s;
}

export function parseFrontmatter(text: string): ParsedFrontmatter {
  if (!text || !text.startsWith("---")) {
    return { data: {}, body: text ?? "", present: false, bodyLineOffset: 0 };
  }
  const m = FENCE.exec(text);
  if (!m) return { data: {}, body: text, present: false, bodyLineOffset: 0 };

  const block = m[1];
  const data: Record<string, FrontmatterValue> = {};
  const lines = block.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "" || line.trim().startsWith("#")) { i++; continue; }
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!kv) { i++; continue; }
    const key = kv[1];
    const rest = kv[2];
    if (rest.trim() === "") {
      // lista em bloco?
      const items: FrontmatterValue[] = [];
      let j = i + 1;
      while (j < lines.length && /^\s*-\s+/.test(lines[j])) {
        items.push(coerceScalar(lines[j].replace(/^\s*-\s+/, "")));
        j++;
      }
      if (items.length > 0) {
        data[key] = items;
        i = j;
        continue;
      }
      data[key] = null;
    } else {
      data[key] = coerceScalar(rest);
    }
    i++;
  }

  const body = text.slice(m[0].length);
  const bodyLineOffset = m[0].split(/\r?\n/).length - 1;
  return { data, body, present: true, bodyLineOffset };
}

/** Serializa `data` como bloco frontmatter estável (chaves ordenadas). */
export function stringifyFrontmatter(data: Record<string, FrontmatterValue>): string {
  const keys = Object.keys(data).sort();
  if (keys.length === 0) return "";
  const lines: string[] = ["---"];
  for (const k of keys) {
    const v = data[k];
    if (Array.isArray(v)) {
      lines.push(`${k}:`);
      for (const item of v) lines.push(`  - ${formatScalar(item)}`);
    } else {
      lines.push(`${k}: ${formatScalar(v)}`);
    }
  }
  lines.push("---", "");
  return lines.join("\n");
}

function formatScalar(v: FrontmatterValue): string {
  if (v === null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") {
    if (/[:#\-\n]/.test(v) || v.trim() !== v) return JSON.stringify(v);
    return v;
  }
  if (Array.isArray(v)) return `[${v.map(formatScalar).join(", ")}]`;
  return JSON.stringify(v);
}

/**
 * Aplica um patch nas properties, preservando o corpo markdown.
 * Retorna o texto completo (frontmatter + body).
 */
export function upsertFrontmatter(
  text: string,
  patch: Record<string, FrontmatterValue>,
): string {
  const { data, body } = parseFrontmatter(text);
  const merged = { ...data, ...patch };
  // remove chaves com valor `undefined` explícito? patch usa null para limpar.
  const fm = stringifyFrontmatter(merged);
  return fm + body;
}
