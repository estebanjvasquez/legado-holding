# Atribución de vendedor externo (`?ref=`) — lado legado-holding

> Compañero de `docs/ajustes-prevision-funeraria-atribucion-vendedor.md` (ese lista
> lo que falta del lado de Previsión). Este describe lo que **ya está implementado**
> en este repo. **Fecha:** 2026-08-26.

## Qué hace

Vendedores externos reparten un enlace `https://www.legadoholding.com?ref=MN4UYC5Y`.
El código viaja con el visitante por toda la sesión y se adjunta a:

- **Compra por el wizard** → `atribucion` en `POST /compras` (Previsión, tenant `lh`).
- **Prospecto de Alma** (`create_lead`) → `atribucion` en `POST /solicitudes`.
- **Derivación a WhatsApp de Alma** → línea "Vengo referido/a por un asesor de LEGADO
  (ref: CÓDIGO)" en el mensaje pre-llenado que ve el humano de guardia, **+** un lead
  stub de atribución en `POST /solicitudes` para que quede rastro en el sistema.

## Modelo de atribución

**First-touch con TTL de 90 días.** El primer vendedor que trae al visitante se queda
con el crédito; un `?ref=` posterior distinto no lo pisa mientras no venza. Sin
`?ref=`, se deriva `canal_origen` (`directo`/`redes_sociales`/`buscador`/`otro`) de
UTMs + `document.referrer`.

## Piezas

| Archivo | Cambio |
|---|---|
| `js/main.js` §"ATRIBUCIÓN DE VENDEDOR / CANAL" | `initAttribution()` (corre al cargar el script), `getStoredAttribution()`, `getAttribution()`. Persiste en `localStorage["legado_attribution"]` `{ v, ts, ref?, canal_origen, utm_*, referrer_url, landing }`. |
| `js/main.js` → `submitWizard()` | agrega `attribution: getAttribution()` al payload |
| `js/main.js` → `sendChatMessage()` | agrega `attribution: getAttribution()` al body de `/chat` |
| `index.html` | bump `js/main.js?v=6` → `?v=7` (cache-bust) |
| `worker/src/attribution.js` (nuevo) | `sanitizeAttribution(raw)` — valida/limpia antes de reenviar a Previsión; `attributionTag()` para logs |
| `worker/src/wizard-compra.js` | `normalize()` guarda `ctx.atribucion`; `buildCompraBody()` lo adjunta como `atribucion` si hay algo |
| `worker/src/chat.js` | `handleChat()` sanea `body.attribution`, lo pasa a `runAlma`, lo guarda en `chat_sessions.metadata` (`ref_code`, `canal_origen`) |
| `worker/src/alma.js` | `runAlma` recibe `input.attribution`; `execCreateLead` lo mete en `atribucion`; `execHandoffWhatsapp` agrega la línea de referido; `registerAttributionStub()` crea el lead stub en background (`waitUntil`) |

**Alma no ve la atribución** en el prompt ni en el schema de las tools — se inyecta en
los executores, para que sea determinista y quede fuera del razonamiento del modelo.

## Reglas defensivas

- Código inválido nunca bloquea la compra/lead (además la propia API lo ignora).
- `sanitizeAttribution`: `codigo_vendedor` → solo `[A-Za-z0-9]`, 4–24 chars;
  `canal_origen` → whitelist; UTMs → 120 chars; `referrer_url` → 500 chars.
- Frontend: cuando hay `codigo_vendedor` **no** se manda `canal_origen` (la API lo
  infiere del código; evita mandar un enum que quizá no soporte).
- `localStorage` bloqueado/lleno → se ignora, el checkout igual funciona.

## Pendiente (depende de Previsión — ver el otro doc)

- La atribución llega a `compras_pendientes`/`solicitudes`, pero **falta confirmar que
  Previsión la propaga al contrato final** (webhook de Stripe) y que la muestra/prellena
  en el panel de staff. Gaps P0 #1 y #2 de `ajustes-prevision-funeraria-atribucion-vendedor.md`.
- Planes Selecto siguen sin wizard (cuota inicial no modelada) → un cliente Selecto
  referido solo se atribuye vía lead → conversión manual.
- El lead stub del handoff usa `telefono: "(se recibe por WhatsApp)"` como placeholder
  (el schema de `/solicitudes` exige `telefono` string). Staff lo concilia contra la
  conversación real de WhatsApp.

## Prueba manual

1. Abrir `https://www.legadoholding.com?ref=MN4UYC5Y` → DevTools → Application →
   Local Storage → `legado_attribution` debe existir con `ref: "MN4UYC5Y"`.
2. Navegar a otra sección, abrir el wizard, completar hasta el pago → en la request a
   `api.legadoholding.com` el body trae `attribution.codigo_vendedor`.
3. Volver con `?ref=OTRO` → el `localStorage` **sigue** con `MN4UYC5Y` (first-touch).
4. Chat con Alma pidiendo hablar con alguien → el botón "Continuar por WhatsApp" abre
   un mensaje que incluye "Vengo referido/a por un asesor de LEGADO (ref: MN4UYC5Y)".
