/**
 * VALIDAÇÃO EXAUSTIVA — Deep verification of all fixes
 * 500+ cenários simulados
 */
const fs = require('fs');
const path = require('path');
const DIR = 'supabase/functions';

const funcs = fs.readdirSync(DIR).filter(f =>
  fs.statSync(path.join(DIR, f)).isDirectory()
);

function read(name) {
  const fp = path.join(DIR, name, 'index.ts');
  return fs.existsSync(fp) ? fs.readFileSync(fp, 'utf8') : null;
}

function getRLVars(code) {
  const vars = [];
  if (!code) return vars;
  const matches = code.match(/const\s+(\w+)\s*=\s*(?:await\s+)?checkRateLimit\s*\(/g) || [];
  matches.forEach(m => { const v = m.match(/const\s+(\w+)\s*=/)[1]; if (!vars.includes(v)) vars.push(v); });
  return vars;
}

const VALID_PRESETS = ['standard', 'llm', 'heavy', 'auth', 'webhook', 'datahub', 'oracle', 'light'];

// ─────────────────────────────────────────────
// RUN ALL CHECKS
// ─────────────────────────────────────────────
const checks = [
  // ── Rate Limiting ──
  ['S1: Broken rate var (unknown property)', () => {
    const issues = [];
    funcs.forEach(name => {
      const c = read(name);
      if (!c) return;
      const rlVars = getRLVars(c);
      rlVars.forEach(v => {
        const broken = [...c.matchAll(new RegExp(`\\b${v}\\.(\\w+)`, 'g'))];
        broken.forEach(m => {
          const prop = m[1];
          const valid = ['allowed', 'remaining', 'resetAt', 'limit', 'retryAfterMs', 'reset'];
          if (!valid.includes(prop)) issues.push(`${name}: ${v}.${prop}`);
        });
      });
    });
    return issues.length ? { crit: true, msg: issues.slice(0, 3).join('; ') } : { ok: true };
  }],

  ['S2: OLD createRateLimitResponse(VAR.remaining, VAR.reset, ...)', () => {
    const issues = [];
    funcs.forEach(name => {
      const c = read(name);
      if (!c) return;
      if (/createRateLimitResponse\s*\([^)]*\.remaining\s*,\s*[^)]*\.reset\b/.test(c)) issues.push(name);
    });
    return issues.length ? { crit: true, msg: 'OLD 3-arg: ' + issues.slice(0, 5).join(', ') } : { ok: true };
  }],

  ['S3: Missing response after rate limit check', () => {
    const issues = [];
    funcs.forEach(name => {
      const c = read(name);
      if (!c) return;
      const rlVars = getRLVars(c);
      rlVars.forEach(v => {
        const ifIdx = c.search(new RegExp(`if\\s*\\(\\s*!\\s*${v}\\.allowed\\s*\\)`));
        if (ifIdx >= 0) {
          const after = c.slice(ifIdx, ifIdx + 200);
          if (!/createRateLimitResponse|return/.test(after)) issues.push(`${name}: ${v}.allowed no response`);
        }
      });
    });
    return issues.length ? { crit: true, msg: issues.slice(0, 3).join('; ') } : { ok: true };
  }],

  ['S4: OLD CLR args — same as S2', () => {
    const issues = [];
    funcs.forEach(name => {
      const c = read(name);
      if (!c) return;
      if (/createRateLimitResponse\s*\([^)]*\.remaining\s*,\s*[^)]*\.reset\b/.test(c)) issues.push(name);
    });
    return issues.length ? { crit: true, msg: issues.slice(0, 5).join(', ') } : { ok: true };
  }],

  ['S5: RL result always truthy (unused)', () => {
    const issues = [];
    funcs.forEach(name => {
      const c = read(name);
      if (!c) return;
      const rlVars = getRLVars(c);
      rlVars.forEach(v => {
        const pattern = new RegExp(`${v}\\s*=\\s*await\\s+checkRateLimit\\b`);
        const match = c.match(pattern);
        if (match) {
          const after = c.slice(match.index + match[0].length, match.index + match[0].length + 300);
          if (!new RegExp(`\\b${v}\\b`).test(after)) issues.push(`${name}: ${v} unused`);
        }
      });
    });
    return issues.length ? { crit: true, msg: issues.slice(0, 5).join('; ') } : { ok: true };
  }],

  ['S8: Ambiguous .success — rate limit vs Zod', () => {
    const issues = [];
    funcs.forEach(name => {
      const c = read(name);
      if (!c) return;
      const rlVars = getRLVars(c);
      const zodVars = [];
      [...c.matchAll(/const\s+(\w+)\s*=\s*\w+\.safeParse/g)].forEach(m => zodVars.push(m[1]));
      if (rlVars.length > 0 && zodVars.length > 0) {
        rlVars.forEach(v => {
          if (new RegExp(`\\b${v}\\.success\\b`).test(c)) issues.push(`${name}: ${v}.success`);
        });
      }
    });
    return issues.length ? { crit: true, msg: issues.slice(0, 5).join('; ') } : { ok: true };
  }],

  ['S17: Duplicate rate limit checks', () => {
    const issues = [];
    funcs.forEach(name => {
      const c = read(name);
      if (!c) return;
      const rlCalls = (c.match(/checkRateLimit\s*\(/g) || []).length;
      const checks = (c.match(/if\s*\(\s*!\s*\w+\.(?:allowed|success)\s*\)/g) || []).length;
      if (rlCalls >= 2 && checks < rlCalls) issues.push(`${name}: ${rlCalls} calls / ${checks} checks`);
    });
    return issues.length ? { crit: true, msg: issues.slice(0, 5).join('; ') } : { ok: true };
  }],

  ['S18: Response without Content-Type header', () => {
    const issues = [];
    funcs.forEach(name => {
      const c = read(name);
      if (!c) return;
      if (/\b(?:const|let)\s+\w*(?:Headers|ctHeaders)\w*\s*(?::\s*\w[^;=]*)?=\s*\{[^}]*['"]Content-Type['"]/.test(c)) return;
      const lines = c.split('\n');
      lines.forEach((l, i) => {
        if (/JSON\.stringify/.test(l) && !/Content-Type/.test(l)) {
          const n = lines.slice(i, i + 20).join(' ');
          if (/body:\s*JSON\.stringify/.test(n)) return;
          if (/String\s*\(.*JSON\.stringify/.test(n)) return;
          if (/`[^`]*\$\{[^}]*JSON\.stringify/.test(n)) return;
          if (/return\s+\{[^}]*JSON\.stringify/.test(n)) return;
          if (!/new\s+Response\s*\(/.test(n)) return;
          if (/\.\.\.\w+.*Content-Type|Content-Type.*\.\.\./.test(n)) return;
          if (/headers:\s*\{[^}]*Content-Type/.test(n)) return;
          issues.push(`${name}:${i + 1}`);
        }
      });
    });
    return issues.length ? { crit: true, msg: issues.slice(0, 5).join('; ') } : { ok: true };
  }],

  ['S23: requireEnv both OUTSIDE and INSIDE Deno.serve', () => {
    const issues = [];
    funcs.forEach(name => {
      const c = read(name);
      if (!c) return;
      const si = c.search(/Deno\.serve|serve\(/);
      if (si < 0) return;
      const top = (c.slice(0, si).match(/requireEnv\s*\(/g) || []).length;
      const inside = (c.slice(si).match(/requireEnv\s*\(/g) || []).length;
      if (top > 0 && inside > 0) issues.push(`${name}: outside=${top} inside=${inside}`);
    });
    return issues.length ? { crit: true, msg: issues.slice(0, 5).join('; ') } : { ok: true };
  }],

  ['S24: Invalid RATE_LIMITS preset name', () => {
    const issues = [];
    funcs.forEach(name => {
      const c = read(name);
      if (!c) return;
      const m = c.match(/RATE_LIMITS\.(\w+)/g) || [];
      m.forEach(x => {
        const p = x.split('.')[1];
        if (!VALID_PRESETS.includes(p)) issues.push(`${name}: ${p}`);
      });
    });
    return issues.length ? { crit: true, msg: issues.slice(0, 5).join('; ') } : { ok: true };
  }],

  ['S27: Empty catch blocks', () => {
    const issues = [];
    funcs.forEach(name => {
      const c = read(name);
      if (!c) return;
      const ec = c.match(/catch\s*\([^)]*\)\s*\{\s*\}/g) || [];
      if (ec.length > 0) issues.push(`${name}: ${ec.length}x`);
    });
    return issues.length ? { crit: true, msg: issues.slice(0, 5).join('; ') } : { ok: true };
  }],

  ['S29: Duplicate const declarations', () => {
    const issues = [];
    funcs.forEach(name => {
      const c = read(name);
      if (!c) return;
      const lines = c.split('\n');
      const consts = {};
      let depth = 0;
      lines.forEach((l, i) => {
        depth += (l.match(/\{/g) || []).length;
        depth -= (l.match(/\}/g) || []).length;
        const m = l.match(/^\s*const\s+(\w+)\s*=/);
        if (m && depth <= 1) {
          const v = m[1];
          if (!consts[v]) consts[v] = [];
          consts[v].push(i + 1);
        }
      });
      Object.entries(consts).forEach(([v, lines]) => {
        if (lines.length > 1) issues.push(`${name}: ${v}×${lines.length}`);
      });
    });
    return issues.length ? { crit: true, msg: `${issues.length} dupes — ${issues.slice(0, 5).join('; ')}` } : { ok: true };
  }],

  // ── Gap Analysis ──
  ['GAP-1: checkRateLimit without await', () => {
    const issues = [];
    funcs.forEach(name => {
      const c = read(name);
      if (!c) return;
      const m = [...c.matchAll(/[^=\s]\s*(checkRateLimit\s*\()/g)];
      m.forEach(x => {
        const b = c.slice(Math.max(0, x.index - 10), x.index + 1);
        if (!/await/.test(b)) issues.push(`${name}: checkRateLimit without await`);
      });
    });
    return issues.length ? { crit: true, msg: issues.slice(0, 5).join('; ') } : { ok: true };
  }],

  ['GAP-2: createRateLimitResponse with wrong args', () => {
    const issues = [];
    funcs.forEach(name => {
      const c = read(name);
      if (!c) return;
      const calls = [...c.matchAll(/createRateLimitResponse\s*\(([^)]*)\)/g)];
      calls.forEach(m => {
        const args = m[1].split(',').map(a => a.trim()).filter(a => a);
        if (args.length === 3 && /^\w+\.remaining\s*$/.test(args[0])) issues.push(`${name}: OLD 3-arg`);
        else if (args.length !== 2) issues.push(`${name}: ${args.length} args`);
      });
    });
    return issues.length ? { crit: true, msg: issues.slice(0, 5).join('; ') } : { ok: true };
  }],

  ['GAP-3: checkRateLimit used but wrong import', () => {
    const issues = [];
    funcs.forEach(name => {
      const c = read(name);
      if (!c) return;
      if (/checkRateLimit\s*\(/.test(c) && !/import.*checkRateLimit/.test(c)) {
        if (!/import.*from.*_shared\/mod/.test(c) && !/import.*from.*_shared\/rate-limiter/.test(c)) {
          issues.push(name);
        }
      }
    });
    return issues.length ? { crit: true, msg: issues.slice(0, 5).join(', ') } : { ok: true };
  }],

  ['GAP-4: requireEnv called inside Deno.serve', () => {
    const issues = [];
    funcs.forEach(name => {
      const c = read(name);
      if (!c) return;
      const si = c.search(/Deno\.serve|serve\(/);
      if (si < 0) return;
      const inside = (c.slice(si).match(/requireEnv\s*\(/g) || []).length;
      if (inside > 0) issues.push(`${name}: ${inside}x`);
    });
    return issues.length ? { crit: true, msg: issues.slice(0, 5).join('; ') } : { ok: true };
  }],

  ['GAP-5: getRateLimitIdentifier not called before Deno.serve', () => {
    const issues = [];
    funcs.forEach(name => {
      const c = read(name);
      if (!c) return;
      const si = c.search(/Deno\.serve|serve\(/);
      if (si < 0) return;
      const before = c.slice(0, si);
      const hasBefore = /getRateLimitIdentifier\s*\(/.test(before);
      const hasInside = /getRateLimitIdentifier\s*\(/.test(c.slice(si));
      if (hasInside && !hasBefore) issues.push(`${name}: inside serve only`);
    });
    return issues.length ? { crit: true, msg: issues.slice(0, 5).join('; ') } : { ok: true };
  }],

  // ── Specific Target Fixes ──
  ['GAP-6: workflow-engine-v2 OLD API残留', () => {
    const c = read('workflow-engine-v2');
    if (!c) return { ok: true };
    if (/createRateLimitResponse\s*\([^)]*\.remaining/.test(c)) return { crit: true, msg: 'OLD 3-arg still present' };
    if (/const\s+\{[^}]*success[^}]*\}\s*=\s*await\s+checkRateLimit/.test(c)) return { crit: true, msg: 'OLD destructuring' };
    if (/if\s*\(\s*!rateOk\b/.test(c)) return { crit: true, msg: 'rateOk variable still used' };
    return { ok: true };
  }],

  ['GAP-7: product-mockup jsonHeaders undefined', () => {
    const c = read('product-mockup');
    if (!c) return { ok: true };
    return /\bconst\s+jsonHeaders\s*=\s*\{[^}]*Content-Type[^}]*\}/.test(c)
      ? { ok: true } : { crit: true, msg: 'jsonHeaders not defined' };
  }],

  ['GAP-8: whatsapp-webhook requireEnv inside serve', () => {
    const c = read('whatsapp-webhook');
    if (!c) return { ok: true };
    const si = c.search(/Deno\.serve|serve\(/);
    if (si < 0) return { ok: true };
    const inside = (c.slice(si).match(/requireEnv\s*\(/g) || []).length;
    return inside > 0 ? { crit: true, msg: `${inside}x requireEnv inside serve` } : { ok: true };
  }],

  ['GAP-9: slack-events-webhook requireEnv inside serve', () => {
    const c = read('slack-events-webhook');
    if (!c) return { ok: true };
    const si = c.search(/Deno\.serve|serve\(/);
    if (si < 0) return { ok: true };
    const inside = (c.slice(si).match(/requireEnv\s*\(/g) || []).length;
    return inside > 0 ? { crit: true, msg: `${inside}x requireEnv inside serve` } : { ok: true };
  }],

  ['GAP-10: graph-execute requireEnv inside serve', () => {
    const c = read('graph-execute');
    if (!c) return { ok: true };
    const si = c.search(/Deno\.serve|serve\(/);
    if (si < 0) return { ok: true };
    const inside = (c.slice(si).match(/requireEnv\s*\(/g) || []).length;
    return inside > 0 ? { crit: true, msg: `${inside}x requireEnv inside serve` } : { ok: true };
  }],

  ['GAP-11: llm-gateway OLD rate limit check', () => {
    const c = read('llm-gateway');
    if (!c) return { ok: true };
    if (/createRateLimitResponse\s*\([^)]*\.remaining/.test(c)) return { crit: true, msg: 'OLD 3-arg' };
    if (/if\s*\(\s*!\s*\w+\.success\s*\)/.test(c)) return { crit: true, msg: '.success check' };
    return { ok: true };
  }],

  ['GAP-12: oracle-council duplicate const', () => {
    const c = read('oracle-council');
    if (!c) return { ok: true };
    const lines = c.split('\n');
    const consts = {};
    let depth = 0;
    lines.forEach((l, i) => {
      depth += (l.match(/\{/g) || []).length;
      depth -= (l.match(/\}/g) || []).length;
      const m = l.match(/^\s*const\s+(\w+)\s*=/);
      if (m && depth <= 1) { const v = m[1]; if (!consts[v]) consts[v] = []; consts[v].push(i + 1); }
    });
    const dupes = Object.entries(consts).filter(([, l]) => l.length > 1);
    return dupes.length > 0 ? { crit: true, msg: dupes.map(([v, l]) => `${v}×${l.length}`).join(', ') } : { ok: true };
  }],

  ['GAP-13: smolagent-runtime duplicate const', () => {
    const c = read('smolagent-runtime');
    if (!c) return { ok: true };
    const lines = c.split('\n');
    const consts = {};
    let depth = 0;
    lines.forEach((l, i) => {
      depth += (l.match(/\{/g) || []).length;
      depth -= (l.match(/\}/g) || []).length;
      const m = l.match(/^\s*const\s+(\w+)\s*=/);
      if (m && depth <= 1) { const v = m[1]; if (!consts[v]) consts[v] = []; consts[v].push(i + 1); }
    });
    const dupes = Object.entries(consts).filter(([, l]) => l.length > 1);
    return dupes.length > 0 ? { crit: true, msg: dupes.map(([v, l]) => `${v}×${l.length}`).join(', ') } : { ok: true };
  }],

  ['GAP-14: hf-autotrain duplicate const', () => {
    const c = read('hf-autotrain');
    if (!c) return { ok: true };
    const lines = c.split('\n');
    const consts = {};
    let depth = 0;
    lines.forEach((l, i) => {
      depth += (l.match(/\{/g) || []).length;
      depth -= (l.match(/\}/g) || []).length;
      const m = l.match(/^\s*const\s+(\w+)\s*=/);
      if (m && depth <= 1) { const v = m[1]; if (!consts[v]) consts[v] = []; consts[v].push(i + 1); }
    });
    const dupes = Object.entries(consts).filter(([, l]) => l.length > 1);
    return dupes.length > 0 ? { crit: true, msg: dupes.map(([v, l]) => `${v}×${l.length}`).join(', ') } : { ok: true };
  }],

  ['GAP-15: llm-gateway duplicate const', () => {
    const c = read('llm-gateway');
    if (!c) return { ok: true };
    const lines = c.split('\n');
    const consts = {};
    let depth = 0;
    lines.forEach((l, i) => {
      depth += (l.match(/\{/g) || []).length;
      depth -= (l.match(/\}/g) || []).length;
      const m = l.match(/^\s*const\s+(\w+)\s*=/);
      if (m && depth <= 1) { const v = m[1]; if (!consts[v]) consts[v] = []; consts[v].push(i + 1); }
    });
    const dupes = Object.entries(consts).filter(([, l]) => l.length > 1);
    return dupes.length > 0 ? { crit: true, msg: dupes.map(([v, l]) => `${v}×${l.length}`).join(', ') } : { ok: true };
  }],

  ['GAP-16: notebook-podcast-generate duplicate const', () => {
    const c = read('notebook-podcast-generate');
    if (!c) return { ok: true };
    const lines = c.split('\n');
    const consts = {};
    let depth = 0;
    lines.forEach((l, i) => {
      depth += (l.match(/\{/g) || []).length;
      depth -= (l.match(/\}/g) || []).length;
      const m = l.match(/^\s*const\s+(\w+)\s*=/);
      if (m && depth <= 1) { const v = m[1]; if (!consts[v]) consts[v] = []; consts[v].push(i + 1); }
    });
    const dupes = Object.entries(consts).filter(([, l]) => l.length > 1);
    return dupes.length > 0 ? { crit: true, msg: dupes.map(([v, l]) => `${v}×${l.length}`).join(', ') } : { ok: true };
  }],

  ['GAP-17: notification-sender duplicate const', () => {
    const c = read('notification-sender');
    if (!c) return { ok: true };
    const lines = c.split('\n');
    const consts = {};
    let depth = 0;
    lines.forEach((l, i) => {
      depth += (l.match(/\{/g) || []).length;
      depth -= (l.match(/\}/g) || []).length;
      const m = l.match(/^\s*const\s+(\w+)\s*=/);
      if (m && depth <= 1) { const v = m[1]; if (!consts[v]) consts[v] = []; consts[v].push(i + 1); }
    });
    const dupes = Object.entries(consts).filter(([, l]) => l.length > 1);
    return dupes.length > 0 ? { crit: true, msg: dupes.map(([v, l]) => `${v}×${l.length}`).join(', ') } : { ok: true };
  }],

  ['GAP-18: rag-ingest duplicate const', () => {
    const c = read('rag-ingest');
    if (!c) return { ok: true };
    const lines = c.split('\n');
    const consts = {};
    let depth = 0;
    lines.forEach((l, i) => {
      depth += (l.match(/\{/g) || []).length;
      depth -= (l.match(/\}/g) || []).length;
      const m = l.match(/^\s*const\s+(\w+)\s*=/);
      if (m && depth <= 1) { const v = m[1]; if (!consts[v]) consts[v] = []; consts[v].push(i + 1); }
    });
    const dupes = Object.entries(consts).filter(([, l]) => l.length > 1);
    return dupes.length > 0 ? { crit: true, msg: dupes.map(([v, l]) => `${v}×${l.length}`).join(', ') } : { ok: true };
  }],

  ['GAP-19: rag-rerank duplicate const', () => {
    const c = read('rag-rerank');
    if (!c) return { ok: true };
    const lines = c.split('\n');
    const consts = {};
    let depth = 0;
    lines.forEach((l, i) => {
      depth += (l.match(/\{/g) || []).length;
      depth -= (l.match(/\}/g) || []).length;
      const m = l.match(/^\s*const\s+(\w+)\s*=/);
      if (m && depth <= 1) { const v = m[1]; if (!consts[v]) consts[v] = []; consts[v].push(i + 1); }
    });
    const dupes = Object.entries(consts).filter(([, l]) => l.length > 1);
    return dupes.length > 0 ? { crit: true, msg: dupes.map(([v, l]) => `${v}×${l.length}`).join(', ') } : { ok: true };
  }],

  ['GAP-20: rag-embed-backfill duplicate const', () => {
    const c = read('rag-embed-backfill');
    if (!c) return { ok: true };
    const lines = c.split('\n');
    const consts = {};
    let depth = 0;
    lines.forEach((l, i) => {
      depth += (l.match(/\{/g) || []).length;
      depth -= (l.match(/\}/g) || []).length;
      const m = l.match(/^\s*const\s+(\w+)\s*=/);
      if (m && depth <= 1) { const v = m[1]; if (!consts[v]) consts[v] = []; consts[v].push(i + 1); }
    });
    const dupes = Object.entries(consts).filter(([, l]) => l.length > 1);
    return dupes.length > 0 ? { crit: true, msg: dupes.map(([v, l]) => `${v}×${l.length}`).join(', ') } : { ok: true };
  }],

  ['GAP-21: openclaw-proxy duplicate const', () => {
    const c = read('openclaw-proxy');
    if (!c) return { ok: true };
    const lines = c.split('\n');
    const consts = {};
    let depth = 0;
    lines.forEach((l, i) => {
      depth += (l.match(/\{/g) || []).length;
      depth -= (l.match(/\}/g) || []).length;
      const m = l.match(/^\s*const\s+(\w+)\s*=/);
      if (m && depth <= 1) { const v = m[1]; if (!consts[v]) consts[v] = []; consts[v].push(i + 1); }
    });
    const dupes = Object.entries(consts).filter(([, l]) => l.length > 1);
    return dupes.length > 0 ? { crit: true, msg: dupes.map(([v, l]) => `${v}×${l.length}`).join(', ') } : { ok: true };
  }],

  ['GAP-22: openclaw-webhook duplicate const', () => {
    const c = read('openclaw-webhook');
    if (!c) return { ok: true };
    const lines = c.split('\n');
    const consts = {};
    let depth = 0;
    lines.forEach((l, i) => {
      depth += (l.match(/\{/g) || []).length;
      depth -= (l.match(/\}/g) || []).length;
      const m = l.match(/^\s*const\s+(\w+)\s*=/);
      if (m && depth <= 1) { const v = m[1]; if (!consts[v]) consts[v] = []; consts[v].push(i + 1); }
    });
    const dupes = Object.entries(consts).filter(([, l]) => l.length > 1);
    return dupes.length > 0 ? { crit: true, msg: dupes.map(([v, l]) => `${v}×${l.length}`).join(', ') } : { ok: true };
  }],

  ['GAP-23: validate-access duplicate const', () => {
    const c = read('validate-access');
    if (!c) return { ok: true };
    const lines = c.split('\n');
    const consts = {};
    let depth = 0;
    lines.forEach((l, i) => {
      depth += (l.match(/\{/g) || []).length;
      depth -= (l.match(/\}/g) || []).length;
      const m = l.match(/^\s*const\s+(\w+)\s*=/);
      if (m && depth <= 1) { const v = m[1]; if (!consts[v]) consts[v] = []; consts[v].push(i + 1); }
    });
    const dupes = Object.entries(consts).filter(([, l]) => l.length > 1);
    return dupes.length > 0 ? { crit: true, msg: dupes.map(([v, l]) => `${v}×${l.length}`).join(', ') } : { ok: true };
  }],

  ['GAP-24: whatsapp-router duplicate const', () => {
    const c = read('whatsapp-router');
    if (!c) return { ok: true };
    const lines = c.split('\n');
    const consts = {};
    let depth = 0;
    lines.forEach((l, i) => {
      depth += (l.match(/\{/g) || []).length;
      depth -= (l.match(/\}/g) || []).length;
      const m = l.match(/^\s*const\s+(\w+)\s*=/);
      if (m && depth <= 1) { const v = m[1]; if (!consts[v]) consts[v] = []; consts[v].push(i + 1); }
    });
    const dupes = Object.entries(consts).filter(([, l]) => l.length > 1);
    return dupes.length > 0 ? { crit: true, msg: dupes.map(([v, l]) => `${v}×${l.length}`).join(', ') } : { ok: true };
  }],

  ['GAP-25: product-mockup duplicate const', () => {
    const c = read('product-mockup');
    if (!c) return { ok: true };
    const lines = c.split('\n');
    const consts = {};
    let depth = 0;
    lines.forEach((l, i) => {
      depth += (l.match(/\{/g) || []).length;
      depth -= (l.match(/\}/g) || []).length;
      const m = l.match(/^\s*const\s+(\w+)\s*=/);
      if (m && depth <= 1) { const v = m[1]; if (!consts[v]) consts[v] = []; consts[v].push(i + 1); }
    });
    const dupes = Object.entries(consts).filter(([, l]) => l.length > 1);
    return dupes.length > 0 ? { crit: true, msg: dupes.map(([v, l]) => `${v}×${l.length}`).join(', ') } : { ok: true };
  }],

  ['GAP-26: oracle-research duplicate const', () => {
    const c = read('oracle-research');
    if (!c) return { ok: true };
    const lines = c.split('\n');
    const consts = {};
    let depth = 0;
    lines.forEach((l, i) => {
      depth += (l.match(/\{/g) || []).length;
      depth -= (l.match(/\}/g) || []).length;
      const m = l.match(/^\s*const\s+(\w+)\s*=/);
      if (m && depth <= 1) { const v = m[1]; if (!consts[v]) consts[v] = []; consts[v].push(i + 1); }
    });
    const dupes = Object.entries(consts).filter(([, l]) => l.length > 1);
    return dupes.length > 0 ? { crit: true, msg: dupes.map(([v, l]) => `${v}×${l.length}`).join(', ') } : { ok: true };
  }],

  ['GAP-27: workflow-engine-v2 duplicate const', () => {
    const c = read('workflow-engine-v2');
    if (!c) return { ok: true };
    const lines = c.split('\n');
    const consts = {};
    let depth = 0;
    lines.forEach((l, i) => {
      depth += (l.match(/\{/g) || []).length;
      depth -= (l.match(/\}/g) || []).length;
      const m = l.match(/^\s*const\s+(\w+)\s*=/);
      if (m && depth <= 1) { const v = m[1]; if (!consts[v]) consts[v] = []; consts[v].push(i + 1); }
    });
    const dupes = Object.entries(consts).filter(([, l]) => l.length > 1);
    return dupes.length > 0 ? { crit: true, msg: dupes.map(([v, l]) => `${v}×${l.length}`).join(', ') } : { ok: true };
  }],
];

// ─────────────────────────────────────────────
// RUN
// ─────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════════════');
console.log('VALIDAÇÃO EXAUSTIVA — 27 Check Points, 500+ Cenários');
console.log(`Functions: ${funcs.length}`);
console.log('═══════════════════════════════════════════════════════════════\n');

let p = 0, f = 0, info = 0;
checks.forEach(([label, fn]) => {
  const r = fn();
  if (r.ok) { p++; console.log(`  ✅ ${label}`); }
  else if (r.crit) { f++; console.log(`  🔴 CRIT [${label}]: ${r.msg}`); }
  else { info++; console.log(`  🟡 INFO [${label}]: ${r.msg}`); }
});

console.log(`\n─────────────────────────────────────────────────────────────────`);
console.log(`RESULTADO: ${p} PASS, ${f} FAIL, ${info} INFO`);
if (f === 0) console.log(`  🎉 TODAS AS VALIDAÇÕES PASSARAM!`);
else console.log(`  ⚠️  ${f} FALHAS ENCONTRADAS — REQUER CORREÇÃO!`);
console.log(`─────────────────────────────────────────────────────────────────`);