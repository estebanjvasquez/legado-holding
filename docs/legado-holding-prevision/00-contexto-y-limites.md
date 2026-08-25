# Contexto y límites

Este documento existe para que un agente de IA (Claude Code u otro) entienda,
antes de tocar código, **de dónde viene** este trabajo, **para dónde va**, y qué
NO debe hacer.

## Los tres repositorios en juego

| Repo | Rol | Stack | Qué pasa con él en este trabajo |
|---|---|---|---|
| `estebanjvasquez/…Propuesta-Funerzul` (este repo, "Funerzul") | Sistema actual de Funeraria del Zulia. Tiene el **módulo de previsión original** (`admin-prevision.js` + `api/prevision_*.php`), ya en producción/revisión con el cliente. | PHP 8.1 + PDO + MySQL/MariaDB, cPanel, sin framework | **No se toca.** Este paquete de documentos es una fotografía de referencia; el código fuente de Funerzul sigue vivo y evolucionando por su cuenta. |
| `estebanjvasquez/legado-holding` ("Legado Holding") | Sitio + checkout + chatbot de previsión funeraria para venezolanos en EE. UU. Ya tiene un **panel admin en producción** (`admin/`) sobre un Worker de Cloudflare y Supabase. | Cloudflare Worker (JS) + Supabase (PostgREST directo, sin SDK) + HTML/CSS/JS estático sin build + Invoice Ninja | **Es el destino de este trabajo.** Aquí se debe construir el módulo de previsión, integrado a lo que ya existe. |
| `estebanjvasquez/Prevision-Funeraria` | Reemplazo multiempresa completo del módulo de previsión, que sirve tanto a Funerzul como a Legado Holding. Vive en su propio repo con su propio plan (`docs/PLAN.md`). | Por definir en ese repo | **No es este trabajo.** Ver más abajo. |

## Por qué este trabajo NO es lo mismo que `Prevision-Funeraria`

`Prevision-Funeraria` es el reemplazo **multiempresa** definitivo, pensado para
servir a *ambas* marcas desde una base de código común, con su propia
arquitectura y cronograma largo.

Este paquete de documentos, en cambio, es un pedido puntual: **llevar el
módulo de previsión (tal como existe hoy en Funerzul, más las mejoras
propuestas) directamente al panel admin que Legado Holding ya tiene en
producción**, usando la infraestructura que ese proyecto ya usa (Supabase +
Worker), sin esperar a que `Prevision-Funeraria` esté lista.

Si en el futuro `Prevision-Funeraria` reemplaza esto, será una migración
posterior y separada. No es motivo para no avanzar ahora.

**Regla:** no copiar aquí el plan de `Prevision-Funeraria`, y no tratar de que
esta integración "adivine" ese plan. Son esfuerzos paralelos.

## Objetivo de este trabajo

Construir, dentro del repo `legado-holding`, un módulo de administración de
previsión funeraria (clientes, planes, contratos, beneficiarios, cuotas,
pagos, cobranza, comisiones, siniestros, etc.) que:

1. Reproduzca la funcionalidad del módulo actual de Funerzul (ver
   [`01-modulo-actual-referencia.md`](01-modulo-actual-referencia.md)).
2. Incorpore las seis mejoras propuestas el 11 de agosto de 2026 (ver
   [`03-propuestas-mejoras-roadmap.md`](03-propuestas-mejoras-roadmap.md)),
   adaptadas al stack de Legado Holding desde el principio (no como parche
   posterior).
3. Viva **dentro** del panel admin existente de Legado Holding (mismas
   pestañas, mismo login por `X-Admin-Token`, mismo Worker, misma base
   Supabase), no como un sistema aparte.
4. **No rompa nada de lo que ya funciona** en Legado Holding: chatbot Alma,
   checkout, wizard de afiliación, facturación recurrente vía Invoice Ninja,
   ni las pestañas actuales del admin (Ubicaciones, Aliados, Agente,
   Conversaciones).

## Superficies protegidas de Legado Holding (no tocar salvo pedido explícito)

Un agente que ejecute este trabajo debe tratar lo siguiente como **superficie
estable**, y solo modificarla si el paso del plan lo pide explícitamente:

- `worker/src/index.js` — router principal. Ya delega todo `/admin/*` a
  `admin.js` de forma genérica; probablemente no necesita cambios.
- `worker/src/alma.js`, `worker/src/chat.js` — agente conversacional Alma.
  No relacionado con previsión.
- `worker/src/pipeline.js`, `worker/src/emergency.js` — checkout de
  `legadoweb`/`urgencias` vía Invoice Ninja. No relacionado con previsión
  (aunque sí se reutilizará `invoiceninja.js` como cliente HTTP, ver
  [`02-arquitectura-integracion.md`](02-arquitectura-integracion.md)).
- Tablas Supabase existentes: `chat_sessions`, `chat_turns`,
  `locations_venezuela`, `funeral_partners`, `agent_config`. No renombrar, no
  cambiar columnas, no reutilizar sus nombres para algo nuevo.
- Rutas ya publicadas bajo `/admin/*`: `/admin/health`, `/admin/locations*`,
  `/admin/partners*`, `/admin/config*`, `/admin/sessions*`. Sus contratos
  (payload, status codes) no cambian.
- Pestañas actuales del admin (`Ubicaciones`, `Aliados`, `Agente`,
  `Conversaciones`) en `admin/index.html` / `admin/admin.js`: se **agrega**
  una pestaña nueva "Previsión"; no se reordena ni se altera el resto.
- El patrón de autenticación (`X-Admin-Token` contra `env.ADMIN_TOKEN`, sin
  Cloudflare Access todavía) se mantiene igual para todo lo nuevo.

## Qué SÍ se espera que cambie en Legado Holding

- Nuevas tablas Supabase con prefijo `prev_` (mismo prefijo que Funerzul, para
  que el mapeo conceptual sea directo al leer ambos repos).
- Nuevos módulos de Worker bajo `worker/src/prevision/` con rutas
  `/admin/prevision/*`.
- Una pestaña nueva "Previsión" en el admin, construida con el mismo patrón
  vanilla JS / sin build que ya usa `admin/admin.js`.
- Reutilización de `worker/src/invoiceninja.js` para la facturación recurrente
  de cuotas de previsión (ver detalle en la arquitectura).
- Documentación nueva dentro de `legado-holding` (README del módulo, specs por
  fase) — no se espera que ese repo adopte todo el specboot de Funerzul, pero
  sí que cada fase quede documentada de forma mínima (ver
  [`05-instrucciones-claude-code.md`](05-instrucciones-claude-code.md)).
