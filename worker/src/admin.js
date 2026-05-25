/* =============================================================================
   Endpoints administrativos del Worker.

   Todos los endpoints viven bajo /admin/* y requieren el header
   X-Admin-Token con el valor de env.ADMIN_TOKEN. La UI estática vive en
   /admin/index.html (servida por Apache vía cPanel) y consume estos endpoints.

   Rutas:
     GET    /admin/locations            → listar ubicaciones
     POST   /admin/locations            → crear ubicación
     PATCH  /admin/locations/:id        → actualizar
     DELETE /admin/locations/:id        → eliminar
     GET    /admin/partners             → listar aliados
     POST   /admin/partners             → crear aliado
     PATCH  /admin/partners/:id         → actualizar
     DELETE /admin/partners/:id         → eliminar
     GET    /admin/config               → listar config del agente
     PUT    /admin/config               → upsert múltiple { key: value, ... }
     DELETE /admin/config/:key          → eliminar key
     GET    /admin/sessions             → listar sesiones recientes (limit, offset)
     GET    /admin/sessions/:id         → sesión + turnos
     GET    /admin/health               → ping para que la UI verifique el token

   El token va en X-Admin-Token (no Authorization Bearer porque ese header
   ya lo usa la API de Cloudflare Access si lo activan en el futuro).
   ============================================================================= */

import { createSupabase } from "./supabase.js";

function unauthorized() {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

function requireAdmin(request, env) {
  const expected = (env.ADMIN_TOKEN || "").trim();
  if (!expected) return false;
  const got = (request.headers.get("X-Admin-Token") || "").trim();
  return got && got === expected;
}

function jsonResponse(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

/* dispatch principal — index.js lo llama para todo /admin/*  */
export async function handleAdmin(request, env, corsHeaders) {
  /* CORS preflight ya fue manejado en index.js. Aquí solo agregamos los
     headers a la respuesta final.                                              */
  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  if (!requireAdmin(request, env)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const url    = new URL(request.url);
  const method = request.method;
  const path   = url.pathname;

  const db = createSupabase(env);

  /* Helpers para extraer el id del path */
  const lastSegment = () => decodeURIComponent(path.split("/").filter(Boolean).pop() || "");

  let body = null;
  if (method === "POST" || method === "PATCH" || method === "PUT") {
    try { body = await request.json(); } catch (_) { body = {}; }
  }

  try {
    /* ── Health ───────────────────────────────────────────────────────── */
    if (path === "/admin/health" && method === "GET") {
      return json({ ok: true });
    }

    /* ── Locations ────────────────────────────────────────────────────── */
    if (path === "/admin/locations") {
      if (method === "GET") {
        const stateFilter = url.searchParams.get("state");
        const data = await db.listAllLocations(stateFilter || undefined);
        return json({ data });
      }
      if (method === "POST") {
        if (!body.state || !body.city) {
          return json({ error: "state y city son requeridos" }, 400);
        }
        const data = await db.createLocation({
          state:      body.state,
          city:       body.city,
          is_capital: !!body.is_capital,
        });
        return json({ data }, 201);
      }
    }
    if (path.startsWith("/admin/locations/")) {
      const id = lastSegment();
      if (method === "PATCH") {
        const patch = {};
        if (body.state      !== undefined) patch.state      = body.state;
        if (body.city       !== undefined) patch.city       = body.city;
        if (body.is_capital !== undefined) patch.is_capital = !!body.is_capital;
        const data = await db.updateLocation(id, patch);
        return json({ data });
      }
      if (method === "DELETE") {
        await db.deleteLocation(id);
        return json({ ok: true });
      }
    }

    /* ── Partners ─────────────────────────────────────────────────────── */
    if (path === "/admin/partners") {
      if (method === "GET") {
        const filter = {};
        if (url.searchParams.get("locationId")) filter.locationId = url.searchParams.get("locationId");
        if (url.searchParams.get("active") === "true") filter.activeOnly = true;
        const data = await db.listAllPartners(filter);
        return json({ data });
      }
      if (method === "POST") {
        if (!body.name || !body.location_id) {
          return json({ error: "name y location_id son requeridos" }, 400);
        }
        const row = {
          location_id:    body.location_id,
          name:           body.name,
          brand:          body.brand || null,
          contact_name:   body.contact_name || null,
          phone:          body.phone || null,
          email:          body.email || null,
          address:        body.address || null,
          services:       Array.isArray(body.services) ? body.services : null,
          state_coverage: !!body.state_coverage,
          is_active:      body.is_active === false ? false : true,
          notes:          body.notes || null,
        };
        const data = await db.createPartner(row);
        return json({ data }, 201);
      }
    }
    if (path.startsWith("/admin/partners/")) {
      const id = lastSegment();
      if (method === "PATCH") {
        const patch = {};
        const allowed = [
          "location_id","name","brand","contact_name","phone","email",
          "address","services","state_coverage","is_active","notes",
        ];
        for (const k of allowed) {
          if (body[k] !== undefined) patch[k] = body[k];
        }
        const data = await db.updatePartner(id, patch);
        return json({ data });
      }
      if (method === "DELETE") {
        await db.deletePartner(id);
        return json({ ok: true });
      }
    }

    /* ── Agent config ─────────────────────────────────────────────────── */
    if (path === "/admin/config") {
      if (method === "GET") {
        const data = await db.listAgentConfig();
        return json({ data });
      }
      if (method === "PUT") {
        /* body es un mapa { key: value, ... } o { entries: [{key, value, description}, ...] }
           para upsert múltiple atómico-ish (uno por uno). */
        const entries = Array.isArray(body.entries)
          ? body.entries
          : Object.entries(body || {}).map(([key, value]) => ({ key, value }));
        const results = [];
        for (const ent of entries) {
          if (!ent.key) continue;
          const r = await db.upsertAgentConfig(
            String(ent.key),
            ent.value === null || ent.value === undefined ? "" : String(ent.value),
            ent.description,
          );
          results.push(r);
        }
        return json({ data: results });
      }
    }
    if (path.startsWith("/admin/config/") && method === "DELETE") {
      const key = lastSegment();
      await db.deleteAgentConfig(key);
      return json({ ok: true });
    }

    /* ── Sessions (read-only) ─────────────────────────────────────────── */
    if (path === "/admin/sessions" && method === "GET") {
      const limit  = Math.min(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 200);
      const offset = parseInt(url.searchParams.get("offset") || "0", 10) || 0;
      const data   = await db.listRecentSessions(limit, offset);
      return json({ data });
    }
    if (path.startsWith("/admin/sessions/") && method === "GET") {
      const id    = lastSegment();
      const [session, turns] = await Promise.all([
        db.getSession(id),
        db.listTurns(id),
      ]);
      return json({ data: { id, session, turns_count: turns.length, turns } });
    }

    return json({ error: "not_found", path, method }, 404);
  } catch (e) {
    console.error(`[admin] ${method} ${path} → ${e.message}`);
    return json({ error: e.message }, 500);
  }
}
