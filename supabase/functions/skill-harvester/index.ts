/**
 * skill-harvester — coleta skills de agentes no GitHub, classifica por
 * departamento, aplica sanitização/segurança e grava candidatos em staging.
 *
 * Somente admins de workspace podem executar. Nenhuma escrita direta no
 * `skill_registry` — a promoção acontece na curadoria manual.
 */
import {
  getCorsHeaders,
  handleCorsPreflight,
  jsonResponse,
  errorResponse,
  authenticateRequest,
  createAdminClient,
  checkRateLimit,
  getRateLimitIdentifier,
  createRateLimitResponse,
  RATE_LIMITS,
  parseBody,
  z,
  installRuntimeAlerts,
} from "../_shared/mod.ts";
import {
  DEFAULT_TOPICS,
  DEPARTMENT_QUERIES,
  SKILL_DEPARTMENTS,
  isLicenseAllowed,
  type SkillDepartment,
} from "./departments.ts";
import {
  classifyDepartment,
  computeQualityScore,
  inferCategory,
  isMcpUrlAllowed,
  isMetaRepository,

  LOW_CONFIDENCE_THRESHOLD,
  MIN_QUALITY_SCORE,
  normalizeForHash,
  parseFrontmatter,
  scanContentRisks,
  sha256Hex,
  slugify,
  stripUnsafe,
} from "./lib.ts";
import { getRawFile, getTree, resolveMode, searchRepos, type GhRepo } from "./github.ts";

installRuntimeAlerts();

const RequestSchema = z.object({
  departments: z.array(z.enum(SKILL_DEPARTMENTS)).max(10).default([]),
  topics: z.array(z.string().min(2).max(60)).max(20).default([]),
  extraQueries: z.array(z.string().min(2).max(120)).max(20).default([]),
  maxRepos: z.number().int().min(1).max(200).default(40),
  maxCandidates: z.number().int().min(1).max(500).default(120),
  minStars: z.number().int().min(0).max(100000).default(3),
  dryRun: z.boolean().default(false),
});

const SKILL_FILE_RE = /(^|\/)(SKILL\.md|skill\.md)$/;
const AGENT_JSON_RE = /(^|\/)(agent\.json|mcp\.json)$/;
const MAX_FILES_PER_REPO = 8;

interface CandidateRow {
  run_id: string;
  name: string;
  slug: string;
  description: string;
  version: string;
  author: string;
  category: string;
  department: string | null;
  department_confidence: number;
  tags: string[];
  source_repo: string;
  source_url: string;
  source_path: string;
  source_license: string | null;
  source_commit: string | null;
  stars: number;
  last_commit_at: string | null;
  quality_score: number;
  content_hash: string;
  raw_content: string;
  skill_config: Record<string, unknown>;
  mcp_server_url: string | null;
  status: string;
  rejection_reasons: string[];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req);
  if (req.method !== 'POST') return errorResponse(req, 'Método não permitido', 405);

  const started = Date.now();

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return auth.error;

    const rate = await checkRateLimit(getRateLimitIdentifier(req, auth.user.id), RATE_LIMITS.heavy);
    if (!rate.allowed) return createRateLimitResponse(req, rate);

    const admin = createAdminClient();

    // Autorização: apenas admins de workspace
    const { data: isAdmin, error: adminErr } = await admin.rpc('is_workspace_admin', {
      _user_id: auth.user.id,
    });
    if (adminErr) {
      console.error('is_workspace_admin falhou:', adminErr.message);
      return errorResponse(req, 'Falha ao validar permissões', 500);
    }
    if (!isAdmin) return errorResponse(req, 'Acesso restrito a administradores', 403);

    const parsed = await parseBody(req, RequestSchema);
    if (!parsed.success) return errorResponse(req, 'Payload inválido', 400, { details: parsed.error });
    const body = parsed.data;

    const mode = resolveMode();

    // Monta as queries
    const departments: SkillDepartment[] =
      body.departments.length > 0 ? body.departments : [...SKILL_DEPARTMENTS];
    const topics = body.topics.length > 0 ? body.topics : DEFAULT_TOPICS;

    const queries: string[] = [
      ...topics.map((t) => `topic:${t} stars:>=${body.minStars}`),
      ...departments.flatMap((d) => DEPARTMENT_QUERIES[d].map((q) => `${q} in:name,description,readme stars:>=${body.minStars}`)),
      ...body.extraQueries,
    ];

    // Registra a run
    const { data: run, error: runErr } = await admin
      .from('skill_harvest_runs')
      .insert({
        triggered_by: auth.user.id,
        queries,
        departments,
        status: 'running',
      })
      .select('id')
      .single();

    if (runErr || !run) {
      console.error('Falha ao criar run:', runErr?.message);
      return errorResponse(req, 'Falha ao registrar execução', 500);
    }
    const runId = run.id as string;

    // ─── Varredura
    const seenRepos = new Set<string>();
    const repos: GhRepo[] = [];
    const errors: string[] = [];

    for (const q of queries) {
      if (repos.length >= body.maxRepos) break;
      const res = await searchRepos(q, Math.min(30, body.maxRepos));
      if (!res.ok) {
        errors.push(`[${res.status}] ${q}: ${(res.errorBody ?? '').slice(0, 160)}`);
        if (res.retryAfterMs && res.retryAfterMs >= 20_000) break; // rate limit duro
        continue;
      }
      for (const r of res.data?.items ?? []) {
        if (seenRepos.has(r.full_name)) continue;
        seenRepos.add(r.full_name);
        repos.push(r);
        if (repos.length >= body.maxRepos) break;
      }
    }

    // ─── Extração de candidatos
    const candidates: CandidateRow[] = [];
    const hashes = new Set<string>();
    let rejected = 0;

    for (const repo of repos) {
      if (candidates.length >= body.maxCandidates) break;

      const licenseSpdx = repo.license?.spdx_id && repo.license.spdx_id !== 'NOASSERTION'
        ? repo.license.spdx_id
        : null;
      const licenseOk = isLicenseAllowed(licenseSpdx);

      const tree = await getTree(repo.full_name, repo.default_branch);
      if (!tree.ok || !tree.data) continue;

      const paths = tree.data.tree.filter((e) => e.type === 'blob').map((e) => e.path);
      const hasTests = paths.some((p) => /(^|\/)(tests?|__tests__|spec)\//i.test(p) || /\.(test|spec)\.[jt]sx?$/.test(p));
      const hasDocs = paths.some((p) => /(^|\/)(docs?|README\.md)/i.test(p));

      const skillFiles = paths.filter((p) => SKILL_FILE_RE.test(p)).slice(0, MAX_FILES_PER_REPO);
      const agentFiles = paths.filter((p) => AGENT_JSON_RE.test(p)).slice(0, 2);

      // Fallback: repositório inteiro vira 1 candidato quando não há SKILL.md
      const targets = skillFiles.length > 0 ? skillFiles : ['README.md'];

      for (const path of targets) {
        if (candidates.length >= body.maxCandidates) break;

        const raw = await getRawFile(repo.full_name, repo.default_branch, path);
        if (!raw || raw.trim().length < 80) continue;

        const fm = parseFrontmatter(raw);
        const fmName = typeof fm.data.name === 'string' ? fm.data.name : '';
        const fmDesc = typeof fm.data.description === 'string' ? fm.data.description : '';
        const fmTags = Array.isArray(fm.data.tags) ? fm.data.tags : [];

        const name = stripUnsafe(fmName || deriveName(path, repo.full_name), 120);
        const description = stripUnsafe(fmDesc || repo.description || '', 1200);
        const tags = Array.from(
          new Set([...(repo.topics ?? []), ...fmTags].map((t) => stripUnsafe(String(t), 40).toLowerCase()).filter(Boolean)),
        ).slice(0, 20);

        if (name.length < 2) continue;

        const contentHash = await sha256Hex(normalizeForHash(`${repo.full_name}:${name}:${raw.slice(0, 4000)}`));
        if (hashes.has(contentHash)) continue;
        hashes.add(contentHash);

        // Segurança de conteúdo
        const risks = scanContentRisks(raw);

        // MCP
        let mcpUrl: string | null = null;
        const skillConfig: Record<string, unknown> = {};
        if (agentFiles.length > 0) {
          const agentRaw = await getRawFile(repo.full_name, repo.default_branch, agentFiles[0]);
          if (agentRaw) {
            try {
              const parsedAgent = JSON.parse(agentRaw) as Record<string, unknown>;
              const servers = parsedAgent.servers;
              if (Array.isArray(servers) && servers.length > 0) {
                const first = servers[0] as { url?: string };
                if (typeof first.url === 'string' && isMcpUrlAllowed(first.url)) mcpUrl = first.url;
                else if (typeof first.url === 'string') risks.push('mcp:host_not_allowlisted');
              }
              skillConfig.agent_manifest = {
                model: typeof parsedAgent.model === 'string' ? parsedAgent.model : null,
                servers_count: Array.isArray(servers) ? servers.length : 0,
              };
            } catch {
              risks.push('manifest:invalid_json');
            }
          }
        }

        const fmCompleteness =
          (fmName ? 0.5 : 0) + (fmDesc ? 0.3 : 0) + (fmTags.length > 0 ? 0.2 : 0);

        // A classificação precisa vir ANTES da nota: a confiança departamental
        // é um dos sinais de especificidade da fórmula de qualidade.
        const classification = classifyDepartment({ name, description, tags, content: fm.body });
        const category = inferCategory({ name, description, tags, hasMcpServer: Boolean(mcpUrl) });

        // Coletâneas (awesome-lists, cursos, roadmaps) não são skills
        // instaláveis — detectá-las aqui evita que a popularidade do
        // repositório carregue a nota para cima.
        const isMeta = isMetaRepository({
          name,
          slug: repo.full_name,
          description,
          tags,
          content: fm.body,
        });

        const quality = computeQualityScore({
          stars: repo.stargazers_count,
          lastCommitAt: repo.pushed_at,
          hasDocs,
          hasTests,
          licenseAllowed: licenseOk,
          frontmatterCompleteness: fmCompleteness,
          descriptionLength: description.length,
          isMeta,
          departmentConfidence: classification.confidence,
        });

        const reasons = [...risks];
        if (!licenseSpdx) reasons.push('license:missing');
        else if (!licenseOk) reasons.push(`license:blocked:${licenseSpdx}`);
        if (quality < MIN_QUALITY_SCORE) reasons.push(`quality:below_threshold:${quality}`);
        if (isMeta) reasons.push('meta:collection_repo');
        if (classification.confidence < LOW_CONFIDENCE_THRESHOLD) reasons.push('department:low_confidence');

        const blocking = reasons.some(
          (r) => r.startsWith('secret:') || r.startsWith('prompt_injection:') || r.startsWith('shell:') ||
                 r.startsWith('exfiltration:') || r.startsWith('license:') || r.startsWith('quality:') ||
                 r.startsWith('meta:') || r.startsWith('department:'),
        );
        if (blocking) rejected++;


        candidates.push({
          run_id: runId,
          name,
          slug: slugify(`${repo.owner?.login ?? 'gh'}-${name}`),
          description,
          version: typeof fm.data.version === 'string' ? String(fm.data.version).slice(0, 20) : '1.0.0',
          author: repo.owner?.login ?? repo.full_name.split('/')[0],
          category,
          department: classification.department,
          department_confidence: classification.confidence,
          tags,
          source_repo: repo.full_name,
          source_url: `${repo.html_url}/blob/${repo.default_branch}/${path}`,
          source_path: path,
          source_license: licenseSpdx,
          source_commit: null,
          stars: repo.stargazers_count,
          last_commit_at: repo.pushed_at,
          quality_score: quality,
          content_hash: contentHash,
          raw_content: stripUnsafe(raw, 20_000),
          skill_config: skillConfig,
          mcp_server_url: mcpUrl,
          status: blocking ? 'auto_rejected' : 'pending',
          rejection_reasons: reasons,
        });
      }
    }

    let inserted = 0;
    if (!body.dryRun && candidates.length > 0) {
      // upsert por content_hash — reexecuções não duplicam
      const { data: ins, error: insErr } = await admin
        .from('skill_harvest_candidates')
        .upsert(candidates, { onConflict: 'content_hash', ignoreDuplicates: true })
        .select('id');
      if (insErr) {
        console.error('Falha ao gravar candidatos:', insErr.message);
        errors.push(`insert: ${insErr.message}`);
      } else {
        inserted = ins?.length ?? 0;
      }
    }

    const durationMs = Date.now() - started;

    const { error: updErr } = await admin
      .from('skill_harvest_runs')
      .update({
        repos_scanned: repos.length,
        candidates_found: candidates.length,
        candidates_accepted: candidates.length - rejected,
        candidates_rejected: rejected,
        duration_ms: durationMs,
        status: errors.length > 0 && candidates.length === 0 ? 'failed' : 'completed',
        error: errors.length > 0 ? errors.slice(0, 10).join(' | ').slice(0, 2000) : null,
      })
      .eq('id', runId);
    if (updErr) console.error('Falha ao fechar run:', updErr.message);

    const { error: auditErr } = await admin.rpc('log_audit_entry', {
      p_action: 'skill_harvest_run',
      p_entity_type: 'skill_harvest_runs',
      p_entity_id: runId,
      p_metadata: {
        repos_scanned: repos.length,
        candidates_found: candidates.length,
        inserted,
        rejected,
        github_mode: mode,
        duration_ms: durationMs,
      },
    });
    if (auditErr) console.error('Falha ao registrar auditoria:', auditErr.message);

    return jsonResponse(req, {
      run_id: runId,
      github_mode: mode,
      repos_scanned: repos.length,
      candidates_found: candidates.length,
      candidates_inserted: inserted,
      candidates_auto_rejected: rejected,
      duration_ms: durationMs,
      errors: errors.slice(0, 10),
      dry_run: body.dryRun,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('skill-harvester falhou:', message);
    return new Response(JSON.stringify({ error: 'Falha interna no harvester', details: message }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});

function deriveName(path: string, repoFullName: string): string {
  const parts = path.split('/').filter(Boolean);
  if (parts.length >= 2) {
    const folder = parts[parts.length - 2];
    if (folder && !/^(src|skills|\.claude)$/i.test(folder)) return folder.replace(/[-_]/g, ' ');
  }
  return repoFullName.split('/')[1]?.replace(/[-_]/g, ' ') ?? repoFullName;
}
