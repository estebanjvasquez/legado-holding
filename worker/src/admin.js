/* =============================================================================
   Endpoints administrativos del Worker.

   Auth: Invoice Ninja ya no existe (2026-11). El único acceso es el secret
   ADMIN_TOKEN: la UI lo pide, POST /admin/login lo valida (limitado por IP) y
   después viaja en X-Admin-Token. Comparación en tiempo constante. Este panel
   es legacy: se retira cuando sus módulos pasen a Prevision-Funeraria.

   Rutas:
     POST   /admin/login                → { token } → { token, user }
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
import { clientIp, isRateLimited } from "./ratelimit.js";

function jsonResp(obj, status, corsHeaders) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

/* Comparación en tiempo constante (sobre el hash SHA-256 de ambos lados, así
   tampoco se filtra la longitud del token). */
async function sha256(s) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}
export async function tokensMatch(got, expected) {
  if (!got || !expected) return false;
  const [a, b] = await Promise.all([sha256(got), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/* Único acceso al panel: el secret ADMIN_TOKEN (Invoice Ninja ya no existe).
   Sin el secret configurado, nadie entra. */
export async function requireAdmin(request, env) {
  const got = (request.headers.get("X-Admin-Token") || "").trim();
  const expected = (env.ADMIN_TOKEN || "").trim();
  return await tokensMatch(got, expected);
}

/* POST /admin/login { token } → valida el token y lo devuelve para que la UI
   lo guarde en sessionStorage. Limitado por IP (ADMIN_LOGIN_LIMITER). */
async function handleLogin(request, env, corsHeaders) {
  const json = (obj, status = 200) => jsonResp(obj, status, corsHeaders);
  if (await isRateLimited(env.ADMIN_LOGIN_LIMITER, clientIp(request))) {
    return json({ error: "Demasiados intentos. Espera un minuto." }, 429);
  }
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: "JSON inválido" }, 400); }
  const token = String(body.token || "").trim();
  if (!token) return json({ error: "El token de acceso es requerido" }, 400);
  if (!(await tokensMatch(token, (env.ADMIN_TOKEN || "").trim()))) {
    console.warn(`[admin login] token inválido desde ${clientIp(request)}`);
    return json({ error: "Token de acceso inválido" }, 401);
  }
  return json({ token, user: { first_name: "Administrador", last_name: "", email: null } });
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

  const url    = new URL(request.url);
  const method = request.method;
  const path   = url.pathname;

  /* Login es público — valida el token contra ADMIN_TOKEN. */
  if (path === "/admin/login" && method === "POST") {
    return await handleLogin(request, env, corsHeaders);
  }

  if (!(await requireAdmin(request, env))) {
    return json({ error: "unauthorized" }, 401);
  }

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

    /* Ubicaciones y Aliados se retiraron (2026-11-17): el directorio vive en
       Prevision-Funeraria y Alma lo lee de GET /aliados (worker/src/alma.js). */

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
