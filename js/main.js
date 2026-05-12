/* =============================================================================
   LEGADO — js/main.js
   Core: config, i18n, plan data, API loading, rendering, navigation, init.
   wizard.js and chatbot.js are loaded after this file and rely on the globals
   defined here ($, $$, t, escapeHTML, PLANS, currentLang, etc.)
   ============================================================================= */

/* =============================================================================
   CONFIG
   ============================================================================= */
const CHAT_WEBHOOK_URL = "https://TU-N8N-WEBHOOK-URL/webhook/chat"; // ← CAMBIAR

const WIZARD_WEBHOOK_URL =
  (typeof window !== "undefined" && window.LEGADO_CONFIG?.WIZARD_WEBHOOK_URL) ||
  "https://vmi2945958.contaboserver.net/webhook/legado-payment";

/* Proxy n8n para catálogo de planes (evita CORS con Invoice Ninja) */
const PLANS_API_URL = "https://vmi2945958.contaboserver.net/webhook/List_Products";

/* =============================================================================
   i18n / LANG
   ============================================================================= */
const LANG = {
  /* ── Navegación ─────────────────────────────────────────────────────────── */
  nav_inicio:  ["Inicio", "Home"],
  nav_planes:  ["Planes", "Plans"],
  nav_como:    ["Cómo funciona", "How it works"],
  nav_contacto:["Contacto", "Contact"],
  nav_cta:     ["PROTEGE TU LEGADO", "PROTECT YOUR LEGACY"],

  /* ── Hero ────────────────────────────────────────────────────────────────── */
  hero_eyebrow: ["Previsión funeraria para venezolanos en USA", "Funeral pre-planning for Venezuelans in the USA"],
  hero_title1:  ["Sabemos lo que significa", "We know what it means"],
  hero_title2:  ["no poder estar presente", "not being able to be there"],
  hero_sub1: [
    "Si eres venezolano y dejaste familia en tu país, este espacio es para ti. Contrata hoy tu plan de previsión funeraria directamente, sin intermediarios, sin tasas confusas, sin variaciones en el precio. Domicilia tu pago en USA en tu tarjeta de crédito.",
    "If you're Venezuelan and left family behind, this space is for you. Enroll today in your funeral pre-planning plan directly, no middlemen, no confusing fees, no price changes. Charge to your US credit card.",
  ],
  hero_tagline: ['"Uniendo familias, honrando vidas, preservando memorias"', '"Uniting families, honoring lives, preserving memories"'],
  hero_cta:  ["PROTEGE TU LEGADO AQUÍ", "PROTECT YOUR LEGACY HERE"],
  badge1:    ["Sin intermediarios", "No middlemen"],
  badge2:    ["Pago en USA con tarjeta", "Pay in USA by card"],
  badge3:    ["Sin variaciones de precio", "No price changes"],

  /* ── Trust bar ────────────────────────────────────────────────────────────── */
  trust1: ["Respaldo de Funeraria del Zulia", "Backed by Funeraria del Zulia"],
  trust2: ["80+ años de trayectoria", "80+ years of experience"],
  trust3: ["Pago en USA con tarjeta de crédito", "Pay in USA with credit card"],
  trust4: ["Precio fijo, sin variaciones", "Fixed price, no variations"],

  /* ── Protege ─────────────────────────────────────────────────────────────── */
  protege_h2: ["Protege a tu familia en Venezuela aunque estés lejos", "Protect your family in Venezuela even from far away"],
  protege_p1: [
    "Sabemos lo que significa no poder estar presente en los momentos más difíciles para la familia que dejaste en Venezuela: DUELE DOBLE, porque duele la pérdida y duele la distancia.",
    "We know what it means not to be present in the most difficult moments for the family you left in Venezuela: IT HURTS DOUBLE, because you feel the loss and the distance.",
  ],
  protege_p2: [
    "Legado Holding es un grupo de empresas con trayectoria comprobada en servicios funerarios en Venezuela, más de 80 años de experiencia, que nace para atender a la comunidad venezolana en Estados Unidos.",
    "Legado Holding is a group of companies with proven experience in funeral services in Venezuela — over 80 years of experience — created to serve the Venezuelan community in the United States.",
  ],
  protege_p3: [
    "Nos ocupamos de la atención personalizada a familiares que quedaron en nuestro territorio nacional. Contrata desde tu teléfono móvil, directamente, con la tranquilidad que tú necesitas.",
    "We take care of personalized attention for family members who remained in our country. Enroll from your mobile phone, directly, with the peace of mind you need.",
  ],
  protege_link: ["Ver nuestros planes", "See our plans"],

  /* ── Planes ──────────────────────────────────────────────────────────────── */
  plans_title1:   ["Con LEGADO, la tranquilidad en los momentos", "With LEGADO, peace of mind in the most"],
  plans_title2:   ["más difíciles toma otra dimensión", "difficult moments takes on a new dimension"],
  plans_sub:      ["Total, confiable y al alcance de todos. Titular y hasta 6 familiares, edad máxima 65 años.", "Total, reliable, and within everyone's reach. Policyholder and up to 6 family members, max age 65."],
  region_zulia:   ["Región Zulia", "Zulia Region"],
  region_ven:     ["Toda Venezuela", "All Venezuela"],
  region_selecto: ["Toda Venezuela — Grupo Selecto", "All Venezuela — Select Group"],
  plan_recommended: ["RECOMENDADO", "RECOMMENDED"],
  plan_mo:  ["/mes", "/mo"],
  plan_yr:  ["/año", "/yr"],
  plan_or:  ["o", "or"],
  plan_buy: ["Comprar", "Buy Now"],
  plan_details: ["Ver componentes", "View components"],

  /* Nombres de planes */
  "plan_esencial-zulia_name":    ["Plan Esencial Zulia",         "Essential Zulia Plan"],
  "plan_vanguardia-zulia_name":  ["Plan Vanguardia Zulia",       "Vanguard Zulia Plan"],
  "plan_esencial-ven_name":      ["Plan Esencial Venezuela",     "Essential Venezuela Plan"],
  "plan_vanguardia-ven_name":    ["Plan Vanguardia Venezuela",   "Vanguard Venezuela Plan"],
  "plan_esencial-selecto_name":  ["Plan Esencial Grupo Selecto", "Essential Select Group Plan"],
  "plan_vanguardia-selecto_name":["Plan Vanguardia Grupo Selecto","Vanguard Select Group Plan"],

  /* ── Cómo funciona ───────────────────────────────────────────────────────── */
  how_title: ["Cómo funciona", "How it works"],
  how_sub:   ["Contratación 100% digital en solo 4 pasos", "100% digital enrollment in just 4 steps"],
  step_word: ["PASO", "STEP"],
  step1_title: ["Elige tu plan",        "Choose your plan"],
  step1_desc:  ["Selecciona la cobertura que mejor se adapte a tu familia.", "Select the coverage that best fits your family."],
  step2_title: ["Completa tus datos",   "Complete your info"],
  step2_desc:  ["Ingresa los datos del comprador y de las personas a cubrir.", "Enter buyer and covered persons information."],
  step3_title: ["Acepta y paga",        "Accept & pay"],
  step3_desc:  ["Revisa el contrato, acepta términos y realiza tu pago seguro.", "Review the contract, accept terms, and make a secure payment."],
  step4_title: ["Tu familia protegida", "Your family protected"],
  step4_desc:  ["Recibe confirmación y accede a tu portal de cliente.", "Receive confirmation and access your client portal."],

  /* ── Storytelling ────────────────────────────────────────────────────────── */
  story_eyebrow: ["Nuestra historia", "Our story"],
  story_title: ["La distancia no debería impedir cuidar a quienes más amas", "Distance shouldn't prevent you from caring for those you love most"],
  story_p1: [
    "En nuestras empresas, nuestra misión es escuchar cada planteamiento de los clientes. Cada paso que damos viene de propuestas de familias que hemos atendido durante casi 85 años y que hoy viven en USA, al igual que tú.",
    "In our companies, our mission is to listen to every concern our clients raise. Every step we take comes from proposals by families we've served for nearly 85 years who now live in the USA, just like you.",
  ],
  story_p2: [
    "Es por eso que hemos creado el GRUPO SELECTO: para dar respuesta a los cambios en la prestación de servicios funerarios que nuestros clientes han pedido. Ahora puedes optar por una bóveda en parcelas en cementerio privado — una innovación en toda Venezuela, disponible primero para nuestros clientes en USA.",
    "That's why we created the SELECT GROUP: to respond to changes in funeral service delivery that our clients have requested. You can now choose a vault in private cemetery parcels — an innovation across all of Venezuela, available first to our US clients.",
  ],
  story_quote: ['"Uniendo familias, honrando vidas, preservando memorias"', '"Uniting families, honoring lives, preserving memories"'],

  /* ── Testimonios ─────────────────────────────────────────────────────────── */
  test_title1: ["Familias que ya",    "Families who already"],
  test_title2: ["protegen su legado", "protect their legacy"],
  test1_text:  ["Desde que contraté Legado, duermo tranquila. Sé que si algo pasa con mi mamá en Maracaibo, todo estará cubierto.", "Since I hired Legado, I sleep peacefully. I know if something happens to my mom in Maracaibo, everything will be covered."],
  test2_text:  ["Cuando mi padre falleció, Legado se encargó de todo. Yo estaba aquí sin poder viajar, pero sabía que mi familia estaba acompañada.", "When my father passed, Legado took care of everything. I was here unable to travel, but I knew my family was supported."],
  test3_text:  ["El proceso fue súper fácil. En minutos tenía todo configurado desde mi teléfono. Ahora mis abuelos están protegidos.", "The process was super easy. In minutes I had everything set up from my phone. Now my grandparents are protected."],

  /* ── Contacto ────────────────────────────────────────────────────────────── */
  contact_title1:  ["¿Tienes preguntas?", "Have questions?"],
  contact_title2:  ["Estamos aquí",       "We're here"],
  contact_sub:     ["Nuestro equipo te acompaña en cada paso.", "Our team walks with you every step."],
  contact_phone:   ["Teléfono", "Phone"],
  contact_coverage:["Cobertura", "Coverage"],
  contact_all_vzla:["Toda Venezuela", "All Venezuela"],

  /* ── CTA final ───────────────────────────────────────────────────────────── */
  cta_title: ["Esta innovación es simple: tú decides cómo despedirte", "This innovation is simple: you decide how to say goodbye"],
  cta_sub:   ["Sin cambios en tu cuota mensual. Solo haz click en el plan que más te convenga, realiza el pago de la inicial anual, y amplía tus servicios siendo tú quien decide. Titular + 6 familiares hasta 65 años.", "No changes to your monthly fee. Just click on the plan that suits you best, make the annual initial payment, and expand your services — you decide. Policyholder + 6 family members up to age 65."],
  cta_call:  ["Llámanos", "Call us"],

  /* ── Footer ──────────────────────────────────────────────────────────────── */
  footer_tagline: ["Uniendo familias, honrando vidas, preservando memorias.", "Uniting families, honoring lives, preserving memories."],
  footer_follow:  ["Síguenos",    "Follow us"],
  footer_terms:   ["Términos y condiciones", "Terms & conditions"],
  footer_privacy: ["Política de privacidad", "Privacy policy"],
  footer_support: ["Soporte",     "Support"],
  footer_rights:  ["Todos los derechos reservados.", "All rights reserved."],

  /* ── Emergencia ──────────────────────────────────────────────────────────── */
  emergency: ["EMERGENCIA", "EMERGENCY"],

  /* ── Chatbot ─────────────────────────────────────────────────────────────── */
  chat_title:     ["Asistente LEGADO",     "LEGADO Assistant"],
  chat_emergency: ["Asistencia de Emergencia", "Emergency Assistance"],
  chat_greeting:  ["¡Hola! Soy el asistente de LEGADO. ¿En qué puedo ayudarte con tu plan?", "Hi! I'm the LEGADO assistant. How can I help you with your plan?"],
  chat_greeting_emergency: ["Lamento mucho que estés pasando por este momento. Estoy aquí para ayudarte. ¿Puedes contarme qué sucedió?", "I'm so sorry you're going through this. I'm here to help. Can you tell me what happened?"],
  chat_placeholder:    ["Escribe tu pregunta...", "Type your question..."],
  chat_ph_emergency:   ["Escribe aquí tu situación...", "Describe your situation..."],
  chat_error:          ["Lo siento, no pude conectarme. Por favor intenta de nuevo.", "Sorry, I couldn't connect. Please try again."],
  chat_error_emergency:["Lo siento, hubo un error de conexión. Por favor intenta de nuevo o llámanos directamente.", "Sorry, there was a connection error. Please try again or call us directly."],

  /* ── Wizard ──────────────────────────────────────────────────────────────── */
  wiz_title:        ["Compra tu plan",    "Buy your plan"],
  wiz_step_data:    ["Datos",   "Info"],
  wiz_step_family:  ["Familia", "Family"],
  wiz_step_plan:    ["Plan",    "Plan"],
  wiz_step_summary: ["Resumen", "Summary"],
  wiz_back:         ["Atrás",   "Back"],
  wiz_next:         ["Siguiente", "Next"],
  wiz_confirm:      ["Confirmar y Pagar", "Confirm & Pay"],
  wiz_fname:        ["Nombre",   "First name"],
  wiz_lname:        ["Apellido", "Last name"],
  wiz_cedula:       ["Cédula",   "ID Number"],
  wiz_phone:        ["Teléfono", "Phone"],
  wiz_birth:        ["Fecha de nacimiento", "Date of birth"],
  wiz_age_err:      ["La edad máxima permitida para este plan es 65 años (padres hasta 80 años en Plan Vanguardia Zulia)", "Maximum allowed age for this plan is 65 years (parents up to 80 in Vanguard Zulia Plan)"],
  wiz_family_hint:  ["Agrega los familiares que deseas cubrir (máximo 6)", "Add family members to cover (max 6)"],
  wiz_member:       ["Familiar",    "Family member"],
  wiz_relation:     ["Parentesco",  "Relationship"],
  wiz_relation_ph:  ["Ej: Madre",   "E.g.: Mother"],
  wiz_age_err_short:["Máximo 65 años", "Max 65 years"],
  wiz_add_family:   ["Agregar familiar", "Add family member"],
  wiz_select_payment:["Selecciona tu forma de pago", "Select your payment method"],
  wiz_monthly_title: ["Suscripción mensual", "Monthly subscription"],
  wiz_monthly_sub:   ["Suscripción mensual", "Monthly subscription"],
  wiz_annual_title:  ["Pago anual",  "Annual payment"],
  wiz_annual_sub:    ["¡Ahorra 2 meses!", "Save 2 months!"],
  wiz_summary_title: ["Resumen de compra",  "Purchase summary"],
  wiz_sum_billing:   ["Modalidad",   "Billing mode"],
  wiz_sum_method:    ["Método de pago", "Payment method"],
  wiz_sum_plan:      ["Plan",        "Plan"],
  wiz_sum_payment:   ["Pago",        "Payment"],
  wiz_sum_buyer:     ["Comprador",   "Buyer"],
  wiz_sum_members:   ["Familiares",  "Family members"],
  wiz_contract_title:["Contrato de servicio", "Service contract"],
  wiz_contract_chk:  ["Acepto los términos y condiciones del servicio", "I accept the service terms and conditions"],
  wiz_contract_p0:   ["TÉRMINOS Y CONDICIONES DEL SERVICIO DE PREVISIÓN FUNERARIA LEGADO", "LEGADO FUNERAL PRE-PLANNING SERVICE TERMS AND CONDITIONS"],
  wiz_contract_p1:   ["El presente contrato establece los términos y condiciones bajo los cuales Legado provee servicios de previsión funeraria para familias venezolanas. Al aceptar estos términos, el contratante acepta las condiciones de servicio, cobertura y pago aquí descritas.", "This contract establishes the terms and conditions under which Legado provides funeral pre-planning services for Venezuelan families."],
  wiz_contract_p2:   ["1. COBERTURA: El servicio incluye los beneficios especificados en el plan seleccionado. La cobertura aplica exclusivamente en el territorio de Venezuela según el plan contratado.", "1. COVERAGE: The service includes the benefits specified in the selected plan. Coverage applies exclusively within Venezuelan territory."],
  wiz_contract_p3:   ["2. PAGOS: Los pagos deben realizarse de forma puntual según la modalidad seleccionada (mensual o anual). El incumplimiento de pago por más de 30 días resultará en la suspensión del servicio.", "2. PAYMENTS: Payments must be made promptly. Payment default for more than 30 days will result in service suspension."],
  wiz_contract_p4:   ["3. CANCELACIÓN: El contratante puede cancelar el servicio en cualquier momento con 30 días de anticipación.", "3. CANCELLATION: The contractor may cancel the service at any time with 30 days notice."],

  /* ── Toast ───────────────────────────────────────────────────────────────── */
  toast_confirm: ["¡Solicitud enviada! Nos pondremos en contacto pronto.", "Request submitted! We'll get in touch soon."],
};

/* =============================================================================
   PLANS — fallback data (overwritten by API on load)
   ============================================================================= */
let PLANS = {
  "esencial-zulia": {
    monthly: "$9,47",
    annual:  "$94,7",
    mo_save: "$19",
    maxAge:  65,
  },
  "vanguardia-zulia": {
    monthly: "$14,7",
    annual:  "$147",
    mo_save: "$29,4",
    maxAge:  80,
  },
  "esencial-selecto": {
    monthly: "$9,47",
    annual:  "$202",
    mo_save: "$",
    initial: "$35",
    maxAge:  65,
  },
  "vanguardia-selecto": {
    monthly: "$14,7",
    annual:  "$129,7",
    mo_save: "$",
    initial: "$55",
    maxAge:  65,
  },
};

const PLAN_FEATURES = {
  "esencial-zulia": {
    es: [
      "Ataúd incluido",
      "Traslado lugar fallecimiento → funeraria → cementerio",
      "Tanatopraxia básica (conservación del cuerpo)",
      "Sala velatoria 24h o equipo a domicilio — Funeraria del Zulia",
      "Carroza fúnebre al cementerio",
      "Servicio de cafetería en funeraria",
      "Asesoría gratuita en trámites administrativos",
      "Cremación en Crematorio del Zulia",
      "6 miembros de tu familia en el Zulia (máx. 65 años)",
    ],
    en: [
      "Casket included",
      "Transfer from place of death → funeral home → cemetery",
      "Basic thanatopraxia (body preservation)",
      "24h wake room or home service — Funeraria del Zulia",
      "Hearse to cemetery",
      "Catering service at funeral home",
      "Free administrative assistance",
      "Cremation at Crematorio del Zulia",
      "6 family members in Zulia region (max. age 65)",
    ],
  },
  "vanguardia-zulia": {
    es: [
      "Todo lo incluido en Plan Esencial Zulia",
      "Servicio funerario completo en Funeraria del Zulia",
      "Oficios religiosos",
      "Un arreglo de flores naturales",
      "Cremación O bóveda aérea O gastos de inhumación en cementerio",
      "6 miembros de tu familia (padres hasta 80 años)",
      "Asesoría gratuita en trámites administrativos",
    ],
    en: [
      "Everything in Essential Zulia Plan",
      "Complete funeral service at Funeraria del Zulia",
      "Religious services",
      "One natural flower arrangement",
      "Cremation OR aerial vault OR cemetery burial expenses",
      "6 family members (parents up to age 80)",
      "Free administrative assistance",
    ],
  },
  "esencial-ven": {
    es: [
      "Cobertura en toda Venezuela",
      "Traslado entre estados incluido",
      "Ataúd incluido",
      "Sala velatoria 24h en funeraria aliada",
      "Cremación incluida",
      "Asesoría gratuita en trámites administrativos",
      "Titular + 6 familiares hasta 65 años",
    ],
    en: [
      "Coverage across all Venezuela",
      "Inter-state transfer included",
      "Casket included",
      "24h wake room at allied funeral home",
      "Cremation included",
      "Free administrative assistance",
      "Policyholder + 6 family members up to age 65",
    ],
  },
  "vanguardia-ven": {
    es: [
      "Todo lo incluido en Plan Esencial Venezuela",
      "Tú eliges todos los componentes del servicio",
      "Sala velatoria, arreglos florales a tu elección",
      "Ataúd sin limitantes según tu elección",
      "Cremación O bóveda en cementerio privado",
      "Sin cobros extra por sobrepeso o marcapasos",
      "Titular + 6 familiares hasta 65 años",
    ],
    en: [
      "Everything in Essential Venezuela Plan",
      "You choose all service components",
      "Wake room, floral arrangements of your choice",
      "Casket without restrictions per your choice",
      "Cremation OR vault in private cemetery",
      "No extra charges for overweight or pacemaker removal",
      "Policyholder + 6 family members up to age 65",
    ],
  },
  "esencial-selecto": {
    es: [
      "Cuota inicial de $35 + $9,47/mes (misma mensualidad)",
      "Cobertura extendida a TODA VENEZUELA",
      "Traslado entre estados incluido",
      "Tú eliges todos los componentes del servicio en la funeraria aliada",
      "Sala velatoria, arreglos florales y corona adicional a tu elección",
      "Ataúd sin limitantes según tu elección",
      "Sin cobros extra por sobrepeso o extracción de marcapasos",
      "Cremación incluida",
      "Titular + 6 familiares hasta 65 años en toda Venezuela",
    ],
    en: [
      "Initial fee $35 + $9.47/month (same monthly rate)",
      "Coverage extended to ALL VENEZUELA",
      "Inter-state transfer included",
      "You choose all service components at the allied funeral home",
      "Wake room, floral arrangements and extra wreath of your choice",
      "Casket without restrictions per your choice",
      "No extra charges for overweight or pacemaker removal",
      "Cremation included",
      "Policyholder + 6 family members up to age 65, all Venezuela",
    ],
  },
  "vanguardia-selecto": {
    es: [
      "Cuota inicial de $55 + $14,7/mes (misma mensualidad)",
      "El plan más amplio — EXCLUSIVO EN TODA VENEZUELA",
      "Cobertura extendida a TODA VENEZUELA + traslado entre estados",
      "Tú eliges: cremación O bóveda en cementerio privado",
      "Todos los componentes del funeral a tu elección",
      "Sin cobros extra por sobrepeso — Crematorio del Zulia",
      "No hay cobros extras por extracción de marcapasos",
      "Titular + 6 familiares hasta 65 años",
      "Innovación exclusiva: bóveda en parcelas cementerio privado",
    ],
    en: [
      "Initial fee $55 + $14.70/month (same monthly rate)",
      "Most comprehensive plan — EXCLUSIVE IN ALL VENEZUELA",
      "Coverage across ALL VENEZUELA + inter-state transfer",
      "You choose: cremation OR vault in private cemetery",
      "All funeral components of your choice",
      "No extra charges for overweight — Crematorio del Zulia",
      "No extra charges for pacemaker removal",
      "Policyholder + 6 family members up to age 65",
      "Exclusive innovation: vault in private cemetery parcels",
    ],
  },
};

let PLAN_GROUPS = [
  { region_key: "region_zulia",   plans: ["esencial-zulia",   "vanguardia-zulia"]   },
  { region_key: "region_selecto", plans: ["esencial-selecto", "vanguardia-selecto"] },
];

let HIGHLIGHTED = new Set(["vanguardia-zulia", "vanguardia-selecto"]);

const PLAN_SUBTITLE = {
  "esencial-zulia":    { es: "Funeral + cremación · Funeraria del Zulia · Regional Zulia",                        en: "Funeral + cremation · Funeraria del Zulia · Zulia Region" },
  "vanguardia-zulia":  { es: "Lo mejor de nuestros planes · Padres hasta 80 años · Funeraria del Zulia",          en: "Best of our plans · Parents up to 80 years · Funeraria del Zulia" },
  "esencial-ven":      { es: "Cobertura toda Venezuela · Cremación incluida · Titular + 6 familiares",             en: "All Venezuela coverage · Cremation included · Holder + 6 members" },
  "vanguardia-ven":    { es: "Toda Venezuela · Tú eliges: cremación o bóveda privada · El más completo",          en: "All Venezuela · You choose: cremation or private vault · Most comprehensive" },
  "esencial-selecto":  { es: "Todo Venezuela · Tú eliges los componentes · Cremación incluida",                    en: "All Venezuela · You choose the components · Cremation included" },
  "vanguardia-selecto":{ es: "El más completo · Exclusivo Venezuela · Tú eliges: cremación o bóveda privada",     en: "Most comprehensive · Exclusive Venezuela · You choose: cremation or private vault" },
};

/* =============================================================================
   PLANS API — load from Invoice Ninja via n8n proxy
   ============================================================================= */
function formatPrice(num) {
  const n = Math.round(num * 100) / 100;
  const s = n.toFixed(2).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return "$" + s.replace(".", ",");
}

function extractMaxAge(notes) {
  if (/max\s*80|80\s*a[ñn]os?/i.test(notes)) return 80;
  const m = /edad\s*m[aá]x[a-z]*\s*(?:de\s*contrat[a-z]*)?\s*(\d+)/i.exec(notes);
  if (m) return parseInt(m[1], 10);
  return 65;
}

/* Fallback family inference from product_key when custom_value3 is empty */
function getPlanFamily(productKey) {
  const u = (productKey || "").toUpperCase();
  if (u.includes("SELECTO") || u.includes("SELEC")) {
    if (u.includes("ESENCIAL")) return "esencial-selecto";
    if (u.includes("VANGUARDIA")) return "vanguardia-selecto";
    return "esencial-selecto";
  }
  if (u.includes("VEN") && !u.includes("ZULIA")) {
    if (u.includes("ESENCIAL"))   return "esencial-ven";
    if (u.includes("VANGUARDIA")) return "vanguardia-ven";
  }
  if (u.includes("ESENCIAL"))   return "esencial-zulia";
  if (u.includes("VANGUARDIA")) return "vanguardia-zulia";
  return (productKey || "unknown").toLowerCase().replace(/^plan\s+/i, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function loadPlansFromAPI() {
  try {
    const resp = await fetch(PLANS_API_URL);
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const raw = await resp.json();

    /* n8n proxy returns an array or { data: [...] } */
    const list = Array.isArray(raw) ? raw : (raw.data || []);

    /* The n8n proxy already filters by custom_value1=legadoweb server-side.
       We only exclude soft-deleted products here. */
    const products = list.filter((p) => !p.is_deleted);
    if (products.length === 0) return;

    /* Group by plan family (custom_value3 explicit slug, or inferred from product_key).
       monthly slot: custom_value2 === "mensual" | "monthly"
       annual slot:  everything else (annualy, annual, unico, etc.) */
    const grouped = {};
    products.forEach((p) => {
      const family = (p.custom_value3 && p.custom_value3.trim()) || getPlanFamily(p.product_key);
      if (!grouped[family]) grouped[family] = {};

      const cv2 = (p.custom_value2 || "").toLowerCase().trim();
      const isMonthly = cv2 === "mensual" || cv2 === "monthly";

      const slot = isMonthly ? "monthly" : "annual";
      if (grouped[family][slot]) {
        console.warn(`LEGADO: duplicate ${slot} product in family "${family}" — keeping first (${grouped[family][slot].product_key}), skipping: ${p.product_key}`);
      } else {
        grouped[family][slot] = p;
      }

      console.log(`LEGADO API: product "${p.product_key}" → family "${family}" slot "${slot}" (cv2="${p.custom_value2}", cv3="${p.custom_value3}")`);
    });

    /* Build PLANS object from grouped data */
    const newPlans = {};
    Object.entries(grouped).forEach(([slug, { monthly, annual }]) => {
      if (!monthly && !annual) return;
      const anchor       = monthly || annual;
      const monthlyPrice = monthly ? monthly.price : null;
      const annualPrice  = annual  ? annual.price  : null;

      newPlans[slug] = {
        monthly:    monthlyPrice !== null ? formatPrice(monthlyPrice) : null,
        annual:     annualPrice  !== null ? formatPrice(annualPrice)  : null,
        mo_save:    monthlyPrice !== null ? formatPrice(monthlyPrice * 2) : null,
        maxAge:     extractMaxAge(anchor.notes || ""),
        id_monthly: monthly ? monthly.id : null,
        id_annual:  annual  ? annual.id  : null,
      };
    });

    if (Object.keys(newPlans).length === 0) return;

    PLANS = newPlans;

    /* Rebuild PLAN_GROUPS dynamically from the families present in the API response */
    const FAMILY_REGION = {
      "esencial-zulia":    "region_zulia",
      "vanguardia-zulia":  "region_zulia",
      "esencial-ven":      "region_ven",
      "vanguardia-ven":    "region_ven",
      "esencial-selecto":  "region_selecto",
      "vanguardia-selecto":"region_selecto",
    };
    const REGION_ORDER = ["region_zulia", "region_ven", "region_selecto"];
    const SLUG_ORDER   = [
      "esencial-zulia", "vanguardia-zulia",
      "esencial-ven",   "vanguardia-ven",
      "esencial-selecto", "vanguardia-selecto",
    ];

    const regionMap = {};
    Object.keys(newPlans).forEach((slug) => {
      const r = FAMILY_REGION[slug] || "region_otros";
      if (!regionMap[r]) regionMap[r] = [];
      regionMap[r].push(slug);
    });

    PLAN_GROUPS = REGION_ORDER
      .filter((r) => regionMap[r])
      .map((r) => ({
        region_key: r,
        plans: regionMap[r].sort((a, b) => SLUG_ORDER.indexOf(a) - SLUG_ORDER.indexOf(b)),
      }));

    HIGHLIGHTED = new Set(Object.keys(newPlans).filter((id) => id.startsWith("vanguardia")));

    renderPlans();
    console.log("LEGADO: planes actualizados desde API ✓", Object.keys(newPlans), "| grupos:", PLAN_GROUPS.map(g => g.region_key + ":" + g.plans.join(",")));
  } catch (e) {
    console.warn("LEGADO: Plan API no disponible, usando datos de respaldo:", e.message);
  }
}

/* =============================================================================
   STATE
   ============================================================================= */
let currentLang = "es";
let wizardOpen  = false; // declared here so toggleLang / applyLanguage can read it;
                         // wizard.js sets it to true/false via openWizard / closeWizard

/* =============================================================================
   HELPERS
   ============================================================================= */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function generateSessionId() {
  return "sess_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function simpleMarkdown(text) {
  return escapeHTML(text)
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`(.*?)`/g, "<code>$1</code>")
    .replace(/\n/g, "<br>");
}

function checkIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
}

function t(key) {
  const pair = LANG[key];
  if (!pair) { console.warn("i18n missing key:", key); return key; }
  return currentLang === "es" ? pair[0] : pair[1];
}

/* =============================================================================
   LANGUAGE
   ============================================================================= */
function applyLanguage() {
  $$("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const txt = t(key);
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      el.placeholder = txt;
    } else {
      el.textContent = txt;
    }
  });

  $$("[data-i18n-lang]").forEach((el) => {
    el.textContent = currentLang === "es" ? "EN" : "ES";
  });

  renderPlans();
  renderSteps();
  renderTestimonials();

  /* Notify wizard.js to re-render the family step if it's open */
  if (typeof renderWizardFamilyStep === "function") renderWizardFamilyStep();
}

function toggleLang() {
  currentLang = currentLang === "es" ? "en" : "es";
  document.documentElement.lang = currentLang;
  applyLanguage();
  if (wizardOpen && typeof renderWizardContent === "function") renderWizardContent();

  const overlay = $("#chatbot-overlay");
  if (overlay && !overlay.classList.contains("hidden")) {
    const greetBubble = $("#chat-messages .chat-greeting .chat-bubble");
    if (greetBubble && typeof chatMessages !== "undefined" && chatMessages.length === 0) {
      greetBubble.textContent =
        (typeof chatMode !== "undefined" && chatMode === "emergency")
          ? t("chat_greeting_emergency")
          : t("chat_greeting");
    }
  }
}

/* =============================================================================
   NAVIGATION
   ============================================================================= */
function initNav() {
  const toggle     = $("#nav-mobile-toggle");
  const mobileMenu = $("#nav-mobile-menu");
  const nav        = $("#main-nav");

  toggle?.addEventListener("click", () => {
    mobileMenu.classList.toggle("open");
    const icon = toggle.querySelector("svg");
    if (mobileMenu.classList.contains("open")) {
      icon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>`;
    } else {
      icon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>`;
    }
  });

  $$(".mobile-nav-link").forEach((a) =>
    a.addEventListener("click", () => mobileMenu.classList.remove("open")),
  );

  window.addEventListener("scroll", () => {
    nav.classList.toggle("scrolled", window.scrollY > 20);
  }, { passive: true });
}

/* =============================================================================
   REVEAL — scroll animations
   ============================================================================= */
let revealObserver = null;

function initReveal() {
  revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("visible");
          revealObserver.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12 },
  );
  $$(".reveal").forEach((el) => revealObserver.observe(el));
}

function reObserveReveals() {
  $$(".reveal:not(.visible)").forEach((el) => revealObserver?.observe(el));
}

/* =============================================================================
   PLANS RENDER
   ============================================================================= */
function renderPlans() {
  const container = $("#plans-container");
  if (!container) return;
  container.innerHTML = "";

  PLAN_GROUPS.forEach((group) => {
    const groupDiv = document.createElement("div");
    groupDiv.className = "plans-group";

    const label = document.createElement("div");
    label.className = "plans-region-label reveal";
    label.textContent = t(group.region_key);
    groupDiv.appendChild(label);

    const grid = document.createElement("div");
    grid.className = "plans-grid";

    group.plans.forEach((planId, i) => {
      const plan          = PLANS[planId];
      if (!plan) return;
      const featuresEntry = PLAN_FEATURES[planId] || { es: [], en: [] };
      const features      = featuresEntry[currentLang] || [];
      const name          = t(`plan_${planId}_name`);
      const subtitle      = (PLAN_SUBTITLE[planId] || {})[currentLang] || "";
      const highlighted   = HIGHLIGHTED.has(planId);
      const isSelecto     = plan.initial !== undefined;

      let priceHTML = "";
      let subPriceHTML = "";

      if (isSelecto) {
        priceHTML    = plan.monthly ? `<div class="plan-price-monthly">${plan.monthly}<span>${t("plan_mo")}</span></div>` : "";
        subPriceHTML = `<p class="plan-price-annual plan-price-initial">
          ${currentLang === "es" ? "Cuota inicial" : "Initial fee"}: <strong>${plan.initial}</strong> +
          ${currentLang === "es" ? "pago contado" : "lump sum"}: ${plan.annual}${t("plan_yr")}
        </p>`;
      } else {
        priceHTML = plan.monthly
          ? `<div class="plan-price-monthly">${plan.monthly}<span>${t("plan_mo")}</span></div>`
          : (plan.annual ? `<div class="plan-price-monthly">${plan.annual}<span>${t("plan_yr")}</span></div>` : "");
        subPriceHTML = plan.monthly && plan.annual
          ? `<p class="plan-price-annual">${currentLang === "es" ? "Oferta lanzamiento" : "Launch offer"}: <strong>${plan.annual}${t("plan_yr")}</strong></p>`
          : "";
      }

      const card = document.createElement("div");
      card.className = `plan-card${highlighted ? " highlighted" : ""} reveal reveal-delay-${i + 1}`;
      card.innerHTML = `
        ${highlighted ? `<div class="plan-badge">
          <svg fill="currentColor" viewBox="0 0 20 20" width="12" height="12">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
          </svg>${t("plan_recommended")}</div>` : ""}
        <h4 class="plan-name">${name}</h4>
        <p class="plan-subtitle">${subtitle}</p>
        ${priceHTML}
        ${subPriceHTML}
        <ul class="plan-features">
          ${features.map((f) => `<li>${checkIcon()}${f}</li>`).join("")}
        </ul>
        <button class="btn-gold plan-btn-primary" data-plan="${planId}">${t("plan_buy")}</button>
        <button class="plan-btn-secondary">${t("plan_details")}</button>
      `;
      grid.appendChild(card);
    });

    groupDiv.appendChild(grid);
    container.appendChild(groupDiv);
  });

  reObserveReveals();
}

/* =============================================================================
   STEPS RENDER
   ============================================================================= */
const STEP_ICONS = [
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>`,
];

function renderSteps() {
  const container = $("#steps-container");
  if (!container) return;
  container.innerHTML = "";
  ["step1", "step2", "step3", "step4"].forEach((s, i) => {
    const div = document.createElement("div");
    div.className = `step-item reveal reveal-delay-${i + 1}`;
    div.innerHTML = `
      <div class="step-icon">${STEP_ICONS[i]}</div>
      <div class="step-number">${t("step_word")} ${i + 1}</div>
      <h4 class="step-title">${t(`${s}_title`)}</h4>
      <p class="step-desc">${t(`${s}_desc`)}</p>
    `;
    container.appendChild(div);
  });
}

/* =============================================================================
   TESTIMONIALS RENDER
   ============================================================================= */
function renderTestimonials() {
  const container = $("#testimonials-container");
  if (!container) return;
  const tests = [
    { key: "test1_text", name: "María G.",  loc: "Miami, FL"      },
    { key: "test2_text", name: "Carlos R.", loc: "Houston, TX"     },
    { key: "test3_text", name: "Ana P.",    loc: "New York, NY"    },
  ];
  container.innerHTML = tests.map((td, i) => `
    <div class="testimonial-card reveal reveal-delay-${i + 1}">
      <div class="testimonial-quote-icon">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z"/></svg>
      </div>
      <p class="testimonial-text">"${t(td.key)}"</p>
      <p class="testimonial-name">${td.name}</p>
      <p class="testimonial-location">${td.loc}</p>
    </div>
  `).join("");
}

/* =============================================================================
   TOAST
   ============================================================================= */
function showToast(msg, type = "info") {
  const container = $("#toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4500);
}

/* =============================================================================
   ICONS (SVG reutilizables — también usados por chatbot.js)
   ============================================================================= */
function chatIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>`;
}
function alertIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
}

/* =============================================================================
   INIT
   All scripts (main.js, wizard.js, chatbot.js) are loaded synchronously before
   DOMContentLoaded fires, so initWizard and initChat are always defined here.
   ============================================================================= */
document.addEventListener("DOMContentLoaded", () => {
  $$("[data-toggle-lang]").forEach((btn) =>
    btn.addEventListener("click", toggleLang),
  );

  renderPlans();
  renderSteps();
  renderTestimonials();
  applyLanguage();
  loadPlansFromAPI();

  revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("visible");
          revealObserver.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12 },
  );
  $$(".reveal").forEach((el) => revealObserver.observe(el));

  initNav();
  if (typeof initWizard === "function") initWizard();
  if (typeof initChat  === "function") initChat();
  initReveal();

  console.log("LEGADO initialized ✓");
});
