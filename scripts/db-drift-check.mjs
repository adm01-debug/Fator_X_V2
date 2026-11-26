#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════
 * db-drift-check.mjs — Detecção de drift banco × repositório
 * ═══════════════════════════════════════════════════════════════════
 * Motivação (auditoria 2026-09-05): migrations eram REGISTRADAS em
 * supabase_migrations.schema_migrations sem que o SQL fosse EXECUTADO,
 * criando divergência silenciosa entre repo e produção (39/215 tabelas
 * com RLS, cron vazio, funções declaradas e inexistentes).
 *
 * Este script consulta o banco de produção via MCP (URL em DB_MCP_URL)
 * e valida três invariantes:
 *   1. Toda migration do repo está registrada no banco (e vice-versa);
 *   2. RLS cobertura = 100% das tabelas public;
 *   3. Zero grants de escrita (INSERT/UPDATE/DELETE/TRUNCATE) para anon.
 *
 * Exit 1 com relatório se qualquer invariante quebrar.
 * Sem DB_MCP_URL: exit 0 com warning (opt-in, igual aos demais jobs).
 * ═══════════════════════════════════════════════════════════════════
 */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const MCP_URL = process.env.DB_MCP_URL;
const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

if (!MCP_URL) {
  console.log('::warning::DB_MCP_URL não configurado — db-drift-check pulado (opt-in).');
  process.exit(0);
}

// ── Cliente MCP mínimo (Streamable HTTP: initialize → initialized → call) ──
let sessionId = null;

async function rpc(method, params, isNotification = false) {
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  };
  if (sessionId) headers['mcp-session-id'] = sessionId;
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: isNotification ? undefined : Date.now(), method, params }),
  });
  const newSession = res.headers.get('mcp-session-id');
  if (newSession) sessionId = newSession;
  if (isNotification) return null;
  if (!res.ok) throw new Error(`MCP HTTP ${res.status}: ${await res.text().catch(() => '')}`);
  const raw = await res.text();
  // Streamable HTTP pode responder SSE (event-stream) ou JSON direto.
  const payload = raw.startsWith('{')
    ? JSON.parse(raw)
    : JSON.parse((raw.split('\n').find((l) => l.startsWith('data:')) || 'data:{}').slice(5));
  if (payload.error) throw new Error(`MCP error: ${JSON.stringify(payload.error)}`);
  return payload.result;
}

async function sql(query) {
  const result = await rpc('tools/call', {
    name: 'supabase_db_query',
    arguments: { query, read_only: true },
  });
  const text = result?.content?.[0]?.text;
  if (text === undefined) throw new Error(`Resposta MCP inesperada: ${JSON.stringify(result).slice(0, 400)}`);
  const parsed = JSON.parse(text);
  return parsed.results?.[0]?.rows ?? parsed.rows ?? [];
}

// ── Handshake MCP (Streamable HTTP exige initialize + initialized) ──
const init = await rpc('initialize', {
  protocolVersion: '2025-03-26',
  capabilities: {},
  clientInfo: { name: 'ci-db-drift-check', version: '1.0.0' },
});
console.log(`MCP conectado: ${init?.serverInfo?.name ?? 'desconhecido'} ${init?.serverInfo?.version ?? ''}`.trim());
await rpc('notifications/initialized', {}, true);

// ── Invariantes ─────────────────────────────────────────────────────
const failures = [];
const report = [];

// Migrations que ESTA pull request adiciona: o merge é quem as aplica, então
// cobrá-las do banco antes do merge bloquearia todo PR com migration nova.
// Sem GITHUB_BASE_REF (push em main, workflow_dispatch) o conjunto é vazio e
// a invariante volta a cobrar o repositório inteiro — é o que pega drift real.
function migrationsDaPullRequest() {
  const base = process.env.GITHUB_BASE_REF;
  if (!base) return new Set();
  try {
    const out = execFileSync('git', ['diff', '--name-only', `origin/${base}...HEAD`, '--', 'supabase/migrations'], {
      encoding: 'utf8',
    });
    return new Set(
      out
        .split('\n')
        .filter((f) => f.endsWith('.sql'))
        .map((f) => f.split('/').pop().slice(0, 14)),
    );
  } catch {
    // clone raso/sem ref da base: cai no comportamento estrito original
    return new Set();
  }
}

// 1. Migrations: repo × schema_migrations
const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => f.slice(0, 14));
const novasNaPR = migrationsDaPullRequest();
const dbVersions = new Set((await sql('SELECT version FROM supabase_migrations.schema_migrations')).map((r) => r.version));
const repoSet = new Set(files);
const missingInDb = [...repoSet].filter((v) => !dbVersions.has(v) && !novasNaPR.has(v)).sort();
const pendentesNaPR = [...repoSet].filter((v) => !dbVersions.has(v) && novasNaPR.has(v)).sort();
const missingInRepo = [...dbVersions].filter((v) => !repoSet.has(v)).sort();
report.push(`Migrations: repo=${repoSet.size} banco=${dbVersions.size} | faltam no banco=${missingInDb.length} faltam no repo=${missingInRepo.length}`);
report.push(`Migrations novas nesta PR (aplicar no merge): ${pendentesNaPR.length ? pendentesNaPR.join(', ') : 'nenhuma'}`);
if (missingInDb.length) {
  failures.push(`Migrations presentes no repo mas NÃO registradas no banco (aplicar ou remover): ${missingInDb.slice(0, 20).join(', ')}${missingInDb.length > 20 ? ' …' : ''}`);
}
if (missingInRepo.length) {
  failures.push(`Migrations registradas no banco mas INEXISTENTES no repo: ${missingInRepo.slice(0, 20).join(', ')}`);
}

// 2. RLS 100% em public
const rlsRows = await sql(
  `SELECT count(*) AS total, count(*) FILTER (WHERE c.relrowsecurity) AS com_rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'`,
);
const { total, com_rls } = rlsRows[0];
report.push(`RLS: ${com_rls}/${total} tabelas com RLS`);
if (Number(com_rls) !== Number(total)) {
  failures.push(`RLS incompleto: ${total - com_rls} tabela(s) sem RLS (esperado 100% — ver migration 20260905120000)`);
}

// 3. Zero grants de escrita para anon
const anonRows = await sql(
  `SELECT count(*) AS n FROM information_schema.role_table_grants WHERE grantee='anon' AND table_schema='public' AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')`,
);
const anonWrites = Number(anonRows[0].n);
report.push(`Grants de escrita para anon: ${anonWrites}`);
if (anonWrites > 0) {
  failures.push(`${anonWrites} grant(s) de escrita para anon detectado(s) — escalação de privilégio (ver Onda 1 da auditoria)`);
}

console.log('── db-drift-check ──');
for (const line of report) console.log(`  ${line}`);

if (failures.length) {
  console.error(`\n❌ ${failures.length} invariante(s) de drift violada(s):`);
  for (const f of failures) console.error(`  — ${f}`);
  process.exit(1);
}
console.log('\n✅ Banco sincronizado com o repositório (migrations, RLS 100%, zero escrita anon).');
