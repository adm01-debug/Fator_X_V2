/**
 * Geo Code providers: Mapbox / Google — lógica pura testável.
 */

import { fetchWithTimeout } from '../_shared/retry.ts';

const MAPBOX_URL = 'https://api.mapbox.com/geocoding/v5';
const GOOGLE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

export type GeoResult = {
  latitude: number;
  longitude: number;
  formatted_address: string;
  place_name?: string;
  country?: string;
  state?: string;
  city?: string;
  postal_code?: string;
  raw?: unknown;
};

type CtxItem = { id: string; text?: string; short_code?: string };
function mapboxCtx(f: {
  context?: CtxItem[];
}): Pick<GeoResult, 'country' | 'state' | 'city' | 'postal_code'> {
  const ctx = (f.context ?? []) as CtxItem[];
  const pick = (prefix: string) => ctx.find((c) => c.id.startsWith(prefix))?.text;
  const cc = (prefix: string) => ctx.find((c) => c.id.startsWith(prefix))?.short_code;
  const p = pick('postcode');
  return {
    country: pick('country'),
    state: pick('region'),
    city: pick('place'),
    postal_code: cc('postcode') ?? p,
  };
}

export async function mapboxGeocode(address: string, token: string): Promise<GeoResult> {
  const url = new URL(`${MAPBOX_URL}/mapbox.places/${encodeURIComponent(address)}.json`);
  url.searchParams.set('access_token', token);
  url.searchParams.set('limit', '1');
  url.searchParams.set('language', 'pt');
  const res = await fetchWithTimeout(url.toString(), {
    headers: { Accept: 'application/json' },
    timeoutMs: 10_000,
  });
  if (!res.ok) throw new Error(`mapbox geocode http ${res.status}`);
  const body = await res.json();
  const f = (
    body as {
      features?: Array<{
        center?: number[];
        place_name?: string;
        text?: string;
        id?: string;
        context?: CtxItem[];
      }>;
    }
  ).features?.[0];
  if (!f?.center) throw new Error('mapbox geocode: sem resultados');
  return {
    latitude: f.center[1],
    longitude: f.center[0],
    formatted_address: f.place_name ?? address,
    place_name: f.text,
    ...mapboxCtx(f),
    raw: { provider: 'mapbox', id: f.id },
  };
}
export async function mapboxReverse(lat: number, lng: number, token: string): Promise<GeoResult> {
  const url = new URL(`${MAPBOX_URL}/mapbox.places/${lng},${lat}.json`);
  url.searchParams.set('access_token', token);
  url.searchParams.set('limit', '1');
  url.searchParams.set('language', 'pt');
  const res = await fetchWithTimeout(url.toString(), {
    headers: { Accept: 'application/json' },
    timeoutMs: 10_000,
  });
  if (!res.ok) throw new Error(`mapbox reverse http ${res.status}`);
  const body = await res.json();
  const f = (
    body as {
      features?: Array<{
        center?: number[];
        place_name?: string;
        text?: string;
        id?: string;
        context?: CtxItem[];
      }>;
    }
  ).features?.[0];
  if (!f?.center) throw new Error('mapbox reverse: sem resultados');
  return {
    latitude: f.center[1],
    longitude: f.center[0],
    formatted_address: f.place_name ?? `${lng},${lat}`,
    place_name: f.text,
    ...mapboxCtx(f),
    raw: { provider: 'mapbox', id: f.id },
  };
}

type GComp = { types: string[]; long_name: string };
function googleComp(comps: GComp[] | undefined, t: string): string | undefined {
  return comps?.find((c) => c.types.includes(t))?.long_name;
}
export async function googleGeocode(address: string, key: string): Promise<GeoResult> {
  const url = new URL(GOOGLE_URL);
  url.searchParams.set('address', address);
  url.searchParams.set('key', key);
  url.searchParams.set('language', 'pt-BR');
  url.searchParams.set('region', 'br');
  const res = await fetchWithTimeout(url.toString(), { timeoutMs: 10_000 });
  if (!res.ok) throw new Error(`google geocode http ${res.status}`);
  const body = await res.json();
  const status = (body as { status?: string }).status;
  const r = (
    body as {
      results?: Array<{
        geometry: { location: { lat: number; lng: number } };
        formatted_address?: string;
        address_components?: GComp[];
        place_id?: string;
      }>;
    }
  ).results?.[0];
  if (status !== 'OK' || !r) throw new Error(`google geocode: ${status}`);
  return {
    latitude: r.geometry.location.lat,
    longitude: r.geometry.location.lng,
    formatted_address: r.formatted_address ?? address,
    place_name:
      googleComp(r.address_components, 'sublocality') ??
      googleComp(r.address_components, 'neighborhood'),
    country: googleComp(r.address_components, 'country'),
    state: googleComp(r.address_components, 'administrative_area_level_1'),
    city:
      googleComp(r.address_components, 'administrative_area_level_2') ??
      googleComp(r.address_components, 'locality'),
    postal_code: googleComp(r.address_components, 'postal_code'),
    raw: { provider: 'google', place_id: r.place_id },
  };
}

export async function googleReverse(lat: number, lng: number, key: string): Promise<GeoResult> {
  const url = new URL(GOOGLE_URL);
  url.searchParams.set('latlng', `${lat},${lng}`);
  url.searchParams.set('key', key);
  url.searchParams.set('language', 'pt-BR');
  url.searchParams.set('region', 'br');
  const res = await fetchWithTimeout(url.toString(), { timeoutMs: 10_000 });
  if (!res.ok) throw new Error(`google reverse http ${res.status}`);
  const body = await res.json();
  const status = (body as { status?: string }).status;
  const r = (
    body as {
      results?: Array<{
        geometry: { location: { lat: number; lng: number } };
        formatted_address?: string;
        address_components?: GComp[];
        place_id?: string;
      }>;
    }
  ).results?.[0];
  if (status !== 'OK' || !r) throw new Error(`google reverse: ${status}`);
  return {
    latitude: r.geometry.location.lat,
    longitude: r.geometry.location.lng,
    formatted_address: r.formatted_address ?? `${lng},${lat}`,
    place_name:
      googleComp(r.address_components, 'sublocality') ??
      googleComp(r.address_components, 'neighborhood'),
    country: googleComp(r.address_components, 'country'),
    state: googleComp(r.address_components, 'administrative_area_level_1'),
    city:
      googleComp(r.address_components, 'administrative_area_level_2') ??
      googleComp(r.address_components, 'locality'),
    postal_code: googleComp(r.address_components, 'postal_code'),
    raw: { provider: 'google', place_id: r.place_id },
  };
}
