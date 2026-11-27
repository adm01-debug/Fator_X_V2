import { supabase } from '@/integrations/supabase/client';

/**
 * Cliente da edge `geo-code` (Mapbox com fallback Google).
 * Contrato: `{ ok, provider, data: GeoPoint }` — ver supabase/functions/geo-code/index.ts.
 */
export interface GeoPoint {
  latitude: number;
  longitude: number;
  formatted_address: string;
  place_name?: string;
  country?: string;
  country_code?: string;
  state?: string;
  city?: string;
  postal_code?: string;
}

export interface GeoLookupResult {
  provider: string;
  data: GeoPoint;
}

interface GeoEnvelope {
  ok?: boolean;
  provider?: string;
  data?: GeoPoint;
  error?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  'no maps provider configured':
    'Nenhum provedor de mapas configurado (MAPBOX_ACCESS_TOKEN ou GOOGLE_MAPS_API_KEY)',
  'geocoding failed': 'O provedor de mapas não encontrou esse local',
  unauthorized: 'Sessão expirada — entre novamente para usar a geocodificação',
};

function describeError(raw: string | undefined): string {
  if (!raw) return 'Não foi possível resolver a localização';
  return ERROR_MESSAGES[raw] ?? raw;
}

async function invokeGeoCode(body: Record<string, unknown>): Promise<GeoLookupResult> {
  const { data, error } = await supabase.functions.invoke('geo-code', { body });
  if (error) {
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === 'function') {
      const payload = (await context.json().catch(() => null)) as GeoEnvelope | null;
      if (payload?.error) throw new Error(describeError(payload.error));
    }
    throw error;
  }
  const envelope = (data ?? {}) as GeoEnvelope;
  if (envelope.error || !envelope.data) throw new Error(describeError(envelope.error));
  return { provider: envelope.provider ?? 'desconhecido', data: envelope.data };
}

export function geocodeAddress(address: string): Promise<GeoLookupResult> {
  return invokeGeoCode({ action: 'geocode', address });
}

export function reverseGeocode(latitude: number, longitude: number): Promise<GeoLookupResult> {
  return invokeGeoCode({ action: 'reverse', latitude, longitude });
}

/** `health` responde só `{ ok: true }` — serve para saber se há provedor configurado. */
export async function isGeoCodeAvailable(): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke('geo-code', { body: { action: 'health' } });
  if (error) return false;
  return (data as { ok?: boolean } | null)?.ok === true;
}

/** Aceita "-23.5, -46.6" e devolve as coordenadas; qualquer outro texto é endereço. */
export function parseCoordinates(input: string): { latitude: number; longitude: number } | null {
  const match = input.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}