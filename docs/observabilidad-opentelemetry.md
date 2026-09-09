# Observabilidad del Worker / bot Alma — análisis y determinación sobre OpenTelemetry

> **Fecha:** 2026-09-09. **Estado:** ✅ **implementado y desplegado** (paso `tenant` +
> Etapa 1 OTel). Worker versión `7c61ad55`. Restricciones: Cloudflare **plan Free**,
> presupuesto **$0**. Backend: **Honeycomb Free** (`@microlabs/otel-cf-workers`).
> Pendiente del usuario: ver trazas en Honeycomb (dataset `alma-lh`), rotar la ingest key,
> y (opcional) environment `production` + la migración SQL de columnas `tenant`. Ver §6.

---

## 1. Qué hay hoy

| Fuente | Qué cubre | Dónde se ve | Límites |
|---|---|---|---|
| `console.log/warn/error` (~34 llamadas en `worker/src/`) | eventos puntuales: errores de tools, hops de Alma, checkout | **solo `wrangler tail`** (en vivo) | efímero; sin histórico, sin agregados, sin alertas. La observabilidad del dashboard (`[observability]`) está **bloqueada por el plan** (`10007 entitlements.not_available` → `enabled = false` en `wrangler.toml`) |
| Supabase `chat_turns` | traza artesanal del chat: por hop y por tool → `latency_ms`, `tool_args`, `tool_result`, `error`, `model`, `hop` | consultando la tabla (SQL) o el visor de sesiones del panel | solo `/chat`; un `INSERT` por evento (serie); no es consultable como métricas (percentiles, tasa de error) |
| Supabase `chat_sessions.metadata` | estado estructurado por sesión (item #5): `turn_count`, `handoff_done`, `lead_done`, `handoff_summary`, cobertura, atribución, timestamps | ídem | por sesión, no agregado |
| Wizard de checkout (`POST /`) | — | `console.log` (efímero) | **cero telemetría persistente de este lado** (Prevision-Funeraria tiene la suya) |

### Huecos reales
1. **Sin vista histórica ni agregada** salvo consultando Supabase a mano. No hay dashboards, ni percentiles de latencia, ni tasa de error en el tiempo.
2. **Sin alertas** (p. ej. "error de OpenAI > 5 %", "fallos de handoff", "p95 de `/chat` > 10 s").
3. **`wrangler tail` es efímero**: hay que estar mirando cuando pasa.
4. **Sin traza distribuida** que enlace un request de `/chat` → sus llamadas a OpenAI → Prevision-Funeraria → escrituras a Supabase, con tiempos.
5. **Multi-tenant**: cuando entre FDZ (tenant `fdz`) la superficie se duplica y no hay corte por tenant. Hoy el Worker es implícitamente single-tenant (`lh`).
6. El checkout del wizard no deja rastro propio en este repo.

---

## 2. ¿OpenTelemetry es la herramienta correcta?

Sí, para los huecos 1–5. OTel da traces + métricas + logs vendor-neutral, **auto-instrumenta `fetch`** (cada llamada a OpenAI / PF / Supabase / Stripe se vuelve un span hijo con tiempo y status sin escribir código), y exporta OTLP a cualquier backend (Grafana Cloud, Honeycomb, Dash0, la propia observabilidad de Cloudflare…).

Lo que OTel **no** reemplaza: `chat_turns` como **transcripción** de la conversación (lo lee el panel) y como **analítica de negocio** consultable por SQL (cuántos handoffs, qué ciudades sin cobertura, conversión de leads). Eso sigue en Supabase.

---

## 3. Opciones para Cloudflare Workers

### A — `@microlabs/otel-cf-workers` (SDK OTel comunitario para Workers)
- Envuelve el handler: `export default instrument(handler, config)`.
- Auto-instrumenta `fetch` y los bindings; los spans se flushean con `ctx.waitUntil` tras la respuesta.
- **Añade 1 dependencia npm** (~decenas de KB al bundle). Hoy el Worker tiene **cero** deps npm — es una decisión deliberada (`README`: "fetch puro", sin SDK de Supabase "para evitar peso extra").
- Maduro pero mantenido por la comunidad; algún borde áspero con APIs nuevas del runtime.
- Requiere endpoint OTLP + header de auth (secret).

### B — Observabilidad nativa de Cloudflare (Workers Logs + Analytics / Workers Observability)
- `[observability] enabled = true` → logs estructurados + trazas de invocación en el dashboard, consultables, con retención. **Casi sin código.**
- **Bloqueado hoy** por el plan (`entitlements.not_available`). Disponible en Workers **Paid** ($5/mes) y, desde 2024, una cuota limitada en Free.
- Cloudflare además permite configurar un **destino OTLP** y exportar las trazas por vos (integración Baselime absorbida en CF Observability) — el camino de menos código **si el plan lo permite**.

### C — Tail Worker + exportador OTLP
- Un segundo Worker (`tail_consumers`) recibe los eventos del Worker principal y los reenvía como spans OTLP.
- Desacopla la instrumentación (cero deps en el hot path).
- Más piezas (un Worker más que mantener). También requiere plan Paid.

### D — Seguir con la telemetría artesanal de Supabase + capa fina de métricas
- Mantener `chat_turns`; agregar tabla/consultas de agregados + un panel simple + un cron Worker que chequee tasas de error y dispare un webhook.
- Cero vendors, cero deps. Pero es **reinventar OTel a mano** y no da tracing / percentiles / alertas "gratis".

---

## 4. Determinación (recomendación)

### Restricciones confirmadas por el usuario (2026-09-09)

1. **Plan de Cloudflare: Free.** Confirmado. No se va a pasar a Workers Paid.
2. **Presupuesto: $0, ni ahora ni más adelante.** Nada que pueda facturar. Los free
   tiers permanentes de Grafana Cloud / Honeycomb sí encajan (ver nota de volumen abajo);
   cualquier cosa con tarjeta de crédito o que "escale a de pago" queda descartada.

**Consecuencia:**
- **Etapa 0 (observabilidad nativa de Cloudflare) → DESCARTADA.** Requiere plan Paid
  (`10007 entitlements.not_available` en Free). No hay camino sin costo por acá.
- **Opción B y C → DESCARTADAS** (ambas necesitan Paid).
- **Opción A (`@microlabs/otel-cf-workers` → backend free) → es el único camino que
  cumple las dos restricciones.** Backend recomendado: **Honeycomb Free**.

### Nota de volumen — por qué el free tier es seguro "para siempre" a este tráfico

Honeycomb Free = **20 M eventos/mes**, 60 días de retención, sin tarjeta. El bot todavía
no tiene usuarios finales; en producción real haría del orden de cientos de requests/día,
~5–15 spans por request → **~150 k spans/mes**. Eso es **~130× por debajo** del límite
gratuito. Grafana Cloud Free (50 GB trazas/mes, 14 días) da un margen similar. Si algún
día nos acercáramos al límite, se controla con sampling (bajar a 10–20 % de trazas) sin
tocar el resto. No hay un escenario realista en el que esto genere una factura.

### Camino a ejecutar

**Etapa 1 — OTel con `@microlabs/otel-cf-workers` → Honeycomb Free.**
- Envolver el handler de `index.js` con `instrument()`.
- Auto-captura cada `fetch` a OpenAI / PF / Supabase / Stripe como span hijo con tiempo y status, por request, casi sin código nuestro.
- Añadir ~5 spans manuales: el loop de hops de Alma, la clasificación FASE 0, cada executor de tool.
- Exportar OTLP a **Honeycomb Free** (`api.honeycomb.io:443`, header `x-honeycomb-team: <api-key>`). Config con 2 secrets del Worker (`OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`) — la API key nunca en código.
- **`service.name` por tenant** (`alma-lh`, `alma-fdz`) → dashboards por tenant gratis cuando entre FDZ. **Este es el argumento más fuerte para hacerlo ANTES de FDZ.**
- Costo: 1 dep npm + ~decenas de KB de bundle, ~medio día de trabajo.

**Etapa 2 — destino de `chat_turns`.** Con trazas OTel, `chat_turns` deja de ser el sistema de "observabilidad" pero sigue siendo (a) el store de transcripción que lee el panel y (b) analítica de negocio por SQL. Se mantiene; se deja de forzarlo como si fuera tracing.

### Lo que NO haría
Construir la opción D (dashboards + alertas a mano). Es reimplementar OTel peor.

### Paso concreto independiente de todo lo anterior
**Añadir `tenant` como atributo de primera clase ya** — en las líneas de log, en `chat_turns`, en `chat_sessions`, y (a futuro) en los spans. Retrofitearlo después de FDZ es doloroso. Hoy el Worker es implícitamente `lh`.

---

## 5. Esfuerzo / costo

| Camino | Código | $ | Tiempo | Da | Estado |
|---|---|---|---|---|---|
| CF logs nativos (`observability=true`) | 1 línea en `wrangler.toml` | ~$5/mes (plan Paid) | 15 min | logs consultables + analítica de invocación, retención | **descartado** (Free + $0) |
| `@microlabs/otel-cf-workers` → Honeycomb Free | envolver handler + ~5 spans + 2 secrets | $0 (free tier, ~130× de margen) | ~medio día | trazas distribuidas, percentiles, por tenant, `fetch` auto-instrumentado, alertas | **elegido** |
| Tail Worker → OTLP | Worker nuevo + config | $5/mes (plan Paid) | ~1 día | ídem, desacoplado, sin deps en el hot path | **descartado** (Paid) |
| Artesanal (opción D) | tablas + consultas + cron alertador + panel | $0 | varios días, y mantenimiento | parcial, a medida, sin tracing | descartado (reimplementa OTel peor) |

---

## 6. Plan de ejecución (restricciones ya confirmadas)

Orden, antes de arrancar el bot de FDZ:

1. **Paso `tenant`. — ✅ HECHO + DESPLEGADO.** Commits `035d2df` / `5a5f90e`. Worker
   versión `339d4681`.
   - `worker/src/tenant.js` → `resolveTenant(env)`, única fuente de verdad. `TENANT="lh"`
     en `wrangler.toml`. `service.name = alma-${tenant}`.
   - `prevision-api.js` arma `/api/public/t/<tenant>` desde `env.TENANT` (antes `"lh"` fijo).
   - `chat.js` / `alma.js`: `tenant=<id>` en las líneas de log; `meta.tenant` en
     `chat_sessions.metadata` (jsonb, sin migración).
   - `index.js`: `tenant` en el health check (verificado: `"tenant":"lh"`).
   - **Pendiente (opcional):** correr `worker/sql/2026-09-09-tenant-columns.sql` en Supabase
     para tener `tenant` como columna de primera clase en `chat_sessions`/`chat_turns`
     (hoy vive en el jsonb `metadata`). Tras correrlo, un commit chico añade `tenant` a los
     `INSERT` de `insertTurn`/`upsertSession`.

2. **Etapa 1 — `@microlabs/otel-cf-workers` → Honeycomb Free. — ✅ HECHO + DESPLEGADO.**
   Commit `9e1be2b`. Worker versión `7c61ad55`. (Backend: Honeycomb Free; Grafana Cloud
   Free era la alternativa, se descartó por retención 14 d vs 60 y por la UI de trazas.)
   - Primera dependencia npm del Worker: `@microlabs/otel-cf-workers@1.0.0-rc.52` +
     `@opentelemetry/api@1.9.0`. `compatibility_flags = ["nodejs_compat"]` (lo exige la lib).
   - `worker/src/otel.js`: `resolveOtelConfig(env)` — endpoint + headers desde secrets
     `OTEL_EXPORTER_OTLP_ENDPOINT` (`https://api.honeycomb.io`) y `OTEL_EXPORTER_OTLP_HEADERS`
     (`x-honeycomb-team=<ingest key>`). `service: { name: alma-lh, namespace: grupo-legado }`.
   - **Kill-switch:** `index.js` solo envuelve el handler con `instrument()` si
     `OTEL_EXPORTER_OTLP_ENDPOINT` está seteado. Para apagar OTel en prod sin redeploy:
     `wrangler secret delete OTEL_EXPORTER_OTLP_ENDPOINT`.
   - Auto-instrumenta cada `fetch` saliente (OpenAI / PF / Supabase / Stripe).
   - Spans manuales: `alma.tool <name>` por ejecución de tool (con `tool.latency_ms`,
     `tool.covered`, `tool.error`); atributos `alma.*` y `legado.*` (tenant, session,
     handoff, lead, coverage, hops) en el span del request.
   - Bundle: 27 → **135 KiB gzip** (límite Free: 3 MiB). Smoke Alma 11/11.
   - **Verificado:** deploy OK, health OK, `/chat` (neutro + urgencia) responde sin error,
     `wrangler tail` sin errores de export, POST OTLP manual a `/v1/traces` → HTTP 200,
     key validada (`GET /1/auth`: team `sisteg`, environment `test`, `events:true`,
     `createDatasets:true`, E&S — no necesita `x-honeycomb-dataset`).
   - **Pendiente del usuario:**
     a. Ver las trazas en Honeycomb → dataset **`alma-lh`**, environment **`test`**.
     b. La key pertenece al environment **`test`**. Si se quiere separar prod, crear un
        environment `production` en Honeycomb, generar su ingest key y
        `wrangler secret put OTEL_EXPORTER_OTLP_HEADERS` con la nueva.
     c. **Rotar la ingest key** (quedó en texto plano en el chat) una vez confirmado el flujo.

3. **Etapa 2 — `chat_turns` queda como transcripción + analítica de negocio**, no como
   "tracing". Sin trabajo, solo dejar de ampliarlo con esa intención.

### Nota de seguridad — `npm audit`

`npm audit` reporta 9 *moderate* (GHSA-8988-4f7v-96qf: *unbounded memory allocation en la
propagación de W3C Baggage*, `@opentelemetry/core` <2.8.0, **sin fix** aguas arriba). Vector:
un header `baggage` malicioso y enorme en un request entrante. Mitigado en la práctica:
`api.legadoholding.com` está detrás de Cloudflare (tope de tamaño de headers ~32 KB) y el
endpoint no es un colector de trazas público. Riesgo aceptado; revisar cuando la cadena
`@microlabs/otel-cf-workers` bumpee `@opentelemetry/core`.

## 7. Referencias

- `worker/src/index.js` — handler + wrap condicional de `instrument()`.
- `worker/src/otel.js` — config de OTel (endpoint/headers/service).
- `worker/src/tenant.js` — `resolveTenant(env)`.
- `worker/src/alma.js` / `worker/src/chat.js` — spans manuales + atributos.
- `worker/wrangler.toml` — `compatibility_flags = ["nodejs_compat"]`; `[observability] enabled = false` (plan Free).
- `worker/sql/2026-09-09-tenant-columns.sql` — migración opcional de columnas `tenant`.
- `docs/plan-bot-alma-funeraria-del-zulia.md` — plan del bot de FDZ (multi-tenant).
