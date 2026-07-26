/**
 * Freeze Window Service Tests — Etapa 42/50
 *
 * O serviço usa o builder encadeável do PostgREST
 * (`.select().eq().order()`, `.insert().select().single()`, etc.) e
 * `supabase.auth.getUser()`. O mock precisa refletir essa cadeia real —
 * um mock raso (só `select`/`insert`) quebra com
 * "supabase.from(...).select(...).eq is not a function".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Resultado que a próxima cadeia terminará resolvendo. */
type Result = { data: unknown; error: { message: string } | null };

const state: { result: Result } = { result: { data: null, error: null } };

const fakeFrom = vi.fn();
const fakeSelect = vi.fn();
const fakeInsert = vi.fn();
const fakeUpdate = vi.fn();
const fakeDelete = vi.fn();
const fakeEq = vi.fn();
const fakeOrder = vi.fn();
const fakeSingle = vi.fn();
const fakeGetUser = vi.fn();

/**
 * Builder thenable: qualquer método encadeável devolve o próprio builder e o
 * objeto resolve para `state.result` quando aguardado (`await`), replicando o
 * comportamento do PostgREST.
 */
function makeBuilder() {
  const builder: Record<string, unknown> = {
    select: (...args: unknown[]) => { fakeSelect(...args); return builder; },
    insert: (...args: unknown[]) => { fakeInsert(...args); return builder; },
    update: (...args: unknown[]) => { fakeUpdate(...args); return builder; },
    delete: (...args: unknown[]) => { fakeDelete(...args); return builder; },
    eq: (...args: unknown[]) => { fakeEq(...args); return builder; },
    order: (...args: unknown[]) => { fakeOrder(...args); return builder; },
    single: (...args: unknown[]) => { fakeSingle(...args); return Promise.resolve(state.result); },
    then: (resolve: (v: Result) => unknown) => Promise.resolve(state.result).then(resolve),
  };
  return builder;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => { fakeFrom(...args); return makeBuilder(); },
    auth: { getUser: () => fakeGetUser() },
  },
}));

import {
  listFreezeWindows,
  createFreezeWindow,
  updateFreezeWindow,
  deleteFreezeWindow,
} from '@/services/freezeWindowService';

describe('freezeWindowService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.result = { data: null, error: null };
    fakeGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  });

  describe('listFreezeWindows', () => {
    it('filtra por workspace e ordena por starts_at desc', async () => {
      const mockWindows = [
        { id: '2', workspace_id: 'ws1', starts_at: '2025-01-15', ends_at: '2025-01-21' },
        { id: '1', workspace_id: 'ws1', starts_at: '2025-01-01', ends_at: '2025-01-07' },
      ];
      state.result = { data: mockWindows, error: null };

      const result = await listFreezeWindows('ws1');

      expect(result).toEqual(mockWindows);
      expect(fakeFrom).toHaveBeenCalledWith('freeze_windows');
      expect(fakeSelect).toHaveBeenCalledWith('*');
      expect(fakeEq).toHaveBeenCalledWith('workspace_id', 'ws1');
      expect(fakeOrder).toHaveBeenCalledWith('starts_at', { ascending: false });
    });

    it('retorna array vazio quando não há dados', async () => {
      state.result = { data: null, error: null };
      await expect(listFreezeWindows('ws1')).resolves.toEqual([]);
    });

    it('propaga erro do banco', async () => {
      state.result = { data: null, error: { message: 'Table not found' } };
      await expect(listFreezeWindows('ws1')).rejects.toThrow('Table not found');
    });
  });

  describe('createFreezeWindow', () => {
    it('injeta workspace_id, created_by e defaults, retornando a row', async () => {
      const input = {
        name: 'Freeze Natal',
        starts_at: '2025-12-20T00:00:00Z',
        ends_at: '2025-12-27T00:00:00Z',
      };
      const inserted = { id: 'fw1', workspace_id: 'ws1', ...input };
      state.result = { data: inserted, error: null };

      const result = await createFreezeWindow('ws1', input);

      expect(fakeInsert).toHaveBeenCalledWith({
        workspace_id: 'ws1',
        name: 'Freeze Natal',
        reason: null,
        starts_at: input.starts_at,
        ends_at: input.ends_at,
        allow_emergency: true,
        created_by: 'user-1',
      });
      expect(result).toEqual(inserted);
    });

    it('rejeita quando não há sessão válida', async () => {
      fakeGetUser.mockResolvedValue({ data: { user: null }, error: null });
      await expect(
        createFreezeWindow('ws1', {
          name: 'Test',
          starts_at: '2025-12-20T00:00:00Z',
          ends_at: '2025-12-27T00:00:00Z',
        }),
      ).rejects.toThrow('Sessão inválida');
      expect(fakeInsert).not.toHaveBeenCalled();
    });

    it('propaga erro de RLS na inserção', async () => {
      state.result = { data: null, error: { message: 'RLS violation' } };
      await expect(
        createFreezeWindow('ws1', {
          name: 'Test',
          starts_at: '2025-12-20T00:00:00Z',
          ends_at: '2025-12-27T00:00:00Z',
        }),
      ).rejects.toThrow('RLS violation');
    });
  });

  describe('updateFreezeWindow', () => {
    it('faz update por ID e retorna a row atualizada', async () => {
      const patch = { allow_emergency: true };
      const updated = { id: 'fw1', allow_emergency: true };
      state.result = { data: updated, error: null };

      const result = await updateFreezeWindow('fw1', patch);

      expect(fakeUpdate).toHaveBeenCalledWith(patch);
      expect(fakeEq).toHaveBeenCalledWith('id', 'fw1');
      expect(result).toEqual(updated);
    });

    it('propaga erro no update', async () => {
      state.result = { data: null, error: { message: 'Not found' } };
      await expect(updateFreezeWindow('fw1', { name: 'x' })).rejects.toThrow('Not found');
    });
  });

  describe('deleteFreezeWindow', () => {
    it('deleta por ID sem erro', async () => {
      state.result = { data: null, error: null };

      await expect(deleteFreezeWindow('fw1')).resolves.toBeUndefined();
      expect(fakeDelete).toHaveBeenCalled();
      expect(fakeEq).toHaveBeenCalledWith('id', 'fw1');
    });

    it('propaga erro na deleção', async () => {
      state.result = { data: null, error: { message: 'Not found' } };
      await expect(deleteFreezeWindow('fw1')).rejects.toThrow('Not found');
    });
  });
});
