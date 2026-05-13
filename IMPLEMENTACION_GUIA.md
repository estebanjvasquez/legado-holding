# GUÍA DE IMPLEMENTACIÓN - LEGADO_Wizard v2

## Estado actual vs. Objetivo

### Problema identificado
- ❌ Front-end apuntaba a `/webhook/legado-chat` (incorrecto)
- ❌ No hay webhook para eventos de Stripe (payment_intent.succeeded/failed)
- ❌ SessionId no se genera ni propaga
- ❌ Sin verificación de firma de Stripe
- ❌ Clientes pagan en Stripe pero portal nunca se activa

### Objetivo
- ✅ Front-end apunta a `/webhook/legado-wizard` (coincide con n8n)
- ✅ Nuevo webhook `/webhook/stripe-webhook-legado` para eventos
- ✅ SessionId generado y propagado en todas las transacciones
- ✅ Verificación de firma Stripe implementada
- ✅ Portal se activa automáticamente tras pago confirmado

---

## Cambios realizados

### 1. js/main.js - Configuración de webhooks

**Cambios:**
```javascript
// ANTES (incorrecto):
const WIZARD_WEBHOOK_URL = "https://vmi2945958.contaboserver.net/webhook/legado-chat";

// DESPUÉS (correcto + enviroment-ready):
const DEFAULT_WIZARD_WEBHOOK = "https://vmi2945958.contaboserver.net/webhook/legado-wizard";
const DEFAULT_STRIPE_WEBHOOK = "https://vmi2945958.contaboserver.net/webhook/stripe-webhook-legado";
const WIZARD_WEBHOOK_URL = (typeof window !== 'undefined' && window.LEGADO_CONFIG && window.LEGADO_CONFIG.WIZARD_WEBHOOK_URL) 
  ? window.LEGADO_CONFIG.WIZARD_WEBHOOK_URL 
  : DEFAULT_WIZARD_WEBHOOK;
const STRIPE_WEBHOOK_URL = (typeof window !== 'undefined' && window.LEGADO_CONFIG && window.LEGADO_CONFIG.STRIPE_WEBHOOK_URL) 
  ? window.LEGADO_CONFIG.STRIPE_WEBHOOK_URL 
  : DEFAULT_STRIPE_WEBHOOK;
```

**Ventajas:**
- URLs pueden ser configuradas en tiempo de ejecución sin cambiar código
- Permite diferentes entornos (dev, staging, prod)
- Mantiene valores por defecto para producción

### 2. n8n_workflow_legado_wizard_v2.json - Configuración de webhook en n8n

**Cambios:**
```json
// Webhook principal (entrada de usuario)
"path": "webhook/legado-wizard"

// Webhook de Stripe (eventos de pago)
"path": "webhook/stripe-webhook-legado"
```

---

## Pasos de implementación

### FASE 1: Configuración de Stripe Dashboard (⏱️ ~5 min)

1. Accede a [Stripe Dashboard](https://dashboard.stripe.com)
2. Ve a Settings → Webhooks
3. Click "Add endpoint"
4. Ingresa URL: `https://vmi2945958.contaboserver.net/webhook/stripe-webhook-legado`
5. Selecciona eventos:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.failed`
6. Click "Add endpoint"
7. Copia el **Signing Secret** (ej: `whsec_...`)

### FASE 2: Configuración de n8n (⏱️ ~15 min)

1. Inicia sesión en n8n
2. Abre workflow "LEGADO_Wizard"
3. **Modificar nodo "Legado Webhook":**
   - URL path: `webhook/legado-wizard`
   - Guardar

4. **Crear nuevo nodo "Stripe Webhook":**
   - Tipo: Webhook
   - URL path: `webhook/stripe-webhook-legado`
   - HTTP Method: POST

5. **Crear nodo "Verify Stripe Signature":**
   - Tipo: Function
   - Código (copiar de WORKFLOW_CORRECTIONS_SPEC.md)
   - Validar firma usando Signing Secret

6. **Crear nodo "Route by Stripe Event":**
   - Tipo: Switch
   - Condiciones:
     - `event.type == "payment_intent.succeeded"` → rama 1
     - `event.type == "payment_intent.payment_failed"` → rama 2

7. **Crear rama de éxito:**
   - Parse event → Create Client InvoiceNinja → Create Invoice → Mark session active

8. **Crear rama de fallo:**
   - Parse event → Update session to failed → Send email → Cleanup

9. **Configurar credenciales n8n:**
   - Stripe API Key: `sk_test_...`
   - Stripe Webhook Secret: (del paso FASE 1.7)
   - InvoiceNinja API Key
   - Internal API credentials

### FASE 3: Actualizar front-end (⏱️ ~5 min)

**Option A: Sin variables de entorno (rápido)**
```bash
# Solo asegúrate que js/main.js está actualizado
# Las URLs ya apuntan a los webhooks correctos
git diff js/main.js  # verifica cambios
```

**Option B: Con variables de entorno (mejor para prod)**
```html
<!-- En index.html, antes de <script src="js/main.js"></script> -->
<script>
  window.LEGADO_CONFIG = {
    WIZARD_WEBHOOK_URL: "https://vmi2945958.contaboserver.net/webhook/legado-wizard",
    STRIPE_WEBHOOK_URL: "https://vmi2945958.contaboserver.net/webhook/stripe-webhook-legado",
    STRIPE_PUBLISHABLE_KEY: "pk_test_..."
  };
</script>
<script src="js/main.js"></script>
```

### FASE 4: Desplegar cambios (⏱️ ~5 min)

```bash
# 1. Commit cambios
git add js/main.js n8n_workflow_legado_wizard_v2.json WORKFLOW_CORRECTIONS_SPEC.md SUMMARY_CHANGES_N8N.md
git commit -m "Setup webhook URLs and add Stripe webhook flow

- Fix WIZARD_WEBHOOK_URL to /webhook/legado-wizard
- Add STRIPE_WEBHOOK_URL for payment event handling
- Add environment-aware config loading
- Include corrected n8n workflow template

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"

# 2. Push a rama de features
git push origin fix/webhooks-env

# 3. Crear PR para revisión
# O merguear directamente si está aprobado:
git checkout main && git merge fix/webhooks-env

# 4. Desplegar front-end a servidor
# (ej: rsync, Docker, etc según tu pipeline)
```

---

## Pruebas de integración

### Test 1: Webhook principal (usuario compra)

```bash
# Simulación con curl
curl -X POST "https://vmi2945958.contaboserver.net/webhook/legado-wizard" \
  -H "Content-Type: application/json" \
  -d '{
    "plan": "esencial-zulia",
    "email": "cliente@example.com",
    "amount": 4990,
    "currency": "usd",
    "paymentType": "card"
  }'

# Resultado esperado:
# HTTP 200 con respuesta: { "client_secret": "pi_...", "sessionId": "sess_..." }
```

### Test 2: Webhook de Stripe (evento de pago)

```bash
# Stripe proporciona datos de test en Dashboard
# Ve a Webhooks → Endpoint → Send test event
# Selecciona "payment_intent.succeeded"
# Verifica logs en n8n

# Resultado esperado:
# - SessionId extraído de metadata
# - Cliente creado en InvoiceNinja
# - Factura creada
# - Sesión marcada como activa
# - Cliente puede acceder al portal
```

### Test 3: Idempotencia (envío duplicado)

```bash
# Enviar el mismo evento de Stripe dos veces
# (simular reintento de Stripe)

# Resultado esperado:
# - Primera vez: Cliente + Factura creados ✅
# - Segunda vez: Nada nuevo, respuesta 200 ✅
# (usar sessionId como unique key en BD)
```

### Test 4: Manejo de errores

```bash
# Prueba sin sessionId en metadata
# Prueba con firma Stripe inválida
# Prueba con InvoiceNinja offline

# Resultado esperado:
# - Errores registrados en logs
# - Evento movido a DLQ (Dead Letter Queue)
# - Reintentos automáticos cada 5 min
```

---

## Checklist de validación

- [ ] Stripe Dashboard: webhook endpoint configurado
- [ ] Stripe Dashboard: signing secret copiado en n8n credentials
- [ ] n8n: workflow importado desde n8n_workflow_legado_wizard_v2.json
- [ ] n8n: todos los nodos tienen credenciales válidas
- [ ] n8n: published workflow
- [ ] Front-end: js/main.js apunta a webhooks correctos
- [ ] Test 1 (webhook principal): ✅ Pass
- [ ] Test 2 (webhook Stripe): ✅ Pass
- [ ] Test 3 (idempotencia): ✅ Pass
- [ ] Test 4 (manejo errores): ✅ Pass
- [ ] Portal: cliente puede acceder después de pago
- [ ] Logs: sessionId visible en todas las transacciones

---

## Ficheros clave

| Fichero | Cambios | Estado |
|---------|---------|--------|
| js/main.js | URLs de webhooks corregidas + env-aware | ✅ Ready |
| n8n_workflow_legado_wizard_v2.json | Workflow template completo | ✅ Ready |
| WORKFLOW_CORRECTIONS_SPEC.md | Especificación técnica detallada | ✅ Ready |
| SUMMARY_CHANGES_N8N.md | Resumen de 10 cambios prioritarios | ✅ Ready |
| index.html | (Opcional) Agregar window.LEGADO_CONFIG | ⏳ Pending |
| payloads_config.json | Test payloads para validación | ✅ Ready (prior) |

---

## Monitoreo post-deployment

```bash
# Logs en tiempo real (n8n)
# Settings → Logs → Filter by workflow "LEGADO_Wizard"

# Métricas a monitorear:
# 1. Webhook latency: < 2 segundos
# 2. Payment success rate: > 99%
# 3. Portal activation delay: < 5 segundos post-pago
# 4. Error rate: < 0.5%
```

---

## Rollback (si algo falla)

```bash
# Revertir cambios
git revert HEAD~1

# O volver a versión anterior en n8n:
# Workflow → Versions → Select previous version → Activate
```

---

## Contacto / Preguntas

Si hay problemas durante la implementación:
1. Revisar logs en n8n Dashboard
2. Verificar credentials (API keys, secrets)
3. Testear webhooks con curl (como en Test 1-2 arriba)
4. Contactar al equipo de DevOps para verificar firewall/DNS

---

**Última actualización:** 2026-04-22
**Versión de workflow:** v2 (con sessionId, metadata, stripe webhook)
**Estado:** Listo para implementación
