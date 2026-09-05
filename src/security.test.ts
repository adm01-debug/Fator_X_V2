import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSecurityAlerts, resolveSecurityAlert } from './services/securityService';
import { supabaseExternal } from './integrations/supabase/externalClient';
import type { DbRow } from '@/types/dbRow';

vi.mock('./integrations/supabase/externalClient', () => ({
  supabaseExternal: {
    from: vi.fn(),
  },
}));

describe('Security Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches security alerts correctly', async () => {
    const mockData = [{ id: '1', message: 'Test Alert' }];
    (supabaseExternal.from as unknown as { mockReturnValue: (v: DbRow) => void }).mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: mockData, error: null }),
        }),
      }),
    });

    const alerts = await getSecurityAlerts();
    expect(alerts).toEqual(mockData);
    expect(supabaseExternal.from).toHaveBeenCalledWith('security_alerts');
  });

  it('resolves security alerts correctly', async () => {
    (supabaseExternal.from as unknown as { mockReturnValue: (v: DbRow) => void }).mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });

    await resolveSecurityAlert('123');
    expect(supabaseExternal.from).toHaveBeenCalledWith('security_alerts');
  });
});
