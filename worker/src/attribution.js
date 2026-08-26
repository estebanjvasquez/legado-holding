/* =============================================================================
   Saneamiento del bloque `atribucion` que el sitio manda en cada compra / lead
   / turno de chat, para reenviarlo tal cual a Prevision-Funeraria (tenant lh).

   El frontend (js/main.js → getAttribution) ya arma este bloque desde el
   ?ref=CODIGO + UTMs con modelo first-touch. Aquí solo lo validamos antes de
   confiarlo a la API: nunca bloquea la operación por un valor raro, solo lo
   descarta. Un `codigo_vendedor` inexistente/inactivo lo ignora la propia API
   (docs/api-publica-wizard.md §"Atribución de canal / vendedor").
   ============================================================================= */

const CANAL_ENUM = ["directo", "redes_sociales", "buscador", "otro", "vendedor"];

function clean(s, maxLen) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, maxLen);
}

/** Devuelve un objeto `atribucion` listo para el body de PF, o `null` si no hay
 *  nada aprovechable. */
export function sanitizeAttribution(raw) {
  if (!raw || typeof raw !== "object") return null;

  const out = {};

  const code = String(raw.codigo_vendedor || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 24);
  if (code.length >= 4) out.codigo_vendedor = code;

  const canal = String(raw.canal_origen || "").toLowerCase().trim();
  if (CANAL_ENUM.includes(canal)) out.canal_origen = canal;

  ["utm_source", "utm_medium", "utm_campaign"].forEach((k) => {
    const v = clean(raw[k], 120);
    if (v) out[k] = v;
  });

  const referrer = clean(raw.referrer_url, 500);
  if (referrer) out.referrer_url = referrer;

  return Object.keys(out).length ? out : null;
}

/** Etiqueta corta para logs (no vuelca todo el objeto). */
export function attributionTag(attr) {
  if (!attr) return "none";
  return attr.codigo_vendedor ? `ref:${attr.codigo_vendedor}` : (attr.canal_origen || "none");
}
