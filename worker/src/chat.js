/* =============================================================================
   /chat — orquesta el agente Alma (OpenAI). Sin base de datos propia.

   Flujo por request:
     1. Valida y acota el historial que manda el frontend (la memoria de la
        conversación vive en el navegador: últimos turnos en cada request).
     2. Aplica el tope de mensajes por conversación (configurable en Previsión,
        parametros.max_mensajes_por_conversacion; 60 por defecto).
     3. Llama runAlma.
     4. Si Alma derivó a WhatsApp, registra la derivación en Previsión
        (POST /solicitudes) con el resumen para el asesor — en background.
        Los prospectos (create_lead) ya se registran en Previsión desde alma.js.

   Supabase (chat_sessions / chat_turns / agent_config) y el panel admin
   legacy se retiraron: lo operativo queda en Previsión.

   Contrato de salida hacia el frontend:
     { output, handoff?, partnerName?, partnerPhone?, waHandoffPhone?, waHandoffText?, degraded? }
   ============================================================================= */

import { runAlma, buildFallbackHandoff, resolveAsistente, resolveMaxTurns, registerHandoffSolicitud } from "./alma.js";
import { ValidationError } from "./errors.js";
import { sanitizeAttribution } from "./attribution.js";
import { resolveTenant } from "./tenant.js";
import { trace } from "@opentelemetry/api";

/* Límites duros para evitar abuso de costos (cada mensaje al chat cuesta
   tokens de OpenAI). Si un cliente legítimo necesita más, levantarlos aquí. */
const MAX_SESSION_ID  = 128;
const MAX_MESSAGE     = 4000;
const MAX_HISTORY_LEN = 40;
const MAX_HISTORY_ITEM = 6000;
/* Tope total de caracteres del historial que se manda a OpenAI (≈ 6k tokens).
   Se descartan primero los turnos más viejos. */
const MAX_HISTORY_CHARS = 24000;

const LIMIT_MSG = {
  es: "Hemos conversado bastante por aquí. Para seguir ayudándote como mereces, una persona de nuestro equipo puede atenderte ahora mismo por WhatsApp.",
  en: "We've been chatting for a while here. To keep helping you properly, someone from our team can assist you right now on WhatsApp.",
};
const DEGRADED_MSG = {
  es: "Lo siento, en este momento no puedo responder. Si necesitas ayuda ahora, nuestro equipo de guardia te atiende de inmediato por WhatsApp.",
  en: "I'm sorry, I can't respond right now. If you need help now, our on-call team can assist you immediately on WhatsApp.",
};
const pickLang = (lang) => (String(lang || "es").toLowerCase().startsWith("en") ? "en" : "es");

/* Respuesta sin pasar por OpenAI: texto + botón de WhatsApp de guardia. La
   usan el límite de uso (index.js y el tope por conversación) y la falla de Alma. */
export async function fallbackChatResponse(kind, lang, attribution, env) {
  const l = pickLang(lang);
  const wa = await buildFallbackHandoff(l, attribution, env);
  return {
    output:         (kind === "limit" ? LIMIT_MSG : DEGRADED_MSG)[l],
    waHandoffPhone: wa.phone,
    waHandoffText:  wa.text,
    ...(kind === "limit" ? { rateLimited: true } : { degraded: true }),
  };
}

/* Deja el historial dentro de MAX_HISTORY_CHARS quitando los turnos más
   viejos. Siempre conserva al menos el último. */
export function capHistory(history) {
  const out = [...history];
  let total = out.reduce((n, m) => n + String(m.content || "").length, 0);
  while (out.length > 1 && total > MAX_HISTORY_CHARS) {
    total -= String(out.shift().content || "").length;
  }
  return out;
}

/* Número de este mensaje dentro de la conversación. El frontend manda `turn`
   (cuenta todos los mensajes del usuario, aunque el historial que viaja esté
   recortado); si no viene, se cuenta lo que trae el historial. Lo puede
   falsear un cliente, igual que antes bastaba con abrir otra sesión: el freno
   real contra abuso es el límite por IP (index.js). */
export function turnNumber(body, history) {
  const fromHistory = history.filter((m) => m.role === "user").length + 1;
  const claimed = Number(body && body.turn);
  return Number.isInteger(claimed) && claimed > 0 ? Math.max(claimed, fromHistory) : fromHistory;
}

/* Resumen accionable para la persona de guardia cuando Alma deriva por
   WhatsApp. Se arma sin llamada extra al LLM a partir de lo ya capturado. Va
   como `mensaje` de la solicitud en Previsión (tope 2000 caracteres): primero
   los datos clave, al final los últimos mensajes del usuario (se recortan). */
const SUMMARY_MAX = 2000;
export function buildHandoffSummary({ result, history, message, lang, attribution }) {
  const wa  = result.waHandoff || {};
  const cov = result.coverage || null;
  const lines = [
    "[Derivación urgente a WhatsApp — Alma]",
    `Nombre: ${String(wa.nombre || "no dado").slice(0, 120)}`,
    `Necesidad: ${String(wa.necesidad || "no especificada").slice(0, 400)}`,
  ];
  if (cov) {
    lines.push(`Cobertura: ${
      cov.covered
        ? `sí — ${[cov.city, cov.state].filter(Boolean).join(", ")}`
        : `no (${cov.reason || "sin aliado"})`
    }`);
  }
  if (result.handoff?.partnerName) lines.push(`Aliado indicado: ${result.handoff.partnerName}`);
  if (attribution?.codigo_vendedor) lines.push(`Vendedor (ref): ${attribution.codigo_vendedor}`);
  else if (attribution?.canal_origen) lines.push(`Canal de origen: ${attribution.canal_origen}`);
  lines.push(`Idioma: ${lang}`);
  const head = lines.join("\n");
  const userMsgs = [
    ...(Array.isArray(history) ? history.filter((m) => m && m.role === "user" && m.content).map((m) => m.content) : []),
    message,
  ].filter(Boolean).slice(-5).map((m) => `- "${String(m).slice(0, 250)}"`);
  return `${head}\nÚltimos mensajes del usuario:\n${userMsgs.join("\n")}`.slice(0, SUMMARY_MAX);
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
     lead de prospecto (create_lead), para el registro de la derivación a
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
  const history = capHistory(
    rawHistory
      .slice(-MAX_HISTORY_LEN)
      .filter((m) => m && m.content)
      .map((m) => ({
        role:    m.role === "user" ? "user" : "assistant",
        content: String(m.content).slice(0, MAX_HISTORY_ITEM),
      })),
  );

  /* Tope por conversación, configurable en Previsión. resolveAsistente está
     cacheado: runAlma lo vuelve a pedir sin costo. */
  const maxTurns = resolveMaxTurns(await resolveAsistente(env));
  const turn = turnNumber(body, history);
  if (turn > maxTurns) {
    console.warn(`[chat] session=${sessionId} turno ${turn} supera el tope de ${maxTurns} — respuesta sin LLM`);
    return await fallbackChatResponse("limit", lang, attribution, env);
  }

  if (otelSpan) {
    otelSpan.setAttributes({
      "legado.tenant":      tenant,
      "legado.session_id":  sessionId,
      "legado.lang":        lang,
      "legado.mode":        mode,
      "legado.history_len": history.length,
      "legado.turn":        turn,
    });
  }

  console.log(
    `[chat] tenant=${tenant} session=${sessionId} turn=${turn}/${maxTurns} hist=${history.length} msg="${message.slice(0, 80)}"`,
  );

  /* Si Alma falla (OpenAI caído tras los reintentos, error interno), el
     usuario no recibe un error genérico: recibe el WhatsApp de guardia. */
  let result;
  try {
    result = await runAlma({ sessionId, message, history, lang, attribution }, env, executionCtx);
  } catch (e) {
    console.error(`[chat] Alma falló session=${sessionId}: ${e.message}`);
    const fb = await fallbackChatResponse("degraded", lang, attribution, env);
    result = {
      output:    fb.output,
      degraded:  true,
      waHandoff: { phone: fb.waHandoffPhone, text: fb.waHandoffText },
    };
  }

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

  /* Derivación hecha por Alma (no el botón de respaldo por falla) → queda
     registrada en Previsión con el resumen para el asesor. */
  if (result.waHandoff && !result.degraded) {
    const p = registerHandoffSolicitud(env, {
      nombre:  result.waHandoff.nombre,
      resumen: buildHandoffSummary({ result, history, message, lang, attribution }),
      attribution,
    });
    if (executionCtx?.waitUntil) executionCtx.waitUntil(p);
    else await p;
  }

  return {
    output:        result.output,
    handoff:       !!result.handoff || undefined,
    partnerName:   result.handoff?.partnerName  || undefined,
    partnerPhone:  result.handoff?.partnerPhone || undefined,
    waHandoffPhone: result.waHandoff?.phone || undefined,
    waHandoffText:  result.waHandoff?.text  || undefined,
    degraded:       result.degraded || undefined,
  };
}
