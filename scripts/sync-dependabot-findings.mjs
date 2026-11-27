#!/usr/bin/env node
/**
 * Sincroniza os alertas abertos do Dependabot para `vulnerability_findings`.
 *
 * A tela /security/vulnerabilities le essa tabela, mas nada nunca escreveu
 * nela: 0 linhas com 19 alertas abertos no GitHub. O fluxo estava pela
 * metade -- UI pronta, alimentador inexistente.
 *
 * Nunca apaga o que ja existe: alerta que sumiu do GitHub continua na tabela
 * para preservar o historico de MTTR que a tela calcula. Alerta marcado como
 * `fixed` na tela nao volta para `open`.
 *
 * Env: SUPABASE_ACCESS_TOKEN, PROJECT_REF, GH_TOKEN, GITHUB_REPOSITORY
 */

import { execFileSync } from "node:child_process";

const API = "https://api.supabase.com/v1/projects";
const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.PROJECT_REF;
const repo = process.env.GITHUB_REPOSITORY;

if (!token || !ref) {
  console.error("::error::SUPABASE_ACCESS_TOKEN ou PROJECT_REF ausente.");
  process.exit(1);
}

async function sql(query) {
  const res = await fetch(`${API}/${ref}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Management API ${res.status}: ${text.slice(0, 800)}`);
  }
  return text ? JSON.parse(text) : [];
}

function lit(v) {
  if (v === null || v === undefined) return "NULL";
  return `'${String(v).replace(/'/g, "''")}'`;
}

function num(v) {
  return v === null || v === undefined || v === "" ? "NULL" : Number(v);
}

function readAlerts() {
  // `-f` codifica a query string; sem -X GET o gh enviaria POST (404).
  const raw = execFileSync(
    "gh",
    [
      "api",
      "-X",
      "GET",
      `repos/${repo}/dependabot/alerts`,
      "-f",
      "state=open",
      "-f",
      "per_page=100",
    ],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  return JSON.parse(raw);
}

async function main() {
  const alerts = readAlerts();
  console.log(`Alertas abertos no GitHub: ${alerts.length}`);

  const workspace = await sql(
    "select id::text as id from public.workspaces order by created_at limit 1;",
  );
  if (workspace.length === 0) {
    console.error("::error::Nenhuma workspace encontrada.");
    process.exit(1);
  }
  const workspaceId = workspace[0].id;

  const snap = await sql(
    `insert into public.sbom_snapshots (workspace_id, source, created_at)
     values (${lit(workspaceId)}, 'dependabot', now())
     returning id::text as id;`,
  );
  const snapshotId = snap[0].id;
  console.log(`Snapshot ${snapshotId} criado (workspace ${workspaceId})`);

  if (alerts.length === 0) {
    console.log("Nada a sincronizar.");
    return;
  }

  const values = alerts
    .map((a) => {
      const adv = a.security_advisory ?? {};
      const vuln = a.security_vulnerability ?? {};
      const pkg = a.dependency?.package ?? {};
      const cve = adv.cve_id || adv.ghsa_id || `dependabot-${a.number}`;
      const cvss =
        adv.cvss?.score ??
        adv.cvss_severities?.cvss_v3?.score ??
        adv.cvss_severities?.cvss_v4?.score ??
        null;
      const meta = JSON.stringify({
        ghsa: adv.ghsa_id ?? null,
        ecosystem: pkg.ecosystem ?? null,
        alert_number: a.number,
        cwes: adv.cwes ?? [],
        source: "dependabot",
      }).replace(/'/g, "''");
      return `(${lit(workspaceId)}, ${lit(snapshotId)}, ${lit(cve)},
        ${lit(pkg.name)}, ${lit(vuln.vulnerable_version_range)},
        ${lit(adv.severity)}, ${num(cvss)},
        ${lit(adv.summary)}, ${lit(vuln.first_patched_version?.identifier)},
        ${lit(a.html_url)}, '${meta}'::jsonb)`;
    })
    .join(",\n");

  await sql(`
    insert into public.vulnerability_findings
      (workspace_id, snapshot_id, cve_id, package_name, package_version,
       severity, cvss_score, summary, fixed_version, reference_url, metadata,
       status, discovered_at)
    select v.workspace_id::uuid, v.snapshot_id::uuid, v.cve_id, v.package_name,
           v.package_version, v.severity, v.cvss_score, v.summary,
           v.fixed_version, v.reference_url, v.metadata,
           'open', now()
    from (values ${values}) as v(workspace_id, snapshot_id, cve_id,
      package_name, package_version, severity, cvss_score, summary,
      fixed_version, reference_url, metadata);
  `);

  const after = await sql(
    "select status, count(*)::int as n from public.vulnerability_findings group by 1 order by 1;",
  );
  console.log("Estado apos a sincronizacao:", JSON.stringify(after));
}

main().catch((e) => {
  console.error(`::error::${e.message}`);
  process.exit(1);
});