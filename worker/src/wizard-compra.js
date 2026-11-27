/* =============================================================================
   Pipeline de checkout del wizard de planes — reemplaza pipeline.js (Invoice
   Ninja) llamando a POST /api/public/t/lh/compras de Prevision-Funeraria.

   Cubre los 4 planes: esencial-zulia, vanguardia-zulia, esencial-selecto,
   vanguardia-selecto. Los "Selecto" cobran además una cuota inicial única
   (cuota_inicial_centavos en /planes) — este Worker NO la calcula ni la manda:
   solo manda plan_id, y Prevision-Funeraria arma el Stripe Checkout con la
   cuota inicial one-time + la suscripción recurrente
   (docs/ajustes-prevision-funeraria-atribucion-vendedor.md §4).
   ============================================================================= */

import { createPF } from "./prevision-api.js";
import { ValidationError } from "./errors.js";
import { sanitizeAttribution, attributionTag } from "./attribution.js";

/* Para logs: "an***@gmail.com" — suficiente para ubicar un caso sin dejar el
   correo completo en el log. */
export function maskEmail(email) {
  const [user, domain] = String(email || "").split("@");
  if (!domain) return "***";
  return `${user.slice(0, 2)}***@${domain}`;
}

function sanitizeText(s, maxLen = 200) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

const MAX_FAMILY = 6;
const VALID_PAYMENT_TYPES = ["monthly", "annual"];
/* Los 4 slugs. El frontend hoy solo deja comprar los Zulia
   (SELECTO_CHECKOUT_ENABLED=false en js/main.js) porque POST /compras de
   Prevision-Funeraria devuelve 500 para un plan con cuota inicial. El Worker ya
   los acepta para no tener que redeployar cuando Previsión lo arregle. */
const VALID_PLAN_SLUGS = [
  "esencial-zulia",
  "vanguardia-zulia",
  "esencial-selecto",
  "vanguardia-selecto",
];

/* Residencia del comprador (brief de Previsión 2026-11-26 §3.2): códigos de 2
   letras en mayúscula (ISO de país, USPS de estado). Previsión decide qué
   estados están habilitados (GET /residencias) y rechaza la compra si no lo
   está; acá solo se valida el formato. Fuera de EE. UU. va el país sin estado. */
/* [{clave, otorgado}] saneado: clave en minúsculas [a-z0-9_], sin repetidos, máx. 20. */
export function normalizeConsentimientos(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const vistos = new Set();
  for (const c of raw) {
    const clave = c && typeof c.clave === "string" ? c.clave.trim().toLowerCase() : "";
    if (!/^[a-z0-9_]{1,40}$/.test(clave) || vistos.has(clave)) continue;
    vistos.add(clave);
    out.push({ clave, otorgado: c.otorgado === true });
    if (out.length >= 20) break;
  }
  return out;
}

export function normalizeResidencia(raw) {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "object") throw new ValidationError("residencia inválida");
  const pais = String(raw.pais || "").trim().toUpperCase();
  const estado = String(raw.estado || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(pais)) throw new ValidationError("residencia.pais inválido (ISO de 2 letras)");
  if (estado && !/^[A-Z]{2}$/.test(estado)) throw new ValidationError("residencia.estado inválido (código USPS de 2 letras)");
  if (pais === "US" && !estado) throw new ValidationError("residencia.estado es requerido para EE. UU.");
  return estado ? { pais, estado } : { pais };
}

function normalize(body) {
  const intent = (body.intent || "").toLowerCase();
  const planSlug = body.plan || null;
  const planId = Number(body.planId);
  /* Sin default: la frecuencia la elige el comprador en el wizard. Si no
     llega, se rechaza en vez de asumir "mensual" (que nadie eligió). */
  const paymentType = String(body.paymentType || "").toLowerCase();
  const buyer = body.buyer || {};

  if (intent !== "create_payment_intent") {
    return { intent };
  }

  if (!planSlug || !VALID_PLAN_SLUGS.includes(planSlug)) {
    throw new ValidationError(
      `Plan no disponible para compra directa: '${planSlug}'. Valores: ${VALID_PLAN_SLUGS.join(", ")}`,
    );
  }
  if (!Number.isInteger(planId) || planId <= 0) {
    throw new ValidationError("planId inválido o ausente");
  }
  if (!VALID_PAYMENT_TYPES.includes(paymentType)) {
    throw new ValidationError(
      `paymentType no reconocido: '${paymentType}'. Valores: ${VALID_PAYMENT_TYPES.join(", ")}`,
    );
  }

  const buyerName = sanitizeText(buyer.name, 100);
  const buyerLastName = sanitizeText(buyer.lastName, 100);
  const buyerEmail = (buyer.email || "").toLowerCase().trim().slice(0, 254);
  if (!buyerEmail) throw new ValidationError("Email del comprador es requerido");
  if (!buyerName) throw new ValidationError("Nombre del comprador es requerido");

  const familyRaw = Array.isArray(body.family) ? body.family : [];
  if (familyRaw.length > MAX_FAMILY) {
    throw new ValidationError(
      `Máximo ${MAX_FAMILY} familiares por póliza (recibidos: ${familyRaw.length})`,
    );
  }
  const afiliados = familyRaw
    .map((f) => ({
      parentesco_id: Number(f.parentescoId) || null,
      nombres: sanitizeText(f.name, 80),
      apellidos: sanitizeText(f.lastName, 80),
      documento_identidad: sanitizeText(f.cedula, 40) || null,
      fecha_nacimiento: sanitizeText(f.birthDate, 12) || null,
    }))
    .filter((f) => f.nombres || f.apellidos);

  afiliados.forEach((f, i) => {
    if (!f.parentesco_id) {
      throw new ValidationError(
        `Familiar #${i + 1} (${f.nombres} ${f.apellidos}) sin parentesco seleccionado`,
      );
    }
  });

  return {
    intent,
    planSlug,
    planId,
    paymentType,
    frecuenciaPago: paymentType === "annual" ? "anual" : "mensual",
    buyer: {
      name: buyerName,
      lastName: buyerLastName,
      email: buyerEmail,
      phone: sanitizeText(buyer.phone, 40),
      cedula: sanitizeText(buyer.cedula, 40),
      birthDate: sanitizeText(buyer.birthDate, 12),
    },
    afiliados,
    atribucion: sanitizeAttribution(body.attribution),
    residencia: normalizeResidencia(body.residencia),
    /* id de la versión de términos que el comprador aceptó (GET /condiciones). */
    condicionesVersionId:
      Number.isInteger(Number(body.condicionesVersionId)) && Number(body.condicionesVersionId) > 0
        ? Number(body.condicionesVersionId)
        : null,
    idioma: body.lang === "en" ? "en" : "es",
    /* Consentimientos OPCIONALES del titular (catálogo GET /consentimientos de
       Previsión): una casilla por tipo, marcada o no. */
    consentimientos: normalizeConsentimientos(body.consentimientos),
  };
}

function buildCompraBody(ctx, env, meta = {}) {
  const siteBase = (env.SITE_BASE_URL || "https://www.legadoholding.com").replace(/\/$/, "");
  const body = {
    cliente: {
      tipo_persona: "natural",
      documento_identidad: ctx.buyer.cedula || null,
      nombres: ctx.buyer.name,
      apellidos: ctx.buyer.lastName,
      fecha_nacimiento: ctx.buyer.birthDate || null,
      telefono_celular: ctx.buyer.phone || null,
      email: ctx.buyer.email,
    },
    plan_id: ctx.planId,
    frecuencia_pago: ctx.frecuenciaPago,
    afiliados: ctx.afiliados,
    forma_pago: "tarjeta",
    moneda_pago: "USD",
    success_url: `${siteBase}/gracias.html`,
    cancel_url: `${siteBase}/cancelado.html`,
  };
  /* Atribución de vendedor/canal (?ref=). Solo se agrega si el sitio mandó
     algo aprovechable; un código inválido lo ignora la propia API. */
  if (ctx.atribucion) body.atribucion = ctx.atribucion;
  if (ctx.residencia) body.residencia = ctx.residencia;
  /* Idioma de la página de pago de Stripe (brief §3.4). */
  body.idioma = ctx.idioma;
  /* Consentimientos: Previsión los registra en la ficha del titular al
     confirmarse la compra (canal web, IP de la compra), también los no
     otorgados (PF-12). */
  if (ctx.consentimientos.length) body.consentimientos = ctx.consentimientos;
  /* Aceptación de términos (brief §3.3): versión + IP real + navegador. Solo
     si el plan tiene términos vigentes (si no, no se manda el campo). */
  if (ctx.condicionesVersionId) {
    body.condiciones_version_id = ctx.condicionesVersionId;
    if (meta.ip) body.ip = String(meta.ip).slice(0, 64);
    if (meta.navegador) body.navegador = String(meta.navegador).slice(0, 500);
  }
  return body;
}

/* 400/422 = Previsión rechazó los datos. Los códigos idempotencia_* NO son un
   rechazo de los datos (conflicto de clave, clave inválida) y no deben
   disparar el reintento sin atribución. Todo lo demás (5xx, 401 de token,
   timeout, red) es una falla del sistema, no del comprador. */
/* Rechazos de negocio que el comprador resuelve en el wizard (no son por la
   atribución, así que no se reintenta sin ella). */
const CODIGOS_RESIDENCIA = ["residencia_requerida", "residencia_no_habilitada"];
const CODIGO_CONDICIONES = "condiciones_no_aceptadas";

function isValidationRejection(e) {
  return !!e && (e.status === 400 || e.status === 422) &&
    !String(e.codigo || "").startsWith("idempotencia_") &&
    !CODIGOS_RESIDENCIA.includes(e.codigo) && e.codigo !== CODIGO_CONDICIONES;
}

/* Idempotency-Key que manda el sitio (una por intento de checkout, reusada en
   cada reintento). Formato de la API: 1-255 ASCII visibles. Si no es válida se
   ignora (el checkout funciona igual, sin protección contra duplicados). */
function validIdempotencyKey(k) {
  return typeof k === "string" && /^[\x21-\x7E]{1,255}$/.test(k) ? k : null;
}

/* Mutable solo para que los tests no esperen de verdad. */
export const _compraTiming = { enProcesoWaitMs: 2000, retryWaitMs: 1000, budgetMs: 8000, maxRetryAfterMs: 3000 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* POST /compras con la clave de idempotencia. Con clave, los reintentos son
   seguros (Previsión devuelve la misma compra), así que:
     - 409 idempotencia_en_proceso → esperar Retry-After y reintentar (máx. 2).
     - 5xx o error de red → un reintento (si queda tiempo).
   Un timeout no se reintenta acá (ya se gastó el tiempo); el comprador puede
   reenviar y el sitio reusa la misma clave. Sin clave, un solo intento. */
async function crearCompraSegura(PF, body, key) {
  const t0 = Date.now();
  let enProceso = 0;
  let transitorios = 0;
  for (;;) {
    try {
      return await PF.crearCompra(body, { idempotencyKey: key || undefined });
    } catch (e) {
      const queda = Date.now() - t0 < _compraTiming.budgetMs;
      if (key && e.codigo === "idempotencia_en_proceso" && enProceso < 2 && queda) {
        enProceso++;
        await sleep(Math.min(e.retryAfterMs ?? _compraTiming.enProcesoWaitMs, 3000));
        continue;
      }
      const transitorio = (e.status >= 500) || (!e.status && !e.timeout);
      if (key && transitorio && transitorios < 1 && queda) {
        transitorios++;
        console.warn(`[wizard] crearCompra falla transitoria (${e.message}) — reintento con la misma Idempotency-Key`);
        /* Previsión manda Retry-After (2 s) en su 503 `sobrecarga`. */
        await sleep(Math.min(e.retryAfterMs ?? _compraTiming.retryWaitMs, _compraTiming.maxRetryAfterMs));
        continue;
      }
      throw e;
    }
  }
}

/* Mensaje propio de Previsión (por ejemplo, cliente inactivo: "mostrar tal
   cual" según su contrato). */
function pfMessage(e) {
  const b = e && e.body;
  const m = b && (b.mensaje || b.message || b.error);
  return typeof m === "string" && m.trim() ? m.trim().slice(0, 300) : null;
}

/* Resultado de error para el sitio. `code` le dice a index.js qué status
   devolver; el detalle técnico queda en el log, no en la respuesta. */
function compraFailure(e) {
  console.error(`[wizard] crearCompra falló: ${e.message}`);
  if (e && CODIGOS_RESIDENCIA.includes(e.codigo)) {
    const h = e.body && e.body.habilitados;
    return {
      success: false,
      code: "pf_residencia",
      reason: e.codigo,
      habilitados: h && typeof h === "object"
        ? { pais: h.pais || null, estados: Array.isArray(h.estados) ? h.estados : [] }
        : null,
      message: "Por ahora no podemos vender este plan en línea en tu estado de residencia.",
    };
  }
  if (e && e.codigo === CODIGO_CONDICIONES) {
    return {
      success: false,
      code: "pf_condiciones",
      message: "Los términos del plan se actualizaron. Revísalos y acéptalos de nuevo para continuar.",
    };
  }
  if (e && e.codigo === "idempotencia_requiere_revision") {
    /* Se cortó durante un cobro cuyo resultado no se conoce: nunca se
       repite solo, lo revisa el personal. */
    return {
      success: false,
      code: "pf_review",
      message: "Recibimos tu solicitud y nuestro equipo la está revisando. Te contactaremos pronto; no es necesario que la envíes de nuevo.",
    };
  }
  if (e && e.codigo === "idempotencia_en_proceso") {
    return {
      success: false,
      code: "pf_unavailable",
      message: "Tu solicitud todavía se está procesando. Espera un momento e intenta de nuevo.",
    };
  }
  if (e && e.codigo === "idempotencia_conflicto") {
    return {
      success: false,
      code: "pf_rejected",
      message: "Los datos de la compra cambiaron mientras se procesaba. Revisa la información e intenta de nuevo.",
    };
  }
  if (e && e.status === 409) {
    /* 409 sin código de idempotencia = cliente inactivo en la funeraria. */
    return {
      success: false,
      code: "pf_rejected",
      message: pfMessage(e) || "No pudimos procesar la compra. Por favor contacta a la funeraria.",
    };
  }
  if (isValidationRejection(e)) {
    return {
      success: false,
      code: "pf_rejected",
      message: "No pudimos procesar los datos de la compra. Revisa la información e intenta de nuevo.",
    };
  }
  return {
    success: false,
    code: "pf_unavailable",
    message: e && e.timeout
      ? "El sistema de pagos está tardando más de lo normal. Intenta de nuevo en unos minutos."
      : "El sistema de pagos no está disponible en este momento. Intenta de nuevo en unos minutos.",
  };
}

export async function processWizardCheckout(body, env, meta = {}) {
  const ctx = normalize(body);

  if (ctx.intent !== "create_payment_intent") {
    return {
      success: false,
      message: `Intent no reconocido: ${ctx.intent || "(vacío)"}`,
    };
  }

  const PF = createPF(env);
  const compraBody = buildCompraBody(ctx, env, meta);
  const key = validIdempotencyKey(body.idempotencyKey);
  console.log(
    `Wizard checkout start: plan=${ctx.planSlug} paymentType=${ctx.paymentType} frecuencia_pago=${ctx.frecuenciaPago} email=${maskEmail(ctx.buyer.email)} atribucion=${attributionTag(ctx.atribucion)} idem=${key ? "sí" : "no"} residencia=${ctx.residencia ? [ctx.residencia.pais, ctx.residencia.estado].filter(Boolean).join("-") : "-"} condiciones=${ctx.condicionesVersionId || "-"} idioma=${ctx.idioma} consentimientos=${ctx.consentimientos.map((c) => c.clave + ":" + (c.otorgado ? "sí" : "no")).join(",") || "-"}`,
  );

  let result;
  try {
    result = await crearCompraSegura(PF, compraBody, key);
  } catch (e) {
    /* La atribución NUNCA debe bloquear una venta: si Previsión RECHAZA el
       body por validación (400/422) y traía `atribucion`, reintentamos una
       vez sin ella. Un rechazo de validación libera la Idempotency-Key, así
       que el reintento puede usar la misma. Ante 5xx/timeout/red no se
       reintenta sin atribución (la venta no debe perder al vendedor). */
    if (!(compraBody.atribucion && isValidationRejection(e))) {
      return compraFailure(e);
    }
    console.warn(`[wizard] crearCompra rechazada con atribucion (${e.message}) — reintento sin atribucion (vendedor=${attributionTag(compraBody.atribucion)})`);
    const { atribucion, ...bodySinAtribucion } = compraBody;
    try {
      result = await crearCompraSegura(PF, bodySinAtribucion, key);
    } catch (e2) {
      return compraFailure(e2);
    }
  }
  console.log(`Compra creada: estado=${result.estado} id=${result.compra_pendiente_id}`);

  return {
    success: true,
    estado: result.estado,
    linkDeCobro: result.link_de_cobro || null,
    mensaje: result.mensaje || null,
    contratoNumero: result.contrato_numero || null,
  };
}

/* =============================================================================
   Prospecto desde el wizard (brief §4.1): el comprador vive en un estado donde
   todavía no se vende en línea. No se llega al pago; se registra una
   solicitud en Previsión (POST /solicitudes) para que un asesor lo contacte.
   ============================================================================= */
export async function processWizardLead(body, env) {
  const buyer = (body && body.buyer) || {};
  const nombres = sanitizeText(buyer.name, 60);
  const apellidos = sanitizeText(buyer.lastName, 60);
  const telefono = sanitizeText(buyer.phone, 20);
  const email = String(buyer.email || "").toLowerCase().trim().slice(0, 254);
  if (!nombres || !apellidos || !telefono) {
    throw new ValidationError("Nombre, apellido y teléfono son requeridos");
  }
  if (body.consent !== true) {
    throw new ValidationError("Falta el consentimiento para ser contactado");
  }
  const planId = Number(body.planId);
  if (!Number.isInteger(planId) || planId <= 0) throw new ValidationError("planId inválido o ausente");
  const residencia = normalizeResidencia(body.residencia);
  const idioma = body.lang === "en" ? "en" : "es";
  const donde = residencia ? [residencia.estado, residencia.pais].filter(Boolean).join(", ") : "sin indicar";
  const sol = {
    tipo: "plan",
    plan_id: planId,
    nombres,
    apellidos,
    telefono,
    mensaje: sanitizeText(
      `Quiso comprar en línea desde el wizard pero reside en ${donde}, donde todavía no se vende en línea. Idioma: ${idioma}.`,
      2000,
    ),
    consentimiento: { canal: "wizard_sitio", aceptado_en: new Date().toISOString() },
  };
  if (email) sol.email = email;
  const atribucion = sanitizeAttribution(body.attribution);
  if (atribucion) sol.atribucion = atribucion;
  console.log(`Wizard lead: plan_id=${planId} residencia=${donde} atribucion=${attributionTag(atribucion)}`);
  try {
    const resp = await createPF(env).crearSolicitud(sol);
    return { success: true, solicitudId: resp?.id ?? resp?.solicitud_id ?? null };
  } catch (e) {
    console.error(`[wizard] lead falló: ${e.message}`);
    const transient = !e.status || e.status === 429 || e.status >= 500;
    return {
      success: false,
      code: transient ? "pf_unavailable" : "pf_rejected",
      message: "No pudimos registrar tus datos en este momento. Intenta de nuevo en unos minutos.",
    };
  }
}
