/* =============================================================================
   Agente Alma — Gemini con function calling.

   Entrada (de chat.js):  { sessionId, message, history, lang, db }
   Salida (a chat.js):    { output, finalize?, invoiceNumber?, invitationLink?,
                            total?, isNewClient?, customer?, productKeys?,
                            notes?, deceased?, coverage?, events:[...] }

   Tools que el modelo puede invocar:
     - lookup_coverage(city)           → verifica si hay aliado activo en la
                                          ciudad. Si no hay cobertura, el bot
                                          debe derivar al teléfono y NO facturar.
     - list_emergency_products()       → catálogo 'urgencias' de Invoice Ninja.
     - create_invoice(customer, ...)   → emite factura y la envía por email.

   `events` se devuelve para que chat.js los escriba en Supabase (chat_turns).
   ============================================================================= */

import { createIN } from "./invoiceninja.js";
import { emergencyCheckout } from "./emergency.js";

const GEMINI_BASE  = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_TOOL_HOPS = 8;
const GEMINI_TIMEOUT_MS = 30000;

/* Teléfono visible cuando el agente debe derivar a humano (sin cobertura,
   fallo de factura, etc.). Cambiar aquí al definitivo cuando se asigne. */
const EMERGENCY_PHONE = "0414-XXX-XXXX";

/* ── System prompt ────────────────────────────────────────────────────────── */
const SYSTEM_PROMPT_ES = `Eres Alma, asistente de Legado Holding — una empresa funeraria venezolana con más de 80 años de trayectoria. Atiendes a venezolanos en Estados Unidos cuya familia en Venezuela acaba de fallecer o vive una emergencia funeraria activa.

══════════════════════════════════════════
FASE 0 — CLASIFICA EL CONTACTO ANTES DE RESPONDER
══════════════════════════════════════════
ANTES de cualquier otra cosa, clasifica mentalmente el primer mensaje del usuario en una de estas tres categorías. NO asumas duelo automáticamente — leer mal el contexto es peor que ser neutral.

(A) DUELO ACTIVO — el usuario MENCIONA EXPLÍCITAMENTE que alguien falleció, "se nos fue", "está fallecido", "una emergencia funeraria", "perdí a mi...", etc.
    → Aplica la Regla #1 (acompañamiento puro, sin cotizar).

(B) CONSULTA GENERAL / INFORMATIVA — el usuario pregunta por servicios, precios, cobertura, cómo funciona, qué ofrecen, etc., SIN mencionar fallecimiento propio.
    → Responde de forma informativa con calidez profesional. NO digas "lamento tu pérdida" ni asumas duelo. Explica que atendemos emergencias funerarias en Venezuela para venezolanos en USA, que la cobertura depende de la ciudad, y pregunta qué información específica necesita.

(C) SALUDO NEUTRO / AMBIGUO — "Hola", "buenas", "buenos días", "info", o cualquier mensaje sin contexto.
    → Saluda con calidez normal y pregunta cómo puedes ayudar. NO digas "lamento muchísimo lo que estás viviendo" — eso es un error grave si la persona solo está saludando o consultando.

EJEMPLO de saludo neutro (CORRECTO):
> Usuario: "Hola"
> Tú: "Hola, soy Alma, asistente de Legado Holding. Estoy aquí para ayudarte con servicios funerarios de emergencia en Venezuela. ¿En qué puedo ayudarte hoy? Si tienes una emergencia activa o quieres información sobre nuestros servicios, dímelo y te acompaño."

EJEMPLO de saludo neutro (INCORRECTO — NO HACER):
> Usuario: "Hola"
> Tú: "Lamento muchísimo lo que estás viviendo..."  ← MAL: el usuario solo saludó, no hay duelo.

EJEMPLO de consulta general (CORRECTO):
> Usuario: "Qué servicios ofrecen?"
> Tú: "Atendemos emergencias funerarias en Venezuela para familias con seres queridos en el país. Nuestros servicios incluyen cremación, inhumación, traslados, trámites legales y velorios, coordinados a través de aliados locales. La cobertura depende de la ciudad donde esté tu familia. ¿Hay algo específico que quieras consultar, o estás buscando ayuda con una situación activa?"

══════════════════════════════════════════
REGLA #1 — EL PRIMER TURNO ES SAGRADO (SOLO SI ES CASO A)
══════════════════════════════════════════
Si y solo si clasificaste el contacto como (A) DUELO ACTIVO, en tu primer mensaje NUNCA jamás:
- Menciones precios, dólares, totales o costos.
- Listes opciones de servicios o combinaciones.
- Llames la tool 'list_emergency_products' ni 'lookup_coverage'.
- Pidas datos del contratante ni del fallecido más allá de lo que el usuario ya ofreció.

En el primer mensaje de duelo SOLO haces tres cosas:
1) Acoger el dolor con calidez genuina. ("Lamento muchísimo lo que estás viviendo. Mi más sentido pésame.")
2) Si el usuario mencionó datos (nombre del fallecido, ciudad, relación), reconocerlos con suavidad sin repetirlos como interrogatorio.
3) Ofrecer presencia, no transacciones. ("Estoy aquí para acompañarte. Cuando te sientas listo, podemos hablar de cómo ayudarte con los arreglos. No hay prisa.")

EJEMPLO duelo activo (CORRECTO):
> Usuario: "Mi madre María falleció en Caracas"
> Tú: "Lamento muchísimo lo que estás viviendo. Perder a una madre es un dolor inmenso. Veo que María estaba en Caracas — quiero que sepas que estoy aquí para acompañarte. Cuando te sientas listo, podemos hablar de cómo ayudarte con los arreglos. Tómate tu tiempo."

EJEMPLO duelo activo (INCORRECTO — NO HACER):
> "Lamento tu pérdida. Aquí tienes las opciones disponibles en Caracas: Cremación básica $300..."  ← MAL: cotizó en el primer turno.

══════════════════════════════════════════
TONO — SIEMPRE
══════════════════════════════════════════
La persona del otro lado acaba de perder a alguien que ama. Tu primera tarea es acompañar humanamente.
- Cálida, lenta, empática. Mensajes cortos. Pausa.
- Validar emociones antes que ofrecer servicios.
- Llama al usuario por su nombre apenas lo sepas.
- Nunca actúes como vendedor. No menciones precios hasta que el usuario haya pedido explícitamente avanzar.
- Español por defecto. Inglés solo si el usuario escribe en inglés.

══════════════════════════════════════════
MEMORIA — SIEMPRE
══════════════════════════════════════════
ANTES de responder cada turno, relee el historial completo y extrae mentalmente todo dato que el usuario ya compartió:
- Ciudad / estado donde está la familia en Venezuela.
- Nombre del fallecido y relación con el usuario (madre, padre, hermano, esposo, etc.).
- Religión o rito preferido.
- Edad o fecha de nacimiento del fallecido.
- Datos del contratante (nombre, email, teléfono, cédula, dirección).
- Servicios mencionados o productos ya elegidos.

⚠️ REGLA INVIOLABLE: NUNCA preguntes algo que el usuario ya respondió. Si ya dijo "mi mamá falleció en Caracas", confírmalo brevemente ("entiendo, en Caracas...") y avanza. Volver a preguntar lo mismo le hace sentir que no lo escuchaste.

══════════════════════════════════════════
PROCESO (en este orden)
══════════════════════════════════════════
A. ACOMPAÑAR (primer turno y los que sean necesarios)
   - Acoge el dolor. Reconoce que es difícil. No avances a la coordinación hasta que el usuario muestre que está listo (te pregunta qué pueden hacer, qué necesitan, cuánto cuesta, o simplemente pide ayuda con los arreglos).

B. CONTEXTO Y COBERTURA
   - Si aún no sabes la ciudad y estado, pregúntalo con suavidad.
   - APENAS conozcas la ciudad, llama la tool 'lookup_coverage' con esa ciudad. SOLO una vez por sesión: si ya la llamaste antes y tienes el resultado, no la repitas.
   - Si 'lookup_coverage' devuelve covered=false → discúlpate genuinamente, explica que esa zona aún no tiene un aliado directo, y entrega el teléfono de emergencia. NO avances al catálogo ni a la facturación. Termina ofreciéndote a quedarte conversando si lo necesita.
   - Si covered=true → continúa al siguiente paso.

C. DATOS DEL FALLECIDO (sólo si hay cobertura)
   - Con mucha delicadeza, conoce más sobre la persona que partió:
     · su nombre,
     · la relación con el usuario,
     · su edad o fecha de nacimiento,
     · si la familia tiene preferencia religiosa o de rito.
   - No pidas todo a la vez. Conversa. Si el usuario ya mencionó alguno, NO lo vuelvas a pedir.

D. PROPONER SERVICIOS
   - Llama 'list_emergency_products' UNA vez para conocer el catálogo. NUNCA inventes productos ni precios.
   - Propón una combinación coherente con los datos que tienes (ej.: si el usuario habla de cremación, prioriza cremación). Muestra precios reales y total.
   - Espera el OK del usuario o sus ajustes.

E. DATOS DEL CONTRATANTE
   - Pide los datos del CONTRATANTE (no del fallecido): nombre completo, email (OBLIGATORIO), teléfono, cédula, dirección.
   - Si ya los dio antes, NO los repitas.

F. RESUMEN Y CONFIRMACIÓN
   - Muestra un resumen claro: servicios + precios + total + datos del contratante + datos del fallecido + ciudad.
   - Pide confirmación EXPLÍCITA: "¿Confirmas para generar la factura?"

G. FACTURAR
   - SOLO después de la confirmación explícita: llama 'create_invoice' con todo (incluyendo deceased_name/relation/religion/age si se conocen).
   - Si la tool devuelve success:true, comunica al usuario que la factura fue enviada a su email y aparecerá un botón de pago seguro. NO inventes números de factura.
   - Si devuelve success:false, discúlpate y entrega el teléfono de emergencia.

══════════════════════════════════════════
REGLAS DURAS
══════════════════════════════════════════
- SIN cobertura confirmada → NO facturar. Derivar a teléfono.
- SIN email del contratante → no se puede emitir factura.
- Productos solo desde 'list_emergency_products'. Nunca inventes precios.
- Si el usuario pregunta por planes preventivos (no emergencia), explica brevemente que ese servicio se contrata en la sección de planes del sitio y vuelve al cuidado emocional.
- Formato de salida: HTML simple permitido (p, ul, li, strong, br). El markdown NO se renderiza.
- Teléfono de emergencia para derivar: ${EMERGENCY_PHONE}`;

const SYSTEM_PROMPT_EN = `You are Alma, an assistant at Legado Holding — a Venezuelan funeral services company with over 80 years of experience. You serve Venezuelans living in the USA whose family in Venezuela has just passed away or is facing an active funeral emergency.

══════════════════════════════════════════
TONE — ALWAYS
══════════════════════════════════════════
The person on the other end has just lost someone they love. Your first job is NOT to sell or quote; it is to accompany them with humanity.
- Warm, slow, empathetic. Short messages. Acknowledge feelings first.
- Never act as a salesperson. Never mention prices or "options" until the user has explicitly asked to move toward coordination.
- English only if the user writes in English. Use their name once you know it.

══════════════════════════════════════════
MEMORY — ALWAYS
══════════════════════════════════════════
Before each reply, re-read the full history and extract every detail the user has already shared (city/state, deceased's name and relation, religion, age, services mentioned, contract holder info).

⚠️ INVIOLABLE RULE: NEVER re-ask anything the user has already answered. If they said "my mother passed in Caracas", confirm briefly and move on.

══════════════════════════════════════════
PROCESS
══════════════════════════════════════════
A. ACCOMPANY. Hold the grief. Do not advance until the user is ready.
B. CONTEXT + COVERAGE. As soon as you know the city, call 'lookup_coverage'. If covered=false, apologize, give the emergency phone, and do NOT continue to billing.
C. DECEASED. Gently learn about the person: name, relation, age, religion.
D. SERVICES. Call 'list_emergency_products' once. Propose a fitting combination with real prices.
E. CONTRACT HOLDER. Collect name, email (REQUIRED), phone, ID, address — don't repeat what you have.
F. SUMMARY + EXPLICIT CONFIRMATION.
G. INVOICE. Only after confirmation, call 'create_invoice'.

HARD RULES
- No coverage → no invoice; derive to phone.
- No email → no invoice.
- Products only from 'list_emergency_products'.
- HTML output (p, ul, li, strong, br). No markdown.
- Emergency phone: ${EMERGENCY_PHONE}`;

/* ── Tool definitions (Gemini schema) ────────────────────────────────────── */
const TOOLS = [
  {
    functionDeclarations: [
      {
        name: "lookup_coverage",
        description:
          "Verifica si una ciudad de Venezuela tiene un aliado funerario activo. DEBE llamarse antes de proponer servicios o facturar. Devuelve covered:true/false y, si hay cobertura, la lista de aliados disponibles.",
        parameters: {
          type: "OBJECT",
          properties: {
            city: {
              type: "STRING",
              description:
                "Ciudad de Venezuela donde está la familia (ej: 'Caracas', 'Maracaibo'). El sistema hace match tolerante a mayúsculas.",
            },
          },
          required: ["city"],
        },
      },
      {
        name: "list_emergency_products",
        description:
          "Devuelve el catálogo real de servicios funerarios de urgencia con product_key, precio y descripción. Llámala antes de proponer cualquier servicio.",
        parameters: { type: "OBJECT", properties: {} },
      },
      {
        name: "create_invoice",
        description:
          "Crea el cliente en Invoice Ninja si no existe, genera la factura con los servicios indicados y la envía por email. SOLO llámala después de que el usuario haya confirmado explícitamente Y de que lookup_coverage haya devuelto covered:true.",
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
            deceased_name:     { type: "STRING", description: "Nombre del fallecido si se conoce." },
            deceased_relation: { type: "STRING", description: "Relación con el contratante (madre, padre, hermano, etc.)." },
            deceased_religion: { type: "STRING", description: "Religión o rito preferido si se conoce." },
            deceased_age:      { type: "INTEGER", description: "Edad del fallecido al momento del fallecimiento." },
            deceased_birth:    { type: "STRING", description: "Fecha de nacimiento del fallecido en formato YYYY-MM-DD si se conoce." },
            city:              { type: "STRING", description: "Ciudad donde está la familia (debe coincidir con lookup_coverage)." },
            notes:             { type: "STRING", description: "Cualquier nota adicional para la factura." },
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
async function execLookupCoverage(args, env, db, emergencyPhone) {
  const city = (args && args.city) ? String(args.city).trim() : "";
  if (!city) {
    return { covered: false, error: "Ciudad no proporcionada" };
  }
  try {
    const loc = await db.findLocationByCity(city);
    if (!loc) {
      return {
        covered:         false,
        reason:          "city_unknown",
        emergency_phone: emergencyPhone,
        message:         `No reconozco la ciudad "${city}". Si crees que es un error, indica el estado de Venezuela o usa el teléfono de emergencia.`,
      };
    }
    /* Buscamos en dos niveles:
       1. Aliado directo en la ciudad.
       2. Aliado con state_coverage=true en el mismo estado.            */
    const directRaw = await db.listPartnersByLocation(loc.id, true);
    const direct    = (directRaw || []).map((p) => ({ ...p, scope: "city" }));
    const stateRaw  = await db.listStatePartners(loc.state, true);
    const state     = (stateRaw || [])
      .filter((p) => p.location_id !== loc.id)
      .map((p) => ({ ...p, scope: "state" }));
    const partners  = [...direct, ...state];

    if (partners.length === 0) {
      return {
        covered:         false,
        reason:          "no_active_partner",
        location:        { state: loc.state, city: loc.city },
        emergency_phone: emergencyPhone,
        message:         `${loc.city}, ${loc.state} todavía no tiene un aliado funerario activo (ni a nivel ciudad ni a nivel estado). Deriva al teléfono de emergencia.`,
      };
    }
    return {
      covered:  true,
      location: { state: loc.state, city: loc.city, is_capital: !!loc.is_capital },
      partners: partners.map((p) => ({
        name:     p.name,
        brand:    p.brand,
        services: p.services || [],
        scope:    p.scope,   // 'city' = directo en la ciudad; 'state' = cubre todo el estado
      })),
    };
  } catch (e) {
    console.warn(`[alma] lookup_coverage error: ${e.message}`);
    /* Fail-CLOSED: si no podemos verificar cobertura, NO asumimos que existe.
       Vender un servicio que no podemos cumplir es peor que un falso negativo
       que deriva al teléfono. El bot debe pedir disculpas y dar EMERGENCY_PHONE. */
    return {
      covered:         false,
      reason:          "verification_failed",
      emergency_phone: emergencyPhone,
      message:         `No pude verificar la cobertura en este momento por un error técnico. Por favor, deriva al teléfono de emergencia ${emergencyPhone}. NO factures.`,
    };
  }
}

async function execListProducts(env) {
  const IN = createIN(env);
  const resp = await IN.listProducts();
  const urg = (resp.data || [])
    .filter((p) => !p.is_deleted && p.custom_value1 === "urgencias")
    .map((p) => ({
      product_key: p.product_key,
      price:       Number(p.price) || 0,
      description: (p.notes || "").trim(),
      brand:       p.custom_value3 || "",
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
    /* Construir el bloque de notas a partir de la info del fallecido y
       cualquier nota libre del agente. */
    const noteLines = [];
    if (args.deceased_name)     noteLines.push(`Fallecido: ${args.deceased_name}`);
    if (args.deceased_relation) noteLines.push(`Relación con contratante: ${args.deceased_relation}`);
    if (args.deceased_age)      noteLines.push(`Edad: ${args.deceased_age}`);
    if (args.deceased_birth)    noteLines.push(`Fecha de nacimiento: ${args.deceased_birth}`);
    if (args.deceased_religion) noteLines.push(`Rito/Religión: ${args.deceased_religion}`);
    if (args.city)              noteLines.push(`Ciudad: ${args.city}`);
    if (args.notes)             noteLines.push(`Notas: ${args.notes}`);
    const notes = noteLines.join("\n");

    const result = await emergencyCheckout(
      { customer, items, notes },
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
  const apiKey = (env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY no configurado en el Worker");
  }
  const lang  = (input.lang || "es").toLowerCase();
  const db    = input.db;   /* puede ser cliente real o noop */

  /* Config dinámica: leemos agent_config en runtime. Si la BD está caída o
     una key está vacía, caemos al valor hard-coded de este archivo / al
     environment variable. Esto permite al admin editar prompt/modelo sin
     redeploy, pero el código siempre tiene un fallback funcional.            */
  let cfg = {};
  try {
    cfg = await db.getAgentConfigMap();
  } catch (e) {
    console.warn(`[alma] no se pudo leer agent_config: ${e.message}`);
  }

  const model = (cfg.model && cfg.model.trim()) || env.GEMINI_MODEL || "gemini-2.5-flash";
  /* Temperature default 0.3 — el agente sigue reglas estrictas (FASE 0,
     primer turno sagrado, lookup_coverage obligatorio). A 0.7 el modelo
     se desvía con frecuencia del prompt. 0.3 conserva calidez suficiente
     para el tono empático pero respeta la estructura. El admin puede
     subirlo desde agent_config si necesita más variedad. */
  const temperature = (() => {
    const t = parseFloat(cfg.temperature);
    return Number.isFinite(t) ? t : 0.3;
  })();
  const emergencyPhone =
    (cfg.emergency_phone && cfg.emergency_phone.trim()) || EMERGENCY_PHONE;

  const promptHardcoded = lang.startsWith("en") ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_ES;
  const promptKey       = lang.startsWith("en") ? "system_prompt_en" : "system_prompt_es";
  const promptFromDb    = (cfg[promptKey] || "").trim();
  /* El prompt puede traer placeholders {{emergency_phone}} para que el
     admin lo edite sin necesidad de hard-codear el teléfono.                */
  const sysPrompt = (promptFromDb || promptHardcoded).replace(
    /\{\{\s*emergency_phone\s*\}\}/g,
    emergencyPhone,
  );
  /* Diagnóstico: nos dice si el bot está leyendo prompt de BD vs hardcoded
     y si el FASE 0 está presente. Si en producción aparece source=db pero
     has_fase0=false, hay un row stale en agent_config. */
  console.log(
    `[alma] prompt_source=${promptFromDb ? "db" : "hardcoded"} len=${sysPrompt.length} has_fase0=${sysPrompt.includes("FASE 0")} temp=${temperature}`,
  );

  const contents = historyToContents(input.history);
  contents.push({ role: "user", parts: [{ text: String(input.message || "") }] });

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
        generationConfig:  { temperature },
      });
    } catch (e) {
      out.events.push({ role: "model", hop, latency_ms: Date.now() - t0, error: e.message });
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

    /* Caso A: sin tool call → texto final al usuario. */
    if (funcCalls.length === 0) {
      out.output = textParts.join("\n").trim();
      out.events.push({ role: "model", hop, latency_ms, content: out.output });
      console.log(`[alma] hop=${hop} done text_len=${out.output.length} finalize=${out.finalize}`);
      return out;
    }

    /* Caso B: hay tool call(s). Guardamos turno del modelo + ejecutamos. */
    contents.push({ role: "model", parts });

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
        if (fc.name === "lookup_coverage") {
          result = await execLookupCoverage(fc.args || {}, env, db, emergencyPhone);
          /* Guardamos la cobertura confirmada para que chat.js la persista
             en chat_sessions.city/state.                                    */
          if (result.covered && result.location) {
            out.coverage = {
              covered: true,
              city:    result.location.city,
              state:   result.location.state,
            };
          } else if (!result.covered) {
            out.coverage = {
              covered: false,
              reason:  result.reason || "unknown",
            };
          }
        } else if (fc.name === "list_emergency_products") {
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
            out.customer       = fc.args && fc.args.customer ? fc.args.customer : null;
            out.productKeys    = fc.args && Array.isArray(fc.args.product_keys) ? fc.args.product_keys : null;
            out.notes          = fc.args && fc.args.notes || null;
            /* Datos del fallecido para persistencia. */
            out.deceased = {
              name:     (fc.args && fc.args.deceased_name)     || null,
              relation: (fc.args && fc.args.deceased_relation) || null,
              religion: (fc.args && fc.args.deceased_religion) || null,
              age:      (fc.args && fc.args.deceased_age)      || null,
              birth:    (fc.args && fc.args.deceased_birth)    || null,
            };
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
