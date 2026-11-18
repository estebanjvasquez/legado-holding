import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { callOpenAIWithRetry, _retryTiming, buildFallbackHandoff } from "../src/alma.js";
import { mockFetch, jsonResponse, isOpenAI } from "./helpers.mjs";

const OK = { choices: [{ message: { content: "hola" } }] };
let m;
beforeEach(() => { _retryTiming.baseDelayMs = 1; _retryTiming.maxDelayMs = 5; });
afterEach(() => m && m.restore());

const far = () => Date.now() + 60000;

test("un 429 transitorio se reintenta y el turno termina bien", async () => {
  let n = 0;
  m = mockFetch([[isOpenAI, () => (++n === 1 ? jsonResponse({ error: { code: "rate_limit_exceeded" } }, 429) : jsonResponse(OK))]]);
  const r = await callOpenAIWithRetry("m", "k", {}, far());
  assert.equal(r.choices[0].message.content, "hola");
  assert.equal(m.calls.length, 2);
});

test("429 seguidos: 1 intento + 1 solo reintento (no amplifica la saturación) y luego error", async () => {
  m = mockFetch([[isOpenAI, () => jsonResponse({ error: {} }, 429)]]);
  await assert.rejects(callOpenAIWithRetry("m", "k", {}, far()), /OpenAI 429/);
  assert.equal(m.calls.length, 2);
});

test("un 5xx se reintenta", async () => {
  let n = 0;
  m = mockFetch([[isOpenAI, () => (++n < 3 ? jsonResponse({}, 503) : jsonResponse(OK))]]);
  await callOpenAIWithRetry("m", "k", {}, far());
  assert.equal(m.calls.length, 3);
});

test("cuota agotada (insufficient_quota) NO se reintenta", async () => {
  m = mockFetch([[isOpenAI, () => jsonResponse({ error: { code: "insufficient_quota" } }, 429)]]);
  await assert.rejects(callOpenAIWithRetry("m", "k", {}, far()));
  assert.equal(m.calls.length, 1);
});

test("un 400 de request NO se reintenta", async () => {
  m = mockFetch([[isOpenAI, () => jsonResponse({ error: { code: "bad" } }, 400)]]);
  await assert.rejects(callOpenAIWithRetry("m", "k", {}, far()));
  assert.equal(m.calls.length, 1);
});

test("error de red se reintenta", async () => {
  let n = 0;
  m = mockFetch([[isOpenAI, () => { if (++n === 1) throw new TypeError("network down"); return jsonResponse(OK); }]]);
  await callOpenAIWithRetry("m", "k", {}, far());
  assert.equal(m.calls.length, 2);
});

test("sin presupuesto de tiempo no se llama a OpenAI", async () => {
  m = mockFetch([[isOpenAI, () => jsonResponse(OK)]]);
  await assert.rejects(callOpenAIWithRetry("m", "k", {}, Date.now() + 500), /Presupuesto/);
  assert.equal(m.calls.length, 0);
});

test("el WhatsApp de respaldo es el de la guardia y lleva el vendedor", async () => {
  const es = await buildFallbackHandoff("es", { codigo_vendedor: "MN4UYC5Y" });
  assert.equal(es.phone, "584246677030");
  assert.match(es.text, /Alma/);
  assert.match(es.text, /MN4UYC5Y/);
  const en = await buildFallbackHandoff("en", null);
  assert.match(en.text, /^Hi/);
});
