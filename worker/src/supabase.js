/* =============================================================================
   Cliente REST mínimo de Supabase (PostgREST).
   El Worker usa service_role para escribir/leer sin RLS — todo es server-side.

   No usa el SDK supabase-js para evitar peso extra y dependencias. PostgREST
   directo va perfecto en Cloudflare Workers (fetch puro).

   API expuesta:
     - createClient(env)             → cliente con métodos chainables
     - client.upsertSession(row)     → INSERT … ON CONFLICT del row de sesión
     - client.getSession(id)         → SELECT * por session_id (o null)
     - client.updateSession(id, p)   → PATCH parcial
     - client.listTurns(id)          → SELECT turnos ORDER BY id
     - client.insertTurn(row)        → INSERT en chat_turns

   Filosofía: todas las operaciones son fire-and-forget desde el caller; los
   errores se propagan pero el caller decide si silenciarlos (resilient logging).
   ============================================================================= */

const TIMEOUT_MS = 8000;

export function createSupabase(env) {
  const url = (env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) {
    /* Devolvemos un stub que loguea pero no rompe — así si Supabase se cae
       o no está configurado, el chat sigue funcionando contra el frontend.   */
    console.warn("[supabase] no configurado — operaciones serán no-op");
    return makeNoopClient();
  }
  const base = `${url}/rest/v1`;
  const baseHeaders = {
    apikey:           key,
    Authorization:    `Bearer ${key}`,
    "Content-Type":   "application/json",
  };

  async function req(method, path, body, extraHeaders) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const opts = {
        method,
        headers: { ...baseHeaders, ...(extraHeaders || {}) },
        signal:  controller.signal,
      };
      if (body !== undefined) opts.body = JSON.stringify(body);
      const r = await fetch(base + path, opts);
      const text = await r.text();
      let parsed = text;
      try { parsed = text ? JSON.parse(text) : null; } catch (_) { /* keep text */ }
      if (!r.ok) {
        const detail =
          typeof parsed === "object" ? JSON.stringify(parsed) : String(parsed);
        throw new Error(`Supabase ${method} ${path} ${r.status}: ${detail}`);
      }
      return parsed;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    /* ── chat_sessions ────────────────────────────────────────────────── */

    /* INSERT … ON CONFLICT (session_id) DO UPDATE. PostgREST: header
       Prefer: resolution=merge-duplicates + on_conflict=session_id.            */
    async upsertSession(row) {
      const path = `/chat_sessions?on_conflict=session_id`;
      const body = [{ ...row, updated_at: new Date().toISOString() }];
      const data = await req("POST", path, body, {
        Prefer: "resolution=merge-duplicates,return=representation",
      });
      return (data && data[0]) || null;
    },

    async getSession(sessionId) {
      const path = `/chat_sessions?session_id=eq.${encodeURIComponent(sessionId)}&select=*&limit=1`;
      const data = await req("GET", path);
      return (data && data[0]) || null;
    },

    async updateSession(sessionId, patch) {
      const path = `/chat_sessions?session_id=eq.${encodeURIComponent(sessionId)}`;
      const body = { ...patch, updated_at: new Date().toISOString() };
      const data = await req("PATCH", path, body, {
        Prefer: "return=representation",
      });
      return (data && data[0]) || null;
    },

    /* ── chat_turns ───────────────────────────────────────────────────── */

    async listTurns(sessionId) {
      const path =
        `/chat_turns?session_id=eq.${encodeURIComponent(sessionId)}` +
        `&select=role,content,tool_name,tool_args,tool_result,hop,error,created_at` +
        `&order=id.asc`;
      const data = await req("GET", path);
      return Array.isArray(data) ? data : [];
    },

    async insertTurn(row) {
      const path = `/chat_turns`;
      const body = [row];
      const data = await req("POST", path, body, {
        Prefer: "return=representation",
      });
      return (data && data[0]) || null;
    },

    /* ── locations_venezuela + funeral_partners ───────────────────────────
       Búsqueda fuzzy por nombre de ciudad: el agente puede pasar la ciudad
       tal como la dice el usuario ("caracas", "Maracaibo", "Pto Ordaz").
       Usamos ilike sobre lower(city) para tolerar mayúsculas y acentos.  */
    async findLocationByCity(city) {
      const q = (city || "").trim();
      if (!q) return null;
      const path =
        `/locations_venezuela?city=ilike.${encodeURIComponent(q)}` +
        `&select=*&limit=1`;
      const data = await req("GET", path);
      if (Array.isArray(data) && data[0]) return data[0];
      /* Segundo intento: substring match — más flexible. */
      const path2 =
        `/locations_venezuela?city=ilike.${encodeURIComponent("%" + q + "%")}` +
        `&select=*&limit=1`;
      const data2 = await req("GET", path2);
      return (Array.isArray(data2) && data2[0]) || null;
    },

    async listPartnersByLocation(locationId, activeOnly = true) {
      let path =
        `/funeral_partners?location_id=eq.${encodeURIComponent(locationId)}` +
        `&select=id,name,brand,services,phone,email,notes`;
      if (activeOnly) path += `&is_active=eq.true`;
      const data = await req("GET", path);
      return Array.isArray(data) ? data : [];
    },
  };
}

/* Cliente stub para cuando Supabase no está configurado: todo es no-op para
   no romper el chat. Los logs se pierden pero la conversación funciona.       */
function makeNoopClient() {
  return {
    upsertSession:         async () => null,
    getSession:            async () => null,
    updateSession:         async () => null,
    listTurns:             async () => [],
    insertTurn:            async () => null,
    findLocationByCity:    async () => null,
    listPartnersByLocation: async () => [],
  };
}
