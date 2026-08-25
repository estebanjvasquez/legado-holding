# Referencia — Módulo de Previsión actual (Funerzul)

Fotografía funcional y técnica del módulo tal como existe hoy en
`Propuesta-Funerzul`, para que quien lo reconstruya en Legado Holding entienda
**qué hace y por qué**, sin necesidad de leer los ~3500 líneas de
`admin-prevision.js` ni los ~930 de `api/lib/prevision.php` línea por línea.

No es una copia del código — es el **contrato conceptual**: entidades,
estados, reglas de negocio y endpoints. La traducción a Supabase/Worker se
diseña en [`02-arquitectura-integracion.md`](02-arquitectura-integracion.md).

Fuentes en el repo Funerzul, por si hace falta más detalle:
`database/README.md`, `api/README.md`, `docs/data-model.md`,
`database/04_prevision.sql` … `10_prevision_pagos_electronicos.sql`.

## Qué es el módulo, en una frase

Un sistema de pólizas/previsión funeraria: clientes contratan un **plan** a
través de un **vendedor**, el contrato genera **cuotas** periódicas, el
cliente paga (en efectivo, transferencia o electrónicamente), el sistema
calcula **comisiones** al vendedor, gestiona la **cobranza** de morosos, y si
fallece un beneficiario cubierto se abre un **siniestro** que se liquida
contra la póliza.

## Entidades y estados

Todas las tablas usan prefijo `prev_`. Se listan con su propósito y, cuando
aplica, los **valores de estado válidos** (importante: son los enums reales de
la base MySQL — al pasar a Postgres se convierten en `text` + `CHECK`, ver
arquitectura).

### Núcleo

| Tabla | Propósito | Estados / campos clave |
|---|---|---|
| `prev_clientes` | Titulares de contratos. Cédula única. | `tipo_persona`: natural / juridica |
| `prev_planes` | Catálogo de planes (cuota, moneda, cobertura). | activo/inactivo (toggle) |
| `prev_vendedores` | Vendedores con % comisión y datos de pago. | `cargo`: vendedor / coordinador / gerente (+ `supervisor_id` para jerarquía); retirado/activo |
| `prev_contratos` | El contrato en sí: plan, vendedor, frecuencia y forma de pago, moneda. | `estatus`: activo / suspendido / anulado / renuncia / finalizado |
| `prev_beneficiarios` | Beneficiarios del contrato, con parentesco. | `estatus`: activo / suspendido / excluido / fallecido |
| `prev_parentescos` | Catálogo de parentescos con rangos de edad. | — |
| `prev_cuotas` | Cuotas por cobrar (una fila por vencimiento). | `tipo`: inicial/programada/especial/mora/final · `estado`: pendiente/parcial/cobrada/anulada |
| `prev_pagos` | Pagos/abonos aplicados a cuotas, con tasa del día. | `forma_pago`: efectivo/transferencia/pago_movil/punto/zelle/divisa/otro |
| `prev_comisiones` | Comisión por contrato y por etapa. | `etapa`: semana1/fin_mes1/mes2/mes13 · `estado`: calculada/aprobada/pagada/anulada |
| `prev_tasas` | Histórico de tasa de cambio Bs/USD por día. | — |
| `prev_import_lotes` | Bitácora de importaciones CSV desde otros sistemas. | — |

### Operación (sucursales, cobranza, siniestros)

| Tabla | Propósito | Estados / campos clave |
|---|---|---|
| `prev_sucursales` | Sedes/sucursales. | — (base para filtrar/consolidar) |
| `prev_servicios` | Catálogo de servicios adicionales (bóveda, cremación, traslados). | — |
| `prev_contrato_servicios` | Servicios adicionales contratados por contrato. | — |
| `prev_cobradores`, `prev_rutas` | Cobradores y rutas de cobranza a domicilio. | — |
| `prev_gestiones` | Bitácora de gestiones de cobranza (llamada, visita, promesa de pago…). | `tipo`: llamada/visita/whatsapp/sms/email/otro · `resultado`: contactado/no_contactado/promesa_pago/reclamo/otro |
| `prev_siniestros` | Reclamo por fallecimiento de un beneficiario cubierto. | `cobertura`: cubierto/con_observaciones/sin_cobertura · `estado`: abierto/liquidado/cerrado/rechazado |
| `prev_siniestro_detalles` | Partidas del siniestro (servicio, pago, reintegro…). | `tipo`: servicio/pago/reintegro/otro |
| `prev_adjuntos` | Documentos por contrato (PDF/JPG/PNG/WebP, máx 5 MB) en disco. | — |

### Tarifas y mensajería

| Tabla | Propósito | Estados / campos clave |
|---|---|---|
| `prev_ajustes` + detalle | Ajuste masivo de tarifas (% o monto fijo), reversible. | `tipo`: porcentaje/monto · `estado`: aplicado/revertido |
| `prev_msg_plantillas` | Plantillas WhatsApp/SMS con variables `{{cliente}}`, `{{saldo_vencido}}`, etc. | `canal`: whatsapp/sms |
| `prev_msg_envios` | Log de envíos. | `estado`: enviado/fallido/manual |
| `prev_com_descuentos` | Descuentos a un vendedor por anulación de contrato con comisión ya pagada (se compensa en el próximo pago). | `estado`: pendiente/aplicado/anulado |

### Captación y pago electrónico (v7, lo más nuevo)

| Tabla | Propósito | Estados / campos clave |
|---|---|---|
| `prev_solicitudes_publicas` | Leads del sitio público (interés en un plan o servicio). **No son contrato**, solo intención a revisar por staff. | `estado`: nueva/contactada/convertida/descartada |
| `prev_pagos_electronicos` | Intentos de cobro electrónico (máquina de estados estricta). | `estado`: CREATED → PENDING/REQUIRES_CUSTOMER_ACTION/PROCESSING → APPROVED \| DECLINED \| FAILED \| EXPIRED \| CANCELLED → (REVERSED/REFUND_PENDING/REFUNDED) |
| `prev_pago_eventos` | Bitácora de webhooks/consultas, **sanitizada** (nunca PAN/CVV/PIN/claves). | — |

## Reglas de negocio que importan (no son obvias del esquema)

Estas son las reglas que un puerto ingenuo (solo copiar tablas) se perdería:

1. **Cascada de pagos.** Un pago se aplica automáticamente a las cuotas más
   antiguas pendientes primero, con conversión Bs/USD a la tasa del día
   (`prev_tasas`). Un contrato en Bs guarda referencia en USD
   (`monto_ref_usd`) + la tasa con la que se calculó (`tasa_cambio`), para
   poder recalcular cuotas en Bs sin perder el valor real del plan. Esa
   actualización es **manual** (acción explícita del admin), nunca automática.

2. **Auto-lapsado configurable.** Un cron diario suspende contratos activos
   con ≥ N cuotas vencidas (`N` configurable). Es la única transición
   *automática* de estado de contrato; todo lo demás lo decide el staff.

3. **Comisiones por etapas, no de una vez.** Cada contrato genera comisión en
   4 momentos (`semana1`, `fin_mes1`, `mes2`, `mes13`), contados desde
   `fecha_corte` (o la fecha de ingreso si no hay corte). Flujo:
   `calcular` (genera etapas vencidas → *calculada*) → `aprobar` (verificación
   → *aprobada*) → `pagar` (→ *pagada*). `anular` descarta una etapa no
   pagada. Si se anula un contrato que ya tenía comisión pagada, se genera un
   **descuento** al vendedor que se compensa en su próximo pago — no se
   revierte la comisión ya pagada directamente.

4. **Validación de cobertura en siniestros.** Al abrir un siniestro, el
   sistema valida automáticamente estatus del contrato, plazo de espera
   mínimo y solvencia (cuotas al día) antes de aceptar el reclamo como
   `cubierto`. Es una validación, no una simple bandera manual.

5. **Ajustes de tarifa son reversibles y no retroactivos.** Un ajuste masivo
   (`prev_ajustes`) aplica a planes/monedas seleccionados, con redondeo
   configurable, y guarda el detalle valor-anterior → valor-nuevo por cada
   entidad afectada, para poder revertir el ajuste completo. Nunca re-tarifa
   contratos ya vigentes salvo que el ajuste lo incluya explícitamente.

6. **Pagos electrónicos son una máquina de estados estricta**, no un booleano
   "pagado sí/no". Un endpoint nunca marca `APPROVED` directamente — solo el
   proveedor de pago (vía conciliación o webhook) puede avanzar el estado.
   `prev_pago_eventos` nunca guarda datos sensibles de tarjeta/cuenta, solo
   payload sanitizado. Este es el mismo patrón de diseño que la capa Mercantil
   de Funerzul (`api/lib/payments/`), tratada ahí como "superficie crítica".

7. **Solicitudes públicas no son contratos.** Un lead (`prev_solicitudes_publicas`)
   es solo una intención declarada desde el sitio público; se vuelve contrato
   real únicamente cuando el staff lo "convierte" explícitamente
   (`contrato_id` se completa en ese momento, nunca antes).

8. **Mensajería multi-proveedor.** El canal de notificación (WhatsApp/SMS) es
   configurable por proveedor: `manual` (abre `wa.me` sin registrar
   automáticamente), `whatsapp_cloud` (Meta), `twilio`, o `http` (gateway
   genérico). El staff puede "preparar" un envío masivo a morosos sin que se
   registre hasta confirmarlo.

## Endpoints actuales (para mapear 1:1 a nuevas rutas del Worker)

Todos viven bajo `api/prevision_*.php`, requieren sesión de staff
(admin/editor), responden `{ ok: true|false, ... }`, y las bajas definitivas
requieren rol admin. Se listan agrupados porque así se van a agrupar también
los módulos nuevos del Worker (ver arquitectura):

- **Clientes** — `prevision_clientes.php`: list/get/create/update/delete/restore.
- **Planes** — `prevision_planes.php`: list/get/create/update/toggle/delete.
- **Vendedores y comisiones** — `prevision_vendedores.php`: CRUD de
  vendedores (`retirar`/`reactivar`) + todo el flujo de comisiones
  (`comisiones`, `comision_calcular`, `comision_aprobar`, `comision_pagar`,
  `comision_anular`, `descuentos`, etc.).
- **Contratos y beneficiarios** — `prevision_contratos.php`: list/get/create/
  update/set_estatus + beneficiarios (`beneficiario_add/update/estatus/delete`)
  + cuotas (`cuotas`, `cuotas_generar`, `cuota_update`, `cuota_anular`) +
  pagos (`pagos`, `pago_registrar`, `pago_delete`) + tablero (`stats`) + tasa
  de cambio (`tasa`, `tasa_set`, `tasa_historial`, `tasa_aplicar`) + bitácora
  (`eventos`).
- **Adjuntos** — `prevision_adjuntos.php`: list/subir/eliminar.
- **Importación** — `prevision_import.php`: plantilla/lotes/importar (con
  modo simulación).
- **Siniestros** — `prevision_siniestros.php`: list/preparar/create/get/
  detalle_add/detalle_pagado/detalle_delete/set_estado/delete.
- **Cobranza** — `prevision_cobranza.php`: morosos/gestiones/gestion_add/
  lapsado_config/lapsado_preview/lapsado_ejecutar/hoja_cobro.
- **Catálogos** — `prevision_catalogos.php`: sucursales/servicios/cobradores/
  rutas + servicios por contrato.
- **Cron** — `cron/prevision_lapsar.php`: ejecución diaria del auto-lapsado.
- **Ajustes de tarifa** — `prevision_ajustes.php`: list/get/preview/aplicar/
  revertir.
- **Mensajería** — `prevision_mensajes.php`: config/test/plantillas/
  preparar/enviar/enviar_morosos/envios.
- **Reportes** — `prevision_reportes.php`: aging/produccion/cobranza/cartera
  (todos con `&formato=csv`).
- **Pagos electrónicos** — `prevision_pagos.php` +
  `prevision_mercantil_callback.php` + `prevision_mercantil_webhook.php`:
  intención de cobro, callback de retorno y webhook del banco.
- **Solicitudes públicas (leads)** — `prevision_solicitudes.php`: captura
  desde el sitio público, listado/gestión por staff.

## Frontend actual

`admin-prevision.js` (vanilla JS, sin framework) renderiza una **consola de
previsión** dentro de `admin.html`: barra lateral con ~13 subpaneles
(`#pvSubNav`, `.filter-btn[data-sub]`), KPIs jerarquizados con acentos
semánticos, tablas/toolbars reutilizando clases compartidas del panel
(`.stat-card`, `.admin-table`, `.admin-toolbar`). El rediseño de agosto 2026
(`docs/specs/2026-08-11-prevision-ui-redesign.md`) es puramente visual — la
estructura funcional (13 subpaneles = 13 dominios de arriba) es la que importa
para el puerto a Legado Holding, no el CSS específico.

**Referencia de patrón de consola recomendada para el nuevo tab de Legado
Holding:** el layout de dos columnas (nav lateral + contenido) descrito en ese
mismo documento — sidebar con íconos, KPIs con jerarquía visual — porque ya
está validado como el layout correcto para este volumen de subpaneles (mismo
problema: muchos dominios en una sola pestaña).

## Lo que NO hace falta portar tal cual

- El **cron via URL+token** de PHP (`cron/prevision_lapsar.php`) — en Legado
  Holding esto se hace con **Cloudflare Cron Triggers** nativos del Worker.
- La subida de archivos a disco (`uploads/prevision/`) — Legado Holding no
  tiene ese patrón de almacenamiento; evaluar Supabase Storage en su lugar
  (ver arquitectura).
- El adaptador Mercantil específico (`api/lib/payments/`, callback/webhook
  PHP) — Legado Holding ya tiene su propio camino de cobro vía **Invoice
  Ninja** (facturas recurrentes). La máquina de estados de
  `prev_pagos_electronicos` sigue siendo válida como **diseño**, pero el
  proveedor real a integrar primero es Invoice Ninja, no Mercantil (ver
  arquitectura y roadmap).
- CSRF de sesión PHP — Legado Holding usa `X-Admin-Token` fijo, no sesiones
  con CSRF rotativo. Mantener ese patrón, no mezclarlo.
