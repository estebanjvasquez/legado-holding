/* =============================================================================
   Cliente HTTP de la API pública de Prevision-Funeraria (tenant `lh`).
   Reemplaza a invoiceninja.js como fuente de verdad administrativa del wizard
   de planes. Ver docs/api-publica-wizard.md para el contrato completo.
   ============================================================================= */

export function createPF(env) {
  if (!env.PF_TOKEN) {
    throw new Error("PF_TOKEN no configurado en el Worker");
  }
  const base = (env.PF_BASE || "https://prevision-funeraria.sisteg.workers.dev") +
    "/api/public/t/lh";
  const baseHeaders = {
    Authorization: `Bearer ${env.PF_TOKEN}`,
    Accept: "application/json",
  };

  async function req(method, path, body) {
    const opts = { method, headers: { ...baseHeaders } };
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
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
    getParentescos: () => req("GET", "/parentescos"),
    crearCompra: (body) => req("POST", "/compras", body),
  };
}
