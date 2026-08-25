/* =============================================================================
   Cliente HTTP de la API pública de Prevision-Funeraria (tenant `lh`).
   Reemplaza a invoiceninja.js como fuente de verdad administrativa del wizard
   de planes. Ver docs/api-publica-wizard.md para el contrato completo.
   ============================================================================= */

export function createPF(env) {
  const base = (env.PF_BASE || "https://prevision-funeraria.sisteg.workers.dev") +
    "/api/public/t/lh";
  const token = env.PF_TOKEN;

  /* `auth: true` marca los endpoints server-to-server (parentescos, compras).
     El catálogo (planes/servicios) y los leads (solicitudes) son públicos —
     mismo contrato que el navegador, sin token — así que no deben exigirlo. */
  async function req(method, path, body, { auth = false } = {}) {
    const headers = { Accept: "application/json" };
    if (auth) {
      if (!token) throw new Error("PF_TOKEN no configurado en el Worker");
      headers.Authorization = `Bearer ${token}`;
    }
    const opts = { method, headers };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    const r = await fetch(base + path, opts);
    const text = await r.text();
    let parsed = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch (_) {
      /* deja parsed como texto crudo */
    }
    /* POST /compras no lanza en 200 aunque la compra quede pendiente/rechazada
       — eso es un resultado válido de negocio, no un error HTTP. Solo
       lanzamos en códigos de error real (400/401/404/5xx). */
    if (!r.ok) {
      const detail =
        typeof parsed === "object" ? JSON.stringify(parsed) : String(parsed);
      throw new Error(`PF ${method} ${path} -> ${r.status}: ${detail}`);
    }
    return parsed;
  }

  return {
    getParentescos: () => req("GET", "/parentescos", undefined, { auth: true }),
    crearCompra:     (body) => req("POST", "/compras", body, { auth: true }),
    /* Catálogo público — lo usa el agente Alma para informar sin inventar
       precios/coberturas (docs/GUIA_INTERACCION_BOT_LEGADO.md sección 4.4). */
    getPlanes:    (idioma) => req("GET", `/planes${idioma ? `?idioma=${idioma}` : ""}`),
    getServicios: (idioma) => req("GET", `/servicios${idioma ? `?idioma=${idioma}` : ""}`),
    /* Lead público (prospecto) — nunca es un contrato, ver docs/api-publica-wizard.md. */
    crearSolicitud: (body) => req("POST", "/solicitudes", body),
  };
}
