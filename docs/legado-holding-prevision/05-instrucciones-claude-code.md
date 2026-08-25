# Instrucciones para Claude Code — ejecutar esto en `legado-holding`

Este documento es el punto de arranque operativo. Está escrito como
instrucciones directas para el agente que va a **escribir código** en el
repo `legado-holding`, no como narrativa.

## 0. Antes de escribir una sola línea

1. Lee, en este orden:
   - Este paquete completo (`00` a `04` en esta misma carpeta).
   - `README.md` del repo `legado-holding` (arquitectura, endpoints,
     variables/secrets, comandos de `wrangler`).
   - `worker/src/index.js`, `worker/src/admin.js`, `worker/src/supabase.js`,
     `worker/src/invoiceninja.js` completos.
   - `admin/index.html`, `admin/admin.js` completos.
   - `worker/wrangler.toml`.
2. Si `legado-holding` tiene un `CLAUDE.md`, `AGENTS.md` o instrucciones en
   `.claude/` propias, esas instrucciones **tienen prioridad** sobre este
   documento en cualquier punto donde entren en conflicto — este paquete es
   una guía traída de otro repo, no la autoridad final sobre las convenciones
   de `legado-holding`.
3. Confirma con el usuario, antes de tocar código, las decisiones abiertas
   que este paquete deja explícitamente sin cerrar:
   - `bigint identity` vs `uuid` para las claves primarias nuevas (ver
     `02-arquitectura-integracion.md`, Decisión 2).
   - Si migrar a `supabase/migrations/*.sql` versionado o seguir aplicando
     cambios manuales desde el dashboard de Supabase.
   - Canal de OTP para el portal de titular (WhatsApp vs. email) — solo
     relevante si se llega a la Fase 2.
   - Qué fase(s) del roadmap (`04-plan-fases-implementacion.md`) ejecutar
     ahora; no asumas que hay que hacerlas todas de una vez.

## 1. Reglas no negociables (repetidas de `00-contexto-y-limites.md` porque
   importa que no se pierdan)

- No renombrar ni alterar columnas de `chat_sessions`, `chat_turns`,
  `locations_venezuela`, `funeral_partners`, `agent_config`.
- No cambiar el contrato (payload/status) de las rutas ya existentes bajo
  `/admin/locations*`, `/admin/partners*`, `/admin/config*`, `/admin/sessions*`,
  `/admin/health`.
- No tocar `worker/src/alma.js`, `worker/src/chat.js`, `worker/src/pipeline.js`,
  `worker/src/emergency.js` salvo que la tarea puntual lo requiera
  explícitamente (ninguna fase de este roadmap lo requiere).
- No reordenar ni quitar las pestañas actuales del admin (Ubicaciones,
  Aliados, Agente, Conversaciones).
- Todo lo nuevo usa `X-Admin-Token` para auth de staff, igual que lo
  existente — no introducir un segundo esquema de auth para el panel admin
  (el portal público de titular, Fase 2, es la única excepción intencional:
  esa es una superficie *distinta*, no del panel admin).
- Sin build, sin bundler, sin framework nuevo, sin dependencias npm nuevas en
  el Worker salvo justificación explícita al usuario — mismo espíritu que ya
  aplica Funerzul a su propio stack (`AGENTS.md` de ese repo, regla que
  también encaja aquí: "no introducir frameworks, bundlers, dependencias
  ni reestructuras grandes sin especificación previa y aprobación explícita").
- Todo texto visible para el usuario final va en español (el panel admin de
  Legado Holding hoy es solo español, a diferencia del sitio público que es
  bilingüe — no agregar i18n al panel admin sin que se pida).
- Nombres de tablas y columnas nuevas: prefijo `prev_`, snake_case, igual que
  Funerzul (ver `01-modulo-actual-referencia.md`) — es intencional, para que
  cualquiera que conozca el sistema original entienda el nuevo de inmediato.

## 2. Flujo de trabajo por fase

Para cada fase del roadmap que se decida ejecutar:

1. **Spec breve antes de codificar.** No hace falta adoptar el specboot
   completo de Funerzul, pero sí dejar por escrito, en un archivo dentro de
   `legado-holding` (sugerido: `docs/prevision/<fecha>-<fase>.md`, o donde el
   propio repo ya organice sus decisiones — revisar si existe convención):
   - Qué tablas se crean/modifican.
   - Qué rutas del Worker se agregan.
   - Qué se toca en `admin.js`/`admin/index.html` (debería ser mínimo, ver
     arquitectura).
   - Riesgos específicos de esa fase.
   - Cómo se va a verificar manualmente.
2. **Migración Supabase** para la fase (SQL nuevo, ver decisión sobre
   versionado en la sección 0).
3. **Worker:** implementar los módulos de `worker/src/prevision/` que
   correspondan a la fase, siguiendo el patrón de `supabase.js`/`admin.js`
   descrito en `02-arquitectura-integracion.md`.
4. **Frontend:** extender `admin/prevision.js` y el subpanel correspondiente
   dentro de la pestaña "Previsión".
5. **Verificar:**
   - `cd worker && npx wrangler dev` — probar las rutas nuevas con `curl`
     (o Postman) incluyendo el header `X-Admin-Token`.
   - Abrir `admin/index.html` localmente (o el flujo de dev que use el repo,
     ver su README) y probar el flujo desde la UI.
   - Confirmar que las pestañas existentes (Ubicaciones, Aliados, Agente,
     Conversaciones) siguen funcionando igual — no solo que no haya errores
     de consola, sino un click real en cada una.
6. **Documentar:** actualizar el README de `legado-holding` (o el doc de
   previsión que se haya creado) con los endpoints y tablas nuevas, mismo
   criterio que Funerzul aplica en su propio `api/README.md`.

## 3. Primer mensaje sugerido para arrancar la sesión en `legado-holding`

Si quien lee esto es literalmente el primer prompt de una sesión nueva de
Claude Code dentro del repo `legado-holding`, este es el resumen a usar como
punto de partida (adaptar según lo que el usuario pida esa sesión en
concreto — no ejecutar fases que el usuario no pidió):

> Vamos a construir el módulo de administración de Previsión (pólizas
> funerarias) dentro de este repo, integrado al panel admin que ya existe
> (`admin/`, Worker en `worker/`, Supabase). Hay un paquete de documentación
> de referencia en `docs/legado-holding-prevision/` (si ya se copió a este
> repo) que explica: qué hace el módulo original en el repo hermano
> `Propuesta-Funerzul` (`01-modulo-actual-referencia.md`), cómo integrarlo
> aquí sin romper nada existente (`02-arquitectura-integracion.md`), las
> mejoras propuestas sobre el módulo original ya adaptadas a este stack
> (`03-propuestas-mejoras-roadmap.md`), el plan de fases
> (`04-plan-fases-implementacion.md`) y las reglas de trabajo
> (`05-instrucciones-claude-code.md`, este mismo archivo). Léelos en ese
> orden antes de proponer un plan. Empecemos por la Fase 0.

## 4. Cómo mover este paquete al repo `legado-holding`

Este paquete vive en `docs/legado-holding-prevision/` dentro del repo
`Propuesta-Funerzul` porque ahí es donde se generó — no porque deba quedarse
ahí permanentemente. Para usarlo en `legado-holding`:

1. Copia la carpeta completa `docs/legado-holding-prevision/` al repo
   `legado-holding`, por ejemplo a `docs/prevision/` (o donde ese repo prefiera
   organizar su documentación — no hay una carpeta `docs/` establecida ahí
   todavía a juzgar por su estructura actual).
2. Abre una sesión de Claude Code con el working directory en
   `legado-holding` y pega el mensaje de la sección 3.
3. Deja que el agente lea el paquete completo antes de escribir código.

No hace falta mantener sincronizadas las dos copias del paquete — una vez
copiado, el original en `Propuesta-Funerzul` queda como referencia histórica
de por qué se tomaron las decisiones, y la copia en `legado-holding` es la
que se actualiza a medida que la implementación avanza y la realidad del
código diverge de lo planeado aquí (que va a pasar, y está bien).
