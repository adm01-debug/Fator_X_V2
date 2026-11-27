/**
 * geoCodeService — contrato da edge `geo-code` (ações geocode/reverse/health).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const invokeMock = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}));

import {
  geocodeAddress,
  reverseGeocode,
  isGeoCodeAvailable,
  parseCoordinates,
} from '@/services/geoCodeService';

beforeEach(() => {
  invokeMock.mockReset();
});

const MAPBOX_PAYLOAD = {
  ok: true,
  provider: 'mapbox',
  data: {
    latitude: -23.5614,
    longitude: -46.6559,
    formatted_address: 'Av. Paulista, São Paulo, SP, Brasil',
    country: 'Brasil',
    country_code: 'BR',
    city: 'São Paulo',
  },
};

describe('geoCodeService', () => {
  it('geocodeAddress envia action=geocode com o endereço', async () => {
    invokeMock.mockResolvedValueOnce({ data: MAPBOX_PAYLOAD, error: null });
    const r = await geocodeAddress('Av. Paulista 1000, São Paulo');
    expect(invokeMock).toHaveBeenCalledWith('geo-code', {
      body: { action: 'geocode', address: 'Av. Paulista 1000, São Paulo' },
    });
    expect(r.provider).toBe('mapbox');
    expect(r.data.country_code).toBe('BR');
  });

  it('reverseGeocode envia action=reverse com latitude/longitude numéricos', async () => {
    invokeMock.mockResolvedValueOnce({ data: MAPBOX_PAYLOAD, error: null });
    const r = await reverseGeocode(-23.5614, -46.6559);
    expect(invokeMock).toHaveBeenCalledWith('geo-code', {
      body: { action: 'reverse', latitude: -23.5614, longitude: -46.6559 },
    });
    expect(r.data.country).toBe('Brasil');
  });

  it('sem envelope data rejeita com mensagem legível', async () => {
    invokeMock.mockResolvedValueOnce({
      data: { ok: false, error: 'no maps provider configured' },
      error: null,
    });
    await expect(geocodeAddress('qualquer lugar')).rejects.toThrow(
      'Nenhum provedor de mapas configurado',
    );
  });

  it('erro HTTP traz a mensagem do corpo quando disponível', async () => {
    const context = new Response(JSON.stringify({ error: 'geocoding failed' }), { status: 502 });
    invokeMock.mockResolvedValueOnce({ data: null, error: Object.assign(new Error('boom'), { context }) });
    await expect(reverseGeocode(0, 0)).rejects.toThrow('O provedor de mapas não encontrou esse local');
  });

  it('isGeoCodeAvailable lê ok do health', async () => {
    invokeMock.mockResolvedValueOnce({ data: { ok: true }, error: null });
    expect(await isGeoCodeAvailable()).toBe(true);

    invokeMock.mockResolvedValueOnce({ data: null, error: new Error('down') });
    expect(await isGeoCodeAvailable()).toBe(false);
  });
});

describe('parseCoordinates', () => {
  it('reconhece latitude, longitude com ou sem sinal', () => {
    expect(parseCoordinates('-23.5614, -46.6559')).toEqual({
      latitude: -23.5614,
      longitude: -46.6559,
    });
    expect(parseCoordinates('10,20')).toEqual({ latitude: 10, longitude: 20 });
  });

  it('trata qualquer outro texto como endereço', () => {
    expect(parseCoordinates('Av. Paulista 1000')).toBeNull();
    expect(parseCoordinates('São Paulo, SP')).toBeNull();
  });

  it('recusa coordenadas fora do intervalo válido', () => {
    expect(parseCoordinates('91, 0')).toBeNull();
    expect(parseCoordinates('0, -181')).toBeNull();
  });
});