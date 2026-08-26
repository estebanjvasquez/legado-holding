# Ajustes requeridos en Prevision-Funeraria — atribución de vendedores externos (tenant `lh`)

> **Repo destino:** `estebanjvasquez/Prevision-Funeraria` (Cloudflare Workers + D1).
> **Origen del pedido:** Legado Holding va a operar con vendedores externos que
> trabajan con un enlace de referido del tipo `https://www.legadoholding.com?ref=MN4UYC5Y`.
> El sitio y el bot Alma tienen que atribuir **toda** transacción (compra, lead,
> derivación a WhatsApp) al vendedor dueño de ese código, dentro del tenant `lh`.
> **Este documento lista solo lo que hay que tocar en Prevision-Funeraria.** Lo que
> se hace del lado de `legado-holding` (captura y propagación del `?ref=`) está en
> `docs/atribucion-vendedor-plan-legado.md` / en el hilo de la conversación.
>
> **Fecha:** 2026-08-26 · **Estado:** propuesta, sin verificar contra el código de
> Prevision-Funeraria (no hay acceso a ese repo ni a sesión de staff desde acá).

---

## 0. Lo que YA funciona (no rehacer)

Verificado contra `docs/api-publica-wizard.md` y probado en vivo el 2026-08-26
contra `https://prevision-funeraria.sisteg.workers.dev/api/public/t/lh/...`:

| Capacidad | Estado |
|---|---|
| `POST /compras` acepta `atribucion.codigo_vendedor` (+ `canal_origen`, `utm_*`, `referrer_url`) | ✅ documentado |
| `POST /solicitudes` acepta el mismo bloque `atribucion` | ✅ probado: `POST` con `atribucion.codigo_vendedor:"MN4UYC5Y"` → `201 {"ok":true}` sin error |
| Código inexistente/inactivo se ignora en silencio (nunca bloquea el lead/compra) | ✅ documentado |
| Alta de vendedor devuelve `codigo_referido` + `enlace_referido` (`<sitio>?ref=<codigo>`) | ✅ documentado (`POST /api/t/lh/vendedores`) |
| `GET /compras-pendientes` (staff) expone `vendedor_id` ya resuelto | ✅ documentado (paso 6 del test) |

**Conclusión:** el "canal de entrada" del dato ya existe. Los gaps de abajo son de
**propagación, visibilidad y modelo de datos**, no de "aceptar el campo".

---

## 1. GAP CRÍTICO — la atribución no está confirmada en el contrato final del flujo Stripe

### Problema

El flujo real de Legado Holding es **tarjeta / Stripe** (`forma_pago: "tarjeta"`):

1. `POST /compras` crea una fila en `compras_pendientes` con `estado: "pendiente_pago"`
   y (según el doc) `vendedor_id` resuelto.
2. El **contrato real no existe todavía.** Se crea recién cuando llega
   `checkout.session.completed` al webhook firmado (`/webhooks/stripe`).
3. Las **comisiones** (`semana1`, `fin_mes1`, `mes2`, `mes13`) se calculan sobre el
   **contrato** y su `vendedor`, no sobre `compras_pendientes`.

Si el handler del webhook crea el contrato sin copiar `vendedor_id` (y
`canal_origen` / `utm_*`) desde la fila de `compras_pendientes`, **todas las ventas
digitales de LH quedan sin vendedor** y no generan comisión. Es el caso más
probable de fuga porque son dos escrituras separadas en el tiempo, con un salto por
Stripe en el medio.

### Qué verificar / ajustar en Prevision-Funeraria

- [ ] En `src/routes/webhooks-stripe.ts` (o donde se materialice el contrato al
      confirmar el pago): confirmar que `contratos.vendedor_id` se toma de la fila
      `compras_pendientes` correspondiente. Si no, agregarlo.
- [ ] Propagar también `canal_origen`, `utm_source/medium/campaign`, `referrer_url`
      al contrato (o a una tabla de atribución ligada al contrato) para reportes.
- [ ] **Cinturón y tirantes:** al crear la Stripe Checkout Session, setear
      `client_reference_id` = `codigo_vendedor` (o `compra_pendiente_id`) y
      `metadata.codigo_vendedor` / `metadata.compra_pendiente_id`. Así, aunque se
      pierda el join con `compras_pendientes`, el webhook puede recuperar el
      vendedor desde el propio evento de Stripe.
- [ ] Idempotencia: si el mismo `checkout.session.completed` llega dos veces (Stripe
      reintenta), no duplicar contrato ni comisiones.

### Criterio de "hecho"

Una compra `POST /compras` con `atribucion.codigo_vendedor: "<código real de lh>"`
y `forma_pago: "tarjeta"`, pagada con `4242 4242 4242 4242` en modo test, produce un
**contrato** cuyo `vendedor_id` es el del código, visible en
`GET /api/t/lh/contratos?cliente_id=...` (sesión de staff), y las comisiones que se
calculen para ese contrato apuntan a ese vendedor.

---

## 2. GAP — `POST /solicitudes` (leads): confirmar persistencia y visibilidad del vendedor

### Problema

El bloque `atribucion` se **acepta** (probado: `201 {"ok":true}`), pero desde afuera
no se puede confirmar que:

- `vendedor_id` se **resuelve y persiste** en la tabla de solicitudes públicas
  (`prev_solicitudes_publicas` / equivalente D1).
- El staff **ve** ese vendedor en el panel de leads.
- Al **convertir un lead en contrato**, el vendedor del lead se **prellena** en el
  contrato resultante.

Esto importa para dos caminos de Legado Holding:

1. **Planes Selecto** (ver §4): hoy no tienen checkout digital, su CTA manda a
   contacto. Un vendedor que refiere un cliente Selecto **solo** puede ser atribuido
   por esta vía (lead con `codigo_vendedor` → staff convierte → contrato con ese
   vendedor).
2. **Alma – consulta informativa** (`create_lead`): registra un prospecto con el
   plan/servicio de interés. Debe llevar el vendedor.

### Qué ajustar en Prevision-Funeraria

- [ ] Confirmar/implementar resolución de `codigo_vendedor` → `vendedor_id` en el
      handler de `POST /public/.../solicitudes`, con las mismas reglas que
      `/compras` (código inválido → se ignora, no bloquea).
- [ ] Exponer `vendedor_id` + `vendedor_nombre` y `canal_origen` en el listado de
      leads del panel de staff.
- [ ] En el flujo "convertir solicitud → contrato", usar el `vendedor_id` de la
      solicitud como valor por defecto del `vendedor` del contrato (editable por
      staff, pero prellenado).
- [ ] **Devolver el `id` de la solicitud creada** en la respuesta. Hoy responde
      `{"ok":true}` sin id — el sitio no puede loguear ni rastrear el lead. Sugerido:
      `{"ok":true,"solicitud_id":123}`.

### Criterio de "hecho"

`POST /solicitudes` con `atribucion.codigo_vendedor` → la solicitud aparece en el
panel con el nombre del vendedor; al convertirla, el contrato nace con ese vendedor.

---

## 3. GAP — endpoint de lookup de vendedor por código (para la derivación a WhatsApp)

### Problema

Cuando Alma deriva a un humano por WhatsApp (`handoff_whatsapp`: urgencia real, o
duelo activo sin aliado en la ciudad), **no se crea ninguna transacción en la API en
ese momento** — la venta la registra el staff manualmente después de la conversación.

El único canal de atribución en ese caso es el **texto pre-llenado del WhatsApp**,
que hoy no menciona al vendedor. El agente humano necesita saber, al recibir el
mensaje, que "las ventas de este contacto van al vendedor X".

Para que Alma escriba algo útil ("Referido por: **Juan Pérez**") en vez de un código
crudo ("Referido por: MN4UYC5Y"), hace falta poder resolver el código → nombre.

### Qué agregar en Prevision-Funeraria

- [ ] `GET /api/public/t/lh/vendedores/lookup?codigo=MN4UYC5Y`
  - Auth: **con token** (server-to-server, igual que `/parentescos`), NO público de
    navegador — evita enumeración de la lista de vendedores desde el browser.
  - Respuesta `200`: `{ "activo": true, "codigo": "MN4UYC5Y", "nombre": "Juan Pérez" }`
    (solo nombre para mostrar, sin teléfono/email/% de comisión ni ningún otro PII).
  - Código inexistente o vendedor inactivo → `200 { "activo": false }` (no 404, para
    que el consumidor no tenga que distinguir casos de error).
- [ ] Rate-limit básico (es un endpoint que recibe un código arbitrario).

### Para qué lo usa Legado Holding

1. **Alma / `handoff_whatsapp`:** el Worker resuelve el código y arma el texto:
   `"Hola, soy <nombre>. Estuve con Alma sobre: <necesidad>. (Contacto referido por
   el vendedor <nombre del vendedor> — cód. MN4UYC5Y.)"`.
2. **Sitio web:** banner discreto "Estás siendo atendido por recomendación de
   **<vendedor>**" cuando llega con `?ref=` válido — refuerza confianza y le avisa
   al visitante que su vendedor sigue asociado.

### Alternativa si no se quiere un endpoint nuevo

Que `POST /api/t/lh/vendedores` (que ya devuelve `codigo_referido`) tenga un
`GET /api/t/lh/vendedores?codigo=...` equivalente (staff). Pero eso obliga a Alma a
usar sesión de staff, que no tiene. El endpoint público-con-token es más limpio.

---

## 4. GAP CONOCIDO — cuota inicial de los planes "Selecto"

### Estado 2026-08-26 (tarde) — parcialmente resuelto

- ✅ **4.1 / 4.2 hechos:** `GET /api/public/t/lh/planes` ya devuelve
  `cuota_inicial_centavos` (`esencial-selecto`=3500, `vanguardia-selecto`=5500) y
  `cuota_inicial_concepto: "Cuota de afiliación"`. El frontend de `legado-holding`
  ya los lee y los muestra en las tarjetas y el wizard.
- ❌ **4.3 SIN HACER / roto:** `POST /api/public/t/lh/compras` devuelve **HTTP 500
  "Internal Server Error"** para cualquier plan con `cuota_inicial_centavos > 0`
  (probado 2026-08-26 con `esencial-selecto` id 3 y `vanguardia-selecto` id 4,
  mensual y anual, con y sin atribución — los planes Zulia siguen dando 200). El
  builder del Stripe Checkout no está armando la cuota inicial one-time + la
  suscripción. **Este es el bloqueo actual.**
- ⏸️ **4.6 bloqueado por 4.3:** en `legado-holding` el checkout de Selecto está
  implementado completo pero **apagado con un flag** (`SELECTO_CHECKOUT_ENABLED =
  false` en `js/main.js`). Se enciende con un one-liner + bump de `?v=` en cuanto
  `/compras` deje de dar 500. Mientras tanto el CTA de Selecto sigue en `#contacto`.

### Problema original

`GET /api/public/t/lh/planes` devolvía:

| slug | id | `precio_mensual_centavos` | `precio_anual_centavos` | cuota inicial |
|---|---|---|---|---|
| `esencial-selecto` | 3 | 947 | 9470 | **$35 — solo en texto libre** |
| `vanguardia-selecto` | 4 | 1470 | 14700 | **$55 — solo en texto libre** |
| `esencial-zulia` | 1 | 947 | 9470 | — |
| `vanguardia-zulia` | 2 | 1470 | 14700 | — |

La cuota inicial de los Selecto **existe solo como frase dentro de
`descripcion_detallada`** (`"- Cuota inicial de $35 + $9,47/mes (misma
mensualidad)"`). No hay ningún campo estructurado. Consecuencias hoy:

- El frontend de `legado-holding` **excluye** `esencial-selecto` / `vanguardia-selecto`
  del wizard (`WIZARD_ENABLED_SLUGS`) y su CTA va a `#contacto`. El monto `$35`/`$55`
  está **hardcodeado** en `js/main.js` (`PLANS[].initial`).
- Un vendedor que refiere un cliente Selecto **no tiene checkout digital**: la única
  atribución posible es lead → conversión manual (depende de §2).
- Cuando exista la cuenta Stripe de producción, no se puede cobrar Selecto por el
  flujo actual porque el cobro sería solo la mensualidad, sin la cuota inicial.

### Qué agregar en Prevision-Funeraria

**4.1 — Modelo de datos (`planes`)**

- [ ] Nueva columna `cuota_inicial_centavos INTEGER NULL` (null / 0 = sin cuota
      inicial). Aplica a todos los tenants, no solo `lh`.
- [ ] Opcional: `cuota_inicial_concepto TEXT` ("Cuota de afiliación", etc.) para el
      detalle en el checkout y en la factura.
- [ ] Migrar los datos actuales: `esencial-selecto` → 3500, `vanguardia-selecto` →
      5500. Limpiar esa línea del `descripcion_detallada` una vez el dato viva en el
      campo estructurado (o dejarla, pero el sitio va a mostrar el campo).

**4.2 — API pública (`GET /planes`, `GET /planes/:slug`)**

- [ ] Incluir `cuota_inicial_centavos` (y `cuota_inicial_concepto` si se agrega) en
      cada item. El sitio ya está preparado para consumirlo (hoy usa un fallback
      hardcodeado justamente por esto).

**4.3 — `POST /compras` con cuota inicial + tarjeta (Stripe)**

Cuando `plan.cuota_inicial_centavos > 0` y `forma_pago: "tarjeta"`, la Stripe
Checkout Session (`mode: "subscription"`) tiene que cobrar **la cuota inicial una
sola vez + la suscripción recurrente**. Stripe lo soporta sin hacks:

- **Opción recomendada:** `subscription_data.add_invoice_items: [{ price:
  <price_id_cuota_inicial_one_time>, quantity: 1 }]` — agrega el ítem one-time
  **solo a la primera factura** de la suscripción. La suscripción sigue con la
  mensualidad/anualidad normal.
- Alternativa: incluir en `line_items` un price one-time junto al recurrente
  (Stripe lo pone en la primera factura). Misma idea, `add_invoice_items` es más
  explícito.
- Hace falta un **Stripe Price one-time** por cada plan con cuota inicial (crearlo
  al vuelo con lookup por `metadata`/`lookup_key`, o precrearlo desde el panel al
  setear `cuota_inicial_centavos`).
- La cuota inicial se cobra **una vez**, independiente de `frecuencia_pago`
  (mensual o anual). Confirmar con negocio si al renovar/reactivar un contrato
  lapsado se vuelve a cobrar (probablemente no).

**4.4 — `POST /compras` con cuota inicial + métodos no-tarjeta (zelle, transferencia…)**

- [ ] El monto que ve el staff en "Compras pendientes" para conciliación manual
      debe incluir la cuota inicial (`mensualidad + cuota_inicial` en el primer
      cobro).

**4.5 — Comisiones**

- [ ] Definir con negocio si la cuota inicial entra en la **base de cálculo de
      comisión** del vendedor o no. Ajustar `comision_calcular` según la respuesta.

**4.6 — Habilitar Selecto en el wizard**

Una vez 4.1–4.4 estén listos, del lado de `legado-holding` se agregan
`esencial-selecto` / `vanguardia-selecto` a `WIZARD_ENABLED_SLUGS` y se borra el
`PLANS[].initial` hardcodeado. **No hacer este paso antes** de que el cobro de la
cuota inicial funcione, o se cobraría de menos.

### Criterio de "hecho"

`GET /planes` trae `cuota_inicial_centavos: 3500` para `esencial-selecto`; una
compra de ese plan con tarjeta genera una primera factura de Stripe por
`$35 + $9,47` y luego cobra `$9,47/mes`; el contrato queda `activo` tras el webhook.

---

## 5. GAP MENOR — normalización de `codigo_vendedor`

### Problema

El código de ejemplo es `MN4UYC5Y` (8 chars, alfanumérico, mayúsculas). Si el
vendedor comparte el link por email/WhatsApp y el cliente lo re-tipea, o un cliente
de correo lo pasa a minúsculas, o se agrega un espacio, la atribución se cae en
silencio (código "no encontrado" → se ignora).

### Qué ajustar en Prevision-Funeraria

- [ ] Match de `codigo_vendedor` **case-insensitive** y con `trim()` (comparar
      `UPPER(TRIM(x))` contra `UPPER(codigo_referido)`).
- [ ] Documentar en `api-publica-wizard.md` el formato exacto del código
      (¿longitud fija? ¿charset? ¿excluye caracteres ambiguos como `0/O`, `1/I`?)
      para que el sitio pueda validar el shape antes de mandarlo.
- [ ] Que `enlace_referido` y `codigo_referido` usen siempre el mismo casing
      canónico.

---

## 6. GAP MENOR — reporte de canal digital por vendedor

### Problema

Un vendedor externo va a querer ver "cuántos contratos y leads generó mi link".
Las comisiones ya cubren la parte de dinero, pero no el pipeline (leads sin
convertir, compras pendientes de pago).

### Qué ajustar en Prevision-Funeraria

- [ ] Vista/endpoint (staff, y a  portal de vendedor) que liste, filtrado por
      `vendedor_id` / `codigo_referido`:
  - leads (`solicitudes`) con su estado,
  - compras pendientes de pago (Stripe sin completar),
  - contratos activos originados por web,
  - comisiones por etapa.
- [ ] Distinguir el `canal_origen` (`vendedor` vs `directo` vs `redes_sociales`…)
      en los reportes de captación que ya existan.

---

## 7. Resumen priorizado

| # | Ajuste | Prioridad | Bloquea a LH |
|---|---|---|---|
| 1 | Propagar `vendedor_id` de `compras_pendientes` → `contrato` en el webhook de Stripe (+ `metadata` en la Checkout Session) | **P0** | Sí — sin esto, ninguna venta digital con tarjeta tiene vendedor |
| 2 | `POST /solicitudes`: persistir/resolver vendedor, mostrarlo en panel, prellenar al convertir, devolver `solicitud_id` | **P0** | Sí — es el único canal de atribución para Selecto y para leads de Alma |
| 4 | Cuota inicial en el modelo `planes` + `GET /planes` + Stripe `add_invoice_items` | **P1** | Parcial — Selecto sigue sin checkout digital hasta que esté |
| 3 | `GET /vendedores/lookup?codigo=` (con token) | **P1** | No — el handoff funciona con el código crudo, pero queda pobre |
| 5 | Match case-insensitive + doc del formato del código | **P2** | No — pero causa fugas silenciosas |
| 6 | Reporte de canal digital por vendedor | **P2** | No |

**P0 = necesario antes de dar de alta vendedores externos reales en `lh`.**

---

## 8. Datos de contacto entre repos

- Contrato de la API consumida por LH: `legado-holding/docs/api-publica-wizard.md`
  (sección "Atribución de canal / vendedor" y "POST /compras").
- Tracking del proyecto Prevision-Funeraria: Notion, "Previsión Funeraria — Proyecto
  y documentación".
- Prueba en vivo que respalda §0 y §2 (2026-08-26):
  `POST https://prevision-funeraria.sisteg.workers.dev/api/public/t/lh/solicitudes`
  con `atribucion.codigo_vendedor:"MN4UYC5Y"` → `201 {"ok":true}`. También se
  comprobó que `plan_id`/`servicio_id`/`tipo` son opcionales y que `nombres`,
  `apellidos`, `telefono` son obligatorios (400 si faltan). **Quedaron 3 leads de
  prueba en el tenant `lh` — apellidos `REF-ATRIBUCION-TEST`, `HANDOFF-NOPLAN`,
  `HANDOFF-TIPOSOLO` — conviene borrarlos desde el panel.**
