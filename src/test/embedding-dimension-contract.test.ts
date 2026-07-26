import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Guard do contrato de embeddings.
 *
 * Motivação concreta: produtor e consumidor divergiram silenciosamente em dois
 * eixos ao mesmo tempo, e nenhum teste pegou porque cada arquivo estava
 * internamente correto:
 *
 *  1. `rag-embed-backfill` enviava `dimensions` (plural); o schema Zod do
 *     embedder declara `dimension` (singular). Campo desconhecido é ignorado,
 *     então caía no default — sem erro, sem log.
 *  2. O default era 1024, mas as colunas `chunks.embedding` e
 *     `agent_memories_v2.embedding` são `vector(1536)`. Toda escrita falhava.
 *
 * O efeito combinado: 100% das linhas iam para o dead-letter. Um teste de
 * unidade por arquivo jamais detectaria isso — só um teste de CONTRATO entre
 * eles. É por isso que este guard lê os fontes em vez de importar módulos.
 */

const CANONICAL_DIM = 1536;

function readFn(name: string): string {
  return readFileSync(resolve(process.cwd(), `supabase/functions/${name}/index.ts`), 'utf-8');
}

describe('contrato de dimensão de embeddings', () => {
  it('o embedder declara 1536 como dimensão canônica', () => {
    const src = readFn('rag-embed-v2');
    expect(src).toMatch(/const CANONICAL_DIM = 1536/);
    // O default do schema precisa vir da constante, não de um literal solto:
    // literais duplicados foram exatamente a origem da divergência anterior.
    expect(src).toMatch(/dimension:\s*z\.number\(\)[^\n]*\.default\(CANONICAL_DIM\)/);
  });

  it('nenhum consumidor usa o nome de campo errado (`dimensions`)', () => {
    for (const fn of ['rag-embed-backfill', 'semantic-search']) {
      const src = readFn(fn);
      expect(
        src,
        `${fn} usa "dimensions" (plural); o embedder espera "dimension"`,
      ).not.toMatch(/\bdimensions\s*:/);
    }
  });

  it('os consumidores pedem exatamente a dimensão canônica', () => {
    const backfill = readFn('rag-embed-backfill');
    expect(backfill).toMatch(new RegExp(`EMBED_DIM\\s*=\\s*${CANONICAL_DIM}`));
    expect(backfill).toMatch(/dimension:\s*EMBED_DIM/);

    const search = readFn('semantic-search');
    expect(search).toMatch(new RegExp(`dimension:\\s*${CANONICAL_DIM}`));
  });

  it('o embedder valida a dimensão devolvida por cada provedor', () => {
    const src = readFn('rag-embed-v2');
    // A API de feature-extraction da HF ignora o parâmetro e devolve a
    // dimensão nativa do modelo. Sem esta checagem, o vetor errado só quebra
    // no INSERT, longe do provedor que o originou.
    expect(src).toMatch(/function hasExactDimension/);
    expect(src).toMatch(/hasExactDimension\(hf,\s*dimension\)/);
    expect(src).toMatch(/hasExactDimension\(oa,\s*dimension\)/);
  });

  it('o embedder sinaliza o fallback de hash como degradado', () => {
    const src = readFn('rag-embed-v2');
    expect(src).toMatch(/const degraded = embeddings === null/);
    expect(src).toMatch(/degraded,/);
  });

  it('nenhum consumidor persiste ou busca com vetor degradado', () => {
    // Vetor de hash é determinístico mas semanticamente vazio: gravá-lo é pior
    // que deixar NULL, porque a busca passa a devolver resultados errados com
    // aparência de confiança e não há como distingui-los depois.
    expect(readFn('rag-embed-backfill')).toMatch(/degraded === true/);
    expect(readFn('semantic-search')).toMatch(/degraded === true/);
  });
});
