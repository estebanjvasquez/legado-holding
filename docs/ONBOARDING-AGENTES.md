# ONBOARDING — legado-holding (para cualquier agente o colaborador)

> **Empieza acá.** Este archivo te da todo lo necesario para retomar el proyecto sin
> escanear el repo entero. Si algo de acá contradice al código, gana el código —
> avísalo y corrige este archivo.
>
> **Última actualización: 2026-11-17.** Mantener esta fecha y el bloque
> "Estado actual" al día en cada cierre de jornada.

---

## 1. Qué es esto en dos líneas

Sitio web bilingüe (ES/EN) de **previsión funeraria** para venezolanos en EE. UU.:
catálogo de planes, wizard de afiliación con pago por tarjeta, y un chatbot de
emergencias ("Alma"). Frontend estático + un Cloudflare Worker. El billing y el
catálogo NO viven acá: los sirve la API pública de **Prevision-Funeraria** (repo
separado, tenant `lh`).

---

## 2. Orden de lectura recomendado

| # | Archivo | Para qué |
|---|---|---|
| 1 | **este archivo** | Panorama + estado + gotchas |
| 2 | `CLAUDE.md` | Reglas del repo + narrativa de los cambios recientes + gotchas de producción |
| 3 | `.claude/handoff.json` | Snapshot estructurado del estado (árbol de archivos, gaps, hilos abiertos) |
| 4 | `README.md` | Referencia profunda: arquitectura, endpoints del Worker, operaciones, troubleshooting |
| 5 | `docs/api-publica-wizard.md` | **Contrato** de la API de Prevision-Funeraria que consume el wizard y Alma. Autoritativo. |
| 6 | `docs/GUIA_INTERACCION_BOT_LEGADO.md` | Contrato de tono y clasificación (A/B/C) del bot Alma |
| 7 | `docs/pruebas-tenant-lh-para-prevision.md` | Canal entre agentes (este repo ↔ Prevision-Funeraria): bitácora de pedidos PF-\*/LH-\* |

Lo demás en `docs/` es material de apoyo (specs de UI, manuales, auditoría de marca)
o **archivo histórico** (ver §9).

---

## 3. Arquitectura en 6 líneas

```
Navegador ──GET catálogo (CORS, sin token)──▶ prevision-funeraria.sisteg.workers.dev /api/public/t/lh/planes
   │
   ├─ wizard: POST /  ─────────▶ Worker (api.legadoholding.com) ──Bearer PF_TOKEN──▶ Previsión POST /compras ──▶ Stripe Checkout
   │                                                                                   (webhook firmado → contrato activo)
   └─ chat:   POST /chat ──────▶ Worker ──▶ OpenAI (gpt-5.6-luna, function calling en src/alma.js); config de Alma, aliados, prospectos y derivaciones en Previsión
```

- **Frontend**: HTML/CSS/JS plano, **sin bundler ni framework**, servido por Apache/cPanel.
- **Worker** (`legado-checkout-dev`): orquesta el checkout server-to-server, hace de
  proxy autenticado (`/wizard/parentescos`, `/chat`) y **corre a Alma** (loop de
  function-calling contra OpenAI, no hay n8n).
- **Prevision-Funeraria**: multi-tenant (Cloudflare Workers + D1). Este repo es solo
  un **consumidor** de su API pública. No se toca desde acá.
- **Invoice Ninja, Supabase y el panel admin legacy (`admin/`)**: ya NO existen
  (2026-11-18). Lo administrativo vive en el panel de Prevision-Funeraria. El Worker no
  tiene base de datos propia: la memoria de la conversación la manda el navegador.

---

## 4. Mapa del repositorio

### Frontend (raíz)
| Archivo | Rol |
|---|---|
| `index.html` | Página única. `LEGADO_CONFIG` (switch dev/prod), `PLANS_API_URL` directo a Previsión, `PARENTESCOS_API_URL`/chat vía Worker. **Cache-bust `?v=N`**: `css/main.css?v=4`, `js/attribution.js?v=1`, `js/main.js?v=13` (independientes; líneas ~110 y ~1358). |
| `js/attribution.js` | Atribución de vendedor (`?ref=`): valida el código contra `/wizard/vendedor`, first-touch entre códigos válidos (TTL 90d), guarda los últimos 10 toques. Se carga antes de `main.js`; tests en `worker/test/attribution-frontend.test.mjs`. |
| `js/main.js` | i18n, wizard de 4 pasos, UI del chat de Alma, y **§"ATRIBUCIÓN DE VENDEDOR / CANAL"** (`initAttribution`/`getAttribution`, `localStorage["legado_attribution"]`, first-touch TTL 90d). `SELECTO_CHECKOUT_ENABLED = true`, `WIZARD_ENABLED_SLUGS`. |
| `js/wizard-generic.js` | Botones "Protege tu Legado" sin plan → scroll a la sección de planes. |
| `js/vendor/purify.min.js` | DOMPurify (sanitiza HTML del chat). |
| `css/main.css` | Estilos. Marca: navy `#263c5b`, dorado `#c9a84c` (decorativo, no CTAs), fuente Inter. |
| `gracias.html` / `cancelado.html` | `success_url` / `cancel_url` de Stripe Checkout. **Deben estar en la lista de copia de `.cpanel.yml`.** |
| `terminos-condiciones.html` / `politica-privacidad.html` | Legales (fuentes en los `.txt` homónimos). |

### Worker (`worker/`)
| Archivo | Rol |
|---|---|
| `wrangler.toml` | `name`, `routes` (`api.legadoholding.com/*`), `[vars]`, `[observability] enabled=false`. |
| `src/index.js` | Router: health check, `GET /wizard/parentescos`, `POST /` (checkout), `POST /chat`. |
| `src/prevision-api.js` | Cliente HTTP a Prevision-Funeraria (`getParentescos`, `crearCompra`, lookup de vendedor). |
| `src/wizard-compra.js` | `processWizardCheckout(body, env)` — arma el body de `POST /compras`. Reemplazó al viejo `pipeline.js`. |
| `src/alma.js` | Agente Alma: loop OpenAI, tools (`list_planes`, `list_servicios`, `lookup_coverage`, `handoff_whatsapp`, `create_lead`). **No cotiza ni factura.** Inyecta la atribución en los executores (Alma no la ve). |
| `src/chat.js` | Handler `/chat`: sanea `attribution` e historial (memoria = lo que manda el navegador, 40 turnos), aplica el tope de mensajes por conversación (`turn` del frontend vs. `parametros.max_mensajes_por_conversacion` de PF, 60 por defecto), llama a `runAlma` y registra cada derivación a WhatsApp en PF (`POST /solicitudes`, resumen en `mensaje`). |
| `src/attribution.js` | `sanitizeAttribution(raw)` (whitelists + límites de longitud), `attributionTag()` para logs. |
| `src/ratelimit.js` | Límite de uso (binding `CHAT_IP_LIMITER` 20/min por IP). Fail-open. |
| `test/` | Tests con `node --test` (`npm test` en `worker/`). Corren en Node, no en workerd; `test/setup.mjs` stubea `cloudflare:workers`, `caches` y `scheduler`. |
| `src/errors.js` | Helpers de error. |

### Vars y secrets del Worker
- **Vars** (en `wrangler.toml`, no secretas): `PF_BASE`, `SITE_BASE_URL`, `ALLOWED_ORIGINS`
  (CSV de orígenes CORS), `OPENAI_MODEL=gpt-5.6-luna`, `SUPABASE_URL`, `ENVIRONMENT`.
- **Secrets** (`wrangler secret put`): `PF_TOKEN` (Bearer para `/compras`, `/parentescos`,
  `/vendedores/lookup` de Previsión), `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- Local: `worker/.dev.vars` (gitignoreado). El `PF_TOKEN` de prueba está también en
  `docs/pruebas-tenant-lh-para-prevision.SECRET.md` (gitignoreado).

---

## 5. Estado actual (2026-11-17)

- **En producción.** `main` despliega a la **raíz** de `legadoholding.com` (antes `/v2`;
  tag de rollback `pre-prevision-funeraria-rollback`). El Worker de `api.legadoholding.com`
  corre el código nuevo. **El deploy del frontend NO es automático**: tras el push a `main`
  hay que hacer en cPanel → Git Version Control → *Update from Remote* + *Deploy HEAD Commit*.
- **Stripe en VIVO** (cuenta propia de Legado Holding Inc., confirmado 2026-11-17). Una
  compra de prueba crea una compra pendiente real en Previsión.
- **Revisión 2026-11-17 desplegada** (commits `419ebdf`, `562e68a`; Worker `85428f82` +
  cambio de secret): reintentos de OpenAI con presupuesto de 60 s por turno y WhatsApp de
  guardia si Alma falla; límite de `/chat` (20/min por IP, 60 mensajes por conversación);
  historial acotado (40 turnos / 24k caracteres); timeouts a Previsión y reintento sin
  atribución solo ante 400/422; `?ref=` validado (`js/attribution.js`) con historial de
  toques; panel admin solo con `ADMIN_TOKEN`. Verificado en vivo.
- **Los 4 planes tienen checkout digital.** Los "Selecto" (`esencial-selecto`,
  `vanguardia-selecto`) cobran una **cuota inicial única** (`cuota_inicial_centavos` en
  `GET /planes`): Previsión la mete como `line_item` **sin `recurring`** en el Stripe
  Checkout (solo a la 1ª factura). `SELECTO_CHECKOUT_ENABLED = true` en `js/main.js`.
  Verificado end-to-end (contratos #8 y #9, 1ª factura $44,47 = $9,47 + $35).
- **Atribución de vendedores externos (`?ref=`) + campañas (UTM)**: implementada y
  verificada de punta a punta (wizard, leads de Alma, handoff a WhatsApp). First-touch,
  TTL 90d, `localStorage`. `js/attribution.js` + `worker/src/attribution.js`.
  Detalle: `docs/atribucion-vendedor-plan-legado.md`. Guía para marketing:
  `docs/campanasatribucion.md` (gitignoreada).
- **Alma corre en OpenAI** (`gpt-5.6-luna`, swap desde Google Gemini). Clasifica cada
  mensaje en A/B/C según `docs/GUIA_INTERACCION_BOT_LEGADO.md`; deriva a WhatsApp
  (`handoff_whatsapp`) o registra un prospecto (`create_lead`); no inventa precios.
- **Páginas legales** (Términos, Privacidad) publicadas.

### Pendiente / hilos abiertos
- **Canal entre agentes: PF-8 a PF-11 desplegados en ambos lados (2026-11-17).** Ver
  `docs/pruebas-tenant-lh-para-prevision.md`. Queda:
  - Aliados: viven solo en Previsión (panel de PF → *Aliados*); Alma los lee de
    `/aliados`. Respaldo de Supabase y pestañas Aliados/Ubicaciones del panel legacy
    retirados 2026-11-17. WhatsApp de emergencia editable en PF verificado en vivo.
  - **Configuración de Alma desde PF** (Configuración › *Asistente del sitio*,
    `GET /api/public/t/lh/asistente`): el Worker la lee (`resolveAsistente` /
    `resolveAlmaConfig` en `worker/src/alma.js`, caché en memoria 5 min, última conocida
    si PF cae). Precedencia por campo: PF → código/env. Si
    `proveedor` no es `openai`, se usa el respaldo (Alma solo implementa OpenAI). Si OpenAI
    rechaza (4xx) la clave/modelo de PF, el turno reintenta una vez con
    `OPENAI_API_KEY`/`OPENAI_MODEL` del Worker. El protocolo de crisis se antepone siempre.
    Log por turno: `cfg_source=… key_source=… prompt_source=prevision|hardcoded`.
- **Panel admin legacy y Supabase retirados (2026-11-18).** Lo que guardaba
  `chat_sessions` quedó así: derivaciones a WhatsApp → siempre una solicitud en PF con
  el resumen para el asesor; prospectos → solicitud en PF con la constancia de
  consentimiento en `mensaje`; memoria → historial del navegador; tope por conversación
  → configurable en PF. Las transcripciones completas (`chat_turns`) **ya no se guardan**
  (decisión pendiente: vista de conversaciones en PF). Los datos de Supabase eran de
  prueba y no se migraron. Pendiente en PF: distinguir derivación de prospecto y campo
  de consentimiento (prompt entregado al usuario).
- **Hilo abierto**: el usuario reportó que Alma "se presenta dos veces" en su navegador,
  pese a que el fix está verificado correcto en backend y frontend. Falta confirmarlo en
  ventana de incógnito. Ver `.claude/handoff.json` → `open_thread_needs_followup`.
- `README.md` y partes de `docs/` pueden describir todavía la arquitectura vieja basada
  en Invoice Ninja en algún punto — no reescritas por completo.

---

## 6. Gotchas que cuestan horas

1. **Caché del edge de Cloudflare (~4h) para `css`/`js`.** Cada cambio a `css/main.css`
   o `js/main.js` necesita subir el `?v=N` correspondiente en `index.html` (líneas ~100
   y ~1283, son independientes). Verificar cache-miss real:
   `curl -sI 'https://www.legadoholding.com/js/main.js?zzz=<timestamp único>' | grep cf-cache-status` → debe decir `MISS` con contenido nuevo.
2. **`wrangler dev` crashea en la máquina Windows del usuario** (crash nativo de
   `workerd`, `std::terminate()`). Workaround: importar los módulos del Worker directo
   en Node desde un script de scratchpad (son ES modules planos que solo usan `fetch`).
3. **Alma / `gpt-5.6-luna`** (dos gotchas descubiertos en prod):
   (a) es un modelo *reasoning* que en `/v1/chat/completions` **rechaza (400) function
   tools** junto a su `reasoning_effort` por defecto → `alma.js` fuerza
   `reasoning_effort: "none"` en cada llamada.
   (b) (histórico) `agent_config.model` en Supabase había quedado en `"gemini-2.5-flash"`;
   Supabase ya se retiró y la config viene de PF (`/asistente`).
4. **`POST /solicitudes` de Previsión**: `telefono` **≤ 20 caracteres** (400 silencioso
   `"Too big..."` si se pasa), `nombres`/`apellidos` ≤ 60. El Worker capa esos campos.
5. **`solicitud_id` es un string opaco de 10 caracteres**, NO un entero. Nunca
   `Number(solicitud_id)`.
6. **Atribución con vendedor**: cuando hay `codigo_vendedor`, el frontend **NO** manda
   `canal_origen` (la API lo infiere del código).
7. **`.claude/settings.json` y `settings.local.json` están gitignoreados** (contienen
   comandos pre-aprobados con tokens inline). No versionarlos.
8. **No regenerar el token de API del tenant `lh`.** Invalida el `PF_TOKEN` del Worker de
   prod y rompe checkout + leads de Alma hasta correr `wrangler secret put PF_TOKEN` con
   el valor nuevo (y actualizar `.dev.vars` y el `.SECRET.md`).
9. **Cargar secrets en Windows**: PowerShell bloquea `wrangler.ps1` → usar `wrangler.cmd`.
   No pegar el valor en el aviso oculto de `secret put` (en 2026-11-17 el pegado falló sin
   avisar y el secret quedó con otro valor). Pasarlo por pipe:
   `$t | wrangler.cmd secret put NOMBRE` (el Worker hace `trim()` del valor).
10. **Rate Limiting de Workers es aproximado y por ubicación**: en la prueba en vivo los
    429 empezaron unos mensajes después del umbral de 20/min. Sirve contra abuso, no es
    una cuota exacta.

---

## 7. Comandos esenciales

```bash
# Deploy del Worker
cd worker && wrangler deploy

# Deploy del frontend (dispara .cpanel.yml al hacer push a main)
git push origin main       # el usuario confirma que el deploy de cPanel se disparó

# Secrets del Worker
cd worker && wrangler secret put PF_TOKEN            # (o OPENAI_API_KEY, SUPABASE_SERVICE_ROLE_KEY)

# Health check (debe reportar pfTokenLoaded:true)
Invoke-RestMethod -Uri 'https://api.legadoholding.com' -Method GET

# Cache-bust tras tocar css/js: subir ?v=N en index.html, commit, push
```

`.cpanel.yml` copia a `/home/legadoholding/public_html`:
`index.html gracias.html cancelado.html css js images terminos-condiciones.html politica-privacidad.html admin`.
Si agregas un archivo estático nuevo que deba publicarse, **agrégalo a esa lista**.

---

## 8. Contratos externos y coordinación

- **API de Prevision-Funeraria**: base `https://prevision-funeraria.sisteg.workers.dev`,
  tenant `lh`, prefijo `/api/public/t/lh/`. Contrato completo en
  `docs/api-publica-wizard.md`. **No inventar campos ni endpoints.**
- **Canal entre agentes**: `docs/pruebas-tenant-lh-para-prevision.md` es bidireccional.
  Los pedidos a Previsión van en "Bitácora de pedidos al agente de Prevision-Funeraria"
  (PF-1, PF-2…); lo que Previsión necesita de acá va en la bitácora LH-\*. Cada quien
  marca `[x]` cuando **el otro** verificó el cierre.
- **Notion**: el tracking por sesión vive en la página *"Previsión Funeraria — Proyecto y
  documentación"* → subpáginas *"Registro de Proyecto — <fecha> (Legado Holding)"*.
  Cerrar cada jornada con un registro nuevo ahí.
- **No modificar el repo `Prevision-Funeraria` desde acá.** Este repo solo consume su API.
- **Portal del titular (cliente final) — ya existe en Prevision-Funeraria, NO se
  construye acá.** `https://prevision-funeraria.sisteg.workers.dev/portal/?empresa=lh`
  — login por cédula + código OTP por email; contratos, solicitudes, pago de cuotas
  (tarjeta o manual con comprobante), adelanto de pagos, beneficiarios. Multi-tenant,
  se rebrandea solo (`GET /api/public/t/lh/portal/marca` → "Legado Holding Inc." + logo
  + `#263c5b`). El nav "Portal Clientes" de `index.html` ya apunta ahí (antes apuntaba
  al login viejo de Invoice Ninja, obsoleto — commit `defb34d`, 2026-09-11). Si algo del
  portal necesita cambiar, es trabajo de Prevision-Funeraria, no de este repo.

---

## 9. Archivo histórico (NO es estado actual)

- `docs/prevision/2026-08-13-fase-0.md` y `docs/legado-holding-prevision/*`: diseño de un
  "Módulo de Previsión" que originalmente iba a construirse **dentro** de este repo
  (integrado con Invoice Ninja). Ese plan se descartó: el sistema se construyó en el repo
  separado `Prevision-Funeraria`. Estos archivos quedan como referencia de decisiones
  tomadas, no describen el sistema actual.
- Menciones a Invoice Ninja como base de billing en `README.md` o docs viejos: obsoletas
  salvo por el login de `admin.js`.

---

## 10. Qué NO tocar sin pedido explícito

- El repo `Prevision-Funeraria` (es otro proyecto/otro agente).
- El wizard o el bot Alma **sin seguir** `docs/api-publica-wizard.md` y
  `docs/GUIA_INTERACCION_BOT_LEGADO.md`.
- El token de API del tenant `lh` (no regenerar).
- Los archivos gitignoreados de `docs/` (`*.SECRET.md`, `*.docx`, `campanasatribucion.md`,
  `cost-and-pricing.md`, `proposal-client.md`).
