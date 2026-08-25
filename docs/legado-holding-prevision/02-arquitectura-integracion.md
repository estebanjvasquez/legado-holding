# Arquitectura de integración en Legado Holding

Cómo encaja el módulo de previsión dentro de lo que `legado-holding` ya tiene,
sin reescribir ni arriesgar lo existente. Basado en la lectura directa del
repo real (`worker/src/*.js`, `admin/*`, `worker/wrangler.toml`) al momento de
escribir esto — si el código cambió desde entonces, confía en el código, no en
este documento (regla general de `AGENTS.md` de Funerzul, aplicable aquí
también).

## Lo que ya existe (resumen para no releer todo el repo)

```
legado-holding/
├── admin/
│   ├── index.html      → shell del panel: login modal + tabs + <main>
│   └── admin.js         → helpers (api(), $, escapeHtml) + un "Ctrl" por tab
├── worker/
│   ├── wrangler.toml     → vars, rutas, secrets (SUPABASE_URL, ADMIN_TOKEN, IN_TOKEN…)
│   └── src/
│       ├── index.js      → router: /admin/* delega TODO a admin.js
│       ├── admin.js      → dispatcher de /admin/* (auth X-Admin-Token + rutas)
│       ├── supabase.js   → cliente REST (PostgREST directo, sin SDK) + métodos por tabla
│       ├── invoiceninja.js → cliente HTTP de Invoice Ninja (clientes, facturas, suscripciones)
│       ├── pipeline.js, chat.js, alma.js, emergency.js → checkout y chatbot (no tocar)
```

Patrones ya establecidos que hay que **copiar, no inventar de nuevo**:

- **Auth admin:** header `X-Admin-Token` comparado contra `env.ADMIN_TOKEN`
  (secret). Sin JWT, sin cookies. `admin.js` tiene `requireAdmin()`.
- **Cliente Supabase:** fetch puro contra PostgREST
  (`${SUPABASE_URL}/rest/v1/...`) con `apikey`/`Authorization: Bearer
  <service_role>`, sin el SDK `supabase-js` (para no meter peso en el Worker).
  Filtros con sintaxis PostgREST (`?campo=eq.valor`, `ilike.`, `select=`,
  `on_conflict=`). Ver `worker/src/supabase.js` completo como plantilla.
- **Cliente sin configurar = no-op, no error.** Si falta `SUPABASE_URL` o el
  secret, `createSupabase()` devuelve un stub que no rompe nada (ver
  `makeNoopClient()`). Mantener esa filosofía también para el módulo nuevo:
  nunca debe tumbar el Worker si algo de previsión no está configurado.
- **Frontend admin:** sin build, sin framework. Un objeto `XxxCtrl` por
  dominio con `load()`/`render()`/`create()`/etc., usando `$`/`$$`/`api()`
  compartidos, tabla HTML + botones con `data-action`.
- **CORS:** ya resuelto de forma genérica en `index.js` (`corsFor()`); las
  rutas nuevas bajo `/admin/prevision/*` heredan esto automáticamente porque
  `index.js` ya delega **todo** `/admin/*` a `handleAdmin()`. No tocar
  `index.js`.

## Decisión 1 — Dónde vive el código nuevo del Worker

**No** meter todo dentro de `admin.js` (225 líneas hoy; previsión tiene ~17
dominios, sería un archivo gigante y de alto riesgo de conflicto). En su
lugar:

```
worker/src/prevision/
├── db.js            → cliente Supabase específico de previsión (mismo patrón que supabase.js)
├── clientes.js       → handlers de /admin/prevision/clientes*
├── planes.js
├── contratos.js       → contratos + beneficiarios + cuotas + pagos + tasa + stats
├── vendedores.js       → vendedores + comisiones + descuentos
├── cobranza.js        → morosos + gestiones + lapsado
├── siniestros.js
├── catalogos.js        → sucursales + servicios + cobradores + rutas
├── ajustes.js          → ajuste masivo de tarifas
├── mensajes.js          → plantillas + envíos WhatsApp/SMS
├── reportes.js
├── solicitudes.js        → leads públicos
├── pagos_electronicos.js  → intentos + eventos (fase posterior, ver roadmap)
└── router.js            → dispatch interno: recibe (request, env, path, method) y llama al módulo correcto
```

`worker/src/admin.js` solo necesita **una línea nueva** al principio de
`handleAdmin()` (después de `requireAdmin`, antes del resto de rutas):

```js
if (path.startsWith("/admin/prevision/")) {
  return await handlePrevisionAdmin(request, env, corsHeaders, body);
}
```

con el import correspondiente al tope del archivo. Esto es **aditivo**: no
reordena ni modifica ninguna ruta existente de `admin.js`.

Por qué un cliente Supabase separado (`prevision/db.js`) y no extender
`supabase.js`: `supabase.js` ya es el cliente de dominios no relacionados
(sesiones de chat, ubicaciones, aliados, config del agente). Previsión agrega
~15 tablas y decenas de métodos — mezclarlo ahí lo vuelve inmanejable y
aumenta el riesgo de romper algo del chatbot al tocar ese archivo. Mismo
patrón interno (`req()` con PostgREST), archivo separado.

## Decisión 2 — Esquema Supabase (Postgres)

Traducción MySQL → Postgres, manteniendo nombres de tabla y columna
**idénticos** a Funerzul (prefijo `prev_`) para que el mapeo conceptual sea
directo entre ambos repos:

| MySQL (Funerzul) | Postgres (Legado Holding) |
|---|---|
| `BIGINT UNSIGNED AUTO_INCREMENT` | `bigint generated always as identity` (o `uuid default gen_random_uuid()` si se prefiere consistencia con el resto de Supabase — **decidir en la spec de Fase 0**, no a mitad de implementación) |
| `ENUM(...)` | `text` + `CHECK (col IN (...))`. Postgres tiene `ENUM` nativo pero es más rígido para migrar (agregar un valor requiere `ALTER TYPE`); `CHECK` es más flexible y es el patrón más común en Supabase. |
| `DECIMAL(19,2)` | `numeric(19,2)` |
| `TIMESTAMP ... ON UPDATE CURRENT_TIMESTAMP` | `timestamptz default now()` + trigger `updated_at` (Supabase suele usar un trigger genérico `moment_updated_at`; si no existe uno en el proyecto, crearlo una vez y reutilizarlo). |
| `JSON` | `jsonb` |
| Claves foráneas con `ON DELETE SET NULL/CASCADE` | Igual en Postgres, misma semántica. |

**RLS (Row Level Security):** el patrón actual de `legado-holding` opera
100% con `service_role` desde el Worker (bypassa RLS por diseño — ver
comentario en `supabase.js`: "todo es server-side"). Para las tablas nuevas
de previsión, verificar primero **si las tablas existentes tienen RLS
activado** (mirar el dashboard de Supabase, no está en el código del repo).
Si sí lo tienen, activar RLS también en las tablas `prev_*` con política
"deny all" por defecto (el `service_role` siempre bypassa RLS,
independientemente de las políticas) — es la práctica recomendada de
Supabase y no cuesta nada porque el Worker sigue funcionando igual. Si las
tablas existentes NO tienen RLS activado, seguir el mismo patrón para no
introducir una inconsistencia que alguien tenga que explicar después.

**Migraciones versionadas:** hoy `legado-holding` **no tiene** una carpeta de
migraciones SQL versionadas en el repo (el esquema se administra a mano desde
el dashboard de Supabase, a juzgar por lo que hay en el repo). Se recomienda
introducir `supabase/migrations/NNNN_descripcion.sql` como parte de la Fase 0
de este trabajo — mejora la trazabilidad y es no-destructivo (no obliga a
migrar lo ya existente, solo aplica hacia adelante). Confirmar con el usuario
antes si prefiere seguir aplicando cambios manualmente desde el dashboard.

## Decisión 3 — Rutas del Worker (`/admin/prevision/*`)

Mismo agrupamiento que los endpoints PHP actuales, mapeado a REST bajo un
prefijo común. Ejemplos (no exhaustivo — cada fase del roadmap detalla las
suyas):

| Dominio PHP actual | Rutas nuevas sugeridas |
|---|---|
| `prevision_clientes.php` | `GET/POST /admin/prevision/clientes`, `PATCH/DELETE /admin/prevision/clientes/:id` |
| `prevision_planes.php` | `GET/POST /admin/prevision/planes`, `PATCH /admin/prevision/planes/:id`, `PATCH /admin/prevision/planes/:id/toggle` |
| `prevision_contratos.php` (contratos) | `GET/POST /admin/prevision/contratos`, `PATCH /admin/prevision/contratos/:id`, `POST /admin/prevision/contratos/:id/estatus` |
| `prevision_contratos.php` (cuotas) | `GET /admin/prevision/contratos/:id/cuotas`, `POST /admin/prevision/contratos/:id/cuotas/generar` |
| `prevision_contratos.php` (pagos) | `GET /admin/prevision/contratos/:id/pagos`, `POST /admin/prevision/contratos/:id/pagos` |
| `prevision_vendedores.php` (comisiones) | `GET /admin/prevision/comisiones`, `POST /admin/prevision/comisiones/calcular`, `POST /admin/prevision/comisiones/:id/aprobar`, `POST /admin/prevision/comisiones/:id/pagar` |
| `prevision_siniestros.php` | `GET/POST /admin/prevision/siniestros`, `POST /admin/prevision/siniestros/:id/detalles` |
| `prevision_cobranza.php` | `GET /admin/prevision/cobranza/morosos`, `POST /admin/prevision/cobranza/gestiones`, `GET/PUT /admin/prevision/cobranza/lapsado-config` |
| `prevision_reportes.php` | `GET /admin/prevision/reportes/aging` (+ `?formato=csv`), etc. |

Seguir el estilo de respuesta de `admin.js` (`{ data: ... }` en éxito,
`{ error: "..." }` en fallo con status HTTP correcto), no el `{ ok: true|false
}` de Funerzul — **son proyectos distintos, cada uno mantiene su propia
convención**; no mezclar estilos de respuesta dentro de un mismo repo.

## Decisión 4 — Cron del auto-lapsado

Funerzul usa `cron/prevision_lapsar.php` llamado por cron de cPanel (URL +
token). En Cloudflare, el equivalente nativo es un **Cron Trigger** en
`wrangler.toml`:

```toml
[triggers]
crons = ["0 8 * * *"]  # 8am UTC diario, ajustar a horario de negocio real
```

y en `index.js` (o un módulo aparte) manejar el evento `scheduled`. Esto sí
implica una edición pequeña de `wrangler.toml` y potencialmente de
`index.js` (agregar el export `scheduled`) — comunicarlo explícitamente en la
spec de la fase que lo incluya, porque toca un archivo "protegido" (ver
límites en `00-contexto-y-limites.md`). Es aditivo (un export nuevo), no
debería interferir con el `fetch` existente.

## Decisión 5 — Cobro: reutilizar Invoice Ninja primero, no Mercantil

Legado Holding **ya tiene** integración con Invoice Ninja
(`worker/src/invoiceninja.js`): creación de clientes, facturas, facturas
recurrentes (`createRecurringInvoice`), suscripciones (`createSubscription`,
`listSubscriptions`) y envío de email de cobro. Esto es exactamente lo que
necesita la cobranza de cuotas de previsión (cuota periódica = factura
recurrente).

**Recomendación:** para las cuotas de contratos de previsión, generar la
facturación recurrente en Invoice Ninja reutilizando `createIN(env)` tal
cual existe, en vez de reconstruir un sistema de cuotas 100% interno como en
Funerzul. `prev_cuotas` en Supabase pasa a ser el **registro de control**
(qué se debe, qué se pagó, para reportes y UI), y el cobro real (recordatorio,
link de pago, recurrencia) lo hace Invoice Ninja — mismo patrón que ya usa el
checkout de `legadoweb`.

La máquina de estados de `prev_pagos_electronicos` (ver referencia del módulo
actual) sigue siendo un buen diseño de referencia si más adelante se necesita
un cobro **directo** (botón de pago tipo Mercantil) en vez de depender de la
factura de Invoice Ninja — pero no es prioridad de la Fase 0. Se retoma en el
roadmap (mejora "Portal de autogestión").

## Decisión 6 — Frontend: pestaña nueva, no archivo nuevo suelto

En `admin/index.html`, agregar un tab más al `<nav>` existente:

```html
<button class="tab" data-tab="prevision">Previsión</button>
```

y una `<section id="tab-prevision" class="tab-content">` con su propio
sub-layout de consola (nav lateral + contenido, como recomienda
`01-modulo-actual-referencia.md`).

Para el JS: **no** meter todo dentro de `admin.js` (520 líneas hoy, y
previsión es más grande que todo lo demás junto). Crear `admin/prevision.js`,
cargado con un `<script>` adicional **después** de `admin.js` en
`index.html`. Para compartir `api()`, `$`, `escapeHtml`, `getToken`, etc. sin
duplicar código, la opción más simple sin build es exponerlos como
`window.LegadoAdmin = { api, $, $$, escapeHtml, formatDate, getToken }` al
final de `admin.js` (una línea nueva, no rompe nada existente) y consumirlos
desde `prevision.js` como `const { api, $ } = window.LegadoAdmin;`.

Extender `setupTabs()` en `admin.js` para que, al activar `data-tab="prevision"`,
llame al controlador de previsión — esto sí toca `admin.js`, pero es una
línea añadida al `if` existente (mismo patrón que las otras 4 pestañas), no
una reescritura.

## Resumen de qué se toca vs. qué no

| Archivo | Se toca | Cómo |
|---|---|---|
| `worker/src/index.js` | No (probablemente) | Ya delega todo `/admin/*` genéricamente |
| `worker/src/admin.js` | Sí, mínimo | +1 `import`, +3 líneas de dispatch a `prevision/router.js` |
| `worker/src/supabase.js` | No | Cliente nuevo separado en `prevision/db.js` |
| `worker/src/prevision/**` | Nuevo | Todo el código del módulo |
| `worker/wrangler.toml` | Sí, si se implementa el cron | `[triggers]` nuevo |
| `admin/index.html` | Sí, aditivo | +1 botón de tab, +1 `<section>` |
| `admin/admin.js` | Sí, mínimo | +1 línea en `setupTabs()`, +1 línea de export a `window.LegadoAdmin` |
| `admin/prevision.js` | Nuevo | Todo el frontend del módulo |
| Supabase | Nuevo | Tablas `prev_*` nuevas; tablas existentes intactas |
