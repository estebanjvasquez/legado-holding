/* =============================================================================
   LEGADO — js/main.js
   Versión 4 combinada: base V3 + sección "Protege" bilingüe
   Apache puro · Sin Node.js · Sin compiladores
   =============================================================================

   ÍNDICE DE SECCIONES
   ─────────────────────────────────────────────────────────
   CONFIG         — URL webhook n8n (CAMBIAR AQUÍ)
   i18n / LANG    — Diccionario ES/EN (editar textos aquí)
   PLANS          — Precios y características de planes
   STATE          — Variables de estado global
   HELPERS        — Utilidades (DOM, escape, markdown)
   LANGUAGE       — Cambio de idioma, applyLanguage()
   NAVIGATION     — Menú hamburguesa, scroll shadow
   REVEAL         — Animaciones scroll (IntersectionObserver)
   PLANS RENDER   — renderPlans()
   STEPS RENDER   — renderSteps()
   TESTIMONIALS   — renderTestimonials()
   CHATBOT        — openChat, sendChatMessage, etc.
   WIZARD         — Modal de compra 4 pasos
   TOAST          — showToast()
   ICONS          — SVG inline reutilizables
   INIT           — DOMContentLoaded
   ─────────────────────────────────────────────────────────── */

/* =============================================================================
   CONFIG
   ▶ CAMBIA ESTA URL por la de tu webhook de n8n
   ============================================================================= */
const CHAT_WEBHOOK_URL = "https://TU-N8N-WEBHOOK-URL/webhook/chat"; // ← CAMBIAR

/* Stripe configuration */
const DEFAULT_STRIPE_KEY =
  "pk_test_51TD0wWIZ8iB3diEjBitOKaGv7OPDilCvCtpOTsA47DiIiVw9lqmZlki1wzDdkOrFRLGiXhdnPULKbuI8ErOmvUQS00ehj9nJZU";
const DEFAULT_WIZARD_WEBHOOK =
  "https://vmi2945958.contaboserver.net/webhook/legado-payment";
const DEFAULT_STRIPE_WEBHOOK =
  "https://vmi2945958.contaboserver.net/webhook/stripe-webhook-legado";

// Environment-aware config (can be overridden via window.LEGADO_CONFIG)
const STRIPE_PUBLISHABLE_KEY =
  (typeof window !== "undefined" &&
    window.LEGADO_CONFIG?.STRIPE_PUBLISHABLE_KEY) ||
  DEFAULT_STRIPE_KEY;
const WIZARD_WEBHOOK_URL =
  (typeof window !== "undefined" && window.LEGADO_CONFIG?.WIZARD_WEBHOOK_URL) ||
  DEFAULT_WIZARD_WEBHOOK;
const STRIPE_WEBHOOK_URL =
  (typeof window !== "undefined" && window.LEGADO_CONFIG?.STRIPE_WEBHOOK_URL) ||
  DEFAULT_STRIPE_WEBHOOK;

/* =============================================================================
   i18n / LANG — Diccionario bilingüe ES / EN
   ─────────────────────────────────────────────────────────────────────────────
   Formato: clave: ["texto en español", "english text"]

   ▶ Para agregar una clave nueva:
     1. Añade una línea aquí: mi_clave: ["Texto ES", "Text EN"]
     2. Agrega data-i18n="mi_clave" al elemento HTML correspondiente

   ▶ Para cambiar un texto existente: edita directamente el string en el array
   ============================================================================= */
const LANG = {
  /* ── Navegación ────────────────────────────────────────────────────────── */
  nav_inicio: ["Inicio", "Home"],
  nav_planes: ["Planes", "Plans"],
  nav_como: ["Cómo funciona", "How it works"],
  nav_contacto: ["Contacto", "Contact"],
  nav_cta: ["PROTEGE TU LEGADO", "PROTECT YOUR LEGACY"],

  /* ── Hero (sobre fondo de foto de los abuelos) ─────────────────────────── */
  hero_eyebrow: [
    "Previsión funeraria para venezolanos en USA",
    "Funeral pre-planning for Venezuelans in the USA",
  ],
  hero_title1: ["Sabemos lo que significa", "We know what it means"],
  hero_title2: ["no poder estar presente", "not being able to be there"],
  hero_sub1: [
    "Si eres venezolano y dejaste familia en tu país, este espacio es para ti. Contrata hoy tu plan de previsión funeraria directamente, sin intermediarios, sin tasas confusas, sin variaciones en el precio. Domicilia tu pago en USA en tu tarjeta de crédito.",
    "If you're Venezuelan and left family behind, this space is for you. Enroll today in your funeral pre-planning plan directly, no middlemen, no confusing fees, no price changes. Charge to your US credit card.",
  ],
  hero_tagline: [
    '"Uniendo familias, honrando vidas, preservando memorias"',
    '"Uniting families, honoring lives, preserving memories"',
  ],
  hero_cta: ["PROTEGE TU LEGADO AQUÍ", "PROTECT YOUR LEGACY HERE"],
  badge1: ["Sin intermediarios", "No middlemen"],
  badge2: ["Pago en USA con tarjeta", "Pay in USA by card"],
  badge3: ["Sin variaciones de precio", "No price changes"],

  /* ── Trust bar ─────────────────────────────────────────────────────────── */
  trust1: ["Respaldo de Funeraria del Zulia", "Backed by Funeraria del Zulia"],
  trust2: ["80+ años de trayectoria", "80+ years of experience"],
  trust3: ["Pago en USA con tarjeta de crédito", "Pay in USA with credit card"],
  trust4: ["Precio fijo, sin variaciones", "Fixed price, no variations"],

  /* ── Sección "Protege a tu familia" (versión raíz) ─────────────────────── */
  protege_h2: [
    "Protege a tu familia en Venezuela aunque estés lejos",
    "Protect your family in Venezuela even from far away",
  ],
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

  /* ── Planes ────────────────────────────────────────────────────────────── */
  plans_title1: [
    "Con LEGADO, la tranquilidad en los momentos",
    "With LEGADO, peace of mind in the most",
  ],
  plans_title2: [
    "más difíciles toma otra dimensión",
    "difficult moments takes on a new dimension",
  ],
  plans_sub: [
    "Total, confiable y al alcance de todos. Titular y hasta 6 familiares, edad máxima 65 años.",
    "Total, reliable, and within everyone's reach. Policyholder and up to 6 family members, max age 65.",
  ],
  region_zulia: ["Región Zulia", "Zulia Region"],
  region_selecto: [
    "Toda Venezuela — Grupo Selecto",
    "All Venezuela — Select Group",
  ],
  plan_recommended: ["RECOMENDADO", "RECOMMENDED"],
  plan_mo: ["/mes", "/mo"],
  plan_yr: ["/año", "/yr"],
  plan_or: ["o", "or"],
  plan_buy: ["Comprar", "Buy Now"],
  plan_details: ["Ver componentes", "View components"],

  /* Nombres de planes */
  "plan_esencial-zulia_name": ["Plan Esencial Zulia", "Essential Zulia Plan"],
  "plan_vanguardia-zulia_name": [
    "Plan Vanguardia Zulia",
    "Vanguard Zulia Plan",
  ],
  "plan_esencial-selecto_name": [
    "Plan Esencial Grupo Selecto",
    "Essential Select Group Plan",
  ],
  "plan_vanguardia-selecto_name": [
    "Plan Vanguardia Grupo Selecto",
    "Vanguard Select Group Plan",
  ],

  /* ── Cómo funciona ─────────────────────────────────────────────────────── */
  how_title: ["Cómo funciona", "How it works"],
  how_sub: [
    "Contratación 100% digital en solo 4 pasos",
    "100% digital enrollment in just 4 steps",
  ],
  step_word: ["PASO", "STEP"],
  step1_title: ["Elige tu plan", "Choose your plan"],
  step1_desc: [
    "Selecciona la cobertura que mejor se adapte a tu familia.",
    "Select the coverage that best fits your family.",
  ],
  step2_title: ["Completa tus datos", "Complete your info"],
  step2_desc: [
    "Ingresa los datos del comprador y de las personas a cubrir.",
    "Enter buyer and covered persons information.",
  ],
  step3_title: ["Acepta y paga", "Accept & pay"],
  step3_desc: [
    "Revisa el contrato, acepta términos y realiza tu pago seguro.",
    "Review the contract, accept terms, and make a secure payment.",
  ],
  step4_title: ["Tu familia protegida", "Your family protected"],
  step4_desc: [
    "Recibe confirmación y accede a tu portal de cliente.",
    "Receive confirmation and access your client portal.",
  ],

  /* ── Storytelling ──────────────────────────────────────────────────────── */
  story_eyebrow: ["Nuestra historia", "Our story"],
  story_title: [
    "La distancia no debería impedir cuidar a quienes más amas",
    "Distance shouldn't prevent you from caring for those you love most",
  ],
  story_p1: [
    "En nuestras empresas, nuestra misión es escuchar cada planteamiento de los clientes. Cada paso que damos viene de propuestas de familias que hemos atendido durante casi 85 años y que hoy viven en USA, al igual que tú.",
    "In our companies, our mission is to listen to every concern our clients raise. Every step we take comes from proposals by families we've served for nearly 85 years who now live in the USA, just like you.",
  ],
  story_p2: [
    "Es por eso que hemos creado el GRUPO SELECTO: para dar respuesta a los cambios en la prestación de servicios funerarios que nuestros clientes han pedido. Ahora puedes optar por una bóveda en parcelas en cementerio privado — una innovación en toda Venezuela, disponible primero para nuestros clientes en USA.",
    "That's why we created the SELECT GROUP: to respond to changes in funeral service delivery that our clients have requested. You can now choose a vault in private cemetery parcels — an innovation across all of Venezuela, available first to our US clients.",
  ],
  story_quote: [
    '"Uniendo familias, honrando vidas, preservando memorias"',
    '"Uniting families, honoring lives, preserving memories"',
  ],

  /* ── Testimonios ───────────────────────────────────────────────────────── */
  test_title1: ["Familias que ya", "Families who already"],
  test_title2: ["protegen su legado", "protect their legacy"],
  test1_text: [
    "Desde que contraté Legado, duermo tranquila. Sé que si algo pasa con mi mamá en Maracaibo, todo estará cubierto.",
    "Since I hired Legado, I sleep peacefully. I know if something happens to my mom in Maracaibo, everything will be covered.",
  ],
  test2_text: [
    "Cuando mi padre falleció, Legado se encargó de todo. Yo estaba aquí sin poder viajar, pero sabía que mi familia estaba acompañada.",
    "When my father passed, Legado took care of everything. I was here unable to travel, but I knew my family was supported.",
  ],
  test3_text: [
    "El proceso fue súper fácil. En minutos tenía todo configurado desde mi teléfono. Ahora mis abuelos están protegidos.",
    "The process was super easy. In minutes I had everything set up from my phone. Now my grandparents are protected.",
  ],

  /* ── Contacto ──────────────────────────────────────────────────────────── */
  contact_title1: ["¿Tienes preguntas?", "Have questions?"],
  contact_title2: ["Estamos aquí", "We're here"],
  contact_sub: [
    "Nuestro equipo te acompaña en cada paso.",
    "Our team walks with you every step.",
  ],
  contact_phone: ["Teléfono", "Phone"],
  contact_coverage: ["Cobertura", "Coverage"],
  contact_all_vzla: ["Toda Venezuela", "All Venezuela"],

  /* ── CTA final ─────────────────────────────────────────────────────────── */
  cta_title: [
    "Esta innovación es simple: tú decides cómo despedirte",
    "This innovation is simple: you decide how to say goodbye",
  ],
  cta_sub: [
    "Sin cambios en tu cuota mensual. Solo haz click en el plan que más te convenga, realiza el pago de la inicial anual, y amplía tus servicios siendo tú quien decide. Titular + 6 familiares hasta 65 años.",
    "No changes to your monthly fee. Just click on the plan that suits you best, make the annual initial payment, and expand your services — you decide. Policyholder + 6 family members up to age 65.",
  ],
  cta_call: ["Llámanos", "Call us"],

  /* ── Footer ────────────────────────────────────────────────────────────── */
  footer_tagline: [
    "Uniendo familias, honrando vidas, preservando memorias.",
    "Uniting families, honoring lives, preserving memories.",
  ],
  footer_follow: ["Síguenos", "Follow us"],
  footer_terms: ["Términos y condiciones", "Terms & conditions"],
  footer_privacy: ["Política de privacidad", "Privacy policy"],
  footer_support: ["Soporte", "Support"],
  footer_rights: ["Todos los derechos reservados.", "All rights reserved."],

  /* ── Emergencia ────────────────────────────────────────────────────────── */
  emergency: ["EMERGENCIA", "EMERGENCY"],

  /* ── Chatbot ───────────────────────────────────────────────────────────── */
  chat_title: ["Asistente LEGADO", "LEGADO Assistant"],
  chat_emergency: ["Asistencia de Emergencia", "Emergency Assistance"],
  chat_greeting: [
    "¡Hola! Soy el asistente de LEGADO. ¿En qué puedo ayudarte con tu plan?",
    "Hi! I'm the LEGADO assistant. How can I help you with your plan?",
  ],
  chat_greeting_emergency: [
    "Lamento mucho que estés pasando por este momento. Estoy aquí para ayudarte. ¿Puedes contarme qué sucedió?",
    "I'm so sorry you're going through this. I'm here to help. Can you tell me what happened?",
  ],
  chat_placeholder: ["Escribe tu pregunta...", "Type your question..."],
  chat_ph_emergency: [
    "Escribe aquí tu situación...",
    "Describe your situation...",
  ],
  chat_error: [
    "Lo siento, no pude conectarme. Por favor intenta de nuevo.",
    "Sorry, I couldn't connect. Please try again.",
  ],
  chat_error_emergency: [
    "Lo siento, hubo un error de conexión. Por favor intenta de nuevo o llámanos directamente.",
    "Sorry, there was a connection error. Please try again or call us directly.",
  ],

  /* ── Wizard ────────────────────────────────────────────────────────────── */
  wiz_title: ["Compra tu plan", "Buy your plan"],
  wiz_step_data: ["Datos", "Info"],
  wiz_step_family: ["Familia", "Family"],
  wiz_step_plan: ["Plan", "Plan"],
  wiz_step_payment: ["Pago", "Payment"],
  wiz_step_summary: ["Resumen", "Summary"],
  wiz_back: ["Atrás", "Back"],
  wiz_next: ["Siguiente", "Next"],
  wiz_confirm: ["Confirmar y Pagar", "Confirm & Pay"],
  wiz_fname: ["Nombre", "First name"],
  wiz_lname: ["Apellido", "Last name"],
  wiz_cedula: ["Cédula", "ID Number"],
  wiz_phone: ["Teléfono", "Phone"],
  wiz_birth: ["Fecha de nacimiento", "Date of birth"],
  wiz_age_err: [
    "La edad máxima permitida para este plan es 65 años (padres hasta 80 años en Plan Vanguardia Zulia)",
    "Maximum allowed age for this plan is 65 years (parents up to 80 in Vanguard Zulia Plan)",
  ],
  wiz_family_hint: [
    "Agrega los familiares que deseas cubrir (máximo 6)",
    "Add family members to cover (max 6)",
  ],
  wiz_member: ["Familiar", "Family member"],
  wiz_relation: ["Parentesco", "Relationship"],
  wiz_relation_ph: ["Ej: Madre", "E.g.: Mother"],
  wiz_age_err_short: ["Máximo 65 años", "Max 65 years"],
  wiz_add_family: ["Agregar familiar", "Add family member"],
  wiz_select_payment: [
    "Selecciona tu forma de pago",
    "Select your payment method",
  ],
  wiz_monthly_title: ["Suscripción mensual", "Monthly subscription"],
  wiz_select_billing: [
    "Selecciona tu modalidad de pago",
    "Select your billing mode",
  ],
  wiz_payment_method: [
    "Selecciona tu método de pago",
    "Select your payment method",
  ],
  wiz_method_card: ["Tarjeta de crédito/débito", "Credit/Debit card"],
  wiz_method_zelle: ["Zelle", "Zelle"],
  wiz_method_card_info: [
    "Serás redirigido a Stripe para completar el pago seguro",
    "You will be redirected to Stripe to complete secure payment",
  ],
  wiz_method_bank: ["Transferencia bancaria", "Bank transfer"],
  wiz_monthly_sub: ["Tarjeta de crédito", "Credit card"],
  wiz_annual_title: ["Pago anual", "Annual payment"],
  wiz_annual_sub: ["¡Ahorra 2 meses!", "Save 2 months!"],
  wiz_summary_title: ["Resumen de compra", "Purchase summary"],
  wiz_sum_billing: ["Modalidad", "Billing mode"],
  wiz_sum_method: ["Método de pago", "Payment method"],
  wiz_sum_plan: ["Plan", "Plan"],
  wiz_sum_payment: ["Pago", "Payment"],
  wiz_sum_buyer: ["Comprador", "Buyer"],
  wiz_sum_members: ["Familiares", "Family members"],
  wiz_contract_title: ["Contrato de servicio", "Service contract"],
  wiz_contract_chk: [
    "Acepto los términos y condiciones del servicio",
    "I accept the service terms and conditions",
  ],
  wiz_contract_p0: [
    "TÉRMINOS Y CONDICIONES DEL SERVICIO DE PREVISIÓN FUNERARIA LEGADO",
    "LEGADO FUNERAL PRE-PLANNING SERVICE TERMS AND CONDITIONS",
  ],
  wiz_contract_p1: [
    "El presente contrato establece los términos y condiciones bajo los cuales Legado provee servicios de previsión funeraria para familias venezolanas. Al aceptar estos términos, el contratante acepta las condiciones de servicio, cobertura y pago aquí descritas.",
    "This contract establishes the terms and conditions under which Legado provides funeral pre-planning services for Venezuelan families.",
  ],
  wiz_contract_p2: [
    "1. COBERTURA: El servicio incluye los beneficios especificados en el plan seleccionado. La cobertura aplica exclusivamente en el territorio de Venezuela según el plan contratado.",
    "1. COVERAGE: The service includes the benefits specified in the selected plan. Coverage applies exclusively within Venezuelan territory.",
  ],
  wiz_contract_p3: [
    "2. PAGOS: Los pagos deben realizarse de forma puntual según la modalidad seleccionada (mensual o anual). El incumplimiento de pago por más de 30 días resultará en la suspensión del servicio.",
    "2. PAYMENTS: Payments must be made promptly. Payment default for more than 30 days will result in service suspension.",
  ],
  wiz_contract_p4: [
    "3. CANCELACIÓN: El contratante puede cancelar el servicio en cualquier momento con 30 días de anticipación.",
    "3. CANCELLATION: The contractor may cancel the service at any time with 30 days notice.",
  ],

  /* ── Toast ─────────────────────────────────────────────────────────────── */
  toast_confirm: [
    "¡Solicitud enviada! Nos pondremos en contacto pronto.",
    "Request submitted! We'll get in touch soon.",
  ],

  /* ── Stripe Payment Flow ───────────────────────────────────────────────── */
  stripe_card_title: ["Confirmar datos de pago", "Confirm payment details"],
  stripe_card_subtitle: [
    "Verifica que todos los datos sean correctos antes de continuar",
    "Verify all details are correct before continuing",
  ],
  stripe_confirm_btn: [
    "Continuar al pago seguro",
    "Continue to secure payment",
  ],
  stripe_back_btn: ["Volver", "Go back"],
  stripe_processing: [
    "Procesando tu información...",
    "Processing your information...",
  ],
  stripe_enter_card: [
    "Ingresa los datos de tu tarjeta",
    "Enter your card details",
  ],
  stripe_pay_btn: ["Pagar ahora", "Pay now"],
  stripe_payment_success: [
    "¡Pago exitoso! Procesando tu solicitud...",
    "Payment successful! Processing your request...",
  ],
  stripe_payment_error: [
    "Error en el pago. Por favor intenta de nuevo.",
    "Payment error. Please try again.",
  ],
  stripe_verify_title: ["Verifica tu información", "Verify your information"],
  stripe_plan_label: ["Plan seleccionado", "Selected plan"],
  stripe_amount_label: ["Monto a pagar", "Amount to pay"],
  stripe_method_label: ["Método de pago", "Payment method"],
};

/* =============================================================================
   PLANS — precios y características
   ─────────────────────────────────────────────────────────────────────────────
   ▶ Para cambiar precios: edita monthly/annual/mo_save en PLANS
   ▶ Para cambiar features por plan: edita PLAN_FEATURES
   ▶ Para añadir un plan: agrega una entrada en PLANS, PLAN_FEATURES,
     LANG (el nombre), y PLAN_GROUPS
   ============================================================================= */
const PLANS = {
  /* Precios reales según el documento del cliente */
  "esencial-zulia": {
    monthly: "$9,47",
    annual: "$94,7",
    mo_save: "$19",
    maxAge: 65,
  },
  "vanguardia-zulia": {
    monthly: "$14,7",
    annual: "$147",
    mo_save: "$29,4",
    maxAge: 80,
  },
  "esencial-selecto": {
    monthly: "$9,47",
    annual: "$202",
    mo_save: "$",
    initial: "$35",
    maxAge: 65,
  },
  "vanguardia-selecto": {
    monthly: "$14,7",
    annual: "$129,7",
    mo_save: "$",
    initial: "$55",
    maxAge: 65,
  },
};

/* Nota Planes Selecto: pagan una cuota inicial + mensualidad igual al plan base */

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

const PLAN_GROUPS = [
  { region_key: "region_zulia", plans: ["esencial-zulia", "vanguardia-zulia"] },
  {
    region_key: "region_selecto",
    plans: ["esencial-selecto", "vanguardia-selecto"],
  },
];

const HIGHLIGHTED = new Set(["vanguardia-zulia", "vanguardia-selecto"]);

/* Descripción corta debajo del nombre del plan (aparece en tarjeta) */
const PLAN_SUBTITLE = {
  "esencial-zulia": {
    es: "Funeral + cremación · Funeraria del Zulia · Regional Zulia",
    en: "Funeral + cremation · Funeraria del Zulia · Zulia Region",
  },
  "vanguardia-zulia": {
    es: "Lo mejor de nuestros planes · Padres hasta 80 años · Funeraria del Zulia",
    en: "Best of our plans · Parents up to 80 years · Funeraria del Zulia",
  },
  "esencial-selecto": {
    es: "Todo Venezuela · Tú eliges los componentes · Cremación incluida",
    en: "All Venezuela · You choose the components · Cremation included",
  },
  "vanguardia-selecto": {
    es: "El más completo · Exclusivo Venezuela · Tú eliges: cremación o bóveda privada",
    en: "Most comprehensive · Exclusive Venezuela · You choose: cremation or private vault",
  },
};

/* =============================================================================
   STATE — variables de estado global
   ============================================================================= */
let currentLang = "es";
let chatMode = "wizard"; // "wizard" | "emergency"
let chatMessages = [];
let chatLoading = false;
let chatSessionId = null;
let wizardOpen = false;
let wizardStep = 0;
let wizardSelectedPlan = null;
let wizardPaymentType = "monthly";
let wizardPaymentMethod = "card"; // "card" | "zelle" | "bank"
let wizardAcceptedTerms = false;
let wizardCardConfirmStep = false; // "confirmation" | "stripe-form" | false
let wizardBuyer = {
  name: "",
  lastName: "",
  cedula: "",
  phone: "",
  email: "",
  birthDate: "",
};
let wizardFamily = [];
let revealObserver = null;

// Stripe Elements instances (created on demand)
let __stripe = null;
let __elements = null;
let __cardElement = null;

/* =============================================================================
   HELPERS
   ============================================================================= */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function generateSessionId() {
  return (
    "sess_" + Math.random().toString(36).slice(2) + Date.now().toString(36)
  );
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

/* Traduce una clave al idioma actual */
function t(key) {
  const pair = LANG[key];
  if (!pair) {
    console.warn("i18n missing key:", key);
    return key;
  }
  return currentLang === "es" ? pair[0] : pair[1];
}

/* =============================================================================
   LANGUAGE — cambio de idioma y aplicación de traducciones
   ============================================================================= */
function applyLanguage() {
  /* Traduce todos los elementos con data-i18n */
  $$("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const txt = t(key);
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      el.placeholder = txt;
    } else {
      el.textContent = txt;
    }
  });

  /* Actualiza el botón de idioma */
  $$("[data-i18n-lang]").forEach((el) => {
    el.textContent = currentLang === "es" ? "EN" : "ES";
  });

  /* Re-renderiza secciones dinámicas */
  renderPlans();
  renderSteps();
  renderTestimonials();
  renderWizardFamilyStep();
}

function toggleLang() {
  currentLang = currentLang === "es" ? "en" : "es";
  document.documentElement.lang = currentLang;
  applyLanguage();
  if (wizardOpen) renderWizardContent();

  /* Actualiza saludo del chat si está abierto */
  const overlay = $("#chatbot-overlay");
  if (overlay && !overlay.classList.contains("hidden")) {
    const greetBubble = $("#chat-messages .chat-greeting .chat-bubble");
    if (greetBubble && chatMessages.length === 0) {
      greetBubble.textContent =
        chatMode === "emergency"
          ? t("chat_greeting_emergency")
          : t("chat_greeting");
    }
  }
}

/* =============================================================================
   NAVIGATION
   ============================================================================= */
function initNav() {
  const toggle = $("#nav-mobile-toggle");
  const mobileMenu = $("#nav-mobile-menu");
  const nav = $("#main-nav");

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

  window.addEventListener(
    "scroll",
    () => {
      nav.classList.toggle("scrolled", window.scrollY > 20);
    },
    { passive: true },
  );
}

/* =============================================================================
   REVEAL — animaciones por scroll
   ============================================================================= */
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

/* Re-observa elementos .reveal añadidos dinámicamente */
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
      const plan = PLANS[planId];
      const features = PLAN_FEATURES[planId][currentLang];
      const name = t(`plan_${planId}_name`);
      const subtitle = PLAN_SUBTITLE[planId][currentLang];
      const highlighted = HIGHLIGHTED.has(planId);
      const isSelecto = plan.initial !== undefined;

      /* Pricing display: Selecto has initial + monthly, base plans have monthly + annual */
      let priceHTML = "";
      let subPriceHTML = "";
      if (isSelecto) {
        priceHTML = `<div class="plan-price-monthly">${plan.monthly}<span>${t("plan_mo")}</span></div>`;
        subPriceHTML = `<p class="plan-price-annual plan-price-initial">
          ${currentLang === "es" ? "Cuota inicial" : "Initial fee"}: <strong>${plan.initial}</strong> +
          ${currentLang === "es" ? "pago contado" : "lump sum"}: ${plan.annual}${t("plan_yr")}
        </p>`;
      } else {
        priceHTML = `<div class="plan-price-monthly">${plan.monthly}<span>${t("plan_mo")}</span></div>`;
        subPriceHTML = `<p class="plan-price-annual">
          ${currentLang === "es" ? "Oferta lanzamiento" : "Launch offer"}: <strong>${plan.annual}${t("plan_yr")}</strong>
        </p>`;
      }

      const card = document.createElement("div");
      card.className = `plan-card${highlighted ? " highlighted" : ""} reveal reveal-delay-${i + 1}`;
      card.innerHTML = `
        ${
          highlighted
            ? `<div class="plan-badge">
          <svg fill="currentColor" viewBox="0 0 20 20" width="12" height="12">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
          </svg>${t("plan_recommended")}</div>`
            : ""
        }
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
   ─────────────────────────────────────────────────────────────────────────────
   ▶ Para agregar/cambiar testimonios: edita el array tests y
     las claves test1_text, test2_text, test3_text en LANG
   ============================================================================= */
function renderTestimonials() {
  const container = $("#testimonials-container");
  if (!container) return;
  const tests = [
    { key: "test1_text", name: "María G.", loc: "Miami, FL" },
    { key: "test2_text", name: "Carlos R.", loc: "Houston, TX" },
    { key: "test3_text", name: "Ana P.", loc: "New York, NY" },
  ];
  container.innerHTML = tests
    .map(
      (td, i) => `
    <div class="testimonial-card reveal reveal-delay-${i + 1}">
      <div class="testimonial-quote-icon">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z"/></svg>
      </div>
      <p class="testimonial-text">"${t(td.key)}"</p>
      <p class="testimonial-name">${td.name}</p>
      <p class="testimonial-location">${td.loc}</p>
    </div>
  `,
    )
    .join("");
}

/* =============================================================================
   CHATBOT
   ============================================================================= */
function openChat(mode) {
  chatMode = mode;
  chatMessages = [];
  chatSessionId = generateSessionId();

  const overlay = $("#chatbot-overlay");
  overlay.classList.remove("hidden");
  $("#chat-header").className =
    `chat-header ${mode === "emergency" ? "emergency" : "normal"}`;
  $("#chat-title").textContent =
    mode === "emergency" ? t("chat_emergency") : t("chat_title");
  $("#chat-header-icon").innerHTML =
    mode === "emergency" ? alertIcon() : chatIcon();
  $("#chat-input").placeholder =
    mode === "emergency" ? t("chat_ph_emergency") : t("chat_placeholder");
  $("#chat-send-btn").className =
    `chat-send-btn ${mode === "emergency" ? "emergency" : "normal"}`;

  $("#chat-messages").innerHTML = `
    <div class="chat-bubble-wrap bot chat-greeting">
      <div class="chat-bubble bot${mode === "emergency" ? " emergency" : ""}">
        ${mode === "emergency" ? t("chat_greeting_emergency") : t("chat_greeting")}
      </div>
    </div>`;

  setTimeout(() => $("#chat-input").focus(), 300);
}

function closeChat() {
  $("#chatbot-overlay").classList.add("hidden");
}

function appendChatBubble(role, content) {
  const msgs = $("#chat-messages");
  const wrap = document.createElement("div");
  wrap.className = `chat-bubble-wrap ${role === "user" ? "user" : "bot"}`;
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${role === "user" ? "user" : "bot"}${chatMode === "emergency" && role === "assistant" ? " emergency" : ""}`;
  bubble.innerHTML =
    role === "assistant" ? simpleMarkdown(content) : escapeHTML(content);
  wrap.appendChild(bubble);
  msgs.appendChild(wrap);
  msgs.scrollTop = msgs.scrollHeight;
}

function showTypingIndicator() {
  const msgs = $("#chat-messages");
  const wrap = document.createElement("div");
  wrap.className = "chat-bubble-wrap bot";
  wrap.id = "typing-indicator";
  wrap.innerHTML = `<div class="chat-bubble bot"><div class="chat-typing"><span></span><span></span><span></span></div></div>`;
  msgs.appendChild(wrap);
  msgs.scrollTop = msgs.scrollHeight;
}

function removeTypingIndicator() {
  $("#typing-indicator")?.remove();
}

async function sendChatMessage() {
  const input = $("#chat-input");
  const text = input.value.trim();
  if (!text || chatLoading) return;

  input.value = "";
  chatLoading = true;
  updateChatUI();
  chatMessages.push({ role: "user", content: text });
  appendChatBubble("user", text);
  showTypingIndicator();

  try {
    const resp = await fetch(CHAT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        messages: chatMessages,
        mode: chatMode,
        sessionId: chatSessionId,
        lang: currentLang,
      }),
    });
    removeTypingIndicator();
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const data = await resp.json();
    const reply =
      data?.response ||
      data?.message ||
      data?.content ||
      data?.text ||
      (Array.isArray(data) ? data[0]?.response || data[0]?.message : null) ||
      t(chatMode === "emergency" ? "chat_error_emergency" : "chat_error");
    chatMessages.push({ role: "assistant", content: reply });
    appendChatBubble("assistant", reply);
  } catch (e) {
    console.error("Chat error:", e);
    removeTypingIndicator();
    const err = t(
      chatMode === "emergency" ? "chat_error_emergency" : "chat_error",
    );
    chatMessages.push({ role: "assistant", content: err });
    appendChatBubble("assistant", err);
  } finally {
    chatLoading = false;
    updateChatUI();
    $("#chat-input").focus();
  }
}

function updateChatUI() {
  const input = $("#chat-input");
  const sendBtn = $("#chat-send-btn");
  if (input) input.disabled = chatLoading;
  if (sendBtn) sendBtn.disabled = chatLoading || !input?.value.trim();
}

function initChat() {
  const input = $("#chat-input");
  const sendBtn = $("#chat-send-btn");
  sendBtn?.addEventListener("click", sendChatMessage);
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });
  input?.addEventListener("input", () => {
    if (sendBtn) sendBtn.disabled = !input.value.trim() || chatLoading;
  });
  $("#chat-close-btn")?.addEventListener("click", closeChat);
  $("#emergency-btn")?.addEventListener("click", () => openChat("emergency"));
}

/* =============================================================================
   WIZARD — modal de compra — 4 PASOS
   Lanzado desde los botones "Comprar" de cada tarjeta de plan.

   Paso 0: Datos del titular
   Paso 1: Familiares a afiliar
   Paso 2: Forma de pago
   Paso 3: Resumen + Contrato + Acepto
   ============================================================================= */

function openWizard(planId) {
  wizardOpen = true;
  wizardStep = 0;
  wizardSelectedPlan = planId;
  wizardPaymentType = "monthly";
  wizardPaymentMethod = "card";
  wizardAcceptedTerms = false;
  wizardBuyer = {
    name: "",
    lastName: "",
    cedula: "",
    phone: "",
    email: "",
    birthDate: "",
  };
  wizardFamily = [];
  $("#wizard-overlay").classList.remove("hidden");
  renderWizardContent();
}

function closeWizard() {
  wizardOpen = false;
  wizardCardConfirmStep = false;
  __wizardClientSecret = null;
  if (__cardElement) {
    __cardElement.unmount();
    __cardElement = null;
  }
  $("#wizard-overlay").classList.add("hidden");
}

function showPaymentSuccessScreen(email) {
  wizardCardConfirmStep = false;
  __wizardClientSecret = null;
  if (__cardElement) {
    __cardElement.unmount();
    __cardElement = null;
  }

  const portalUrl = "https://invoicing.legadoholding.com/client/login";
  const isEs = currentLang === "es";
  const msg = isEs
    ? `Tu plan ha sido activado. Recibirás un correo en <strong>${email}</strong> con tu factura y acceso al portal.`
    : `Your plan has been activated. You will receive an email at <strong>${email}</strong> with your invoice and portal access.`;
  const btnLabel = isEs ? "Ir al portal" : "Go to portal";
  const closeLabel = isEs ? "Cerrar" : "Close";

  const body = $("#wizard-body");
  if (body) {
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:1.5rem;padding:2rem 1rem;text-align:center;">
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>
        <p style="font-size:1rem;color:#374151;line-height:1.6;">${msg}</p>
        <div style="display:flex;gap:1rem;flex-wrap:wrap;justify-content:center;">
          <a href="${portalUrl}" target="_blank" rel="noopener" class="btn-primary" style="text-decoration:none;">${btnLabel}</a>
          <button class="btn-back" id="wizard-success-close-btn">${closeLabel}</button>
        </div>
      </div>`;
    $("#wizard-success-close-btn")?.addEventListener("click", closeWizard);
  }

  $("#wizard-footer").style.display = "none";
  $("#wizard-steps").style.display = "none";
}

function renderWizardContent() {
  renderWizardSteps();
  renderWizardStep();
  updateWizardFooter();
  const nameEl = $("#wizard-plan-name");
  if (nameEl) {
    if (wizardSelectedPlan) {
      nameEl.textContent = t(`plan_${wizardSelectedPlan}_name`);
      nameEl.style.display = "";
    } else {
      nameEl.style.display = "none";
    }
  }
}

function renderWizardSteps() {
  const el = $("#wizard-steps");
  if (!el) return;
  const labels = [
    t("wiz_step_data"),
    t("wiz_step_family"),
    t("wiz_step_payment"),
    t("wiz_step_summary"),
  ];
  el.innerHTML = labels
    .map((label, i) => {
      const dotClass =
        i < wizardStep ? "done" : i === wizardStep ? "active" : "inactive";
      const labelClass = i <= wizardStep ? "active" : "inactive";
      return `
      <div class="step-dot-wrap">
        <div class="step-dot ${dotClass}">
          ${
            i < wizardStep
              ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
              : i + 1
          }
        </div>
        <span class="step-label ${labelClass}">${label}</span>
        ${i < labels.length - 1 ? `<div class="step-line ${i < wizardStep ? "done" : ""}"></div>` : ""}
      </div>`;
    })
    .join("");
}

function renderWizardStep() {
  const body = $("#wizard-body");
  if (!body) return;
  body.innerHTML = "";
  const div = document.createElement("div");
  div.className = "wizard-step active";
  if (wizardStep === 0) div.innerHTML = renderStep0();
  else if (wizardStep === 1) div.innerHTML = renderStep1();
  else if (wizardStep === 2) div.innerHTML = renderStep2();
  else if (wizardStep === 3) div.innerHTML = renderStep3();
  body.appendChild(div);
  bindWizardStepEvents();
}

function renderStep0() {
  const b = wizardBuyer;
  const maxAge = PLANS[wizardSelectedPlan]?.maxAge || 65;
  const minDate = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - maxAge);
    return d.toISOString().split("T")[0];
  })();
  const maxDate = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 18);
    return d.toISOString().split("T")[0];
  })();
  return `
    <div class="form-row cols-2">
      <div class="form-group"><label class="form-label">${t("wiz_fname")}</label>
        <input class="form-input" id="wf-name" type="text" value="${escapeHTML(b.name)}" placeholder="${t("wiz_fname")}"></div>
      <div class="form-group"><label class="form-label">${t("wiz_lname")}</label>
        <input class="form-input" id="wf-lastName" type="text" value="${escapeHTML(b.lastName)}" placeholder="${t("wiz_lname")}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">${t("wiz_cedula")}</label>
        <input class="form-input" id="wf-cedula" type="text" value="${escapeHTML(b.cedula)}" placeholder="V-12345678"></div>
    </div>
    <div class="form-row cols-2">
      <div class="form-group"><label class="form-label">${t("wiz_phone")}</label>
        <input class="form-input" id="wf-phone" type="tel" value="${escapeHTML(b.phone)}" placeholder="+1 (555) 000-0000"></div>
      <div class="form-group"><label class="form-label">Email</label>
        <input class="form-input" id="wf-email" type="email" value="${escapeHTML(b.email)}" placeholder="correo@email.com"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">${t("wiz_birth")}</label>
        <input class="form-input" id="wf-birthDate" type="date" value="${b.birthDate}" min="${minDate}" max="${maxDate}">
        <div id="age-error" class="form-error" style="display:none">
          ${currentLang === "es" ? "Edad máxima permitida: " + maxAge + " años" : "Maximum allowed age: " + maxAge + " years"}
        </div>
      </div>
    </div>`;
}

function renderStep1() {
  const maxAge = PLANS[wizardSelectedPlan]?.maxAge || 65;
  const minDate = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - maxAge);
    return d.toISOString().split("T")[0];
  })();
  const maxDate = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 18);
    return d.toISOString().split("T")[0];
  })();
  const ageErrMsg =
    currentLang === "es"
      ? "Máximo " + maxAge + " años"
      : "Max " + maxAge + " years";

  const cards = wizardFamily
    .map(
      (m, i) => `
    <div class="family-card">
      <div class="family-card-header">
        <span class="family-card-title">${t("wiz_member")} ${i + 1}</span>
        <button class="family-remove-btn" data-remove="${i}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
        </button>
      </div>
      <div class="form-row cols-2">
        <div class="form-group"><label class="form-label">${t("wiz_fname")}</label>
          <input class="form-input fm-input" data-idx="${i}" data-field="name" type="text" value="${escapeHTML(m.name)}"></div>
        <div class="form-group"><label class="form-label">${t("wiz_lname")}</label>
          <input class="form-input fm-input" data-idx="${i}" data-field="lastName" type="text" value="${escapeHTML(m.lastName)}"></div>
        <div class="form-group"><label class="form-label">${t("wiz_cedula")}</label>
          <input class="form-input fm-input" data-idx="${i}" data-field="cedula" type="text" value="${escapeHTML(m.cedula)}"></div>
        <div class="form-group"><label class="form-label">${t("wiz_relation")}</label>
          <input class="form-input fm-input" data-idx="${i}" data-field="relationship" type="text" value="${escapeHTML(m.relationship)}" placeholder="${t("wiz_relation_ph")}"></div>
        <div class="form-group"><label class="form-label">${t("wiz_phone")}</label>
          <input class="form-input fm-input" data-idx="${i}" data-field="phone" type="tel" value="${escapeHTML(m.phone)}"></div>
        <div class="form-group"><label class="form-label">${t("wiz_birth")}</label>
          <input class="form-input fm-input" data-idx="${i}" data-field="birthDate" type="date" value="${m.birthDate}" min="${minDate}" max="${maxDate}">
          ${m.birthDate && !validateAge(m.birthDate, maxAge) ? `<div class="form-error">${ageErrMsg}</div>` : ""}
        </div>
      </div>
    </div>`,
    )
    .join("");

  return `
    <p style="color:var(--muted-foreground);font-size:0.875rem;margin-bottom:1.25rem">${t("wiz_family_hint")}</p>
    <div id="family-cards">${cards}</div>
    ${
      wizardFamily.length < 6
        ? `
      <button class="btn-add-family" id="btn-add-family">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        ${t("wiz_add_family")}
      </button>`
        : ""
    }`;
}

function renderStep2() {
  const plan = PLANS[wizardSelectedPlan];
  const isSelecto = plan.initial !== undefined;
  const monthlyLabel =
    currentLang === "es"
      ? "Domiciliar a tarjeta de crédito"
      : "Charge to credit card";
  const annualSub =
    currentLang === "es" ? "¡Oferta de lanzamiento!" : "Launch offer!";

  // Get method display name
  const getMethodName = (method) => {
    switch (method) {
      case "card":
        return t("wiz_method_card");
      case "zelle":
        return t("wiz_method_zelle");
      case "bank":
        return t("wiz_method_bank");
      default:
        return method;
    }
  };

  return `
    <p style="color:var(--muted-foreground);font-size:0.875rem;margin-bottom:0.5rem">${t("wiz_select_billing")}</p>
    <button class="payment-option${wizardPaymentType === "monthly" ? " selected" : ""}" data-type="monthly">
      <div>
        <p class="payment-option-title">${t("wiz_monthly_title")}</p>
        <p class="payment-option-sub">${monthlyLabel}</p>
      </div>
      <div class="payment-option-price">${isSelecto ? plan.initial + " + " : ""}${plan.monthly}<span>${t("plan_mo")}</span></div>
    </button>
    <button class="payment-option${wizardPaymentType === "annual" ? " selected" : ""}" data-type="annual">
      <div>
        <p class="payment-option-title">${t("wiz_annual_title")}</p>
        <p class="payment-option-sub highlight">${annualSub}</p>
      </div>
      <div class="payment-option-price">${isSelecto ? plan.initial + " + " : ""}${plan.annual}<span>${t("wiz_yr")}</span></div>
    </button>
    <p style="color:var(--muted-foreground);font-size:0.875rem;margin:1.5rem 0 0.5rem">${t("wiz_payment_method")}</p>
    <div class="payment-methods">
      <button class="payment-method${wizardPaymentMethod === "card" ? " selected" : ""}" data-method="card">
        <span class="method-icon">💳</span>
        <span class="method-name">${t("wiz_method_card")}</span>
      </button>
      <button class="payment-method${wizardPaymentMethod === "zelle" ? " selected" : ""}" data-method="zelle">
        <span class="method-icon">📱</span>
        <span class="method-name">${t("wiz_method_zelle")}</span>
      </button>
      <button class="payment-method${wizardPaymentMethod === "bank" ? " selected" : ""}" data-method="bank">
        <span class="method-icon">🏦</span>
        <span class="method-name">${t("wiz_method_bank")}</span>
      </button>
    </div>
    ${wizardPaymentMethod ? `<p class="method-info">${wizardPaymentMethod === "card" ? t("wiz_method_card_info") : ""}</p>` : ""}`;
}

function renderStep3() {
  const plan = PLANS[wizardSelectedPlan];
  const planName = t(`plan_${wizardSelectedPlan}_name`);
  const isSelecto = plan.initial !== undefined;
  const prefix = isSelecto ? plan.initial + " + " : "";
  const priceDisplay =
    wizardPaymentType === "monthly"
      ? prefix + plan.monthly + t("plan_mo")
      : prefix +
        plan.annual +
        t("wiz_yr") +
        (currentLang === "es" ? " (oferta lanzamiento)" : " (launch offer)");

  // Get billing mode display
  const billingMode =
    wizardPaymentType === "monthly"
      ? t("wiz_monthly_title")
      : t("wiz_annual_title");

  // Get payment method display
  const getMethodDisplay = () => {
    switch (wizardPaymentMethod) {
      case "card":
        return t("wiz_method_card");
      case "zelle":
        return t("wiz_method_zelle");
      case "bank":
        return t("wiz_method_bank");
      default:
        return wizardPaymentMethod || "-";
    }
  };

  return `
    <div class="summary-box">
      <h4>${t("wiz_summary_title")}</h4>
      <div class="summary-row"><span class="label">${t("wiz_sum_plan")}</span><span class="value">${planName}</span></div>
      <div class="summary-row"><span class="label">${t("wiz_sum_billing")}</span><span class="value">${billingMode}</span></div>
      <div class="summary-row"><span class="label">${t("wiz_sum_method")}</span><span class="value">${getMethodDisplay()}</span></div>
      <div class="summary-row"><span class="label">${t("wiz_sum_payment")}</span><span class="value highlight">${priceDisplay}</span></div>
      <div class="summary-row"><span class="label">${t("wiz_sum_buyer")}</span><span class="value">${escapeHTML(wizardBuyer.name)} ${escapeHTML(wizardBuyer.lastName)}</span></div>
      <div class="summary-row"><span class="label">${t("wiz_sum_members")}</span><span class="value">${wizardFamily.length}</span></div>
    </div>
    <div class="contract-box">
      <h4>${t("wiz_contract_title")}</h4>
      <div class="contract-text">
        <p><strong>${t("wiz_contract_p0")}</strong></p>
        <p>${t("wiz_contract_p1")}</p><p>${t("wiz_contract_p2")}</p>
        <p>${t("wiz_contract_p3")}</p><p>${t("wiz_contract_p4")}</p>
      </div>
      <label class="checkbox-row">
        <input type="checkbox" id="terms-check" ${wizardAcceptedTerms ? "checked" : ""}>
        <span class="text">${t("wiz_contract_chk")}</span>
      </label>
    </div>`;
}

/* =============================================================================
   CARD CONFIRM STEP — flujo de confirmación de datos para pago con tarjeta
   ============================================================================= */
function renderCardConfirmStep() {
  const plan = PLANS[wizardSelectedPlan];
  const planName = t(`plan_${wizardSelectedPlan}_name`);
  const isSelecto = plan.initial !== undefined;
  const prefix = isSelecto ? plan.initial + " + " : "";
  const priceDisplay =
    wizardPaymentType === "monthly"
      ? prefix + plan.monthly + t("plan_mo")
      : prefix + plan.annual + t("wiz_yr");

  const body = $("#wizard-body");
  if (!body) return;

  // If showing stripe form, render it
  if (wizardCardConfirmStep === "stripe-form") {
    body.innerHTML = `
      <div class="stripe-card-form">
        <h3 style="text-align:center;margin-bottom:0.5rem">${t("stripe_enter_card")}</h3>
        <p style="color:var(--muted-foreground);text-align:center;font-size:0.875rem;margin-bottom:1.5rem">
          ${t("stripe_verify_title")}: ${planName} - ${priceDisplay}
        </p>
        <div id="stripe-card-element" style="padding:1rem;border:1.5px solid var(--border);border-radius:var(--radius);background:var(--background);margin-bottom:0.75rem;min-height:44px"></div>
        <div id="stripe-error-msg" class="form-error" style="display:none;margin-bottom:0.75rem"></div>
        <div class="wizard-footer-card">
          <button id="stripe-back-btn" class="btn-outline">${t("stripe_back_btn")}</button>
          <button id="stripe-pay-btn" class="btn-gold">${t("stripe_pay_btn")}</button>
        </div>
      </div>`;
    bindWizardStepEvents();
    return;
  }

  // Default: show data confirmation
  body.innerHTML = `
    <div class="card-confirm-box">
      <h3 style="text-align:center;margin-bottom:0.5rem">${t("stripe_card_title")}</h3>
      <p style="color:var(--muted-foreground);text-align:center;font-size:0.875rem;margin-bottom:1.5rem">${t("stripe_card_subtitle")}</p>

      <div class="confirm-section">
        <h4 class="confirm-section-title">${t("stripe_plan_label")}</h4>
        <div class="confirm-row">
          <span class="confirm-label">${t("wiz_sum_plan")}</span>
          <span class="confirm-value">${planName}</span>
        </div>
        <div class="confirm-row">
          <span class="confirm-label">${t("wiz_sum_payment")}</span>
          <span class="confirm-value highlight">${priceDisplay}</span>
        </div>
        <div class="confirm-row">
          <span class="confirm-label">${t("stripe_method_label")}</span>
          <span class="confirm-value">💳 ${t("wiz_method_card")}</span>
        </div>
      </div>

      <div class="confirm-section">
        <h4 class="confirm-section-title">${t("wiz_sum_buyer")}</h4>
        <div class="confirm-row">
          <span class="confirm-label">${t("wiz_fname")} ${t("wiz_lname")}</span>
          <span class="confirm-value">${escapeHTML(wizardBuyer.name)} ${escapeHTML(wizardBuyer.lastName)}</span>
        </div>
        <div class="confirm-row">
          <span class="confirm-label">${t("wiz_cedula")}</span>
          <span class="confirm-value">${escapeHTML(wizardBuyer.cedula)}</span>
        </div>
        <div class="confirm-row">
          <span class="confirm-label">${t("wiz_email")}</span>
          <span class="confirm-value">${escapeHTML(wizardBuyer.email)}</span>
        </div>
        <div class="confirm-row">
          <span class="confirm-label">${t("wiz_phone")}</span>
          <span class="confirm-value">${escapeHTML(wizardBuyer.phone)}</span>
        </div>
      </div>

      ${
        wizardFamily.length > 0
          ? `
      <div class="confirm-section">
        <h4 class="confirm-section-title">${t("wiz_sum_members")} (${wizardFamily.length})</h4>
        ${wizardFamily
          .map(
            (m, i) => `
          <div class="confirm-row">
            <span class="confirm-label">${escapeHTML(m.name)} ${escapeHTML(m.lastName)}</span>
            <span class="confirm-value">${escapeHTML(m.relationship || "-")}</span>
          </div>
        `,
          )
          .join("")}
      </div>
      `
          : ""
      }

      <div class="wizard-footer-card" style="margin-top:1.5rem">
        <button id="card-confirm-back-btn" class="btn-outline">${t("stripe_back_btn")}</button>
        <button id="card-confirm-next-btn" class="btn-gold">${t("stripe_confirm_btn")}</button>
      </div>
    </div>`;
  bindWizardStepEvents();
}

function updateCardConfirmFooter() {
  // Hide normal wizard footer when in card confirm flow
  const normalFooter = $("#wizard-footer");
  if (normalFooter) normalFooter.style.display = "none";
}
function validateAge(dateStr, maxAge) {
  if (!dateStr) return true;
  const birth = new Date(dateStr);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age <= (maxAge || 65);
}

function bindWizardStepEvents() {
  if (wizardStep === 0) {
    const maxAge = PLANS[wizardSelectedPlan]?.maxAge || 65;
    ["name", "lastName", "cedula", "phone", "email", "birthDate"].forEach(
      (field) => {
        const el = $(`#wf-${field}`);
        if (!el) return;
        el.addEventListener("input", () => {
          wizardBuyer[field] = el.value;
          if (field === "birthDate") {
            const err = $("#age-error");
            if (err)
              err.style.display = !validateAge(el.value, maxAge) ? "" : "none";
          }
          updateWizardFooter();
        });
      },
    );
  }
  if (wizardStep === 1) {
    const maxAge = PLANS[wizardSelectedPlan]?.maxAge || 65;
    $$(".family-remove-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        wizardFamily.splice(parseInt(btn.dataset.remove), 1);
        renderWizardStep();
        updateWizardFooter();
      });
    });
    $$(".fm-input").forEach((input) => {
      input.addEventListener("input", () => {
        wizardFamily[parseInt(input.dataset.idx)][input.dataset.field] =
          input.value;
        updateWizardFooter();
      });
    });
    $("#btn-add-family")?.addEventListener("click", () => {
      if (wizardFamily.length < 6) {
        wizardFamily.push({
          name: "",
          lastName: "",
          cedula: "",
          phone: "",
          birthDate: "",
          relationship: "",
        });
        renderWizardStep();
        updateWizardFooter();
      }
    });
  }
  if (wizardStep === 2) {
    // Billing mode (monthly/annual) selection
    $$(".payment-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        wizardPaymentType = btn.dataset.type;
        $$(".payment-option").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        updateWizardFooter();
      });
    });
    // Payment method (card/zelle/bank) selection
    $$(".payment-method").forEach((btn) => {
      btn.addEventListener("click", () => {
        wizardPaymentMethod = btn.dataset.method;
        $$(".payment-method").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        renderWizardStep(); // Re-render to show info message
        updateWizardFooter();
      });
    });
  }

  // Card confirmation step events
  if (wizardCardConfirmStep === "confirmation") {
    const confirmBtn = $("#card-confirm-next-btn");
    const backBtn = $("#card-confirm-back-btn");
    if (confirmBtn) {
      confirmBtn.addEventListener("click", async () => {
        // Call webhook to get client_secret
        confirmBtn.disabled = true;
        confirmBtn.textContent = t("stripe_processing");
        try {
          const payload = {
            intent: "create_payment_intent",
            plan: wizardSelectedPlan,
            paymentType: wizardPaymentType,
            buyer: wizardBuyer,
            family: wizardFamily,
            timestamp: new Date().toISOString(),
          };
          window.__lastWizardPayload = payload;

          const resp = await fetch(WIZARD_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          if (!resp.ok) throw new Error("HTTP " + resp.status);
          const data = await resp.json().catch(() => ({}));

          if (data?.client_secret) {
            wizardCardConfirmStep = "stripe-form";
            __wizardClientSecret = data.client_secret;
            renderCardConfirmStep();
            updateCardConfirmFooter();
          } else if (data?.checkoutUrl) {
            window.open(data.checkoutUrl, "_blank");
            showToast(
              currentLang === "es"
                ? "Abriendo pasarela de pago..."
                : "Opening payment gateway...",
              "info",
            );
          } else {
            // Fallback: proceed to stripe form anyway (for testing)
            wizardCardConfirmStep = "stripe-form";
            renderCardConfirmStep();
            updateCardConfirmFooter();
          }
        } catch (err) {
          console.error("Payment intent error:", err);
          showToast(
            currentLang === "es"
              ? "Error al procesar. Intenta de nuevo."
              : "Error processing. Try again.",
            "error",
          );
        } finally {
          confirmBtn.disabled = false;
          confirmBtn.textContent = t("stripe_confirm_btn");
        }
      });
    }
    if (backBtn) {
      backBtn.addEventListener("click", () => {
        wizardCardConfirmStep = false;
        $("#wizard-footer").style.display = "";
        renderWizardStep();
        updateWizardFooter();
      });
    }
  }

  // Stripe form step events
  if (wizardCardConfirmStep === "stripe-form") {
    const payBtn = $("#stripe-pay-btn");
    const backBtn = $("#stripe-back-btn");
    const errEl = $("#stripe-error-msg");

    // Initialize Stripe Elements
    if (!__stripe) __stripe = Stripe(STRIPE_PUBLISHABLE_KEY);
    if (!__elements) __elements = __stripe.elements();

    if (__cardElement) {
      __cardElement.unmount();
    }
    __cardElement = __elements.create("card", {
      style: {
        base: {
          fontSize: "16px",
          color: "#1f2937",
          fontFamily: "system-ui, sans-serif",
          "::placeholder": { color: "#9ca3af" },
        },
        invalid: { color: "#ef4444" },
      },
    });
    __cardElement.mount("#stripe-card-element");
    __cardElement.on("change", (e) => {
      if (errEl) {
        errEl.textContent = e.error ? e.error.message : "";
        errEl.style.display = e.error ? "block" : "none";
      }
      if (payBtn) payBtn.disabled = false;
    });

    if (payBtn) {
      payBtn.addEventListener("click", async () => {
        payBtn.disabled = true;
        payBtn.textContent = t("stripe_processing");
        if (errEl) errEl.style.display = "none";

        try {
          const result = await __stripe.confirmCardPayment(
            __wizardClientSecret,
            {
              payment_method: {
                card: __cardElement,
                billing_details: {
                  name: wizardBuyer.name + " " + wizardBuyer.lastName,
                  email: wizardBuyer.email,
                  phone: wizardBuyer.phone,
                },
              },
            },
          );

          if (result.error) {
            if (errEl) {
              errEl.textContent = result.error.message;
              errEl.style.display = "block";
            }
            payBtn.disabled = false;
            payBtn.textContent = t("stripe_pay_btn");
            return;
          }

          if (result.paymentIntent?.status === "succeeded") {
            showPaymentSuccessScreen(wizardBuyer.email);
          }
        } catch (err) {
          console.error("Payment error:", err);
          if (errEl) {
            errEl.textContent =
              currentLang === "es"
                ? "Error en el pago. Intenta de nuevo."
                : "Payment error. Try again.";
            errEl.style.display = "block";
          }
          payBtn.disabled = false;
          payBtn.textContent = t("stripe_pay_btn");
        }
      });
    }

    if (backBtn) {
      backBtn.addEventListener("click", () => {
        wizardCardConfirmStep = "confirmation";
        renderCardConfirmStep();
        updateCardConfirmFooter();
      });
    }
  }
  if (wizardStep === 3) {
    $("#terms-check")?.addEventListener("change", (e) => {
      wizardAcceptedTerms = e.target.checked;
      updateWizardFooter();
    });
  }
}

function renderWizardFamilyStep() {
  if (wizardOpen && wizardStep === 1) renderWizardStep();
}

function canWizardNext() {
  if (wizardStep === 0) {
    const b = wizardBuyer;
    const maxAge = PLANS[wizardSelectedPlan]?.maxAge || 65;
    return !!(
      b.name &&
      b.lastName &&
      b.cedula &&
      b.phone &&
      b.email &&
      b.birthDate &&
      validateAge(b.birthDate, maxAge)
    );
  }
  if (wizardStep === 1) return true;
  if (wizardStep === 2)
    return !!(wizardSelectedPlan && wizardPaymentType && wizardPaymentMethod);
  if (wizardStep === 3) return wizardAcceptedTerms;
  return true;
}

function updateWizardFooter() {
  // Ocultar footer cuando estamos en flujo de confirmación de tarjeta
  if (wizardCardConfirmStep) {
    const footer = $("#wizard-footer");
    if (footer) footer.style.display = "none";
    return;
  }

  const footer = $("#wizard-footer");
  if (footer) footer.style.display = "";

  const backBtn = $("#wizard-back-btn");
  const nextBtn = $("#wizard-next-btn");
  if (backBtn) backBtn.classList.toggle("hidden", wizardStep === 0);
  if (nextBtn) {
    nextBtn.disabled = !canWizardNext();
    if (wizardStep === 3) {
      nextBtn.textContent = t("wiz_confirm");
    } else {
      nextBtn.innerHTML =
        t("wiz_next") +
        ` <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;
    }
  }
}

function wizardNext() {
  if (!canWizardNext()) return;

  // Si estamos en el paso 2 (pago) y se seleccionó tarjeta
  if (wizardStep === 2 && wizardPaymentMethod === "card") {
    // Mostrar pantalla de confirmación de datos
    wizardCardConfirmStep = "confirmation";
    renderCardConfirmStep();
    updateCardConfirmFooter();
    return;
  }

  // Si estamos en paso normal
  if (wizardStep < 3) {
    wizardStep++;
    renderWizardContent();
  } else {
    // Paso 3 - solo Zelle o bank, no tarjeta (tarjeta ya pasó por su flujo)
    submitWizard();
  }
}

function wizardBack() {
  // Si estamos en el flujo de confirmación de tarjeta
  if (wizardCardConfirmStep) {
    wizardCardConfirmStep = false;
    $("#wizard-footer").style.display = "";
    renderWizardStep();
    updateWizardFooter();
    return;
  }

  if (wizardStep > 0) {
    wizardStep--;
    renderWizardContent();
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   INCLUSION DEL WEBHOOK AL FLUJO
   ══════════════════════════════════════════════════════════════════════════ */
async function submitWizard() {
  const payload = {
    paymentMethod: wizardPaymentMethod,
    plan: wizardSelectedPlan,
    paymentType: wizardPaymentType,
    buyer: wizardBuyer,
    family: wizardFamily,
    timestamp: new Date().toISOString(),
  };

  // Save payload globally so follow-up functions can reference it
  window.__lastWizardPayload = payload;

  setWizardProcessing(true);

  try {
    const resp = await fetch(WIZARD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // If developer didn't set the webhook URL placeholder, avoid firing a request
    if (
      WIZARD_WEBHOOK_URL.includes("TU-N8N") ||
      !WIZARD_WEBHOOK_URL.startsWith("http")
    ) {
      setWizardProcessing(false);
      showWizardInfo(
        currentLang === "es"
          ? "Webhook no configurado"
          : "Webhook not configured",
        null,
        currentLang === "es"
          ? "Por favor actualiza WIZARD_WEBHOOK_URL en js/main.js con la URL de tu n8n"
          : "Please update WIZARD_WEBHOOK_URL in js/main.js with your n8n URL",
      );
      return;
    }

    if (!resp.ok) throw new Error("HTTP " + resp.status);

    // Try to parse as JSON; if it fails, treat as success
    let data;
    try {
      data = await resp.json();
    } catch {
      data = null;
    }

    // If webhook returned chips (quick replies), show them
    if (data?.chips) {
      const chips = Array.isArray(data.chips) ? data.chips : [];
      showWizardMessageWithChips(
        data.message ||
          (currentLang === "es" ? "Respuesta del servidor" : "Server response"),
        chips,
      );
      setWizardProcessing(false);
      return;
    }

    // If webhook returned a client_secret (PaymentIntent flow), render Stripe Elements to collect card
    if (data?.client_secret) {
      showPaymentIntentForm(data.client_secret, data.message || null);
      setWizardProcessing(false);
      return;
    }

    // If webhook suggests a redirect to checkout (e.g., Stripe Checkout), handle it
    const checkoutUrl = data?.checkoutUrl || data?.redirectUrl || data?.url;
    const success =
      data?.success === true || data?.ok === true || resp.status === 200;

    if (checkoutUrl) {
      const opened = window.open(checkoutUrl, "_blank");
      if (opened) {
        showToast(
          currentLang === "es"
            ? "Abriendo pasarela de pago..."
            : "Opening payment gateway...",
          "info",
        );
        setWizardProcessing(false);
        closeWizard();
        return;
      } else {
        showWizardInfo(
          currentLang === "es"
            ? "Se ha generado la pasarela de pago. Haz click en el enlace para continuar."
            : "A payment session was created. Click the link to continue.",
          checkoutUrl,
        );
        setWizardProcessing(false);
        return;
      }
    }

    if (success) {
      showToast(t("toast_confirm"), "success");
      setWizardProcessing(false);
      closeWizard();
      return;
    }

    // Fallback: show webhook response as info for debugging
    console.warn("Webhook response:", data);
    if (data?.instructions) {
      showWizardInfo(
        currentLang === "es"
          ? "Instrucciones de pago:"
          : "Payment instructions:",
        null,
        data.instructions,
      );
      setWizardProcessing(false);
      return;
    }
    showToast(
      currentLang === "es"
        ? "Solicitud enviada. Revisaremos y contactaremos."
        : "Request submitted. We'll review and contact you.",
      "success",
    );
    setWizardProcessing(false);
    closeWizard();
  } catch (e) {
    console.error("Webhook error:", e);
    showWizardError(
      currentLang === "es"
        ? "Error de conexión. Por favor intenta de nuevo."
        : "Connection error. Please try again.",
    );
    setWizardProcessing(false);
  }
}

/* Helper para controlar estado de processing dentro del wizard */
function setWizardProcessing(on) {
  const overlay = $("#wizard-overlay");
  const nextBtn = $("#wizard-next-btn");
  const backBtn = $("#wizard-back-btn");
  if (nextBtn) nextBtn.disabled = on;
  if (backBtn) backBtn.disabled = on;
  if (overlay) overlay.classList.toggle("wizard-processing", !!on);
}

/* Muestra un mensaje informativo dentro del wizard */
function showWizardInfo(title, link, text) {
  const body = $("#wizard-body");
  if (!body) {
    showToast(text || title, "info");
    return;
  }
  const htmlParts = [];
  if (title)
    htmlParts.push(`<div class="wizard-info-title">${escapeHTML(title)}</div>`);
  if (text)
    htmlParts.push(`<div class="wizard-info-text">${escapeHTML(text)}</div>`);
  if (link)
    htmlParts.push(
      `<div class="wizard-info-link"><a href="${escapeHTML(link)}" target="_blank" rel="noopener">${link}</a></div>`,
    );
  htmlParts.push(
    '<div style="margin-top:1rem"><button id="wizard-retry-btn" class="btn-outline">Volver a intentar</button></div>',
  );
  body.innerHTML = htmlParts.join("");
  $("#wizard-retry-btn")?.addEventListener("click", () => {
    renderWizardContent();
  });
}

/* Muestra un error dentro del wizard con botón reintentar */
function showWizardError(msg) {
  const body = $("#wizard-body");
  if (!body) {
    showToast(msg, "error");
    return;
  }
  body.innerHTML = `<div class="wizard-error">${escapeHTML(msg)}</div><div style="margin-top:1rem"><button id="wizard-retry-btn" class="btn-outline">Reintentar</button></div>`;
  $("#wizard-retry-btn")?.addEventListener("click", () => {
    renderWizardContent();
  });
}

/* Muestra un mensaje con "chips" (opciones rápidas) devueltas por el webhook */
function showWizardMessageWithChips(message, chips) {
  const body = $("#wizard-body");
  if (!body) {
    showToast(message, "info");
    return;
  }
  const parts = [];
  parts.push(`<div class="wizard-info-title">${escapeHTML(message)}</div>`);
  if (chips && chips.length) {
    parts.push(
      '<div class="wizard-chips" style="margin-top:1rem;display:flex;gap:0.5rem;flex-wrap:wrap">',
    );
    chips.forEach((c, i) => {
      parts.push(
        `<button class="wizard-chip btn-outline" data-chip-idx="${i}">${escapeHTML(c)}</button>`,
      );
    });
    parts.push("</div>");
  }
  parts.push(
    '<div style="margin-top:1rem"><button id="wizard-retry-btn" class="btn-outline">Cancelar</button></div>',
  );
  body.innerHTML = parts.join("");

  $$(".wizard-chip").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const idx = parseInt(btn.dataset.chipIdx);
      const text = chips[idx];
      try {
        setWizardProcessing(true);
        const follow = {
          ...window.__lastWizardPayload,
          reply: text,
        };
        const resp = await fetch(WIZARD_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(follow),
        });
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        const data = await resp.json().catch(() => null);
        const checkoutUrl = data?.checkoutUrl || data?.redirectUrl || data?.url;
        if (checkoutUrl) {
          window.open(checkoutUrl, "_blank");
          showToast(
            currentLang === "es"
              ? "Abriendo pasarela de pago..."
              : "Opening payment gateway...",
            "info",
          );
          setWizardProcessing(false);
          closeWizard();
          return;
        }
        if (data?.message || data?.instructions) {
          showWizardInfo(
            data.message ||
              (currentLang === "es" ? "Instrucciones:" : "Instructions:"),
            null,
            data.instructions || data.message,
          );
          setWizardProcessing(false);
          return;
        }
        if (data?.success) {
          showToast(t("toast_confirm"), "success");
          setWizardProcessing(false);
          closeWizard();
          return;
        }
        if (data?.message)
          showWizardMessageWithChips(data.message, data.chips || []);
        else renderWizardContent();
      } catch (e) {
        console.error("Follow-up webhook error:", e);
        showWizardError(
          currentLang === "es"
            ? "Error al procesar la opción. Intenta de nuevo."
            : "Error processing option. Try again.",
        );
        setWizardProcessing(false);
      }
    });
  });

  $("#wizard-retry-btn")?.addEventListener("click", () => {
    renderWizardContent();
  });
}

/* Render Stripe Elements form inside the wizard when server returns client_secret */
function showPaymentIntentForm(clientSecret, message) {
  const body = $("#wizard-body");
  if (!body) return showToast("Payment init error", "error");

  body.innerHTML = `
    <div class="payment-intent-box">
      ${message ? `<div class="wizard-info-text">${escapeHTML(message)}</div>` : ""}
      <div id="card-element" style="margin-top:1rem"></div>
      <div id="card-errors" class="form-error" style="margin-top:0.75rem"></div>
      <div style="margin-top:1rem"><button id="card-pay-btn" class="btn-gold">${t("wiz_confirm")}</button></div>
    </div>`;

  if (!__stripe) __stripe = Stripe(STRIPE_PUBLISHABLE_KEY);
  if (!__elements) __elements = __stripe.elements();
  if (__cardElement) {
    __cardElement.unmount();
    __cardElement = null;
  }
  __cardElement = __elements.create("card", {
    style: { base: { fontSize: "16px" } },
  });
  __cardElement.mount("#card-element");

  const payBtn = $("#card-pay-btn");
  payBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    payBtn.disabled = true;
    $("#card-errors").textContent = "";
    setWizardProcessing(true);
    try {
      const res = await __stripe.confirmCardPayment(clientSecret, {
        payment_method: { card: __cardElement },
      });
      if (res.error) {
        $("#card-errors").textContent = res.error.message || "Payment failed";
        setWizardProcessing(false);
        payBtn.disabled = false;
        return;
      }
      if (res.paymentIntent && res.paymentIntent.status === "succeeded") {
        const notify = {
          ...window.__lastWizardPayload,
          intent: "payment_success",
          paymentIntentId: res.paymentIntent.id,
        };
        try {
          const r = await fetch(WIZARD_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(notify),
          });
          if (!r.ok) throw new Error("HTTP " + r.status);
          const data = await r.json().catch(() => null);
          if (data?.message)
            showWizardInfo(data.message, null, data.instructions || null);
          else if (data?.success) {
            showToast(t("toast_confirm"), "success");
            closeWizard();
          } else {
            showToast(t("toast_confirm"), "success");
            closeWizard();
          }
        } catch (err) {
          console.error("Notify payment success error:", err);
          showToast(
            "Pago realizado, pero error al notificar al servidor. Contacta soporte.",
            "error",
          );
        }
      }
    } catch (err) {
      console.error("confirmCardPayment error", err);
      $("#card-errors").textContent =
        "Error procesando pago. Intenta de nuevo.";
    } finally {
      setWizardProcessing(false);
      payBtn.disabled = false;
    }
  });
}

function initWizard() {
  /* Botones de planes — creados dinámicamente por renderPlans().
     Delegación para capturar clicks en .plan-btn-primary con data-plan */
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".plan-btn-primary[data-plan]");
    if (btn && btn.dataset.plan) openWizard(btn.dataset.plan);
  });

  $("#wizard-overlay")?.addEventListener("click", (e) => {
    if (e.target === $("#wizard-overlay")) closeWizard();
  });
  $("#wizard-close-btn")?.addEventListener("click", closeWizard);
  $("#wizard-next-btn")?.addEventListener("click", wizardNext);
  $("#wizard-back-btn")?.addEventListener("click", wizardBack);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && wizardOpen) closeWizard();
  });
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
   ICONS (SVG inline reutilizables)
   ============================================================================= */
function chatIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>`;
}
function alertIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
}

/* =============================================================================
   INIT — punto de entrada
   ============================================================================= */
document.addEventListener("DOMContentLoaded", () => {
  /* Botones de cambio de idioma */
  $$("[data-toggle-lang]").forEach((btn) =>
    btn.addEventListener("click", toggleLang),
  );

  /* Render inicial de secciones dinámicas */
  renderPlans();
  renderSteps();
  renderTestimonials();
  applyLanguage();

  /* Configurar IntersectionObserver para animaciones reveal */
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
  initChat();
  initWizard();
  initReveal();

  console.log("LEGADO v4 initialized ✓");
});
