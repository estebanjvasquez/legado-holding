/* =============================================================================
   Pipeline de checkout — port directo de n8n LEGADO_PostPayment_v7.
   Pasos:
     1. normalize(body)            ← Parse & Validate Request
     2. routing por intent         ← Route by Intent (solo create_payment_intent)
     3. resolveClient(IN, ctx)     ← Search Client by Email + Create Client
     4. buildInvoiceContext        ← Build Invoice Context (products + subs)
     5. createInvoices             ← Create Invoices (recurring + send_now +
                                     polling + Selecto PUT + invitation link)
     6. emailInvoice               ← Reemplaza el nodo Gmail (lo hace IN)
     7. responde JSON con la misma forma que esperaba el wizard
   ============================================================================= */

import { createIN } from "./invoiceninja.js";

const SLUG_TO_IN = {
  "esencial-selecto":   "esencial-ven",
  "vanguardia-selecto": "vanguardia-ven",
};

const PLAN_NAMES = {
  "esencial-zulia":   "Plan Esencial Zulia",
  "vanguardia-zulia": "Plan Vanguardia Zulia",
  "esencial-ven":     "Plan Esencial Grupo Selecto",
  "vanguardia-ven":   "Plan Vanguardia Grupo Selecto",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── 1. Parse & validate ───────────────────────────────────────────────── */
function normalize(body) {
  const intent      = (body.intent      || "").toLowerCase();
  const plan        = body.plan         || null;
  const paymentType = (body.paymentType || "monthly").toLowerCase();
  const buyer       = body.buyer        || {};

  const buyerName     = (buyer.name     || "").trim();
  const buyerLastName = (buyer.lastName || "").trim();
  const buyerEmail    = (buyer.email    || "").toLowerCase().trim();

  if (!buyerEmail) throw new Error("Email del comprador es requerido");
  if (!plan)       throw new Error("Plan es requerido");

  const planFamily = SLUG_TO_IN[plan] || plan;
  const isVen      = planFamily.endsWith("-ven");
  const planName   = PLAN_NAMES[planFamily] || plan;

  const frequencyLabel = paymentType === "annual" ? "Annualy" : "Monthly";
  const frequencyId    = paymentType === "annual" ? 9 : 4;

  const familyRaw = Array.isArray(body.family) ? body.family : [];
  const family = familyRaw
    .map((f) => ({
      name:      (f.name      || "").trim(),
      lastName:  (f.lastName  || "").trim(),
      cedula:    (f.cedula    || "").trim(),
      birthDate: (f.birthDate || "").trim(),
      relation:  (f.relation  || f.kinship || "").trim(),
    }))
    .filter((f) => f.name || f.lastName);

  const familyText =
    family.length === 0
      ? "Sin familiares afiliados"
      : family
          .map(
            (f, i) =>
              `${i + 1}. ${f.name} ${f.lastName}` +
              (f.cedula    ? ` · CI: ${f.cedula}`     : "") +
              (f.birthDate ? ` · Nac: ${f.birthDate}` : "") +
              (f.relation  ? ` · ${f.relation}`       : ""),
          )
          .join("\n");

  const clientPrivateNotes =
    `[Wizard ${new Date().toISOString().split("T")[0]}] ${planName} (${paymentType})\n` +
    `Comprador: ${buyerName} ${buyerLastName} (CI: ${buyer.cedula || "s/CI"}, Tel: ${buyer.phone || "s/Tel"})\n` +
    (buyer.birthDate ? `Nacimiento: ${buyer.birthDate}\n` : "") +
    (buyer.zip       ? `ZIP: ${buyer.zip}\n`              : "") +
    `Familiares (${family.length}):\n${familyText}`;

  return {
    intent, plan, planFamily, planName, paymentType,
    isVen, frequencyLabel, frequencyId,
    buyer: {
      name:      buyerName,
      lastName:  buyerLastName,
      email:     buyerEmail,
      phone:     buyer.phone     || "",
      cedula:    buyer.cedula    || "",
      birthDate: buyer.birthDate || "",
      zip:       buyer.zip       || "",
    },
    family, familyText, clientPrivateNotes,
    customerEmail:  buyerEmail,
    customerName:   (buyerName + " " + buyerLastName).trim(),
    firstName:      buyerName,
    lastName:       buyerLastName,
    customerPhone:  buyer.phone  || "",
    customerCedula: buyer.cedula || "",
  };
}

/* ── 3. Search/Create client ───────────────────────────────────────────── */
async function resolveClient(IN, ctx) {
  const resp = await IN.searchClientByEmail(ctx.customerEmail);
  const list = resp && Array.isArray(resp.data) ? resp.data : [];
  const existing = list.find((c) =>
    (c.contacts || []).some(
      (ct) =>
        ct.email && ct.email.toLowerCase().trim() === ctx.customerEmail,
    ),
  );
  if (existing) {
    console.log(`Client found id=${existing.id}`);
    return existing.id;
  }

  console.log(`Creating new client for ${ctx.customerEmail}`);
  const createResp = await IN.createClient({
    name:          ctx.customerName,
    vat_number:    ctx.customerCedula,
    phone:         ctx.customerPhone,
    postal_code:   ctx.buyer.zip,
    private_notes: ctx.clientPrivateNotes,
    contacts: [
      {
        first_name: ctx.firstName,
        last_name:  ctx.lastName,
        email:      ctx.customerEmail,
        phone:      ctx.customerPhone,
        send_email: true,
      },
    ],
  });
  const created = createResp.data || createResp;
  if (!created || !created.id) {
    throw new Error("No se pudo crear el cliente: " + JSON.stringify(createResp));
  }
  console.log(`Client created id=${created.id}`);
  return created.id;
}

/* ── 4. Build invoice context ──────────────────────────────────────────── */
async function buildInvoiceContext(IN, ctx) {
  /* Paralelizar lecturas: products y subscriptions son independientes. */
  const [prodResp, subsResp] = await Promise.all([
    IN.listProducts(),
    IN.listSubscriptions().catch((e) => {
      console.warn(`listSubscriptions falló: ${e.message}`);
      return { data: [] };
    }),
  ]);

  const allProducts = (prodResp.data || []).filter(
    (p) => !p.is_deleted && p.custom_value1 === "legadoweb",
  );
  const familyProducts = allProducts.filter(
    (p) => p.custom_value3 === ctx.planFamily,
  );
  if (familyProducts.length === 0) {
    throw new Error(
      `Sin productos para familia '${ctx.planFamily}' (slug: '${ctx.plan}'). Revisar custom_value3.`,
    );
  }

  let strategy, strategyLabel, lineItems1, lineItems2, frequencyId2;
  let recurringProductId = "";
  let oneTimeProductId   = "";

  if (ctx.isVen) {
    const unicoProd   = familyProducts.find((p) => (p.custom_value2 || "").toLowerCase() === "unico");
    const monthlyProd = familyProducts.find((p) => (p.custom_value2 || "").toLowerCase() === "monthly");
    if (!unicoProd)   throw new Error(`Producto 'Unico' no encontrado para '${ctx.planFamily}'`);
    if (!monthlyProd) throw new Error(`Producto 'Monthly' no encontrado para '${ctx.planFamily}'`);

    strategy      = "ven";
    strategyLabel = "Suscripción mensual (con cuota inicial)";
    lineItems1 = [
      { product_key: unicoProd.product_key,   notes: unicoProd.notes || "Cuota inicial del plan", cost: unicoProd.price,   qty: 1 },
      { product_key: monthlyProd.product_key, notes: "Primer mes de mensualidad",                  cost: monthlyProd.price, qty: 1 },
    ];
    lineItems2 = [
      { product_key: monthlyProd.product_key, notes: monthlyProd.notes || "Mensualidad del plan", cost: monthlyProd.price, qty: 1 },
    ];
    frequencyId2       = 4;
    recurringProductId = monthlyProd.id;
    oneTimeProductId   = unicoProd.id;
  } else {
    const targetProd = familyProducts.find(
      (p) => (p.custom_value2 || "").toLowerCase() === ctx.frequencyLabel.toLowerCase(),
    );
    if (!targetProd) {
      throw new Error(
        `Producto no encontrado para '${ctx.planFamily}' con frecuencia '${ctx.frequencyLabel}'`,
      );
    }
    strategy      = ctx.paymentType === "annual" ? "zulia-annual"  : "zulia-monthly";
    strategyLabel = ctx.paymentType === "annual" ? "Suscripción anual" : "Suscripción mensual";
    lineItems1    = [
      { product_key: targetProd.product_key, notes: targetProd.notes || "", cost: targetProd.price, qty: 1 },
    ];
    lineItems2 = null;
    frequencyId2 = null;
    recurringProductId = targetProd.id;
  }

  /* Subscription template — opcional. Solo se consulta; ya no se intenta
     auto-crear porque IN devuelve 500 consistentemente. El subscription_id
     solo afecta el link visual del portal del cliente, no el cobro. Si
     alguien lo crea manualmente en IN con el nombre esperado, se enlaza. */
  const freqNameForName  = ctx.isVen ? "monthly" : ctx.paymentType;
  const subscriptionName = `legadoweb-${ctx.planFamily}-${freqNameForName}`;
  const allSubs = subsResp.data || [];
  const subscription = allSubs.find(
    (s) => s.name === subscriptionName && !s.is_deleted,
  );
  const subscriptionId = subscription?.id || null;

  return {
    strategy, strategyLabel,
    lineItems1, lineItems2, frequencyId2,
    subscriptionId, subscriptionName,
  };
}

/* ── 5. Create invoices ────────────────────────────────────────────────── */
function toLineItems(items) {
  return items.map((li) => ({
    product_key: li.product_key,
    notes:       li.notes || "",
    cost:        li.cost,
    quantity:    li.qty   || 1,
  }));
}

async function createInvoices(IN, ctx, invCtx, executionCtx) {
  const invoiceTotal = invCtx.lineItems1
    .reduce((sum, li) => sum + li.cost * (li.qty || 1), 0)
    .toFixed(2);

  const publicNotes =
    `${ctx.planName} — ${invCtx.strategyLabel}\n` +
    `Titular: ${ctx.customerName}\n` +
    `Familiares afiliados (${ctx.family.length}/6):\n${ctx.familyText}`;

  const today = new Date().toISOString().split("T")[0];
  const recurringFreqId = ctx.isVen ? invCtx.frequencyId2 : ctx.frequencyId;

  const recurringBody = {
    client_id:        ctx.clientId,
    frequency_id:     recurringFreqId,
    status_id:        2,
    auto_bill:        "off",
    next_send_date:   today,
    remaining_cycles: -1,
    line_items:       toLineItems(invCtx.lineItems1),
    public_notes:     publicNotes,
  };
  if (invCtx.subscriptionId) recurringBody.subscription_id = invCtx.subscriptionId;

  const recResp = await IN.createRecurringInvoice(recurringBody);
  const recurring = recResp.data || recResp;
  if (!recurring.id) {
    throw new Error("Error creando suscripción: " + JSON.stringify(recResp));
  }
  const recurringId = recurring.id;
  console.log(`Recurring invoice created id=${recurringId}`);

  await IN.bulkRecurring("send_now", [recurringId]);
  console.log(`send_now triggered for ${recurringId}`);

  /* Polling — el cron de IN genera la primera factura asíncronamente.
     Patrón: chequear primero (suele estar listo), dormir entre intentos
     con intervalos cortos (400ms). Hasta 12 intentos = ~4.4s worst case. */
  let firstInvoice = null;
  for (let attempt = 0; attempt < 12 && !firstInvoice; attempt++) {
    if (attempt > 0) await sleep(400);
    const listResp = await IN.listInvoicesByClient(ctx.clientId);
    const list = (listResp.data || []).filter(
      (inv) => inv.recurring_id === recurringId,
    );
    console.log(`Poll ${attempt + 1}/12: ${list.length} matches`);
    if (list.length > 0) firstInvoice = list[0];
  }

  if (!firstInvoice || !firstInvoice.id) {
    throw new Error(
      `Factura inicial no generada (recurring_id=${recurringId}). Verifica el cron de Invoice Ninja.`,
    );
  }

  /* Selecto: quitar 'Unico' para ciclos siguientes. Se hace en background
     porque no afecta la respuesta al usuario — debe completarse antes
     del siguiente ciclo (un mes), no del próximo response. */
  if (ctx.isVen && invCtx.lineItems2) {
    const removeUnicoPromise = IN.updateRecurringInvoice(recurringId, {
      line_items: toLineItems(invCtx.lineItems2),
    })
      .then(() => console.log("Selecto: Unico removido (background)"))
      .catch((e) => console.error(`Selecto PUT falló: ${e.message}`));
    if (executionCtx?.waitUntil) {
      executionCtx.waitUntil(removeUnicoPromise);
    } else {
      await removeUnicoPromise;
    }
  }

  const invFull = await IN.getInvoiceWithInvitations(firstInvoice.id);
  const invData = invFull.data || invFull;
  const invLink =
    invData.invitations && invData.invitations[0]
      ? invData.invitations[0].link
      : "";

  return {
    recurringId,
    invoiceId:      firstInvoice.id,
    invoiceNumber:  firstInvoice.number || invData.number || "",
    invitationLink: invLink,
    invoiceTotal,
  };
}

/* ── 7. Orquestador público ──────────────────────────────────────────────
   executionCtx es el `ctx` del fetch handler del Worker; se usa para
   `waitUntil` y permitir que email + Selecto PUT corran en background
   sin bloquear la respuesta al usuario. */
export async function processCheckout(body, env, executionCtx) {
  const ctx = normalize(body);

  /* Route by Intent: solo create_payment_intent dispara el pipeline. */
  if (ctx.intent !== "create_payment_intent") {
    return {
      success: false,
      message: `Intent no reconocido: ${ctx.intent || "(vacío)"}`,
    };
  }

  const IN = createIN(env);
  console.log(`Checkout start: plan=${ctx.plan} email=${ctx.customerEmail}`);

  ctx.clientId = await resolveClient(IN, ctx);

  const invCtx = await buildInvoiceContext(IN, ctx);
  console.log(`Context built: strategy=${invCtx.strategy} sub=${invCtx.subscriptionId}`);

  const result = await createInvoices(IN, ctx, invCtx, executionCtx);
  console.log(`Invoice ${result.invoiceNumber} generated, link=${result.invitationLink ? "ok" : "missing"}`);

  /* 6. Email — reemplazo del nodo Gmail.
     EMAIL_MODE:
       'explicit' (default) → Worker llama POST /invoices/bulk action:email
       'auto'              → No llama; confía en "Email invoices automatically" de IN
       'none'              → Salta el email (útil para dev sin spamear)
     El email corre en background con waitUntil cuando hay executionCtx
     disponible: la respuesta llega al usuario antes; IN procesa el envío
     después. Si falla, queda en logs pero no rompe la UX. */
  const emailMode = (env.EMAIL_MODE || "explicit").toLowerCase();
  if (emailMode === "explicit") {
    const emailPromise = IN.emailInvoice(result.invoiceId)
      .then(() => console.log(`Email disparado vía IN para invoice ${result.invoiceId}`))
      .catch((e) => console.warn(`Email IN falló (la factura sí se creó): ${e.message}`));
    if (executionCtx?.waitUntil) {
      executionCtx.waitUntil(emailPromise);
    } else {
      await emailPromise;
    }
  } else {
    console.log(`Email saltado (EMAIL_MODE=${emailMode})`);
  }

  return {
    success: true,
    message: `Tu solicitud fue registrada. Revisa tu correo en ${ctx.customerEmail} para completar el pago.`,
    plan:           ctx.planName,
    modalidad:      invCtx.strategyLabel,
    invoiceNumber:  result.invoiceNumber,
    invitationLink: result.invitationLink,
    total:          result.invoiceTotal,
  };
}
