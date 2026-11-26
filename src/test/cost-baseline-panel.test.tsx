/**
 * CostBaselinePanel — a tabela `cost_baselines` ganhou tela.
 *
 * Antes: dava para ver as anomalias disparadas (`cost_alerts`) e rodar a
 * detecção, mas não existia nenhuma leitura de `cost_baselines` no front nem
 * gatilho para `compute_cost_baselines()` — o detector comparava com uma
 * baseline invisível, que ninguém podia recalcular. Estes testes travam as duas
 * pontas e a fronteira de permissão (o recálculo é só para admin).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockListBaselines = vi.fn();
const mockRecompute = vi.fn();
vi.mock('@/services/costAnomalyService', () => ({
  listBaselines: (...args: unknown[]) => mockListBaselines(...args),
  recomputeBaselines: () => mockRecompute(),
}));

let mockIsAdmin = true;
vi.mock('@/hooks/useRBAC', () => ({
  useRBAC: () => ({ isAdmin: mockIsAdmin, loading: false }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CostBaselinePanel } from '@/components/cost/CostBaselinePanel';

const BASELINE = {
  id: 'b1',
  workspace_id: 'w-1',
  scope: 'agent' as const,
  scope_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  hour_of_day: 14,
  day_of_week: 1,
  avg_cost_usd: 0.1234,
  stddev_cost_usd: 0.0456,
  sample_count: 12,
  computed_at: '2026-11-26T10:00:00.000Z',
};

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CostBaselinePanel />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockIsAdmin = true;
  mockListBaselines.mockReset();
  mockRecompute.mockReset();
  mockListBaselines.mockResolvedValue([BASELINE]);
  mockRecompute.mockResolvedValue(undefined);
});

describe('CostBaselinePanel', () => {
  it('mostra escopo, janela e custo médio da baseline', async () => {
    renderPanel();
    expect(await screen.findByText('Agente')).toBeInTheDocument();
    expect(screen.getByText('Seg 14h')).toBeInTheDocument();
    expect(screen.getByText('$0.1234')).toBeInTheDocument();
    expect(screen.getByText('±$0.0456')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('recalcula as baselines pelo admin', async () => {
    renderPanel();
    await screen.findByText('Agente');

    await userEvent.click(screen.getByRole('button', { name: /Recalcular/i }));

    await waitFor(() => expect(mockRecompute).toHaveBeenCalledTimes(1));
  });

  it('esconde o recálculo de quem não é admin', async () => {
    mockIsAdmin = false;
    renderPanel();
    await screen.findByText('Agente');
    expect(screen.queryByRole('button', { name: /Recalcular/i })).not.toBeInTheDocument();
  });

  it('explica o vazio como baseline ausente, não como erro', async () => {
    mockListBaselines.mockResolvedValue([]);
    renderPanel();
    expect(await screen.findByText(/Nenhum baseline calculado ainda/i)).toBeInTheDocument();
  });

  it('lê todas as baselines na abertura, com teto de 200 janelas', async () => {
    renderPanel();
    await screen.findByText('Agente');
    expect(mockListBaselines).toHaveBeenCalledWith({ scope: undefined, limit: 200 });
  });
});
