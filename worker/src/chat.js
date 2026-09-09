/* =============================================================================
   /chat — orquesta el agente Alma (OpenAI) + persistencia en Supabase.

   Flujo por request:
     1. Carga/crea sesión en Supabase (chat_sessions).
     2. Carga historial desde chat_turns (memoria persistente). Si la BD no
        está disponible cae al `history` que mandó el frontend (fallback).
     3. Inserta el turno del usuario (background).
     4. Llama runAlma con el historial reconstruido.
     5. Persiste todos los events del agente (cada hop, tools, latencias) en
        background con waitUntil — no bloquea la respuesta al usuario.
     6. Si hubo cobertura/handoff, actualiza chat_sessions.metadata (JSON).

   Alma ya no factura (ver worker/src/alma.js) — el contrato de salida hacia
   el frontend es:
     { output, handoff?, partnerName?, partnerPhone?, waHandoffPhone?, waHandoffText?, error? }
   ============================================================================= */

import { runAlma } from "./alma.js";
import { createSupabase } from "./supabase.js";
import { ValidationError } from "./errors.js";
import { sanitizeAttribution } from "./attribution.js";
import { resolveTenant } from "./tenant.js";
import { trace } from "@opentelemetry/api";

/* Límites duros para evitar abuso de costos (cada mensaje al chat cuesta
   tokens de OpenAI) y para mantener Supabase saludable. Si un cliente
   legítimo necesita más espacio, levantarlos aquí.                          */
const MAX_SESSION_ID  = 128;
const MAX_MESSAGE     = 4000;
const MAX_HISTORY_LEN = 40;
const MAX_HISTORY_ITEM = 6000;

/* Convierte rows de chat_turns (con role 'user'/'model'/'tool') al formato
   {role, content} que espera alma.runAlma. Los turnos 'tool' se filtran
   porque son artifacts internos del loop, no historia conversacional.         */
function turnsToHistory(turns) {
  if (!Array.isArray(turns)) return [];
  return turns
    .filter((t) => (t.role === "user" || t.role === "model") && t.content)
    .map((t) => ({
      role:    t.role === "user" ? "user" : "assistant",
      content: t.content,
    }));
}

/* Resumen accionable para la persona de guardia cuando Alma deriva por
   WhatsApp. Se arma en el backend a partir de lo que ya capturamos (sin una
   llamada extra al LLM): datos de la derivación, cobertura, atribución y los
   últimos mensajes del usuario. Se guarda en chat_sessions.metadata.handoff_summary
   para que el panel de sesiones lo muestre. */
export function buildHandoffSummary({ result, history, message, lang, attribution }) {
  const wa  = result.waHandoff || {};
  const cov = result.coverage || null;
  const userMsgs = [
    ...(Array.isArray(history)
      ? history.filter((m) => m && m.role === "user" && m.content).map((m) => m.content)
      : []),
    message,
  ]
    .filter(Boolean)
    .slice(-3)
    .map((m) => `  - "${String(m).slice(0, 200)}"`);

  const lines = [
    "[Resumen para el asesor — generado automáticamente por Alma]",
    "Prioridad: alta (derivación en vivo por WhatsApp)",
    `Idioma: ${lang}`,
    `Nombre: ${wa.nombre || "no dado"}`,
    `Necesidad: ${wa.necesidad || "no especificada"}`,
  ];
  if (cov) {
    lines.push(
      `Cobertura: ${
        cov.covered
          ? `sí — ${[cov.city, cov.state].filter(Boolean).join(", ")}`
          : `no (${cov.reason || "sin aliado"})`
      }`,
    );
  }
  if (attribution?.codigo_vendedor) lines.push(`Vendedor (ref): ${attribution.codigo_vendedor}`);
  else if (attribution?.canal_origen) lines.push(`Canal de origen: ${attribution.canal_origen}`);
  lines.push("Últimos mensajes del usuario:", ...userMsgs);
  return lines.join("\n");
}

/* Persiste un array de events de alma en chat_turns. Cada event ya trae
   role, hop, latency_ms, tool_name/args/result y error según corresponda. */
async function persistEvents(db, sessionId, events, model) {
  if (!Array.isArray(events) || events.length === 0) return;
  /* Los hacemos en serie para preservar el orden de creación (id asc).
     Los inserts son baratos y un error individual no debe romper el resto.    */
  for (const ev of events) {
    try {
      await db.insertTurn({
        session_id:  sessionId,
        role:        ev.role,
        content:     ev.content || null,
        tool_name:   ev.tool_name || null,
        tool_args:   ev.tool_args || null,
        tool_result: ev.tool_result || null,
        model,
        hop:         typeof ev.hop === "number" ? ev.hop : null,
        latency_ms:  typeof ev.latency_ms === "number" ? ev.latency_ms : null,
        error:       ev.error || null,
      });
    } catch (e) {
      console.warn(`[chat] insertTurn failed: ${e.message}`);
    }
  }
}

export async function handleChat(body, env, executionCtx) {
  const { id: tenant } = resolveTenant(env);
  const otelSpan = trace.getActiveSpan();
  const sessionId = (body.sessionId || "").trim();
  const message   = (body.message || body.chatInput || "").trim();
  const lang      = (body.lang || "es").trim();
  const mode      = (body.mode || "emergency").trim();
  const rawHistory = Array.isArray(body.history) ? body.history : [];
  /* Atribución de vendedor/canal (?ref=). Viaja en cada turno; se usa para el
     lead de prospecto (create_lead), para el stub de atribución del handoff a
     WhatsApp, y para el texto pre-llenado que ve el humano de guardia. */
  const attribution = sanitizeAttribution(body.attribution);

  if (!sessionId) throw new ValidationError("sessionId requerido");
  if (!message)   throw new ValidationError("message requerido");
  if (sessionId.length > MAX_SESSION_ID) {
    throw new ValidationError(`sessionId excede ${MAX_SESSION_ID} caracteres`);
  }
  if (message.length > MAX_MESSAGE) {
    throw new ValidationError(`mensaje excede ${MAX_MESSAGE} caracteres`);
  }
  /* Truncamos historial defensivamente: si el frontend manda muchos turnos
     o turnos enormes, los limitamos para no inflar la llamada a OpenAI.     */
  const fallbackHistory = rawHistory.slice(-MAX_HISTORY_LEN).map((m) => ({
    role:    m && m.role ? String(m.role) : "user",
    content: m && m.content ? String(m.content).slice(0, MAX_HISTORY_ITEM) : "",
  }));

  const db = createSupabase(env);

  /* 1. Cargar (o crear) la sesión. upsertSession es idempotente. Guardamos la
        metadata previa para acumular el estado estructurado turno a turno
        (updateSession reemplaza la columna JSON, no la mergea). */
  let dbHistory = [];
  let prevMeta = {};
  try {
    const sess = await db.upsertSession({
      session_id: sessionId,
      lang,
      mode,
    });
    if (sess && sess.metadata && typeof sess.metadata === "object") prevMeta = sess.metadata;
    const turns = await db.listTurns(sessionId);
    dbHistory = turnsToHistory(turns);
  } catch (e) {
    console.warn(`[chat] BD no disponible: ${e.message}. Uso fallback history del frontend.`);
  }

  const history = dbHistory.length > 0 ? dbHistory : fallbackHistory;

  if (otelSpan) {
    otelSpan.setAttributes({
      "legado.tenant":       tenant,
      "legado.session_id":   sessionId,
      "legado.lang":         lang,
      "legado.mode":         mode,
      "legado.history_len":  history.length,
      "legado.history_from": dbHistory.length > 0 ? "db" : "frontend",
    });
  }

  console.log(
    `[chat] tenant=${tenant} session=${sessionId} hist=${history.length} (db=${dbHistory.length}, fb=${fallbackHistory.length}) msg="${message.slice(0, 80)}"`,
  );

  /* 2. Persistir turno del usuario en background. */
  const userTurnPromise = db
    .insertTurn({ session_id: sessionId, role: "user", content: message })
    .catch((e) => console.warn(`[chat] insertTurn(user) failed: ${e.message}`));
  if (executionCtx?.waitUntil) executionCtx.waitUntil(userTurnPromise);

  /* 3. Llamar al agente. Le pasamos el cliente db para que pueda ejecutar
        la tool lookup_coverage contra Supabase.                              */
  const result = await runAlma(
    { sessionId, message, history, lang, db, attribution },
    env,
    executionCtx,
  );

  if (otelSpan) {
    otelSpan.setAttributes({
      "legado.hops":     Array.isArray(result.events) ? result.events.length : 0,
      "legado.handoff":  !!result.waHandoff,
      "legado.lead":     !!result.lead,
      "legado.coverage": result.coverage
        ? (result.coverage.covered ? "covered" : "not_covered")
        : "none",
    });
  }

  /* 4. Persistir todos los events del agente + (si aplica) cobertura/handoff
        como metadata de la sesión. Alma ya no factura, así que no hay más
        columnas de invoice/customer/deceased que actualizar aquí — solo
        metadata (JSON) con lo que se resolvió en esta sesión.               */
  const persistPromise = (async () => {
    await persistEvents(db, sessionId, result.events, result.model);

    /* Estado estructurado acumulado en chat_sessions.metadata — alimenta el
       visor de sesiones del panel y le da contexto a la persona de guardia
       cuando hay una derivación. Se mergea sobre lo previo. */
    const meta = { ...prevMeta };
    meta.tenant            = tenant;
    meta.turn_count        = (Number(meta.turn_count) || 0) + 1;
    meta.last_user_message = message.slice(0, 500);
    meta.lang              = lang;
    meta.last_activity_at  = new Date().toISOString();

    if (attribution?.codigo_vendedor) meta.ref_code = attribution.codigo_vendedor;
    if (attribution?.canal_origen)    meta.canal_origen = attribution.canal_origen;

    if (result.coverage) {
      meta.coverage = result.coverage.covered ? "covered" : "not_covered";
      if (result.coverage.city)   meta.coverage_city   = result.coverage.city;
      if (result.coverage.state)  meta.coverage_state  = result.coverage.state;
      if (result.coverage.reason) meta.coverage_reason = result.coverage.reason;
    }
    if (result.handoff) {
      meta.handoff_partner_name  = result.handoff.partnerName  || null;
      meta.handoff_partner_phone = result.handoff.partnerPhone || null;
    }
    if (result.waHandoff) {
      meta.handoff_done     = true;
      meta.handoff_at       = meta.handoff_at || new Date().toISOString();
      meta.wa_handoff_phone = result.waHandoff.phone || null;
      meta.handoff_summary  = buildHandoffSummary({ result, history, message, lang, attribution });
    }
    if (result.lead) {
      meta.lead_done        = true;
      meta.lead_at          = meta.lead_at || new Date().toISOString();
      meta.lead_tipo        = result.lead.tipo || null;
      meta.lead_plan_id     = result.lead.planId ?? null;
      meta.lead_servicio_id = result.lead.servicioId ?? null;
      /* Consentimiento: create_lead solo se llama tras la aceptación explícita
         del usuario en el chat (PROCESO C del prompt). Dejamos constancia. */
      meta.lead_consent     = "in_chat";
      meta.lead_consent_at  = meta.lead_consent_at || new Date().toISOString();
    }

    await db
      .updateSession(sessionId, { metadata: meta })
      .catch((e) => console.warn(`[chat] updateSession(metadata) failed: ${e.message}`));
  })();
  if (executionCtx?.waitUntil) {
    executionCtx.waitUntil(persistPromise);
  } else {
    await persistPromise;
  }

  /* 5. Devolver al frontend el contrato (sin `events` para no inflar response). */
  return {
    output:        result.output,
    handoff:       !!result.handoff || undefined,
    partnerName:   result.handoff?.partnerName  || undefined,
    partnerPhone:  result.handoff?.partnerPhone || undefined,
    waHandoffPhone: result.waHandoff?.phone || undefined,
    waHandoffText:  result.waHandoff?.text  || undefined,
  };
}
