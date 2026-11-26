import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/services/fineTuningService', () => ({
  listTrainingJobs: vi.fn(),
  startTraining: vi.fn(),
  getJobStatus: vi.fn(),
  prepareDataset: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import FineTuningPage from '@/pages/FineTuningPage';
import { listTrainingJobs, startTraining, prepareDataset } from '@/services/fineTuningService';
import { toast } from 'sonner';

const mockList = listTrainingJobs as unknown as ReturnType<typeof vi.fn>;
const mockStart = startTraining as unknown as ReturnType<typeof vi.fn>;
const mockPrepare = prepareDataset as unknown as ReturnType<typeof vi.fn>;

describe('FineTuningPage', () => {
  beforeEach(() => {
    Element.prototype.scrollTo = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
    if (!globalThis.ResizeObserver) {
      globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      } as unknown as typeof ResizeObserver;
    }
    vi.clearAllMocks();
    mockList.mockResolvedValue({ jobs: [] });
  });

  it('lista os jobs devolvidos pelo servico em vez de dados fixos', async () => {
    mockList.mockResolvedValue({
      jobs: [
        {
          job_id: 'ft-real-001',
          status: 'completed',
          progress: 100,
          hub_repo: 'adm01/support-bot-v3',
        },
      ],
    });
    render(
      <MemoryRouter>
        <FineTuningPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/support-bot-v3/)).toBeInTheDocument();
    expect(screen.queryByText('legal-classifier')).not.toBeInTheDocument();
    expect(screen.queryByText('ptbr-summarizer')).not.toBeInTheDocument();
  });

  it('mostra estado vazio quando o servico nao devolve jobs', async () => {
    render(
      <MemoryRouter>
        <FineTuningPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/Nenhum treinamento ainda/i)).toBeInTheDocument();
  });

  it('mostra erro de carregamento em vez de esconder a falha', async () => {
    mockList.mockRejectedValue(new Error('hf-autotrain offline'));
    render(
      <MemoryRouter>
        <FineTuningPage />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(/hf-autotrain offline/i);
  });

  it('envia o treinamento ao servico com a configuracao do formulario', async () => {
    mockStart.mockResolvedValue({ job_id: 'ft-novo', status: 'pending' });
    render(
      <MemoryRouter>
        <FineTuningPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'meu-bot-v1' } });
    fireEvent.click(screen.getByRole('button', { name: /Iniciar fine-tuning/i }));

    await waitFor(() => expect(mockStart).toHaveBeenCalledTimes(1));
    expect(mockStart).toHaveBeenCalledWith({
      base_model: 'meta-llama/Llama-3.1-8B-Instruct',
      task: 'text-generation',
      epochs: 3,
      learning_rate: expect.closeTo(0.0002, 10),
      repo_name: 'meu-bot-v1',
    });
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Treinamento iniciado: ft-novo'),
    );
  });

  it('recusa iniciar sem nome e nao chama o servico', async () => {
    render(
      <MemoryRouter>
        <FineTuningPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Iniciar fine-tuning/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('propaga para o usuario o erro devolvido pelo servico', async () => {
    mockStart.mockRejectedValue(new Error('Fine-tuning error: unauthorized'));
    render(
      <MemoryRouter>
        <FineTuningPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /Iniciar fine-tuning/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('unauthorized')),
    );
  });

  it('prepara o dataset a partir das traces do agente', async () => {
    mockPrepare.mockResolvedValue({ samples_count: 420 });
    render(
      <MemoryRouter>
        <FineTuningPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Dataset'), { target: { value: 'agent-123' } });
    fireEvent.click(screen.getByRole('button', { name: /Preparar dataset/i }));

    await waitFor(() =>
      expect(mockPrepare).toHaveBeenCalledWith(
        'agent-123',
        expect.objectContaining({ source: 'traces', max_samples: 500 }),
      ),
    );
    expect(await screen.findByText(/420 exemplos prontos/i)).toBeInTheDocument();
  });
});
