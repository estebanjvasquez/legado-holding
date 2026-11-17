/* =============================================================================
   Cliente HTTP de la API pública de Prevision-Funeraria (tenant `lh`).
   Reemplaza a invoiceninja.js como fuente de verdad administrativa del wizard
   de planes. Ver docs/api-publica-wizard.md para el contrato completo.
   ============================================================================= */

import { resolveTenant } from "./tenant.js";

const DEFAULT_TIMEOUT_MS = 10000;
const COMPRA_TIMEOUT_MS  = 20000;

export function createPF(env) {
  const { id: tenant } = resolveTenant(env);
  const base = (env.PF_BASE || "https://prevision-funeraria.sisteg.workers.dev") +
    `/api/public/t/${tenant}`;
  const token = env.PF_TOKEN;

  /* `auth: true` marca los endpoints server-to-server (parentescos, compras).
     El catálogo (planes/servicios) y los leads (solicitudes) son públicos —
     mismo contrato que el navegador, sin token — así que no deben exigirlo. */
  /* Sin timeout, si Previsión se colgaba el usuario quedaba con el spinner
     indefinidamente. Los errores llevan `status` (HTTP) o `timeout`, para que
     quien llama distinga un rechazo de validación (4xx) de una falla
     transitoria — ver el reintento sin atribución en wizard-compra.js. */
  async function req(method, path, body, { auth = false, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    const headers = { Accept: "application/json" };
    if (auth) {
      if (!token) throw new Error("PF_TOKEN no configurado en el Worker");
      headers.Authorization = `Bearer ${token}`;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const opts = { method, headers, signal: controller.signal };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    let r, text;
    try {
      r = await fetch(base + path, opts);
      text = await r.text();
    } catch (e) {
      const err = new Error(
        controller.signal.aborted
          ? `PF ${method} ${path} -> timeout tras ${timeoutMs} ms`
          : `PF ${method} ${path} -> error de red: ${e.message}`,
      );
      err.timeout = controller.signal.aborted;
      throw err;
    } finally {
      clearTimeout(timer);
    }
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
      const err = new Error(`PF ${method} ${path} -> ${r.status}: ${detail}`);
      err.status = r.status;
      throw err;
    }
    return parsed;
  }

  return {
    getParentescos: () => req("GET", "/parentescos", undefined, { auth: true }),
    /* /compras crea la Checkout Session de Stripe del lado de Previsión: se le
       da más margen que a una consulta. */
    crearCompra:     (body) => req("POST", "/compras", body, { auth: true, timeoutMs: COMPRA_TIMEOUT_MS }),
    /* Resuelve un codigo_vendedor (?ref=) a su nombre para mostrarlo (handoff a
       WhatsApp, banner del sitio). Server-to-server: no expone la lista de
       vendedores al navegador. Código inválido/inactivo → { activo: false }. */
    getVendedor: (codigo) =>
      req("GET", `/vendedores/lookup?codigo=${encodeURIComponent(codigo)}`, undefined, { auth: true }),
    /* Catálogo público — lo usa el agente Alma para informar sin inventar
       precios/coberturas (docs/GUIA_INTERACCION_BOT_LEGADO.md sección 4.4). */
    getPlanes:    (idioma) => req("GET", `/planes${idioma ? `?idioma=${idioma}` : ""}`),
    getServicios: (idioma) => req("GET", `/servicios${idioma ? `?idioma=${idioma}` : ""}`),
    /* Lead público (prospecto) — nunca es un contrato, ver docs/api-publica-wizard.md. */
    crearSolicitud: (body) => req("POST", "/solicitudes", body),
  };
}
