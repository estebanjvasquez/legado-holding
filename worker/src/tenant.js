/* =============================================================================
   Identidad del despliegue (tenant).

   Hoy este Worker sirve SOLO a LEGADO Holding (`lh`). Cuando entre Funeraria
   del Zulia (`fdz`) habrá un segundo despliegue con `TENANT = "fdz"` en su
   wrangler.toml (o routing multi-tenant — ver
   docs/plan-bot-alma-funeraria-del-zulia.md).

   Centralizar la resolución acá evita que `"lh"` quede hardcodeado en varios
   archivos y da un único punto para:
     - el path de la API pública de Prevision-Funeraria (`/api/public/t/<tenant>`),
     - el campo `tenant` de los logs y de chat_sessions.metadata,
     - el `service.name` de OpenTelemetry (Etapa 1, docs/observabilidad-opentelemetry.md).
   ============================================================================= */

const KNOWN = new Set(["lh", "fdz"]);
const DEFAULT_TENANT = "lh";

export function resolveTenant(env) {
  const raw = (env && env.TENANT ? String(env.TENANT) : DEFAULT_TENANT)
    .trim()
    .toLowerCase();
  const id = KNOWN.has(raw) ? raw : DEFAULT_TENANT;
  return {
    id,
    /* service.name para OTel + prefijo de logs por marca. */
    serviceName: `alma-${id}`,
  };
}
