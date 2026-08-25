/* =============================================================================
   Agente Alma — OpenAI (gpt-5.6-luna) con function calling.

   Entrada (de chat.js):  { sessionId, message, history, lang, db }
   Salida (a chat.js):    { output, handoff?, waHandoff?, lead?, coverage?, events:[...] }

   Tools que el modelo puede invocar:
     - lookup_coverage(city)      → aliado funerario activo en la ciudad (emergencia
                                     con fallecimiento confirmado). Si no hay aliado,
                                     Alma recolecta nombre+necesidad y deriva por
                                     handoff_whatsapp en vez de solo dar un teléfono.
     - list_planes()              → catálogo vigente de planes de previsión (API
                                     pública de Prevision-Funeraria, tenant `lh`).
     - list_servicios()           → catálogo de servicios sueltos + el WhatsApp de
                                     emergencia oficial del tenant.
     - handoff_whatsapp(nombre, necesidad) → deriva a un humano por WhatsApp con el
                                     mensaje pre-llenado. Solo para urgencias reales.
     - create_lead(...)           → registra un prospecto (POST /solicitudes) para
                                     consultas informativas que NO son urgentes.

   Alma sigue sin cotizar ni facturar: identificar cobertura/plan/servicio y
   conectar (por WhatsApp si es urgente, por prospecto si es informativo) — eso
   lo hace un aliado o un asesor humano, no el bot.

   `events` se devuelve para que chat.js los escriba en Supabase (chat_turns).
   ============================================================================= */

import { createPF } from "./prevision-api.js";

const OPENAI_BASE = "https://api.openai.com/v1/chat/completions";
const MAX_TOOL_HOPS = 8;
const LLM_TIMEOUT_MS = 30000;

/* Teléfono textual de ÚLTIMO recurso — solo si handoff_whatsapp falla por un
   error técnico y no se puede ni siquiera armar el link de WhatsApp. */
const EMERGENCY_PHONE = "0414-XXX-XXXX";

/* Fallback si /api/public/t/lh/servicios no responde. En condiciones normales
   Alma SIEMPRE confirma este número contra la API (whatsapp_emergencia) antes
   de derivar, para no quedar desactualizada si el staff lo cambia desde el
   panel admin de Prevision-Funeraria. */
const DEFAULT_WHATSAPP_EMERGENCIA = "584246950136";

/* ── System prompt ────────────────────────────────────────────────────────── */
const SYSTEM_PROMPT_ES = `Eres Alma, asistente virtual de LEGADO — la marca que une a Funeraria del Zulia (funerales desde 1944), Familias Protegidas (previsión funeraria) y Crematorios del Zulia. Atiendes principalmente a venezolanos en Estados Unidos con familia en Venezuela, y a cualquier visitante del sitio.

Tu personalidad y límites siguen docs/GUIA_INTERACCION_BOT_LEGADO.md: cercana, empática, transparente, nunca vendedora agresiva, nunca presupone un fallecimiento ni una urgencia sin que el usuario lo diga.

══════════════════════════════════════════
FASE 0 — CLASIFICA ANTES DE RESPONDER
══════════════════════════════════════════
Clasifica el mensaje del usuario en una de estas categorías. Leer mal el contexto (asumir duelo o urgencia sin evidencia) es peor que ser neutral.

(A) DUELO ACTIVO — el usuario dice EXPLÍCITAMENTE que alguien falleció ("se nos fue", "falleció", "una emergencia funeraria", "perdí a mi...").
    → Aplica REGLA #1 (primer turno sagrado). Luego PROCESO A.

(B) URGENCIA SIN FALLECIMIENTO CONFIRMADO — pide hablar con alguien YA, dice que es urgente, o describe una situación que necesita atención inmediata sin mencionar un fallecimiento.
    → PROCESO B (handoff directo por WhatsApp, sin pasar por cobertura de ciudad).

(C) CONSULTA INFORMATIVA — pregunta por planes de previsión, precios, servicios, cobertura o cómo funciona algo, sin urgencia.
    → PROCESO C (catálogo real vía tools + prospecto opcional). NUNCA digas "lamento tu pérdida" aquí.

(D) SALUDO NEUTRO / AMBIGUO — "Hola", "buenas", "info", o cualquier mensaje sin contexto.
    → Saluda con calidez y ofrece el menú: previsión, servicios, orientación urgente, o hablar con alguien. NO presupongas duelo ni urgencia.

EJEMPLO saludo neutro (CORRECTO):
> Usuario: "Hola"
> Tú: "Hola, soy Alma, asistente de LEGADO. Puedo contarte sobre nuestros planes de previsión, sobre nuestros servicios, o ayudarte a comunicarte con alguien si lo necesitas ahora. ¿Qué te gustaría explorar?"

EJEMPLO consulta informativa (CORRECTO):
> Usuario: "¿Qué planes tienen?"
> Tú: (llamas list_planes primero, luego respondes con los planes reales, nombre y precio incluidos — nunca inventados).

══════════════════════════════════════════
REGLA #1 — EL PRIMER TURNO DE DUELO ES SAGRADO (SOLO CASO A)
══════════════════════════════════════════
Si y solo si clasificaste el contacto como (A) DUELO ACTIVO, en tu primer mensaje NUNCA jamás:
- Menciones precios, dólares, totales o costos.
- Listes planes, servicios o combinaciones.
- Llames ninguna tool.
- Pidas datos del contratante ni del fallecido más allá de lo que el usuario ya ofreció.

En el primer mensaje de duelo SOLO haces tres cosas:
1) Acoger el dolor con calidez genuina. ("Lamento muchísimo lo que estás viviendo. Mi más sentido pésame.")
2) Si el usuario mencionó datos (nombre del fallecido, ciudad, relación), reconocerlos con suavidad sin repetirlos como interrogatorio.
3) Ofrecer presencia, no transacciones. ("Estoy aquí para acompañarte. Cuando te sientas listo, vemos cómo ayudarte con los arreglos. No hay prisa.")

EJEMPLO duelo activo (CORRECTO):
> Usuario: "Mi madre María falleció en Caracas"
> Tú: "Lamento muchísimo lo que estás viviendo. Perder a una madre es un dolor inmenso. Veo que María estaba en Caracas — estoy aquí para acompañarte. Cuando te sientas listo, vemos cómo ayudarte con los arreglos. Tómate tu tiempo."

EJEMPLO duelo activo (INCORRECTO — NO HACER):
> "Lamento tu pérdida. Aquí tienes las opciones disponibles en Caracas: Cremación básica $300..."  ← MAL: cotizó en el primer turno.

══════════════════════════════════════════
TONO — SIEMPRE (docs/GUIA_INTERACCION_BOT_LEGADO.md §2)
══════════════════════════════════════════
- Cálida, cercana, respetuosa, confiable, profesional. Trata de "tú".
- Una sola pregunta útil por turno — nunca interrogatorios.
- Nunca inventes precios, cobertura, tiempos ni condiciones: si no lo sabes con certeza, dilo y ofrece verificarlo (con una tool o con un asesor).
- Nunca alarmista, nunca insistente, nunca culpabiliza.
- Llama al usuario por su nombre apenas lo sepas, con moderación.
- Español por defecto. Inglés solo si el usuario escribe en inglés.
- Formato de salida: HTML simple permitido (p, ul, li, strong, br). El markdown NO se renderiza.

══════════════════════════════════════════
MEMORIA — SIEMPRE
══════════════════════════════════════════
Antes de responder cada turno, relee el historial completo y extrae mentalmente todo dato que el usuario ya compartió: ciudad/estado, nombre y relación del fallecido (si aplica), plan o servicio que le interesa, si ya dejó nombre/teléfono, etc.

⚠️ REGLA INVIOLABLE: NUNCA preguntes algo que el usuario ya respondió. Confírmalo brevemente y avanza.

⚠️ Si el historial ya trae un primer mensaje tuyo (el saludo con el que abre el chat), NO te vuelvas a presentar ("Hola, soy Alma...") en tu respuesta — ya lo hiciste. Responde directo a lo que el usuario preguntó.

══════════════════════════════════════════
PROCESO A — DUELO ACTIVO (fallecimiento confirmado)
══════════════════════════════════════════
1. Acompaña (ver REGLA #1). No avances hasta que el usuario muestre que está listo (pregunta qué pueden hacer, cuánto cuesta, o pide ayuda con los arreglos).
2. Con suavidad, averigua ciudad y estado si no los tienes. Llama 'lookup_coverage' con esa ciudad UNA SOLA VEZ por sesión, apenas la sepas.
3. Si covered=true → toma el PRIMER aliado de partners[] (city antes que state) y entrégale su contacto con calidez: "Coordinaremos con [aliado], nuestra funeraria aliada en [ciudad]".
4. Si covered=false → discúlpate genuinamente por que esa zona aún no tiene aliado directo. En vez de solo recitar un teléfono genérico, ofrécete a conectarla tú misma: pide su nombre (si no lo tienes) y confirma en una frase la necesidad ("servicio funerario urgente para su madre en [ciudad]"), luego llama 'handoff_whatsapp'. Avísale con calidez que la vas a conectar por WhatsApp con el equipo de LEGADO.
5. Solo si hay cobertura confirmada, con delicadeza conoce algo del fallecido (nombre, relación, edad, rito) — uno a la vez, nunca todo junto, nunca si ya lo dijo.
6. Nunca cotices ni factures — eso lo hace el aliado o un asesor humano.

══════════════════════════════════════════
PROCESO B — URGENCIA SIN FALLECIMIENTO CONFIRMADO
══════════════════════════════════════════
1. Valida la urgencia con una frase breve, sin sobre-preguntar ni alarmarte.
2. Pide su nombre y, en una frase, cuál es su necesidad — no es un formulario, son dos datos.
3. Llama 'handoff_whatsapp(nombre, necesidad)' y avísale que la vas a conectar por WhatsApp con el equipo de LEGADO ahora mismo.
4. No pidas más datos que esos dos: esto no es un lead ni una compra, es una derivación directa a un humano.

══════════════════════════════════════════
PROCESO C — CONSULTA INFORMATIVA (previsión / servicios, sin urgencia)
══════════════════════════════════════════
1. Si pregunta por previsión/planes: llama 'list_planes' (una vez por sesión) y responde con datos reales — nombre, qué incluye, precio mensual/anual. Nunca inventes ni extrapoles precios que no vengan de la tool.
2. Si pregunta por servicios sueltos: llama 'list_servicios'. Si el catálogo viene vacío, dilo con naturalidad ("por ahora esos servicios se coordinan directamente con un asesor") sin inventar ítems.
3. Si un servicio devuelto tiene es_emergencia=true, no lo ofrezcas como prospecto — trátalo como categoría B (handoff directo por WhatsApp), tal como se le indicaría a un visitante del sitio.
4. Cuando el usuario muestre interés real en un plan o servicio específico (no solo curiosidad), ofrécete a anotar su interés para que un asesor la contacte MÁS ADELANTE — pero solo tras explicar para qué se usarán sus datos (docs/GUIA_INTERACCION_BOT_LEGADO.md §9) y con su aceptación explícita.
5. Si acepta: pide nombre, apellido y teléfono de contacto (el email es opcional), y llama 'create_lead' con el plan_id o servicio_id que ya conoces por list_planes/list_servicios.
6. Confirma con calidez que un asesor la contactará más adelante. NUNCA digas que la vas a conectar "ahora" con una persona de guardia ni le des un link de WhatsApp por esto — una consulta informativa queda registrada como prospecto, no escala a un humano en vivo.
7. Si en cualquier momento de este flujo el usuario pide hablar con alguien YA o expresa urgencia real, cambia a PROCESO B.

══════════════════════════════════════════
PROCESO D — SALUDO NEUTRO
══════════════════════════════════════════
Saluda, no presupongas nada, y pregunta en qué puedes ayudar (previsión, servicios, orientación urgente, o hablar con alguien).

══════════════════════════════════════════
REGLAS DURAS
══════════════════════════════════════════
- NUNCA cotices precios ni "combinaciones de servicios" que no vengan literal de 'list_planes'/'list_servicios'.
- NUNCA digas que vas a generar una factura, un link de pago o un cobro — eso es del wizard de compra del sitio, no de Alma.
- NUNCA uses 'handoff_whatsapp' para una consulta puramente informativa — para eso usa 'create_lead'.
- NUNCA uses 'create_lead' para una urgencia — para eso usa 'handoff_whatsapp'.
- 'list_planes', 'list_servicios' y 'lookup_coverage': como máximo una vez por sesión, salvo que el usuario pida explícitamente actualizar el dato.
- Sin cobertura confirmada en PROCESO A ni datos mínimos en PROCESO B → no derives por WhatsApp todavía, sigue preguntando el dato que falta.
- Teléfono de emergencia textual de ÚLTIMO recurso (solo si 'handoff_whatsapp' falla por un error técnico): ${EMERGENCY_PHONE}`;

const SYSTEM_PROMPT_EN = `You are Alma, LEGADO's virtual assistant — the brand behind Funeraria del Zulia (funeral services since 1944), Familias Protegidas (funeral pre-planning) and Crematorios del Zulia. You mostly serve Venezuelans in the USA with family in Venezuela, and any site visitor.

Your personality and limits follow docs/GUIA_INTERACCION_BOT_LEGADO.md: warm, empathetic, transparent, never a pushy salesperson, never presuming a death or an emergency unless the user says so.

══════════════════════════════════════════
PHASE 0 — CLASSIFY BEFORE REPLYING
══════════════════════════════════════════
(A) ACTIVE GRIEF — user explicitly says someone passed away. → RULE #1, then PROCESS A.
(B) URGENCY WITHOUT A CONFIRMED DEATH — user asks to talk to someone now / describes an urgent situation without mentioning a death. → PROCESS B (direct WhatsApp handoff, no city lookup).
(C) INFORMATIONAL QUERY — asks about pre-planning, prices, services, coverage, no urgency. → PROCESS C (real catalog via tools + optional lead). Never say "I'm sorry for your loss" here.
(D) NEUTRAL GREETING / AMBIGUOUS — greet warmly and offer the menu (pre-planning, services, urgent help, talk to someone). Never presume grief or urgency.

══════════════════════════════════════════
RULE #1 — THE FIRST GRIEF TURN IS SACRED (CASE A ONLY)
══════════════════════════════════════════
In your first message for an active-grief contact, NEVER mention prices, list services, call any tool, or ask for more data than the user already gave. Only: (1) hold the grief with genuine warmth, (2) softly acknowledge any details already shared, (3) offer presence, not transactions — arrangements can wait.

══════════════════════════════════════════
TONE — ALWAYS
══════════════════════════════════════════
Warm, close, respectful, reliable, professional. One useful question per turn. Never invent prices, coverage, timelines or conditions — say so and offer to verify (via a tool or a human advisor) instead. Never alarmist or pushy. Use their name once you know it, sparingly. English only if the user writes in English. HTML output allowed (p, ul, li, strong, br); markdown is not rendered.

══════════════════════════════════════════
MEMORY — ALWAYS
══════════════════════════════════════════
Before each reply, re-read the full history and never re-ask anything already answered. If the history already has your opening greeting, don't re-introduce yourself.

══════════════════════════════════════════
PROCESS A — ACTIVE GRIEF (confirmed death)
══════════════════════════════════════════
Hold the grief first (RULE #1). Once ready, gently learn city/state and call 'lookup_coverage' once. covered=true → use the FIRST partner in partners[] (city before state) and warmly share their contact. covered=false → apologize, then offer to connect them yourself: get their name and a one-line description of the need, then call 'handoff_whatsapp' instead of just reciting a generic phone number. Only with confirmed coverage, gently learn about the deceased (name, relation, age, faith) one at a time.

══════════════════════════════════════════
PROCESS B — URGENCY WITHOUT A CONFIRMED DEATH
══════════════════════════════════════════
Validate briefly, get their name and a one-line need, then call 'handoff_whatsapp(name, need)' and tell them you're connecting them via WhatsApp with the LEGADO team right now. Don't collect more than those two fields — this is a direct handoff, not a lead.

══════════════════════════════════════════
PROCESS C — INFORMATIONAL QUERY (pre-planning / services, no urgency)
══════════════════════════════════════════
Call 'list_planes' and/or 'list_servicios' (once per session) and answer only with real data from them — never invented prices. If a returned service has es_emergencia=true, treat it as PROCESS B instead of offering a lead. When the user shows real interest in a specific plan/service, explain what their data will be used for and, only with explicit acceptance, collect name, last name and phone (email optional) and call 'create_lead' with the plan_id/servicio_id you already know. Confirm warmly that an advisor will reach out later — never say you're connecting them "now" with someone on call for this; an informational query only becomes a recorded lead, never a live handoff. If urgency comes up at any point, switch to PROCESS B.

══════════════════════════════════════════
PROCESS D — NEUTRAL GREETING
══════════════════════════════════════════
Greet warmly, presume nothing, offer the menu (pre-planning, services, urgent help, talk to someone).

HARD RULES
- NEVER quote prices or "service combinations" not literally returned by 'list_planes'/'list_servicios'.
- NEVER say you'll generate an invoice or payment link — that's the site's purchase wizard, not Alma.
- NEVER use 'handoff_whatsapp' for a purely informational query — use 'create_lead' instead.
- NEVER use 'create_lead' for an urgency — use 'handoff_whatsapp' instead.
- 'list_planes' / 'list_servicios' / 'lookup_coverage': at most once per session unless the user explicitly asks to refresh.
- Last-resort textual emergency phone (only if 'handoff_whatsapp' fails technically): ${EMERGENCY_PHONE}`;

/* ── Tool definitions (OpenAI function-calling schema) ───────────────────── */
const TOOLS = [
  {
    type: "function",
    function: {
      name: "lookup_coverage",
      description:
        "Verifica si una ciudad de Venezuela tiene un aliado funerario activo. Úsala SOLO en un caso de duelo activo (fallecimiento confirmado), antes de dar contacto de ningún aliado. Devuelve covered:true/false y, si hay cobertura, la lista de aliados disponibles con su teléfono.",
      parameters: {
        type: "object",
        properties: {
          city: {
            type: "string",
            description:
              "Ciudad de Venezuela donde está la familia (ej: 'Caracas', 'Maracaibo'). El sistema hace match tolerante a mayúsculas.",
          },
        },
        required: ["city"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_planes",
      description:
        "Devuelve el catálogo vigente de planes de previsión funeraria de LEGADO (nombre, descripción, precio mensual/anual) desde la API pública de Prevision-Funeraria. Úsala antes de responder cualquier pregunta sobre planes o precios de previsión — nunca inventes esos datos. Como máximo una vez por sesión salvo que el usuario pida verlo de nuevo.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_servicios",
      description:
        "Devuelve el catálogo vigente de servicios funerarios individuales (si hay publicados) y el número de WhatsApp de emergencia oficial vigente del tenant. Úsala antes de responder sobre servicios sueltos (no planes), o para confirmar el WhatsApp de emergencia antes de llamar a handoff_whatsapp.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "handoff_whatsapp",
      description:
        "Deriva la conversación a un humano de LEGADO por WhatsApp, pre-llenando el mensaje con el nombre y la necesidad de la persona. Úsala SOLO cuando: (a) hay una urgencia real y la persona quiere hablar con alguien ya, o (b) hay un fallecimiento activo pero lookup_coverage no encontró aliado en su ciudad/estado. NUNCA para consultas puramente informativas — para esas usa create_lead.",
      parameters: {
        type: "object",
        properties: {
          nombre: {
            type: "string",
            description: "Nombre de la persona (vacío si aún no lo dio).",
          },
          necesidad: {
            type: "string",
            description:
              "Resumen breve, en una frase, de lo que necesita (ej: 'servicio funerario urgente para su madre en Coro').",
          },
        },
        required: ["necesidad"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_lead",
      description:
        "Registra a la persona como prospecto (interesado, no cliente ni contrato) en el sistema de LEGADO, asociado a un plan o servicio específico. Úsala SOLO para consultas informativas donde la persona acepta dejar sus datos para que un asesor la contacte más adelante (no urgente). Requiere haber llamado antes a list_planes o list_servicios para conocer el id correcto. Nunca la uses para una urgencia — en ese caso usa handoff_whatsapp.",
      parameters: {
        type: "object",
        properties: {
          nombres:   { type: "string" },
          apellidos: { type: "string" },
          telefono:  { type: "string", description: "Teléfono o WhatsApp de contacto, con código de país si lo dio." },
          email:     { type: "string", description: "Opcional." },
          tipo:      { type: "string", enum: ["plan", "servicio"], description: "Sobre qué está interesada la persona." },
          plan_id:     { type: "number", description: "id del plan (de list_planes) cuando tipo='plan'." },
          servicio_id: { type: "number", description: "id del servicio (de list_servicios) cuando tipo='servicio'." },
          mensaje: { type: "string", description: "Opcional, nota breve de contexto." },
        },
        required: ["nombres", "apellidos", "telefono", "tipo"],
      },
    },
  },
];

/* ── HTTP helper ─────────────────────────────────────────────────────────── */
async function callOpenAI(model, apiKey, payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  try {
    const r = await fetch(OPENAI_BASE, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body:   JSON.stringify({ model, ...payload }),
      signal: controller.signal,
    });
    const text = await r.text();
    let parsed = text;
    try { parsed = text ? JSON.parse(text) : null; } catch (_) { /* keep text */ }
    if (!r.ok) {
      const detail = typeof parsed === "object" ? JSON.stringify(parsed) : String(parsed);
      throw new Error(`OpenAI ${r.status}: ${detail}`);
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
        message:         `No reconozco la ciudad "${city}". Si crees que es un error, indica el estado de Venezuela o deriva por handoff_whatsapp.`,
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
        message:         `${loc.city}, ${loc.state} todavía no tiene un aliado funerario activo (ni a nivel ciudad ni a nivel estado). Recolecta nombre+necesidad y deriva por handoff_whatsapp.`,
      };
    }
    return {
      covered:  true,
      location: { state: loc.state, city: loc.city, is_capital: !!loc.is_capital },
      partners: partners.map((p) => ({
        name:     p.name,
        brand:    p.brand,
        phone:    p.phone || null,   // usado para el handoff, no hay cotización/factura
        services: p.services || [],
        scope:    p.scope,   // 'city' = directo en la ciudad; 'state' = cubre todo el estado
      })),
    };
  } catch (e) {
    console.warn(`[alma] lookup_coverage error: ${e.message}`);
    /* Fail-CLOSED: si no podemos verificar cobertura, NO asumimos que existe.
       El bot debe pedir disculpas y derivar por handoff_whatsapp igual que en
       un no_active_partner. */
    return {
      covered:         false,
      reason:          "verification_failed",
      emergency_phone: emergencyPhone,
      message:         `No pude verificar la cobertura en este momento por un error técnico. Recolecta nombre+necesidad y deriva por handoff_whatsapp. NO factures.`,
    };
  }
}

async function execListPlanes(env, lang) {
  try {
    const pf = createPF(env);
    const idioma = lang.startsWith("en") ? "en" : undefined;
    const resp = await pf.getPlanes(idioma);
    const items = (Array.isArray(resp?.items) ? resp.items : []).map((p) => ({
      id:                p.id,
      slug:              p.slug,
      nombre:            p.nombre,
      descripcion:       p.descripcion,
      descripcion_larga: p.descripcion_detallada || null,
      moneda:            p.moneda,
      precio_mensual: typeof p.precio_mensual_centavos === "number"
        ? (p.precio_mensual_centavos / 100).toFixed(2) : null,
      precio_anual: typeof p.precio_anual_centavos === "number"
        ? (p.precio_anual_centavos / 100).toFixed(2) : null,
    }));
    return { items };
  } catch (e) {
    console.warn(`[alma] list_planes error: ${e.message}`);
    return {
      items: [],
      error: "No se pudo consultar el catálogo de planes por un error técnico. No inventes precios ni coberturas — dile al usuario que hubo un problema y ofrece reintentar o dejar sus datos.",
    };
  }
}

async function execListServicios(env, lang) {
  try {
    const pf = createPF(env);
    const idioma = lang.startsWith("en") ? "en" : undefined;
    const resp = await pf.getServicios(idioma);
    const items = (Array.isArray(resp?.items) ? resp.items : []).map((s) => ({
      id:            s.id,
      slug:          s.slug,
      nombre:        s.nombre,
      descripcion:   s.descripcion,
      moneda:        s.moneda,
      precio: typeof s.precio_centavos === "number"
        ? (s.precio_centavos / 100).toFixed(2) : null,
      es_emergencia: !!s.es_emergencia,
    }));
    return { items, whatsapp_emergencia: resp?.whatsapp_emergencia || null };
  } catch (e) {
    console.warn(`[alma] list_servicios error: ${e.message}`);
    return {
      items: [],
      whatsapp_emergencia: null,
      error: "No se pudo consultar el catálogo de servicios por un error técnico.",
    };
  }
}

/* Arma el mensaje pre-llenado del link de WhatsApp. Se construye en el
   backend (no lo redacta el modelo) para no depender de que el LLM escape
   bien la URL — el frontend solo hace encodeURIComponent sobre este texto. */
function buildWhatsAppText(lang, nombre, necesidad) {
  const quien = nombre && String(nombre).trim()
    ? String(nombre).trim()
    : (lang.startsWith("en") ? "a visitor" : "un visitante");
  if (lang.startsWith("en")) {
    return `Hi, I'm ${quien}. I was chatting with Alma (LEGADO's assistant) about: ${necesidad}. I'd like to talk to someone now.`;
  }
  return `Hola, soy ${quien}. Estuve conversando con Alma (asistente de LEGADO) sobre: ${necesidad}. Me gustaría hablar con alguien ahora.`;
}

async function execHandoffWhatsapp(args, env, lang) {
  const nombre    = (args && args.nombre) ? String(args.nombre).trim() : "";
  const necesidad = (args && args.necesidad) ? String(args.necesidad).trim() : "";
  if (!necesidad) {
    return { ok: false, error: "Falta 'necesidad' — pregúntale en una frase qué necesita antes de derivar." };
  }
  /* Confirmamos el WhatsApp vigente contra la API (el staff puede cambiarlo
     desde el panel de Prevision-Funeraria) — el número fijo es solo fallback
     si la API no responde. */
  let phone = DEFAULT_WHATSAPP_EMERGENCIA;
  try {
    const pf = createPF(env);
    const resp = await pf.getServicios();
    if (resp && resp.whatsapp_emergencia) phone = resp.whatsapp_emergencia;
  } catch (e) {
    console.warn(`[alma] handoff_whatsapp: no se pudo confirmar whatsapp_emergencia, uso fallback: ${e.message}`);
  }
  const digits = String(phone).replace(/[^\d]/g, "");
  const text = buildWhatsAppText(lang, nombre, necesidad);
  return { ok: true, phone: digits, text };
}

async function execCreateLead(args, env) {
  const a = args || {};
  const tipo      = a.tipo === "servicio" ? "servicio" : "plan";
  const nombres   = String(a.nombres || "").trim();
  const apellidos = String(a.apellidos || "").trim();
  const telefono  = String(a.telefono || "").trim();
  if (!nombres || !apellidos || !telefono) {
    return { ok: false, error: "Faltan nombres, apellidos o teléfono — pídeselos al usuario de forma natural (no como error técnico) antes de reintentar." };
  }
  const body = { tipo, nombres, apellidos, telefono };
  if (a.email)   body.email   = String(a.email).trim();
  if (a.mensaje) body.mensaje = String(a.mensaje).trim();
  if (tipo === "plan") {
    if (!a.plan_id) {
      return { ok: false, error: "Falta plan_id — usa list_planes y confirma con el usuario cuál plan le interesa antes de registrar el prospecto." };
    }
    body.plan_id = Number(a.plan_id);
  } else {
    if (!a.servicio_id) {
      return { ok: false, error: "Falta servicio_id — usa list_servicios y confirma con el usuario cuál servicio le interesa antes de registrar el prospecto." };
    }
    body.servicio_id = Number(a.servicio_id);
  }
  try {
    const pf = createPF(env);
    const resp = await pf.crearSolicitud(body);
    return { ok: true, solicitud_id: resp?.id ?? resp?.solicitud_id ?? null, tipo, plan_id: body.plan_id ?? null, servicio_id: body.servicio_id ?? null };
  } catch (e) {
    console.warn(`[alma] create_lead error: ${e.message}`);
    return { ok: false, error: `No se pudo registrar el prospecto por un error técnico (${e.message}). Discúlpate y ofrece reintentar u otro medio de contacto.` };
  }
}

/* ── Conversión historial → messages de OpenAI ───────────────────────────── */
function historyToMessages(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => m && m.content && (m.role === "user" || m.role === "assistant" || m.role === "model"))
    .map((m) => ({
      role:    (m.role === "user") ? "user" : "assistant",
      content: String(m.content),
    }));
}

/* ── Entry point ─────────────────────────────────────────────────────────── */
export async function runAlma(input, env, executionCtx) {
  const apiKey = (env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY no configurado en el Worker");
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

  const model = (cfg.model && cfg.model.trim()) || env.OPENAI_MODEL || "gpt-5.6-luna";
  if (/^gemini/i.test(model)) {
    console.warn(`[alma] agent_config.model="${model}" parece un modelo de Gemini — Alma ahora llama a OpenAI, actualiza el valor desde el panel admin.`);
  }
  const temperature = (() => {
    const t = parseFloat(cfg.temperature);
    return Number.isFinite(t) ? t : 0.3;
  })();
  const emergencyPhone =
    (cfg.emergency_phone && cfg.emergency_phone.trim()) || EMERGENCY_PHONE;

  const promptHardcoded = lang.startsWith("en") ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_ES;
  const promptKey       = lang.startsWith("en") ? "system_prompt_en" : "system_prompt_es";
  const promptFromDb    = (cfg[promptKey] || "").trim();
  const sysPrompt = (promptFromDb || promptHardcoded).replace(
    /\{\{\s*emergency_phone\s*\}\}/g,
    emergencyPhone,
  );
  console.log(
    `[alma] prompt_source=${promptFromDb ? "db" : "hardcoded"} len=${sysPrompt.length} has_fase0=${sysPrompt.includes("FASE 0") || sysPrompt.includes("PHASE 0")} model=${model} temp=${temperature}`,
  );

  const messages = [
    { role: "system", content: sysPrompt },
    ...historyToMessages(input.history),
    { role: "user", content: String(input.message || "") },
  ];

  const out = {
    output: "",
    model,
    events: [],
  };

  for (let hop = 0; hop < MAX_TOOL_HOPS; hop++) {
    const t0 = Date.now();
    let resp;
    try {
      resp = await callOpenAI(model, apiKey, {
        messages,
        tools:       TOOLS,
        temperature,
      });
    } catch (e) {
      out.events.push({ role: "model", hop, latency_ms: Date.now() - t0, error: e.message });
      throw e;
    }
    const latency_ms = Date.now() - t0;

    const choice = resp.choices && resp.choices[0];
    if (!choice) {
      const msg = `OpenAI sin choices: ${JSON.stringify(resp)}`;
      out.events.push({ role: "model", hop, latency_ms, error: msg });
      throw new Error(msg);
    }
    const assistantMsg = choice.message || {};
    const toolCalls = Array.isArray(assistantMsg.tool_calls) ? assistantMsg.tool_calls : [];

    /* Caso A: sin tool call → texto final al usuario. */
    if (toolCalls.length === 0) {
      out.output = String(assistantMsg.content || "").trim();
      out.events.push({ role: "model", hop, latency_ms, content: out.output });
      console.log(`[alma] hop=${hop} done text_len=${out.output.length} handoff=${!!out.handoff} waHandoff=${!!out.waHandoff} lead=${!!out.lead}`);
      return out;
    }

    /* Caso B: hay tool call(s). Guardamos turno del modelo + ejecutamos. */
    messages.push(assistantMsg);

    for (const tc of toolCalls) {
      let args = {};
      try { args = JSON.parse(tc.function?.arguments || "{}"); } catch (_) { /* args queda {} */ }
      out.events.push({
        role:       "model",
        hop,
        latency_ms,
        tool_name:  tc.function?.name,
        tool_args:  args,
        content:    assistantMsg.content || null,
      });
    }

    for (const tc of toolCalls) {
      const name = tc.function?.name;
      let args = {};
      try { args = JSON.parse(tc.function?.arguments || "{}"); } catch (_) { /* args queda {} */ }
      console.log(`[alma] hop=${hop} tool=${name}`);
      const tt0 = Date.now();
      let result, toolError = null;
      try {
        if (name === "lookup_coverage") {
          result = await execLookupCoverage(args, env, db, emergencyPhone);
          if (result.covered && result.location) {
            out.coverage = {
              covered: true,
              city:    result.location.city,
              state:   result.location.state,
            };
            const partner = (result.partners || [])[0];
            if (partner) {
              out.handoff = {
                partnerName:  partner.name,
                partnerPhone: partner.phone || null,
              };
            }
          } else if (!result.covered) {
            out.coverage = {
              covered: false,
              reason:  result.reason || "unknown",
            };
          }
        } else if (name === "list_planes") {
          result = await execListPlanes(env, lang);
        } else if (name === "list_servicios") {
          result = await execListServicios(env, lang);
        } else if (name === "handoff_whatsapp") {
          result = await execHandoffWhatsapp(args, env, lang);
          if (result.ok) {
            out.waHandoff = { phone: result.phone, text: result.text };
          }
        } else if (name === "create_lead") {
          result = await execCreateLead(args, env);
          if (result.ok) {
            out.lead = { tipo: result.tipo, planId: result.plan_id, servicioId: result.servicio_id };
          }
        } else {
          result = { error: `Tool desconocida: ${name}` };
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
        tool_name:   name,
        tool_args:   args,
        tool_result: result,
        error:       toolError,
      });
      messages.push({
        role:         "tool",
        tool_call_id: tc.id,
        content:      JSON.stringify(result),
      });
    }
  }

  const msg = `Tool use no convergió en ${MAX_TOOL_HOPS} hops`;
  out.events.push({ role: "model", error: msg });
  throw new Error(msg);
}
