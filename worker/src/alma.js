/* =============================================================================
   Agente Alma — Gemini con function calling.
   Reemplaza el workflow n8n "Alma 2" trayendo el agente al Worker.

   Entrada (de chat.js):  { sessionId, message, history:[{role,content}], lang }
   Salida (a chat.js):    { output, finalize?, invoiceNumber?, invitationLink?,
                            total?, isNewClient?, customer?, productKeys?,
                            notes?, events:[...] }

   El loop de tool use es server-side: el modelo puede llamar
     - list_emergency_products  → lee catálogo 'urgencias' de Invoice Ninja
     - create_invoice           → crea cliente (si nuevo) + factura + email
   y el Worker ejecuta y le devuelve el resultado al modelo. Cuando el modelo
   produce sólo texto (sin functionCall), ese texto es la respuesta al usuario.

   `events` se devuelve para que chat.js los escriba en Supabase (logs de
   cada hop: turno del modelo, tool calls, resultados, latencias, errores).
   ============================================================================= */

import { createIN } from "./invoiceninja.js";
import { emergencyCheckout } from "./emergency.js";

const GEMINI_BASE  = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_TOOL_HOPS = 6;   /* tope defensivo; en práctica 1-2 hops bastan */
const GEMINI_TIMEOUT_MS = 30000;

/* ── System prompt ───────────────────────────────────────────────────────────
   Misma voz que el Alma 2 actual: compasiva, en español por defecto, sin
   abrumar. Lo crítico aquí son las reglas explícitas sobre CUÁNDO llamar
   create_invoice — sin esto el modelo despide al usuario sin facturar.        */
const SYSTEM_PROMPT_ES = `Eres Alma, asistente de Legado Holding, una empresa funeraria venezolana con más de 80 años de trayectoria. Atiendes a venezolanos en Estados Unidos cuya familia en Venezuela acaba de fallecer o está en una emergencia funeraria activa.

TONO
- Empática, cálida, respetuosa. La persona está en duelo.
- Concisa: no abrumes con información. Mensajes cortos, uno o dos párrafos.
- Llama al usuario por su nombre cuando lo sepas.
- Español por defecto. Inglés solo si el usuario escribe en inglés.

PROCESO (en orden estricto)
1. Saluda y reconoce el dolor. Pregunta dónde está la familia (ciudad/estado de Venezuela) y, si el usuario lo ofrece, datos del fallecido.
2. Cuando entiendas el contexto, llama la tool 'list_emergency_products' para conocer el catálogo real y proponer combinaciones (cremación vs inhumación, traslados, etc.). NUNCA inventes productos ni precios — usa solo los que devuelva la tool.
3. Propón al usuario una combinación adecuada con precios reales y total. Pregunta si le sirve, ajusta si pide cambios.
4. Recopila los datos del CONTRATANTE (no del fallecido): nombre completo, email, teléfono, cédula/identificación, dirección.
   - El email es OBLIGATORIO: sin email no se puede enviar la factura.
   - Si el usuario no lo da, insiste amablemente.
5. Muestra resumen final: servicios elegidos con precios + total + datos del contratante.
6. Pide confirmación EXPLÍCITA al usuario ("¿Confirmas para generar la factura?").
7. SOLO cuando el usuario confirme explícitamente ("sí", "confirmo", "procede", "ok", etc.), llama la tool 'create_invoice' con los product_key exactos devueltos por list_emergency_products. NO la llames antes de la confirmación.
8. Tras create_invoice, si la tool devuelve success:true, comunica al usuario que la factura fue enviada a su email y aparecerá un botón de pago seguro. NO inventes números de factura — el sistema los mostrará.

REGLAS DURAS
- Si create_invoice devuelve success:false, discúlpate y entrega un teléfono de contacto de emergencia.
- No prometas servicios fuera del catálogo. No des diagnóstico médico ni legal.
- Si el usuario pregunta por planes de previsión (no emergencia), explica que esa es otra línea de negocio y sugiérele cerrar el chat y usar la sección de planes del sitio.
- Formato de salida al usuario: HTML simple permitido (p, ul, li, strong, br). El markdown NO se renderiza.`;

const SYSTEM_PROMPT_EN = `You are Alma, an assistant at Legado Holding — a Venezuelan funeral services company with over 80 years of experience. You serve Venezuelans living in the USA whose family in Venezuela has just passed away or is facing an active funeral emergency.

TONE
- Empathetic, warm, respectful. The person is grieving.
- Concise: do not overwhelm. One or two short paragraphs per message.
- Use the user's name once you know it.
- English only if the user writes in English.

PROCESS (strict order)
1. Greet and acknowledge the pain. Ask where the family is (city/state in Venezuela) and, if offered, details about the deceased.
2. Once you understand the context, call the 'list_emergency_products' tool to see the real catalog and propose combinations. NEVER invent products or prices.
3. Propose a combination with real prices and total. Ask if it works; adjust on request.
4. Collect the CONTRACT HOLDER's details (not the deceased): full name, email, phone, ID number, address.
   - Email is REQUIRED to send the invoice.
5. Show the final summary: services with prices + total + contract holder details.
6. Ask for EXPLICIT confirmation ("Shall I generate the invoice?").
7. ONLY after explicit confirmation, call 'create_invoice' with the exact product_keys returned by list_emergency_products.
8. After create_invoice with success:true, tell the user the invoice was emailed and a secure payment button will appear. Do not invent invoice numbers.

HARD RULES
- If create_invoice returns success:false, apologize and give an emergency phone.
- Do not promise services outside the catalog. No medical or legal advice.
- HTML output allowed: p, ul, li, strong, br. Markdown is not rendered.`;

/* ── Tool definitions (Gemini schema) ────────────────────────────────────── */
const TOOLS = [
  {
    functionDeclarations: [
      {
        name: "list_emergency_products",
        description:
          "Devuelve el catálogo real de servicios funerarios de urgencia con product_key, precio y descripción. Llámala antes de proponer cualquier servicio.",
        parameters: { type: "OBJECT", properties: {} },
      },
      {
        name: "create_invoice",
        description:
          "Crea el cliente en Invoice Ninja si no existe, genera la factura con los servicios indicados y la envía por email. SOLO llámala después de que el usuario haya confirmado explícitamente.",
        parameters: {
          type: "OBJECT",
          properties: {
            customer: {
              type: "OBJECT",
              description: "Datos del contratante (no del fallecido).",
              properties: {
                name:      { type: "STRING", description: "Nombre completo del contratante" },
                email:     { type: "STRING", description: "Email para enviar la factura (obligatorio)" },
                phone:     { type: "STRING", description: "Teléfono de contacto" },
                id_number: { type: "STRING", description: "Cédula o identificación fiscal" },
                address:   { type: "STRING", description: "Dirección física" },
              },
              required: ["name", "email"],
            },
            product_keys: {
              type: "ARRAY",
              items: { type: "STRING" },
              description:
                "Array con los product_key exactos devueltos por list_emergency_products. Mínimo 1.",
            },
            notes: {
              type: "STRING",
              description:
                "Notas para la factura: ubicación de la familia, nombre del fallecido, religión u observaciones del servicio.",
            },
          },
          required: ["customer", "product_keys"],
        },
      },
    ],
  },
];

/* ── HTTP helper ─────────────────────────────────────────────────────────── */
async function callGemini(model, apiKey, payload) {
  const url = `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method:  "POST",
      headers: {
        "Content-Type":   "application/json",
        "x-goog-api-key": apiKey,
      },
      body:   JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await r.text();
    let parsed = text;
    try { parsed = text ? JSON.parse(text) : null; } catch (_) { /* keep text */ }
    if (!r.ok) {
      const detail = typeof parsed === "object" ? JSON.stringify(parsed) : String(parsed);
      throw new Error(`Gemini ${r.status}: ${detail}`);
    }
    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}

/* ── Tool executors ──────────────────────────────────────────────────────── */
async function execListProducts(env) {
  const IN = createIN(env);
  const resp = await IN.listProducts();
  const urg = (resp.data || [])
    .filter((p) => !p.is_deleted && p.custom_value1 === "urgencias")
    .map((p) => ({
      product_key: p.product_key,
      price:       Number(p.price) || 0,
      description: (p.notes || "").trim(),
    }));
  return { products: urg };
}

async function execCreateInvoice(args, env, executionCtx) {
  try {
    const customer = args.customer || {};
    const items    = Array.isArray(args.product_keys) ? args.product_keys : [];
    if (!customer.email) {
      return { success: false, error: "Email del cliente faltante" };
    }
    if (items.length === 0) {
      return { success: false, error: "No se indicó ningún servicio" };
    }
    const result = await emergencyCheckout(
      { customer, items, notes: args.notes || "" },
      env,
      executionCtx,
    );
    return {
      success:        true,
      invoiceId:      result.invoiceId,
      invoiceNumber:  result.invoiceNumber,
      invitationLink: result.invitationLink,
      total:          result.invoiceTotal,
      isNewClient:    result.isNewClient,
    };
  } catch (e) {
    console.error(`[alma] create_invoice failed: ${e.message}`);
    return { success: false, error: e.message };
  }
}

/* ── Conversión historial → contents de Gemini ───────────────────────────── */
function historyToContents(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => m && m.content && (m.role === "user" || m.role === "assistant" || m.role === "model"))
    .map((m) => ({
      role:  (m.role === "user") ? "user" : "model",
      parts: [{ text: String(m.content) }],
    }));
}

/* ── Entry point ─────────────────────────────────────────────────────────── */
export async function runAlma(input, env, executionCtx) {
  /* trim defensivo: PowerShell pipea con \n trailing al wrangler secret put,
     y Google rechaza la key con API_KEY_INVALID si lleva newline. */
  const apiKey = (env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY no configurado en el Worker");
  }
  const model = env.GEMINI_MODEL || "gemini-2.5-flash";
  const lang  = (input.lang || "es").toLowerCase();
  const sysPrompt = lang.startsWith("en") ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_ES;

  const contents = historyToContents(input.history);
  contents.push({ role: "user", parts: [{ text: String(input.message || "") }] });

  /* Resultado acumulado a lo largo de los hops. events = traza completa para
     persistir en Supabase (chat_turns) desde chat.js.                          */
  const out = {
    output:   "",
    finalize: false,
    model,
    events:   [],
  };

  for (let hop = 0; hop < MAX_TOOL_HOPS; hop++) {
    const t0 = Date.now();
    let resp;
    try {
      resp = await callGemini(model, apiKey, {
        contents,
        tools: TOOLS,
        systemInstruction: { parts: [{ text: sysPrompt }] },
        generationConfig:  { temperature: 0.7 },
      });
    } catch (e) {
      const lat = Date.now() - t0;
      out.events.push({
        role:       "model",
        hop,
        latency_ms: lat,
        error:      e.message,
      });
      throw e;
    }
    const latency_ms = Date.now() - t0;

    const candidate = resp.candidates && resp.candidates[0];
    if (!candidate) {
      const msg = `Gemini sin candidatos: ${JSON.stringify(resp)}`;
      out.events.push({ role: "model", hop, latency_ms, error: msg });
      throw new Error(msg);
    }
    const parts = (candidate.content && candidate.content.parts) || [];
    const funcCalls = parts.filter((p) => p.functionCall).map((p) => p.functionCall);
    const textParts = parts.filter((p) => p.text).map((p) => p.text);

    /* Caso A: el modelo NO pidió tool → texto final al usuario. */
    if (funcCalls.length === 0) {
      out.output = textParts.join("\n").trim();
      out.events.push({
        role:       "model",
        hop,
        latency_ms,
        content:    out.output,
      });
      console.log(`[alma] hop=${hop} done text_len=${out.output.length} finalize=${out.finalize}`);
      return out;
    }

    /* Caso B: hay tool call(s). Guardamos el turno del modelo y ejecutamos
       cada tool, luego devolvemos los functionResponse al modelo en el
       siguiente hop. Gemini permite múltiples calls en paralelo en un turno. */
    contents.push({ role: "model", parts });

    /* Log del turno del modelo: una entrada por cada functionCall + texto si lo hubo. */
    for (const fc of funcCalls) {
      out.events.push({
        role:       "model",
        hop,
        latency_ms,
        tool_name:  fc.name,
        tool_args:  fc.args || {},
        content:    textParts.length ? textParts.join("\n") : null,
      });
    }

    const responseParts = [];
    for (const fc of funcCalls) {
      console.log(`[alma] hop=${hop} tool=${fc.name}`);
      const tt0 = Date.now();
      let result, toolError = null;
      try {
        if (fc.name === "list_emergency_products") {
          result = await execListProducts(env);
        } else if (fc.name === "create_invoice") {
          result = await execCreateInvoice(fc.args || {}, env, executionCtx);
          if (result.success) {
            out.finalize       = true;
            out.invoiceId      = result.invoiceId;
            out.invoiceNumber  = result.invoiceNumber;
            out.invitationLink = result.invitationLink;
            out.total          = result.total;
            out.isNewClient    = result.isNewClient;
            /* Capturamos los datos del cliente y los productos para que
               chat.js los persista en chat_sessions.                          */
            out.customer     = fc.args && fc.args.customer ? fc.args.customer : null;
            out.productKeys  = fc.args && Array.isArray(fc.args.product_keys) ? fc.args.product_keys : null;
            out.notes        = fc.args && fc.args.notes || null;
          }
        } else {
          result = { error: `Tool desconocida: ${fc.name}` };
          toolError = result.error;
        }
      } catch (e) {
        result = { error: e.message };
        toolError = e.message;
      }
      const toolLat = Date.now() - tt0;
      out.events.push({
        role:        "tool",
        hop,
        latency_ms:  toolLat,
        tool_name:   fc.name,
        tool_args:   fc.args || {},
        tool_result: result,
        error:       toolError,
      });
      responseParts.push({
        functionResponse: { name: fc.name, response: result },
      });
    }

    /* En Gemini los functionResponse van como role:"user". */
    contents.push({ role: "user", parts: responseParts });
  }

  const msg = `Tool use no convergió en ${MAX_TOOL_HOPS} hops`;
  out.events.push({ role: "model", error: msg });
  throw new Error(msg);
}
