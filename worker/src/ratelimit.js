/* =============================================================================
   Límites de uso (Rate Limiting de Workers, bindings en wrangler.toml).

   - CHAT_IP_LIMITER:        mensajes a /chat por IP (20 por minuto).
   - ADMIN_LOGIN_LIMITER:    intentos de login del panel por IP (5 por minuto).

   El límite de Cloudflare es aproximado y por ubicación del edge — sirve para
   frenar abuso, no como cuota exacta.
   ============================================================================= */

/* IP del visitante según Cloudflare. */
export function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || "unknown";
}

/* Consulta un binding de Rate Limiting. Si el binding no existe o falla, NO
   bloquea (fail-open): un error de infraestructura no debe dejar sin chat a
   una familia en emergencia. */
export async function isRateLimited(limiter, key) {
  if (!limiter || typeof limiter.limit !== "function") return false;
  try {
    const { success } = await limiter.limit({ key });
    return !success;
  } catch (e) {
    console.warn(`[ratelimit] error consultando el limitador: ${e.message}`);
    return false;
  }
}
