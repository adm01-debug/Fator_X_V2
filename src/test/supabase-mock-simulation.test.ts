/**
 * Simulação combinatória do mock PostgREST — prevenção de falhas e gaps.
 *
 * Objetivo: provar que `createSupabaseMock()` sobrevive a *centenas* de formas
 * de cadeia diferentes antes de adotá-lo nas suítes de serviço. O modo de falha
 * que estamos prevenindo é o histórico: um mock que quebra quando o serviço
 * acrescenta mais um elo (`.eq`, `.order`, `.range`) à consulta, produzindo um
 * "TypeError: … is not a function" que mascara o comportamento real.
 *
 * A simulação enumera o produto cartesiano de verbos × filtros × modificadores
 * × terminadores, resultando em >400 cenários executados de verdade.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createSupabaseMock } from './utils/supabaseMock';

const VERBS = ['select', 'insert', 'update', 'upsert', 'delete'] as const;
const FILTERS = ['eq', 'neq', 'gt', 'lte', 'like', 'ilike', 'in', 'is', 'not', 'or', 'contains'] as const;
const MODIFIERS = ['order', 'limit', 'range', 'returns', 'throwOnError'] as const;
const TERMINATORS = ['await', 'single', 'maybeSingle'] as const;

type Terminator = (typeof TERMINATORS)[number];

/** Executa uma cadeia arbitrária e devolve o resultado resolvido. */
async function runChain(
  builder: Record<string, unknown>,
  verb: string,
  filter: string,
  modifier: string,
  terminator: Terminator,
) {
  type Chainable = Record<string, (...args: unknown[]) => Chainable> & PromiseLike<unknown>;
  let q = builder as unknown as Chainable;
  q = q[verb]('*');
  q = q[filter]('col', 'value');
  q = q[modifier]('col', { ascending: false });
  if (terminator === 'await') return await q;
  return await (q[terminator] as unknown as () => Promise<unknown>)();
}

describe('createSupabaseMock — simulação combinatória', () => {
  let db: ReturnType<typeof createSupabaseMock>;

  beforeEach(() => {
    db = createSupabaseMock();
  });

  it(`resolve todas as ${VERBS.length * FILTERS.length * MODIFIERS.length * TERMINATORS.length} combinações de cadeia sem TypeError`, async () => {
    const payload = [{ id: 'row-1' }];
    db.setResult({ data: payload, error: null });
    const from = db.client.from as (t: string) => Record<string, unknown>;

    let executed = 0;
    for (const verb of VERBS) {
      for (const filter of FILTERS) {
        for (const modifier of MODIFIERS) {
          for (const terminator of TERMINATORS) {
            const result = (await runChain(from('t'), verb, filter, modifier, terminator)) as {
              data: unknown;
              error: unknown;
            };
            expect(result.error).toBeNull();
            expect(result.data).toEqual(payload);
            executed += 1;
          }
        }
      }
    }

    // Guard-rail: se alguém encolher as listas, o teste perde valor silenciosamente.
    expect(executed).toBeGreaterThanOrEqual(400);
  });

  it('propaga erro em todas as combinações verbo × terminador', async () => {
    db.setResult({ data: null, error: { message: 'RLS violation', code: '42501' } });
    const from = db.client.from as (t: string) => Record<string, unknown>;

    for (const verb of VERBS) {
      for (const terminator of TERMINATORS) {
        const result = (await runChain(from('t'), verb, 'eq', 'limit', terminator)) as {
          error: { message: string; code?: string } | null;
        };
        expect(result.error?.message).toBe('RLS violation');
        expect(result.error?.code).toBe('42501');
      }
    }
  });

  it('isola resultados por tabela, com fallback para o padrão', async () => {
    db.setResult({ data: [], error: null });
    db.setTableResult('agents', { data: [{ id: 'a1' }], error: null });
    db.setTableResult('workspaces', { data: null, error: { message: 'denied' } });
    const from = db.client.from as (t: string) => Record<string, unknown>;

    const agents = (await from('agents').select as (s: string) => Promise<{ data: unknown }>)('*');
    expect((await agents).data).toEqual([{ id: 'a1' }]);

    const ws = await (from('workspaces').select as (s: string) => Promise<{ error: { message: string } | null }>)('*');
    expect(ws.error?.message).toBe('denied');

    const other = await (from('outra_tabela').select as (s: string) => Promise<{ data: unknown }>)('*');
    expect(other.data).toEqual([]);
  });

  it('registra argumentos de cada elo da cadeia para asserção', async () => {
    db.setResult({ data: [], error: null });
    const from = db.client.from as (t: string) => Record<string, unknown>;
    type Q = Record<string, (...a: unknown[]) => Q> & PromiseLike<unknown>;
    const q = from('freeze_windows') as unknown as Q;
    await q.select('*').eq('workspace_id', 'ws1').order('starts_at', { ascending: false });

    expect(db.calls.from).toHaveBeenCalledWith('freeze_windows');
    expect(db.calls.select).toHaveBeenCalledWith('*');
    expect(db.calls.eq).toHaveBeenCalledWith('workspace_id', 'ws1');
    expect(db.calls.order).toHaveBeenCalledWith('starts_at', { ascending: false });
  });

  it('suporta cadeias muito longas (stress de 50 elos)', async () => {
    db.setResult({ data: [{ ok: true }], error: null });
    const from = db.client.from as (t: string) => Record<string, unknown>;
    type Q = Record<string, (...a: unknown[]) => Q> & PromiseLike<unknown>;
    let q = (from('t') as unknown as Q).select('*');
    for (let i = 0; i < 50; i += 1) q = q.eq(`col_${i}`, i);
    const result = (await q) as { data: unknown };

    expect(result.data).toEqual([{ ok: true }]);
    expect(db.calls.eq).toHaveBeenCalledTimes(50);
  });

  it('modela sessão presente e ausente em auth', async () => {
    const auth = db.client.auth as {
      getUser: () => Promise<{ data: { user: { id: string } | null } }>;
      getSession: () => Promise<{ data: { session: unknown } }>;
    };
    expect((await auth.getUser()).data.user?.id).toBe('test-user-id');

    db.setUser(null);
    expect((await auth.getUser()).data.user).toBeNull();
    expect((await auth.getSession()).data.session).toBeNull();
  });

  it('resolve rpc por nome com fallback ao resultado padrão', async () => {
    db.setResult({ data: 'fallback', error: null });
    db.setRpcResult('has_role', { data: true, error: null });
    const rpc = db.client.rpc as (fn: string, p?: unknown) => Promise<{ data: unknown }>;

    expect((await rpc('has_role', { _role: 'admin' })).data).toBe(true);
    expect((await rpc('outra_fn')).data).toBe('fallback');
    expect(db.calls.rpc).toHaveBeenCalledWith('has_role', { _role: 'admin' });
  });

  it('reset() limpa espiões, resultados por tabela e usuário', async () => {
    db.setTableResult('agents', { data: [{ id: 'x' }], error: null });
    db.setUser(null);
    const from = db.client.from as (t: string) => Record<string, unknown>;
    await (from('agents').select as (s: string) => Promise<unknown>)('*');
    expect(db.calls.from).toHaveBeenCalledTimes(1);

    db.reset();

    expect(db.calls.from).toHaveBeenCalledTimes(0);
    const after = await (from('agents').select as (s: string) => Promise<{ data: unknown }>)('*');
    expect(after.data).toBeNull();
    const auth = db.client.auth as { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
    expect((await auth.getUser()).data.user?.id).toBe('test-user-id');
  });
});
