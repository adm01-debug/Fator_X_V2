/**
 * Unit tests para os providers de geocodificação (Mapbox/Google).
 * Rode com: deno test --allow-env --allow-net supabase/functions/geo-code/geo.test.ts
 */

import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { mapboxGeocode, mapboxReverse, googleGeocode, googleReverse } from './geo.ts';
import type { GeoResult } from './geo.ts';

const MAPBOX_OK = {
  features: [
    {
      center: [-46.6333, -23.5505],
      place_name: 'Av. Paulista, São Paulo, SP, Brasil',
      text: 'Av. Paulista',
      id: 'address.123',
      context: [
        { id: 'place.1', text: 'São Paulo' },
        { id: 'region.2', text: 'São Paulo', short_code: 'BR-SP' },
        { id: 'country.3', text: 'Brasil', short_code: 'br' },
        { id: 'postcode.4', text: '01310-100', short_code: '01310-100' },
      ],
    },
  ],
};

const GOOGLE_OK = {
  status: 'OK',
  results: [
    {
      geometry: { location: { lat: -23.5505, lng: -46.6333 } },
      formatted_address: 'Av. Paulista, 1000 - Bela Vista, São Paulo - SP, Brasil',
      place_id: 'ChIJ-test',
      address_components: [
        { long_name: 'Av. Paulista', types: ['route'] },
        { long_name: 'São Paulo', types: ['administrative_area_level_2'] },
        { long_name: 'São Paulo', types: ['administrative_area_level_1'] },
        { long_name: 'Brasil', types: ['country'] },
        { long_name: '01310-100', types: ['postal_code'] },
      ],
    },
  ],
};

function mockFetch(body: unknown, status = 200) {
  const orig = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  return () => {
    globalThis.fetch = orig;
  };
}

async function withMock(
  body: unknown,
  status: number,
  fn: () => Promise<GeoResult>,
): Promise<GeoResult> {
  const restore = mockFetch(body, status);
  try {
    return await fn();
  } finally {
    restore();
  }
}

Deno.test('mapboxGeocode: normaliza endereço completo', async () => {
  const r = await withMock(MAPBOX_OK, 200, () => mapboxGeocode('Av. Paulista, 1000', 'pk.test'));
  assertEquals(r.latitude, -23.5505);
  assertEquals(r.longitude, -46.6333);
  assertEquals(r.formatted_address, 'Av. Paulista, São Paulo, SP, Brasil');
  assertEquals(r.city, 'São Paulo');
  assertEquals(r.state, 'São Paulo');
  assertEquals(r.country, 'Brasil');
  assertEquals(r.postal_code, '01310-100');
  assertEquals((r.raw as { provider: string }).provider, 'mapbox');
});

Deno.test('mapboxReverse: inverte coordenadas', async () => {
  const r = await withMock(MAPBOX_OK, 200, () => mapboxReverse(-23.5505, -46.6333, 'pk.test'));
  assertEquals(r.latitude, -23.5505);
  assertEquals(r.longitude, -46.6333);
  assertEquals(r.city, 'São Paulo');
});

Deno.test('mapboxGeocode: sem resultados lança erro', async () => {
  await assertRejects(
    () => withMock({ features: [] }, 200, () => mapboxGeocode('lugar inexistente', 'pk.test')),
    Error,
    'sem resultados',
  );
});

Deno.test('mapboxGeocode: erro HTTP lança', async () => {
  await assertRejects(
    () => withMock({ message: 'invalid token' }, 401, () => mapboxGeocode('Av. Paulista', 'bad')),
    Error,
    'mapbox geocode http 401',
  );
});

Deno.test('googleGeocode: normaliza resposta do Google', async () => {
  const r = await withMock(GOOGLE_OK, 200, () => googleGeocode('Av. Paulista, 1000', 'AIza.test'));
  assertEquals(r.latitude, -23.5505);
  assertEquals(r.longitude, -46.6333);
  assertEquals(r.city, 'São Paulo');
  assertEquals(r.state, 'São Paulo');
  assertEquals(r.country, 'Brasil');
  assertEquals(r.postal_code, '01310-100');
  assertEquals((r.raw as { place_id: string }).place_id, 'ChIJ-test');
});

Deno.test('googleReverse: normaliza latlng', async () => {
  const r = await withMock(GOOGLE_OK, 200, () => googleReverse(-23.5505, -46.6333, 'AIza.test'));
  assertEquals(r.latitude, -23.5505);
  assertEquals(r.country, 'Brasil');
});

Deno.test('googleGeocode: status ZERO_RESULTS lança', async () => {
  await assertRejects(
    () =>
      withMock({ status: 'ZERO_RESULTS', results: [] }, 200, () =>
        googleGeocode('xyz', 'AIza.test'),
      ),
    Error,
    'ZERO_RESULTS',
  );
});
