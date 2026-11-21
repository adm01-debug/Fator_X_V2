/**
 * ═══════════════════════════════════════════════════════════════
 * Nexus Agents Studio — Geo Code
 * ═══════════════════════════════════════════════════════════════
 * Geocodificação de endereços (forward) e coordenadas (reverse).
 *
 *   POST /geo-code  { action: "geocode", address: "Rua X, 100 – SP" }
 *                   { action: "reverse", latitude: -23.5, longitude: -46.6 }
 *                   { action: "health" }
 *
 * Providers: Mapbox (primário, MAPBOX_ACCESS_TOKEN) com fallback para
 * Google Maps (GOOGLE_MAPS_API_KEY). Resposta normalizada:
 *   { ok, provider, data?: { latitude, longitude, formatted_address,
 *     place_name?, country?, state?, city?, postal_code? } }
 * verify_jwt=true (default). Origens: usuário autenticado ou X-API-Key ativa.
 * ═══════════════════════════════════════════════════════════════
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import {
  getCorsHeaders,
  handleCorsPreflight,
  validateApiKey,
  getAuthUserId,
} from '../_shared/mod.ts';
import { mapboxGeocode, mapboxReverse, googleGeocode, googleReverse } from './geo.ts';
import type { GeoResult } from './geo.ts';

const SCHEMA = z
  .object({
    action: z.enum(['geocode', 'reverse', 'health']),
    address: z.string().min(3).max(300).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    workspace_id: z.string().uuid().optional(),
  })
  .strict();
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return handleCorsPreflight(req);

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405,
      headers: corsHeaders,
    });
  }

  // Auth em cascata: X-API-Key → JWT de usuário → membro do workspace.
  const claims = await validateApiKey(req);
  let userId: string | null = null;
  if (!claims.valid) userId = await getAuthUserId(req);
  if (!claims.valid && !userId) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: corsHeaders,
    });
  }
  try {
    const body = await req.json().catch(() => null);
    const parsed = SCHEMA.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: 'validation error', details: parsed.error.flatten() }),
        { status: 422, headers: corsHeaders },
      );
    }
    const { action } = parsed.data;

    if (action === 'health') {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders });
    }

    const mapboxToken = Deno.env.get('MAPBOX_ACCESS_TOKEN') ?? '';
    const googleKey = Deno.env.get('GOOGLE_MAPS_API_KEY') ?? '';
    if (!mapboxToken && !googleKey) {
      return new Response(JSON.stringify({ error: 'no maps provider configured' }), {
        status: 500,
        headers: corsHeaders,
      });
    }
    const forward = action === 'geocode';
    const addr = parsed.data.address;
    const lat = parsed.data.latitude;
    const lng = parsed.data.longitude;
    if (forward && (!addr || addr.length < 3)) {
      return new Response(JSON.stringify({ error: 'address required' }), {
        status: 422,
        headers: corsHeaders,
      });
    }
    if (!forward && (lat === undefined || lng === undefined)) {
      return new Response(JSON.stringify({ error: 'latitude/longitude required' }), {
        status: 422,
        headers: corsHeaders,
      });
    }

    let result: GeoResult | null = null;
    let provider = '';

    if (mapboxToken) {
      try {
        result = forward
          ? await mapboxGeocode(addr!, mapboxToken)
          : await mapboxReverse(lat!, lng!, mapboxToken);
        provider = 'mapbox';
      } catch (e) {
        console.warn('mapbox falhou, tentando google', e instanceof Error ? e.message : e);
      }
    }
    if (!result && googleKey) {
      try {
        result = forward
          ? await googleGeocode(addr!, googleKey)
          : await googleReverse(lat!, lng!, googleKey);
        provider = 'google';
      } catch (e) {
        console.warn('google falhou', e instanceof Error ? e.message : e);
        return new Response(JSON.stringify({ error: 'geocoding failed' }), {
          status: 502,
          headers: corsHeaders,
        });
      }
    }
    if (!result) {
      return new Response(JSON.stringify({ error: 'geocoding failed' }), {
        status: 502,
        headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({ ok: true, provider, data: result }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err) {
    console.error('geo-code erro', err);
    return new Response(JSON.stringify({ error: 'internal error' }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
