/**
 * Mock reutilizável do client PostgREST (Supabase) para testes unitários.
 *
 * ## Por que existe
 *
 * O padrão que quebrava suítes era o mock "raso":
 *
 * ```ts
 * from: vi.fn(() => ({ select: fakeSelect, insert: fakeInsert }))
 * ```
 *
 * Ele funciona enquanto o serviço chamar exatamente `from().select()`. No
 * instante em que o serviço evolui para `from().select().eq().order()` — que é
 * o uso normal do PostgREST — o teste explode com
 * `supabase.from(...).select(...).eq is not a function`, e a mensagem aponta
 * para o mock, não para o bug real. Foi exatamente essa a causa-raiz das 7
 * falhas em `freeze-window-service.test.ts`.
 *
 * ## Como este mock resolve
 *
 * O builder é um `Proxy` **thenable**: qualquer método encadeável devolve o
 * próprio builder, e o objeto resolve para o resultado configurado quando
 * aguardado (`await`) ou quando um terminador (`single`, `maybeSingle`,
 * `csv`, ...) é chamado. Isso replica o contrato real do `PostgrestBuilder`,
 * que também é um thenable encadeável — logo o teste passa a validar o
 * **serviço**, não a forma do mock.
 *
 * ## Uso
 *
 * ```ts
 * const db = createSupabaseMock();
 * vi.mock('@/integrations/supabase/client', () => ({ supabase: db.client }));
 *
 * db.setResult({ data: [{ id: '1' }], error: null });
 * await listThings('ws1');
 * expect(db.calls.eq).toHaveBeenCalledWith('workspace_id', 'ws1');
 * ```
 *
 * Para respostas diferentes por tabela, use `setTableResult('freeze_windows', …)`,
 * que tem prioridade sobre o resultado padrão.

 */
import { vi, type Mock } from 'vitest';

/** Formato de resposta do PostgREST. */
export interface PostgrestLikeResult<T = unknown> {
  data: T | null;
  error: { message: string; code?: string; details?: string } | null;
  count?: number | null;
  status?: number;
}

/**
 * Métodos que retornam o próprio builder (encadeáveis).
 * Cobre filtros, modificadores e transformadores do PostgREST v2.
 */
const CHAINABLE_METHODS = new Set([
  // verbos
  'select', 'insert', 'update', 'upsert', 'delete',
  // filtros
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in',
  'contains', 'containedBy', 'rangeGt', 'rangeGte', 'rangeLt', 'rangeLte',
  'rangeAdjacent', 'overlaps', 'textSearch', 'match', 'not', 'or', 'filter',
  // modificadores
  'order', 'limit', 'range', 'abortSignal', 'returns', 'setHeader',
  'explain', 'rollback', 'onConflict', 'geojson', 'throwOnError',
]);

/**
 * Métodos terminais: resolvem a promise imediatamente em vez de encadear.
 */
const TERMINAL_METHODS = new Set(['single', 'maybeSingle', 'csv']);

const DEFAULT_RESULT: PostgrestLikeResult = { data: null, error: null, count: null, status: 200 };

export interface SupabaseMock {
  /** Objeto a injetar no lugar de `supabase`. */
  client: Record<string, unknown>;
  /** Espiões por nome de método, para asserções (`calls.eq`, `calls.insert`, ...). */
  calls: Record<string, Mock>;
  /** Define o resultado padrão de qualquer cadeia subsequente. */
  setResult: (result: Partial<PostgrestLikeResult>) => void;
  /** Define o resultado apenas para uma tabela específica (tem prioridade). */
  setTableResult: (table: string, result: Partial<PostgrestLikeResult>) => void;
  /** Define o retorno de `supabase.rpc(name, ...)`. */
  setRpcResult: (fn: string, result: Partial<PostgrestLikeResult>) => void;
  /** Define o retorno de `supabase.functions.invoke(name, ...)`. */
  setFunctionResult: (fn: string, result: Partial<PostgrestLikeResult>) => void;
  /**
   * Substitui a implementação de `functions.invoke` — use quando o teste
   * precisa de respostas sequenciais (ex.: 1ª chamada falha, 2ª sucede) ou
   * de lógica dependente do payload.
   */
  setInvokeImpl: (impl: ((name: string, opts?: unknown) => unknown) | null) => void;
  /** Define o usuário devolvido por `auth.getUser()` / `auth.getSession()`. */
  setUser: (user: { id: string; email?: string } | null) => void;
  /** Limpa espiões e resultados, voltando ao estado inicial. */
  reset: () => void;

}

/**
 * Cria um mock encadeável do client Supabase.
 *
 * @param initialUser Usuário retornado por `auth.getUser()`. `null` simula
 *                    sessão ausente — útil para testar caminhos de 401.
 */
export function createSupabaseMock(
  initialUser: { id: string; email?: string } | null = { id: 'test-user-id', email: 'test@nexus.dev' },
): SupabaseMock {
  const calls: Record<string, Mock> = {};
  let defaultResult: PostgrestLikeResult = { ...DEFAULT_RESULT };
  const tableResults = new Map<string, PostgrestLikeResult>();
  const rpcResults = new Map<string, PostgrestLikeResult>();
  let user = initialUser;

  /** Espião memoizado por nome de método — permite `calls.eq` após o fato. */
  const spy = (name: string): Mock => (calls[name] ??= vi.fn());

  function resultFor(table: string | null): PostgrestLikeResult {
    if (table && tableResults.has(table)) return tableResults.get(table)!;
    return defaultResult;
  }

  /**
   * Builder baseado em Proxy: aceita QUALQUER método encadeável do PostgREST,
   * inclusive os que ainda não existem nesta versão do SDK, sem precisar
   * atualizar este arquivo.
   */
  function makeBuilder(table: string | null): Record<string, unknown> {
    const target = {} as Record<string, unknown>;
    const proxy: Record<string, unknown> = new Proxy(target, {
      get(_t, prop: string | symbol) {
        if (typeof prop !== 'string') return undefined;

        // Torna o builder aguardável (`await query`), como o PostgrestBuilder real.
        if (prop === 'then') {
          return (onFulfilled?: (v: PostgrestLikeResult) => unknown, onRejected?: (e: unknown) => unknown) =>
            Promise.resolve(resultFor(table)).then(onFulfilled, onRejected);
        }
        if (prop === 'catch') {
          return (onRejected?: (e: unknown) => unknown) =>
            Promise.resolve(resultFor(table)).catch(onRejected);
        }
        if (prop === 'finally') {
          return (onFinally?: () => void) => Promise.resolve(resultFor(table)).finally(onFinally);
        }

        if (TERMINAL_METHODS.has(prop)) {
          return (...args: unknown[]) => {
            spy(prop)(...args);
            return Promise.resolve(resultFor(table));
          };
        }

        // Qualquer outro método é tratado como encadeável. Ser permissivo aqui
        // é intencional: um mock que falha por método desconhecido reintroduz
        // exatamente a fragilidade que este utilitário elimina.
        return (...args: unknown[]) => {
          spy(prop)(...args);
          if (!CHAINABLE_METHODS.has(prop)) spy('__unknownChainable')(prop, ...args);
          return proxy;
        };
      },
    });
    return proxy;
  }

  const client: Record<string, unknown> = {
    from: (table: string) => {
      spy('from')(table);
      return makeBuilder(table);
    },
    rpc: (fn: string, params?: unknown) => {
      spy('rpc')(fn, params);
      return Promise.resolve(rpcResults.get(fn) ?? defaultResult);
    },
    auth: {
      getUser: () => {
        spy('getUser')();
        return Promise.resolve({ data: { user }, error: null });
      },
      getSession: () => {
        spy('getSession')();
        return Promise.resolve({
          data: { session: user ? { user, access_token: 'test-token' } : null },
          error: null,
        });
      },
      onAuthStateChange: () => {
        spy('onAuthStateChange')();
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      signOut: () => {
        spy('signOut')();
        return Promise.resolve({ error: null });
      },
    },
    functions: {
      invoke: (name: string, opts?: unknown) => {
        spy('invoke')(name, opts);
        return Promise.resolve(defaultResult);
      },
    },
    storage: {
      from: (bucket: string) => {
        spy('storageFrom')(bucket);
        return makeBuilder(`storage:${bucket}`);
      },
    },
    channel: (name: string) => {
      spy('channel')(name);
      return makeBuilder(`channel:${name}`);
    },
    removeChannel: (...args: unknown[]) => {
      spy('removeChannel')(...args);
    },
  };

  return {
    client,
    calls: new Proxy(calls, {
      get: (_t, p: string | symbol) => (typeof p === 'string' ? spy(p) : undefined),
    }) as Record<string, Mock>,
    setResult: (result) => {
      defaultResult = { ...DEFAULT_RESULT, ...result };
    },
    setTableResult: (table, result) => {
      tableResults.set(table, { ...DEFAULT_RESULT, ...result });
    },
    setRpcResult: (fn, result) => {
      rpcResults.set(fn, { ...DEFAULT_RESULT, ...result });
    },
    setUser: (next) => {
      user = next;
    },
    reset: () => {
      for (const key of Object.keys(calls)) calls[key].mockClear();
      defaultResult = { ...DEFAULT_RESULT };
      tableResults.clear();
      rpcResults.clear();
      user = initialUser;
    },
  };
}

/**
 * Instância compartilhada, memoizada por chave.
 *
 * ### Por que isto é necessário
 *
 * `vi.mock` é **içado para o topo do arquivo**, acima de qualquer `const`. Um
 * `const db = createSupabaseMock()` no corpo do teste ainda não existe quando a
 * factory do `vi.mock` roda, e o import do serviço falha com
 * `ReferenceError: Cannot access 'db' before initialization`.
 *
 * A saída limpa é a factory e o corpo do teste pegarem a **mesma** instância
 * por chave, cada um pelo seu caminho:
 *
 * ```ts
 * import { getSharedSupabaseMock } from './utils/supabaseMock';
 *
 * vi.mock('@/integrations/supabase/client', async () => {
 *   const m = await import('./utils/supabaseMock');
 *   return { supabase: m.getSharedSupabaseMock('freeze', { id: 'user-1' }).client };
 * });
 *
 * const db = getSharedSupabaseMock('freeze', { id: 'user-1' });
 * ```
 *
 * @param key Identificador único por suíte — evita que dois arquivos de teste
 *            compartilhem estado acidentalmente.
 */
const sharedMocks = new Map<string, SupabaseMock>();

export function getSharedSupabaseMock(
  key: string,
  initialUser?: { id: string; email?: string } | null,
): SupabaseMock {
  const existing = sharedMocks.get(key);
  if (existing) return existing;
  const created = createSupabaseMock(initialUser === undefined ? undefined : initialUser);
  sharedMocks.set(key, created);
  return created;
}

