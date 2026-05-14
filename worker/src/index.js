/* =============================================================================
   LEGADO — Checkout Worker
   Reemplazo de n8n LEGADO_PostPayment_v7 y del proxy List_Products.
     GET  /          → health check (verifica secret y vars cargados)
     GET  /products  → lista de productos 'legadoweb' (proxy a IN /products)
     POST /          → ejecuta el pipeline de checkout
     OPTIONS         → CORS preflight
   ============================================================================= */

import { createIN } from "./invoiceninja.js";
import { processCheckout } from "./pipeline.js";

export default {
  async fetch(request, env) {
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
      if (url.pathname === "/products") {
        return await handleProducts(env, json);
      }
      return json({
        ok: true,
        service:        "legado-checkout",
        env:            env.ENVIRONMENT,
        tokenLoaded:    !!env.IN_TOKEN,
        inBase:         env.IN_BASE,
        emailMode:      env.EMAIL_MODE || "explicit",
        allowedOrigins: getAllowedOrigins(env),
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

    try {
      const result = await processCheckout(body, env);
      return json(result, result.success ? 200 : 400);
    } catch (e) {
      console.error("Pipeline error:", e.message);
      if (e.stack) console.error(e.stack);
      return json({ success: false, message: e.message }, 500);
    }
  },
};

async function handleProducts(env, json) {
  try {
    const IN = createIN(env);
    const resp = await IN.listProducts();
    const products = (resp.data || []).filter(
      (p) => !p.is_deleted && p.custom_value1 === "legadoweb",
    );
    console.log(`Products served: ${products.length} legadoweb items`);
    return json({ data: products });
  } catch (e) {
    console.error("Products error:", e.message);
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
