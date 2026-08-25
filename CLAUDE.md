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
eliminado). Alma (`worker/src/alma.js`) ya no cotiza ni factura: hace un handoff con
el teléfono del aliado tras confirmar cobertura. `worker/src/invoiceninja.js` y
`worker/src/emergency.js` fueron eliminados. La única parte de este repo que sigue
hablando con Invoice Ninja es el login del panel admin (`worker/src/admin.js`, via
`env.IN_BASE`) — deuda pendiente, no bloqueante.

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
