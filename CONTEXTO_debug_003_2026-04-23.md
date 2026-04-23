================================================================================
CONTEXTO DE DEBUG - LEGADO Holding
================================================================================

Fecha: 2026-04-23
Debug #: 003
Última actualización: 09:36 UTC+2

================================================================================
PROBLEMA ACTUAL
================================================================================

Error: "Error en el pago. Intenta de nuevo."
Error específico: ReferenceError: __wizardClientSecret is not defined

Causa raíz: El webhook NO devuelve client_secret
- El webhook legado-wizard devuelve mensajes de chat (NO PaymentIntent)
- Hay DOS workflows conflictivos en n8n usando el mismo path

================================================================================
ANÁLISIS DEL ERROR
================================================================================

1. Flujo de pagos actual:
   - Usuario completa wizard → Click "Confirmar datos"
   - frontend envía POST a WIZARD_WEBHOOK_URL
   - Webhook devuelve: {"message":"Cuando estes listo..."} (mensaje de chat!)
   - Frontend espera: {"client_secret": "pi_xxx_xxx"}
   - ERROR: __wizardClientSecret is not defined

2. Request del inspector (Stripe telemetry - NO es el payment):
   POST https://r.stripe.com/b
   - Este es normal - es telemetría de Stripe.js

================================================================================
URLs CONFIGURADAS (ACTUALES)
================================================================================

Frontend (js/main.js + index.html):
- WIZARD_WEBHOOK_URL: https://vmi2945958.contaboserver.net/webhook/legado-wizard
- STRIPE_WEBHOOK_URL: https://vmi2945958.contaboserver.net/webhook/stripe-webhook-legado
- STRIPE_PUBLISHABLE_KEY: pk_test_51TD0wWIZ8iB3diEjBitOKaGv7OPDilCvCtpOTsA47DiIiVw9lqmZlki1wzDdkOrFRLGiXhdnPULKbuI8ErOmvUQS00ehj9nJZU

Webhook test (curl):
$ curl -X POST "https://vmi2945958.contaboserver.net/webhook/legado-wizard" \
  -H "Content-Type: application/json" \
  -d '{"intent":"create_payment_intent","plan":"esencial-zulia"}'

Respuesta ACTUAL: {"message":"Cuando estes listo, escribe SI para confirmar..."} (chat!)
Respuesta ESPERADA: {"client_secret": "pi_xxx", "sessionId": "sess_xxx"}

================================================================================
ARCHIVOS MODIFICADOS
================================================================================

1. js/main.js (líneas ~30-55):
   - Configuración con window.LEGADO_CONFIG
   - WIZARD_WEBHOOK_URL, STRIPE_WEBHOOK_URL, STRIPE_PUBLISHABLE_KEY

2. index.html (líneas ~37-48):
   - Script con window.LEGADO_CONFIG

3. n8n_workflow_legado_wizard_v2.json:
   - Path: webhook/legado-wizard (ACTUAL - conflictivo!)
   - Nodo "Generate sessionId" calcula amounts desde plan
   - Nodo "Create PaymentIntent" llama a Stripe API

================================================================================
WORKFLOWS EN N8N (DETECTADOS)
================================================================================

| Path | Estado | Función |
|------|--------|---------|
| legado-wizard | Activo | CHAT (responde con mensajes) ✗ CONFLICTO |
| legado-wizard2 | ? | ? |
| legado-payment | No registrado | PaymentIntent (no activo) |

El webhook legado-wizard está siendo usado por el SISTEMA DE CHAT, no por payment.

================================================================================
SOLUCIONES POSIBLES
================================================================================

OPCIÓN 1: Cambiar path del workflow de payment
-Nuevo path sugerido: webhook/legado-payment
-Archivos a actualizar:
  * n8n_workflow_legado_wizard_v2.json → path: "webhook/legado-payment"
  * js/main.js → WIZARD_WEBHOOK_URL
  * index.html → window.LEGADO_CONFIG.WIZARD_WEBHOOK_URL

OPCIÓN 2: Reutilizar el webhook legado-wizard EXISTENTE
- Modificar el workflow existente para manejar payment
- NO RECOMENDADO (romperá chat)

OPCIÓN 3: Crear nuevo webhook en Stripe Dashboard
- Ir a Stripe Dashboard → Settings → Webhooks
- Crear endpoint nuevo para PaymentIntent
- Mucho más trabajo

================================================================================
PRÓXIMOS PASOS RECOMENDADOS
================================================================================

1. En n8n:
   a) Importar n8n_workflow_legado_wizard_v2.json
   b) Cambiar path a: webhook/legado-payment
   c) Configurar credenciales Stripe ($credentials.stripe.apiKey)
   d) Activar workflow

2. En frontend (opcional si usas nuevo path):
   - Ya está parcialmente configurado para usar config

3. Probar:
   curl -X POST "https://vmi2945958.contaboserver.net/webhook/legado-payment" \
     -H "Content-Type: application/json" \
     -d '{"intent":"create_payment_intent","plan":"esencial-zulia","paymentType":"monthly","buyer":{"name":"Test","email":"test@test.com"}}'

   Debería devolver: {"client_secret": "...", "sessionId": "..."}

================================================================================
PLANES Y PRECIOS (configurados en n8n)
================================================================================

| Plan | Mensual (EUR cents) | Anual (EUR cents) |
|------|-------------------|------------------|
| esencial-zulia | 1499 | 14388 |
| vanguardia-zulia | 2499 | 23988 |
| esencial-selecto | 2999 | 28788 |
| vanguardia-selecto | 4999 | 47988 |

================================================================================
CREDENCIALES REQUERIDAS EN N8N
================================================================================

Stripe API Key:
- Nombre: stripe
- Tipo: headerAuth
- Campo apiKey: sk_test_... o sk_live_...

Stripe Webhook Secret:
- Nombre: stripe
- Campo webhookSecret: whsec_...

================================================================================
NOTAS ADICIONALES
================================================================================

- El workflow actual está intentando calcular amount automáticamente desde el plan
- El frontend envía: {plan, paymentType, buyer, family}
- El n8n espera: {body.amount, body.currency, body.email}
- El nodo "Generate sessionId" hace la conversión

- Problema secundario: El path del workflow en n8n_workflow_legado_wizard_v2.json
  todavía dice "legado-wizard" - necesita cambiarse a "legado-payment"
  (ya fue cambiado en el código anterior pero se revertió)

================================================================================