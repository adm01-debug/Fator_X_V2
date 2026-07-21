import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OpenclawWhatsappSetup } from '@/components/openclaw/OpenclawWhatsappSetup';

vi.mock('@/services/openclawDeployService', () => ({
  pairWhatsapp: vi.fn(),
  getWhatsappStatus: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { pairWhatsapp, getWhatsappStatus } from '@/services/openclawDeployService';

describe('OpenclawWhatsappSetup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderiza o formulário inicial com badge de estado idle', () => {
    render(<OpenclawWhatsappSetup />);
    expect(screen.getByLabelText(/Nome da instância WhatsApp/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Conectar WhatsApp/i })).toBeInTheDocument();
    expect(screen.getByText(/Sem instância/i)).toBeInTheDocument();
  });

  it('exibe o QR Code retornado pelo serviço após pareamento', async () => {
    (pairWhatsapp as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { instance_name: 'promo-brindes', qr_code: 'FAKE_BASE64', status: 'pending' },
      error: null,
      configError: null,
    });
    (getWhatsappStatus as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { instance_name: 'promo-brindes', status: 'pending' },
      error: null,
      configError: null,
    });

    render(<OpenclawWhatsappSetup />);
    fireEvent.click(screen.getByRole('button', { name: /Conectar WhatsApp/i }));

    await waitFor(() => {
      expect(screen.getByAltText(/QR Code WhatsApp/i)).toBeInTheDocument();
    });
    expect(pairWhatsapp).toHaveBeenCalledWith('promo-brindes');
  });

  it('exibe erro quando o pareamento falha', async () => {
    (pairWhatsapp as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('offline'));

    render(<OpenclawWhatsappSetup />);
    fireEvent.click(screen.getByRole('button', { name: /Conectar WhatsApp/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/offline/i);
    });
  });
});
