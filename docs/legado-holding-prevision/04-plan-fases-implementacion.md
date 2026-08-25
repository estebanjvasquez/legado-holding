# Plan de fases — implementación en Legado Holding

Roadmap único que combina **portar el módulo actual** (paridad funcional con
Funerzul) y **las seis mejoras** (`03-propuestas-mejoras-roadmap.md`), en el
orden de menor a mayor riesgo. Cada fase es un lote de trabajo con su propia
spec previa (ver `05-instrucciones-claude-code.md`), su propia migración
Supabase, y su propio criterio de "hecho".

No es obligatorio ejecutar todas las fases seguidas — el usuario puede
detenerse después de cualquier fase y tener algo funcional y coherente.

## Fase 0 — Fundaciones (clientes, planes, contratos, cuotas, pagos)

**Objetivo:** paridad mínima operable — dar de alta un cliente, un plan, un
contrato, generar sus cuotas, registrar un pago, ver el estado del contrato
en el panel.

**Tablas Supabase:** `prev_clientes`, `prev_planes`, `prev_vendedores`,
`prev_contratos`, `prev_beneficiarios`, `prev_parentescos`, `prev_cuotas`,
`prev_pagos`, `prev_tasas`.

**Worker:** `worker/src/prevision/{db,router,clientes,planes,contratos}.js` +
hook de una línea en `admin.js` (ver arquitectura, Decisión 1).

**Frontend:** `admin/prevision.js` + tab nueva en `admin/index.html`, con
subpaneles: Clientes, Planes, Contratos (incluye cuotas y pagos del
contrato), Vendedores. Tablero con KPIs básicos (contratos activos, cuotas
vencidas, cobrado del mes) — mismo espíritu que `#pvStat*` en Funerzul.

**No incluye todavía:** siniestros, comisiones, cobranza masiva, ajustes de
tarifa, mensajería, reportes, importación CSV, pagos electrónicos. Todo eso
son fases posteriores — Fase 0 es deliberadamente angosta para llegar rápido
a algo demostrable.

**Criterio de "hecho":** desde el panel, un admin puede crear un cliente, un
plan, un contrato con al menos un beneficiario, ver sus cuotas generadas y
registrar un pago que se refleje en el saldo.

## Fase 0.1 — Cobranza y comisiones

**Objetivo:** cerrar el ciclo económico del contrato: comisión al vendedor,
gestión de morosidad, auto-lapsado.

**Tablas:** `prev_comisiones`, `prev_com_descuentos`, `prev_gestiones`,
configuración de lapsado (tabla key/value simple, o extensión de
`prev_ajustes` si ya se adelantó en esta fase).

**Worker:** `prevision/vendedores.js` (comisiones), `prevision/cobranza.js` +
**Cron Trigger** para el auto-lapsado (ver arquitectura, Decisión 4 — toca
`wrangler.toml` e `index.js`, comunicarlo en la spec).

**Frontend:** subpaneles Comisiones y Cobranza/Morosos.

**Incluye la mejora #3** (renovación/reactivación) del roadmap de mejoras —
tiene sentido resolverla junto con el auto-lapsado porque comparten la misma
máquina de estados de contrato.

**Criterio de "hecho":** un contrato con cuotas vencidas se suspende solo
(cron) respetando el período de gracia; se puede reactivar manualmente; se
puede calcular → aprobar → pagar una comisión.

## Fase 0.2 — Siniestros, catálogos, ajustes, mensajería, reportes, importación

**Objetivo:** completar la paridad funcional restante con Funerzul.

**Tablas:** `prev_sucursales`, `prev_servicios`, `prev_contrato_servicios`,
`prev_cobradores`, `prev_rutas`, `prev_siniestros`, `prev_siniestro_detalles`,
`prev_adjuntos` (con Supabase Storage, ver mejora #2), `prev_ajustes` +
detalle, `prev_msg_plantillas`, `prev_msg_envios`, `prev_import_lotes`.

**Nota de alcance:** esta fase es grande — considerar dividirla en sub-fases
por dominio (siniestros / catálogos / ajustes+mensajería / reportes+import)
si el volumen lo justifica. Decidir la granularidad real en la spec, no aquí.

**Incluye la mejora #2** (siniestros ampliados: monto aprobado vs. pagado)
directamente, ya que se está construyendo siniestros desde cero — más barato
incluirla ahora que como parche después.

**Criterio de "hecho":** paridad funcional completa con el módulo actual de
Funerzul (menos pagos electrónicos con banco, que es Fase 2).

## Fase 1 — Leads / prospectos

**Objetivo:** mejora #4 del roadmap — pipeline de solicitudes públicas con
prioridad.

**Tablas:** `prev_solicitudes_publicas`.

**Worker:** `prevision/solicitudes.js` (endpoint público de captura +
endpoints admin de gestión).

**Frontend:** subpanel Solicitudes/Leads.

**Criterio de "hecho":** una solicitud desde el sitio público aparece en el
panel con prioridad calculada, asignable a un vendedor, convertible en
contrato.

## Fase 2 — Portal de autogestión + pago en línea

**Objetivo:** mejora #1 del roadmap. La fase de mayor riesgo (superficie
pública nueva, autenticación de titulares, dinero).

**Tablas:** `prev_titular_accesos`.

**Worker:** `worker/src/prevision-portal.js` (fuera del árbol admin, auth
propia).

**Frontend:** páginas públicas nuevas fuera de `admin/`.

**Dependencia:** facturación recurrente de Invoice Ninja ya operativa desde
Fase 0/0.1 para las cuotas de los contratos que se van a mostrar/pagar aquí.

**Requiere spec de seguridad dedicada**, no solo spec funcional — mismo nivel
de exigencia que Funerzul le pide a su capa Mercantil.

**Criterio de "hecho":** un titular real puede pedir un OTP, entrar a su
resumen, ver sus cuotas y pagar la próxima desde el link de Invoice Ninja.

## Fase 3 — Tarifas por edad + sucursales/reportes consolidados

**Objetivo:** mejoras #5 y #6 del roadmap. Estructural, menor urgencia.

**Tablas:** `prev_plan_tarifas`; extender `prev_beneficiarios` con
`monto_cobertura`.

**Criterio de "hecho":** un plan puede tener bandas de precio por edad sin
afectar contratos ya firmados; reportes filtran/consolidan por sucursal.

## Tabla resumen

| Fase | Contenido | Nuevo riesgo principal |
|---|---|---|
| 0 | Clientes, planes, contratos, cuotas, pagos | Ninguno (base) |
| 0.1 | Comisiones, cobranza, auto-lapsado, mejora #3 | Toca `wrangler.toml`/`index.js` (cron) |
| 0.2 | Siniestros, catálogos, ajustes, mensajería, reportes, import, mejora #2 | Supabase Storage nuevo |
| 1 | Leads, mejora #4 | Endpoint público nuevo (bajo riesgo) |
| 2 | Portal titular + pago, mejora #1 | Auth pública + dinero (alto riesgo) |
| 3 | Tarifas por edad, sucursales, mejoras #5/#6 | Ninguno especial |
