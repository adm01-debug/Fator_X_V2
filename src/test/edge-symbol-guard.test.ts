import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guard: helpers compartilhados usados em Edge Functions precisam estar
 * importados (ou definidos localmente). O bug original — `getCorsHeaders`
 * usado sem import em 7 funções — só aparecia em runtime, como
 * `ReferenceError`, e apenas no caminho de erro (rate limit atingido),
 * que é justamente quando o log é mais necessário.
 */
const SHARED_HELPERS = [
  'getCorsHeaders',
  'handleCorsPreflight',
  'jsonResponse',
  'errorResponse',
  'checkRateLimit',
  'createRateLimitResponse',
  'getRateLimitIdentifier',
  'requireEnv',
  'parseBody',
];

function collectFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectFiles(full, acc);
    else if (full.endsWith('.ts')) acc.push(full);
  }
  return acc;
}

describe('Edge Functions — símbolos compartilhados', () => {
  const root = 'supabase/functions';
  const files = collectFiles(root);

  it('varre um conjunto representativo de arquivos', () => {
    // Sem esta asserção, uma mudança de layout de pastas faria a varredura
    // devolver zero arquivos e o teste passaria vazio (falsa cobertura).
    expect(files.length).toBeGreaterThan(20);
  });

  it('não usa helper compartilhado sem import nem definição local', () => {
    const offenders: string[] = [];

    for (const file of files) {
      if (file.includes('/_shared/')) continue;
      const source = readFileSync(file, 'utf8');

      for (const helper of SHARED_HELPERS) {
        const used = new RegExp(`\\b${helper}\\s*\\(`).test(source);
        if (!used) continue;

        const imported = new RegExp(`import[\\s\\S]*?\\{[^}]*\\b${helper}\\b[^}]*\\}`).test(source);
        const declared = new RegExp(`(function|const|let)\\s+${helper}\\b`).test(source);

        if (!imported && !declared) offenders.push(`${file} → ${helper}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
