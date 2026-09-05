/**
 * Cliente GitHub para o harvester.
 *
 * Ordem de preferência de credencial:
 *   1. Connector Gateway da Lovable (LOVABLE_API_KEY + GITHUB_API_KEY)
 *   2. Token direto (GITHUB_TOKEN)
 *   3. Anônimo (60 req/h — apenas para smoke test)
 *
 * Nunca chamado a partir do browser.
 */

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/github';
const DIRECT_URL = 'https://api.github.com';

export interface GitHubMode {
  mode: 'gateway' | 'token' | 'anonymous';
}

export function resolveMode(): GitHubMode['mode'] {
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');
  const connKey = Deno.env.get('GITHUB_API_KEY');
  if (lovableKey && connKey) return 'gateway';
  if (Deno.env.get('GITHUB_TOKEN')) return 'token';
  return 'anonymous';
}

export interface GhResponse<T> {
  ok: boolean;
  status: number;
  data: T | null;
  errorBody?: string;
  rateRemaining: number | null;
  retryAfterMs: number | null;
}

async function rawFetch(path: string): Promise<Response> {
  const mode = resolveMode();
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'nexus-skill-harvester',
  };

  if (mode === 'gateway') {
    headers.Authorization = `Bearer ${Deno.env.get('LOVABLE_API_KEY')}`;
    headers['X-Connection-Api-Key'] = Deno.env.get('GITHUB_API_KEY')!;
    return await fetch(`${GATEWAY_URL}/${path.replace(/^\//, '')}`, { headers });
  }

  if (mode === 'token') {
    headers.Authorization = `Bearer ${Deno.env.get('GITHUB_TOKEN')}`;
  }
  return await fetch(`${DIRECT_URL}/${path.replace(/^\//, '')}`, { headers });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GET com backoff exponencial honrando Retry-After em 403/429.
 * Nunca lança por erro HTTP — devolve o status e o corpo para o chamador decidir.
 */
export async function ghGet<T>(path: string, maxAttempts = 4): Promise<GhResponse<T>> {
  let attempt = 0;
  let lastStatus = 0;
  let lastBody = '';

  while (attempt < maxAttempts) {
    let res: Response;
    try {
      res = await rawFetch(path);
    } catch (e) {
      lastStatus = 0;
      lastBody = e instanceof Error ? e.message : String(e);
      attempt++;
      await sleep(Math.min(8000, 500 * 2 ** attempt));
      continue;
    }

    const rateRemaining = Number(res.headers.get('x-ratelimit-remaining') ?? 'NaN');
    const remaining = Number.isNaN(rateRemaining) ? null : rateRemaining;

    if (res.ok) {
      const data = (await res.json()) as T;
      return { ok: true, status: res.status, data, rateRemaining: remaining, retryAfterMs: null };
    }

    lastStatus = res.status;
    lastBody = await res.text();

    if (res.status === 403 || res.status === 429) {
      const retryAfter = res.headers.get('retry-after');
      const reset = res.headers.get('x-ratelimit-reset');
      let waitMs = 500 * 2 ** (attempt + 1);
      if (retryAfter) waitMs = Number(retryAfter) * 1000;
      else if (reset) waitMs = Math.max(0, Number(reset) * 1000 - Date.now());
      waitMs = Math.min(waitMs, 20_000);

      if (waitMs >= 20_000) {
        return {
          ok: false,
          status: res.status,
          data: null,
          errorBody: lastBody,
          rateRemaining: remaining,
          retryAfterMs: waitMs,
        };
      }
      attempt++;
      await sleep(waitMs);
      continue;
    }

    // 404/422/etc — não adianta repetir
    return {
      ok: false,
      status: res.status,
      data: null,
      errorBody: lastBody,
      rateRemaining: remaining,
      retryAfterMs: null,
    };
  }

  return {
    ok: false,
    status: lastStatus,
    data: null,
    errorBody: lastBody,
    rateRemaining: null,
    retryAfterMs: null,
  };
}

/** Busca de repositórios. */
export interface GhRepo {
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  pushed_at: string | null;
  default_branch: string;
  topics?: string[];
  license?: { spdx_id?: string | null } | null;
  owner?: { login: string };
}

export async function searchRepos(
  q: string,
  perPage: number,
): Promise<GhResponse<{ items: GhRepo[] }>> {
  const params = new URLSearchParams({
    q,
    sort: 'stars',
    order: 'desc',
    per_page: String(perPage),
  });
  return await ghGet<{ items: GhRepo[] }>(`search/repositories?${params}`);
}

export interface GhTreeEntry {
  path: string;
  type: string;
  sha: string;
}

export async function getTree(
  repo: string,
  branch: string,
): Promise<GhResponse<{ tree: GhTreeEntry[]; truncated: boolean }>> {
  return await ghGet<{ tree: GhTreeEntry[]; truncated: boolean }>(
    `repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
  );
}

/** Busca conteúdo bruto de um arquivo (via raw.githubusercontent para economizar API). */
export async function getRawFile(
  repo: string,
  branch: string,
  path: string,
): Promise<string | null> {
  try {
    const url = `https://raw.githubusercontent.com/${repo}/${branch}/${path.split('/').map(encodeURIComponent).join('/')}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'nexus-skill-harvester' } });
    if (!res.ok) {
      await res.text();
      return null;
    }
    const text = await res.text();
    return text.length > 200_000 ? text.slice(0, 200_000) : text;
  } catch {
    return null;
  }
}
