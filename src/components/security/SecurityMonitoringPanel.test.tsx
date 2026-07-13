import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SecurityMonitoringPanel } from '@/components/security/SecurityMonitoringPanel';
import '@testing-library/jest-dom';
import type { DbRow } from '@/types/dbRow';

// Mock Supabase client
vi.mock('@/integrations/supabase/externalClient', () => ({
  supabaseExternal: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
          then: (cb: (r: { data: DbRow[]; error: null }) => unknown) => cb({ data: [], error: null })
        }))
      })),
    })),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis()
    })),
    removeChannel: vi.fn()
  }
}));

describe('SecurityMonitoringPanel', () => {
  it('should render the monitoring central header', () => {
    render(<SecurityMonitoringPanel />);
    expect(screen.getByText(/Central de Monitoramento/i)).toBeInTheDocument();
  });

  it('should show the loading state initially', () => {
    render(<SecurityMonitoringPanel />);
    expect(screen.getByText(/Sincronizando/i)).toBeInTheDocument();
  });
});
