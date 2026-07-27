/**
 * Testes do embedder: dimensões, compatibilidade com vector(1536)
 * e contrato HTTP da função implantada.
 */
import { loadSync } from "https://deno.land/std@0.224.0/dotenv/mod.ts";

// examplePath: null — o .env.example do projeto lista secrets opcionais que
// não existem no ambiente de teste e fariam o loader abortar.
loadSync({ export: true, allowEmptyValues: true, examplePath: null });
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CANONICAL_DIM,
  HF_MODEL_MAP,
  hasExactDimension,
  hashEmbed,
  isPgVectorCompatible,
} from "./embedder.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const FN_URL = `${SUPABASE_URL}/functions/v1/rag-embed-v2`;

Deno.test("dimensão canônica espelha as colunas vector(1536)", () => {
  assertEquals(CANONICAL_DIM, 1536);
});

Deno.test("hashEmbed devolve exatamente a dimensão pedida", () => {
  const v = hashEmbed("contrato de fornecimento", CANONICAL_DIM);
  assertEquals(v.length, CANONICAL_DIM);
  assert(isPgVectorCompatible(v));
});

Deno.test("hashEmbed é determinístico e normalizado em L2", () => {
  const a = hashEmbed("política de backup", CANONICAL_DIM);
  const b = hashEmbed("política de backup", CANONICAL_DIM);
  assertEquals(a, b);
  const norm = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
  assert(Math.abs(norm - 1) < 1e-9, `norma L2 = ${norm}`);
});

Deno.test("hashEmbed nunca produz NaN/Infinity", () => {
  for (const text of ["a", "ação çãü", "1234567890".repeat(80)]) {
    const v = hashEmbed(text, CANONICAL_DIM);
    assert(v.every(Number.isFinite), `vetor inválido para "${text.slice(0, 12)}"`);
  }
});

Deno.test("hasExactDimension rejeita dimensão nativa divergente", () => {
  // Qwen3-Embedding-8B devolve 4096 nativo e ignora o parâmetro pedido.
  assertEquals(hasExactDimension([new Array(4096).fill(0)], CANONICAL_DIM), false);
  assertEquals(hasExactDimension([new Array(1536).fill(0)], CANONICAL_DIM), true);
  assertEquals(hasExactDimension([], CANONICAL_DIM), false);
  // Lote misto: um único vetor errado invalida a resposta inteira.
  assertEquals(
    hasExactDimension([new Array(1536).fill(0), new Array(1024).fill(0)], CANONICAL_DIM),
    false,
  );
});

Deno.test("isPgVectorCompatible rejeita vetor com valor não finito", () => {
  const v = hashEmbed("teste", CANONICAL_DIM);
  v[0] = Number.NaN;
  assertEquals(isPgVectorCompatible(v), false);
});

Deno.test("mapa de provedores HF cobre os modelos suportados", () => {
  assertEquals(HF_MODEL_MAP["qwen3-embedding-8b"], "Qwen/Qwen3-Embedding-8B");
  assertEquals(HF_MODEL_MAP["bge-m3"], "BAAI/bge-m3");
});

Deno.test("HTTP: exige autenticação", async () => {
  const resp = await fetch(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texts: ["oi"] }),
  });
  const body = await resp.text();
  assertEquals(resp.status, 401, body);
});

Deno.test("HTTP: rejeita token inválido (anon key não é sessão)", async () => {
  const resp = await fetch(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON_KEY}` },
    body: JSON.stringify({ texts: ["oi"] }),
  });
  const body = await resp.text();
  assertEquals(resp.status, 401, body);
});

Deno.test("HTTP: preflight CORS responde OK", async () => {
  const resp = await fetch(FN_URL, {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:8080",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization, content-type",
    },
  });
  await resp.text();
  assert(resp.status === 200 || resp.status === 204, `status ${resp.status}`);
  assert(resp.headers.get("access-control-allow-origin") !== null, "sem allow-origin");
});
