import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { handleChat, capHistory, turnNumber, buildHandoffSummary } from "../src/chat.js";
import { _retryTiming, _resetAsistenteCache, _resetEmergencyCache } from "../src/alma.js";
import { mockFetch, jsonResponse, isOpenAI } from "./helpers.mjs";

let m;
beforeEach(() => { _retryTiming.baseDelayMs = 1; _retryTiming.maxDelayMs = 5; _resetAsistenteCache(); _resetEmergencyCache(); });
afterEach(() => m && m.restore());

const ENV = { OPENAI_API_KEY: "sk-test", PF_TOKEN: "tok", PF_BASE: "https://pf.test" };
const isAsistente = (u) => u.endsWith("/asistente");
const isSolicitudes = (u) => u.endsWith("/solicitudes");
const asistente = (parametros = {}) => [isAsistente, () => jsonResponse({ configurado: true, proveedor: "openai", parametros })];
const servicios = [(u) => u.includes("/servicios"), () => jsonResponse({ whatsapp_emergencia: "+584246677030" })];
/* waitUntil que deja esperar lo que quedó en background. */
const ctx = () => { const ps = []; return { waitUntil: (p) => ps.push(p), done: () => Promise.all(ps) }; };

test("si OpenAI falla tras los reintentos, responde con el WhatsApp de guardia (y no registra derivación)", async () => {
  m = mockFetch([asistente(), servicios, [isOpenAI, () => jsonResponse({ error: {} }, 503)], [isSolicitudes, () => { throw new Error("no debería registrar"); }]]);
  const c = ctx();
  const r = await handleChat({ sessionId: "s1", message: "mi papá falleció", lang: "es" }, ENV, c);
  await c.done();
  assert.equal(r.degraded, true);
  assert.equal(r.waHandoffPhone, "584246677030");
  assert.ok(r.waHandoffText);
  assert.match(r.output, /WhatsApp/);
  assert.equal(m.calls.filter((x) => isOpenAI(x.url)).length, 3);
});

test("pasado el tope por defecto (60) no se llama a OpenAI", async () => {
  m = mockFetch([asistente(), servicios, [isOpenAI, () => { throw new Error("no debería llamarse"); }]]);
  const r = await handleChat({ sessionId: "s3", message: "otra", lang: "es", turn: 61 }, ENV, ctx());
  assert.equal(r.rateLimited, true);
  assert.equal(r.waHandoffPhone, "584246677030");
});

test("el tope sale de Previsión (parametros.max_mensajes_por_conversacion)", async () => {
  m = mockFetch([asistente({ max_mensajes_por_conversacion: "5" }), servicios, [isOpenAI, () => jsonResponse({ choices: [{ message: { content: "ok" } }] })]]);
  assert.equal((await handleChat({ sessionId: "s", message: "x", turn: 5 }, ENV, ctx())).output, "ok");
  const r = await handleChat({ sessionId: "s", message: "x", turn: 6 }, ENV, ctx());
  assert.equal(r.rateLimited, true);
});

test("un tope inválido en Previsión cae a 60", async () => {
  m = mockFetch([asistente({ max_mensajes_por_conversacion: "muchos" }), [isOpenAI, () => jsonResponse({ choices: [{ message: { content: "ok" } }] })]]);
  assert.equal((await handleChat({ sessionId: "s", message: "x", turn: 60 }, ENV, ctx())).output, "ok");
});

test("turnNumber: usa el `turn` del frontend, nunca menos que lo que muestra el historial", () => {
  const h = [{ role: "user", content: "a" }, { role: "assistant", content: "b" }, { role: "user", content: "c" }];
  assert.equal(turnNumber({}, h), 3);
  assert.equal(turnNumber({ turn: 40 }, h), 40);
  assert.equal(turnNumber({ turn: 1 }, h), 3);
  assert.equal(turnNumber({ turn: "x" }, []), 1);
});

test("la memoria es el historial del frontend (sin base de datos)", async () => {
  m = mockFetch([asistente(), [isOpenAI, () => jsonResponse({ choices: [{ message: { content: "ok" } }] })]]);
  await handleChat({ sessionId: "s4", message: "y ahora?", lang: "es", history: [{ role: "user", content: "hola" }, { role: "assistant", content: "hola, soy Alma" }] }, ENV, ctx());
  const msgs = m.calls.find((c) => isOpenAI(c.url)).body.messages;
  assert.deepEqual(msgs.slice(1).map((x) => x.role), ["user", "assistant", "user"]);
  assert.equal(msgs.at(-1).content, "y ahora?");
  assert.ok(m.calls.every((c) => !c.url.includes("supabase")));
});

test("una derivación a WhatsApp queda registrada en Previsión con el resumen, haya vendedor o no", async () => {
  let n = 0;
  m = mockFetch([
    asistente(), servicios,
    [isOpenAI, () => (++n === 1
      ? jsonResponse({ choices: [{ message: { content: null, tool_calls: [{ id: "t1", type: "function", function: { name: "handoff_whatsapp", arguments: JSON.stringify({ nombre: "Ana Pérez", necesidad: "traslado urgente en Mérida" }) } }] } }] })
      : jsonResponse({ choices: [{ message: { content: "Te conecto ahora" } }] }))],
    [isSolicitudes, () => jsonResponse({ id: 77 })],
  ]);
  const c = ctx();
  const r = await handleChat({ sessionId: "s5", message: "necesito ayuda ya", lang: "es" }, ENV, c);
  await c.done();
  assert.ok(r.waHandoffPhone);
  const sol = m.calls.filter((x) => isSolicitudes(x.url));
  assert.equal(sol.length, 1);
  assert.equal(sol[0].body.nombres, "Ana");
  assert.equal(sol[0].body.apellidos, "Pérez");
  assert.match(sol[0].body.mensaje, /Derivación urgente a WhatsApp/);
  assert.match(sol[0].body.mensaje, /traslado urgente en Mérida/);
  assert.match(sol[0].body.mensaje, /necesito ayuda ya/);
  assert.ok(sol[0].body.mensaje.length <= 500);
  assert.equal(sol[0].body.atribucion, undefined);
});

test("el resumen de la derivación nunca pasa de 500 caracteres y conserva los datos clave", () => {
  const s = buildHandoffSummary({
    result: { waHandoff: { necesidad: "x".repeat(400) }, coverage: { covered: false, reason: "no_active_partner" } },
    history: Array.from({ length: 5 }, () => ({ role: "user", content: "y".repeat(300) })),
    message: "z".repeat(300), lang: "es", attribution: { codigo_vendedor: "AB12CD34" },
  });
  assert.ok(s.length <= 500);
  assert.match(s, /Cobertura: no/);
  assert.match(s, /AB12CD34/);
});

test("el historial que va a OpenAI respeta el tope de caracteres", () => {
  const big = Array.from({ length: 40 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "x".repeat(2000) }));
  const capped = capHistory(big);
  const total = capped.reduce((n, h) => n + h.content.length, 0);
  assert.ok(total <= 24000, `total=${total}`);
  assert.equal(capped.at(-1), big.at(-1), "conserva los turnos más recientes");
});

test("el prospecto (create_lead) lleva la constancia de consentimiento dentro del tope de 500", async () => {
  let n = 0;
  const args = { tipo: "plan", plan_id: 2, nombres: "Ana", apellidos: "Pérez", telefono: "+13055550000", mensaje: "m".repeat(600) };
  m = mockFetch([
    asistente(), servicios,
    [isOpenAI, () => (++n === 1
      ? jsonResponse({ choices: [{ message: { content: null, tool_calls: [{ id: "t1", type: "function", function: { name: "create_lead", arguments: JSON.stringify(args) } }] } }] })
      : jsonResponse({ choices: [{ message: { content: "Listo" } }] }))],
    [isSolicitudes, () => jsonResponse({ id: 9 })],
  ]);
  const c = ctx();
  await handleChat({ sessionId: "s6", message: "sí, toma mis datos", lang: "es" }, ENV, c);
  await c.done();
  const sol = m.calls.filter((x) => isSolicitudes(x.url));
  assert.equal(sol.length, 1, "solo el prospecto, no una derivación");
  assert.match(sol[0].body.mensaje, /\[Consentimiento: aceptado en el chat del sitio \(Alma\), \d{4}-/);
  assert.ok(sol[0].body.mensaje.length <= 500);
});
