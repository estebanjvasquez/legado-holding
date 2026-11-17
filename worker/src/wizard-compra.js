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

function normalize(body) {
  const intent = (body.intent || "").toLowerCase();
  const planSlug = body.plan || null;
  const planId = Number(body.planId);
  const paymentType = (body.paymentType || "monthly").toLowerCase();
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
  };
}

function buildCompraBody(ctx, env) {
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
  return body;
}

/* 400/422 = Previsión rechazó los datos. Todo lo demás (5xx, 401 de token,
   timeout, red) es una falla del sistema, no del comprador. */
function isValidationRejection(e) {
  return e && (e.status === 400 || e.status === 422);
}

/* Resultado de error para el sitio. `code` le dice a index.js qué status
   devolver; el detalle técnico queda en el log, no en la respuesta. */
function compraFailure(e) {
  console.error(`[wizard] crearCompra falló: ${e.message}`);
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

export async function processWizardCheckout(body, env) {
  const ctx = normalize(body);

  if (ctx.intent !== "create_payment_intent") {
    return {
      success: false,
      message: `Intent no reconocido: ${ctx.intent || "(vacío)"}`,
    };
  }

  const PF = createPF(env);
  const compraBody = buildCompraBody(ctx, env);
  console.log(
    `Wizard checkout start: plan=${ctx.planSlug} email=${ctx.buyer.email} atribucion=${attributionTag(ctx.atribucion)}`,
  );

  let result;
  try {
    result = await PF.crearCompra(compraBody);
  } catch (e) {
    /* La atribución NUNCA debe bloquear una venta: si Previsión RECHAZA el
       body por validación (400/422) y traía `atribucion`, reintentamos una
       vez sin ella. Ante un 5xx, timeout o error de red NO se reintenta:
       antes sí, y una falla pasajera bastaba para que la venta quedara sin
       vendedor (y la primera compra podía haberse creado igual). */
    if (!(compraBody.atribucion && isValidationRejection(e))) {
      return compraFailure(e);
    }
    console.warn(`[wizard] crearCompra rechazada con atribucion (${e.message}) — reintento sin atribucion (vendedor=${attributionTag(compraBody.atribucion)})`);
    const { atribucion, ...bodySinAtribucion } = compraBody;
    try {
      result = await PF.crearCompra(bodySinAtribucion);
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
