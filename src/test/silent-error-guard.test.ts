import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guard contra erros engolidos em silêncio nas Edge Functions.
 *
 * Contexto: a ausência total das tabelas `traces`/`spans` passou despercebida
 * por muito tempo porque os inserts de telemetria usavam
 * `.then(() => {}, () => {})` — toda gravação falhava e nenhum sinal chegava
 * ao console. O mesmo padrão escondia falhas na trilha de auditoria e no
 * registro de circuit breakers (onde um painel vazio é lido como "saudável",
 * exatamente o contrário da verdade durante um incidente).
 *
 * A regra NÃO é "proibir best-effort" — operações de telemetria e auditoria
 * devem mesmo continuar não-bloqueantes. A regra é que o handler de erro
 * precise fazer *alguma coisa* observável. Um handler vazio é o que se proíbe.
 */

const FUNCTIONS_DIR = join(process.cwd(), 'supabase', 'functions');

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (entry.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** `.then(..., () => {})` — rejeição descartada sem nenhum efeito. */
const EMPTY_REJECTION_HANDLER = /\.then\([^)]*,\s*\(\s*[^)]*\)\s*=>\s*\{\s*\}\s*\)/;

/** `catch {}` ou `catch (e) {}` — bloco de tratamento literalmente vazio. */
const EMPTY_CATCH_BLOCK = /catch\s*(\([^)]*\))?\s*\{\s*\}/;

describe('edge functions não engolem erros em silêncio', () => {
  const files = collectTsFiles(FUNCTIONS_DIR);

  it('encontra arquivos para inspecionar', () => {
    // Protege o próprio guard: se a varredura devolvesse zero arquivos (por
    // uma mudança de layout de pastas), os testes abaixo passariam vazios e
    // dariam uma falsa sensação de cobertura.
    expect(files.length).toBeGreaterThan(20);
  });

  it('não usa handler de rejeição vazio em .then()', () => {
    const offenders = files.filter((f) => EMPTY_REJECTION_HANDLER.test(readFileSync(f, 'utf-8')));
    expect(
      offenders,
      'Use um handler que registre a falha (ex.: console.warn) em vez de descartá-la.',
    ).toEqual([]);
  });

  it('não usa bloco catch vazio', () => {
    const offenders = files.filter((f) => EMPTY_CATCH_BLOCK.test(readFileSync(f, 'utf-8')));
    expect(
      offenders,
      'Um catch vazio esconde a causa raiz. Registre o erro, mesmo sem relançá-lo.',
    ).toEqual([]);
  });
});
