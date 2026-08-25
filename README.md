# LEGADO Holding — Sitio web y plataforma de checkout

> **Actualizado 2026-08-25.** Este repo migró de Invoice Ninja a la API pública
> de **Prevision-Funeraria** (repo separado `estebanjvasquez/Prevision-Funeraria`,
> tenant `lh`). Ver `CLAUDE.md` y `docs/api-publica-wizard.md` para el contrato
> completo. El login del panel admin (`worker/src/admin.js`) es la única parte
> que sigue hablando con Invoice Ninja — deuda pendiente, no bloqueante.

Sitio bilingüe (ES/EN) de previsión funeraria para venezolanos en EE. UU., con
catálogo de planes, wizard de afiliación, y checkout con tarjeta (Stripe
Checkout, vía Prevision-Funeraria) — orquestado por un Cloudflare Worker
propio que también sirve de proxy autenticado para el bot "Alma".

```
                ┌────────────────────────────┐
                │   legadoholding.com        │
                │   (Apache + HTML/CSS/JS)   │
                └─────────────┬──────────────┘
                              │
                ┌─────────────┴──────────────┐
                │ fetch directo (CORS, sin    │  fetch JSON (HTTPS)
                │ token) al catálogo público  │  a api.legadoholding.com
                ▼                             ▼
   ┌─────────────────────────────┐  ┌────────────────────────────┐
   │ prevision-funeraria         │  │  api.legadoholding.com     │
   │ .sisteg.workers.dev         │  │  Cloudflare Worker         │
   │ /api/public/t/lh/planes     │  │  (JS + secrets PF_TOKEN,   │
   │ (catálogo de planes)        │  │   GEMINI_API_KEY, etc.)    │
   └─────────────────────────────┘  └─────────────┬──────────────┘
                                                    │
                          ┌─────────────────────────┼─────────────────────┐
                          │ Authorization: Bearer    │ Gemini (Alma)       │ IN_BASE (solo
                          │ PF_TOKEN                 │                     │ login admin)
                          ▼                          ▼                     ▼
          ┌────────────────────────────┐  ┌──────────────────┐  ┌─────────────────────┐
          │ prevision-funeraria         │  │ Google Gemini     │  │ invoicing.legado-    │
          │ .sisteg.workers.dev         │  │ + Supabase        │  │ holding.com          │
          │ /api/public/t/lh/compras,   │  │ (memoria de chat) │  │ Invoice Ninja v5      │
          │ /parentescos                │  │                   │  │ (solo auth de staff) │
          └────────────────────────────┘  └──────────────────┘  └─────────────────────┘
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
| Dominio público | `legadoholding.com` (despliega a la raíz; `/v2` quedó atrás, tag `pre-prevision-funeraria-rollback` para revertir) |
| Subdominio del Worker | `api.legadoholding.com` |
| Worker (nombre interno) | `legado-checkout-dev` |
| API de catálogo/checkout | Prevision-Funeraria, `https://prevision-funeraria.sisteg.workers.dev`, tenant `lh` |
| Invoice Ninja | `invoicing.legadoholding.com` — solo login de staff del panel admin |
| Idiomas | Español / Inglés (toggle en la barra de navegación) |
| Pagos | Stripe Checkout (vía Prevision-Funeraria); cuenta de producción de LH pendiente — hoy corre en modo test |
| Suscripción | Mensual o anual (planes Zulia). Planes "Selecto" no tienen checkout digital (cuota inicial no soportada por la API); su CTA manda a contacto |

---

## 2. Arquitectura

### Componentes

| # | Componente | Función | Tecnología |
|---|---|---|---|
| 1 | **Frontend estático** | Sitio público, wizard, render de planes | HTML + CSS + JS plano servido por Apache |
| 2 | **Cloudflare Worker** (`api.legadoholding.com`) | Orquesta el checkout server-to-server, proxy autenticado de parentescos, y corre el agente "Alma" (Gemini) | JavaScript en V8 (Cloudflare Workers) |
| 3 | **Prevision-Funeraria** (repo separado) | Multi-tenant: catálogo de planes/servicios, clientes, contratos, cobro con Stripe | Cloudflare Workers + D1 (`prevision-funeraria.sisteg.workers.dev`) |
| 4 | **Google Gemini + Supabase** | Motor conversacional de Alma y persistencia de sesiones/turnos de chat | Gemini API + Supabase (Postgres) |
| 5 | **Invoice Ninja v5** | Solo autenticación de staff para el panel admin de este sitio (`worker/src/admin.js`) | Auto-hospedado en `invoicing.legadoholding.com` |
| 6 | **Cloudflare DNS** | Administra `legadoholding.com` y bind del subdominio `api.` al Worker | Cloudflare |

### Flujo completo de una compra

```
Usuario         Frontend (wizard)      Worker (api.legadoholding.com)     Prevision-Funeraria        Stripe
  │                    │                          │                             │                     │
  │                    │  GET planes (CORS,       │                             │                     │
  │                    │  sin token, directo) ────┼────────────────────────────▶│                     │
  │                    │◀──────────────── catálogo ┼─────────────────────────────│                     │
  │ ve planes          │                          │                             │                     │
  │───────────────────▶│                          │                             │                     │
  │ completa wizard     │ POST / (checkout)        │                             │                     │
  │───────────────────▶│─────────────────────────▶│ POST /compras (Bearer       │                     │
  │                    │                          │ PF_TOKEN, success/cancel_url)─────────────────────▶│                     │
  │                    │                          │◀──── link_de_cobro ─────────│                     │
  │                    │◀── link_de_cobro ─────────│                             │                     │
  │  redirige a Stripe  │                          │                             │                     │
  │─────────────────────────────────────────────────────────────────────────────────────────────────▶│
  │  paga en Stripe Checkout                                                                            │
  │◀──────────────────────────────────── redirige a success_url del sitio ─────────────────────────────│
  │                    │                          │        (Stripe → webhook firmado → contrato activo) │
```

El Worker de este repo **no** decide si el pago quedó aprobado — eso lo
resuelve el webhook de Stripe dentro de Prevision-Funeraria. `success_url`
solo muestra una pantalla de "gracias" al comprador.

### Por qué un Worker propio (y no llamar Prevision-Funeraria directo desde el navegador)

- **Token seguro**: `PF_TOKEN` (server-to-server) y `GEMINI_API_KEY` viven
  como secrets cifrados en Cloudflare, jamás llegan al navegador. El catálogo
  de planes sí se llama directo desde el navegador (sin token, CORS abierto).
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
├── CLAUDE.md                       ← contexto para asistentes IA (estado de la migración)
├── .gitignore                      ← excluye worker/.dev.vars, .wrangler/, node_modules
├── index.html                      ← página única, contiene LEGADO_CONFIG y JSON-LD
├── terminos-condiciones.txt        ← texto legal (footer + wizard)
├── politica-privacidad.txt         ← política de privacidad (footer)
├── docs/
│   └── api-publica-wizard.md       ← contrato de la API de Prevision-Funeraria consumida aquí
├── css/
│   └── main.css                    ← estilos de toda la página
├── images/                         ← fotos, logo, fondos
├── js/
│   ├── main.js                     ← TODO el JS del sitio (i18n, planes, wizard, chat, cookies)
│   ├── vendor/purify.min.js        ← DOMPurify vendoreado, sanitiza el HTML del bot Alma
│   └── wizard-generic.js           ← delega la apertura del wizard sin plan preseleccionado
└── worker/                         ← Cloudflare Worker (backend ligero)
    ├── package.json                ← scripts npm (dev / deploy / tail)
    ├── wrangler.toml                ← config del Worker (rutas, vars públicas)
    ├── .dev.vars.example            ← plantilla; copiar a .dev.vars (gitignored)
    └── src/
        ├── index.js                 ← router HTTP, CORS, health
        ├── prevision-api.js         ← cliente HTTP de la API de Prevision-Funeraria
        ├── wizard-compra.js         ← orquestador del checkout (reemplaza pipeline.js)
        ├── chat.js                  ← endpoint /chat, delega en alma.js
        ├── alma.js                  ← agente Gemini: handoff con el teléfono del aliado (ya no cotiza/factura)
        ├── supabase.js              ← persistencia de sesiones/turnos de chat
        ├── admin.js                 ← login del panel admin (todavía vía Invoice Ninja, IN_BASE)
        └── errors.js                ← ValidationError / isValidationError
```

Lo que **NO** se commitea (ver `.gitignore`):
- `worker/.dev.vars` → secrets para desarrollo local (`PF_TOKEN`, etc.)
- `worker/.wrangler/` → caché de wrangler
- `worker/node_modules/` → si en algún momento se añaden dependencias
- `legado-holding/` → clon anidado accidental; si reaparece, es un artefacto y debe borrarse

---

## 4. Stack tecnológico

| Capa | Tecnología | Notas |
|---|---|---|
| Frontend | HTML5 + CSS3 + JavaScript ES2017+ vanilla | Sin build step, sin transpilación |
| i18n | Diccionario en `js/main.js` (`LANG`) | ES/EN, atributos `data-i18n` |
| Analytics | Google Analytics 4 (gtag.js inyectado dinámicamente) | Solo se carga tras aceptar el banner de cookies — ver `loadGoogleAnalytics()` en `index.html` e `initCookieConsent()` en `js/main.js` |
| Worker | Cloudflare Workers (V8 isolates) | Runtime tipo Service Worker, no Node |
| Worker tooling | Wrangler 3+ | CLI oficial de Cloudflare |
| Catálogo y checkout | API pública de Prevision-Funeraria (tenant `lh`) | Contrato en `docs/api-publica-wizard.md` |
| Cobro con tarjeta | Stripe Checkout (orquestado por Prevision-Funeraria) | Cuenta de producción de LH pendiente (KYC); hoy en modo test |
| Chat / IA | Google Gemini (`GEMINI_MODEL`) + Supabase (memoria de sesión) | Implementado en `worker/src/alma.js` |
| Facturación de staff | Invoice Ninja v5 (self-hosted) | Solo login del panel admin, vía `IN_BASE` |
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
4. **Token de Prevision-Funeraria (`PF_TOKEN`)**. Genéralo en el panel admin
   de Prevision-Funeraria, tenant `lh` → *Empresa → API de integración*.

### 5.2 Configurar el token local

Desde la raíz del repo:

```powershell
cd worker
Copy-Item .dev.vars.example .dev.vars
notepad .dev.vars
```

Pega el token después de `PF_TOKEN=`, sin comillas, sin espacios. Guarda.

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
// debe imprimir { WIZARD_WEBHOOK_URL: "http://localhost:8787", PLANS_API_URL: "https://prevision-funeraria.sisteg.workers.dev/api/public/t/lh/planes", PARENTESCOS_API_URL: "http://localhost:8787/wizard/parentescos", CHAT_API_URL: "http://localhost:8787/chat" }
```

Nota: `PLANS_API_URL` siempre apunta directo a Prevision-Funeraria (catálogo
público, CORS abierto) — no pasa por el Worker local ni en dev ni en prod.

Y en otra terminal:

```powershell
Invoke-RestMethod -Uri http://localhost:8787 -Method GET
# pfTokenLoaded debe ser True
```

Si ambos pasan, el setup local está completo. Recarga el sitio: las tarjetas
de planes deben mostrar precios reales (no los de respaldo).

---

## 6. El Worker (`worker/`)

### 6.1 Endpoints

| Método | Ruta | Función | Cuerpo |
|---|---|---|---|
| `GET` | `/` | Health check + diagnóstico de config (secrets cargados, orígenes permitidos) | — |
| `GET` | `/wizard/parentescos` | Proxy autenticado al catálogo de parentescos de Prevision-Funeraria | — |
| `POST` | `/` | Checkout del wizard (`processWizardCheckout`, ver 6.3) | JSON con `intent`, `plan`, `planId`, `paymentType`, `buyer`, `family` |
| `POST` | `/chat` | Proxy al agente Alma (handoff, sin cotizar ni facturar) | JSON del turno de chat |
| `OPTIONS` | `*` | Preflight CORS | — |
| `/admin/*` | (todos) | Panel admin del sitio (login todavía vía Invoice Ninja) | Ver `worker/src/admin.js` |

#### Respuesta de `GET /`

```json
{
  "ok": true,
  "service": "legado-checkout",
  "env": "dev",
  "pfTokenLoaded": true,
  "pfBase": "https://prevision-funeraria.sisteg.workers.dev",
  "geminiConfigured": true,
  "geminiModel": "gemini-2.5-flash",
  "supabaseConfigured": true,
  "supabaseUrl": "https://naebpcyphdcopndqovie.supabase.co",
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

#### Request a `POST /` (checkout)

Solo cubre los planes migrados (`esencial-zulia`, `vanguardia-zulia`) — los
planes "Selecto" no pasan por aquí, ver `worker/src/wizard-compra.js`.

```json
{
  "intent": "create_payment_intent",
  "plan": "esencial-zulia",
  "planId": 3,
  "paymentType": "monthly",
  "buyer": {
    "name": "Juan",
    "lastName": "Pérez",
    "email": "juan@example.com",
    "cedula": "V-12345678",
    "phone": "+584141112233",
    "birthDate": "1985-01-15"
  },
  "family": [
    { "name": "Ana", "lastName": "Pérez", "cedula": "V-87654321", "birthDate": "1988-03-22", "parentescoId": 3 }
  ]
}
```

El Worker traduce este body a `POST /api/public/t/lh/compras` de
Prevision-Funeraria (`forma_pago: "tarjeta"`, con `success_url`/`cancel_url`
armados desde `SITE_BASE_URL`) y devuelve el `link_de_cobro` de Stripe
Checkout al frontend, que redirige al comprador ahí. Contrato completo,
incluyendo los otros `estado` posibles (`pendiente`, `confirmada`), en
[docs/api-publica-wizard.md](docs/api-publica-wizard.md).

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
| `PF_BASE` | `https://prevision-funeraria.sisteg.workers.dev` | Base URL de la API de Prevision-Funeraria |
| `SITE_BASE_URL` | `https://www.legadoholding.com` | Usada para armar `success_url`/`cancel_url` del checkout con Stripe |
| `IN_BASE` | `https://invoicing.legadoholding.com/api/v1` | Solo para el login de staff del panel admin |
| `ENVIRONMENT` | `dev` | Etiqueta de entorno; aparece en el health check |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Modelo que ejecuta el agente Alma |
| `SUPABASE_URL` | (URL del proyecto) | Memoria de sesión y logs de turnos del chat |
| `ALLOWED_ORIGINS` | (lista CSV) | Orígenes permitidos por CORS |

#### Secrets (cifrados en Cloudflare, no se commitean)

| Secret | Función | Cómo se configura |
|---|---|---|
| `PF_TOKEN` | Token de API de Prevision-Funeraria (tenant `lh`) | `wrangler secret put PF_TOKEN` |
| `GEMINI_API_KEY` | API key de Google Gemini para el agente Alma | `wrangler secret put GEMINI_API_KEY` |
| `SUPABASE_SERVICE_ROLE_KEY` | Escritura en Supabase (chat_sessions/chat_turns) | `wrangler secret put SUPABASE_SERVICE_ROLE_KEY` — opcional, el chat sigue funcionando sin esto (no-op fallback) |

> `IN_TOKEN` fue revocado: el checkout y Alma ya no lo usan. Solo el login
> del panel admin sigue contra Invoice Ninja, con las credenciales que el
> propio staff ingresa (no un secret del Worker).

### 6.3 Checkout del wizard, paso a paso

Implementado en [worker/src/wizard-compra.js](worker/src/wizard-compra.js),
función `processWizardCheckout(body, env)` (reemplaza al viejo `pipeline.js`
de Invoice Ninja):

```
1. normalize(body)
   ├─ Valida intent === 'create_payment_intent'
   ├─ Valida plan contra VALID_PLAN_SLUGS (solo esencial-zulia, vanguardia-zulia)
   ├─ Valida planId, paymentType (monthly|annual), email y nombre del comprador
   └─ Sanitiza y valida afiliados (máx. 6, cada uno con parentesco_id)

2. createPF(env).crearCompra(...)
   └─ POST /api/public/t/lh/compras (Bearer PF_TOKEN) con success_url/
      cancel_url armados desde SITE_BASE_URL

3. respond
   └─ { success: true, link_de_cobro, ... } según el 'estado' que
      devuelva Prevision-Funeraria (pendiente_pago | pendiente | confirmada)
```

La confirmación real del pago (activación del contrato) ocurre en
Prevision-Funeraria vía el webhook firmado de Stripe — este Worker no
participa en ese paso.

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

Definida en [index.html](index.html). Conmuta dev/prod por hostname:

```html
<script>
  const __isDev = ["localhost", "127.0.0.1", ""].includes(location.hostname);
  window.LEGADO_CONFIG = {
    WIZARD_WEBHOOK_URL: __isDev
      ? "http://localhost:8787"
      : "https://api.legadoholding.com",
    // Catálogo público: siempre directo a Prevision-Funeraria, no cambia por entorno
    PLANS_API_URL:
      "https://prevision-funeraria.sisteg.workers.dev/api/public/t/lh/planes",
    PARENTESCOS_API_URL: __isDev
      ? "http://localhost:8787/wizard/parentescos"
      : "https://api.legadoholding.com/wizard/parentescos",
    CHAT_API_URL: __isDev
      ? "http://localhost:8787/chat"
      : "https://api.legadoholding.com/chat",
  };
</script>
```

- En `localhost` / `127.0.0.1` / `file://` → Worker local para checkout,
  parentescos y chat. El catálogo de planes siempre llama directo a
  Prevision-Funeraria, en dev y en prod.
- En cualquier otro host → Worker desplegado (`api.legadoholding.com`).

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

Los precios **se cargan directo desde Prevision-Funeraria**, sin pasar por el
Worker. La función `loadPlansFromAPI()` en [js/main.js](js/main.js):

1. Llama a `PLANS_API_URL` (`GET /api/public/t/lh/planes`, sin token, CORS abierto).
2. Recibe solo los planes con `mostrar_web = true` y `activo = true`.
3. Mapea cada item a la forma interna de `PLANS` (precio mensual/anual, id).
4. Reemplaza el objeto `PLANS`. Si la API falla, conserva el fallback hardcoded.

#### Planes disponibles para checkout digital

El modelo `planes` de Prevision-Funeraria todavía no soporta cuota inicial,
así que solo los planes Zulia tienen checkout digital:

| Slug (frontend y API) | Familia | Checkout digital |
|---|---|---|
| `esencial-zulia` | Zulia | Sí — vía `POST /` del Worker |
| `vanguardia-zulia` | Zulia | Sí — vía `POST /` del Worker |
| `esencial-selecto` / `vanguardia-selecto` | Selecto | No — el CTA manda a `#contacto` (cuota inicial no modelada por la API) |

`VALID_PLAN_SLUGS` en [worker/src/wizard-compra.js](worker/src/wizard-compra.js)
es la fuente de verdad de cuáles slugs aceptan checkout. `planId` (el `id`
numérico que devuelve `GET /planes`) va en el payload junto al slug — la API
de Prevision-Funeraria identifica el plan por `plan_id`, no por slug.

### 7.4 Wizard de compra

Pasos definidos en [js/main.js](js/main.js), función `openWizard(planId)`
(uno más, "Plan", cuando el wizard se abre sin plan preseleccionado — ver
`wiz_step_plan` en `LANG`):

| Paso | Contenido | Validación |
|---|---|---|
| Datos | Titular: nombre, apellido, cédula, email, teléfono, fecha nac. | Email válido + edad ≤ maxAge del plan |
| Familia | Familiares (hasta 6, con cédula, fecha nac., parentesco) | Opcional |
| Pago | Forma de pago (modalidad mensual/anual) | Modalidad seleccionada |
| Resumen | Resumen + términos y condiciones | Checkbox "Acepto" marcado |

Al confirmar el paso final, `submitWizard()` hace `POST` al Worker
(`intent: "create_payment_intent"`), que responde con el `link_de_cobro` de
Stripe Checkout para redirigir al comprador. El cierre prematuro del wizard
envía `intent: "lead_abandoned"` con `keepalive: true` (fire-and-forget; no
bloquea al usuario, y hoy no se persiste en ningún lado — ver sección 12).

---

## 8. Despliegue a producción

### 8.1 Worker

Desde `worker/`:

```powershell
# Solo una vez por secret: subir a Cloudflare
wrangler secret put PF_TOKEN
wrangler secret put GEMINI_API_KEY
wrangler secret put SUPABASE_SERVICE_ROLE_KEY   # opcional
# (pega el valor cuando pida "Enter a secret value:")

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
# Health check del Worker
Invoke-RestMethod -Uri https://api.legadoholding.com -Method GET

# Catálogo de planes (directo a Prevision-Funeraria, sin pasar por el Worker)
(Invoke-RestMethod -Uri https://prevision-funeraria.sisteg.workers.dev/api/public/t/lh/planes).items.Count

# Logs en vivo del Worker
wrangler tail
```

---

## 9. Operaciones cotidianas

### 9.1 Añadir un nuevo plan

Los planes ya no se crean en Invoice Ninja — viven en Prevision-Funeraria
(panel admin del tenant `lh`, con `mostrar_web = true` y `activo = true` para
que aparezcan en `GET /planes`). Pasos en este repo:

1. Crea/publica el plan en el panel admin de Prevision-Funeraria (tenant `lh`).
2. Si el plan debe tener checkout digital (sin cuota inicial), añade su slug
   a `VALID_PLAN_SLUGS` en
   [worker/src/wizard-compra.js](worker/src/wizard-compra.js).
3. Añade el slug a `PLAN_GROUPS` en [js/main.js](js/main.js) para que
   aparezca en la región correcta del sitio.
4. Añade las claves i18n `plan_<slug>_name`, `plan_<slug>_features_*` en
   `LANG` si el copy no viene ya cubierto por el catálogo de la API.
5. `wrangler deploy` si tocaste el Worker.

### 9.2 Rotar el token de Prevision-Funeraria (`PF_TOKEN`)

```powershell
# 1. Panel admin de Prevision-Funeraria → Empresa (tenant lh) → "API de
#    integración" → Generar/regenerar token (se muestra una sola vez)
# 2. Sube el nuevo a Cloudflare
cd worker
wrangler secret put PF_TOKEN
# pega el token nuevo cuando lo pida

# 3. Actualiza también worker/.dev.vars con el nuevo valor (para dev local)
```
Regenerar invalida el token anterior de inmediato — coordina con quien tenga
`.dev.vars` local desactualizado.

### 9.3 Ver logs del Worker en producción

```powershell
cd worker
wrangler tail
```

Muestra cada request en tiempo real con los `console.log` del checkout y de
Alma. Útil para depurar problemas reportados por usuarios.

### 9.4 Añadir un origen a CORS

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
| `PF_TOKEN` inválido/vencido | `pfTokenLoaded: false` en GET / o 401 en `wrangler tail` | Regenerar en el panel admin de Prevision-Funeraria y `wrangler secret put PF_TOKEN` |
| Plan no válido para checkout | `wrangler tail` muestra "Plan no disponible para compra directa" | Confirmar que el slug está en `VALID_PLAN_SLUGS` (`worker/src/wizard-compra.js`) |
| Afiliado inválido | `wrangler tail` muestra un 400 con el mensaje de validación de edad/parentesco | Revisar el `parentesco_id` y la fecha de nacimiento contra `GET /wizard/parentescos` |

### Síntoma: las tarjetas de plan muestran precios genéricos en vez de los reales

| Causa probable | Diagnóstico | Solución |
|---|---|---|
| `GET /planes` falla o no responde | Network del navegador, status del request a `prevision-funeraria.sisteg.workers.dev` | Confirmar que Prevision-Funeraria está arriba; no depende de este Worker |
| Plan sin `mostrar_web=true` | El plan no aparece en la respuesta de `/planes` | Publicarlo desde el panel admin del tenant `lh` |
| Slug no reconocido en el frontend | Consola del navegador imprime "Plan X no devuelto por la API" | Añadir el slug a `PLAN_GROUPS` en `js/main.js` |

### Síntoma: el comprador llega a Stripe Checkout pero el contrato no se activa

| Causa probable | Diagnóstico | Solución |
|---|---|---|
| Pago en modo test | La cuenta de producción de Stripe de LH todavía no existe | Esperado hasta que exista la cuenta real (ver `docs/api-publica-wizard.md`, "Sección 0") — no es un bug de este repo |
| Webhook de Stripe no confirmó | Consultar contrato con sesión de staff en Prevision-Funeraria (`GET /api/t/lh/contratos?cliente_id=...`) | Este repo no participa en ese paso — reportar a Prevision-Funeraria si el webhook falla |

---

## 11. Seguridad

### Lo que NUNCA debe estar en el repo

- El valor real de `PF_TOKEN`, `GEMINI_API_KEY` o `SUPABASE_SERVICE_ROLE_KEY`
  (en cualquier archivo).
- Credenciales de Cloudflare (`wrangler login` las guarda en
  `%USERPROFILE%\.wrangler\`, fuera del repo).
- `worker/.dev.vars` (gitignored).
- Capturas de pantalla con tokens visibles.

### Procedimiento si un secret se filtra

1. **Inmediatamente**: regenerar el token en el panel admin de
   Prevision-Funeraria (para `PF_TOKEN`) o en el proveedor correspondiente
   (Google Cloud para `GEMINI_API_KEY`, Supabase para `SUPABASE_SERVICE_ROLE_KEY`).
2. Actualizar el secret en Cloudflare: `wrangler secret put <NOMBRE>`.
3. Actualizar `worker/.dev.vars` local.
4. Limpiar el historial de PowerShell:
   ```powershell
   Remove-Item (Get-PSReadLineOption).HistorySavePath
   ```
5. Si el secret apareció en un commit de git: además del rotado, considerar
   reescribir la historia con `git filter-repo` o
   [BFG Repo-Cleaner](https://rtyley.github.io/bfg-repo-cleaner/) — pero
   asume que el secret ya está comprometido sin importar la limpieza.

### Por qué CORS está restringido

Sin whitelist, cualquier sitio web podría llamar al Worker y disparar
compras/leads en nombre de visitas a su página. La whitelist asegura que solo
`legadoholding.com` y entornos de desarrollo conocidos puedan disparar el
flujo desde un navegador. Las llamadas server-to-server (sin header `Origin`)
no son afectadas y siguen funcionando.

---

## 12. Limitaciones conocidas y trabajo futuro

| Pendiente | Severidad | Notas |
|---|---|---|
| Planes "Selecto" sin checkout digital | Media | El modelo `planes` de Prevision-Funeraria no soporta cuota inicial todavía. Su CTA manda a `#contacto`. Ver `docs/api-publica-wizard.md`. |
| Cuenta Stripe de producción de LH pendiente | Alta (negocio, no de código) | KYC/verificación de Legado Holding Inc. sin completar; todo cobro hoy es en modo test de Stripe. Bloqueo externo, no de este repo. |
| Login del panel admin sigue en Invoice Ninja | Baja | `worker/src/admin.js` autentica staff contra `IN_BASE`. Deuda de migración, no bloqueante — ver `CLAUDE.md`. |
| Sin idempotencia en checkout | Media | Doble click en "Confirmar" puede crear dos compras pendientes. Mitigar con un `Idempotency-Key` (uuid del wizard) en el Worker. |
| Worker `lead_abandoned` no se persiste | Media | El frontend envía el evento fire-and-forget pero el Worker no lo guarda. Para CRM: añadir lógica de log en el Worker o enviar a un endpoint de marketing. |
| Sin tests automatizados | Media | No hay unit tests del checkout. Considerar Vitest + `@cloudflare/vitest-pool-workers`. |
| Sin banner de consentimiento granular por región | Baja | El banner de cookies (ver `initCookieConsent()` en `js/main.js`) es binario aceptar/rechazar; no diferencia por jurisdicción (auditoría de marca §8.2). |
| Sin JSON-LD `LocalBusiness`/`FAQPage`/`BreadcrumbList` | Baja | Solo se agregó `Organization` y `Service` porque el sitio no tiene dirección física verificable ni sección de FAQ visible que los respalde. Añadir cuando exista ese contenido. |

---

## Apéndice: árbol completo del repo

```
legado-holding/
├── .claude/
│   └── handoff.json
├── .gitignore
├── README.md
├── CLAUDE.md
├── css/
│   └── main.css
├── docs/
│   └── api-publica-wizard.md
├── images/
│   └── (logos, fotos, fondos)
├── index.html
├── js/
│   ├── main.js
│   ├── vendor/purify.min.js
│   └── wizard-generic.js
├── terminos-condiciones.txt
├── politica-privacidad.txt
└── worker/
    ├── .dev.vars.example
    ├── package.json
    ├── src/
    │   ├── index.js
    │   ├── prevision-api.js
    │   ├── wizard-compra.js
    │   ├── chat.js
    │   ├── alma.js
    │   ├── supabase.js
    │   ├── admin.js
    │   └── errors.js
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
wrangler secret put PF_TOKEN        # Añadir/actualizar
wrangler secret list                # Verificar (sin valores)
wrangler secret delete PF_TOKEN     # Quitar

# === Pruebas server-to-server ===
$URL = "https://api.legadoholding.com"
Invoke-RestMethod -Uri $URL -Method GET                       # health

# Catálogo (directo a Prevision-Funeraria, sin token)
Invoke-RestMethod -Uri "https://prevision-funeraria.sisteg.workers.dev/api/public/t/lh/planes" -Method GET

# Checkout end-to-end (PowerShell) — usa un planId real del catálogo de arriba
$payload = @{
  intent      = "create_payment_intent"
  plan        = "esencial-zulia"
  planId      = 3
  paymentType = "monthly"
  buyer = @{
    name="Test"; lastName="Worker"; email="tu@email.com"
    cedula="V-12345678"; phone="+584141112233"
    birthDate="1985-01-15"
  }
  family = @()
} | ConvertTo-Json -Depth 4
Invoke-RestMethod -Uri $URL -Method POST -Body $payload -ContentType "application/json"

# === Git workflow ===
git status
git add -u                         # stage mods + deleciones
git add <new-files>                # stage nuevos
git commit -m "feat: ..."
git push origin main
```
