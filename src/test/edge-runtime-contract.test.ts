import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Guard de contrato de runtime das Edge Functions.
 *
 * Contexto do incidente: 41 funções ficaram permanentemente inacessíveis
 * porque liam `rate.success` — propriedade que `checkRateLimit()` nunca
 * retornou (o contrato é `allowed`). Como `!undefined === true`, TODA
 * requisição era barrada com 429 antes de qualquer lógica, independentemente
 * da cota. Em paralelo, `getCorsHeaders` era usado sem import em 7 funções,
 * produzindo `ReferenceError` no primeiro request.
 *
 * Ambos são erros que o TypeScript do frontend não pega (as Edge Functions
 * rodam em Deno, fora do `tsc` do projeto) e que os logs só revelam depois de
 * o usuário reclamar. Este guard os transforma em falha de CI.
 */

const FUNCTIONS_DIR = join(process.cwd(), "supabase", "functions");

/** Símbolos compartilhados que, se usados, precisam estar importados. */
const REQUIRED_IMPORT_SYMBOLS = [
  "getCorsHeaders",
  "handleCorsPreflight",
  "checkRateLimit",
  "createRateLimitResponse",
  "getRateLimitIdentifier",
  "RATE_LIMITS",
];

function collectFunctionEntrypoints(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    if (entry === "_shared") continue;
    for (const file of readdirSync(full)) {
      if (file.endsWith(".ts") && !file.includes(".test.")) out.push(join(full, file));
    }
  }
  return out;
}

function stripCommentsAndStrings(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/`(?:\\[\s\S]|[^\\`])*`/g, "``")
    .replace(/"(?:\\[\s\S]|[^\\"])*"/g, '""')
    .replace(/'(?:\\[\s\S]|[^\\'])*'/g, "''");
}

const files = collectFunctionEntrypoints(FUNCTIONS_DIR);

describe("Edge Functions — contrato de runtime", () => {
  it("encontra os entrypoints das Edge Functions", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("nunca lê `.success` do resultado de checkRateLimit (o contrato é `.allowed`)", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const code = stripCommentsAndStrings(readFileSync(file, "utf8"));
      if (!code.includes("checkRateLimit")) continue;
      // Captura tanto `rate.success` / `rateCheck.success` quanto o
      // destructuring `const { success } = await checkRateLimit(...)`.
      const dotted = /\b(rate|rateCheck|rateLimit|limitCheck)\s*\.\s*success\b/.test(code);
      const destructured = /\{[^}]*\bsuccess\b[^}]*\}\s*=\s*(await\s+)?checkRateLimit/.test(code);
      if (dotted || destructured) offenders.push(relative(process.cwd(), file));
    }
    expect(offenders, `Use \`.allowed\` — \`.success\` é sempre undefined e bloqueia 100% das requisições:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("nunca passa o Request cru como headers de CORS para createRateLimitResponse", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const code = stripCommentsAndStrings(readFileSync(file, "utf8"));
      const matches = code.match(/createRateLimitResponse\(([^)]*)\)/g) ?? [];
      for (const m of matches) {
        const args = m.slice("createRateLimitResponse(".length, -1).split(",").map((a) => a.trim());
        if (args.length >= 2 && /^req(uest)?$/.test(args[1])) {
          offenders.push(`${relative(process.cwd(), file)} → ${m}`);
        }
      }
    }
    expect(offenders, `O 2º argumento são headers de CORS, não o Request — sem isso o 429 chega sem CORS e o browser não consegue lê-lo:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("só usa presets de rate limit que existem em RATE_LIMITS", () => {
    const limiterSrc = readFileSync(join(FUNCTIONS_DIR, "_shared", "rate-limiter.ts"), "utf8");
    const block = limiterSrc.slice(limiterSrc.indexOf("export const RATE_LIMITS"));
    const known = new Set(
      Array.from(block.slice(0, block.indexOf("};")).matchAll(/^\s{2}(\w+)\s*:/gm)).map((m) => m[1]),
    );
    expect(known.size).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of files) {
      const code = stripCommentsAndStrings(readFileSync(file, "utf8"));
      for (const m of code.matchAll(/RATE_LIMITS\.(\w+)/g)) {
        if (!known.has(m[1])) offenders.push(`${relative(process.cwd(), file)} → RATE_LIMITS.${m[1]}`);
      }
    }
    expect(offenders, `Preset inexistente cai silenciosamente em undefined:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("importa todo símbolo compartilhado que utiliza (evita ReferenceError no 1º request)", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const raw = readFileSync(file, "utf8");
      const code = stripCommentsAndStrings(raw);
      // Imports podem aparecer em qualquer ponto do arquivo (várias funções
      // declaram schemas Zod antes do bloco de imports compartilhados), então
      // coletamos TODAS as declarações, não só o cabeçalho.
      const importSection = (code.match(/import[\s\S]*?from\s*["'][^"']*["']/g) ?? []).join("\n");
      const body = code.split(/import[\s\S]*?from\s*["'][^"']*["']/).join("\n");
      for (const symbol of REQUIRED_IMPORT_SYMBOLS) {
        const used = new RegExp(`\\b${symbol}\\b`).test(body);
        if (!used) continue;
        const imported = new RegExp(`\\b${symbol}\\b`).test(importSection);
        const declared = new RegExp(`(const|let|function)\\s+${symbol}\\b`).test(code);
        if (!imported && !declared) offenders.push(`${relative(process.cwd(), file)} → ${symbol}`);
      }
    }
    expect(offenders, `Símbolo usado sem import nem declaração local — ReferenceError em produção:\n${offenders.join("\n")}`).toEqual([]);

  });
});
