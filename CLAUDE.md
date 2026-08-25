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
`OPENAI_MODEL`/`agent_config.model`) — pedido explícito del usuario; no reconozco ese
identificador de modelo de mi propio conocimiento (corte enero 2026), así que si el
Worker empieza a fallar en `/chat` con un error de modelo inválido de OpenAI, lo
primero a revisar es que `gpt-5.6-luna` sea el nombre correcto vigente en la cuenta de
OpenAI del usuario. `worker/src/invoiceninja.js` y `worker/src/emergency.js` fueron
eliminados. La única parte de este repo que sigue hablando con Invoice Ninja es el
login del panel admin (`worker/src/admin.js`, via `env.IN_BASE`) — deuda pendiente, no
bloqueante.

Los planes "Selecto" (`esencial-selecto`/`vanguardia-selecto`) siguen sin checkout
digital: cobran una cuota inicial que el modelo `planes` de la API nueva todavía no
soporta. Su CTA en el sitio manda a contacto en vez de abrir el wizard.

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
