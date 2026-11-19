/* =============================================================================
   Turnstile (Cloudflare) — anti-bots del checkout del wizard (POST /).
   El navegador resuelve el widget (paso "Resumen") y manda el token en
   body.turnstileToken; aquí se verifica contra siteverify ANTES de crear la
   compra en Previsión / la sesión de Stripe.

   Reglas:
   - Token ausente, inválido, de otra acción o de otro hostname → rechazo (403).
   - siteverify caído (red / 5xx / timeout) → se deja pasar y se registra en el
     log: no perder una venta por una caída de Cloudflare. El límite por IP
     (CHECKOUT_IP_LIMITER) sigue de respaldo.
   - Sin TURNSTILE_SECRET (desarrollo local) → no se verifica.
   ============================================================================= */

export const TURNSTILE_ACTION = "checkout";
const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const SITEVERIFY_TIMEOUT_MS = 8000;

function expectedHostnames(env) {
  return new Set(
    String(env.TURNSTILE_HOSTNAMES || "")
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean),
  );
}

/* → { ok: true, skipped?: string } | { ok: false, reason: string } */
export async function verifyTurnstile(token, ip, env, fetchImpl = fetch) {
  if (!env.TURNSTILE_SECRET) return { ok: true, skipped: "no_secret" };

  const hosts = expectedHostnames(env);
  if (hosts.size === 0) return { ok: false, reason: "no_hostnames_configured" };
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) {
    return { ok: false, reason: "missing_token" };
  }

  let result;
  try {
    const params = { secret: env.TURNSTILE_SECRET, response: token };
    if (ip && ip !== "unknown") params.remoteip = ip;
    const r = await fetchImpl(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
    });
    if (!r.ok) throw new Error(`siteverify HTTP ${r.status}`);
    result = await r.json();
  } catch (e) {
    console.warn(`Turnstile siteverify no disponible, se deja pasar: ${e.message}`);
    return { ok: true, skipped: "siteverify_unavailable" };
  }

  if (!result || result.success !== true) {
    const codes = (result && result["error-codes"]) || [];
    return { ok: false, reason: "invalid:" + codes.join(",") };
  }
  if (result.action !== TURNSTILE_ACTION) return { ok: false, reason: "action:" + result.action };
  if (!hosts.has(result.hostname)) return { ok: false, reason: "hostname:" + result.hostname };
  return { ok: true };
}
