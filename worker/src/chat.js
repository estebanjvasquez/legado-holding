/* =============================================================================
   /chat — orquesta el agente Alma (Gemini) + persistencia en Supabase.

   Flujo por request:
     1. Carga/crea sesión en Supabase (chat_sessions).
     2. Carga historial desde chat_turns (memoria persistente). Si la BD no
        está disponible cae al `history` que mandó el frontend (fallback).
     3. Inserta el turno del usuario (background).
     4. Llama runAlma con el historial reconstruido.
     5. Persiste todos los events del agente (cada hop, tools, latencias) en
        background con waitUntil — no bloquea la respuesta al usuario.
     6. Si la conversación terminó en factura, actualiza chat_sessions con
        invoice + datos del cliente.

   El contrato de salida hacia el frontend es el MISMO que antes:
     { output, finalize?, invoiceNumber?, invitationLink?, total?,
       isNewClient?, error? }
   ============================================================================= */

import { runAlma } from "./alma.js";
import { createSupabase } from "./supabase.js";

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
  const sessionId = (body.sessionId || "").trim();
  const message   = (body.message || body.chatInput || "").trim();
  const lang      = (body.lang || "es").trim();
  const mode      = (body.mode || "emergency").trim();
  const fallbackHistory = Array.isArray(body.history) ? body.history : [];

  if (!sessionId) throw new Error("sessionId requerido");
  if (!message)   throw new Error("message requerido");

  const db = createSupabase(env);

  /* 1. Cargar (o crear) la sesión. upsertSession es idempotente. */
  let dbHistory = [];
  try {
    await db.upsertSession({
      session_id: sessionId,
      lang,
      mode,
    });
    const turns = await db.listTurns(sessionId);
    dbHistory = turnsToHistory(turns);
  } catch (e) {
    console.warn(`[chat] BD no disponible: ${e.message}. Uso fallback history del frontend.`);
  }

  const history = dbHistory.length > 0 ? dbHistory : fallbackHistory;

  console.log(
    `[chat] session=${sessionId} hist=${history.length} (db=${dbHistory.length}, fb=${fallbackHistory.length}) msg="${message.slice(0, 80)}"`,
  );

  /* 2. Persistir turno del usuario en background. */
  const userTurnPromise = db
    .insertTurn({ session_id: sessionId, role: "user", content: message })
    .catch((e) => console.warn(`[chat] insertTurn(user) failed: ${e.message}`));
  if (executionCtx?.waitUntil) executionCtx.waitUntil(userTurnPromise);

  /* 3. Llamar al agente. Le pasamos el cliente db para que pueda ejecutar
        la tool lookup_coverage contra Supabase.                              */
  const result = await runAlma(
    { sessionId, message, history, lang, db },
    env,
    executionCtx,
  );

  /* 4. Persistir todos los events del agente + (si aplica) actualizar
        chat_sessions con factura y datos del cliente.                          */
  const persistPromise = (async () => {
    await persistEvents(db, sessionId, result.events, result.model);
    if (result.finalize) {
      const c = result.customer || {};
      const d = result.deceased || {};
      await db
        .updateSession(sessionId, {
          finalized:          true,
          invoice_id:         result.invoiceId      || null,
          invoice_number:     result.invoiceNumber  || null,
          invoice_total:      result.total          ? Number(result.total) : null,
          invitation_link:    result.invitationLink || null,
          customer_email:     c.email     || null,
          customer_name:      c.name      || null,
          customer_phone:     c.phone     || null,
          customer_id_number: c.id_number || null,
          customer_address:   c.address   || null,
          product_keys:       result.productKeys || null,
          notes:              result.notes        || null,
          deceased_name:      d.name      || null,
          deceased_relation:  d.relation  || null,
          deceased_religion:  d.religion  || null,
          deceased_age:       d.age       || null,
          deceased_birth:     d.birth     || null,
        })
        .catch((e) => console.warn(`[chat] updateSession failed: ${e.message}`));
    } else if (result.coverage) {
      /* Aunque no haya finalize, persistimos la cobertura confirmada como
         metadata de la sesión — útil para analytics y para evitar repreguntas. */
      const meta = result.coverage.covered
        ? { coverage: "covered", coverage_city: result.coverage.city, coverage_state: result.coverage.state }
        : { coverage: "not_covered", coverage_reason: result.coverage.reason };
      await db
        .updateSession(sessionId, { metadata: meta })
        .catch((e) => console.warn(`[chat] updateSession(coverage) failed: ${e.message}`));
    }
  })();
  if (executionCtx?.waitUntil) {
    executionCtx.waitUntil(persistPromise);
  } else {
    await persistPromise;
  }

  if (result.finalize) {
    console.log(
      `[chat] finalize ok session=${sessionId} invoice=${result.invoiceNumber}`,
    );
  }

  /* 5. Devolver al frontend el contrato (sin `events` para no inflar response). */
  return {
    output:         result.output,
    finalize:       result.finalize || undefined,
    invoiceNumber:  result.invoiceNumber || undefined,
    invitationLink: result.invitationLink || undefined,
    total:          result.total || undefined,
    isNewClient:    result.isNewClient || undefined,
  };
}
