/**
 * Cloudflare Worker — Planificador de Turnos FIB 2026
 *
 * API:
 *   GET  /  → devuelve el estado JSON almacenado (o {} si vacío)
 *   POST /  → guarda el estado JSON, responde { ok: true }
 *
 * KV binding requerido: PLANIFICADOR_KV
 * (Settings → Variables → KV Namespace Bindings → nombre: PLANIFICADOR_KV)
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    // Preflight CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // GET — leer estado
    if (request.method === 'GET') {
      const data = await env.PLANIFICADOR_KV.get('state');
      return new Response(data || '{}', {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // POST — guardar estado
    if (request.method === 'POST') {
      let body;
      try {
        body = await request.text();
        JSON.parse(body); // valida que sea JSON válido antes de guardar
      } catch {
        return new Response(JSON.stringify({ ok: false, error: 'JSON inválido' }), {
          status: 400,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
      await env.PLANIFICADOR_KV.put('state', body);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    return new Response('Method Not Allowed', { status: 405, headers: CORS });
  },
};
