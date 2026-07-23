/**
 * templateEngine — substituição segura de placeholders em templates de nota.
 *
 * Placeholders suportados:
 *  - {{date}}       → YYYY-MM-DD (data local)
 *  - {{datetime}}   → YYYY-MM-DD HH:mm
 *  - {{time}}       → HH:mm
 *  - {{title}}      → título fornecido pelo usuário
 *  - {{user}}       → email do usuário logado (ou "")
 *  - {{weekday}}    → segunda, terça, …
 *  - {{year}} {{month}} {{day}}
 *
 * Nada é interpretado como HTML/JS — pura substituição textual.
 */
export interface TemplateContext {
  title?: string;
  user?: string;
  now?: Date;
}

const WEEKDAYS_PT = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
];

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function applyTemplate(input: string, ctx: TemplateContext = {}): string {
  const now = ctx.now ?? new Date();
  const map: Record<string, string> = {
    date: formatDate(now),
    datetime: `${formatDate(now)} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    year: String(now.getFullYear()),
    month: pad(now.getMonth() + 1),
    day: pad(now.getDate()),
    weekday: WEEKDAYS_PT[now.getDay()] ?? "",
    title: ctx.title ?? "",
    user: ctx.user ?? "",
  };
  return input.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, key: string) => {
    const k = key.toLowerCase();
    return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : `{{${key}}}`;
  });
}

/** Data ISO (YYYY-MM-DD) atual em fuso local. */
export function todayIso(): string {
  return formatDate(new Date());
}
