# Las seis mejoras propuestas, adaptadas a Legado Holding

Origen: `docs/propuesta-mejoras-prevision.md` (versión para el cliente) y
`docs/specs/2026-08-11-mejoras-prevision-plan-tecnico.md` (versión técnica)
del repo Funerzul, fechadas 2026-08-11. Aquí se traducen al stack de Legado
Holding (Worker + Supabase + Invoice Ninja) y se piensan **desde el diseño
inicial**, no como parche posterior — a diferencia de Funerzul, donde se
proponen sobre un sistema ya en producción.

Cada mejora, igual que en el plan original, debe tener su **spec breve**
antes de implementarse (ver `05-instrucciones-claude-code.md`).

## 1. Portal de autogestión del titular

**Qué es.** Zona pública autenticada donde el titular del contrato consulta
su póliza y paga en línea, sin acceso al panel de staff.

**Adaptación al stack:**
- Autenticación: OTP enviado por WhatsApp — Legado Holding no tiene todavía
  infraestructura de mensajería saliente propia (a diferencia de
  `prev_msg_envios` en Funerzul). Evaluar dos caminos: (a) construir un envío
  WhatsApp mínimo (Cloud API de Meta) como parte de esta mejora, o (b)
  delegar el OTP a email vía Invoice Ninja/SMTP si ya existe capacidad de
  envío de correo en el proyecto. Decidir en la spec de esta fase.
- Sesión de titular: tabla `prev_titular_accesos` (mismo diseño que
  Funerzul: `cliente_id`, hash del código, expiración, intentos), pero el
  "token de sesión" resultante debe ser un valor opaco firmado o aleatorio
  largo, **nunca** el mismo `ADMIN_TOKEN` ni derivado de él — son dos
  superficies de autenticación completamente separadas.
- Endpoint público nuevo (no bajo `/admin/*`, no requiere `X-Admin-Token`):
  `POST /prevision-portal/solicitar-otp`, `POST /prevision-portal/verificar-otp`,
  `GET /prevision-portal/resumen`, `GET /prevision-portal/cuotas`, `POST
  /prevision-portal/pagar`. Vive en `worker/src/prevision-portal.js`, fuera
  del árbol `prevision/` de admin (distinto dispatcher, distinta auth).
- Pago: generar/reutilizar la factura recurrente de Invoice Ninja del
  contrato y redirigir al link de pago de Invoice Ninja — no reinventar un
  gateway de pago propio en esta fase (ver Decisión 5 de la arquitectura).
- Frontend: página pública nueva (fuera de `admin/`), estilo consistente con
  el resto del sitio (`css/` existente), no con el panel admin.

**Riesgos:** superficie pública nueva con PII (cédulas, montos, contratos) —
requiere rate-limit en `solicitar-otp`, y cuidado explícito con enumeración de
cédulas (no confirmar/negar existencia de un cliente en la respuesta de
error). Tratar con el mismo nivel de cuidado que Funerzul trata su capa
Mercantil.

## 2. Gestión de siniestros más completa

**Qué es.** Ciclo completo del reclamo por fallecimiento: tipo, documentos,
monto aprobado vs. monto pagado, fechas, coordinación con proveedores.

**Adaptación al stack:** en su mayoría es diseño de datos + UI, no depende de
infraestructura externa. La única decisión de stack es dónde van los
documentos adjuntos:
- Funerzul los guarda en disco (`uploads/prevision/`). Legado Holding no
  tiene ese patrón (es un Worker + hosting estático, sin filesystem
  persistente del lado del Worker).
- Usar **Supabase Storage** (bucket privado, acceso vía signed URL generada
  por el Worker con `service_role`) para los adjuntos de siniestros y
  contratos. Es la opción más consistente con el resto de la infraestructura
  ya elegida.

**Datos:** tabla `prev_siniestros` con `tipo_reclamo`, `monto_aprobado`,
`monto_pagado`, `fecha_pago`; `prev_siniestro_detalles` para el desglose;
`prev_adjuntos` apuntando a rutas de Supabase Storage en vez de rutas de
disco.

**Riesgos:** consistencia contable (monto_pagado ≤ monto_aprobado, validado
en el Worker antes de escribir); mismo criterio de auditoría que el resto del
módulo (ver mejora transversal de auditoría en la Fase 0 del roadmap).

## 3. Renovación y reactivación de contratos

**Qué es.** Camino de regreso para un contrato que el auto-lapsado suspendió:
período de gracia + condiciones para reactivar.

**Adaptación al stack:** sin dependencias externas nuevas. Acción
`POST /admin/prevision/contratos/:id/reactivar` en el Worker; período de
gracia parametrizado en una tabla de configuración (`prev_ajustes` o una
tabla simple `prevision_config` key/value — reutilizar el patrón que ya
existe para `agent_config` en `supabase.js`, mismo estilo). El cron de
lapsado (Cron Trigger, ver arquitectura) respeta ese período de gracia antes
de suspender.

**Riesgos:** bajo. Es la mejora de menor esfuerzo también en este stack — se
apoya en estructura que de todas formas hay que construir en la Fase 0
(contratos + su máquina de estados).

## 4. Captación y seguimiento de prospectos (leads)

**Qué es.** Convertir las solicitudes públicas en un pipeline con prioridad
para que el equipo comercial contacte primero a los más interesados.

**Adaptación al stack:** Legado Holding **ya captura leads** de forma
parecida — el wizard de afiliación y el chatbot Alma generan
`chat_sessions`/`chat_turns` con datos de contacto. Antes de crear
`prev_solicitudes_publicas` desde cero, evaluar en la spec de esta fase si
conviene:
- (a) una tabla dedicada `prev_solicitudes_publicas` igual que Funerzul
  (más simple, más aislada), o
- (b) integrarla con el pipeline de `chat_sessions` existente (más unificado,
  pero acopla previsión al chatbot).

Empezar por (a) — más simple y no toca nada del chatbot — y reevaluar (b) más
adelante si el negocio lo pide.

**Datos:** `prev_solicitudes_publicas` con `puntuacion`/`prioridad`,
`asignado_a` (vendedor), `proximo_contacto`, igual que el diseño de Funerzul.

**Riesgos:** bajos.

## 5. Tarifa por edad y cobertura por beneficiario

**Qué es.** Precio del plan variable según edad, monto de cobertura por
beneficiario en vez de precio único.

**Adaptación al stack:** puramente de datos y cálculo, sin dependencia de
infraestructura de Legado Holding. Tabla `prev_plan_tarifas` (`plan_id`,
`edad_min`, `edad_max`, `cuota`, `cobertura`); `prev_beneficiarios` con
`monto_cobertura` y fecha de nacimiento. El cálculo de cuota al crear un
contrato debe ocurrir en el Worker (`prevision/contratos.js`), no en el
frontend, por las mismas razones que en Funerzul (no confiar en el cliente
para montos).

**Regla de negocio (igual que Funerzul):** nunca re-tarifar contratos
vigentes; aplica solo a contrataciones nuevas.

**Riesgos:** compatibilidad con planes de cuota plana (mantenerlos como caso
por defecto, igual que el diseño original).

## 6. Operación por sucursales / multiempresa

**Qué es en Funerzul:** operación por sucursal (`prev_sucursales`, ya
existe) + una capa multiempresa completa que vive en el repo separado
`Prevision-Funeraria`.

**En Legado Holding, esto es diferente y más simple:** Legado Holding
**es**, en sí mismo, una de las dos marcas que `Prevision-Funeraria`
eventualmente serviría (junto con Funerzul). No hace falta construir
"multiempresa" dentro de Legado Holding — Legado Holding ya *es* una
empresa. Lo que sí vale la pena portar es:
- `prev_sucursales` como catálogo simple, para si Legado Holding abre más de
  una sede física en EE. UU. a futuro.
- Filtros y consolidación por sucursal en reportes y UI (mismo alcance que
  Funerzul se propuso: "asegurar que contratos, cuotas, vendedores y reportes
  puedan filtrar y consolidar por `sucursal_id`").

**No construir aquí:** aislamiento multiempresa, `company_uid`, ni nada que
se solape con el plan de `Prevision-Funeraria`. Si en algún momento
`Prevision-Funeraria` reemplaza este módulo, la migración es un trabajo
aparte — no diseñar para esa migración hipotética ahora (YAGNI).

**Riesgos:** ninguno especial — es la mejora de menor prioridad real para
Legado Holding específicamente, más que para Funerzul.

## Priorización sugerida para Legado Holding

A diferencia del plan de Funerzul (que fasea sobre un sistema ya vivo), aquí
el orden natural se decide junto con el port base (Fase 0). Ver
`04-plan-fases-implementacion.md` para el roadmap combinado — en resumen,
mismo orden de bajo-riesgo-primero que Funerzul propuso:

1. Renovación/reactivación (#3) + Leads (#4) — bajo esfuerzo, se apoyan en la
   Fase 0.
2. Portal de autogestión (#1) + Siniestros ampliados (#2) — mayor valor de
   servicio, mayor riesgo (superficie pública, pagos).
3. Tarifas por edad (#5) + Sucursales (#6) — estructural, menor urgencia.
