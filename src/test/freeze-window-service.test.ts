/**
 * Freeze Window Service Tests — Etapa 42/50
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabaseClient } from './_test-utils.ts';

const fakeInsert = vi.fn();
const fakeUpdate = vi.fn();
const fakeDelete = vi.fn();
const fakeSelect = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: fakeSelect,
      insert: fakeInsert,
      update: fakeUpdate,
      delete: fakeDelete,
    })),
  },
}));

import {
  listFreezeWindows,
  createFreezeWindow,
  updateFreezeWindow,
  deleteFreezeWindow,
} from './freezeWindowService.ts';

describe('freezeWindowService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listFreezeWindows', () => {
    it('retorna lista ordenada por start_time desc', async () => {
      const mockWindows = [
        { id: '1', workspace_id: 'ws1', start_time: '2025-01-01', end_time: '2025-01-07' },
        { id: '2', workspace_id: 'ws1', start_time: '2025-01-15', end_time: '2025-01-21' },
      ];
      fakeSelect.mockResolvedValue({ data: mockWindows, error: null });

      const result = await listFreezeWindows('ws1');

      expect(result).toEqual(mockWindows);
      expect(fakeSelect).toHaveBeenCalledWith('*');
    });

    it('propaga erro do Supabase', async () => {
      fakeSelect.mockResolvedValue({ data: null, error: { message: 'Table not found' } });

      await expect(listFreezeWindows('ws1')).rejects.toThrow('Table not found');
    });
  });

  describe('createFreezeWindow', () => {
    it('insere com workspace_id injetado e retorna row', async () => {
      const input = { name: 'Freeze Natal', start_time: '2025-12-20' };
      const inserted = { id: 'fw1', workspace_id: 'ws1', ...input };
      fakeInsert.mockResolvedValue({ data: inserted, error: null });

      const result = await createFreezeWindow('ws1', input);

      expect(fakeInsert).toHaveBeenCalledWith({ workspace_id: 'ws1', ...input });
      expect(result).toEqual(inserted);
    });

    it('propaga erro na inserção', async () => {
      fakeInsert.mockResolvedValue({ data: null, error: { message: 'RLS violation' } });

      await expect(createFreezeWindow('ws1', { name: 'Test' })).rejects.toThrow('RLS violation');
    });
  });

  describe('updateFreezeWindow', () => {
    it('faz update por ID e retorna row atualizado', async () => {
      const patch = { allow_emergency: true };
      const updated = { id: 'fw1', allow_emergency: true };
      fakeUpdate.mockResolvedValue({ data: updated, error: null });

      const result = await updateFreezeWindow('fw1', patch);

      expect(fakeUpdate).toHaveBeenCalledWith(patch);
      expect(result).toEqual(updated);
    });
  });

  describe('deleteFreezeWindow', () => {
    it('deleta por ID sem erro', async () => {
      fakeDelete.mockResolvedValue({ error: null });

      await expect(deleteFreezeWindow('fw1')).resolves.toBeUndefined();
      expect(fakeDelete).toHaveBeenCalledWith({ id: 'fw1' });
    });

    it('propaga erro na deleção', async () => {
      fakeDelete.mockResolvedValue({ error: { message: 'Not found' } });

      await expect(deleteFreezeWindow('fw1')).rejects.toThrow('Not found');
    });
  });
});
