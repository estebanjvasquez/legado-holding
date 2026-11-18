/* =============================================================================
   LEGADO — Checkout Worker
   Reemplazo de n8n LEGADO_PostPayment_v7. El catálogo de planes (`/planes`) lo
   sirve directo Prevision-Funeraria al navegador (CORS abierto); este Worker
   solo hace de servidor-a-servidor para lo que exige token (`/parentescos`,
   `/compras`) y para el chat de Alma.
     GET  /                    → health check (verifica secrets y vars cargados)
     GET  /wizard/parentescos  → catálogo de parentescos (proxy autenticado a PF)
     POST /                    → ejecuta el pipeline de checkout del wizard
     POST /chat                → proxy al agente Alma (handoff, sin facturación)
     OPTIONS                   → CORS preflight
   ============================================================================= */

import { instrument } from "@microlabs/otel-cf-workers";

import { createPF } from "./prevision-api.js";
import { processWizardCheckout } from "./wizard-compra.js";
import { handleChat, fallbackChatResponse } from "./chat.js";
import { sanitizeAttribution } from "./attribution.js";
import { clientIp, isRateLimited } from "./ratelimit.js";
import { isValidationError } from "./errors.js";
import { resolveTenant } from "./tenant.js";
import { resolveOtelConfig, otelEnabled } from "./otel.js";

const handler = {
  async fetch(request, env, executionCtx) {
    const url  = new URL(request.url);
    const cors = corsFor(request, env);
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), {
        status,
        headers: { "Content-Type": "application/json", ...cors },
      });

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    if (request.method === "GET") {
      if (url.pathname === "/wizard/parentescos" || url.pathname === "/wizard/vendedor") {
        /* Ambas consultan a Previsión con el token: sin límite, cualquiera
           podía usarlas para martillar la API (y su base de datos). */
        if (await isRateLimited(env.LOOKUP_IP_LIMITER, clientIp(request))) {
          return json({ success: false, message: "Demasiadas consultas. Intenta de nuevo en un minuto." }, 429);
        }
        return url.pathname === "/wizard/parentescos"
          ? await handleParentescos(env, json, url)
          : await handleVendedorLookup(url.searchParams.get("codigo"), env, json, url);
      }
      /* Health público mínimo: sin orígenes, modelo ni estado de secretos
         (eso se revisa con `wrangler secret list` / `wrangler tail`). */
      return json({
        ok:      true,
        service: "legado-checkout",
        tenant:  resolveTenant(env).id,
        ready:   !!(env.PF_TOKEN && env.OPENAI_API_KEY),
      });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ success: false, message: "JSON inválido: " + e.message }, 400);
    }

    if (url.pathname === "/chat") {
      /* Límite por IP (binding CHAT_IP_LIMITER de wrangler.toml). Cada mensaje
         cuesta tokens de OpenAI: sin esto, cualquiera podía vaciar el
         presupuesto y tumbar a Alma para todos. Pasado el límite no se llama
         al LLM — se responde con el WhatsApp de guardia. */
      if (await isRateLimited(env.CHAT_IP_LIMITER, clientIp(request))) {
        return json(await fallbackChatResponse("limit", body.lang, sanitizeAttribution(body.attribution), env), 429);
      }
      try {
        const result = await handleChat(body, env, executionCtx);
        return json(result, result.rateLimited ? 429 : 200);
      } catch (e) {
        const isValidation = isValidationError(e);
        if (!isValidation) {
          console.error("Chat error:", e.message);
          if (e.stack) console.error(e.stack);
        }
        /* El detalle técnico queda en el log; al navegador solo lo genérico. */
        return json(
          { output: "", error: isValidation ? e.message : "Error interno" },
          isValidation ? 400 : 500,
        );
      }
    }

    /* El checkout del wizard solo vive en POST / — antes cualquier POST a
       cualquier ruta desconocida terminaba en el checkout. */
    if (url.pathname !== "/") {
      return json({ success: false, message: "Not found" }, 404);
    }

    /* Límite por IP del checkout (binding CHECKOUT_IP_LIMITER). Cada compra
       crea una compra pendiente en Previsión y una sesión de pago de Stripe:
       sin límite, un script podía generar miles. Un comprador real reintenta
       pocas veces (y reusa su Idempotency-Key). */
    if (await isRateLimited(env.CHECKOUT_IP_LIMITER, clientIp(request))) {
      return json({
        success: false,
        code: "rate_limited",
        message: "Demasiados intentos seguidos. Espera un minuto e intenta de nuevo.",
      }, 429);
    }

    try {
      const result = await processWizardCheckout(body, env);
      const status = result.success
        ? 200
        : result.code === "pf_unavailable" ? 503
        : result.code === "pf_review" ? 409
        : 400;
      return json(result, status);
    } catch (e) {
      const isValidation = isValidationError(e);
      if (!isValidation) {
        console.error("Pipeline error:", e.message);
        if (e.stack) console.error(e.stack);
      }
      return json(
        {
          success: false,
          message: isValidation ? e.message : "No pudimos procesar la compra. Intenta de nuevo en unos minutos.",
        },
        isValidation ? 400 : 500,
      );
    }
  },
};

/* OpenTelemetry: si hay endpoint OTLP configurado (secret), servimos el handler
   envuelto con instrument() — auto-instrumenta cada `fetch` saliente (OpenAI /
   Prevision-Funeraria / Stripe) como span hijo, más los spans
   manuales de alma.js/chat.js. Sin el secret, el handler va crudo (cero
   overhead, kill-switch). Ver worker/src/otel.js. */
const instrumented = instrument(handler, resolveOtelConfig);

export default {
  fetch(request, env, executionCtx) {
    return (otelEnabled(env) ? instrumented : handler).fetch(
      request,
      env,
      executionCtx,
    );
  },
};

/* /parentescos exige token server-to-server (nunca en el navegador) — el
   wizard lo llama vía este proxy para poblar el <select> de familiares. */
/* Caché en el edge (Cache API de la zona api.legadoholding.com; en workers.dev
   es un no-op). Los parentescos casi nunca cambian y la consulta de vendedor
   se repite cuando un vendedor reparte su enlace en un grupo: así no llega
   una consulta a Previsión por cada visitante. Si la caché falla, se sigue
   sin ella. */
const PARENTESCOS_TTL_S = 600;
const VENDEDOR_TTL_S    = 300;
/* Un código no encontrado se cachea poco: si el administrador acaba de crear
   un código personalizado, tiene que funcionar casi enseguida. */
const VENDEDOR_MISS_TTL_S = 60;

function edgeCache() {
  return typeof caches !== "undefined" && caches.default ? caches.default : null;
}
function cacheKey(url, path) {
  return new Request(`${url.origin}/__cache/${path}`);
}
async function cacheGet(url, path) {
  const c = edgeCache();
  if (!c) return null;
  try {
    const hit = await c.match(cacheKey(url, path));
    return hit ? await hit.json() : null;
  } catch (_) { return null; }
}
async function cachePut(url, path, data, ttlS) {
  const c = edgeCache();
  if (!c) return;
  try {
    await c.put(cacheKey(url, path), new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${ttlS}` },
    }));
  } catch (_) { /* sin caché */ }
}

async function handleParentescos(env, json, url) {
  const path = `parentescos/${resolveTenant(env).id}`;
  const cached = await cacheGet(url, path);
  if (cached) return json(cached);
  try {
    const PF = createPF(env);
    const resp = await PF.getParentescos();
    await cachePut(url, path, resp, PARENTESCOS_TTL_S);
    return json(resp);
  } catch (e) {
    console.error("Parentescos error:", e.message);
    return json({ success: false, message: "Catálogo no disponible" }, 503);
  }
}

/* /wizard/vendedor?codigo= — resuelve un ?ref= a nombre de vendedor para
   mostrarlo en el sitio ("te atiende por recomendación de X"). El token vive
   solo en el Worker; el navegador nunca ve la lista de vendedores. Código
   inválido/inactivo → { activo: false } (nunca error). */
async function handleVendedorLookup(codigo, env, json, url) {
  const c = (codigo || "").replace(/[^A-Za-z0-9]/g, "");
  if (c.length < 4 || c.length > 20) return json({ activo: false, verificado: true });
  const path = `vendedor/${resolveTenant(env).id}/${c}`;
  const cached = await cacheGet(url, path);
  if (cached) return json(cached);
  try {
    const PF = createPF(env);
    const resp = await PF.getVendedor(c);
    /* Solo se cachea una respuesta verificada (un error de Previsión no). */
    const out = {
      activo: !!(resp && resp.activo),
      verificado: true,
      codigo: c,
      nombre: (resp && (resp.nombre || resp.nombre_completo)) || null,
    };
    await cachePut(url, path, out, out.activo ? VENDEDOR_TTL_S : VENDEDOR_MISS_TTL_S);
    return json(out);
  } catch (e) {
    /* verificado:false = no se pudo consultar a Previsión (no es lo mismo que
       un código inválido). El sitio lo guarda "sin verificar" y reintenta. */
    console.warn(`Vendedor lookup error (${c}): ${e.message}`);
    return json({ activo: false, verificado: false });
  }
}

/* CORS — eco condicional del Origin según ALLOWED_ORIGINS. Requests sin
   Origin (curl, PowerShell, Worker→Worker) no son sujetas a CORS y no
   necesitan el header; el navegador es quien aplica la política. */
function getAllowedOrigins(env) {
  const raw = (env.ALLOWED_ORIGINS || "*").trim();
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function corsFor(request, env) {
  const origin = request.headers.get("Origin");
  const list   = getAllowedOrigins(env);

  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age":       "86400",
    Vary:                           "Origin",
  };

  if (list.includes("*")) {
    headers["Access-Control-Allow-Origin"] = "*";
  } else if (origin && list.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  /* Si no hay match → no se envía ACAO. La respuesta sigue saliendo, pero
     el navegador no permite leerla. Server-to-server no se ve afectado. */

  return headers;
}
