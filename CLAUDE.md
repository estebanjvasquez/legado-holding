# Legado Holding — contexto adicional

## Módulo de Previsión (nuevo sistema, otro repo)

Se está construyendo un sistema multiempresa de previsión funeraria en el repositorio
separado `estebanjvasquez/Prevision-Funeraria` (Cloudflare Workers + D1), pensado para
servir tanto a Legado Holding como a Funeraria del Zulia
(`estebanjvasquez/Propuesta-Funerzul`) desde una sola interfaz de administración, con
los mismos usuarios de staff atendiendo ambas empresas.

**Actualizado 2026-08-25:** el wizard de planes de previsión y el bot Alma de este
repo ya NO usan Invoice Ninja — migraron a la API pública de Prevision-Funeraria
(`docs/api-publica-wizard.md`, tenant `lh`). Cliente HTTP en `worker/src/prevision-api.js`,
checkout en `worker/src/wizard-compra.js` (reemplaza al viejo `pipeline.js`, ya
eliminado). Alma (`worker/src/alma.js`) ya no cotiza ni factura: consulta el catálogo
de planes/servicios de la API (`list_planes`/`list_servicios`) para informar sin
inventar precios, y sigue el contrato de `docs/GUIA_INTERACCION_BOT_LEGADO.md` para
clasificar cada mensaje: (A) duelo activo con fallecimiento confirmado → busca aliado
por ciudad (`lookup_coverage`) y si no hay cobertura, ahora deriva por WhatsApp con
nombre+necesidad (`handoff_whatsapp`) en vez de solo dar un teléfono genérico; (B)
urgencia sin fallecimiento confirmado → deriva directo por `handoff_whatsapp` (mismo
WhatsApp `whatsapp_emergencia` del tenant `lh`, confirmado en vivo contra la API); (C)
consulta informativa sin urgencia → nunca escala a un humano en vivo, solo registra un
prospecto (`create_lead` → `POST /solicitudes`) si el usuario acepta dejar sus datos.
El único punto de entrada al chat sigue siendo el botón flotante de emergencia — Alma
clasifica internamente, no hay un segundo botón "modo normal". **2026-08-25 (tarde):**
el LLM de Alma cambió de Google Gemini a OpenAI (`gpt-5.6-luna`, configurable via
`OPENAI_MODEL`/`agent_config.model`) — pedido explícito del usuario. No reconocía ese
identificador de mi propio conocimiento (corte enero 2026); el usuario confirmó que es
correcto (documentación de OpenAI) y quedó verificado en vivo tras el deploy: saludo
neutro, consulta informativa (`list_planes` con datos reales) y urgencia sin
fallecimiento (`handoff_whatsapp`) responden bien en `api.legadoholding.com/chat`. Dos
gotchas que costó descubrir en producción (ver commits `19023de`, `ae79b3c`): (1)
`agent_config.model` en Supabase había quedado en `"gemini-2.5-flash"` de la era
anterior y tenía prioridad sobre el default nuevo — `worker/src/alma.js` ahora ignora
un `agent_config.model` con pinta de Gemini en vez de usarlo tal cual; (2) `gpt-5.6-luna`
es un modelo "reasoning" que en `/v1/chat/completions` rechaza (400) function tools
junto a su `reasoning_effort` por defecto — el código fuerza `reasoning_effort: "none"`
en cada llamada porque Alma depende de tool-calling en casi todos los turnos.
`worker/src/invoiceninja.js` y `worker/src/emergency.js` fueron
eliminados. La única parte de este repo que sigue hablando con Invoice Ninja es el
login del panel admin (`worker/src/admin.js`, via `env.IN_BASE`) — deuda pendiente, no
bloqueante.

Los 4 planes tienen checkout digital. Los "Selecto" (`esencial-selecto`/
`vanguardia-selecto`) cobran una cuota inicial única (`cuota_inicial_centavos` en
`GET /planes`): Prevision-Funeraria la mete como un `line_item` sin `recurring` en
el Stripe Checkout (va solo a la 1ª factura) + la suscripción. Verificado
end-to-end 2026-08-26 (contrato #8, 1ª factura $44,47 = $9,47 + $35). Se activa/
desactiva con `SELECTO_CHECKOUT_ENABLED` en `js/main.js` (hoy `true`).

**Atribución de vendedores externos (2026-08-26):** LH opera con vendedores que
reparten enlaces `legadoholding.com?ref=CODIGO`. El lado de este repo YA está
implementado: `js/main.js` §"ATRIBUCIÓN" captura el `?ref=` con modelo first-touch
(TTL 90d, `localStorage`), y `worker/src/attribution.js` lo sanea y lo adjunta como
`atribucion.codigo_vendedor` a `POST /compras` (wizard), `POST /solicitudes`
(`create_lead` de Alma) y al lead-stub + texto pre-llenado del handoff a WhatsApp de
Alma. Alma NO ve el código (se inyecta en los executores, no en el prompt/tools).
Falta trabajo **del lado de Previsión** para cerrar el círculo (que el vendedor se
propague al contrato final vía el webhook de Stripe, y se muestre/prellene en el
panel) — todo listado en `docs/ajustes-prevision-funeraria-atribucion-vendedor.md`;
el detalle de lo hecho acá en `docs/atribucion-vendedor-plan-legado.md`. Ese mismo
doc de ajustes tiene la propuesta para la cuota inicial de los Selecto
(campo `cuota_inicial_centavos` + Stripe `add_invoice_items`).

La migración ya está en producción: `main` despliega ahora a la **raíz** de
legadoholding.com (antes desplegaba a `/v2`; ver tag `pre-prevision-funeraria-rollback`
para revertir si hace falta), y el Worker de `api.legadoholding.com` corre el código
nuevo.

**No modificar este repositorio para tareas del proyecto de Previsión** salvo que se
pida explícitamente. El sistema todavía está en revisión (sin usuarios finales en
producción, según confirmación del usuario) — pero cualquier cambio a wizard/bot debe
seguir el contrato documentado en `docs/api-publica-wizard.md`.

**Estado detallado y trabajo pendiente:** ver `.claude/handoff.json` — incluye el árbol
de archivos actualizado, gaps conocidos de la API nueva, y un hilo abierto sin cerrar
(`open_thread_needs_followup`: reporte del usuario de que el bot Alma sigue
presentándose dos veces pese a que el fix está verificado correcto en backend y
frontend — pendiente de confirmar con el usuario en incógnito).
