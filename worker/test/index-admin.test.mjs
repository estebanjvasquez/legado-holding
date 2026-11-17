import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { tokensMatch } from "../src/admin.js";
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

test("tokensMatch compara bien y rechaza vacíos", async () => {
  assert.equal(await tokensMatch("abc", "abc"), true);
  assert.equal(await tokensMatch("abc", "abd"), false);
  assert.equal(await tokensMatch("", ""), false);
  assert.equal(await tokensMatch("abc", ""), false);
});

test("panel: login con el ADMIN_TOKEN correcto entra; con otro, 401", async () => {
  const env = { ADMIN_TOKEN: "secreto-largo", ADMIN_LOGIN_LIMITER: limiter(true) };
  const ok = await worker.fetch(post("/admin/login", { token: "secreto-largo" }), env, ctx);
  assert.equal(ok.status, 200);
  const bad = await worker.fetch(post("/admin/login", { token: "otro" }), env, ctx);
  assert.equal(bad.status, 401);
});

test("panel: el login viejo de Invoice Ninja (email/contraseña) ya no funciona", async () => {
  const env = { ADMIN_TOKEN: "secreto-largo", ADMIN_LOGIN_LIMITER: limiter(true) };
  const r = await worker.fetch(post("/admin/login", { email: "a@b.com", password: "x" }), env, ctx);
  assert.equal(r.status, 400);
});

test("panel: login sobre el límite de intentos devuelve 429", async () => {
  const env = { ADMIN_TOKEN: "secreto-largo", ADMIN_LOGIN_LIMITER: limiter(false) };
  const r = await worker.fetch(post("/admin/login", { token: "secreto-largo" }), env, ctx);
  assert.equal(r.status, 429);
});

test("panel: sin ADMIN_TOKEN configurado nadie entra", async () => {
  const get = (h) => new Request("https://api.test/admin/health", { headers: h });
  const r1 = await worker.fetch(get({ "X-Admin-Token": "algo" }), {}, ctx);
  assert.equal(r1.status, 401);
  const r2 = await worker.fetch(get({ "X-Admin-Token": "secreto-largo" }), { ADMIN_TOKEN: "secreto-largo" }, ctx);
  assert.equal(r2.status, 200);
});
