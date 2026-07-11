/**
 * Sanitização de HTML/Markdown com DOMPurify.
 *
 * Uso obrigatório em qualquer renderização de conteúdo gerado por usuário:
 * Knowledge Base, Oráculo, Fórum, Help Center, comentários e templates.
 *
 * NUNCA passe conteúdo não sanitizado para `dangerouslySetInnerHTML`.
 */
import DOMPurify, { type Config } from "dompurify";

const RICH_TEXT_CONFIG: Config = {
  ALLOWED_TAGS: [
    "a", "b", "i", "em", "strong", "u", "s", "code", "pre",
    "p", "br", "hr", "blockquote",
    "ul", "ol", "li",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "table", "thead", "tbody", "tr", "th", "td",
    "img", "figure", "figcaption",
    "span", "div",
  ],
  ALLOWED_ATTR: [
    "href", "title", "target", "rel",
    "src", "alt", "width", "height",
    "class", "id",
  ],
  ALLOWED_URI_REGEXP:
    /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input"],
  FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur"],
  RETURN_TRUSTED_TYPE: false,
};

const STRICT_CONFIG: Config = {
  ALLOWED_TAGS: ["b", "i", "em", "strong", "code", "a", "br", "p"],
  ALLOWED_ATTR: ["href", "title", "rel"],
};

/**
 * Sanitiza HTML rico (KB, artigos, respostas do Oráculo).
 * Preserva formatação essencial (headings, listas, tabelas, imagens).
 */
export function sanitizeRichText(dirty: string): string {
  if (typeof dirty !== "string") return "";
  const clean = DOMPurify.sanitize(dirty, RICH_TEXT_CONFIG);
  return typeof clean === "string" ? clean : String(clean);
}

/**
 * Sanitiza HTML restrito (comentários, snippets curtos, mensagens de chat).
 */
export function sanitizeStrict(dirty: string): string {
  if (typeof dirty !== "string") return "";
  const clean = DOMPurify.sanitize(dirty, STRICT_CONFIG);
  return typeof clean === "string" ? clean : String(clean);
}

/**
 * Remove TODAS as tags HTML. Útil para preview em texto puro / snippets.
 */
export function stripHtml(dirty: string): string {
  if (typeof dirty !== "string") return "";
  return DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

/**
 * Helper para React: retorna um objeto pronto para `dangerouslySetInnerHTML`.
 * Prefira sempre sobre construção manual — garante que DOMPurify foi aplicado.
 */
export function toSafeHtml(dirty: string, mode: "rich" | "strict" = "rich") {
  const clean = mode === "rich" ? sanitizeRichText(dirty) : sanitizeStrict(dirty);
  return { __html: clean };
}
