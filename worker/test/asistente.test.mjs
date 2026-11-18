/* Configuración de Alma desde Previsión (GET /asistente). */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { runAlma, resolveAlmaConfig, resolveAsistente, _resetAsistenteCache, _resetEmergencyCache, _retryTiming } from "../src/alma.js";
import { mockFetch, jsonResponse, isOpenAI } from "./helpers.mjs";

const ENV = { PF_TOKEN: "tok", PF_BASE: "https://pf.test", OPENAI_API_KEY: "sk-worker", OPENAI_MODEL: "gpt-worker" };
const isAsistente = (u) => u.endsWith("/asistente");
const isServicios = (u) => u.includes("/servicios");
const PF_CFG = {
  configurado: true, activo: true, proveedor: "openai", modelo: "gpt-pf", temperatura: 0.7,
  prompt_es: "PROMPT PF {{emergency_phone}}", prompt_en: null,
  telefono_emergencia: "+584241112222", api_key: "sk-pf",
};
const OK = { choices: [{ message: { content: "hola" } }] };
const db = (cfg = {}) => ({ getAgentConfigMap: async () => cfg });
const openaiCalls = (calls) => calls.filter((c) => isOpenAI(c.url));

let m;
beforeEach(() => { _resetAsistenteCache(); _resetEmergencyCache(); _retryTiming.baseDelayMs = 1; _retryTiming.maxDelayMs = 5; });
afterEach(() => m && m.restore());

test("con config de Previsión: usa su clave, modelo, temperatura, prompt y teléfono; crisis siempre primero", async () => {
  m = mockFetch([[isAsistente, () => jsonResponse(PF_CFG)], [isOpenAI, () => jsonResponse(OK)]]);
  const r = await runAlma({ message: "hola", lang: "es", db: db({ system_prompt_es: "PROMPT DB" }) }, ENV);
  assert.equal(r.output, "hola");
  const [c] = openaiCalls(m.calls);
  assert.equal(c.init.headers.Authorization, "Bearer sk-pf");
  assert.equal(c.body.model, "gpt-pf");
  assert.equal(c.body.temperature, 0.7);
  assert.equal(c.body.reasoning_effort, "none");
  const sys = c.body.messages[0].content;
  assert.ok(sys.startsWith("══"), "el protocolo de crisis va antes del prompt");
  assert.match(sys, /SEÑALES DE CRISIS/);
  assert.match(sys, /PROMPT PF \+584241112222/);
  assert.doesNotMatch(sys, /PROMPT DB/);
  assert.equal(m.calls.find((x) => isAsistente(x.url)).init.headers.Authorization, "Bearer tok");
});

test("campos vacíos en Previsión caen a agent_config y luego al Worker", () => {
  const c = resolveAlmaConfig(
    { configurado: true, proveedor: null, modelo: null, temperatura: null, prompt_es: null, prompt_en: null, api_key: null, telefono_emergencia: null },
    { system_prompt_en: "DB EN", temperature: "0.1" },
    ENV,
  );
  assert.deepEqual(c.primary, { apiKey: "sk-worker", model: "gpt-worker" });
  assert.equal(c.keySource, "worker");
  assert.equal(c.temperature, 0.1);
  assert.equal(c.prompts.es, null);
  assert.deepEqual(c.prompts.en, { text: "DB EN", source: "db" });
  assert.equal(c.fallback, null, "misma clave y modelo: no hay a qué caer");
});

test("temperatura 0 de Previsión se respeta (no es 'vacío')", () => {
  assert.equal(resolveAlmaConfig({ ...PF_CFG, temperatura: 0 }, {}, ENV).temperature, 0);
});

test("configurado:false → todo del respaldo", () => {
  const c = resolveAlmaConfig({ configurado: false, api_key: null }, {}, ENV);
  assert.equal(c.source, "respaldo");
  assert.equal(c.primary.apiKey, "sk-worker");
});

test("proveedor distinto de openai → respaldo del Worker (Alma solo habla OpenAI)", () => {
  const c = resolveAlmaConfig({ ...PF_CFG, proveedor: "anthropic", api_key: "sk-ant-x", modelo: "claude-x" }, {}, ENV);
  assert.equal(c.source, "respaldo");
  assert.deepEqual(c.primary, { apiKey: "sk-worker", model: "gpt-worker" });
});

test("agent_config.model de Gemini se ignora", () => {
  const c = resolveAlmaConfig(null, { model: "gemini-2.5-flash" }, ENV);
  assert.equal(c.primary.model, "gpt-worker");
});

test("OpenAI rechaza la clave de Previsión (401) → reintenta UNA vez con la del Worker", async () => {
  m = mockFetch([
    [isAsistente, () => jsonResponse(PF_CFG)],
    [isOpenAI, (_, init) => (init.headers.Authorization === "Bearer sk-pf"
      ? jsonResponse({ error: { code: "invalid_api_key" } }, 401)
      : jsonResponse(OK))],
  ]);
  const r = await runAlma({ message: "hola", lang: "es", db: db() }, ENV);
  assert.equal(r.output, "hola");
  assert.equal(r.model, "gpt-worker");
  const c = openaiCalls(m.calls);
  assert.equal(c.length, 2);
  assert.equal(c[1].init.headers.Authorization, "Bearer sk-worker");
  assert.equal(c[1].body.model, "gpt-worker");
  assert.ok(r.events.some((e) => e.fallback), "queda registrado el cambio");
});

test("un 5xx con la config de Previsión NO cambia de clave (lo maneja el reintento normal)", async () => {
  let n = 0;
  m = mockFetch([
    [isAsistente, () => jsonResponse(PF_CFG)],
    [isOpenAI, () => (++n === 1 ? jsonResponse({}, 503) : jsonResponse(OK))],
  ]);
  await runAlma({ message: "hola", lang: "es", db: db() }, ENV);
  assert.ok(openaiCalls(m.calls).every((c) => c.init.headers.Authorization === "Bearer sk-pf"));
});

test("Previsión caída sin caché → Alma sigue con el Worker", async () => {
  m = mockFetch([
    [isAsistente, () => jsonResponse({}, 500)],
    [isServicios, () => jsonResponse({ whatsapp_emergencia: "+584246677030" })],
    [isOpenAI, () => jsonResponse(OK)],
  ]);
  const r = await runAlma({ message: "hola", lang: "es", db: db() }, ENV);
  assert.equal(r.output, "hola");
  assert.equal(openaiCalls(m.calls)[0].init.headers.Authorization, "Bearer sk-worker");
});

test("la config se cachea y, si Previsión cae, se usa la última conocida", async () => {
  let n = 0;
  m = mockFetch([[isAsistente, () => (++n === 1 ? jsonResponse(PF_CFG) : jsonResponse({}, 500))]]);
  assert.equal((await resolveAsistente(ENV)).modelo, "gpt-pf");
  assert.equal((await resolveAsistente(ENV)).modelo, "gpt-pf");
  assert.equal(n, 1, "la segunda sale de la caché");
});

test("sin ninguna clave → error claro (chat.js responde con el WhatsApp de guardia)", async () => {
  m = mockFetch([[isAsistente, () => jsonResponse({ configurado: false })]]);
  await assert.rejects(runAlma({ message: "hola", lang: "es", db: db() }, { ...ENV, OPENAI_API_KEY: "" }), /Sin clave de OpenAI/);
});
