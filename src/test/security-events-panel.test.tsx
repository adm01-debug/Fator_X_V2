/**
 * SecurityEventsPanel — a trilha real de `security_events`.
 *
 * Antes deste painel, `getSecurityEvents` lia `audit_log_safe` e carimbava
 * `severity: 'info'` em tudo: a severidade real (o `critical` de uma exclusão
 * LGPD, por exemplo) nunca chegava a tela porque não havia tela. Estes testes
 * travam as duas pontas: a fonte da consulta e o filtro por severidade.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGetSecurityEvents = vi.fn();
vi.mock('@/services/securityService', () => ({
  getSecurityEvents: (...args: unknown[]) => mockGetSecurityEvents(...args),
}));

let mockIsAdmin = true;
vi.mock('@/hooks/useRBAC', () => ({
  useRBAC: () => ({ isAdmin: mockIsAdmin, loading: false }),
}));

import { SecurityEventsPanel } from '@/components/security/SecurityEventsPanel';

const EVENT = {
  id: 'e1',
  event_type: 'lgpd_delete_data',
  severity: 'critical',
  user_id: '11111111-2222-3333-4444-555555555555',
  workspace_id: 'w-1',
  ip_address: '203.0.113.7',
  user_agent: 'vitest/1.0',
  details: { scope: 'memories', reason: 'erasure' },
  created_at: '2026-11-26T12:00:00.000Z',
};

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SecurityEventsPanel />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockIsAdmin = true;
  mockGetSecurityEvents.mockReset();
  mockGetSecurityEvents.mockResolvedValue([EVENT]);
});

describe('SecurityEventsPanel', () => {
  it('mostra o evento com a severidade real, o IP e o autor', async () => {
    const { container } = renderPanel();

    expect(await screen.findByText('lgpd_delete_data')).toBeInTheDocument();
    expect(screen.getByText('critical')).toBeInTheDocument();
    expect(screen.getByText('IP 203.0.113.7')).toBeInTheDocument();
    expect(screen.getByText('11111111')).toBeInTheDocument();
    expect(container.textContent).toContain('memories');
  });

  it('lê o evento sem filtro na abertura', async () => {
    renderPanel();
    await screen.findByText('lgpd_delete_data');
    expect(mockGetSecurityEvents).toHaveBeenCalledWith({ severity: undefined, limit: 100 });
  });

  it('filtra por severidade ao clicar em Críticos', async () => {
    renderPanel();
    await screen.findByText('lgpd_delete_data');

    await userEvent.click(screen.getByRole('button', { name: 'Críticos' }));

    await waitFor(() =>
      expect(mockGetSecurityEvents).toHaveBeenCalledWith({ severity: 'critical', limit: 100 }),
    );
  });

  it('explica a lista vazia de admin sem eventos', async () => {
    mockGetSecurityEvents.mockResolvedValue([]);
    renderPanel();
    expect(await screen.findByText(/Nenhum evento de segurança registrado/i)).toBeInTheDocument();
  });

  it('não confunde RLS com ausência de eventos para quem não é admin', async () => {
    mockIsAdmin = false;
    mockGetSecurityEvents.mockResolvedValue([]);
    renderPanel();
    expect(await screen.findByText(/Somente administradores/i)).toBeInTheDocument();
  });
});
