import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { mockFetch, jsonResponse, isOpenAI } from "./helpers.mjs";

let m;
afterEach(() => m && m.restore());

const limiter = (allow) => ({ limit: async () => ({ success: allow }) });
const post = (path, body, headers = {}) =>
  new Request(`https://api.test${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "1.2.3.4", ...headers },
    body: JSON.stringify(body),
  });
const ctx = { waitUntil() {} };

test("/chat sobre el límite por IP: 429 con WhatsApp y sin llamar a OpenAI", async () => {
  m = mockFetch([[isOpenAI, () => { throw new Error("no debería llamarse"); }]]);
  const r = await worker.fetch(post("/chat", { sessionId: "s", message: "hola", lang: "es" }), { CHAT_IP_LIMITER: limiter(false), OPENAI_API_KEY: "k" }, ctx);
  assert.equal(r.status, 429);
  const d = await r.json();
  assert.equal(d.waHandoffPhone, "584246677030");
  assert.ok(d.output);
});

test("/chat: si el limitador falla, no bloquea (fail-open)", async () => {
  m = mockFetch([[isOpenAI, () => jsonResponse({ choices: [{ message: { content: "hola" } }] })]]);
  const broken = { limit: async () => { throw new Error("boom"); } };
  const r = await worker.fetch(post("/chat", { sessionId: "s", message: "hola" }), { CHAT_IP_LIMITER: broken, OPENAI_API_KEY: "k" }, ctx);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).output, "hola");
});

test("POST a una ruta desconocida ya no cae en el checkout", async () => {
  const r = await worker.fetch(post("/cualquier-cosa", { intent: "create_payment_intent" }), {}, ctx);
  assert.equal(r.status, 404);
});

test("el panel admin legacy ya no existe: /admin/* responde 404", async () => {
  const r = await worker.fetch(post("/admin/login", { token: "x" }), { ADMIN_TOKEN: "x" }, ctx);
  assert.equal(r.status, 404);
});
