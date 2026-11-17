/* Los tests corren en Node, no en workerd (wrangler dev se cae en Windows).
   La librería de OpenTelemetry importa `cloudflare:workers`; acá lo
   reemplazamos por un stub mínimo. Solo afecta a los tests. */
import { register } from "node:module";
register("./cf-hooks.mjs", import.meta.url);

/* `caches` (Cache API de Workers) no existe en Node; la instrumentación de
   OpenTelemetry lo envuelve al primer request. */
if (typeof globalThis.caches === "undefined") {
  const cache = { match: async () => undefined, put: async () => {}, delete: async () => false };
  globalThis.caches = { default: cache, open: async () => cache };
}

/* `scheduler.wait` (global de Workers) lo usa el exportador de trazas. */
if (typeof globalThis.scheduler === "undefined") {
  globalThis.scheduler = { wait: (ms) => new Promise((r) => setTimeout(r, ms)) };
}
