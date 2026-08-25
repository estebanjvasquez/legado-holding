# Auditoría de marca y campaña — legadoholding.com

**Fecha:** 2026-08-25
**Alcance revisado:** sitio en vivo (`https://legadoholding.com`) + código fuente en este repo (`index.html`, `css/main.css`, `js/main.js`, `js/wizard-generic.js`).
**Documento de referencia:** [`docs/GUIA_ESPECIFICACIONES_WEB_LEGADO.md`](GUIA_ESPECIFICACIONES_WEB_LEGADO.md) (traduce el Brandbook Identity y la Campaña Digital 2026).

> Este archivo es solo un registro de fricciones encontradas.
> Para cada ítem: marca `[x] Aplicar`, `[x] No aplicar` o deja `[ ] Pendiente` y anota la decisión.
>
> **Actualizado 2026-08-25:** decisiones tomadas con el usuario y aplicadas al código
> salvo donde se indica lo contrario. Ver detalle en cada ítem.

---

## Cómo usar este documento

Cada hallazgo indica: severidad, sección de la guía que lo rige, evidencia concreta (archivo/línea o comportamiento observado en el sitio) y una casilla de decisión. Revísalos en orden de severidad.

---

## 🔴 Crítico

### 1. El dorado se usa como color principal de acción, pero la guía lo prohíbe hasta aprobación
La guía (§3.1) es explícita: *"No se ha entregado un valor de producción definitivo [para el dorado]. Hasta su aprobación, no inventar un dorado para logo o elementos de marca."* Además (§3.2): *"Todo botón primario debe ser azul marino con texto blanco."*

El sitio hace justo lo contrario: define `--gold: #c9a84c` como token de marca de producción y lo usa en el CTA principal del hero (**"PROTEGE TU LEGADO AQUÍ"**), en el botón final de checkout del wizard, en badges y en sombras (`--shadow-gold`).

- Evidencia: [`css/main.css:56, 68-73, 397-403`](../css/main.css#L56)
- Decisión: [x] Aplicar (pasar CTAs a azul marino) · [ ] No aplicar · [ ] Pendiente
  Aplicado: `.btn-gold`, `.btn-nav-cta`, `.btn-next` (checkout del wizard),
  `#emergency-btn`, `.chat-send-btn` y `.chat-pay-btn` ahora usan
  `var(--primary)` / texto blanco en vez de `--gradient-gold`. El dorado se
  mantiene como acento decorativo (íconos, badges, quote marks) — no se tocó,
  queda fuera del alcance de esta decisión.

### 2. Los enlaces legales del footer no llevan a ningún sitio
"Términos y condiciones", "Política de privacidad" y "Soporte" en el footer apuntan a `href="#"`. La guía (§8.2 y checklist §10) exige que estos enlaces estén accesibles desde todas las páginas antes de publicar. Existe un `terminos-condiciones.txt` en la raíz del repo, pero no está enlazado desde el footer (solo se usa dentro del modal del wizard). No se encontró contenido de política de privacidad en ninguna parte del sitio.

- Evidencia: [`index.html:977-983`](../index.html#L977)
- Decisión: [x] Aplicar (enlazar/crear páginas reales) · [ ] No aplicar · [ ] Pendiente
  Aplicado: "Términos y condiciones" enlaza a `terminos-condiciones.txt` (ya
  existía, no estaba enlazado desde ningún lado — también se corrigió texto
  corrupto en la sección 7 del documento). "Política de privacidad" enlaza a
  `politica-privacidad.txt`, creado nuevo (borrador honesto sobre qué se
  recopila/comparte — recomendable que legal lo revise antes de tratarlo como
  definitivo). "Soporte" enlaza a `#contacto`, sección ya existente con
  teléfono/email.

---

## 🟠 Alto

### 3. Tipografía del sitio no coincide con la guía
La guía (§3.4) exige `Inter` (fallback `Arial`) para interfaz/lectura, y reserva una fuente serif solo para titulares editoriales *tras aprobación*. El sitio usa `DM Serif Display` para todos los encabezados y `DM Sans` para todo el cuerpo — ninguna de las dos es la familia especificada.

- Evidencia: [`css/main.css:43, 92-93`](../css/main.css#L43)
- Decisión: [x] Aplicar (migrar a Inter) · [ ] No aplicar · [ ] Pendiente
  Aplicado: `--font-heading` y `--font-body` ahora son `"Inter", Arial,
  sans-serif`. Sin aprobación de una serif editorial, los headings también
  usan Inter (antes DM Serif Display).

### 4. No hay banner de consentimiento de cookies; Google Analytics carga sin bloqueo
La guía (§8.2) exige *"banner de consentimiento configurable por región y bloqueo de etiquetas no esenciales hasta consentimiento cuando aplique."* GA4 (`gtag('config','G-6NQKC8DHDV')`) se dispara inmediatamente al cargar la página, sin ningún banner previo.

- Evidencia: [`index.html:11-14`](../index.html#L11)
- Decisión: [x] Aplicar · [ ] No aplicar · [ ] Pendiente
  Aplicado: GA4 ya no se carga en el `<head>`. Nuevo banner
  (`#cookie-consent-banner`, `initCookieConsent()` en `js/main.js`) bloquea
  `loadGoogleAnalytics()` hasta que el usuario acepta; si rechaza, GA4 nunca
  se carga. La decisión se guarda en `localStorage`. Es binario
  aceptar/rechazar, no diferencia por región — suficiente para el hallazgo,
  pero no es un CMP granular por jurisdicción.

### 5. Testimonios: no hay evidencia de autorización, y una cita promete "en minutos"
La sección de testimonios muestra tres tarjetas atribuidas ("María G., Miami FL", "Carlos R., Houston TX", "Ana P., New York NY") con frases redactadas en tono de copy de marketing. La guía (§5.2 punto 8) exige *"testimonios verificables ... Si no están disponibles, no usar testimonios ficticios"*, y el testimonio de Ana P. dice *"En minutos tenía todo configurado desde mi teléfono"*, justo el tipo de frase que §2.3 pide no afirmar *"si el flujo real no lo demuestra"*.

**Esto requiere confirmación del negocio**: ¿son testimonios reales con autorización de uso, o contenido de relleno? No es verificable desde el código.

- Evidencia: [`js/main.js:216-226, 898-905`](../js/main.js#L216)
- Decisión: [ ] Son reales y autorizados — dejar así · [ ] Son de relleno — reemplazar o quitar sección · [x] Pendiente de confirmar con negocio

  **Plan acordado (2026-08-25):** los testimonios pasarán a administrarse desde
  un módulo admin (crear/editar, construidos automáticamente en el sitio) en
  vez de vivir hardcodeados en `LANG` dentro de `js/main.js`. Falta decidir
  **dónde** vive ese módulo:
  - Opción A: nuevo endpoint/tabla en el tenant `lh` de Prevision-Funeraria.
  - Opción B: el panel admin que ya existe en este repo (`worker/src/admin.js`
    + login vía Invoice Ninja).
  - Opción C: migrar ese panel admin existente al tenant de Prevision-Funeraria
    (conecta con la deuda ya anotada en `CLAUDE.md`/`README.md` §12 sobre el
    login de staff seguir en Invoice Ninja).

  Hasta decidir y construir eso, **se mantienen los tres testimonios actuales**
  (María G., Carlos R., Ana P.) sin autorización verificada — pero se quitó la
  frase "En minutos tenía todo configurado" (test3_text) porque prometía un
  tiempo de configuración que el flujo real no garantiza (guía §2.3). Ver
  [`js/main.js` → `test3_text`](../js/main.js).

### 6. Botón primario no cumple "azul marino con texto blanco"
Consecuencia directa del hallazgo #1, pero lo separo porque también es un incumplimiento de accesibilidad/consistencia de sistema (§3.2), no solo de paleta aprobada.

- Decisión: ligada a la #1 — [x] Aplicar · [ ] No aplicar · [ ] Pendiente

---

## 🟡 Medio

### 7. El navy de producción no coincide con el HEX de la guía
Guía (§3.1): `--legado-navy: #263C5B`. Sitio: `--primary`/`--navy: #0f2444`. Es un azul marino más oscuro y distinto, no una variación de redondeo — podría ser una actualización posterior del brandbook que la guía no refleja, o una deriva de implementación.

- Evidencia: [`css/main.css:51, 66`](../css/main.css#L51)
- Decisión: [x] Aplicar HEX de la guía · [ ] No aplicar · [ ] Pendiente
  Aplicado: `--primary`/`--navy` ahora son `#263C5B` (antes `#0f2444`).
  Gradientes y sombras derivadas del navy se recalcularon a partir del nuevo HEX.

### 8. Marcas del consorcio no están claramente presentadas
Guía (§5.4) exige distinguir **Funeraria del Zulia**, **Familias Protegidas** y **Crematorios del Zulia**, indicando qué entidad presta cada servicio. El sitio solo nombra "Funeraria del Zulia" y un programa propio llamado "GRUPO SELECTO" (no documentado en la guía como marca del consorcio); "Familias Protegidas" no aparece en ningún texto, y "Crematorios del Zulia" solo aparece como un enlace de Instagram en el footer, sin explicar su rol.

- Evidencia: [`index.html:606-610, 902`](../index.html#L606)
- Decisión: [ ] Aplicar (aclarar entidades) · [ ] No aplicar (Grupo Selecto es la nomenclatura vigente, actualizar la guía en vez del sitio) · [x] Pendiente — no se tocó el código, requiere que negocio confirme las entidades vigentes del consorcio.

### 9. Sin datos estructurados (JSON-LD)
Guía (§7.3) pide `Organization`, `LocalBusiness` (si aplica), `Service`, `FAQPage` y `BreadcrumbList`. No se encontró ningún bloque `application/ld+json` en el HTML.

- Evidencia: búsqueda sin resultados en `index.html`
- Decisión: [x] Aplicar · [ ] No aplicar · [ ] Pendiente
  Aplicado parcialmente: se agregó `Organization` y `Service` (JSON-LD en el
  `<head>` de `index.html`). No se agregó `LocalBusiness` (no hay dirección
  física verificable en el sitio) ni `FAQPage`/`BreadcrumbList` (no hay
  contenido de FAQ visible ni jerarquía de páginas que los respalde — Google
  exige que el structured data refleje contenido visible en la página).
  Agregar cuando exista ese contenido.

### 10. Único canal humano es un teléfono, sin WhatsApp y sin horario visible
Guía (§5.1): *"Teléfono/WhatsApp solo si existe un canal atendido y con horarios visibles."* El sitio muestra `tel:+18005342361` ("Llámanos") en dos lugares, pero no hay enlace de WhatsApp ni un horario de atención visible cerca del CTA o en el footer/contacto.

- Evidencia: [`index.html:811`](../index.html#L811)
- Decisión: [ ] Aplicar (agregar horario y/o WhatsApp) · [ ] No aplicar (el número está atendido 24/7 — aclarar) · [x] Pendiente — no se tocó el código, requiere que negocio confirme horario real y si hay canal de WhatsApp atendido.

---

## 🟢 Bajo

### 11. Inconsistencia en la antigüedad de la empresa
La guía y el `README.md` afirman *"desde 1944; más de 80 años"* (≈82 años en 2026). El copy del sitio dice *"casi 85 años"*, lo que matemáticamente ubicaría la fundación alrededor de 1941-1942. Es una promesa comercial verificable (§2.3 exige validación de estas cifras).

- Evidencia: [`index.html:602`](../index.html#L602)
- Decisión: [ ] Aplicar (corregir a "más de 80 años") · [ ] No aplicar (la fecha de fundación real es distinta a 1944 — corregir la guía) · [x] Pendiente — no se tocó el código, requiere que negocio confirme el año de fundación real.

### 12. Nota fuera de marca: `README.md` describe una arquitectura ya reemplazada
No es un problema de marca/campaña, pero es relevante para quien use este documento como referencia de "qué toca al publicar": el `README.md` de la raíz describe el checkout vía Invoice Ninja / `pipeline.js`, que según `CLAUDE.md` del repo ya fue reemplazado por `worker/src/wizard-compra.js` y `worker/src/prevision-api.js`. Riesgo de que alguien siga instrucciones de despliegue obsoletas.

- Decisión: [x] Actualizar README · [ ] No aplicar · [ ] Pendiente
  Aplicado: `README.md` reescrito para reflejar la arquitectura actual
  (Prevision-Funeraria + Stripe + `worker/src/wizard-compra.js` /
  `prevision-api.js` / `alma.js`, en vez de Invoice Ninja + `pipeline.js`).

### 13. Carpeta `legado-holding/` duplicada en la raíz del repo
Existe una subcarpeta `legado-holding/` con su propia copia de `css/`, `js/`, `images/`, `worker/` y `.wrangler/`. No forma parte de la estructura documentada en el `README.md`. Vale la pena confirmar si es un remanente de un clon anidado (candidato a limpieza) o si tiene un propósito activo, para evitar que alguien edite la copia equivocada.

- Decisión: [x] Investigar y limpiar · [ ] No aplicar (tiene un uso conocido) · [ ] Pendiente
  Investigado: era un clon anidado completo del mismo repo (propio `.git`,
  branch `ChatBot` al día con `origin/ChatBot`, working tree limpio — sin
  cambios sin commitear, todo respaldado en el remoto). Ya estaba en
  `.gitignore` con nota de que era un artefacto de `wrangler deploy` corrido
  desde el cwd equivocado. Se eliminó la carpeta.

---

## Resumen para decisión rápida

| # | Hallazgo | Severidad | Sección guía |
|---|---|---|---|
| 1 | Dorado como color de acción principal (no aprobado) | 🔴 | 3.1 |
| 2 | Enlaces legales del footer rotos (`href="#"`) | 🔴 | 8.2 / 10 |
| 3 | Tipografía no es Inter | 🟠 | 3.4 |
| 4 | Sin banner de consentimiento de cookies | 🟠 | 8.2 |
| 5 | Testimonios sin evidencia de autorización | 🟠 | 5.2 |
| 6 | Botón primario no es azul marino/blanco | 🟠 | 3.2 |
| 7 | HEX de navy distinto al de la guía | 🟡 | 3.1 |
| 8 | Marcas del consorcio poco claras | 🟡 | 5.4 |
| 9 | Sin datos estructurados JSON-LD | 🟡 | 7.3 |
| 10 | Sin WhatsApp / horario visible | 🟡 | 5.1 |
| 11 | Inconsistencia "85 años" vs "1944" | 🟢 | 2.3 |
| 12 | README describe arquitectura obsoleta | 🟢 | — |
| 13 | Carpeta `legado-holding/` duplicada | 🟢 | — |

---

## Lo que **no** se pudo verificar desde aquí

- Contraste de color real (WCAG 2.2 AA) — no se midió con herramienta de accesibilidad, solo se comparó contra los tokens documentados.
- Rendimiento (LCP, peso de imágenes) — no se ejecutó una auditoría de performance.
- Comportamiento del selector ES/EN y del bot "Alma" en producción — no se probó interactivamente.
- Si los testimonios (#5) tienen autorización real del cliente — requiere confirmación del equipo de negocio, no del código.
