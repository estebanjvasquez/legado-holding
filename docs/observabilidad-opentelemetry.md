# Observabilidad del Worker / bot Alma — análisis y determinación sobre OpenTelemetry

> **Fecha:** 2026-09-09. **Estado:** análisis + recomendación. **No implementado.**
> Decisión que falta del usuario: plan de Cloudflare y si se acepta un backend de
> observabilidad de terceros (tier gratuito).

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

Depende de dos cosas que hay que confirmar:
1. **El plan de Cloudflare.** El `10007` en `observability` sugiere plan **Free** (o muy restringido). Si se puede pasar a Workers Paid ($5/mes), se abre la opción B.
2. **Aceptar un backend de terceros** (Grafana Cloud / Honeycomb tienen tier gratuito de sobra para este tráfico).

### Camino recomendado, por etapas

**Etapa 0 — ya, barato, sin código.** Confirmar el plan. Si el upgrade a Workers Paid ($5/mes) es aceptable, poner `[observability] enabled = true` (o `logs = { enabled = true }` en wrangler nuevo). Solo eso da logs consultables + analítica de invocación con retención en el dashboard — cierra el hueco #1 con el mínimo esfuerzo, reutilizando los `console.log` que ya existen.

**Etapa 1 — OTel real con `@microlabs/otel-cf-workers`** (si queremos tracing de verdad).
- Envolver el handler de `index.js` con `instrument()`.
- Auto-captura cada `fetch` a OpenAI / PF / Supabase / Stripe como span hijo con tiempo y status, por request, casi sin código nuestro.
- Añadir ~5 spans manuales: el loop de hops de Alma, la clasificación FASE 0, cada executor de tool.
- Exportar OTLP a **Grafana Cloud** (free: 50 GB trazas/mes) o **Honeycomb** free. Config con 2 secrets (`OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`).
- **`service.name` por tenant** (`alma-lh`, `alma-fdz`) → dashboards por tenant gratis cuando entre FDZ. **Este es el argumento más fuerte para hacerlo ANTES de FDZ.**
- Costo: 1 dep npm + ~decenas de KB de bundle, ~medio día de trabajo.

**Etapa 2 — destino de `chat_turns`.** Con trazas OTel, `chat_turns` deja de ser el sistema de "observabilidad" pero sigue siendo (a) el store de transcripción que lee el panel y (b) analítica de negocio por SQL. Se mantiene; se deja de forzarlo como si fuera tracing.

### Lo que NO haría
Construir la opción D (dashboards + alertas a mano). Es reimplementar OTel peor.

### Paso concreto independiente de todo lo anterior
**Añadir `tenant` como atributo de primera clase ya** — en las líneas de log, en `chat_turns`, en `chat_sessions`, y (a futuro) en los spans. Retrofitearlo después de FDZ es doloroso. Hoy el Worker es implícitamente `lh`.

---

## 5. Esfuerzo / costo

| Camino | Código | $ | Tiempo | Da |
|---|---|---|---|---|
| CF logs nativos (`observability=true`) | 1 línea en `wrangler.toml` | ~$5/mes (si no es ya Paid) | 15 min | logs consultables + analítica de invocación, retención |
| `@microlabs/otel-cf-workers` → Grafana/Honeycomb free | envolver handler + ~5 spans + 2 secrets | $0 (free tiers) | ~medio día | trazas distribuidas, percentiles, por tenant, `fetch` auto-instrumentado, alertas |
| Tail Worker → OTLP | Worker nuevo + config | $5/mes (plan Paid) | ~1 día | ídem, desacoplado, sin deps en el hot path |
| Artesanal (opción D) | tablas + consultas + cron alertador + panel | $0 | varios días, y mantenimiento | parcial, a medida, sin tracing |

---

## 6. Próximo paso pendiente del usuario

1. ¿Plan de Cloudflare actual? (define si B/C son viables).
2. ¿OK con un backend de observabilidad de terceros en tier gratuito (Grafana Cloud / Honeycomb)?
3. Con eso: se ejecuta **Etapa 0** (si aplica) + **Etapa 1** + el paso de `tenant`, en ese orden, antes de arrancar el bot de FDZ.

## 7. Referencias

- `worker/src/index.js` — handler a envolver.
- `worker/src/alma.js` / `worker/src/chat.js` — el loop de Alma y la persistencia en Supabase.
- `worker/wrangler.toml` — `[observability] enabled = false` (ver comentario del entitlement).
- `docs/plan-bot-alma-funeraria-del-zulia.md` — plan del bot de FDZ (multi-tenant).
