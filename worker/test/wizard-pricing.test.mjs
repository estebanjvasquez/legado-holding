/* Tests de js/wizard-pricing.js (frontend, script clásico): montos que el
   resumen del wizard muestra según la frecuencia elegida. Precios reales de
   GET /planes del tenant lh (2026-11-19). */
import { test } from "node:test";
import assert from "node:assert/strict";
import "../../js/wizard-pricing.js";

const P = globalThis.LegadoWizardPricing;
const ZULIA = { monthlyCents: 947, annualCents: 9470, initialCents: null };
const SELECTO = { monthlyCents: 947, annualCents: 9470, initialCents: 3500 };

test("mensual: muestra precio_mensual_centavos", () => {
  const s = P.summary(ZULIA, "monthly");
  assert.equal(s.frecuenciaPago, "mensual");
  assert.equal(s.recurringCents, 947);
  assert.equal(s.firstChargeCents, 947);
  assert.equal(P.formatCents(s.firstChargeCents), "$9,47");
});

test("anual: muestra precio_anual_centavos (no el mensual)", () => {
  const s = P.summary(ZULIA, "annual");
  assert.equal(s.frecuenciaPago, "anual");
  assert.equal(s.recurringCents, 9470);
  assert.equal(P.formatCents(s.firstChargeCents), "$94,70");
});

test("Selecto mensual: 1er cobro = cuota inicial + cuota mensual ($44,47, igual que el contrato #8)", () => {
  const s = P.summary(SELECTO, "monthly");
  assert.equal(s.initialCents, 3500);
  assert.equal(s.recurringCents, 947);
  assert.equal(P.formatCents(s.firstChargeCents), "$44,47");
});

test("Selecto anual: 1er cobro = cuota inicial + cuota anual", () => {
  const s = P.summary(SELECTO, "annual");
  assert.equal(P.formatCents(s.firstChargeCents), "$129,70");
  assert.equal(s.recurringCents, 9470);
});

test("sin frecuencia elegida (o inválida) no hay resumen → el wizard no avanza", () => {
  assert.equal(P.summary(ZULIA, null), null);
  assert.equal(P.summary(ZULIA, "weekly"), null);
});

test("frecuencia sin precio publicado: no se ofrece ni se resume", () => {
  const soloMensual = { monthlyCents: 947, annualCents: null };
  assert.deepEqual(P.availableTypes(soloMensual), ["monthly"]);
  assert.equal(P.summary(soloMensual, "annual"), null);
  assert.deepEqual(P.availableTypes(ZULIA), ["monthly", "annual"]);
});
