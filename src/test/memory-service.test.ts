/**
 * memoryService tests.
 *
 * A suíte anterior era cobertura simbólica (`typeof mod.x === 'function'`).
 * O risco real neste serviço é arquitetural: ele fala com **dois** clients.
 * `listMemories` lê do banco externo (`supabaseExternal`), todo o resto
 * invoca Edge Functions pelo client local. Um mock único mascara essa
 * fronteira — se `listMemories` regredir para o client local, a leitura vai
 * para o banco errado e o teste passaria mesmo assim.
 *
 * Aqui usamos dois mocks distintos justamente para provar a fronteira, além
 * do contrato de erro: `memory-tools` sinaliza falha de DUAS formas
 * (`error` do transporte e `data.error` no corpo 200) e ambas precisam virar
 * exceção — senão a UI renderiza sucesso em cima de uma escrita perdida.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSharedSupabaseMock } from './utils/supabaseMock';

vi.mock('@/integrations/supabase/client', async () => {
  const m = await import('./utils/supabaseMock');
  return { supabase: m.getSharedSupabaseMock('memory-local').client };
});
vi.mock('@/integrations/supabase/externalClient', async () => {
  const m = await import('./utils/supabaseMock');
  return { supabaseExternal: m.getSharedSupabaseMock('memory-external').client };
});

import {
  addMemory,
  searchMemory,
  forgetMemory,
  compactMemories,
  listMemories,
  invokeMemoryManager,
  promoteMemoryToFact,
} from '@/services/memoryService';

const local = getSharedSupabaseMock('memory-local');
const external = getSharedSupabaseMock('memory-external');

beforeEach(() => {
  local.reset();
  external.reset();
});

describe('memoryService — envelope memory-tools', () => {
  it('addMemory envia tool + params no formato aceito pela edge function', async () => {
    local.setFunctionResult('memory-tools', { data: { ok: true } });
    await addMemory('lembrar disto', 'procedural', 'Wizard');

    expect(local.calls.invoke).toHaveBeenCalledWith('memory-tools', {
      body: {
        tool: 'memory_save',
        params: { content: 'lembrar disto', memory_type: 'procedural', source: 'Wizard' },
      },
    });

  });

  it('addMemory aplica defaults semantic/Manual quando omitidos', async () => {
    local.setFunctionResult('memory-tools', { data: { ok: true } });
    await addMemory('conteudo');

    const [, opts] = local.calls.invoke.mock.calls[0] as [string, { body: { params: Record<string, unknown> } }];
    expect(opts.body.params).toEqual({
      content: 'conteudo',
      memory_type: 'semantic',
      source: 'Manual',
    });
  });

  it('searchMemory devolve lista vazia — nunca undefined — quando não há memórias', async () => {
    local.setFunctionResult('memory-tools', { data: {} });
    await expect(searchMemory('q')).resolves.toEqual([]);
  });

  it('searchMemory repassa memórias e o limite solicitado', async () => {
    local.setFunctionResult('memory-tools', {
      data: { memories: [{ id: 'm1', content: 'c', source: 's', created_at: 'now', relevance_score: 0.4 }] },
    });
    const out = await searchMemory('q', 'episodic', 7);

    expect(out).toHaveLength(1);
    const [, opts] = local.calls.invoke.mock.calls[0] as [string, { body: { params: Record<string, unknown> } }];
    expect(opts.body.params).toEqual({ query: 'q', memory_type: 'episodic', limit: 7 });
  });

  it('propaga erro de transporte da edge function', async () => {
    local.setFunctionResult('memory-tools', { data: null, error: { message: 'boom' } });
    await expect(forgetMemory('m1')).rejects.toThrow('boom');
  });

  it('propaga erro devolvido NO CORPO com HTTP 200 (falha silenciosa clássica)', async () => {
    local.setFunctionResult('memory-tools', { data: { error: 'quota exceeded' }, error: null });
    await expect(compactMemories('semantic')).rejects.toThrow('quota exceeded');
  });
});

describe('memoryService — fronteira entre client local e banco externo', () => {
  it('listMemories lê do banco EXTERNO, com filtro/ordem/paginação corretos', async () => {
    external.setTableResult('agent_memories', {
      data: [{ id: 'm1', content: 'c', source: 's', created_at: 'now', relevance_score: null }],
      count: 42,
    });

    const out = await listMemories('semantic', 10, 20);

    expect(out).toEqual({
      memories: [{ id: 'm1', content: 'c', source: 's', created_at: 'now', relevance_score: null }],
      total: 42,
    });
    expect(external.calls.from).toHaveBeenCalledWith('agent_memories');
    expect(external.calls.eq).toHaveBeenCalledWith('memory_type', 'semantic');
    expect(external.calls.order).toHaveBeenCalledWith('created_at', { ascending: false });
    // offset..offset+limit-1 — um off-by-one aqui duplica ou perde linhas na paginação.
    expect(external.calls.range).toHaveBeenCalledWith(20, 29);
    // A leitura NÃO pode vazar para o client local.
    expect(local.calls.from).toBeUndefined();
  });

  it('listMemories devolve total 0 quando o count vem nulo', async () => {
    external.setTableResult('agent_memories', { data: [], count: null });
    await expect(listMemories('episodic')).resolves.toEqual({ memories: [], total: 0 });
  });

  it('listMemories propaga erro do banco externo em vez de devolver lista vazia', async () => {
    external.setTableResult('agent_memories', { data: null, error: { message: 'rls denied' } });
    await expect(listMemories('semantic')).rejects.toMatchObject({ message: 'rls denied' });
  });
});

describe('memoryService — memory-manager (interface de operador)', () => {
  it('preenche os defaults do contrato para não gravar memória sem escopo', async () => {
    local.setFunctionResult('memory-manager', { data: { ok: true } });
    await invokeMemoryManager({ action: 'add', content: 'x' });

    const [name, opts] = local.calls.invoke.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(name).toBe('memory-manager');
    expect(opts.body).toMatchObject({
      action: 'add',
      memory_type: 'episodic',
      scope: 'user',
      importance: 0.5,
      limit: 10,
    });
  });

  it('promoteMemoryToFact usa importância alta por padrão', async () => {
    local.setFunctionResult('memory-manager', { data: { ok: true } });
    await promoteMemoryToFact('m-9');

    const [, opts] = local.calls.invoke.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(opts.body).toMatchObject({
      action: 'promote_to_fact',
      memory_id: 'm-9',
      importance: 0.9,
    });
  });

  it('devolve envelope ok mesmo quando a função responde sem corpo', async () => {
    local.setFunctionResult('memory-manager', { data: null, error: null });
    await expect(invokeMemoryManager({ action: 'list' })).resolves.toEqual({ ok: true });
  });

  it('converte erro do memory-manager em exceção', async () => {
    local.setFunctionResult('memory-manager', { data: null, error: { message: 'no session' } });
    await expect(promoteMemoryToFact('m-1')).rejects.toThrow('no session');
  });
});
