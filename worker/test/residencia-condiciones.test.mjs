/* Brief de Previsión 2026-11-26: residencia, términos (condiciones), idioma y
   prospecto del wizard para estados donde no se vende en línea. */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { processWizardCheckout, processWizardLead, normalizeResidencia } from "../src/wizard-compra.js";
import { mockFetch, jsonResponse, isPF } from "./helpers.mjs";

let m;
afterEach(() => m && m.restore());

const ENV = { PF_TOKEN: "tok", PF_BASE: "https://pf.test", SITE_BASE_URL: "https://site.test" };
const OK = { compra_pendiente_id: 9, estado: "pendiente_pago", link_de_cobro: "https://checkout.stripe.com/x" };
const META = { ip: "203.0.113.7", navegador: "Mozilla/5.0 test" };
const body = (extra = {}) => ({
  intent: "create_payment_intent", plan: "esencial-zulia", planId: 1, paymentType: "monthly",
  buyer: { name: "Ana", lastName: "Pérez", email: "ana@test.com" }, family: [],
  attribution: { codigo_vendedor: "MN4UYC5Y" },
  residencia: { pais: "us", estado: "fl" }, lang: "en", ...extra,
});
const compras = (calls) => calls.filter((c) => c.url.endsWith("/compras"));

test("manda residencia normalizada, idioma y (con términos) versión + ip + navegador", async () => {
  m = mockFetch([[isPF, () => jsonResponse(OK)]]);
  const r = await processWizardCheckout(body({ condicionesVersionId: 12 }), ENV, META);
  assert.equal(r.success, true);
  const b = compras(m.calls)[0].body;
  assert.deepEqual(b.residencia, { pais: "US", estado: "FL" });
  assert.equal(b.idioma, "en");
  assert.equal(b.condiciones_version_id, 12);
  assert.equal(b.ip, "203.0.113.7");
  assert.equal(b.navegador, "Mozilla/5.0 test");
});

test("sin términos vigentes no manda condiciones_version_id, ip ni navegador", async () => {
  m = mockFetch([[isPF, () => jsonResponse(OK)]]);
  await processWizardCheckout(body({ lang: "es" }), ENV, META);
  const b = compras(m.calls)[0].body;
  assert.equal(b.condiciones_version_id, undefined);
  assert.equal(b.ip, undefined);
  assert.equal(b.navegador, undefined);
  assert.equal(b.idioma, "es");
});

test("residencia fuera de EE. UU.: país sin estado", () => {
  assert.deepEqual(normalizeResidencia({ pais: "ve" }), { pais: "VE" });
  assert.equal(normalizeResidencia(undefined), null);
  assert.throws(() => normalizeResidencia({ pais: "US" }), /estado/);
  assert.throws(() => normalizeResidencia({ pais: "USA", estado: "FL" }), /pais/);
  assert.throws(() => normalizeResidencia({ pais: "US", estado: "Florida" }), /estado/);
});

test("residencia_no_habilitada: código pf_residencia con la lista, sin reintentar sin atribución", async () => {
  const hab = { pais: "US", estados: [{ codigo: "FL", nombre: "Florida" }, { codigo: "TX", nombre: "Texas" }] };
  m = mockFetch([[isPF, () => jsonResponse({ codigo: "residencia_no_habilitada", habilitados: hab }, 400)]]);
  const r = await processWizardCheckout(body({ residencia: { pais: "US", estado: "NY" } }), ENV, META);
  assert.equal(r.success, false);
  assert.equal(r.code, "pf_residencia");
  assert.equal(r.reason, "residencia_no_habilitada");
  assert.deepEqual(r.habilitados, hab);
  assert.equal(compras(m.calls).length, 1);
});

test("condiciones_no_aceptadas: código pf_condiciones, un solo intento", async () => {
  m = mockFetch([[isPF, () => jsonResponse({ codigo: "condiciones_no_aceptadas", vigente_id: 13 }, 400)]]);
  const r = await processWizardCheckout(body({ condicionesVersionId: 12 }), ENV, META);
  assert.equal(r.code, "pf_condiciones");
  assert.equal(compras(m.calls).length, 1);
});

/* ── Prospecto del wizard ───────────────────────────────────────────────── */
const lead = (extra = {}) => ({
  buyer: { name: "Luis", lastName: "Mora", phone: "+1 212 555 0100", email: "LUIS@test.com" },
  planId: 3, residencia: { pais: "US", estado: "NY" }, consent: true, lang: "es",
  attribution: { codigo_vendedor: "MN4UYC5Y" }, ...extra,
});

test("lead: POST /solicitudes con plan, residencia en el mensaje, consentimiento y atribución", async () => {
  m = mockFetch([[isPF, () => jsonResponse({ id: "sol_1" })]]);
  const r = await processWizardLead(lead(), ENV);
  assert.equal(r.success, true);
  assert.equal(r.solicitudId, "sol_1");
  const c = m.calls.find((x) => x.url.endsWith("/solicitudes"));
  assert.equal(c.body.tipo, "plan");
  assert.equal(c.body.plan_id, 3);
  assert.equal(c.body.email, "luis@test.com");
  assert.match(c.body.mensaje, /NY, US/);
  assert.equal(c.body.consentimiento.canal, "wizard_sitio");
  assert.equal(c.body.atribucion.codigo_vendedor, "MN4UYC5Y");
  assert.equal(c.init.headers.Authorization, "Bearer tok");
});

test("lead: sin consentimiento o sin teléfono se rechaza antes de llamar a Previsión", async () => {
  m = mockFetch([[isPF, () => jsonResponse({ id: 1 })]]);
  await assert.rejects(() => processWizardLead(lead({ consent: false }), ENV), /consentimiento/);
  await assert.rejects(() => processWizardLead(lead({ buyer: { name: "A", lastName: "B" } }), ENV), /teléfono/);
  assert.equal(m.calls.length, 0);
});

test("consentimientos: viajan saneados (otorgados y no otorgados) a POST /compras", async () => {
  m = mockFetch([[isPF, () => jsonResponse(OK)]]);
  await processWizardCheckout(body({ consentimientos: [
    { clave: "comercial_correo", otorgado: true },
    { clave: "Comercial_WhatsApp", otorgado: "sí" },
    { clave: "comercial_correo", otorgado: false },
    { clave: "mal clave!", otorgado: true },
    null,
    { clave: "compartir_aliados", otorgado: false },
  ] }), ENV, META);
  assert.deepEqual(compras(m.calls)[0].body.consentimientos, [
    { clave: "comercial_correo", otorgado: true },
    { clave: "comercial_whatsapp", otorgado: false },
    { clave: "compartir_aliados", otorgado: false },
  ]);
  assert.equal(compras(m.calls)[0].body.consentimiento_sms, undefined);
  m.restore();
  m = mockFetch([[isPF, () => jsonResponse(OK)]]);
  await processWizardCheckout(body(), ENV, META);
  assert.equal(compras(m.calls)[0].body.consentimientos, undefined);
});
