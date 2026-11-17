import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { handleChat, capHistory, MAX_TURNS_PER_SESSION } from "../src/chat.js";
import { _retryTiming } from "../src/alma.js";
import { mockFetch, jsonResponse, isOpenAI, isSupabase } from "./helpers.mjs";

let m;
beforeEach(() => { _retryTiming.baseDelayMs = 1; _retryTiming.maxDelayMs = 5; });
afterEach(() => m && m.restore());

const SUPA_ENV = {
  OPENAI_API_KEY: "sk-test",
  SUPABASE_URL: "https://x.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "srk",
};
/* waitUntil síncrono para poder inspeccionar lo persistido. */
const ctx = () => { const ps = []; return { waitUntil: (p) => ps.push(p), done: () => Promise.all(ps) }; };

test("si OpenAI falla tras los reintentos, responde con el WhatsApp de guardia", async () => {
  m = mockFetch([[isOpenAI, () => jsonResponse({ error: {} }, 503)]]);
  const r = await handleChat({ sessionId: "s1", message: "mi papá falleció", lang: "es" }, { OPENAI_API_KEY: "k" }, ctx());
  assert.equal(r.degraded, true);
  assert.equal(r.waHandoffPhone, "584246677030");
  assert.ok(r.waHandoffText);
  assert.match(r.output, /WhatsApp/);
  assert.equal(m.calls.filter((c) => isOpenAI(c.url)).length, 3);
});

test("la falla queda registrada en la sesión sin marcarla como derivación", async () => {
  let patched = null;
  m = mockFetch([
    [isOpenAI, () => jsonResponse({ error: {} }, 500)],
    [(u, i) => isSupabase(u) && i.method === "PATCH", (u, i) => { patched = JSON.parse(i.body); return jsonResponse([{}]); }],
    [(u) => isSupabase(u) && u.includes("/chat_sessions"), () => jsonResponse([{ metadata: {} }])],
    [isSupabase, () => jsonResponse([])],
  ]);
  const c = ctx();
  await handleChat({ sessionId: "s2", message: "hola", lang: "en" }, SUPA_ENV, c);
  await c.done();
  assert.equal(patched.metadata.degraded_count, 1);
  assert.ok(!patched.metadata.handoff_done);
  assert.match(patched.metadata.last_error, /OpenAI 500/);
});

test(`pasados ${MAX_TURNS_PER_SESSION} mensajes en la conversación no se llama a OpenAI`, async () => {
  m = mockFetch([
    [isOpenAI, () => { throw new Error("no debería llamarse"); }],
    [(u) => isSupabase(u) && u.includes("/chat_sessions"), () => jsonResponse([{ metadata: { turn_count: MAX_TURNS_PER_SESSION } }])],
    [isSupabase, () => jsonResponse([])],
  ]);
  const r = await handleChat({ sessionId: "s3", message: "otra pregunta", lang: "es" }, SUPA_ENV, ctx());
  assert.equal(r.rateLimited, true);
  assert.equal(r.waHandoffPhone, "584246677030");
  assert.equal(m.calls.filter((c) => isOpenAI(c.url)).length, 0);
});

test("el historial se pide a la BD acotado (últimos 40, solo conversación)", async () => {
  m = mockFetch([
    [isOpenAI, () => jsonResponse({ choices: [{ message: { content: "ok" } }] })],
    [(u) => isSupabase(u) && u.includes("/chat_sessions"), () => jsonResponse([{ metadata: {} }])],
    [isSupabase, () => jsonResponse([])],
  ]);
  await handleChat({ sessionId: "s4", message: "hola", lang: "es" }, SUPA_ENV, ctx());
  const q = m.calls.find((c) => c.url.includes("/chat_turns?") && c.method === "GET");
  assert.ok(q, "debe consultar chat_turns");
  assert.match(q.url, /limit=40/);
  assert.match(q.url, /order=id\.desc/);
  assert.match(q.url, /role=in\.\(user,model\)/);
});

test("el historial que va a OpenAI respeta el tope de caracteres", async () => {
  const big = Array.from({ length: 40 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "x".repeat(2000) }));
  const capped = capHistory(big);
  const total = capped.reduce((n, h) => n + h.content.length, 0);
  assert.ok(total <= 24000, `total=${total}`);
  assert.equal(capped.at(-1), big.at(-1), "conserva los turnos más recientes");
});
