# Activar Stripe en el tenant `lh` (Legado Holding) — configuración y checklist

> Para: quien configure los cobros de Legado Holding en el panel de Prevision-Funeraria.
> Última revisión: 2026-11-23.
>
> **Este archivo NO lleva secretos.** Las claves `sk_…` / `whsec_…` se pegan **solo** en
> el panel de Previsión. Si querés anotar los valores no secretos completos (IDs,
> fechas), copiá este archivo a `docs/activar-stripe-lh.SECRET.md` (gitignoreado).

---

## 1. Cómo está armado

```
Wizard (legadoholding.com) → Worker (api.legadoholding.com) → Previsión POST /compras
   → Stripe Checkout (cuenta de Legado)  → webhook firmado → Previsión activa el contrato
```

- **Este repo no tiene ninguna clave de Stripe** ni la necesita: Stripe lo maneja
  Previsión con lo que se cargue en su panel. Cambiar de test a real **no requiere
  cambios de código ni deploy** en legado-holding.
- El panel de Previsión (Configuración › Empresa › Conexiones de pago › **Stripe (EE. UU.
  y otros)**) pide solo tres cosas:

| Campo del panel | Valor | De dónde sale en el dashboard de Stripe de **Legado** |
|---|---|---|
| ☑ Conexión activa | marcado | — |
| **Secret key** | `sk_test_…` (pruebas) o `sk_live_…` (cobros reales) | Desarrolladores → Claves de API → Clave secreta |
| **Webhook signing secret** | `whsec_…` (uno distinto por modo) | Desarrolladores → Webhooks → endpoint de Previsión → Secreto de firma (Revelar) |

- **No hay selector test/real**: el modo lo deciden las claves que se peguen.
- El panel no pide clave publicable (`pk_…`): se usa Stripe Checkout alojado.
- "Dejá vacío lo que no cambia": un campo vacío conserva el valor guardado.

> ⚠️ **Cuenta correcta.** Verificá siempre en el dashboard de **Legado Holding Inc.**
> El conector de Stripe que usa Claude está conectado a otra cuenta (SISTEG GROUP,
> entorno de prueba) y **no sirve** para verificar cobros de Legado.

---

## 2. Ficha de configuración (completar)

Solo datos NO secretos. Las claves, nunca acá.

| Dato | Modo test (actual) | Modo real (live) |
|---|---|---|
| Cuenta Stripe (ID `acct_…`, Configuración › Cuenta) | | |
| Nombre de la cuenta en Stripe | | |
| Cuenta verificada por Stripe (KYC) | n/a | ☐ sí, fecha: |
| Cuenta bancaria para depósitos | n/a | ☐ cargada |
| Nombre en el extracto (statement descriptor) | | |
| URL del endpoint de webhook (Previsión) | | (misma URL que test) |
| Eventos del webhook (copiar del de test) | | (mismos) |
| Secret key cargada en Previsión (últimos 4) | `…____` | `…____` |
| Webhook secret cargado en Previsión (últimos 4) | `…____` | `…____` |
| Fecha de carga en el panel | | |
| Compra de verificación (fecha / monto / contrato #) | | |

---

## 3. Verificar el modo de prueba (estado actual)

En el dashboard de Stripe de Legado, con **Modo de prueba activado**:

- [ ] **Pagos / Clientes**: aparecen las compras de prueba del wizard (nombre/email usados).
- [ ] **Suscripciones**: la compra anual de prueba dice **94,70 US$ / año**; una mensual,
      **9,47 US$ / mes** (Esencial Zulia). Previsión corrigió el monto anual el 2026-11-20.
- [ ] **Desarrolladores → Webhooks**: existe el endpoint de Previsión con entregas
      exitosas (sin errores 4xx/5xx).
- [ ] En Previsión, la compra quedó como **contrato activo** (si el webhook falla, la
      compra queda pendiente aunque Stripe haya cobrado).

Tarjeta de prueba: `4242 4242 4242 4242`, cualquier fecha futura y CVC.

---

## 4. Pasar a cobros reales

**Requisito previo:** Stripe aprobó la cuenta de Legado Holding Inc. (KYC completo,
cuenta bancaria cargada). Sin eso, no hay claves live utilizables.

1. En Stripe, **desactivar el Modo de prueba**.
2. **Desarrolladores → Webhooks → Agregar endpoint** (en live):
   - URL: **la misma** del endpoint de test (copiarla de ahí).
   - Eventos: **los mismos** que tiene el endpoint de test.
3. Copiar el **secreto de firma** de ese endpoint nuevo (`whsec_…`).
4. Copiar la **clave secreta live** (`sk_live_…`), o crear una clave restringida
   (`rk_live_…`) si Previsión la acepta — confirmarlo con ellos.
5. **Antes de pegar:** preguntarle a Previsión si crea productos/precios en Stripe
   automáticamente. Los de test **no existen** en live; si usan IDs fijos, hay que
   recrearlos.
6. En el panel de Previsión: pegar **las dos** claves live **juntas**, dejar "Conexión
   activa" marcado y Guardar.
   > Nunca mezclar: `sk_live` con un `whsec` de test (o al revés) hace que Stripe cobre
   > pero el contrato **no se active** (el webhook no valida la firma).
7. **Compra real de verificación** con un plan barato (Esencial Zulia mensual, 9,47 US$):
   - [ ] aparece en Stripe con el modo de prueba **desactivado**;
   - [ ] el webhook live muestra entrega exitosa;
   - [ ] en Previsión queda el contrato **activo**, con el vendedor si se usó `?ref=`;
   - [ ] reembolsar desde Stripe si no era una venta real.
8. Completar la columna "Modo real" de la ficha (§2) y avisar a Previsión.

### Volver atrás

Si algo falla en live: pegar de nuevo las claves **de test** (las dos) en el panel. El
sitio no cambia. Las compras live ya creadas quedan en Stripe live.

---

## 5. Reglas

- Las claves secretas se pegan **solo** en el panel de Previsión. Nunca en el chat, un
  correo, un ticket ni este repo.
- **No regenerar el token de API del tenant `lh`** en Previsión: es otra cosa (el
  `PF_TOKEN` del Worker) y rompería el checkout.
- El sitio **nunca calcula ni envía montos**: Previsión cobra según plan + frecuencia.
  Si Stripe muestra un monto raro, es configuración de Previsión/Stripe, no del sitio.
