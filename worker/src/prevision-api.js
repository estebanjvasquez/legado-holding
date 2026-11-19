/* =============================================================================
   Cliente HTTP de la API pública de Prevision-Funeraria (tenant `lh`).
   Reemplaza a invoiceninja.js como fuente de verdad administrativa del wizard
   de planes. Ver docs/api-publica-wizard.md para el contrato completo.
   ============================================================================= */

import { resolveTenant } from "./tenant.js";

const DEFAULT_TIMEOUT_MS = 10000;
const COMPRA_TIMEOUT_MS  = 20000;
/* Tope de espera para respetar el Retry-After de un 503 `sobrecarga`
   (exportado para que los tests lo acorten). */
export const _solicitudTiming = { maxRetryAfterMs: 3000 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createPF(env) {
  const { id: tenant } = resolveTenant(env);
  const base = (env.PF_BASE || "https://app.previsionfuneraria.com") +
    `/api/public/t/${tenant}`;
  const token = env.PF_TOKEN;

  /* `auth: true` marca los endpoints server-to-server (parentescos, compras,
     solicitudes…). El catálogo (planes/servicios) es público — mismo contrato
     que el navegador, sin token. POST /solicitudes también acepta llamadas sin
     token, pero Previsión las limita a 10/min por IP y todo este Worker sale
     con la misma IP de Cloudflare: con token solo aplica el tope de la empresa
     (300/min). El límite por visitante lo pone este Worker. */
  /* Sin timeout, si Previsión se colgaba el usuario quedaba con el spinner
     indefinidamente. Los errores llevan `status` (HTTP) o `timeout`, para que
     quien llama distinga un rechazo de validación (4xx) de una falla
     transitoria — ver el reintento sin atribución en wizard-compra.js. */
  async function req(method, path, body, { auth = false, timeoutMs = DEFAULT_TIMEOUT_MS, headers: extraHeaders } = {}) {
    const headers = { Accept: "application/json", ...(extraHeaders || {}) };
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
      /* `codigo` distingue, por ejemplo, idempotencia_en_proceso de un 409 de
         cliente inactivo (docs/api-publica-wizard.md de Previsión). */
      err.body = parsed && typeof parsed === "object" ? parsed : null;
      err.codigo = err.body && typeof err.body.codigo === "string" ? err.body.codigo : null;
      const ra = Number(r.headers.get("retry-after"));
      if (Number.isFinite(ra) && ra >= 0) err.retryAfterMs = ra * 1000;
      throw err;
    }
    return parsed;
  }

  return {
    getParentescos: () => req("GET", "/parentescos", undefined, { auth: true }),
    /* /compras crea la Checkout Session de Stripe del lado de Previsión: se le
       da más margen que a una consulta. */
    /* Idempotency-Key (opcional, PF-9): misma clave = misma compra; un
       reintento no crea otra compra pendiente ni otra Checkout Session. */
    crearCompra: (body, { idempotencyKey } = {}) =>
      req("POST", "/compras", body, {
        auth: true,
        timeoutMs: COMPRA_TIMEOUT_MS,
        headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
      }),
    /* Directorio de aliados por ciudad (PF-11) — server-to-server, con token.
       Solo activos; `items: []` es una respuesta normal. */
    getAliados: (ciudad) =>
      req("GET", `/aliados?ciudad=${encodeURIComponent(String(ciudad || "").slice(0, 100))}`, undefined, { auth: true }),
    /* Resuelve un codigo_vendedor (?ref=) a su nombre para mostrarlo (handoff a
       WhatsApp, banner del sitio). Server-to-server: no expone la lista de
       vendedores al navegador. Código inválido/inactivo → { activo: false }. */
    /* Configuración del bot del sitio (Configuración › Asistente del sitio en
       Previsión). Trae la api_key DESCIFRADA: solo server-to-server, nunca
       reenviarla al navegador ni loguearla. Timeout corto: está en el camino
       de cada turno de chat y hay respaldo si no responde. */
    getAsistente: () => req("GET", "/asistente", undefined, { auth: true, timeoutMs: 3000 }),
    getVendedor: (codigo) =>
      req("GET", `/vendedores/lookup?codigo=${encodeURIComponent(codigo)}`, undefined, { auth: true }),
    /* Catálogo público — lo usa el agente Alma para informar sin inventar
       precios/coberturas (docs/GUIA_INTERACCION_BOT_LEGADO.md sección 4.4). */
    getPlanes:    (idioma) => req("GET", `/planes${idioma ? `?idioma=${idioma}` : ""}`),
    getServicios: (idioma) => req("GET", `/servicios${idioma ? `?idioma=${idioma}` : ""}`),
    /* Lead público (prospecto) — nunca es un contrato, ver docs/api-publica-wizard.md. */
    /* 503 `sobrecarga` (base de Previsión saturada) → un reintento tras su
       Retry-After. Un 429 `demasiadas_solicitudes` no se reintenta en caliente.
       Un 401 es PF_TOKEN mal configurado: NO regenerar el token. */
    crearSolicitud: async (body) => {
      try {
        return await req("POST", "/solicitudes", body, { auth: true });
      } catch (e) {
        if (e.status === 401) console.error("[pf] POST /solicitudes 401: revisar PF_TOKEN del Worker (no regenerarlo)");
        if (e.status !== 503) throw e;
        await sleep(Math.min(e.retryAfterMs ?? 2000, _solicitudTiming.maxRetryAfterMs));
        return await req("POST", "/solicitudes", body, { auth: true });
      }
    },
  };
}
