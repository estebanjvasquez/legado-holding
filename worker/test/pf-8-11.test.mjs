/* Lado legado-holding de PF-8 (número de emergencia), PF-9 (idempotencia),
   PF-10 (toques) y PF-11 (aliados). */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { resolveEmergencyWhatsapp, _resetEmergencyCache, execLookupCoverage } from "../src/alma.js";
import { sanitizeAttribution, sanitizeToques } from "../src/attribution.js";
import { processWizardCheckout, _compraTiming } from "../src/wizard-compra.js";
import { mockFetch, jsonResponse, isPF } from "./helpers.mjs";

const ENV = { PF_TOKEN: "tok", PF_BASE: "https://pf.test", SITE_BASE_URL: "https://site.test" };
const isServicios = (u) => u.includes("/servicios");
const isAliados = (u) => u.includes("/aliados");
let m;
beforeEach(() => {
  _resetEmergencyCache();
  Object.assign(_compraTiming, { enProcesoWaitMs: 1, retryWaitMs: 1, budgetMs: 8000 });
});
afterEach(() => m && m.restore());

/* ── PF-8: número de emergencia ─────────────────────────────────────────── */

test("PF-8: el número sale de Previsión y se cachea", async () => {
  m = mockFetch([[isServicios, () => jsonResponse({ items: [], whatsapp_emergencia: "+58 424 111 2222" })]]);
  assert.equal(await resolveEmergencyWhatsapp(ENV), "584241112222");
  assert.equal(await resolveEmergencyWhatsapp(ENV), "584241112222");
  assert.equal(m.calls.length, 1, "la segunda vez sale de la caché");
});

test("PF-8: si Previsión falla sin caché, usa el número de respaldo", async () => {
  m = mockFetch([[isServicios, () => jsonResponse({}, 503)]]);
  assert.equal(await resolveEmergencyWhatsapp(ENV), "584246677030");
});

test("PF-8: si Previsión falla con caché, usa el último conocido", async () => {
  let n = 0;
  m = mockFetch([[isServicios, () => (++n === 1 ? jsonResponse({ whatsapp_emergencia: "+584241112222" }) : jsonResponse({}, 503))]]);
  await resolveEmergencyWhatsapp(ENV);
  _resetEmergencyCache();
  /* sin caché vuelve al respaldo; con caché vigente no consulta: */
  assert.equal(await resolveEmergencyWhatsapp(ENV), "584246677030");
});

test("PF-8: whatsapp_emergencia null → número de respaldo (nunca sin número en una emergencia)", async () => {
  m = mockFetch([[isServicios, () => jsonResponse({ items: [], whatsapp_emergencia: null })]]);
  assert.equal(await resolveEmergencyWhatsapp(ENV), "584246677030");
});

/* ── PF-11: aliados ─────────────────────────────────────────────────────── */

/* La BD ya no participa de lookup_coverage: si alguien la consultara, el
   test falla. */
const noDb = new Proxy({}, { get: (_, k) => () => { throw new Error(`no debería consultar Supabase (${String(k)})`); } });

test("PF-11: aliados de Previsión → cubierto, los de la ciudad primero, con token", async () => {
  m = mockFetch([[isAliados, () => jsonResponse({ items: [
    { nombre: "Cobertura Zulia", ciudad: "Cabimas", region: "Zulia", cobertura_region: true, telefono: "+582640000002", servicios: null },
    { nombre: "Funeraria Centro", ciudad: "Maracaibo", region: "Zulia", cobertura_region: false, telefono: "+582610000001", servicios: "Velación" },
  ] })]]);
  const r = await execLookupCoverage({ city: "maracaibo" }, ENV, noDb, "584246677030");
  assert.equal(r.covered, true);
  assert.equal(r.source, "prevision");
  assert.equal(r.partners[0].name, "Funeraria Centro");
  assert.equal(r.partners[0].scope, "city");
  assert.equal(r.partners[1].scope, "state");
  assert.deepEqual(r.location, { city: "Maracaibo", state: "Zulia" });
  assert.equal(m.calls[0].init.headers.Authorization, "Bearer tok");
  assert.match(m.calls[0].url, /\/aliados\?ciudad=maracaibo$/);
});

test("PF-11: Previsión sin aliados → no cubierto (sin consultar Supabase), para derivar a la guardia", async () => {
  m = mockFetch([[isAliados, () => jsonResponse({ items: [] })]]);
  const r = await execLookupCoverage({ city: "Ciudad Rara" }, ENV, noDb, "584246677030");
  assert.equal(r.covered, false);
  assert.equal(r.reason, "no_active_partner");
  assert.equal(r.emergency_phone, "584246677030");
});

test("PF-11: Previsión caída → falla cerrado (verification_failed), no asume cobertura", async () => {
  m = mockFetch([[isAliados, () => jsonResponse({}, 500)]]);
  const r = await execLookupCoverage({ city: "Maracaibo" }, ENV, noDb, "584246677030");
  assert.equal(r.covered, false);
  assert.equal(r.reason, "verification_failed");
});

/* ── PF-10: toques ──────────────────────────────────────────────────────── */

test("PF-10: toques saneados — sin fecha se descarta, campos inválidos se omiten", () => {
  const t = sanitizeToques([
    { fecha: "2026-11-01T14:03:00Z", codigo_vendedor: "AB12CD34", estado: "valido", utm_source: "whatsapp" },
    { codigo_vendedor: "SINFECHA1" },
    { fecha: "no-es-fecha" },
    { fecha: "2026-11-09T20:41:00Z", codigo_vendedor: "X".repeat(21), estado: "raro", canal_origen: "redes_sociales", otro: 1 },
  ]);
  assert.equal(t.length, 2);
  assert.deepEqual(t[0], { fecha: "2026-11-01T14:03:00.000Z", codigo_vendedor: "AB12CD34", estado: "valido", utm_source: "whatsapp" });
  assert.deepEqual(t[1], { fecha: "2026-11-09T20:41:00.000Z", canal_origen: "redes_sociales" });
});

test("PF-10: como máximo 10 toques, los más recientes", () => {
  const raw = Array.from({ length: 13 }, (_, i) => ({ fecha: new Date(Date.UTC(2026, 10, i + 1)).toISOString(), utm_source: `s${i}` }));
  const t = sanitizeToques(raw);
  assert.equal(t.length, 10);
  assert.equal(t.at(-1).utm_source, "s12");
});

test("PF-10: viajan en la atribución junto al codigo_vendedor de siempre", () => {
  const a = sanitizeAttribution({ codigo_vendedor: "MN4UYC5Y", toques: [{ fecha: "2026-11-01T00:00:00Z", codigo_vendedor: "MN4UYC5Y" }] });
  assert.equal(a.codigo_vendedor, "MN4UYC5Y");
  assert.equal(a.toques.length, 1);
  assert.equal(sanitizeAttribution({ toques: "no-es-lista" }), null);
});

/* ── PF-9: idempotencia ─────────────────────────────────────────────────── */

const KEY = "6f1c2a9e-4b7d-4c1e-9a55-2d0f3e8b7c10";
const body = (extra = {}) => ({
  intent: "create_payment_intent", plan: "esencial-zulia", planId: 1, paymentType: "monthly",
  buyer: { name: "Ana", lastName: "Pérez", email: "ana@test.com" }, family: [],
  attribution: { codigo_vendedor: "MN4UYC5Y" }, idempotencyKey: KEY, ...extra,
});
const OK = { compra_pendiente_id: 9, estado: "pendiente_pago", link_de_cobro: "https://checkout.stripe.com/x" };
const compras = (calls) => calls.filter((c) => c.url.endsWith("/compras"));

test("PF-9: manda la Idempotency-Key a Previsión", async () => {
  m = mockFetch([[isPF, () => jsonResponse(OK)]]);
  await processWizardCheckout(body(), ENV);
  assert.equal(compras(m.calls)[0].init.headers["Idempotency-Key"], KEY);
});

test("PF-9: clave con formato inválido se ignora (sin cabecera)", async () => {
  m = mockFetch([[isPF, () => jsonResponse(OK)]]);
  await processWizardCheckout(body({ idempotencyKey: "con espacios" }), ENV);
  assert.equal(compras(m.calls)[0].init.headers["Idempotency-Key"], undefined);
});

test("PF-9: 409 en_proceso → espera y reintenta con la MISMA clave", async () => {
  let n = 0;
  m = mockFetch([[isPF, () => (++n === 1
    ? jsonResponse({ codigo: "idempotencia_en_proceso" }, 409, { "Retry-After": "0" })
    : jsonResponse(OK))]]);
  const r = await processWizardCheckout(body(), ENV);
  assert.equal(r.success, true);
  const c = compras(m.calls);
  assert.equal(c.length, 2);
  assert.equal(c[1].init.headers["Idempotency-Key"], KEY);
  assert.ok(c[1].body.atribucion, "no pierde al vendedor");
});

test("PF-9: con clave, un 503 se reintenta una vez (seguro) y conserva al vendedor", async () => {
  let n = 0;
  m = mockFetch([[isPF, () => (++n === 1 ? jsonResponse({}, 503) : jsonResponse(OK))]]);
  const r = await processWizardCheckout(body(), ENV);
  assert.equal(r.success, true);
  assert.equal(compras(m.calls).length, 2);
  assert.ok(compras(m.calls)[1].body.atribucion);
});

test("PF-9: sin clave, un 503 NO se reintenta", async () => {
  m = mockFetch([[isPF, () => jsonResponse({}, 503)]]);
  const r = await processWizardCheckout(body({ idempotencyKey: undefined }), ENV);
  assert.equal(r.code, "pf_unavailable");
  assert.equal(compras(m.calls).length, 1);
});

test("PF-9: requiere_revision → avisa que lo van a contactar, sin reintentar", async () => {
  m = mockFetch([[isPF, () => jsonResponse({ codigo: "idempotencia_requiere_revision", compra_pendiente_id: 5 }, 409)]]);
  const r = await processWizardCheckout(body(), ENV);
  assert.equal(r.code, "pf_review");
  assert.match(r.message, /contactaremos/);
  assert.equal(compras(m.calls).length, 1);
});

test("PF-9: 422 idempotencia_conflicto NO dispara el reintento sin atribución", async () => {
  m = mockFetch([[isPF, () => jsonResponse({ error: "otro body", codigo: "idempotencia_conflicto" }, 422)]]);
  const r = await processWizardCheckout(body(), ENV);
  assert.equal(r.code, "pf_rejected");
  assert.equal(compras(m.calls).length, 1);
});

test("PF-9: 409 de cliente inactivo muestra el mensaje de Previsión tal cual", async () => {
  m = mockFetch([[isPF, () => jsonResponse({ error: "El cliente está inactivo. Contacta a la funeraria." }, 409)]]);
  const r = await processWizardCheckout(body(), ENV);
  assert.equal(r.code, "pf_rejected");
  assert.equal(r.message, "El cliente está inactivo. Contacta a la funeraria.");
});

test("PF-9: rechazo por atribución (400) reintenta sin ella con la misma clave", async () => {
  let n = 0;
  m = mockFetch([[isPF, () => (++n === 1 ? jsonResponse({ error: "atribucion" }, 400) : jsonResponse(OK))]]);
  const r = await processWizardCheckout(body(), ENV);
  assert.equal(r.success, true);
  const c = compras(m.calls);
  assert.equal(c[1].body.atribucion, undefined);
  assert.equal(c[1].init.headers["Idempotency-Key"], KEY);
});
