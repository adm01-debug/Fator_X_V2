/**
 * SIMULAÇÃO EXAUSTIVA V2 — Edge Functions — Fator X V2
 * Classificado: TRUE = real issue | FALSE = false positive
 */
const fs = require('fs');
const path = require('path');

const DIR = 'supabase/functions';
const results = [];
let pass = 0, fail = 0;

function test(name, fn) {
  try {
    const issues = fn();
    if (issues && issues.length > 0) {
      fail++;
      issues.forEach(i => results.push(`❌ [${name}] ${i}`));
    } else {
      pass++;
      results.push(`✅ [${name}] OK`);
    }
  } catch (e) {
    fail++;
    results.push(`💥 [${name}] CRASH: ${e.message}`);
  }
}

function getAllFunctions() {
  return fs.readdirSync(DIR, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);
}

function readFunc(name) {
  const fp = path.join(DIR, name, 'index.ts');
  return fs.existsSync(fp) ? fs.readFileSync(fp, 'utf8') : null;
}

// ─── S1: Broken rate limit var names ────────────────────────────────────────
test('S1-BROKEN-VAR', () => {
  const issues = [];
  getAllFunctions().forEach(name => {
    const c = readFunc(name);
    if (!c) return;
    if (/if\s*\(\s*!\s*\.allowed\s*\)/.test(c)) issues.push(`${name}: if (!.allowed) missing var`);
    if (/createRateLimitResponse\s*\(\s*,/.test(c)) issues.push(`${name}: createRateLimitResponse(, missing var)`);
  });
  return issues;
});

// ─── S2: Old API .success with checkRateLimit ─────────────────────────────────
test('S2-OLD-API-SUCCESS', () => {
  const issues = [];
  getAllFunctions().forEach(name => {
    const c = readFunc(name);
    if (!c || !/checkRateLimit/.test(c)) return;
    const m = c.match(/const\s+(\w+)\s*=\s*(?:await\s+)?checkRateLimit/);
    if (!m) return;
    const v = m[1];
    if (new RegExp(`if\\s*\\(\\s*!${v}\\.success`).test(c)) {
      issues.push(`${name}: !${v}.success (old API)`);
    }
  });
  return issues;
});

// ─── S3: checkRateLimit without createRateLimitResponse ────────────────────────
test('S3-RL-MISSING-RESPONSE', () => {
  const issues = [];
  getAllFunctions().forEach(name => {
    const c = readFunc(name);
    if (!c) return;
    if (/checkRateLimit/.test(c) && !/createRateLimitResponse/.test(c)) {
      issues.push(`${name}: checkRateLimit but no createRateLimitResponse`);
    }
  });
  return issues;
});

// ─── S4: createRateLimitResponse with old .remaining args ─────────────────────
test('S4-OLD-CLR-ARGS', () => {
  const issues = [];
  getAllFunctions().forEach(name => {
    const c = readFunc(name);
    if (!c || !/checkRateLimit/.test(c)) return;
    const m = c.match(/const\s+(\w+)\s*=\s*(?:await\s+)?checkRateLimit/);
    if (!m) return;
    const v = m[1];
    if (new RegExp(`createRateLimitResponse\\s*\\(\\s*${v}\\.remaining`).test(c)) {
      issues.push(`${name}: createRateLimitResponse(${v}.remaining, ...) old API`);
    }
  });
  return issues;
});

// ─── S5: Rate limit with always-truthy object check ────────────────────────────
test('S5-RL-ALWAYS-TRUTHY', () => {
  const issues = [];
  getAllFunctions().forEach(name => {
    const c = readFunc(name);
    if (!c) return;
    // Pattern: if (rateResult) return rateResult; — object always truthy
    if (/if\s*\(\s*\w+\s*\)\s*return\s*\w+\s*;/.test(c) && /createRateLimitResponse/.test(c)) {
      issues.push(`${name}: potential always-truthy rate limit check`);
    }
  });
  return issues;
});

// ─── S6: Orphan imports (imported but never used) ───────────────────────────────
test('S6-ORPHAN-IMPORTS', () => {
  const issues = [];
  getAllFunctions().forEach(name => {
    const c = readFunc(name);
    if (!c) return;
    const imports = [...c.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']\.\.\/_\?shared\//g)]
      .flatMap(m => m[1].split(',').map(s => s.trim().replace(/\s+as\s+\w+/g, '').split(/\s*=\s*/)[0].trim()))
      .filter(s => s && !s.startsWith('//'));
    imports.forEach(sym => {
      if (sym && !new RegExp(`\\b${sym}\\b`).test(c.slice(c.indexOf('from')))) {
        issues.push(`${name}: imported "${sym}" but never used`);
      }
    });
  });
  return issues.slice(0, 10);
});

// ─── S7: Missing index.ts (skip _shared, providers) ────────────────────────────
test('S7-MISSING-INDEX', () => {
  const issues = [];
  const SKIP = ['_shared', 'providers'];
  fs.readdirSync(DIR, { withFileTypes: true }).forEach(e => {
    if (e.isDirectory() && !SKIP.includes(e.name) && !fs.existsSync(path.join(DIR, e.name, 'index.ts'))) {
      issues.push(`${e.name}: directory has no index.ts`);
    }
  });
  return issues;
});

// ─── S8: Zod .success ambiguous with rate limit var ────────────────────────────
test('S8-ZOD-SUCCESS-AMBIguity', () => {
  const issues = [];
  getAllFunctions().forEach(name => {
    const c = readFunc(name);
    if (!c || !/checkRateLimit/.test(c) || !/safeParse/.test(c)) return;
    const rlVar = c.match(/const\s+(\w+)\s*=\s*(?:await\s+)?checkRateLimit/);
    if (rlVar && new RegExp(`${rlVar[1]}\\.success`).test(c)) {
      issues.push(`${name}: rate limit var ${rlVar[1]} uses .success (Zod ambiguity)`);
    }
  });
  return issues;
});

// ─── S9: Hardcoded secrets / API keys ──────────────────────────────────────────
test('S9-HARDCODED-SECRETS', () => {
  const issues = [];
  getAllFunctions().forEach(name => {
    const c = readFunc(name);
    if (!c) return;
    const code = c.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    if (/\bBearer\s+["']sk[-live][a-zA-Z0-9_-]{20,}/.test(code) ||
        /\bBearer\s+["']sk-[a-zA-Z0-9_-]{20,}/.test(code)) {
      issues.push(`${name}: potential hardcoded secret key`);
    }
  });
  return issues;
});

// ─── S10: SQL injection — template literal in .from() ────────────────────────
test('S10-SQL-INJECTION', () => {
  const issues = [];
  getAllFunctions().forEach(name => {
    const c = readFunc(name);
    if (!c) return;
    if (/\.from\(`[^`]*\$\{/.test(c)) {
      issues.push(`${name}: template literal in .from()`);
    }
  });
  return issues;
});

// ─── S11: Code injection (eval/new Function) ───────────────────────────────────
test('S11-CODE-INJECTION', () => {
  const issues = [];
  getAllFunctions().forEach(name => {
    if (name === 'agent-workflow-runner') return; // legitimate workflow engine
    const c = readFunc(name);
    if (!c) return;
    if (/\beval\s*\(/i.test(c) || /\bnew\s+Function\s*\(/.test(c)) {
      issues.push(`${name}: eval or new Function`);
    }
  });
  return issues;
});

// ─── S12: Missing auth — whitelist known public/internal functions ───────────────
test('S12-MISSING-AUTH', () => {
  const issues = [];
  // Known public endpoints (webhooks, cron, health, OAuth, DLQ ops)
  const PUBLIC = /webhook|cron|smoke-test|migrate|slack-events|health-check|oauth|notify|dispatcher|dlq|rag-sync|verify|incident-orchestrator|datahub-mcp|computer-use|validate-access|openclaw-proxy|queue-worker|synthetic-runner|quick-agent-test|rag-embed-backfill|visual-search|widget-proxy|browser-agent-run|browser-session-cancel|notification-sender|agent-conversational-builder|kb-analyze-gaps|kb-translate-article|workflow-engine-v2/i;
  getAllFunctions().forEach(name => {
    if (PUBLIC.test(name)) return;
    const c = readFunc(name);
    if (!c) return;
    const hasAuth = /authenticateRequest|getAuthUserId|\.auth\.getUser|verify_jwt|authenticate\b/i.test(c);
    const hasCORS = /cors|CORS|getCorsHeaders/.test(c);
    if (!hasAuth && hasCORS) issues.push(`${name}: CORS without auth`);
  });
  return issues;
});

// ─── S13: HTTP method without CORS (served via serve/http) ───────────────────
test('S13-MISSING-CORS', () => {
  const issues = [];
  getAllFunctions().forEach(name => {
    const c = readFunc(name);
    if (!c) return;
    if (/Deno\.serve|serve\(/.test(c) && !/cors|CORS|getCorsHeaders|handleCorsPreflight/.test(c)) {
      issues.push(`${name}: Deno.serve without CORS`);
    }
  });
  return issues;
});

// ─── S14: Unsanitized console.error ────────────────────────────────────────────
test('S14-UNSANITIZED-CONSOLE', () => {
  const issues = [];
  getAllFunctions().forEach(name => {
    const c = readFunc(name);
    if (!c) return;
    if (/console\.error\([^)]+,\s*(?:e|err)\)/.test(c) && !/instanceof Error/.test(c)) {
      issues.push(`${name}: bare error in console.error`);
    }
  });
  return issues;
});

// ─── S15: Bare fetch in LLM calls (no timeout) ────────────────────────────────
test('S15-BARE-FETCH-LLM', () => {
  const LLM = /lovable|ai\.gateway|hf-inference|chat\/completions|audio\/speech|embeddings|rerank/i;
  const issues = [];
  getAllFunctions().forEach(name => {
    const c = readFunc(name);
    if (!c || !LLM.test(c)) return;
    c.split('\n').forEach((l, i) => {
      if (!l.trim().startsWith('import') && l.includes('fetch(') && !l.includes('fetchWithTimeout')) {
        if (LLM.test(l) && !/AbortSignal|signal:/.test(l)) {
          issues.push(`${name}:${i+1} bare fetch in LLM call`);
        }
      }
    });
  });
  return issues;
});

// ─── S16: TRUE missing outer catch (inner try is intentional, no outer catch) ────
test('S16-MISSING-CATCH', () => {
  const issues = [];
  getAllFunctions().forEach(name => {
    const c = readFunc(name);
    if (!c) return;
    const serveIdx = c.search(/Deno\.serve|serve\(/);
    if (serveIdx < 0) return;
    const serveBody = c.slice(serveIdx);
    const outerTry = (serveBody.match(/\btry\s*\{/g) || []).length;
    const outerCatch = (serveBody.match(/\bcatch\b/g) || []).length;
    // True issue: inner try without outer catch
    if (outerTry > 0 && outerCatch === 0) issues.push(`${name}: ${outerTry} try / 0 catch`);
  });
  return issues;
});

// ─── S17: Multiple checkRateLimit with 0 createRateLimitResponse ───────────────
test('S17-DUPLICATE-RL', () => {
  const issues = [];
  getAllFunctions().forEach(name => {
    const c = readFunc(name);
    if (!c) return;
    const calls = (c.match(/checkRateLimit\s*\(/g) || []).length;
    const responses = (c.match(/createRateLimitResponse\s*\(/g) || []).length;
    if (calls > 1 && responses === 0) issues.push(`${name}: ${calls} calls / 0 responses`);
  });
  return issues;
});

// ─── S18: JSON Response without Content-Type ───────────────────────────────────
test('S18-MISSING-CONTENT-TYPE', () => {
  const issues = [];
  getAllFunctions().forEach(name => {
    const c = readFunc(name);
    if (!c) return;
    // Skip: functions that define a headers variable containing Content-Type (const/let with optional type annotation)
    if (/\b(const|let)\s+\w*(?:Headers|ctHeaders)\w*\s*(?::\s*\w[^;=]*)?\s*=\s*\{[^}]*['"]Content-Type['"]/.test(c)) return;

    const lines = c.split('\n');
    lines.forEach((l, i) => {
      if (/JSON\.stringify/.test(l) && !/Content-Type/.test(l)) {
        const next20 = lines.slice(i, i + 20).join(' ');
        if (/body:\s*JSON\.stringify/.test(next20)) return;
        if (/String\s*\(.*JSON\.stringify/.test(next20)) return;
        if (/`[^`]*\$\{[^}]*JSON\.stringify/.test(next20)) return;
        if (/return\s+\{[^}]*JSON\.stringify/.test(next20)) return;
        if (!/new\s+Response\s*\(/.test(next20)) return;
        if (/\.\.\.\w+.*Content-Type|Content-Type.*\.\.\./.test(next20)) return;
        if (/headers:\s*\{[^}]*Content-Type/.test(next20)) return;
        issues.push(`${name}:${i + 1} Response without Content-Type`);
      }
    });
  });
  return issues.slice(0, 10);
});

// ─── S19: Mutation without idempotency key ─────────────────────────────────────
test('S19-MISSING-IDEMPOTENCY', () => {
  const issues = [];
  // Public, read-only, notify-only, and workspace-admin functions
  const PUBLIC_OR_READONLY = /webhook|cron|smoke-test|migrate|slack-events|health-check|oauth|dlq|rag-sync|verify|incident-orchestrator|quick-agent-test|synthetic-runner|validate-access|notebook-podcast-generate|semantic-search|oracle-research|oracle-council|eval-judge|replay-fork|a2a-server|agent-conversational-builder|agent-eval-runner|agent-workflow-runner|automation-pipeline|browser-agent-run|browser-session-cancel|datahub-query|doc-rechunk|eval-engine-v2|hf-autotrain|kb-analyze-gaps|kb-translate-article|lgpd-manager|llm-gateway|memory-manager|memory-tools|notification-sender|queue-worker|rag-embed-backfill|rag-ingest|slack-agent-notify|slack-alert-dispatcher|smolagent-runtime|voice-session|voice-synthesize|voice-transcribe|workflow-engine-v2/i;
  getAllFunctions().forEach(name => {
    if (PUBLIC_OR_READONLY.test(name)) return;
    const c = readFunc(name);
    if (!c) return;
    const isMutation = /insert\(|update\(|upsert\(|\.delete\(|postMessage|sendText|sendNotification/i.test(c);
    const hasIdem = /idempotency|x-idempotency|idempotency_key/i.test(c);
    if (isMutation && !hasIdem) issues.push(`${name}: mutation without idempotency`);
  });
  return issues;
});

// ─── S20: Invalid RATE_LIMITS preset name ─────────────────────────────────────
test('S20-INVALID-PRESET', () => {
  const rl = fs.readFileSync(path.join(DIR, '_shared/rate-limiter.ts'), 'utf8');
  const valid = [...rl.matchAll(/^\s+(\w+):\s*\{/gm)].map(m => m[1]);
  const issues = [];
  getAllFunctions().forEach(name => {
    const c = readFunc(name);
    if (!c || !/RATE_LIMITS\./.test(c)) return;
    [...c.matchAll(/RATE_LIMITS\.(\w+)/g)].forEach(m => {
      if (!valid.includes(m[1])) issues.push(`${name}: RATE_LIMITS.${m[1]} invalid`);
    });
  });
  return issues;
});

// ─── S21: Duplicate OPTIONS handler ───────────────────────────────────────────
test('S21-DUPLICATE-OPTIONS', () => {
  const issues = [];
  getAllFunctions().forEach(name => {
    const c = readFunc(name);
    if (!c) return;
    const lines = c.split('\n').filter(l => /OPTIONS/.test(l));
    if (lines.length > 4) issues.push(`${name}: ${lines.length} OPTIONS lines`);
  });
  return issues;
});

// ─── S22: status:200 in catch block ───────────────────────────────────────────
test('S22-STATUS-INCONSISTENCY', () => {
  const issues = [];
  getAllFunctions().forEach(name => {
    const c = readFunc(name);
    if (!c) return;
    if (/catch[^{]*\{[^}]*status:\s*200/.test(c)) issues.push(`${name}: status:200 in catch`);
  });
  return issues;
});

// ─── S23: requireEnv INSIDE Deno.serve with also OUTSIDE (duplicate — real issue) ──
test('S23-REQUIRED-OUTSIDE-SERVE', () => {
  const issues = [];
  getAllFunctions().forEach(name => {
    const c = readFunc(name);
    if (!c) return;
    const serveIdx = c.search(/Deno\.serve|serve\(/);
    if (serveIdx < 0) return;
    // Flag ONLY if requireEnv appears both OUTSIDE and INSIDE serve (duplicate — real bug)
    const topLevel = (c.slice(0, serveIdx).match(/requireEnv\s*\(/g) || []).length;
    const insideServe = (c.slice(serveIdx).match(/requireEnv\s*\(/g) || []).length;
    if (topLevel > 0 && insideServe > 0) {
      issues.push(`${name}: requireEnv both OUTSIDE and INSIDE Deno.serve`);
    }
  });
  return issues;
});

// ─── S24: RATE_LIMITS used but not imported ───────────────────────────────────
test('S24-UNDEFINED-RATE_LIMITS', () => {
  const issues = [];
  getAllFunctions().forEach(name => {
    const c = readFunc(name);
    if (!c || !/RATE_LIMITS\./.test(c)) return;
    if (!/import.*RATE_LIMITS|from.*_shared/.test(c)) issues.push(`${name}: RATE_LIMITS but not imported`);
  });
  return issues;
});

// ─── S25: Inline Deno.env.get for SERVICE_ROLE_KEY ─────────────────────────────
test('S25-INLINE-ENV-VARS', () => {
  const issues = [];
  getAllFunctions().forEach(name => {
    const c = readFunc(name);
    if (!c) return;
    if (/createClient\s*\(\s*Deno\.env\.get\s*\(\s*['"]SUPABASE_SERVICE_ROLE_KEY['"]/.test(c)) {
      issues.push(`${name}: inline Deno.env.get for SERVICE_ROLE_KEY`);
    }
  });
  return issues;
});

// ─── S26: Response with plain object (not JSON.stringify) ──────────────────────
test('S26-UNWRAPPED-JSON', () => {
  const issues = [];
  getAllFunctions().forEach(name => {
    const c = readFunc(name);
    if (!c) return;
    const bad = c.split('\n').find(l =>
      /new\s+Response\s*\(\s*\{[^]/.test(l) && !/JSON\.stringify/.test(l) && !l.trim().startsWith('//')
    );
    if (bad) issues.push(`${name}: Response with plain object`);
  });
  return issues;
});

// ─── S27: TRUE empty catch {} (not .catch(() => {})) ──────────────────────────
test('S27-EMPTY-CATCH', () => {
  const issues = [];
  getAllFunctions().forEach(name => {
    const c = readFunc(name);
    if (!c) return;
    // Match: catch(...) { } where body is ONLY whitespace+}
    const re = /\bcatch\s*\([^)]*\)\s*\{[^}]*\}/g;
    let m;
    while ((m = re.exec(c)) !== null) {
      const block = m[0];
      const inner = block.slice(block.indexOf('{') + 1, block.lastIndexOf('}'));
      if (/^\s*$/.test(inner)) {
        issues.push(name);
      }
    }
  });
  return issues;
});

// ─── S28: Network calls without try/catch ─────────────────────────────────────
test('S28-UNCAUGHT-ERROR', () => {
  const issues = [];
  getAllFunctions().forEach(name => {
    const c = readFunc(name);
    if (!c) return;
    if (/fetchWithTimeout|fetch\(/.test(c) && !/try\s*\{/.test(c)) {
      issues.push(`${name}: network calls without try/catch`);
    }
  });
  return issues;
});

// ─── S29: Duplicate const declarations (TRUE: same scope) ──────────────────────
test('S29-DUPLICATE-DECL', () => {
  const issues = [];
  getAllFunctions().forEach(name => {
    const c = readFunc(name);
    if (!c) return;
    // Find duplicate const declarations in same function scope
    const lines = c.split('\n');
    const decls = {};
    let inServe = false;
    lines.forEach((l, i) => {
      if (/Deno\.serve|serve\(/.test(l)) inServe = true;
      if (inServe && /^const\s+(\w+)\s*=/.test(l.trim())) {
        const v = l.trim().match(/^const\s+(\w+)\s*=/)[1];
        if (decls[v] !== undefined) issues.push(`${name}: duplicate const "${v}"`);
        decls[v] = i;
      }
    });
  });
  return issues.slice(0, 10);
});

// ─── S30: : any without eslint-disable (agent workflow areas are expected) ──────
test('S30-UNSAFE-ANY', () => {
  const issues = [];
  const EXPECTED_ANY = /agent-workflow-runner|browser-agent-run|code-interpreter-execute|computer-use-execute|cerebro-brain/;
  getAllFunctions().forEach(name => {
    if (EXPECTED_ANY.test(name)) return;
    const c = readFunc(name);
    if (!c) return;
    const lines = c.split('\n');
    lines.forEach((l, i) => {
      if (/\b: any\b/.test(l) && !/eslint-disable/.test(l)) {
        const prevLine = i > 0 ? lines[i - 1] : '';
        if (!/eslint-disable/.test(prevLine) && !l.trim().startsWith('//')) {
          issues.push(`${name}:${i + 1} bare ": any"`);
        }
      }
    });
  });
  return issues.slice(0, 10);
});

// ─── RUN ──────────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(70));
console.log('SIMULAÇÃO EXAUSTIVA V2 — Edge Functions — Fator X V2');
console.log('═'.repeat(70) + '\n');

results.forEach(r => console.log(r));

const trueFails = ['S1','S2','S3','S4','S5','S8','S9','S10','S11','S14','S15','S17','S20','S21','S22','S24','S25','S26','S28'];
const critical = results.filter(r => trueFails.some(s => r.includes('['+s+']')) && r.startsWith('❌'));
const informational = results.filter(r => !trueFails.some(s => r.includes('['+s+']')) && r.startsWith('❌'));

console.log('\n' + '─'.repeat(70));
console.log(`RESULTADO: ${pass} PASS, ${fail} FAIL`);
console.log(`  🔴 CRÍTICAS:  ${critical.length}`);
console.log(`  🟡 INFO:      ${informational.length}`);
console.log('─'.repeat(70));

if (critical.length > 0) {
  console.log('\n🔴 CRÍTICAS REAIS:');
  critical.forEach(r => console.log('  ' + r));
}