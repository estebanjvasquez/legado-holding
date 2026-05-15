/* =============================================================================
   Proxy al agente Alma 2 (n8n) + handoff a Invoice Ninja al confirmar.

   Frontend envía:        { sessionId, message }
   Worker → Alma 2:       POST {ALMA_WEBHOOK_URL} { sessionId, chatInput }
   Alma 2 → Worker:       { output, finalize?, extracted_data? }
   Worker → Frontend:     { output, invitationLink?, invoiceNumber?, total? }

   El contrato de Alma 2 espera que cuando el flujo decide "finalize" devuelva
   además del HTML el bloque extracted_data con billing_data y
   selected_product_keys. Si no llega 'finalize', el Worker sólo hace passthrough.
   ============================================================================= */

import { emergencyCheckout } from "./emergency.js";

const ALMA_TIMEOUT_MS = 30000;

async function callAlma(url, payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ALMA_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
      signal:  controller.signal,
    });
    const text = await r.text();
    let parsed = text;
    try { parsed = text ? JSON.parse(text) : null; } catch (_) { /* keep text */ }
    if (!r.ok) {
      throw new Error(
        `Alma 2 -> ${r.status}: ${typeof parsed === "object" ? JSON.stringify(parsed) : String(parsed)}`,
      );
    }
    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}

function extractBilling(data) {
  const b = (data && data.billing_data) || {};
  return {
    name:      (b.name    || "").trim(),
    email:     (b.email   || "").toLowerCase().trim(),
    phone:     (b.phone   || "").trim(),
    id_number: (b.tax_id  || "").trim(),
    address:   (b.address || "").trim(),
  };
}

function extractItems(data) {
  const keys = data && (data.selected_product_keys || data.selected_services);
  if (!Array.isArray(keys)) return [];
  return keys.map((k) => String(k).trim()).filter(Boolean);
}

export async function handleChat(body, env, executionCtx) {
  const sessionId = (body.sessionId || "").trim();
  const message   = (body.message   || body.chatInput || "").trim();
  if (!sessionId) throw new Error("sessionId requerido");
  if (!message)   throw new Error("message requerido");

  const almaUrl = env.ALMA_WEBHOOK_URL;
  if (!almaUrl) throw new Error("ALMA_WEBHOOK_URL no configurado en el Worker");

  console.log(`[chat] session=${sessionId} msg="${message.slice(0, 80)}"`);

  const almaResp = await callAlma(almaUrl, { sessionId, chatInput: message });

  /* Alma puede devolver { output } (passthrough) o
     { output, finalize:true, extracted_data:{...} } (handoff). */
  const output   = (almaResp && almaResp.output) || "";
  const finalize = !!(almaResp && almaResp.finalize);
  const extracted =
    (almaResp && (almaResp.extracted_data || almaResp.data_to_store)) || null;

  if (!finalize || !extracted) {
    return { output };
  }

  /* Handoff a Invoice Ninja. Si falla la facturación, devolvemos el HTML
     de Alma + un mensaje de error explicado para que el cliente reintente,
     pero no rompemos la conversación. */
  try {
    const customer = extractBilling(extracted);
    const items    = extractItems(extracted);
    if (!customer.email) throw new Error("Email del cliente faltante en extracted_data");
    if (items.length === 0) throw new Error("Sin productos seleccionados en extracted_data");

    const result = await emergencyCheckout(
      {
        customer,
        items,
        notes:
          (extracted.service_type ? `Servicio: ${extracted.service_type}\n` : "") +
          (extracted.location     ? `Ubicación: ${extracted.location}\n`    : "") +
          (extracted.religion     ? `Religión: ${extracted.religion}`       : ""),
      },
      env,
      executionCtx,
    );

    console.log(
      `[chat] finalize ok session=${sessionId} invoice=${result.invoiceNumber}`,
    );

    return {
      output,
      finalize:       true,
      invoiceNumber:  result.invoiceNumber,
      invitationLink: result.invitationLink,
      total:          result.invoiceTotal,
      isNewClient:    result.isNewClient,
    };
  } catch (e) {
    console.error(`[chat] finalize FAILED session=${sessionId}: ${e.message}`);
    return {
      output,
      finalize:      true,
      error:         "No pudimos generar la factura. Por favor llámanos al 0414-XXX-XXXX o reintenta.",
      errorDetail:   e.message,
    };
  }
}
