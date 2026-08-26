# API pública para los wizards de compra (Legado Holding / Funeraria del Zulia)

Fase D (docs/PLAN.md). Contrato para el backend de `legadoholding.com` y
`funerariadelzulia.com` que construya el wizard de compra y las tarjetas de
planes/servicios — **nunca para el navegador del comprador directamente en los endpoints
de escritura** (ver "Autenticación" abajo; el catálogo sí es de navegador).

**Actualizado 2026-08-25** tras verificar el código actual: la sección de Stripe/Legado
Holding de versiones anteriores de este documento decía "todavía no implementado" — eso
ya no es así, el cobro con tarjeta para LH está implementado y probado
(`src/routes/compras-publico.ts`, `src/lib/stripe.ts`, `test/fase-d-api-publica.test.ts`).
Lo único que sigue bloqueado es que **Legado Holding Inc. todavía no tiene su cuenta
Stripe de producción** (sigue en modo test/sandbox) — ver "Sección 0" y
`docs/PLAN.md` sección 9.

## Sección 0 — Referencia rápida para conectar desde legadoholding.com

Pensada para pegar directo en el contexto de un IDE con IA que vaya a modificar el
wizard de compra o las tarjetas de planes/servicios del sitio de Legado Holding.

| Dato | Valor |
|---|---|
| Base URL (producción, hoy) | `https://prevision-funeraria.sisteg.workers.dev` |
| Base URL (local, `wrangler dev`) | `http://127.0.0.1:8787` |
| Slug del tenant Legado Holding | `lh` |
| Slug del tenant Funeraria del Zulia | `fdz` |
| Moneda de LH | Siempre `USD` (tenant `modo: "unica"`) |
| Prefijo de las rutas de este documento | `/api/public/t/lh/...` |
| Dominio propio (`app.previsionfuneraria.com` o similar) | Todavía no conectado — usar la URL de `workers.dev` de arriba hasta que se enrute (`docs/PLAN.md` sección "1a") |

**Qué es público de navegador (CORS, sin token) vs. qué es server-to-server (token,
nunca en el navegador):**

| Endpoint | Desde dónde se llama | Auth |
|---|---|---|
| `GET /api/public/t/lh/planes` , `/planes/:planSlug` | Navegador del visitante (`fetch()` directo) | Ninguna — CORS restringido a `legadoholding.com`/`funerariadelzulia.com` |
| `GET /api/public/t/lh/servicios` , `/servicios/:servicioSlug` | Navegador del visitante | Ninguna — mismo CORS |
| `POST /api/public/t/lh/solicitudes` (leads) | Navegador del visitante | Ninguna — mismo CORS |
| `GET /api/public/t/lh/parentescos` | Backend del sitio (server-to-server) | `Authorization: Bearer <token>` |
| `POST /api/public/t/lh/compras` (wizard) | Backend del sitio (server-to-server) | `Authorization: Bearer <token>` |

El token de API (`pf_...`) se genera una sola vez desde el panel admin (`Empresa` →
"API de integración", con el tenant `lh` seleccionado) y vive **solo** como secreto del
backend de `legadoholding.com` — nunca en JS que llegue al navegador, nunca en un repo
público. Ver "Generar el token" más abajo para el mecanismo exacto.

**Conectar el wizard de LH en 3 pasos:**

1. El backend de `legadoholding.com` guarda el token (`pf_...`) como secreto propio y
   arma el header `Authorization: Bearer <token>` en cada llamada a
   `/api/public/t/lh/compras` y `/api/public/t/lh/parentescos`.
2. Las tarjetas de planes/servicios llaman directo desde el navegador a
   `GET /api/public/t/lh/planes` y `GET /api/public/t/lh/servicios` (sin token, ya con
   CORS abierto para `legadoholding.com`) — no hace falta pasar por el backend propio
   para esto.
3. El wizard arma el `POST /api/public/t/lh/compras` con `forma_pago: "tarjeta"`,
   `moneda_pago: "USD"`, y **`success_url`/`cancel_url` obligatorios** (a dónde vuelve el
   comprador en `legadoholding.com` después de pagar/cancelar en Stripe Checkout) — la
   respuesta trae `link_de_cobro`, y el wizard debe redirigir ahí. Nunca marca nada
   pagado por esa vuelta del navegador: la confirmación real llega por el webhook firmado
   de Stripe (`/webhooks/stripe`), que ya está resuelto de este lado, sin nada que el
   sitio de LH necesite implementar.

**Lo único externo que sigue bloqueando el cobro real con dinero real en LH:** la cuenta
Stripe de producción de Legado Holding Inc. todavía no existe (KYC/verificación de
negocio pendiente, fuera del control de este repo) — hasta entonces, el tenant `lh` sigue
configurado con credenciales de **test** de Stripe (`sk_test_...`), así que cualquier
compra real hoy es simulada por Stripe, no dinero real. No es un bloqueo de código ni de
esta API — el wizard se puede construir y probar de punta a punta contra el modo test ya
mismo.

## Base URL y resolución de tenant

`https://prevision-funeraria.sisteg.workers.dev/api/public/t/:slug/...` — `:slug` es
`fdz` o `lh`. Cuando haya dominio propio configurado (`control.tenants.dominio`), también
resuelve por hostname real; hasta entonces, el prefijo `/t/:slug` es el mecanismo que
funciona. Todos los ejemplos de este documento usan esa URL — cambiala si vas a probar
contra `wrangler dev` local (`http://127.0.0.1:8787` por defecto).

## Autenticación

Dos grupos de endpoints, con reglas distintas (ver también la tabla de la Sección 0):

- **Catálogo (`GET /planes`, `GET /servicios`) y leads (`POST /solicitudes`)**: público,
  sin autenticación, CORS restringido a `funerariadelzulia.com`/`legadoholding.com`
  (`src/lib/public-cors.ts`) — pensado para `fetch()` directo desde el navegador del
  visitante.
- **Parentescos (`GET /parentescos`) y compra (`POST /compras`)**: requieren un token de
  API por tenant, header `Authorization: Bearer <token>`. **Esto es server-to-server —
  el token nunca debe llegar al navegador del comprador.** El backend de cada sitio (el
  Worker de `legado-holding`, o su equivalente en FDZ) es quien guarda el token como
  secreto propio y hace el `fetch` a esta API, igual que ya hace hoy con `IN_TOKEN` en
  `legado-holding/worker/src/invoiceninja.js`.

### Generar el token

**Forma normal — panel admin:** entrá a `Empresa` (menú "Configuración") con el tenant
correcto seleccionado arriba, sección "API de integración" → botón "Generar / regenerar
token". Se muestra una sola vez — copialo antes de salir de la pantalla, no hay forma de
volver a verlo (solo regenerar uno nuevo, lo que invalida el anterior).

**Forma por API (para probar sin abrir el panel):** requiere una sesión de staff (no el
token de API — es la ruta que *genera* el token). `POST /api/t/:slug/config/api-token/regenerar`
con la cookie de sesión que devuelve `/api/auth/login`:

```bash
# 1) Login como staff -- guarda la cookie de sesión en un archivo
curl -s -c cookies.txt -X POST https://prevision-funeraria.sisteg.workers.dev/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"tu-email@previsionfuneraria.com","password":"tu-contraseña"}'

# 2) Generar el token de API para el tenant lh (o fdz)
curl -s -b cookies.txt -X POST https://prevision-funeraria.sisteg.workers.dev/api/t/lh/config/api-token/regenerar
# {"token":"pf_04eca327bb9e...", "prefix":"pf_04eca327", "created_at":"..."}
```

Guardá el valor de `"token"` — es lo único que necesitás de ahí en adelante, ningún paso
posterior de este documento usa la cookie de sesión de staff. `GET
/api/t/:slug/config/api-token` (misma cookie) muestra el prefijo y fecha de generación
para confirmar cuál está activo sin exponer el secreto completo.

## Catálogo (tarjetas de planes/servicios) — `GET /planes`, `GET /servicios`

Sin token, CORS abierto para `legadoholding.com`/`funerariadelzulia.com` — llamalo
directo desde el navegador para armar las tarjetas.

- Solo aparecen los ítems con `mostrar_web = true` (además de `activo`) — el staff decide
  qué se publica desde el panel (`planes.js`/`servicios.js`).
- `?idioma=en` devuelve `nombre`/`descripcion`/`descripcion_detallada` en inglés si el
  plan/servicio tiene esas columnas cargadas (`nombre_en`, etc.) — **nunca traduce
  automático**; si falta el texto en inglés, cae al español (nunca 404 por un idioma sin
  traducir).

`GET /api/public/t/lh/planes` → `{ items: [...] }`, cada item:

```json
{
  "id": 3,
  "slug": "plan-familiar",
  "nombre": "Plan Familiar",
  "descripcion": "...",
  "descripcion_detallada": "...",
  "moneda": "USD",
  "precio_mensual_centavos": 2500,
  "precio_anual_centavos": 25000,
  "meses_facturados_anual": 10,
  "tarifas": [
    { "edad_min": 0, "edad_max": 17, "precio_mensual_centavos": 1500 },
    { "edad_min": 18, "edad_max": 64, "precio_mensual_centavos": 2500 }
  ]
}
```

`GET /api/public/t/lh/servicios` → `{ items: [...], whatsapp_emergencia: "+584246950136" }`,
cada item:

```json
{
  "id": 5,
  "slug": "cremacion-directa",
  "nombre": "Cremación directa",
  "descripcion": "...",
  "descripcion_detallada": "...",
  "moneda": "USD",
  "precio_centavos": 80000,
  "es_emergencia": false
}
```

Si `es_emergencia` es `true`, el sitio debe mostrar un CTA directo a WhatsApp
(`whatsapp_emergencia` del mismo response) en vez de un formulario/CTA de compra —
`POST /solicitudes` rechaza (400) un lead contra un servicio marcado así a propósito, así
que no sirve como fallback.

`GET /api/public/t/lh/planes/:planSlug` y `GET /api/public/t/lh/servicios/:servicioSlug`
devuelven el mismo shape para un ítem individual (404 si no existe/no está publicado).

## `GET /parentescos` — catálogo para el formulario de afiliados

Requiere el mismo token que `/compras` (`Authorization: Bearer <token>`) — a diferencia
del catálogo de planes/servicios, este no es de navegador, es para que el backend del
wizard arme el `<select>` de parentesco con las reglas de validación correctas antes de
mandar la compra.

```bash
curl -s https://prevision-funeraria.sisteg.workers.dev/api/public/t/lh/parentescos \
  -H "Authorization: Bearer pf_..."
```

```json
{
  "items": [
    { "id": 1, "nombre": "TITULAR", "familiar_directo": true, "edad_min": 18, "edad_max": 79, "permite_sin_cedula": false },
    { "id": 3, "nombre": "HIJO (A)", "familiar_directo": true, "edad_min": 0, "edad_max": 100, "permite_sin_cedula": true },
    { "...": "..." }
  ]
}
```

Cada afiliado que se manda en `POST /compras` se valida contra estas reglas exactas
(`edad_min`/`edad_max` según la fecha de nacimiento, `documento_identidad` obligatorio si
`permite_sin_cedula` es `false`) — conviene validar en el frontend con este mismo catálogo
para no hacerle completar el formulario a alguien y recién enterarse del error al final.

## Atribución de canal / vendedor

Todo vendedor nace con su código y enlace de referido ya generados —
`POST /api/t/:slug/vendedores` (staff, alta de vendedor) devuelve `codigo_referido` y
`enlace_referido` (`<sitio web del tenant en Empresa>?ref=<codigo>`) en la misma
respuesta, sin un paso aparte. `enlace_referido` viene `null` si el tenant todavía no
tiene "Sitio web" cargado en Empresa — el código sigue existiendo igual, solo falta el
dominio para armar el link completo. `POST /api/t/:slug/vendedores/:id/codigo_referido`
sigue existiendo para **rotar** un enlace (invalida el anterior) o generarle uno a un
vendedor creado antes de este cambio. El sitio debe:

1. Leer `ref` de la URL al llegar el visitante y guardarlo (cookie/localStorage) para que
   sobreviva la navegación hasta el checkout.
2. Mandarlo como `atribucion.codigo_vendedor` en `POST /solicitudes` o `POST /compras`.

Si el código no existe o el vendedor está inactivo, se ignora silenciosamente (nunca
bloquea el lead/compra por un enlace roto). Sin código, mandar `atribucion.canal_origen`
(`"directo" | "redes_sociales" | "buscador" | "otro"`) según lo que el sitio ya sepa
(UTM, referrer) — opcional, pero es la única forma de diferenciar tráfico directo de
redes/buscador en los reportes.

```json
"atribucion": {
  "codigo_vendedor": "AB12CD34",
  "canal_origen": "redes_sociales",
  "utm_source": "instagram",
  "utm_medium": "social",
  "utm_campaign": "verano-2026",
  "referrer_url": "https://instagram.com/..."
}
```

## `POST /compras` — registrar una compra

Body:

```json
{
  "cliente": {
    "tipo_persona": "natural",
    "nacionalidad": "V",
    "documento_identidad": "12345678",
    "nombres": "...",
    "apellidos": "...",
    "fecha_nacimiento": "1990-01-01",
    "sexo": "F",
    "telefono_celular": "...",
    "email": "...",
    "direccion": "..."
  },
  "plan_id": 3,
  "frecuencia_pago": "mensual",
  "afiliados": [
    {
      "parentesco_id": 3,
      "nombres": "...",
      "apellidos": "...",
      "documento_identidad": null,
      "fecha_nacimiento": "2015-06-01",
      "sexo": "M"
    }
  ],
  "forma_pago": "tarjeta",
  "moneda_pago": "USD",
  "success_url": "https://www.legadoholding.com/gracias",
  "cancel_url": "https://www.legadoholding.com/cancelado",
  "atribucion": { "codigo_vendedor": "AB12CD34" }
}
```

- `cliente.documento_identidad`: si ya existe un cliente con ese documento en el tenant,
  se reutiliza (no se duplica) — el resto de `cliente` se ignora en ese caso.
- `afiliados`: mismas reglas de edad/parentesco que la creación interna de beneficiarios
  (`GET /parentescos` para consultar el catálogo). Se validan **todos** antes de crear
  nada; si uno falla, no se crea ni el cliente. El monto de cobertura por afiliado lo
  calcula el servidor — el wizard nunca lo manda.
- `forma_pago`: mismo catálogo que el resto del sistema —
  `efectivo | transferencia | pago_movil | punto | zelle | divisa | usdt | tarjeta | otro`.
  Para **Legado Holding** en la práctica solo importan dos: `"tarjeta"` (Stripe Checkout,
  cobro recurrente real) o cualquier otro valor (queda `pendiente` para conciliación
  manual por staff — útil para "voy a pagar por transferencia/Zelle" declarado en el
  wizard sin cobro automático).
- `pago_tarjeta`: **solo aplica al flujo de Mercantil (FDZ, Bs)** — Legado Holding nunca
  lo manda, usa `forma_pago: "tarjeta"` + `success_url`/`cancel_url` en su lugar (ver
  abajo).
- `success_url`/`cancel_url`: **obligatorios cuando `forma_pago === "tarjeta"`** — a dónde
  vuelve el comprador en el sitio del wizard después de pagar/cancelar en Stripe. El
  Worker nunca marca nada pagado por ese retorno del navegador — eso lo decide únicamente
  el webhook firmado de Stripe (`src/routes/webhooks-stripe.ts`, `/webhooks/stripe`).

### Qué pasa según la forma de pago (nunca se aprueba solo)

| Caso | Resultado |
|---|---|
| LH (o cualquier tenant en USD), `forma_pago: "tarjeta"` | Se crea una Stripe Checkout Session en **modo suscripción** (cobro recurrente según `frecuencia_pago` — semanal/quincenal/mensual/trimestral/semestral/anual, hasta que el titular cancele). HTTP 200, `estado: "pendiente_pago"`, `link_de_cobro` con la URL de Stripe Checkout a la que hay que redirigir al comprador. El contrato **no** existe todavía en este punto. |
| FDZ, `forma_pago: "punto"`, moneda `BS`, con `pago_tarjeta` | Cobro síncrono contra Mercantil. Aprobado → contrato `activo` ya mismo (HTTP 201, `estado: "confirmada"`). Rechazado → HTTP 200, `estado: "rechazada"`, `mensaje` con el motivo del banco. |
| Cualquier otro método (efectivo, transferencia, zelle, usdt, divisa) | Siempre HTTP 200, `estado: "pendiente"` — el staff confirma manualmente desde el panel (`Compras pendientes`) una vez verifica el pago fuera de línea. |

Respuesta cuando queda pendiente de conciliación manual:

```json
{ "compra_pendiente_id": 12, "estado": "pendiente", "mensaje": "Recibimos tu solicitud. Te contactaremos para confirmar el pago." }
```

Respuesta del flujo Stripe (LH), antes de que el comprador pague:

```json
{ "compra_pendiente_id": 12, "estado": "pendiente_pago", "link_de_cobro": "https://checkout.stripe.com/c/pay/cs_..." }
```

Respuesta cuando se confirma al toque (Mercantil aprobado, FDZ):

```json
{ "compra_pendiente_id": 12, "estado": "confirmada", "contrato_id": 145, "contrato_numero": "146", "mensaje": "Pago aprobado. Tu contrato quedó activo." }
```

**Cómo se activa el contrato en el flujo Stripe (LH):** cuando el comprador termina de
pagar en Stripe Checkout, Stripe manda el evento `checkout.session.completed` (u otro
relacionado a la suscripción) al webhook firmado (`/webhooks/stripe`), que ya está
implementado y verificado en este repo — **el sitio de LH no necesita implementar ni
llamar nada acá**, solo mostrar una pantalla de "procesando" o "gracias" en
`success_url` y, si querés confirmar que ya quedó activo, consultar el contrato con
sesión de staff (`GET /api/t/lh/contratos?cliente_id=...`) o esperar la notificación que
el sistema ya envíe (mensajería, Fase 7).

**Por qué no existe un contrato "pendiente" visible en `/contratos` mientras se resuelve
el pago:** se evaluó agregar un estatus `pendiente` a `contratos`, pero D1 no permite
reconstruir esa tabla mientras otras 6 la referencian por FK (ver el plan de esta fase).
En su lugar, la compra vive en `compras_pendientes` — **el cliente sí se crea de una
vez** (para que el staff pueda contactarlo aunque el pago no se resuelva), pero el
contrato real recién se crea al confirmar. Panel de staff:
`GET/POST /api/t/:slug/compras-pendientes/...` (`confirmar`, `rechazar`, `cancelar`).

## Cómo probar el flujo de Legado Holding (Stripe), paso a paso

Todo con `curl`; cualquier cliente HTTP sirve igual (Postman, Insomnia, etc.).

### Paso 0 — generar el token

Ver "Generar el token" arriba. De acá en adelante, `$TOKEN` es ese valor.

```bash
export TOKEN="pf_..."
export BASE="https://prevision-funeraria.sisteg.workers.dev"
```

### Paso 1 — catálogo público (sin token, así lo va a llamar el sitio)

```bash
curl -s "$BASE/api/public/t/lh/planes" | python3 -m json.tool
curl -s "$BASE/api/public/t/lh/planes?idioma=en" | python3 -m json.tool
curl -s "$BASE/api/public/t/lh/servicios" | python3 -m json.tool
```

Confirmá que los planes/servicios que esperás ver en la web aparecen (y que los que
tienen `mostrar_web` desactivado, no).

### Paso 2 — catálogo de parentescos (con token)

```bash
curl -s "$BASE/api/public/t/lh/parentescos" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

Anotá el `id` de un parentesco que permita afiliados sin cédula y con rango de edad
amplio (p. ej. `HIJO (A)`) para usarlo en el paso siguiente.

### Paso 3 — una compra con tarjeta (Stripe Checkout, modo test)

Usá un `plan_id` real (sacalo del paso 1). El tenant `lh` debe tener Stripe activo en
"Conexiones de pago" con credenciales de **test** (`sk_test_...`) — mientras la cuenta de
producción no exista, cualquier prueba usa el modo test de Stripe (tarjetas de prueba
públicas de Stripe, nunca datos reales).

```bash
curl -s -X POST "$BASE/api/public/t/lh/compras" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "cliente": {"documento_identidad":"US-TEST-001","nombres":"Prueba","apellidos":"Wizard"},
    "plan_id": 3,
    "frecuencia_pago": "mensual",
    "afiliados": [],
    "forma_pago": "tarjeta",
    "moneda_pago": "USD",
    "success_url": "https://www.legadoholding.com/gracias",
    "cancel_url": "https://www.legadoholding.com/cancelado"
  }'
# {"compra_pendiente_id":X,"estado":"pendiente_pago","link_de_cobro":"https://checkout.stripe.com/c/pay/..."}
```

Abrí `link_de_cobro` en un navegador y completá el pago con una tarjeta de prueba de
Stripe (`4242 4242 4242 4242`, cualquier fecha futura, cualquier CVC — es la tarjeta de
prueba pública documentada por Stripe, no un dato de este proyecto). Confirmá que el
contrato quedó activo con sesión de staff:

```bash
curl -s -b cookies.txt "$BASE/api/t/lh/clientes?q=Wizard" | python3 -m json.tool
# tomá el cliente_id y confirmá el contrato:
curl -s -b cookies.txt "$BASE/api/t/lh/contratos?cliente_id=<ID>" | python3 -m json.tool
```

### Paso 4 — una compra que queda pendiente (transferencia, Zelle...)

```bash
curl -s -X POST "$BASE/api/public/t/lh/compras" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "cliente": {"documento_identidad":"US-TEST-002","nombres":"Prueba","apellidos":"Zelle"},
    "plan_id": 3,
    "frecuencia_pago": "mensual",
    "afiliados": [],
    "forma_pago": "zelle",
    "moneda_pago": "USD"
  }'
# {"compra_pendiente_id":X,"estado":"pendiente","mensaje":"Recibimos tu solicitud..."}
```

Confirmá que aparece en el panel → "Compras pendientes" para conciliación manual del
staff.

### Paso 5 — probar un afiliado inválido (nunca debe crear nada)

```bash
curl -s -X POST "$BASE/api/public/t/lh/compras" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{
    "cliente": {"documento_identidad":"US-TEST-003","nombres":"Prueba","apellidos":"AfiliadoInvalido"},
    "plan_id": 3, "frecuencia_pago": "mensual",
    "afiliados": [{"parentesco_id": 1, "nombres":"Muy","apellidos":"Joven","fecha_nacimiento":"2020-01-01"}],
    "forma_pago": "zelle", "moneda_pago": "USD"
  }'
# HTTP 400 -- el parentesco TITULAR (id 1) exige 18-79 años
```

Confirmá que **no** se creó el cliente `US-TEST-003` (`GET /clientes?q=AfiliadoInvalido`
debe venir vacío, sesión de staff) — la validación de afiliados corre antes de crear
nada.

### Paso 6 — atribución de vendedor

```bash
# Generar un código (staff)
curl -s -b cookies.txt -X POST "$BASE/api/t/lh/vendedores/1/codigo_referido"
# {"id":1, "codigo_referido":"AB12CD34", ...}

# Mandarlo en una compra
curl -s -X POST "$BASE/api/public/t/lh/compras" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{
    "cliente": {"documento_identidad":"US-TEST-004","nombres":"Prueba","apellidos":"ConVendedor"},
    "plan_id": 3, "frecuencia_pago": "mensual", "afiliados": [],
    "forma_pago": "zelle", "moneda_pago": "USD",
    "atribucion": {"codigo_vendedor": "AB12CD34", "canal_origen": "vendedor"}
  }'
```

Confirmá que la compra pendiente (`GET /compras-pendientes`, staff) trae `vendedor_id`
resuelto al id real del vendedor. Repetí con un código inventado (`"ZZZZZZZZ"`) y
confirmá que la compra **igual se crea** (código inválido nunca bloquea).

## Cómo probar el flujo de Funeraria del Zulia (Mercantil), referencia

Mismo mecanismo, tenant `fdz`, moneda `BS`, `forma_pago: "punto"` con `pago_tarjeta`
(cobro síncrono contra el sandbox de Mercantil). Detalle completo y tarjetas de prueba en
`smoke-tests/mercantil-sandbox.env` (gitignored, no en este documento) y el bloqueo de
red conocido documentado en `task.md`/`docs/PLAN.md` sección 9 (2026-08-24) — no repetido
acá para no duplicar.

## Errores

Todos los endpoints devuelven `{ "error": "mensaje" }` con el código HTTP correspondiente
(400 validación, 401 token, 404 recurso). `POST /compras` es la excepción deliberada: un
rechazo de pago o una compra que queda pendiente **no** es un error HTTP — son resultados
válidos del negocio, ver la tabla arriba.

## Checklist antes de conectar el frontend real de Legado Holding

- [ ] El token de API vive **solo** en el backend del sitio (variable de entorno/secret
      del Worker de `legado-holding`) — nunca en JS que llegue al navegador, nunca en un
      repo.
- [x] El sitio lee `?ref=` al aterrizar y lo reenvía en `atribucion.codigo_vendedor` en
      cada lead/compra durante toda la sesión del visitante (no solo en la primera
      request). — Implementado 2026-08-26: `js/main.js` §ATRIBUCIÓN (first-touch, TTL
      90d, `localStorage`), `worker/src/attribution.js`, wizard + Alma. Ver
      `docs/atribucion-vendedor-plan-legado.md`. **Pendiente del lado Previsión:**
      propagación al contrato vía webhook de Stripe — `docs/ajustes-prevision-funeraria-atribucion-vendedor.md`.
- [ ] El formulario de afiliados valida edad/cédula en el cliente usando
      `GET /parentescos` (paso 2) para no descubrir el error recién al enviar.
- [ ] El wizard maneja los tres resultados posibles de `POST /compras` por separado:
      `"pendiente"` (mostrar "te contactaremos"), `"pendiente_pago"` (redirigir a
      `link_de_cobro`), `"confirmada"` (solo ocurre en FDZ/Mercantil, no en LH).
- [ ] `success_url`/`cancel_url` apuntan a páginas reales del sitio de LH que existen
      antes de conectar esto en producción.
- [ ] Probaste al menos un pago completo con la tarjeta de prueba pública de Stripe
      (`4242 4242 4242 4242`) contra el modo test del tenant `lh` y confirmaste que el
      contrato queda `activo` tras el webhook.
- [ ] Entendés que hasta que exista la cuenta Stripe de producción de Legado Holding
      Inc., **ningún cobro de este flujo es dinero real** — es un bloqueo de negocio
      (KYC), no de este código ni de esta API (`docs/PLAN.md` sección 9).
