# LEGADO Holding — Sitio web y plataforma de checkout

Sitio bilingüe (ES/EN) de previsión funeraria para venezolanos en EE. UU., con
catálogo de planes, wizard de afiliación de 4 pasos, generación de factura
recurrente y envío de correo de cobro — todo conectado a Invoice Ninja a
través de un Cloudflare Worker propio.

```
                ┌────────────────────────────┐
                │   legadoholding.com        │
                │   (Apache + HTML/CSS/JS)   │
                └─────────────┬──────────────┘
                              │
                              │  fetch JSON (HTTPS)
                              ▼
                ┌────────────────────────────┐
                │  api.legadoholding.com     │
                │  Cloudflare Worker         │
                │  (JS + secret IN_TOKEN)    │
                └─────────────┬──────────────┘
                              │
                              │  X-API-TOKEN
                              ▼
                ┌────────────────────────────┐
                │ invoicing.legadoholding.com│
                │ Invoice Ninja v5           │
                │ (clientes, facturas, mail) │
                └────────────────────────────┘
```

> Sitio estático puro: sin Node.js, sin bundler, sin framework. Lo único
> que se ejecuta del lado servidor es el Worker.

---

## Índice

1. [Resumen rápido](#1-resumen-rápido)
2. [Arquitectura](#2-arquitectura)
3. [Estructura del repositorio](#3-estructura-del-repositorio)
4. [Stack tecnológico](#4-stack-tecnológico)
5. [Inicio rápido — desarrollo local](#5-inicio-rápido--desarrollo-local)
6. [El Worker (`worker/`)](#6-el-worker-worker)
   1. [Endpoints](#61-endpoints)
   2. [Variables y secrets](#62-variables-y-secrets)
   3. [Pipeline de checkout paso a paso](#63-pipeline-de-checkout-paso-a-paso)
   4. [Comandos `wrangler` que usarás](#64-comandos-wrangler-que-usarás)
7. [El frontend](#7-el-frontend)
   1. [Configuración global (`LEGADO_CONFIG`)](#71-configuración-global-legado_config)
   2. [Internacionalización (i18n)](#72-internacionalización-i18n)
   3. [Planes y precios](#73-planes-y-precios)
   4. [Wizard de compra](#74-wizard-de-compra)
8. [Despliegue a producción](#8-despliegue-a-producción)
9. [Operaciones cotidianas](#9-operaciones-cotidianas)
10. [Solución de problemas](#10-solución-de-problemas)
11. [Seguridad](#11-seguridad)
12. [Limitaciones conocidas y trabajo futuro](#12-limitaciones-conocidas-y-trabajo-futuro)

---

## 1. Resumen rápido

| Dato | Valor |
|---|---|
| Dominio público | `legadoholding.com` |
| Subdominio del Worker | `api.legadoholding.com` |
| Worker (nombre interno) | `legado-checkout-dev` |
| Invoice Ninja | `invoicing.legadoholding.com` |
| Idiomas | Español / Inglés (toggle en la barra de navegación) |
| Pagos | Enlace de factura de Invoice Ninja (cliente paga desde el portal) |
| Suscripción | Mensual o anual (Zulia) / mensual con cuota inicial (Selecto) |

---

## 2. Arquitectura

### Componentes

| # | Componente | Función | Tecnología |
|---|---|---|---|
| 1 | **Frontend estático** | Sitio público, wizard, render de planes | HTML + CSS + JS plano servido por Apache |
| 2 | **Cloudflare Worker** | Endpoint server-side que oculta el token de Invoice Ninja y orquesta el checkout | JavaScript en V8 (Cloudflare Workers) |
| 3 | **Invoice Ninja v5** | Sistema de facturación: clientes, productos, suscripciones, plantillas de email | Auto-hospedado en `invoicing.legadoholding.com` |
| 4 | **Cloudflare DNS** | Administra `legadoholding.com` y bind del subdominio `api.` al Worker | Cloudflare |

### Flujo completo de una compra

```
Usuario              Frontend            Worker             Invoice Ninja
  │                    │                   │                    │
  │ click "Comprar"    │                   │                    │
  │───────────────────▶│                   │                    │
  │                    │ GET /products     │                    │
  │                    │──────────────────▶│ GET /products      │
  │                    │                   │───────────────────▶│
  │                    │                   │◀─── productos ─────│
  │                    │◀── catálogo ──────│                    │
  │                    │ (renderiza planes)│                    │
  │ completa wizard    │                   │                    │
  │───────────────────▶│                   │                    │
  │                    │ POST / (checkout) │                    │
  │                    │──────────────────▶│ search/create      │
  │                    │                   │  cliente           │
  │                    │                   │───────────────────▶│
  │                    │                   │ recurring invoice  │
  │                    │                   │  + send_now        │
  │                    │                   │───────────────────▶│
  │                    │                   │ /invoices/bulk     │
  │                    │                   │  action:email      │
  │                    │                   │───────────────────▶│
  │                    │◀── invoice + link│                    │
  │ pantalla éxito ◀───│                   │                    │
  │                    │                   │     Invoice Ninja  │
  │◀──────── email con enlace de pago ─────────────────────────│
  │                                                              │
  │ click → portal IN → paga                                     │
```

### Por qué un Worker (y no n8n, no PHP, no servidor propio)

- **Token seguro**: el `X-API-TOKEN` de Invoice Ninja vive como secret cifrado
  en Cloudflare, jamás llega al navegador.
- **Sin infraestructura**: 0 servidores que administrar. El plan gratuito de
  Workers cubre 100k req/día.
- **Latencia baja**: edge computing global; cada request se atiende desde el
  data center más cercano al usuario.
- **Mismo lenguaje que el frontend**: 100% JavaScript, sin context-switch a
  PHP/Python.

---

## 3. Estructura del repositorio

```
legado-holding/
├── README.md                       ← este archivo
├── .gitignore                      ← excluye worker/.dev.vars, .wrangler/, node_modules
├── index.html                      ← página única, contiene LEGADO_CONFIG
├── terminos-condiciones.txt        ← texto legal mostrado en el wizard
├── css/
│   └── main.css                    ← estilos de toda la página
├── images/                         ← fotos, logo, fondos
├── js/
│   ├── main.js                     ← TODO el JS del sitio (i18n, planes, wizard, chat)
│   ├── gtag.js                     ← inicialización de Google Analytics
│   └── wizard-generic.js           ← helpers del wizard
└── worker/                         ← Cloudflare Worker (backend ligero)
    ├── package.json                ← scripts npm (dev / deploy / tail)
    ├── wrangler.toml               ← config del Worker (rutas, vars públicas)
    ├── .dev.vars.example           ← plantilla; copiar a .dev.vars (gitignored)
    └── src/
        ├── index.js                ← router HTTP, CORS, health
        ├── invoiceninja.js         ← cliente HTTP de IN (todos los endpoints)
        └── pipeline.js             ← orquestador del checkout (normalize → cliente → factura → email)
```

Lo que **NO** se commitea (ver `.gitignore`):
- `worker/.dev.vars` → token de IN para desarrollo local
- `worker/.wrangler/` → caché de wrangler
- `worker/node_modules/` → si en algún momento se añaden dependencias

---

## 4. Stack tecnológico

| Capa | Tecnología | Notas |
|---|---|---|
| Frontend | HTML5 + CSS3 + JavaScript ES2017+ vanilla | Sin build step, sin transpilación |
| i18n | Diccionario en `js/main.js` (`LANG`) | ES/EN, atributos `data-i18n` |
| Analytics | Google Analytics 4 (gtag.js) | Configurar ID en `js/gtag.js` |
| Worker | Cloudflare Workers (V8 isolates) | Runtime tipo Service Worker, no Node |
| Worker tooling | Wrangler 3+ | CLI oficial de Cloudflare |
| Facturación | Invoice Ninja v5 (self-hosted) | REST API en `/api/v1` |
| Email | Plantillas nativas de Invoice Ninja | Configuradas en *Settings → Email Settings* |
| DNS y CDN | Cloudflare | Zone: `legadoholding.com` |
| Hosting frontend | Apache | Sirve los archivos estáticos del repo |
| Hosting Worker | Cloudflare edge | Despliegue con `wrangler deploy` |

---

## 5. Inicio rápido — desarrollo local

### 5.1 Requisitos

1. **Node.js 18+** — solo para correr Wrangler. Instala con `winget install OpenJS.NodeJS`.
2. **Wrangler CLI**:
   ```powershell
   npm install -g wrangler
   wrangler --version    # debe ser >= 3.x
   wrangler login        # autoriza tu cuenta de Cloudflare
   ```
3. **Servidor estático para el frontend**. Cualquiera funciona; elige uno:
   - **VS Code Live Server** — click derecho sobre `index.html` → "Open with Live Server" (puerto 5500).
   - **Python 3** — desde la raíz del repo: `python -m http.server 8000`.
   - **npx serve** — desde la raíz: `npx serve -p 8000`.
4. **Token de Invoice Ninja**. Genéralo en *Settings → Account Management → API Tokens* del panel admin de IN.

### 5.2 Configurar el token local

Desde la raíz del repo:

```powershell
cd worker
Copy-Item .dev.vars.example .dev.vars
notepad .dev.vars
```

Pega el token después de `IN_TOKEN=`, sin comillas, sin espacios. Guarda.

> El archivo `.dev.vars` está en `.gitignore` y **no se sube al repo**.
> Es solo para tu máquina.

### 5.3 Levantar el Worker en local

```powershell
cd worker
wrangler dev
```

Salida esperada:
```
Ready on http://localhost:8787
```

Déjalo corriendo. Cualquier cambio en `worker/src/*.js` o `wrangler.toml`
recarga automáticamente.

### 5.4 Levantar el frontend

En otra terminal, según el servidor que elegiste:

```powershell
# Opción 1: Live Server (botón en VS Code) → http://127.0.0.1:5500
# Opción 2: Python
python -m http.server 8000   # → http://127.0.0.1:8000

# Opción 3: serve
npx serve -p 8000
```

Abre la URL en el navegador. El switch en [`index.html`](index.html) detecta
`localhost`/`127.0.0.1` y apunta automáticamente al Worker en `:8787`.

### 5.5 Verificación rápida

En la consola del navegador (F12):

```js
window.LEGADO_CONFIG
// debe imprimir { WIZARD_WEBHOOK_URL: "http://localhost:8787", PLANS_API_URL: "http://localhost:8787/products" }
```

Y en otra terminal:

```powershell
Invoke-RestMethod -Uri http://localhost:8787 -Method GET
# tokenLoaded debe ser True
```

Si ambos pasan, el setup local está completo. Recarga el sitio: las tarjetas
de planes deben mostrar precios reales (no los de respaldo).

---

## 6. El Worker (`worker/`)

### 6.1 Endpoints

| Método | Ruta | Función | Cuerpo |
|---|---|---|---|
| `GET` | `/` | Health check + diagnóstico de config | — |
| `GET` | `/products` | Lista de productos `legadoweb` desde IN | — |
| `POST` | `/` | Pipeline de checkout completo | JSON con `intent`, `plan`, `paymentType`, `buyer`, `family` |
| `OPTIONS` | `*` | Preflight CORS | — |

#### Respuesta de `GET /`

```json
{
  "ok": true,
  "service": "legado-checkout",
  "env": "dev",
  "tokenLoaded": true,
  "inBase": "https://invoicing.legadoholding.com/api/v1",
  "emailMode": "explicit",
  "allowedOrigins": [
    "https://legadoholding.com",
    "https://www.legadoholding.com",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:8000",
    "http://127.0.0.1:8000"
  ]
}
```

#### Respuesta de `GET /products`

```json
{
  "data": [
    {
      "id": "...",
      "product_key": "ESENCIAL-ZULIA-MENSUAL",
      "price": 9.47,
      "custom_value1": "legadoweb",
      "custom_value2": "Monthly",
      "custom_value3": "esencial-zulia",
      "notes": "...",
      "is_deleted": false
    }
  ]
}
```

#### Request a `POST /` (checkout)

```json
{
  "intent": "create_payment_intent",
  "plan": "esencial-zulia",
  "paymentType": "monthly",
  "buyer": {
    "name": "Juan",
    "lastName": "Pérez",
    "email": "juan@example.com",
    "cedula": "V-12345678",
    "phone": "+584141112233",
    "birthDate": "1985-01-15",
    "zip": "33101"
  },
  "family": [
    { "name": "Ana", "lastName": "Pérez", "cedula": "V-87654321", "birthDate": "1988-03-22", "relation": "Esposa" }
  ],
  "timestamp": "2026-05-14T10:00:00.000Z"
}
```

#### Respuesta exitosa de `POST /`

```json
{
  "success": true,
  "message": "Tu solicitud fue registrada. Revisa tu correo en juan@example.com para completar el pago.",
  "plan": "Plan Esencial Zulia",
  "modalidad": "Suscripción mensual",
  "invoiceNumber": "0036",
  "invitationLink": "https://invoicing.legadoholding.com/client/invoice/H32foCIk1Q...",
  "total": "9.47"
}
```

#### Respuesta de error (HTTP 4xx/5xx)

```json
{
  "success": false,
  "message": "Email del comprador es requerido"
}
```

### 6.2 Variables y secrets

#### Variables públicas (`[vars]` en `wrangler.toml`)

| Variable | Default | Función |
|---|---|---|
| `IN_BASE` | `https://invoicing.legadoholding.com/api/v1` | Base URL de la API de Invoice Ninja |
| `ENVIRONMENT` | `dev` | Etiqueta de entorno; aparece en el health check |
| `EMAIL_MODE` | `explicit` | Cómo se envía el email al cliente (ver más abajo) |
| `ALLOWED_ORIGINS` | (lista CSV) | Orígenes permitidos por CORS |

#### Secrets (cifrados en Cloudflare, no se commitean)

| Secret | Función | Cómo se configura |
|---|---|---|
| `IN_TOKEN` | Token de API de Invoice Ninja | `wrangler secret put IN_TOKEN` |

#### Modos de envío de email (`EMAIL_MODE`)

| Valor | Comportamiento |
|---|---|
| `"explicit"` *(default)* | Worker llama explícitamente `POST /invoices/bulk { action: "email" }` después de crear la factura. Recomendado: tienes control total del momento de envío. |
| `"auto"` | Worker NO llama email. Confía en la opción *Email Invoices Automatically* de IN y en `send_email: true` del contacto. |
| `"none"` | Worker NO envía email. Útil para pruebas sin spamear. |

> Cuando `EMAIL_MODE = "explicit"`, **desactiva** *Email Invoices
> Automatically* en IN para evitar correos duplicados.

### 6.3 Pipeline de checkout paso a paso

Implementado en [worker/src/pipeline.js](worker/src/pipeline.js), función `processCheckout(body, env)`:

```
1. normalize(body)
   ├─ Valida que email y plan estén presentes
   ├─ Normaliza slug del plan (frontend usa '-selecto', IN usa '-ven')
   ├─ Mapea paymentType → frequency_id de IN (4 = mensual, 9 = anual)
   ├─ Limpia familia (recorta strings, descarta entradas vacías)
   └─ Construye clientPrivateNotes con resumen de la compra

2. routing por intent
   ├─ 'create_payment_intent' → continúa
   └─ otros → 400 "Intent no reconocido"

3. resolveClient(IN, ctx)
   ├─ GET /clients?email=... → busca por email exacto en contactos
   ├─ Existe → devuelve client_id existente
   └─ No existe → POST /clients (con send_email: true en el contacto)

4. buildInvoiceContext(IN, ctx)
   ├─ GET /products?per_page=100
   ├─ Filtra: custom_value1='legadoweb' AND custom_value3=planFamily
   ├─ Resuelve line items del primer ciclo:
   │   • Selecto (-ven): Unico + Monthly (cuota inicial + primer mes)
   │   • Zulia: el producto que matchea frequencyLabel
   ├─ GET /subscriptions y, si no existe, POST /subscriptions
   │   (Si IN devuelve 500, sigue sin subscription_id — solo afecta el link
   │    visual del portal, no el cobro)
   └─ Devuelve { strategy, lineItems1, lineItems2, subscriptionId, ... }

5. createInvoices(IN, ctx, invCtx)
   ├─ POST /recurring_invoices con line_items del primer ciclo, status:2, auto_bill:off
   ├─ POST /recurring_invoices/bulk { action: "send_now" } → fuerza generación inmediata
   ├─ Polling: hasta 10 intentos × 800ms buscando la factura con recurring_id
   ├─ Selecto: PUT /recurring_invoices/{id} para quitar 'Unico' de ciclos siguientes
   └─ GET /invoices/{id}?include=invitations → extrae invitations[0].link

6. emailInvoice (según EMAIL_MODE)
   └─ POST /invoices/bulk { action: "email", ids: [invoiceId] }

7. respond
   └─ { success: true, plan, modalidad, invoiceNumber, invitationLink, total }
```

### 6.4 Comandos `wrangler` que usarás

| Comando | Cuándo | Qué hace |
|---|---|---|
| `wrangler login` | Una vez por máquina | Autoriza tu cuenta |
| `wrangler dev` | Cada sesión de dev | Levanta el Worker local en `:8787`, hot reload |
| `wrangler deploy` | Cada cambio que quieras publicar | Sube el Worker a Cloudflare |
| `wrangler tail` | Debug en producción | Stream de logs del Worker desplegado |
| `wrangler secret put <name>` | Añadir/rotar un secret | Prompt interactivo, valor cifrado |
| `wrangler secret list` | Verificar secrets | Lista solo los nombres, no los valores |
| `wrangler secret delete <name>` | Quitar un secret | Borra el secret de Cloudflare |

Scripts equivalentes en [worker/package.json](worker/package.json):

```powershell
cd worker
npm run dev      # = wrangler dev
npm run deploy   # = wrangler deploy
npm run tail     # = wrangler tail
```

---

## 7. El frontend

### 7.1 Configuración global (`LEGADO_CONFIG`)

Definida en [index.html](index.html), línea ~40. Conmuta dev/prod por hostname:

```html
<script>
  const __isDev = ["localhost", "127.0.0.1", ""].includes(location.hostname);
  window.LEGADO_CONFIG = {
    WIZARD_WEBHOOK_URL: __isDev
      ? "http://localhost:8787"
      : "https://api.legadoholding.com",
    PLANS_API_URL: __isDev
      ? "http://localhost:8787/products"
      : "https://api.legadoholding.com/products",
  };
</script>
```

- En `localhost` / `127.0.0.1` / `file://` → Worker local.
- En cualquier otro host → Worker desplegado.

### 7.2 Internacionalización (i18n)

Todo el texto está en el objeto `LANG` en [js/main.js](js/main.js) (~línea 51):

```js
const LANG = {
  nav_inicio: ["Inicio", "Home"],
  hero_title1: ["Sabemos lo que significa", "We know what it means"],
  // ... [string_es, string_en]
};
```

**Para añadir un texto traducible nuevo**:
1. Añade la entrada al objeto `LANG`: `mi_clave: ["Texto ES", "Text EN"]`.
2. En el HTML, marca el elemento: `<span data-i18n="mi_clave"></span>`.
3. `applyLanguage()` lo rellena automáticamente al cargar.

**Para cambiar un texto**: edita el string directamente en el array.

El toggle de idioma está en la barra de navegación. Persiste en `localStorage`.

### 7.3 Planes y precios

Los precios **se cargan desde Invoice Ninja** vía `GET /products`. La función
`loadPlansFromAPI()` en [js/main.js](js/main.js) (~línea 546):

1. Llama al Worker (`/products`).
2. Filtra productos con `custom_value1 === "legadoweb"`.
3. Agrupa por `custom_value3` (slug del plan).
4. Mapea `custom_value2` a `monthly` / `annual` / `unico` (cuota inicial).
5. Reemplaza el objeto `PLANS`. Si la API falla, conserva el fallback hardcoded.

#### Convenciones de productos en Invoice Ninja

Para que un producto aparezca en el sitio, debe tener:

| Campo IN | Valor | Significado |
|---|---|---|
| `custom_value1` | `legadoweb` | Marca el producto como del sitio (los demás se ignoran) |
| `custom_value2` | `Monthly` / `Annualy` / `Unico` | Frecuencia del cobro |
| `custom_value3` | slug de plan | Familia: `esencial-zulia`, `vanguardia-zulia`, `esencial-ven`, `vanguardia-ven` |
| `notes` | texto libre | Beneficios mostrados en el modal "Ver detalles" |
| `price` | número | Precio en USD |

> **Nota sobre slugs**: el frontend usa `-selecto` (`esencial-selecto`), IN usa
> `-ven` (`esencial-ven`). El Worker hace la traducción en
> [pipeline.js → SLUG_TO_IN](worker/src/pipeline.js).

#### Lógica de Selecto (plan con cuota inicial)

Plan Selecto cobra:
- **Primer ciclo**: `Unico` (cuota inicial) + `Monthly` (primer mes).
- **Ciclos siguientes**: solo `Monthly`.

El Worker maneja esto creando la suscripción con ambos items, generando
la primera factura, y luego haciendo `PUT` para dejar solo `Monthly` en
las facturas futuras. Ver
[pipeline.js → buildInvoiceContext](worker/src/pipeline.js).

### 7.4 Wizard de compra

4 pasos definidos en [js/main.js](js/main.js) función `openWizard(planId)`:

| Paso | Contenido | Validación |
|---|---|---|
| 0 | Datos del titular (nombre, apellido, cédula, email, teléfono, fecha nac., ZIP) | Email válido + edad ≤ maxAge del plan |
| 1 | Familiares (hasta 6, con cédula, fecha nac., parentesco) | Opcional |
| 2 | Forma de pago (modalidad mensual/anual) | Modalidad seleccionada |
| 3 | Resumen + términos y condiciones | Checkbox "Acepto" marcado |

Al confirmar el paso 3, `submitWizard()` hace `POST` al Worker. El cierre
prematuro envía `intent: "lead_abandoned"` con `keepalive: true` (fire-and-forget,
el Worker responde 400 pero nadie lee la respuesta).

---

## 8. Despliegue a producción

### 8.1 Worker

Desde `worker/`:

```powershell
# Solo una vez: subir el secret a Cloudflare
wrangler secret put IN_TOKEN
# (pega el token cuando pida "Enter a secret value:")

# Cada vez que cambies código o config
wrangler deploy
```

Salida esperada:
```
Published legado-checkout-dev (X sec)
  https://legado-checkout-dev.<tu-subdominio>.workers.dev
  api.legadoholding.com/*
Current Deployment ID: <uuid>
```

### 8.2 Frontend

Sube los archivos a Apache. Como `__isDev` evalúa por hostname:
- Si tu Apache sirve en `legadoholding.com` → automáticamente usa el Worker
  desplegado.
- Si sirves en `localhost` → usa el Worker local.

No hace falta variable de entorno ni build step.

### 8.3 DNS

Ya está configurado:
- `api.legadoholding.com` está bind al Worker vía `routes` en `wrangler.toml`.
- Cloudflare crea el registro DNS automáticamente al primer deploy.

### 8.4 Verificación post-deploy

```powershell
# Health check
Invoke-RestMethod -Uri https://api.legadoholding.com -Method GET

# Productos
(Invoke-RestMethod -Uri https://api.legadoholding.com/products).data.Count

# Logs en vivo
wrangler tail
```

---

## 9. Operaciones cotidianas

### 9.1 Añadir un nuevo plan

1. En Invoice Ninja, crea el producto con `custom_value1=legadoweb`,
   `custom_value2=Monthly|Annualy|Unico`, `custom_value3=<slug>`,
   `notes=<beneficios>`, y el precio.
2. Si el slug es nuevo, añade la entrada en [js/main.js](js/main.js):
   - `PLAN_GROUPS` (para que aparezca en una región).
   - `PLAN_NAMES` en [worker/src/pipeline.js](worker/src/pipeline.js)
     (para el nombre legible que va en el email).
   - Si se llama distinto en frontend vs IN, añade a `SLUG_TO_IN`.
3. Añade las claves i18n `plan_<slug>_name`, `plan_<slug>_features_*`
   en `LANG`.
4. `wrangler deploy` si tocaste el Worker.

### 9.2 Rotar el token de Invoice Ninja

```powershell
# 1. En IN admin → Settings → Account Management → API Tokens → genera nuevo
# 2. Sube el nuevo a Cloudflare
cd worker
wrangler secret put IN_TOKEN
# pega el token nuevo cuando lo pida

# 3. Actualiza también worker/.dev.vars con el nuevo valor (para dev local)
# 4. Borra el token viejo en IN admin
```

### 9.3 Ver logs del Worker en producción

```powershell
cd worker
wrangler tail
```

Muestra cada request en tiempo real con los `console.log` del pipeline.
Útil para depurar problemas reportados por usuarios.

### 9.4 Cambiar la plantilla del email de factura

En Invoice Ninja: *Settings → Email Settings → Template & Reminders →
Initial Invoice*. Soporta variables como `$client.name`, `$invoice.number`,
`$invoice.invitation_link`, etc.

No requiere redespliegue del Worker.

### 9.5 Apagar el envío de email temporalmente

Edita [worker/wrangler.toml](worker/wrangler.toml):
```toml
EMAIL_MODE = "none"
```
Luego `wrangler deploy`. El checkout sigue creando cliente + factura, pero
no manda el correo.

### 9.6 Añadir un origen a CORS

Edita [worker/wrangler.toml](worker/wrangler.toml):
```toml
ALLOWED_ORIGINS = "https://legadoholding.com,...,https://nuevo-origen.com"
```
Luego `wrangler deploy`. Sin espacios entre comas.

---

## 10. Solución de problemas

### Síntoma: el wizard muestra "Error de conexión"

| Causa probable | Diagnóstico | Solución |
|---|---|---|
| Worker caído | `Invoke-RestMethod $URL` → 500 / sin respuesta | Revisar `wrangler tail` y redespliegar |
| CORS bloqueando | Network → request en rojo, console del navegador menciona CORS | Añadir el origen del sitio a `ALLOWED_ORIGINS` |
| Token IN inválido | `tokenLoaded: false` en GET / | Re-subir secret con `wrangler secret put IN_TOKEN` |
| Pipeline lanza excepción | `wrangler tail` muestra "Pipeline error: ..." | Leer el mensaje, suele indicar campo faltante o producto no encontrado |

### Síntoma: las tarjetas de plan muestran precios genéricos en vez de los reales

| Causa probable | Diagnóstico | Solución |
|---|---|---|
| `GET /products` falla | Network del navegador, status del request | Igual que arriba — token o Worker |
| Producto sin `custom_value1=legadoweb` | Inspeccionar `/products` y contar items | Marcar el producto correctamente en IN |
| Slug no reconocido | Consola del navegador imprime "Plan X no devuelto por la API" | Añadir el slug a `PLAN_GROUPS` o renombrar `custom_value3` en IN |

### Síntoma: el cliente no recibe el email

| Causa probable | Diagnóstico | Solución |
|---|---|---|
| `EMAIL_MODE=none` | GET / muestra `emailMode: "none"` | Cambiar a `"explicit"` y redespliegar |
| IN no tiene SMTP configurado | IN admin → Settings → Email Settings | Configurar Gmail/Postmark/SMTP |
| Plantilla "Initial Invoice" vacía | IN admin → Templates | Llenar la plantilla con HTML válido |
| Email en spam | Revisar bandeja de spam del cliente | Configurar SPF/DKIM del dominio remitente en IN |

### Síntoma: error "Sin productos para familia '...'"

Significa que `custom_value3` del producto en IN no coincide con el slug que
envía el frontend. Revisa la tabla `SLUG_TO_IN` en
[worker/src/pipeline.js](worker/src/pipeline.js) y los `custom_value3` en IN.

### Síntoma: "Factura inicial no generada (recurring_id=...)"

El cron de Invoice Ninja tardó más de 8s en generar la factura tras el
`send_now`. Causas:
- IN sobrecargado o caído.
- Cron de IN no corriendo (revisar en IN admin → System Logs).

Solución temporal: reintentar la operación. Solución estructural: extender
el polling en [pipeline.js → createInvoices](worker/src/pipeline.js).

---

## 11. Seguridad

### Lo que NUNCA debe estar en el repo

- El valor real del `IN_TOKEN` (en cualquier archivo).
- Credenciales de Cloudflare (`wrangler login` las guarda en
  `%USERPROFILE%\.wrangler\`, fuera del repo).
- `worker/.dev.vars` (gitignored).
- Capturas de pantalla con tokens visibles.

### Procedimiento si un token se filtra

1. **Inmediatamente**: rotar el token en Invoice Ninja (admin → API Tokens).
2. Actualizar el secret en Cloudflare: `wrangler secret put IN_TOKEN`.
3. Actualizar `worker/.dev.vars` local.
4. Limpiar el historial de PowerShell:
   ```powershell
   Remove-Item (Get-PSReadLineOption).HistorySavePath
   ```
5. Si el token apareció en un commit de git: además del rotado, considerar
   reescribir la historia con `git filter-repo` o
   [BFG Repo-Cleaner](https://rtyley.github.io/bfg-repo-cleaner/) — pero
   asume que el token ya está comprometido sin importar la limpieza.

### Por qué CORS está restringido

Sin whitelist, cualquier sitio web podría llamar al Worker y crear clientes /
facturas en nombre de visitas a su página. La whitelist asegura que solo
`legadoholding.com` y entornos de desarrollo conocidos puedan disparar el
flujo desde un navegador. Las llamadas server-to-server (sin header `Origin`)
no son afectadas y siguen funcionando.

### Por qué `EMAIL_MODE=explicit` es recomendado

Da control total al Worker sobre el momento del envío. Combinado con
"Email invoices automatically = OFF" en IN, garantiza un único correo
por checkout y permite logear exactamente cuándo se disparó.

---

## 12. Limitaciones conocidas y trabajo futuro

| Pendiente | Severidad | Notas |
|---|---|---|
| Chat webhook es placeholder | Baja | `CHAT_WEBHOOK_URL` en main.js apunta a una URL inexistente. El chatbot no funciona; deshabilitar el botón o implementar backend. |
| Sin idempotencia en checkout | Media | Doble click en "Confirmar" puede crear dos clientes/facturas. Mitigar con un `Idempotency-Key` (uuid del wizard) y caché de respuestas en el Worker. |
| Auto-creación de Subscription template falla con 500 en IN | Baja | El flujo continúa sin link al portal del cliente. No bloquea el cobro. Investigar logs de IN. |
| Polling fijo de 8 segundos | Baja | Suficiente para el cron actual de IN. Si IN se vuelve más lento, extender. |
| Worker `lead_abandoned` no se persiste | Media | El frontend envía el evento pero el Worker responde 400 sin guardar nada. Para CRM: añadir lógica de log en el Worker o enviar a un endpoint de marketing. |
| Sin tests automatizados | Media | No hay unit tests del pipeline. Considerar Vitest + `@cloudflare/vitest-pool-workers`. |
| n8n viejo sigue corriendo | Baja | El workflow `LEGADO_PostPayment_v7` sigue activo en el VPS Contabo aunque ya no recibe tráfico. Deshabilitar desde la UI de n8n y, eventualmente, apagar el VPS. |

---

## Apéndice: árbol completo del repo

```
legado-holding/
├── .claude/
│   └── settings.local.json
├── .gitignore
├── README.md
├── css/
│   └── main.css
├── images/
│   └── (logos, fotos, fondos)
├── index.html
├── js/
│   ├── gtag.js
│   ├── main.js
│   └── wizard-generic.js
├── terminos-condiciones.txt
└── worker/
    ├── .dev.vars.example
    ├── package.json
    ├── src/
    │   ├── index.js
    │   ├── invoiceninja.js
    │   └── pipeline.js
    └── wrangler.toml
```

---

## Apéndice: referencia rápida de comandos

```powershell
# === Desarrollo local ===
cd worker
wrangler dev                       # Worker en :8787

# === Despliegue ===
wrangler deploy                    # Sube el Worker a Cloudflare
wrangler tail                      # Logs en vivo del Worker desplegado

# === Secrets ===
wrangler secret put IN_TOKEN       # Añadir/actualizar
wrangler secret list               # Verificar (sin valores)
wrangler secret delete IN_TOKEN    # Quitar

# === Pruebas server-to-server ===
$URL = "https://api.legadoholding.com"
Invoke-RestMethod -Uri $URL -Method GET                       # health
Invoke-RestMethod -Uri "$URL/products" -Method GET            # productos

# Checkout end-to-end (PowerShell)
$payload = @{
  intent      = "create_payment_intent"
  plan        = "esencial-zulia"
  paymentType = "monthly"
  buyer = @{
    name="Test"; lastName="Worker"; email="tu@email.com"
    cedula="V-12345678"; phone="+584141112233"
    birthDate="1985-01-15"; zip="33101"
  }
  family = @()
  timestamp = (Get-Date).ToString("o")
} | ConvertTo-Json -Depth 4
Invoke-RestMethod -Uri $URL -Method POST -Body $payload -ContentType "application/json"

# === Git workflow ===
git status
git add -u                         # stage mods + deleciones
git add <new-files>                # stage nuevos
git commit -m "feat: ..."
git push origin main
```
