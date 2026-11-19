import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyTurnstile } from "../src/turnstile.js";

const ENV = { TURNSTILE_SECRET: "s", TURNSTILE_HOSTNAMES: "legadoholding.com,www.legadoholding.com" };
const ok = (body, status = 200) => async () => new Response(JSON.stringify(body), { status });

test("sin secret (dev) no verifica", async () => {
  assert.deepEqual(await verifyTurnstile(undefined, "1.1.1.1", {}), { ok: true, skipped: "no_secret" });
});

test("token ausente → rechazo sin llamar a siteverify", async () => {
  let called = false;
  const r = await verifyTurnstile("", "1.1.1.1", ENV, async () => { called = true; });
  assert.equal(r.ok, false);
  assert.equal(called, false);
});

test("token válido, acción y hostname correctos → ok", async () => {
  const r = await verifyTurnstile("t", "1.1.1.1", ENV,
    ok({ success: true, action: "checkout", hostname: "www.legadoholding.com" }));
  assert.deepEqual(r, { ok: true });
});

test("token inválido, otra acción u otro hostname → rechazo", async () => {
  assert.equal((await verifyTurnstile("t", "", ENV, ok({ success: false, "error-codes": ["timeout-or-duplicate"] }))).ok, false);
  assert.equal((await verifyTurnstile("t", "", ENV, ok({ success: true, action: "login", hostname: "legadoholding.com" }))).ok, false);
  assert.equal((await verifyTurnstile("t", "", ENV, ok({ success: true, action: "checkout", hostname: "evil.com" }))).ok, false);
});

test("siteverify caído → se deja pasar (no perder la venta)", async () => {
  const r1 = await verifyTurnstile("t", "", ENV, ok({}, 502));
  const r2 = await verifyTurnstile("t", "", ENV, async () => { throw new Error("net"); });
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true);
});
