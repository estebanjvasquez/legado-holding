# Legado Holding — contexto adicional

## Módulo de Previsión (nuevo sistema, otro repo)

Se está construyendo un sistema multiempresa de previsión funeraria en el repositorio
separado `estebanjvasquez/Prevision-Funeraria` (Cloudflare Workers + D1), pensado para
servir tanto a Legado Holding como a Funeraria del Zulia
(`estebanjvasquez/Propuesta-Funerzul`) desde una sola interfaz de administración, con
los mismos usuarios de staff atendiendo ambas empresas.

Ese sistema se integra con **este** InvoiceNinja (clientes, productos, facturación,
cobro vía Stripe) en vez de duplicar sus datos — su cliente de API v5 en
`worker/src/invoiceninja.js` (auth `X-API-TOKEN`, patrón de polling en
`worker/src/pipeline.js`) es la referencia que ese proyecto porta y reutiliza. El plan
completo vive en `docs/PLAN.md` de ese repo, no aquí.

**No modificar este repositorio para tareas del proyecto de Previsión** salvo que se
pida explícitamente — es un sistema en producción con ingresos reales (venta y
facturación de planes de previsión ya activa). El wizard público y el flujo de
facturación actuales quedan intactos mientras el sistema nuevo se construye y valida.
