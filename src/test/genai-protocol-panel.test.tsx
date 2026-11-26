import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { GenAIProtocolPanel } from '@/components/monitoring/GenAIProtocolPanel';

describe('GenAIProtocolPanel', () => {
  const fetchMock = vi.fn();
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    writeText.mockClear();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('monta os atributos semanticos gen_ai a partir dos campos da tela', () => {
    render(<GenAIProtocolPanel />);

    expect(screen.getByText('gen_ai.system')).toBeInTheDocument();
    expect(screen.getByText('gen_ai.request.model')).toBeInTheDocument();
    expect(screen.getByText('gen_ai.usage.input_tokens')).toBeInTheDocument();
    expect(screen.getByText('gen_ai.usage.total_tokens')).toBeInTheDocument();
    expect(screen.getByText('2000')).toBeInTheDocument();
    expect(screen.getByText('gen_ai.request.temperature')).toBeInTheDocument();
  });

  it('estima o custo pelo valor devolvido pela edge cost-calculator', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ cost_usd: 0.012345 }) });
    render(<GenAIProtocolPanel />);

    fireEvent.click(screen.getByRole('button', { name: /Estimar custo/i }));

    expect(await screen.findByText(/0\.012345/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/functions/v1/cost-calculator');
    expect(JSON.parse(String(init.body)).model).toBe('claude-sonnet-4-20250514');
  });

  it('cai na tabela local quando a edge cost-calculator esta indisponivel', async () => {
    fetchMock.mockRejectedValue(new Error('edge indisponivel'));
    render(<GenAIProtocolPanel />);

    fireEvent.click(screen.getByRole('button', { name: /Estimar custo/i }));

    expect(await screen.findByText(/0\.015600/)).toBeInTheDocument();
  });

  it('gera a previa do stream AG-UI com os frames reais do emissor', async () => {
    render(<GenAIProtocolPanel />);

    expect(screen.getByText('X-Protocol')).toBeInTheDocument();
    expect(screen.getByText('ag-ui/1.0')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Gerar pr[ée]via do stream/i }));

    await waitFor(() => {
      const frames = document.querySelector('pre')?.textContent ?? '';
      expect(frames).toContain('data: ');
      expect(frames).toContain('RUN_STARTED');
      expect(frames).toContain('TEXT_MESSAGE_CONTENT');
      expect(frames).toContain('"name":"buscar_dados"');
      expect(frames).toContain('STATE_DELTA');
      expect(frames).toContain('RUN_FINISHED');
      expect(frames).toContain('data: [DONE]');
    });
  });

  it('copia os atributos em JSON para o coletor', async () => {
    render(<GenAIProtocolPanel />);

    fireEvent.click(screen.getByRole('button', { name: /Copiar atributos/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const payload = String(writeText.mock.calls[0][0]);
    expect(payload).toContain('"gen_ai.system": "anthropic"');
    expect(payload).toContain('"gen_ai.usage.total_tokens": 2000');
  });
});
