/**
 * Cobre a semântica booleana de `installSkill`:
 * `true` = linha realmente inserida, `false` = já estava instalada (no-op).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const upsertSelect = vi.fn();
const rpc = vi.fn().mockResolvedValue({ data: null, error: null });

vi.mock('@/integrations/supabase/externalClient', () => ({
  supabaseExternal: {
    from: () => ({
      upsert: () => ({ select: upsertSelect }),
    }),
    rpc: (...args: unknown[]) => rpc(...args),
  },
}));

import { installSkill, bulkInstallSkills } from '@/services/skillsRegistryService';

beforeEach(() => {
  upsertSelect.mockReset();
  rpc.mockClear();
  rpc.mockResolvedValue({ data: null, error: null });
});

describe('installSkill', () => {
  it('retorna true quando a linha é inserida', async () => {
    upsertSelect.mockResolvedValue({ data: [{ skill_id: 's1' }], error: null });
    await expect(installSkill('a1', 's1')).resolves.toBe(true);
  });

  it('retorna false quando a skill já estava instalada', async () => {
    upsertSelect.mockResolvedValue({ data: [], error: null });
    await expect(installSkill('a1', 's1')).resolves.toBe(false);
  });

  it('propaga erro real do banco', async () => {
    upsertSelect.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    await expect(installSkill('a1', 's1')).rejects.toBeTruthy();
  });

  it('não chama o contador quando nada foi inserido', async () => {
    upsertSelect.mockResolvedValue({ data: [], error: null });
    await installSkill('a1', 's1');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('telemetria com falha não invalida a instalação', async () => {
    upsertSelect.mockResolvedValue({ data: [{ skill_id: 's1' }], error: null });
    rpc.mockRejectedValue(new Error('rpc down'));
    await expect(installSkill('a1', 's1')).resolves.toBe(true);
  });
});

describe('bulkInstallSkills', () => {
  it('separa instaladas de puladas', async () => {
    upsertSelect.mockResolvedValue({ data: [{ skill_id: 's2' }], error: null });
    const res = await bulkInstallSkills('a1', ['s1', 's2', 's2']);
    expect(res.installed).toEqual(['s2']);
    expect(res.skipped).toEqual(['s1']);
  });

  it('lista vazia é no-op sem tocar no banco', async () => {
    const res = await bulkInstallSkills('a1', []);
    expect(res).toEqual({ installed: [], skipped: [] });
    expect(upsertSelect).not.toHaveBeenCalled();
  });
});
