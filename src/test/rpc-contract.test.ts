/**
 * Contrato de RPC: todo nome passado a `.rpc(...)` no código deve existir no
 * schema do banco.
 *
 * Motivação (bug real, encontrado três vezes): uma função é renomeada ou nunca
 * chega a ser criada, mas as chamadas permanecem. O PostgREST responde 404/42883
 * — e como quase toda chamada dessas é um *guard* de permissão avaliado com
 * fail-closed, o sintoma que chega ao usuário é "acesso negado", não "função
 * inexistente". Painéis inteiros ficaram quebrados por meses assim, porque o
 * erro se disfarçava de comportamento correto.
 *
 * `src/integrations/supabase/types.ts` é gerado a partir do banco real, então
 * suas chaves em `Functions` são a lista autoritativa do que existe. Comparar o
 * código contra ele transforma um erro silencioso de runtime em falha de CI.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOTS = ['src', 'supabase/functions'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);
/** Este próprio arquivo cita nomes de RPC em texto; não deve se auto-analisar. */
const SELF = 'rpc-contract.test.ts';

/**
 * Exceções conscientes. Cada entrada precisa de justificativa: a lista existe
 * para documentar dívida conhecida, não para silenciar o teste.
 */
const KNOWN_ABSENT: Record<string, string> = {
  // Convenção opcional de projetos EXTERNOS conectados ao DataHub, nunca do
  // banco local. A ausência é tratada com degradação graciosa no chamador
  // (`list_rls_policies` reporta a conexão como indisponível, sem lançar).
  exec_sql: 'RPC de projeto externo; ausência já tratada com fallback em datahub-query',
};

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // diretório opcional (ex.: supabase/functions ausente)
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(SELF)) out.push(full);
  }
  return out;
}

/** Nomes literais em `.rpc('nome'` — chamadas dinâmicas são ignoradas de propósito. */
function extractRpcNames(source: string): string[] {
  const matches = source.matchAll(/\.rpc\(\s*['"`]([A-Za-z0-9_]+)['"`]/g);
  return [...matches].map((m) => m[1]);
}

function declaredFunctions(): Set<string> {
  const types = readFileSync('src/integrations/supabase/types.ts', 'utf8');
  const start = types.indexOf('Functions: {');
  expect(start, 'bloco Functions não encontrado em types.ts').toBeGreaterThan(-1);
  // Nomes de função aparecem como chaves indentadas em 6 espaços no bloco
  // gerado. Sobrecargas não abrem `{` — emitem uma união na linha seguinte —,
  // então casar apenas `nome: {` perderia justamente as funções sobrecarregadas.
  const block = types.slice(start, types.indexOf('\n    Enums: {', start));
  return new Set([...block.matchAll(/^ {6}([a-z0-9_]+):/gm)].map((m) => m[1]));
}

describe('contrato de RPC entre código e banco', () => {
  const files = ROOTS.flatMap((root) => walk(root));

  it('encontra arquivos para analisar', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('todo .rpc() referencia uma função existente no schema', () => {
    const known = declaredFunctions();
    expect(known.size).toBeGreaterThan(50);

    const offenders: string[] = [];
    for (const file of files) {
      for (const name of extractRpcNames(readFileSync(file, 'utf8'))) {
        if (known.has(name) || name in KNOWN_ABSENT) continue;
        offenders.push(`${file}: .rpc('${name}') não existe no schema`);
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('não acumula exceções sem justificativa', () => {
    for (const [name, reason] of Object.entries(KNOWN_ABSENT)) {
      expect(reason.length, `exceção '${name}' precisa de justificativa`).toBeGreaterThan(20);
    }
  });
});
