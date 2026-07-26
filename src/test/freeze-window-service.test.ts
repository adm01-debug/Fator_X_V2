/**
 * Freeze Window Service Tests — Etapa 42/50
 *
 * Usa o mock compartilhado `getSharedSupabaseMock()` (validado por
 * `supabase-mock-simulation.test.ts` em 800+ formas de cadeia), em vez de um
 * mock raso. Isso mantém o teste focado no comportamento do serviço mesmo que
 * a consulta ganhe novos elos no futuro.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSharedSupabaseMock } from './utils/supabaseMock';

// A factory do `vi.mock` é içada acima dos `const` deste arquivo, então ela não
// pode fechar sobre uma variável local. Ambos os lados resolvem a MESMA
// instância pela chave da suíte.
vi.mock('@/integrations/supabase/client', async () => {
  const m = await import('./utils/supabaseMock');
  return { supabase: m.getSharedSupabaseMock('freeze-window', { id: 'user-1' }).client };
});

const db = getSharedSupabaseMock('freeze-window', { id: 'user-1' });




import {
  listFreezeWindows,
  createFreezeWindow,
  updateFreezeWindow,
  deleteFreezeWindow,
} from '@/services/freezeWindowService';

describe('freezeWindowService', () => {
  beforeEach(() => {
    db.reset();
  });

  describe('listFreezeWindows', () => {
    it('filtra por workspace e ordena por starts_at desc', async () => {
      const mockWindows = [
        { id: '2', workspace_id: 'ws1', starts_at: '2025-01-15', ends_at: '2025-01-21' },
        { id: '1', workspace_id: 'ws1', starts_at: '2025-01-01', ends_at: '2025-01-07' },
      ];
      db.setResult({ data: mockWindows, error: null });

      const result = await listFreezeWindows('ws1');

      expect(result).toEqual(mockWindows);
      expect(db.calls.from).toHaveBeenCalledWith('freeze_windows');
      expect(db.calls.select).toHaveBeenCalledWith('*');
      expect(db.calls.eq).toHaveBeenCalledWith('workspace_id', 'ws1');
      expect(db.calls.order).toHaveBeenCalledWith('starts_at', { ascending: false });
    });

    it('retorna array vazio quando não há dados', async () => {
      db.setResult({ data: null, error: null });
      await expect(listFreezeWindows('ws1')).resolves.toEqual([]);
    });

    it('propaga erro do banco', async () => {
      db.setResult({ data: null, error: { message: 'Table not found' } });
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
      db.setResult({ data: inserted, error: null });

      const result = await createFreezeWindow('ws1', input);

      expect(db.calls.insert).toHaveBeenCalledWith({
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
      db.setUser(null);
      await expect(
        createFreezeWindow('ws1', {
          name: 'Test',
          starts_at: '2025-12-20T00:00:00Z',
          ends_at: '2025-12-27T00:00:00Z',
        }),
      ).rejects.toThrow('Sessão inválida');
      expect(db.calls.insert).not.toHaveBeenCalled();
    });

    it('propaga erro de RLS na inserção', async () => {
      db.setResult({ data: null, error: { message: 'RLS violation', code: '42501' } });
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
      db.setResult({ data: updated, error: null });

      const result = await updateFreezeWindow('fw1', patch);

      expect(db.calls.update).toHaveBeenCalledWith(patch);
      expect(db.calls.eq).toHaveBeenCalledWith('id', 'fw1');
      expect(result).toEqual(updated);
    });

    it('propaga erro no update', async () => {
      db.setResult({ data: null, error: { message: 'Not found' } });
      await expect(updateFreezeWindow('fw1', { name: 'x' })).rejects.toThrow('Not found');
    });
  });

  describe('deleteFreezeWindow', () => {
    it('deleta por ID sem erro', async () => {
      db.setResult({ data: null, error: null });

      await expect(deleteFreezeWindow('fw1')).resolves.toBeUndefined();
      expect(db.calls.delete).toHaveBeenCalled();
      expect(db.calls.eq).toHaveBeenCalledWith('id', 'fw1');
    });

    it('propaga erro na deleção', async () => {
      db.setResult({ data: null, error: { message: 'Not found' } });
      await expect(deleteFreezeWindow('fw1')).rejects.toThrow('Not found');
    });
  });
});
