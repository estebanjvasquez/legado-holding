/* =============================================================================
   OpenTelemetry — config para @microlabs/otel-cf-workers (Etapa 1,
   docs/observabilidad-opentelemetry.md).

   El endpoint y la API key vienen de SECRETS (nunca de código ni de git):
     wrangler secret put OTEL_EXPORTER_OTLP_ENDPOINT   → p.ej. https://api.honeycomb.io
     wrangler secret put OTEL_EXPORTER_OTLP_HEADERS    → "x-honeycomb-team=<api-key>"
   (formato estándar OTLP: pares "clave=valor" separados por coma).

   KILL-SWITCH: si OTEL_EXPORTER_OTLP_ENDPOINT no está seteado, index.js NO
   envuelve el handler — cero código OTel en el path del request. Para desactivar
   la instrumentación en prod sin redeploy: `wrangler secret delete
   OTEL_EXPORTER_OTLP_ENDPOINT`.

   service.name = `alma-<tenant>` (ver tenant.js) → Honeycomb rutea a un dataset
   por marca automáticamente (cuenta con Environments & Services, sin header
   x-honeycomb-dataset).
   ============================================================================= */

import { resolveTenant } from "./tenant.js";

/** ¿Está configurada la exportación de trazas? */
export function otelEnabled(env) {
  return !!(
    env &&
    env.OTEL_EXPORTER_OTLP_ENDPOINT &&
    String(env.OTEL_EXPORTER_OTLP_ENDPOINT).trim()
  );
}

/** "k1=v1,k2=v2" → { k1: "v1", k2: "v2" } (formato OTEL_EXPORTER_OTLP_HEADERS). */
function parseHeaders(raw) {
  const out = {};
  for (const pair of String(raw || "").split(",")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const k = pair.slice(0, eq).trim();
    const v = pair.slice(eq + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

/** ResolveConfigFn de @microlabs/otel-cf-workers. Se llama por request con env. */
export function resolveOtelConfig(env, _trigger) {
  const { serviceName } = resolveTenant(env);
  const base = String(env.OTEL_EXPORTER_OTLP_ENDPOINT || "").trim().replace(/\/+$/, "");
  return {
    exporter: {
      url: `${base}/v1/traces`,
      headers: parseHeaders(env.OTEL_EXPORTER_OTLP_HEADERS),
    },
    service: { name: serviceName, namespace: "grupo-legado" },
  };
}
