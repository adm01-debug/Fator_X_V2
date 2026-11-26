/**
 * Registro de Riscos — a página consome a camada de negócio do banco.
 *
 * A página gravava direto em `risk_register` (insert/update), o que pulava:
 * `register_risk`/`close_risk` (eventos `risk.registered`/`risk.closed` no
 * `audit_log`), `review_risk` (escrita em `risk_review_events`, cujo trigger
 * recalcula `residual_score` e reagenda a revisão) e `get_risk_summary` (os
 * indicadores). Resultado: a trilha de revisão do GRC ficava vazia e o
 * `riskService.ts` era código morto. Estes testes travam a fronteira.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { getSharedSupabaseMock } from './utils/supabaseMock';

vi.mock('@/integrations/supabase/client', async () => {
  const m = await import('./utils/supabaseMock');
  return { supabase: m.getSharedSupabaseMock('risk-rpc').client };
});

vi.mock('@/hooks/use-data', () => ({ useWorkspaceId: () => ({ data: 'ws-1' }) }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import RiskRegisterPage from '@/pages/RiskRegisterPage';

const db = getSharedSupabaseMock('risk-rpc');

// jsdom não implementa a Pointer Capture API que o Radix Select usa ao abrir.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.setPointerCapture = () => {};
}

const RISK = {
  id: 'risk-1',
  title: 'Chaves de API em log',
  description: null,
  category: 'security',
  likelihood: 4,
  impact: 5,
  inherent_score: 20,
  residual_score: 12,
  treatment: 'mitigate',
  mitigation_plan: null,
  status: 'assessed',
  next_review_due: '2026-12-01T00:00:00.000Z',
  created_at: '2026-11-01T00:00:00.000Z',
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/security/risks']}>
        <RiskRegisterPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  db.reset();
  db.setTableResult('risk_register', { data: [RISK], error: null });
  db.setTableResult('risk_review_events', { data: [], error: null });
});

describe('RiskRegisterPage — RPCs do registro de riscos', () => {
  it('alimenta os indicadores com get_risk_summary', async () => {
    db.setRpcResult('get_risk_summary', {
      data: {
        total: 4,
        critical: 2,
        high: 1,
        medium: 1,
        low: 0,
        overdue_reviews: 1,
        untreated: 0,
        closed: 3,
        by_category: {},
        by_treatment: {},
        heatmap: [],
      },
      error: null,
    });

    renderPage();

    expect(db.calls.rpc).toHaveBeenCalledWith('get_risk_summary', { p_workspace_id: 'ws-1' });
    // Card "Total" = abertos (4) + encerrados (3)
    expect(await screen.findByText('7')).toBeInTheDocument();
  });

  it('registra risco por register_risk em vez de insert direto na tabela', async () => {
    db.setRpcResult('register_risk', { data: 'risk-novo', error: null });

    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /Novo Risco/i }));
    await userEvent.type(screen.getByPlaceholderText(/Ex: Exposição/i), 'Chaves em log');
    await userEvent.click(screen.getByRole('button', { name: /Registrar Risco/i }));

    await waitFor(() =>
      expect(db.calls.rpc).toHaveBeenCalledWith(
        'register_risk',
        expect.objectContaining({
          p_workspace_id: 'ws-1',
          p_title: 'Chaves em log',
          p_category: 'technical',
          p_likelihood: 3,
          p_impact: 3,
          p_treatment: 'mitigate',
        }),
      ),
    );
    expect(db.calls.insert).not.toHaveBeenCalled();
  });

  it('mostra o histórico e grava a revisão por review_risk', async () => {
    db.setTableResult('risk_review_events', {
      data: [
        {
          id: 'rev-1',
          risk_id: 'risk-1',
          reviewed_by: 'u1',
          reviewed_at: '2026-11-20T10:00:00.000Z',
          previous_residual_score: 20,
          new_residual_score: 12,
          notes: 'Mitigação aplicada',
        },
      ],
      error: null,
    });
    db.setRpcResult('review_risk', { data: 'rev-2', error: null });

    renderPage();
    await userEvent.click(
      await screen.findByRole('button', { name: /Revisar Chaves de API em log/i }),
    );

    expect(await screen.findByText('Mitigação aplicada')).toBeInTheDocument();

    const score = screen.getByLabelText(/Novo score residual/i);
    await userEvent.clear(score);
    await userEvent.type(score, '9');
    await userEvent.click(screen.getByRole('button', { name: /Registrar revisão/i }));

    await waitFor(() =>
      expect(db.calls.rpc).toHaveBeenCalledWith('review_risk', {
        p_risk_id: 'risk-1',
        p_new_residual_score: 9,
        p_notes: undefined,
      }),
    );
  });

  it('encerra o risco por close_risk (auditoria) em vez de update direto', async () => {
    db.setRpcResult('close_risk', { data: null, error: null });

    renderPage();
    await screen.findByText('Chaves de API em log');

    const trigger = screen.getByRole('combobox');
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole('option', { name: /closed/i }));

    await waitFor(() =>
      expect(db.calls.rpc).toHaveBeenCalledWith('close_risk', {
        p_risk_id: 'risk-1',
        p_notes: undefined,
      }),
    );
  });
});
