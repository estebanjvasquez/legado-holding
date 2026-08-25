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

import { createPF } from "./prevision-api.js";
import { processWizardCheckout } from "./wizard-compra.js";
import { handleChat } from "./chat.js";
import { handleAdmin } from "./admin.js";
import { isValidationError } from "./errors.js";

export default {
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

    /* /admin/* — todos los métodos los maneja admin.js (con su propia auth). */
    if (url.pathname.startsWith("/admin/")) {
      try {
        return await handleAdmin(request, env, cors);
      } catch (e) {
        console.error(`[admin top] ${e.message}`);
        return json({ error: e.message }, 500);
      }
    }

    if (request.method === "GET") {
      if (url.pathname === "/wizard/parentescos") {
        return await handleParentescos(env, json);
      }
      return json({
        ok: true,
        service:            "legado-checkout",
        env:                env.ENVIRONMENT,
        pfTokenLoaded:      !!env.PF_TOKEN,
        pfBase:             env.PF_BASE,
        geminiConfigured:   !!env.GEMINI_API_KEY,
        geminiModel:        env.GEMINI_MODEL || "gemini-2.5-flash",
        supabaseConfigured: !!(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY),
        supabaseUrl:        env.SUPABASE_URL || null,
        allowedOrigins:     getAllowedOrigins(env),
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
      try {
        const result = await handleChat(body, env, executionCtx);
        return json(result, 200);
      } catch (e) {
        const isValidation = isValidationError(e);
        if (!isValidation) {
          console.error("Chat error:", e.message);
          if (e.stack) console.error(e.stack);
        }
        return json(
          { output: "", error: e.message },
          isValidation ? 400 : 500,
        );
      }
    }

    try {
      const result = await processWizardCheckout(body, env);
      return json(result, result.success ? 200 : 400);
    } catch (e) {
      const isValidation = isValidationError(e);
      if (!isValidation) {
        console.error("Pipeline error:", e.message);
        if (e.stack) console.error(e.stack);
      }
      return json(
        { success: false, message: e.message },
        isValidation ? 400 : 500,
      );
    }
  },
};

/* /parentescos exige token server-to-server (nunca en el navegador) — el
   wizard lo llama vía este proxy para poblar el <select> de familiares. */
async function handleParentescos(env, json) {
  try {
    const PF = createPF(env);
    const resp = await PF.getParentescos();
    return json(resp);
  } catch (e) {
    console.error("Parentescos error:", e.message);
    return json({ success: false, message: e.message }, 500);
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
    "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token",
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
