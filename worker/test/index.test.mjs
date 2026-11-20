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

test("checkout sobre el límite por IP: 429 sin llamar a Previsión", async () => {
  m = mockFetch([[() => true, () => { throw new Error("no debería llamar a nadie"); }]]);
  const r = await worker.fetch(post("/", { intent: "create_payment_intent" }), { CHECKOUT_IP_LIMITER: limiter(false), PF_TOKEN: "t" }, ctx);
  assert.equal(r.status, 429);
  const d = await r.json();
  assert.equal(d.code, "rate_limited");
  assert.ok(d.message);
});

test("consultas /wizard/* sobre el límite por IP: 429 sin llamar a Previsión", async () => {
  m = mockFetch([[() => true, () => { throw new Error("no debería llamar a nadie"); }]]);
  for (const path of ["/wizard/parentescos", "/wizard/vendedor?codigo=AB12CD34"]) {
    const r = await worker.fetch(new Request(`https://api.test${path}`, { headers: { "CF-Connecting-IP": "1.2.3.4" } }), { LOOKUP_IP_LIMITER: limiter(false), PF_TOKEN: "t" }, ctx);
    assert.equal(r.status, 429, path);
  }
});

test("health público no expone orígenes, modelo ni estado de secretos", async () => {
  const r = await worker.fetch(new Request("https://api.test/"), { PF_TOKEN: "t", OPENAI_API_KEY: "k", ALLOWED_ORIGINS: "https://x" }, ctx);
  const d = await r.json();
  assert.equal(d.ok, true);
  assert.equal(d.ready, true);
  for (const k of ["allowedOrigins", "openaiModel", "pfTokenLoaded", "pfBase", "openaiConfigured"]) assert.equal(d[k], undefined, k);
});

test("un error de Previsión en parentescos no se reenvía al navegador", async () => {
  m = mockFetch([[(u) => u.includes("/parentescos"), () => jsonResponse({ detalle: "SQLITE_BUSY interno" }, 500)]]);
  const r = await worker.fetch(new Request("https://api.test/wizard/parentescos"), { PF_TOKEN: "t", PF_BASE: "https://pf.test" }, ctx);
  assert.equal(r.status, 503);
  assert.doesNotMatch(await r.text(), /SQLITE_BUSY/);
});

test("vendedor: un código de más de 20 caracteres no se recorta (sería otro código)", async () => {
  m = mockFetch([[() => true, () => { throw new Error("no debería consultar a Previsión"); }]]);
  const r = await worker.fetch(new Request(`https://api.test/wizard/vendedor?codigo=${"A".repeat(21)}`), { PF_TOKEN: "t" }, ctx);
  assert.equal((await r.json()).activo, false);
});

test("vendedor: si el código cambió, devuelve el VIGENTE que trae Previsión", async () => {
  m = mockFetch([[(u) => String(u).includes("/vendedores/lookup"), () => jsonResponse({ activo: true, codigo: "MARIAP2026", nombre: "María P." })]]);
  const r = await worker.fetch(new Request("https://api.test/wizard/vendedor?codigo=mn4uyc5y"), { PF_TOKEN: "t", PF_BASE: "https://pf.test" }, ctx);
  const d = await r.json();
  assert.equal(d.activo, true);
  assert.equal(d.codigo, "MARIAP2026");
});

test("vendedor: sin código en la respuesta, devuelve el consultado", async () => {
  m = mockFetch([[(u) => String(u).includes("/vendedores/lookup"), () => jsonResponse({ activo: true, nombre: "X" })]]);
  const r = await worker.fetch(new Request("https://api.test/wizard/vendedor?codigo=AB12CD34"), { PF_TOKEN: "t", PF_BASE: "https://pf.test" }, ctx);
  assert.equal((await r.json()).codigo, "AB12CD34");
});
