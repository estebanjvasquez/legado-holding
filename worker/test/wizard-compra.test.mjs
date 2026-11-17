import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { processWizardCheckout } from "../src/wizard-compra.js";
import { mockFetch, jsonResponse, isPF } from "./helpers.mjs";

let m;
afterEach(() => m && m.restore());

const ENV = { PF_TOKEN: "tok", PF_BASE: "https://pf.test", SITE_BASE_URL: "https://site.test" };
const body = (withRef = true) => ({
  intent: "create_payment_intent",
  plan: "esencial-zulia",
  planId: 1,
  paymentType: "monthly",
  buyer: { name: "Ana", lastName: "Pérez", email: "ana@test.com" },
  family: [],
  ...(withRef ? { attribution: { codigo_vendedor: "MN4UYC5Y" } } : {}),
});
const OK = { compra_pendiente_id: 9, estado: "pendiente_pago", link_de_cobro: "https://checkout.stripe.com/x" };
const compras = (calls) => calls.filter((c) => c.url.endsWith("/compras"));

test("compra normal: una sola llamada, con el vendedor", async () => {
  m = mockFetch([[isPF, () => jsonResponse(OK)]]);
  const r = await processWizardCheckout(body(), ENV);
  assert.equal(r.success, true);
  assert.equal(compras(m.calls).length, 1);
  assert.equal(compras(m.calls)[0].body.atribucion.codigo_vendedor, "MN4UYC5Y");
});

test("rechazo de validación (422) con atribución: reintenta UNA vez sin ella", async () => {
  let n = 0;
  m = mockFetch([[isPF, () => (++n === 1 ? jsonResponse({ error: "atribucion" }, 422) : jsonResponse(OK))]]);
  const r = await processWizardCheckout(body(), ENV);
  assert.equal(r.success, true);
  const c = compras(m.calls);
  assert.equal(c.length, 2);
  assert.ok(c[0].body.atribucion);
  assert.equal(c[1].body.atribucion, undefined);
});

test("503 de Previsión: NO reintenta (la venta no pierde al vendedor) y avisa 'no disponible'", async () => {
  m = mockFetch([[isPF, () => jsonResponse({ error: "down" }, 503)]]);
  const r = await processWizardCheckout(body(), ENV);
  assert.equal(r.success, false);
  assert.equal(r.code, "pf_unavailable");
  assert.equal(compras(m.calls).length, 1);
  assert.doesNotMatch(r.message, /PF |503/, "no expone el detalle técnico");
});

test("error de red: NO reintenta", async () => {
  m = mockFetch([[isPF, () => { throw new TypeError("fetch failed"); }]]);
  const r = await processWizardCheckout(body(), ENV);
  assert.equal(r.code, "pf_unavailable");
  assert.equal(compras(m.calls).length, 1);
});

test("rechazo de validación sin atribución: no reintenta, código pf_rejected", async () => {
  m = mockFetch([[isPF, () => jsonResponse({ error: "email" }, 400)]]);
  const r = await processWizardCheckout(body(false), ENV);
  assert.equal(r.code, "pf_rejected");
  assert.equal(compras(m.calls).length, 1);
});

test("las llamadas a Previsión llevan señal de timeout", async () => {
  m = mockFetch([[isPF, () => jsonResponse(OK)]]);
  await processWizardCheckout(body(), ENV);
  assert.ok(compras(m.calls)[0].init.signal instanceof AbortSignal);
});
