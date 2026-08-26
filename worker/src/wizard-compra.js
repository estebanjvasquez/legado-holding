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
    /* La atribución NUNCA debe bloquear una venta. Si el bloque `atribucion`
       hiciera fallar la validación de la API (schema distinto al esperado),
       reintentamos una vez sin él — se pierde el tracking de ese vendedor,
       pero el checkout sigue. */
    if (compraBody.atribucion) {
      console.warn(`[wizard] crearCompra falló con atribucion (${e.message}) — reintento sin atribucion`);
      const { atribucion, ...bodySinAtribucion } = compraBody;
      result = await PF.crearCompra(bodySinAtribucion);
    } else {
      throw e;
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
