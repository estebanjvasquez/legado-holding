# Paquete de integración — Módulo de Previsión → Legado Holding

Documentación autocontenida para llevar el módulo de administración de
Previsión (pólizas funerarias) de este repo (`Propuesta-Funerzul`) al repo
hermano `estebanjvasquez/legado-holding`, integrado a su panel admin
existente (Cloudflare Worker + Supabase), sin dañar lo que ya funciona ahí.

Generado el 2026-08-13, a partir de: el estado real del código de
`Propuesta-Funerzul` (módulo `admin-prevision.js` + `api/prevision_*.php` +
`database/04_prevision.sql`…`10_prevision_pagos_electronicos.sql`), el estado
real del código de `legado-holding` (`worker/src/*.js`, `admin/*`), y las
propuestas de mejora del 2026-08-11 (`docs/propuesta-mejoras-prevision.md` y
`docs/specs/2026-08-11-mejoras-prevision-plan-tecnico.md`).

## Esta carpeta se mueve, no se referencia desde lejos

Este paquete está pensado para **copiarse completo** al repo `legado-holding`
antes de empezar a trabajar ahí. No asume que quien lo lea tenga acceso al
repo `Propuesta-Funerzul` al mismo tiempo. Instrucciones exactas de copiado y
del primer mensaje a darle a Claude Code en el otro repo:
[`05-instrucciones-claude-code.md`, sección 3 y 4](05-instrucciones-claude-code.md#3-primer-mensaje-sugerido-para-arrancar-la-sesión-en-legado-holding).

## Orden de lectura

| # | Archivo | Qué responde |
|---|---|---|
| 0 | [`00-contexto-y-limites.md`](00-contexto-y-limites.md) | ¿Cómo se relacionan Funerzul, Legado Holding y `Prevision-Funeraria`? ¿Qué superficies de Legado Holding no se pueden tocar? |
| 1 | [`01-modulo-actual-referencia.md`](01-modulo-actual-referencia.md) | ¿Qué hace el módulo de previsión hoy en Funerzul? Entidades, estados, reglas de negocio, endpoints — sin necesidad de leer el código PHP. |
| 2 | [`02-arquitectura-integracion.md`](02-arquitectura-integracion.md) | ¿Cómo se construye esto dentro de la arquitectura real de Legado Holding (Worker + Supabase + admin UI) sin romper lo existente? |
| 3 | [`03-propuestas-mejoras-roadmap.md`](03-propuestas-mejoras-roadmap.md) | Las seis mejoras propuestas el 2026-08-11 para Funerzul, traducidas al stack de Legado Holding. |
| 4 | [`04-plan-fases-implementacion.md`](04-plan-fases-implementacion.md) | El roadmap único (port base + mejoras) en fases ejecutables, de menor a mayor riesgo. |
| 5 | [`05-instrucciones-claude-code.md`](05-instrucciones-claude-code.md) | Instrucciones operativas y reglas no negociables para el agente que va a escribir el código en `legado-holding`. |

Un agente que vaya a implementar debe leer los cinco en ese orden **antes**
de tocar código, tal como indica el punto 0 de las instrucciones.

## Resumen en una tabla

| Pregunta | Respuesta corta |
|---|---|
| ¿Se toca el código de Funerzul? | No. Este paquete es solo documentación de referencia sacada de ahí. |
| ¿Se toca el plan de `Prevision-Funeraria`? | No. Es un esfuerzo paralelo, con su propio repo y cronograma. Ver `00-contexto-y-limites.md`. |
| ¿Dónde se implementa esto? | Dentro de `legado-holding`, integrado a su panel admin actual. |
| ¿Con qué base de datos? | Con el **Supabase que `legado-holding` ya usa** — tablas nuevas con prefijo `prev_`, sin tocar las existentes (`chat_sessions`, `chat_turns`, `locations_venezuela`, `funeral_partners`, `agent_config`). |
| ¿Se puede romper el chatbot Alma o el checkout actual? | No debería — el plan es aditivo por diseño (rutas nuevas, tablas nuevas, un tab nuevo). Ver el resumen de archivos tocados en `02-arquitectura-integracion.md`. |
| ¿Hay que hacerlo todo de una vez? | No. `04-plan-fases-implementacion.md` está pensado para poder detenerse después de cualquier fase con algo funcional. |
