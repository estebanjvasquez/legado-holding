/* =============================================================================
   Endpoints administrativos del Worker.

   Auth: cada admin se autentica con sus credenciales de Invoice Ninja vía
   POST /admin/login (proxy a IN /api/v1/login). Si el usuario tiene
   is_admin=true en IN, devolvemos su token de IN y la UI lo envía en
   X-Admin-Token. Para sobrevivir caídas de IN, env.ADMIN_TOKEN sigue
   funcionando como backdoor de emergencia.

   Rutas:
     POST   /admin/login                → email+password → { token, user }
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

/* Cache in-isolate de validaciones de tokens IN. Evita pegarle a IN en
   cada request del admin. TTL corto porque revocar un usuario en IN debe
   surtir efecto pronto. Es por-isolate (no compartido entre PoPs); en la
   práctica con tráfico bajo un admin ve ~1 cache miss al inicio y luego
   hits durante su sesión. */
const TOKEN_VALIDATION_TTL_MS = 5 * 60 * 1000;
const tokenValidationCache    = new Map(); // token → { valid, until }

function jsonResp(obj, status, corsHeaders) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

/* Valida que un token IN sigue activo pegándole a /users?per_page=1. No
   re-chequea is_admin en cada request — ese flag se verificó al login y
   si el admin pierde su rol en IN, el equipo debe desactivar al usuario
   (lo cual invalida el token). Trade-off: hasta 5 min de staleness. */
async function isInTokenValid(token, env) {
  if (!token || !env.IN_BASE) return false;
  const now = Date.now();
  const cached = tokenValidationCache.get(token);
  if (cached && cached.until > now) return cached.valid;

  let valid = false;
  try {
    const r = await fetch(env.IN_BASE + "/users?per_page=1", {
      headers: { "X-API-TOKEN": token, "Accept": "application/json" },
    });
    valid = r.ok;
  } catch (_) {
    valid = false;
  }
  tokenValidationCache.set(token, { valid, until: now + TOKEN_VALIDATION_TTL_MS });
  return valid;
}

async function requireAdmin(request, env) {
  const got = (request.headers.get("X-Admin-Token") || "").trim();
  if (!got) return false;

  /* Backdoor: token compartido configurado en env.ADMIN_TOKEN. Útil si IN
     se cae o si necesitamos acceso de emergencia. */
  const expected = (env.ADMIN_TOKEN || "").trim();
  if (expected && got === expected) return true;

  /* Camino normal: el token vino de POST /admin/login y es el API token
     personal del admin en IN. */
  return await isInTokenValid(got, env);
}

/* Llama a IN /login con email+password y normaliza la respuesta. IN v5
   devuelve la lista de company_users del cual extraemos el token API
   personal del usuario y el flag is_admin. La forma exacta varía entre
   versiones — manejamos los casos conocidos y logueamos lo que no
   reconozcamos para poder ajustar después. */
async function loginToIN(env, email, password) {
  if (!env.IN_BASE) throw new Error("IN_BASE no configurado");
  const r = await fetch(env.IN_BASE + "/login", {
    method: "POST",
    headers: {
      "Content-Type":     "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "Accept":           "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const text = await r.text();
  let parsed = text;
  try { parsed = text ? JSON.parse(text) : null; } catch (_) { /* keep text */ }

  if (!r.ok) {
    const msg = (parsed && parsed.message) || `IN login -> ${r.status}`;
    const err = new Error(msg);
    err.status = r.status;
    throw err;
  }

  /* Normalizar: parsed.data puede ser objeto o array. El elemento puede
     ser un User (email al tope) o un CompanyUser (email en .user.email).
     Probamos las cuatro combinaciones. */
  let entry = parsed?.data ?? parsed;
  if (Array.isArray(entry)) entry = entry[0];

  if (!entry || typeof entry !== "object") {
    const topKeys = parsed && typeof parsed === "object" ? Object.keys(parsed).join(",") : typeof parsed;
    console.error(`[admin login] respuesta vacia o no-objeto. top:[${topKeys}]`);
    throw new Error("Respuesta de IN inesperada en login");
  }

  /* Detectar shape: User al tope vs CompanyUser con user anidado. */
  const userInfo =
    (entry.email && entry)            ||  // shape A: User
    (entry.user?.email && entry.user) ||  // shape B: CompanyUser → .user
    null;

  if (!userInfo) {
    const entryKeys = Object.keys(entry).join(",");
    const nestedUserKeys = entry.user && typeof entry.user === "object" ? Object.keys(entry.user).join(",") : "no_user";
    console.error(`[admin login] shape desconocida. entry:[${entryKeys}] entry.user:[${nestedUserKeys}]`);
    throw new Error("Respuesta de IN inesperada en login");
  }

  /* Token: probar lugares conocidos. IN v5 usa varias formas:
     - string en .token
     - objeto { token: "..." } en .token, .company_token, .api_token
     - elemento en .tokens[] */
  const extractToken = (v) => {
    if (!v) return null;
    if (typeof v === "string") return v;
    if (typeof v === "object" && typeof v.token === "string") return v.token;
    return null;
  };

  /* Buscar token en el entry (CompanyUser) y dentro del userInfo. */
  const tokenSources = [
    entry.token, entry.company_token, entry.api_token,
    userInfo.token, userInfo.company_token, userInfo.api_token,
  ];
  let token = null;
  for (const t of tokenSources) {
    token = extractToken(t);
    if (token) break;
  }

  /* is_admin puede estar en el entry (CompanyUser) o en userInfo. */
  let isAdmin = !!(entry.is_admin || entry.is_owner || userInfo.is_admin);

  /* Recorrer company_users si existe en cualquiera de los dos niveles. */
  const cuList = (Array.isArray(userInfo.company_users) && userInfo.company_users) ||
                 (Array.isArray(entry.company_users)    && entry.company_users)    ||
                 [];
  for (const cu of cuList) {
    if (cu.is_admin || cu.is_owner) isAdmin = true;
    if (!token) {
      token =
        extractToken(cu.token)         ||
        extractToken(cu.company_token) ||
        extractToken(cu.api_token)     ||
        (Array.isArray(cu.tokens) && cu.tokens[0] ? extractToken(cu.tokens[0]) : null);
    }
  }

  if (!token) {
    const entryKeys = Object.keys(entry).join(",");
    const userKeys  = Object.keys(userInfo).join(",");
    const cuKeys    = cuList[0] ? Object.keys(cuList[0]).join(",") : "no_company_users";
    console.error(`[admin login] sin token. entry:[${entryKeys}] user:[${userKeys}] cu[0]:[${cuKeys}]`);
    throw new Error("No se pudo extraer token API del usuario IN — revisa wrangler tail");
  }

  console.log(`[admin login] OK email=${userInfo.email} isAdmin=${isAdmin}`);
  return { token, user: userInfo, isAdmin };
}

async function handleLogin(request, env, corsHeaders) {
  const json = (obj, status = 200) => jsonResp(obj, status, corsHeaders);
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: "JSON inválido" }, 400); }
  const email    = String(body.email    || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!email || !password) {
    return json({ error: "Email y contraseña son requeridos" }, 400);
  }

  try {
    const { token, user, isAdmin } = await loginToIN(env, email, password);
    if (!isAdmin) {
      return json({ error: "Solo administradores pueden acceder al panel." }, 403);
    }
    /* Pre-poblar cache para que el primer GET no pegue a IN otra vez. */
    tokenValidationCache.set(token, {
      valid: true,
      until: Date.now() + TOKEN_VALIDATION_TTL_MS,
    });
    return json({
      token,
      user: {
        id:         user.id || user.hashed_id || null,
        first_name: user.first_name || "",
        last_name:  user.last_name  || "",
        email:      user.email,
      },
    });
  } catch (e) {
    console.error(`[admin login] ${email} → ${e.message}`);
    /* IN respondió 4xx → creds malas: mensaje genérico. */
    if (e.status === 400 || e.status === 401 || e.status === 422) {
      return json({ error: "Credenciales inválidas" }, 401);
    }
    /* Cualquier otro fallo (parseo de respuesta, token no encontrado,
       IN caído) → propagar el mensaje real para poder debuggear. */
    return json({ error: e.message }, e.status || 500);
  }
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

  /* Login es público — hace su propia verificación contra IN. */
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
