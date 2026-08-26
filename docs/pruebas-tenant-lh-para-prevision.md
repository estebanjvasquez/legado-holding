# API del tenant `lh` — referencia de prueba para el agente de Prevision-Funeraria

> Para el agente que trabaja en `estebanjvasquez/Prevision-Funeraria`. Resume qué
> le pega `legado-holding` a la API del tenant `lh`, qué está verificado funcionando
> en vivo y qué está roto. **Fuente completa del contrato:**
> `legado-holding/docs/api-publica-wizard.md`.
>
> **Este archivo es el canal entre agentes.** El agente de `legado-holding` deja acá
> todo pedido de cambio o prueba que necesite del lado de Prevision-Funeraria (ver
> "Bitácora de pedidos" al final). El token de API vive en el sidecar gitignoreado
> `docs/pruebas-tenant-lh-para-prevision.SECRET.md`.

## Conexión

| Dato | Valor |
|---|---|
| Base URL (prod, la que usa el Worker de LH) | `https://prevision-funeraria.sisteg.workers.dev` |
| Base URL (local) | `http://127.0.0.1:8787` |
| Tenant slug | `lh` · moneda siempre `USD` |
| Prefijo público | `/api/public/t/lh/...` |
| Código de vendedor de prueba (real, activo) | `MN4UYC5Y` → resuelve a **"ESTEBAN"** |

### Token

`/compras`, `/parentescos` y `/vendedores/lookup` exigen `Authorization: Bearer pf_...`.

**El token activo del tenant `lh` (prefijo `pf_0224d44e`) está en el archivo hermano
`docs/pruebas-tenant-lh-para-prevision.SECRET.md`** (gitignoreado, misma máquina).
Usá **ese** — es el mismo que usa el Worker de `legado-holding` en producción.

⚠️ **NO regeneres el token de API de `lh`.** Regenerarlo invalida el del Worker de LH
y rompe el checkout + los leads de Alma hasta correr
`cd legado-holding/worker && wrangler secret put PF_TOKEN` con el nuevo valor (y
actualizar `.dev.vars` y el `.SECRET.md`).

Si preferís no tocar el token de prod: `wrangler dev` local con un token descartable,
o sesión de staff (cookie de `POST /api/auth/login`) para los endpoints `/api/t/lh/...`
internos. El catálogo y `/solicitudes` son públicos, sin token.

## Endpoints que consume legado-holding

| Endpoint | Quién llama | Auth | Estado en vivo |
|---|---|---|---|
| `GET /api/public/t/lh/planes` | navegador | — | ✅ 4 planes, `cuota_inicial_centavos` presente |
| `GET /api/public/t/lh/servicios` | navegador | — | ✅ 3 items (`es_emergencia:true`), `whatsapp_emergencia:"+584246950136"` |
| `POST /api/public/t/lh/solicitudes` | navegador | — | ✅ acepta `atribucion`; ⚠️ devuelve `{"ok":true}` sin `id` |
| `GET /api/public/t/lh/parentescos` | Worker LH | token | ✅ |
| `POST /api/public/t/lh/compras` | Worker LH | token | ✅ Zulia · ❌ **Selecto → HTTP 500** |
| `GET /api/public/t/lh/vendedores/lookup?codigo=` | Worker LH | token | ✅ `{"activo":true,"codigo":"MN4UYC5Y","nombre":"ESTEBAN"}` |

## Bloque `atribucion` (lo manda LH en `/compras` y `/solicitudes`)

```json
"atribucion": {
  "codigo_vendedor": "MN4UYC5Y",
  "canal_origen": "redes_sociales",
  "utm_source": "instagram",
  "utm_medium": "social",
  "utm_campaign": "verano-2026",
  "referrer_url": "https://instagram.com/..."
}
```

- Cuando hay `codigo_vendedor`, LH **no** manda `canal_origen`.
- Código inválido/inactivo → debe ignorarse en silencio (nunca bloquear).

## Body exacto de `POST /compras` (lo arma `worker/src/wizard-compra.js`)

```json
{
  "cliente": {
    "tipo_persona": "natural",
    "documento_identidad": "<string obligatorio — la API rechaza null>",
    "nombres": "Ana", "apellidos": "Pérez",
    "fecha_nacimiento": "1990-01-01",
    "telefono_celular": "+15550000000",
    "email": "ana@example.com"
  },
  "plan_id": 1,
  "frecuencia_pago": "mensual",
  "afiliados": [
    { "parentesco_id": 3, "nombres": "...", "apellidos": "...",
      "documento_identidad": null, "fecha_nacimiento": "2015-06-01" }
  ],
  "forma_pago": "tarjeta",
  "moneda_pago": "USD",
  "success_url": "https://www.legadoholding.com/gracias.html",
  "cancel_url": "https://www.legadoholding.com/cancelado.html",
  "atribucion": { "codigo_vendedor": "MN4UYC5Y" }
}
```

## Body de `POST /solicitudes` (Alma `create_lead` — `worker/src/alma.js`)

```json
{ "tipo": "plan", "nombres": "María", "apellidos": "González",
  "telefono": "+13055550199", "email": "maria@example.com",
  "plan_id": 1, "mensaje": "opcional",
  "atribucion": { "codigo_vendedor": "MN4UYC5Y" } }
```

Stub de atribución del handoff a WhatsApp (mismo endpoint):

```json
{ "nombres": "Pedro", "apellidos": "Ramírez",
  "telefono": "(se recibe por WhatsApp)",
  "mensaje": "[Atribución vendedor MN4UYC5Y] Contacto derivado a WhatsApp por Alma. Necesidad: ...",
  "atribucion": { "codigo_vendedor": "MN4UYC5Y" } }
```

---

## 🔴 Bug a arreglar #1 — `POST /compras` 500 con planes de cuota inicial

Repro (Zulia = 200, Selecto = 500, mismo body salvo `plan_id`):

```bash
BASE="https://prevision-funeraria.sisteg.workers.dev"
TOKEN="pf_..."   # token de test, NO el de prod

# plan_id 1 (esencial-zulia) -> 200 + link_de_cobro
# plan_id 3 (esencial-selecto, cuota_inicial_centavos:3500) -> 500 "Internal Server Error"
# plan_id 4 (vanguardia-selecto, cuota_inicial_centavos:5500) -> 500
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/api/public/t/lh/compras" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"cliente":{"tipo_persona":"natural","documento_identidad":"TEST-SEL-1","nombres":"Test","apellidos":"Selecto","email":"test-selecto@example.com"},"plan_id":3,"frecuencia_pago":"mensual","afiliados":[],"forma_pago":"tarjeta","moneda_pago":"USD","success_url":"https://www.legadoholding.com/gracias.html","cancel_url":"https://www.legadoholding.com/cancelado.html"}'
```

**Esperado:** HTTP 200, `estado: "pendiente_pago"`, `link_de_cobro`; y el Stripe
Checkout Session debe cobrar la **cuota inicial one-time** (`cuota_inicial_centavos`,
concepto `cuota_inicial_concepto`) **+ la suscripción recurrente**. Enfoque sugerido:
`subscription_data.add_invoice_items` (ver `docs/ajustes-prevision-funeraria-atribucion-vendedor.md` §4.3).
Falla igual con `frecuencia_pago: "anual"` y con/sin `atribucion`.

## 🟡 Verificaciones que solo se pueden hacer desde el panel de `lh`

1. **P0** — Una `compra_pendiente` creada con `atribucion.codigo_vendedor:"MN4UYC5Y"`
   debe traer `vendedor_id` resuelto (id de ESTEBAN), y **al confirmar el pago por el
   webhook de Stripe el CONTRATO debe heredar ese `vendedor_id`** (las comisiones se
   calculan sobre el contrato). Sin esto, ninguna venta digital con tarjeta genera
   comisión.
2. **P0** — Un lead de `/solicitudes` con `atribucion.codigo_vendedor` debe mostrar el
   vendedor en el panel de leads y prellenarlo al convertir lead → contrato.
3. `/solicitudes` debería devolver el `id` de la solicitud creada (hoy solo `{"ok":true}`).

## Datos de prueba a limpiar en `lh` (creados desde acá el 2026-08-26)

- Leads (`/solicitudes`): apellidos `REF-ATRIBUCION-TEST`, `HANDOFF-NOPLAN`,
  `HANDOFF-TIPOSOLO`, `TEST-ID-CHECK`, `González` (María), `Ramírez` (Pedro, stub).
- Compras pendientes: docs `SMOKE-REF-001/002/003`, `SMOKE-SELECTO-001`,
  `REG-CHECK-001`, `CTRL-ZULIA-001`, + las `SMOKE ATRIBUCION`. (Las `SEL-*` con 500
  no crearon nada.)

---

# Bitácora de pedidos al agente de Prevision-Funeraria

> El agente de `legado-holding` agrega acá. El agente de Prevision-Funeraria marca
> `[x]` cuando queda hecho + verificado, y deja una nota corta con el commit/fecha.

## Abierto

### PF-1 · `POST /compras` 500 con planes de cuota inicial — **P0, bloqueante**
- [ ] `plan_id` 3 y 4 (Selecto, `cuota_inicial_centavos` 3500/5500) → HTTP 500
  "Internal Server Error". `plan_id` 1 y 2 (Zulia) → 200 OK.
- [ ] El Stripe Checkout debe cobrar cuota inicial one-time + suscripción
  (`subscription_data.add_invoice_items`). Ver repro arriba y
  `docs/ajustes-prevision-funeraria-atribucion-vendedor.md` §4.3.
- [ ] Debe funcionar con `frecuencia_pago` `mensual` y `anual`.
- **Al cerrarse:** avisar para encender `SELECTO_CHECKOUT_ENABLED` en `js/main.js`.

### PF-2 · Atribución de vendedor en el contrato final (Stripe) — **P0**
- [ ] `compra_pendiente` con `atribucion.codigo_vendedor` → `vendedor_id` resuelto.
- [ ] El webhook `checkout.session.completed` debe copiar ese `vendedor_id` (y
  `canal_origen`/`utm_*`) al **contrato** que crea. Verificar con un pago de test
  (`4242 4242 4242 4242`) que el contrato resultante tiene el vendedor y que las
  comisiones se calculan para él.
- [ ] Cinturón y tirantes: `metadata.codigo_vendedor` en la Checkout Session.

### PF-3 · `/solicitudes` — vendedor visible + id de retorno — **P0**
- [ ] Confirmar que `atribucion.codigo_vendedor` se resuelve/persiste en la tabla
  de solicitudes públicas y se ve en el panel de leads.
- [ ] Prellenar el vendedor al convertir solicitud → contrato.
- [ ] Devolver `{"ok":true,"solicitud_id":N}` (hoy solo `{"ok":true}`).

### PF-4 · `codigo_vendedor` case-insensitive — P2
- [ ] Match `UPPER(TRIM(x))` — hoy `mn4uyc5y` probablemente no resuelve a `MN4UYC5Y`.

## Cerrado

- [x] **Catálogo `cuota_inicial_centavos` + `cuota_inicial_concepto`** en `GET /planes`
  (verificado 2026-08-26: esencial-selecto=3500, vanguardia-selecto=5500,
  concepto "Cuota de afiliación").
- [x] **`GET /api/public/t/lh/vendedores/lookup?codigo=`** (con token) →
  `{activo,codigo,nombre}` (verificado: `MN4UYC5Y` → "ESTEBAN").
- [x] **`atribucion` aceptado en `/compras` y `/solicitudes`** sin romper (verificado).
