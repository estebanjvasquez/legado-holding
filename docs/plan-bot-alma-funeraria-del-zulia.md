# Bot Alma para Funeraria del Zulia — plan de implementación y registro de decisiones

> **Documento vivo.** Recoge (a) qué reutilizamos del bot de LEGADO, (b) qué cambia
> para Funeraria del Zulia (FDZ), y (c) las decisiones que se van tomando en el
> trabajo sobre el bot de LEGADO y que aplican también acá.
>
> **Estado: BORRADOR.** El bot de FDZ todavía no está en desarrollo. Primero se
> estabiliza Alma en LEGADO (tenant `lh`); FDZ (tenant `fdz`) reutiliza la base.
>
> **Fecha de creación:** 2026-09-09. Última actualización: 2026-09-09.

---

## 1. Contexto y diferencias de fondo

| Dimensión | LEGADO (tenant `lh`) | Funeraria del Zulia (tenant `fdz`) |
|---|---|---|
| Público | Venezolanos en EE. UU. con familia en Venezuela (diáspora) | Público local en el Zulia / Venezuela |
| Framing del bot | "cuida a los tuyos en Venezuela, estés donde estés" | atención local, presencial e inmediata |
| Servicios | Planes de previsión (Familias Protegidas) + red de **aliados** funerarios por ciudad | Servicios funerarios locales **propios** — FDZ ES el proveedor en su zona — + cremación (Crematorios del Zulia) |
| Repatriación internacional | Caso relevante (item #6 del análisis) | Poco o nada relevante |
| Idioma | ES + EN | ES (EN opcional, baja prioridad) |
| Sitio | legadoholding.com, **con** wizard de compra | funerariadelzulia.com, **sin** wizard de compra público *(a confirmar)* |
| Identidad en el prompt | "LEGADO, la marca que une FDZ + Familias Protegidas + Crematorios del Zulia" | "Funeraria del Zulia, desde 1944" (parte del mismo grupo) |
| Pago digital | Stripe Checkout vía Prevision-Funeraria | *(a confirmar — probablemente no hay checkout digital)* |

---

## 2. Qué reutilizamos tal cual (ya construido para LEGADO)

- **Loop de function-calling** en `worker/src/alma.js` (OpenAI `gpt-5.6-luna`, máx 8
  hops, `reasoning_effort: "none"`, timeout 30 s).
- **Orquestación** en `worker/src/chat.js`: límites duros (mensaje ≤ 4000, historial
  ≤ 40), persistencia en Supabase (`chat_sessions` + `chat_turns` con cada hop, tool,
  latencia y error).
- **API pública multi-tenant de Prevision-Funeraria** (`PF_BASE` + token por tenant).
  Ya sirve `fdz` y `lh` con el mismo contrato (`docs/api-publica-wizard.md`).
- **Tools**: `list_planes`, `list_servicios`, `lookup_coverage`, `handoff_whatsapp`,
  `create_lead`.
- **`agent_config`** en Supabase con override por tenant de `system_prompt_es/en`,
  `model`, `temperature`, `emergency_phone`.
- **Clasificación FASE 0** (A duelo / B urgencia / C informativa / D neutro) y
  **RULE #1** (primer turno de duelo sagrado: sin precios, sin listas, sin tools).
- **Texto de WhatsApp armado en backend** (no lo redacta el LLM); atribución de
  vendedor inyectada en los executores, invisible al modelo.
- **Fail-closed en cobertura**: si `lookup_coverage` falla, se asume NO cubierto.
- **Guía de tono y comportamiento**: `docs/GUIA_INTERACCION_BOT_LEGADO.md`.

---

## 3. Qué cambia para FDZ

### 3.1 Parametrización por tenant — DECISIÓN DE ARQUITECTURA PENDIENTE
El prompt de `alma.js` está cableado a LEGADO. Opciones:

- **(a) Mismo Worker, prompt por tenant** vía `agent_config.system_prompt_es` (ya
  soportado). Falta un parámetro de `tenant` explícito en `/chat`, en `createPF` y en
  la selección de prompt hardcoded de fallback. Menos infraestructura; el multi-tenant
  ya existe en la API y en `agent_config`.
- **(b) Segundo deploy del Worker** con su propio `PF_BASE`/token/vars y su propio
  dominio (`api.funerariadelzulia.com`).

**Recomendación preliminar: (a).** Confirmar dónde se resuelve el tenant (por dominio
de origen, por parámetro del frontend, o por config).

### 3.2 Prompt del sistema
- Quitar todo el framing de diáspora ("estés donde estés", "tu familia en Venezuela",
  "venezolanos en Estados Unidos").
- Identidad: "Funeraria del Zulia, desde 1944" — sin la envoltura "LEGADO que une…".
- Mantener el tono de `GUIA_INTERACCION_BOT_LEGADO.md` (aplica a ambas marcas; ver
  decisión pendiente sobre si pasa a ser guía de grupo).
- El **protocolo de crisis** (decisión #1) va idéntico — es tenant-agnóstico.

### 3.3 Cobertura / `lookup_coverage` — DECISIÓN DE NEGOCIO PENDIENTE
En LEGADO, `lookup_coverage(city)` busca un **aliado** funerario. FDZ **es** la
funeraria en su zona.
- ¿FDZ atiende solo el estado Zulia? ¿Fuera del Zulia deriva a aliados (como LEGADO)
  o directamente no cubre?
- Si es solo Zulia: la tool podría reducirse a "sí, cubrimos tu zona" vs. "fuera de
  cobertura → handoff", sin lista de aliados.

### 3.4 Servicios locales
- FDZ probablemente expone **más servicios sueltos** que LEGADO (velación, traslado
  local, cofres, tanatopraxia, salas, etc.).
- Verificar que `list_servicios` del tenant `fdz` ya tenga el catálogo cargado en
  Prevision-Funeraria.
- Se mantiene la regla de **no dar precio de servicios** (mismo motivo: se piden en
  medio de una emergencia; cotizar en frío rompe el tono).

### 3.5 Wizard de compra / previsión — A CONFIRMAR
- Si funerariadelzulia.com no tiene wizard, Alma-FDZ **nunca** menciona "link de pago"
  ni checkout digital. `create_lead` (prospecto) y `handoff_whatsapp` siguen aplicando.
- ¿FDZ vende planes de previsión ("Familias Protegidas") localmente? Si sí,
  `list_planes` del tenant `fdz`; si no, se quita esa rama del prompt.

### 3.6 Idioma
- ES por defecto. Si se decide **ES-only**, se puede omitir `SYSTEM_PROMPT_EN` para
  `fdz` y simplificar.

### 3.7 WhatsApp de emergencia y teléfono de último recurso
- `whatsapp_emergencia` del tenant `fdz` (se lee de `list_servicios`, configurable por
  staff en el panel de Prevision-Funeraria).
- Definir un `DEFAULT_WHATSAPP_EMERGENCIA` para `fdz` (hoy la constante de `alma.js`
  es el número de `lh`) — al parametrizar por tenant (§3.1) debe resolverse por tenant.
- Opcionalmente `agent_config.emergency_phone` del tenant `fdz` con una línea dedicada.
  Ver decisión #2: ya no hay placeholder, el fallback es el WhatsApp real del tenant.

---

## 4. Registro de decisiones (trabajo sobre Alma-LEGADO que también aplica a FDZ)

| # | Fecha | Decisión | Aplica a | Estado |
|---|---|---|---|---|
| 1 | 2026-09-09 | **Protocolo de crisis** (riesgo de autolesión / daño a terceros) como *prioridad absoluta*, evaluado ANTES de la clasificación FASE 0 y por encima de RULE #1. Conducta: suspender flujo funerario, respuesta breve y cálida sin juzgar ni pedir detalles del método, derivar a ayuda real adaptada por país/idioma (988 en EE. UU. / 911 + persona de confianza en Venezuela — **no hay línea de crisis nacional en Venezuela**), ofrecer handoff humano prioritario por WhatsApp (**guardia 24/7 desde Venezuela, confirmado por el usuario**) sin condicionar. Va **hardcoded** en `CRISIS_PREAMBLE_ES/EN` y se antepone al prompt en `runAlma()` **aunque** `agent_config` traiga un `system_prompt_*` propio, para que un override no pueda borrarlo. | Ambos (tenant-agnóstico) | **CERRADA** — implementada en `worker/src/alma.js` + `docs/GUIA_INTERACCION_BOT_LEGADO.md` §7 (sin deploy) |
| 2 | 2026-09-09 | **Eliminar el placeholder `EMERGENCY_PHONE = "0414-XXX-XXXX"`** de `alma.js`. El número de último recurso del prompt (`{{emergency_phone}}`) se resuelve en runtime: `agent_config.emergency_phone` si el staff configuró una línea dedicada, si no `DEFAULT_WHATSAPP_EMERGENCIA` (el WhatsApp de emergencia real del tenant). Los prompts hardcoded pasan de `${EMERGENCY_PHONE}` (evaluado a la string falsa en carga del módulo) al marcador `{{emergency_phone}}`, que ahora se sustituye tanto para el prompt hardcoded como para el de `agent_config`. Alma dice el número "como WhatsApp", se disculpa y sugiere reintentar. | Ambos (tenant-agnóstico; FDZ usa su propio `whatsapp_emergencia` / `agent_config.emergency_phone`) | **CERRADA** — `worker/src/alma.js` (sin deploy) |
| 3 | 2026-09-09 | **Ruta de queja / reclamo — PROCESO E.** Nueva categoría (E) en FASE 0 (insatisfacción / demora / cobro no reconocido / mal trato; no es urgencia funeraria ni consulta neutra). Conducta: reconocer en una frase sin discutir ni minimizar ni culpar; **nunca** prometer soluciones, reembolsos, compensaciones ni plazos; no diagnosticar ni pedir datos de pago; derivar a asesor por `handoff_whatsapp` (necesidad = "Reclamo: …") si quiere contacto ahora, o dar el correo (`info@legadoholding.com`) si prefiere no hablar ahora; si hay urgencia funeraria mezclada, esa parte va primero como PROCESO B. Nueva REGLA DURA. `GUIA` §7 alineada. | Ambos (FDZ: cambiar el correo de contacto y "LEGADO") | **CERRADA** — `worker/src/alma.js` (ES+EN) + `docs/GUIA_INTERACCION_BOT_LEGADO.md` §7 (sin deploy) |
| 4 | 2026-09-09 | **Consentimiento de contacto — ask estándar + registro.** PROCESO C: antes de `create_lead`, Alma pide consentimiento con una frase fija ("¿Te parece si tomo tus datos para que un asesor de LEGADO te contacte? Los usaríamos solo para eso.") y espera un "sí" explícito. `chat.js` graba `lead_consent: "in_chat"` + `lead_consent_at` en `chat_sessions.metadata` al crear el prospecto. | Ambos | **CERRADA** — `worker/src/alma.js` + `worker/src/chat.js` (sin deploy). *Futuro:* estampar la versión de la política de privacidad — pedido a Previsión. |
| 5 | 2026-09-09 | **Estado estructurado de conversación + resumen de handoff.** `chat.js` acumula en `chat_sessions.metadata` (merge sobre lo previo, ya no se pisa cada turno): `turn_count`, `last_user_message`, `lang`, `last_activity_at`, cobertura, `handoff_done`/`handoff_at`, `lead_done`/`lead_at`, `lead_consent*`, `ref_code`/`canal_origen`. Cuando hay derivación por WhatsApp arma `handoff_summary` (texto para la guardia: prioridad, idioma, nombre, necesidad, cobertura, vendedor, últimos 3 mensajes del usuario) **sin** una llamada extra al LLM. `alma.js`: `out.waHandoff` ahora lleva `nombre` y `necesidad`. | Ambos — **base para el panel de sesiones de FDZ** | **CERRADA** — `worker/src/alma.js` + `worker/src/chat.js` (sin deploy). *Futuro:* versión del resumen sintetizada por LLM; visor en el panel. |
| 6 | 2026-09-09 | **Repatriación / traslado internacional (versión conservadora).** PROCESO A, caso especial: si el fallecimiento fue fuera de Venezuela y quieren trasladar a Venezuela → NO `lookup_coverage`; recoger nombre + ciudad/país de origen + ciudad de destino en una frase y `handoff_whatsapp` (necesidad = "Repatriación: de X a Y"). **No promete que el servicio existe, ni tiempos, ni costos.** | LEGADO (para FDZ casi N/A) | **CERRADA (conservadora)** — `worker/src/alma.js`. *Lean del usuario (2026-09-09): la repatriación EE. UU.→Venezuela es probablemente parte del núcleo del negocio de LEGADO — por confirmar. Cuando se confirme + haya condiciones/servicio definido, ampliar el prompt (dejar de hedgear "no prometo que exista") y evaluar un flujo dedicado.* |
| 7 | 2026-09-09 | **Horario de atención.** El usuario confirmó que la guardia de WhatsApp atiende **24/7 desde Venezuela**. Alma puede decirlo al derivar una urgencia; para el contacto de un asesor por un prospecto (no urgente) **no** compromete horario ni plazo ("un asesor te contactará", sin "mañana"/"en 24h"). | Ambos (confirmar guardia 24/7 de FDZ) | **CERRADA** — `worker/src/alma.js` (TONE, PROCESO C). |
| 8 | 2026-09-09 | **Idempotencia de `handoff_whatsapp` / `create_lead` dentro de una llamada a `runAlma`.** Si el modelo emite la tool dos veces (mismo hop o posterior), la 2ª no vuelve a pegarle a la API ni crea otro stub de atribución: devuelve `{ok:true, already_done:true}` y el prompt le dice al modelo que no repita, solo confirme. REGLA DURA nueva reforzando lo mismo a nivel de instrucción. | Ambos | **CERRADA** — `worker/src/alma.js`. *No cubre* doble-fire entre requests distintos (menos probable; se puede añadir pasando `prevMeta` a `runAlma`). |
| 9 | 2026-09-09 | **Idioma.** TONE (ES+EN): "detecta el idioma del ÚLTIMO mensaje del usuario y respóndele en ese idioma; ES por defecto; si mezcla/ambiguo, sigue en ES y ofrece cambiar a EN". El `system_prompt` sigue eligiéndose por el parámetro `lang` del frontend, pero el modelo ya tiene instrucción explícita de responder en el idioma del usuario. | LEGADO (si FDZ es ES-only, se simplifica) | **CERRADA** — `worker/src/alma.js`. |
| 10 | 2026-09-09 | **Confirmar antes de actuar.** REGLA DURA: antes de `create_lead` / `handoff_whatsapp`, Alma recapitula en una frase lo esencial (a quién se contacta y para qué / cuál es la necesidad) y lo confirma; no deriva sobre un solo mensaje ambiguo. | Ambos | **CERRADA** — `worker/src/alma.js`. |

**Nota para FDZ / mejora futura de la API:** una queja no genera hoy ningún registro
propio (solo queda el rastro en `chat_sessions.metadata` + los `chat_turns` de
Supabase). `create_lead` no sirve (exige `tipo` + `plan_id`/`servicio_id`). Si se
quiere una cola de reclamos, es un pedido para Prevision-Funeraria (`/solicitudes`
con un `tipo: "queja"` o endpoint aparte).

### Detalle de implementación de la decisión #1

- `worker/src/alma.js`: nuevas constantes `CRISIS_PREAMBLE_ES` / `CRISIS_PREAMBLE_EN`;
  `runAlma()` arma `sysPrompt = crisisPreamble + "\n\n" + (promptFromDb || promptHardcoded)`.
  El log de `[alma]` ahora incluye `has_crisis=`.
- `docs/GUIA_INTERACCION_BOT_LEGADO.md` §7: nueva subsección "Crisis: riesgo de
  autolesión o de daño a terceros" al inicio de "Situaciones sensibles".
- **Para FDZ:** el preámbulo es tenant-agnóstico; solo cambia "equipo de LEGADO" →
  "equipo de Funeraria del Zulia" cuando se parametrice el prompt por tenant (§3.2).
- **Nota de robustez:** si un admin define `agent_config.system_prompt_es` SIN las
  secciones FASE 0 / RULE #1, las referencias del preámbulo a ellas quedan colgando,
  pero los 5 pasos numerados siguen siendo autónomos y accionables.

### Deploy del lote 1–10

**Desplegado 2026-09-09.** `wrangler deploy` → Worker `legado-checkout-dev` versión
`c2b6c0db-5afc-4f28-a1f9-eb5a5814ddc1` (`api.legadoholding.com`). Commits `1adb30a`
(1–3) y `1c14555` (4–10) pusheados a `origin/main`. Verificado en vivo:
- Mensaje de crisis en español → orienta a persona de confianza + 911 + WhatsApp
  24/7, sin entrar al flujo funerario ni llamar tools. ✓
- Consulta informativa → `list_planes` con catálogo real. ✓
- Health check `GET /` → `pfTokenLoaded:true`, `openaiConfigured:true`,
  `supabaseConfigured:true`. ✓

---

## 5. Estado del análisis "documento genérico vs. Alma" (items pendientes)

Del análisis hecho el 2026-09-09 (documento genérico de instrucciones de bot funerario
vs. la implementación actual de Alma). Orden acordado:

| # | Item | Aplica a FDZ | Estado |
|---|---|---|---|
| 1 | Protocolo de seguridad (crisis / autolesión / daño a terceros) | Sí | **CERRADO** (2026-09-09, ver §4) |
| 2 | `EMERGENCY_PHONE` era un placeholder (`0414-XXX-XXXX` en `alma.js`) | Sí | **CERRADO** (2026-09-09, ver §4) |
| 3 | Ruta de queja / reclamo (PROCESO E) — la `GUIA` §7 ya la pide | Sí | **CERRADO** (2026-09-09, ver §4) |
| 4 | Registro explícito del consentimiento de contacto (compliance) | Sí | **CERRADO** (2026-09-09, ver §4) |
| 5 | Estado estructurado de conversación + resumen sintetizado para el agente humano | Sí — hecho antes de duplicar | **CERRADO** (2026-09-09, ver §4) |
| 6 | Flujo de repatriación / traslado internacional | Casi seguro N/A para FDZ | **CERRADO** conservador (2026-09-09) — pendiente decisión de negocio para ampliarlo |
| 7 | Conciencia de horario de atención de la guardia | Sí | **CERRADO** (2026-09-09) — guardia 24/7 confirmada |
| 8 | Idempotencia por mensaje en `create_lead` / `handoff_whatsapp` | Sí | **CERRADO** (2026-09-09, dentro de una llamada) |
| 9 | Detección de idioma dentro de la conversación | Depende (si FDZ es ES-only, menor) | **CERRADO** (2026-09-09) |
| 10 | "Confirma antes de actuar" — resumir y confirmar antes de `create_lead` / handoff | Sí | **CERRADO** (2026-09-09, ver §4) |

**No se adopta del documento genérico:** pedir ubicación justo tras el pésame; la
lista amplia de servicios de su §1 (flores, música, misa, catering, apoyo psicológico)
salvo que estén en el catálogo real; `create_payment_request` como tool; orientación
de duelo/psicológica salvo servicio validado; su tono más corporativo.

---

## 6. Decisiones pendientes específicas de FDZ

- [ ] Arquitectura multi-tenant del Worker: (a) mismo Worker con prompt por tenant, o
  (b) segundo deploy (§3.1).
- [ ] Modelo de cobertura de FDZ: ¿solo Zulia? ¿deriva o no fuera de cobertura? (§3.3).
- [ ] ¿FDZ vende previsión localmente? (§3.5).
- [ ] ¿Idioma EN para FDZ o ES-only? (§3.6).
- [ ] ¿`GUIA_INTERACCION_BOT_LEGADO.md` pasa a ser guía de grupo, o hay una por marca?
- [ ] ¿Dónde vive el código del bot de FDZ? (este Worker / repo `Propuesta-Funerzul`
  / otro).
- [ ] ¿Existe ya el catálogo del tenant `fdz` (`list_planes` / `list_servicios`) en
  Prevision-Funeraria?
- [ ] **Observabilidad / OpenTelemetry** — ver `docs/observabilidad-opentelemetry.md`.
  Antes de duplicar para FDZ: añadir `tenant` como atributo de primera clase (logs,
  `chat_turns`, `chat_sessions`) y decidir el camino OTel (`service.name` por tenant da
  dashboards por marca gratis).
- [ ] Dominio del endpoint del chat para FDZ (`api.funerariadelzulia.com` u otro).

---

## 7. Referencias

- `worker/src/alma.js` — agente, system prompt, tools, executores.
- `worker/src/chat.js` — orquestación y persistencia.
- `docs/GUIA_INTERACCION_BOT_LEGADO.md` — guía de tono y comportamiento.
- `docs/api-publica-wizard.md` — contrato de la API multi-tenant de Prevision-Funeraria.
- `docs/ONBOARDING-AGENTES.md` — panorama del repo.
- `CLAUDE.md` — nota sobre el repo `estebanjvasquez/Propuesta-Funerzul` (FDZ).
