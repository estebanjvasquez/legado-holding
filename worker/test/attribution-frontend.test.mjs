/* Tests de js/attribution.js (frontend). Se carga como script clásico: asigna
   globalThis.LegadoAttribution. */
import { test } from "node:test";
import assert from "node:assert/strict";
import "../../js/attribution.js";

const A = globalThis.LegadoAttribution;
const KEY = A._internals.KEY;
const DAY = 24 * 60 * 60 * 1000;

function memStorage(initial) {
  const m = new Map(initial ? [[KEY, JSON.stringify(initial)]] : []);
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), raw: () => JSON.parse(m.get(KEY) || "null") };
}
/* Simula GET /wizard/vendedor. */
const lookupFrom = (table) => async (code) => table[code] || "invalido";
const visit = (storage, search, { now = Date.now(), lookup, referrer = "" } = {}) =>
  A.init({ storage, search, pathname: "/", referrer, now, lookup });

test("código válido: queda como vendedor y viaja en la compra", async () => {
  const s = memStorage();
  await visit(s, "?ref=GOOD1234", { lookup: lookupFrom({ GOOD1234: "valido" }) });
  assert.equal(s.raw().ref_estado, "valido");
  assert.equal(A.get({ storage: s }).codigo_vendedor, "GOOD1234");
});

test("código inválido NO se queda con el crédito y no bloquea a uno válido posterior", async () => {
  const s = memStorage();
  const lookup = lookupFrom({ GOOD1234: "valido" });
  await visit(s, "?ref=TYPO1234", { lookup });
  assert.equal(A.get({ storage: s }).codigo_vendedor, undefined);
  await visit(s, "?ref=GOOD1234", { lookup });
  assert.equal(A.get({ storage: s }).codigo_vendedor, "GOOD1234");
  const toques = A.get({ storage: s }).toques;
  assert.equal(toques.length, 2);
  assert.equal(toques[0].estado, "invalido");
  assert.equal(toques[1].estado, "valido");
});

test("first-touch entre válidos: el segundo vendedor no pisa al primero, pero queda registrado", async () => {
  const s = memStorage();
  const lookup = lookupFrom({ AAAA1111: "valido", BBBB2222: "valido" });
  await visit(s, "?ref=AAAA1111", { lookup });
  await visit(s, "?ref=BBBB2222", { lookup });
  const a = A.get({ storage: s });
  assert.equal(a.codigo_vendedor, "AAAA1111");
  assert.deepEqual(a.toques.map((t) => t.codigo_vendedor), ["AAAA1111", "BBBB2222"]);
});

test("Previsión caída: el código queda 'sin_verificar', viaja igual y se revalida después", async () => {
  const s = memStorage();
  await visit(s, "?ref=GOOD1234", { lookup: async () => "error" });
  assert.equal(s.raw().ref_estado, "sin_verificar");
  assert.equal(A.get({ storage: s }).codigo_vendedor, "GOOD1234");
  /* próxima visita, sin ?ref=, ya con Previsión arriba */
  await visit(s, "", { lookup: lookupFrom({ GOOD1234: "valido" }) });
  assert.equal(s.raw().ref_estado, "valido");
});

test("sin verificar + llega otro código: si el primero resulta inválido, gana el pendiente", async () => {
  const s = memStorage();
  await visit(s, "?ref=TYPO1234", { lookup: async () => "error" });
  await visit(s, "?ref=GOOD1234", { lookup: lookupFrom({ GOOD1234: "valido" }) });
  assert.equal(A.get({ storage: s }).codigo_vendedor, "GOOD1234");
  assert.equal(s.raw().ref_pendiente, undefined);
});

test("registro de la versión anterior (sin estado) se revalida y se descarta si es inválido", async () => {
  const now = Date.now();
  const s = memStorage({ v: 1, ts: now - DAY, ref: "OLDTYPO1", canal_origen: "vendedor" });
  await visit(s, "", { now, lookup: async () => "invalido" });
  assert.equal(A.get({ storage: s, now }).codigo_vendedor, undefined);
});

test("vence a los 90 días", async () => {
  const s = memStorage();
  const t0 = Date.now();
  await visit(s, "?ref=GOOD1234", { now: t0, lookup: async () => "valido" });
  assert.deepEqual(A.get({ storage: s, now: t0 + 91 * DAY }), {});
});

test("UTM sin vendedor: manda canal_origen; si luego llega un vendedor, toma su contexto", async () => {
  const s = memStorage();
  await visit(s, "?utm_source=facebook&utm_medium=social");
  assert.equal(A.get({ storage: s }).canal_origen, "redes_sociales");
  await visit(s, "?ref=GOOD1234&utm_campaign=nov", { lookup: async () => "valido" });
  const a = A.get({ storage: s });
  assert.equal(a.codigo_vendedor, "GOOD1234");
  assert.equal(a.canal_origen, undefined, "con vendedor no se manda canal_origen");
  assert.equal(a.utm_campaign, "nov");
});

test("guarda como máximo los últimos 10 toques", async () => {
  const s = memStorage();
  for (let i = 0; i < 13; i++) await visit(s, `?utm_source=s${i}`);
  const t = A.get({ storage: s }).toques;
  assert.equal(t.length, A._internals.MAX_TOQUES);
  assert.equal(t.at(-1).utm_source, "s12");
});

test("storage bloqueado: nunca lanza", async () => {
  const s = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  await visit(s, "?ref=GOOD1234", { lookup: async () => "valido" });
  assert.deepEqual(A.get({ storage: s }), {});
});
