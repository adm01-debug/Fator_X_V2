import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSecurityAlerts, resolveSecurityAlert } from '../services/securityService';
import { supabaseExternal } from '../integrations/supabase/externalClient';

vi.mock('../integrations/supabase/externalClient', () => ({
  supabaseExternal: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
            then: vi.fn((cb) => Promise.resolve({ data: [], error: null }).then(cb))
          })),
          eq: vi.fn(() => Promise.resolve({ data: [], error: null }))
        }))
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null }))
      }))
    }))
  }
}));

describe('Security Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches security alerts correctly', async () => {
    const mockData = [{ id: '1', message: 'Test Alert' }];
    (supabaseExternal.from as any).mockReturnValue({
      select: vi.fn().mockReturnVALUE({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: mockData, error: null })
        })
      })
    });

    const alerts = await getSecurityAlerts();
    expect(supabaseExternal.from).toHaveBeenCalledWith('security_alerts');
  });

  it('resolves security alerts correctly', async () => {
    (supabaseExternal.from as any).mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null })
      })
    });

    await resolveSecurityAlert('123');
    expect(supabaseExternal.from).toHaveBeenCalledWith('security_alerts');
  });
});
