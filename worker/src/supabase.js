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

    /* Últimos `limit` turnos conversacionales (user/model con texto), en orden
       cronológico. Es lo que usa el chat como memoria; listTurns (sesión
       completa, con tools) queda para el visor del panel. */
    async listRecentChatTurns(sessionId, limit = 40) {
      const n = Math.max(1, Math.min(200, Number(limit) || 40));
      const path =
        `/chat_turns?session_id=eq.${encodeURIComponent(sessionId)}` +
        `&role=in.(user,model)&content=not.is.null` +
        `&select=role,content,created_at&order=id.desc&limit=${n}`;
      const data = await req("GET", path);
      return Array.isArray(data) ? data.reverse() : [];
    },

    async insertTurn(row) {
      const path = `/chat_turns`;
      const body = [row];
      const data = await req("POST", path, body, {
        Prefer: "return=representation",
      });
      return (data && data[0]) || null;
    },

    /* locations_venezuela + funeral_partners se retiraron (2026-11-17): el
       directorio de aliados vive en Prevision-Funeraria (GET /aliados). Las
       tablas quedan en Supabase como histórico. */

    /* ── Admin: agent_config (key-value) ──────────────────────────────── */
    async listAgentConfig() {
      const data = await req(
        "GET",
        "/agent_config?select=key,value,description,updated_at&order=key.asc",
      );
      return Array.isArray(data) ? data : [];
    },
    async getAgentConfigMap() {
      const rows = await this.listAgentConfig();
      const map = {};
      for (const r of rows) map[r.key] = r.value;
      return map;
    },
    async upsertAgentConfig(key, value, description) {
      const row = { key, value, ...(description !== undefined ? { description } : {}) };
      const data = await req(
        "POST",
        "/agent_config?on_conflict=key",
        [row],
        { Prefer: "resolution=merge-duplicates,return=representation" },
      );
      return (data && data[0]) || null;
    },
    async deleteAgentConfig(key) {
      return req("DELETE", `/agent_config?key=eq.${encodeURIComponent(key)}`);
    },

    /* ── Admin: visor de sesiones ─────────────────────────────────────── */
    async listRecentSessions(limit = 50, offset = 0) {
      const path =
        `/chat_sessions?select=*&order=updated_at.desc` +
        `&limit=${limit}&offset=${offset}`;
      const data = await req("GET", path);
      return Array.isArray(data) ? data : [];
    },
  };
}

/* Cliente stub para cuando Supabase no está configurado: todo es no-op para
   no romper el chat. Los logs se pierden pero la conversación funciona.       */
function makeNoopClient() {
  return {
    upsertSession:          async () => null,
    getSession:             async () => null,
    updateSession:          async () => null,
    listTurns:              async () => [],
    listRecentChatTurns:    async () => [],
    insertTurn:             async () => null,
    listAgentConfig:        async () => [],
    getAgentConfigMap:      async () => ({}),
    upsertAgentConfig:      async () => null,
    deleteAgentConfig:      async () => null,
    listRecentSessions:     async () => [],
  };
}
