const ctx = $input.first().json;

const BASE    = 'https://invoicing.legadoholding.com/api/v1';
const TOKEN   = '__INVOICE_NINJA_TOKEN__';
const HEADERS = { 'X-API-TOKEN': TOKEN, 'Accept': 'application/json' };

const httpReq = async (method, path, body) => {
  const opts = {
    method,
    url: BASE + path,
    headers: { ...HEADERS },
    json: true,
    returnFullResponse:    true,
    ignoreHttpStatusErrors: true,
  };
  if (body) {
    opts.body = JSON.stringify(body);
    opts.headers['Content-Type'] = 'application/json';
  }
  let r;
  try {
    r = await this.helpers.httpRequest(opts);
  } catch (e) {
    const s   = (e.response && e.response.status) || e.httpCode || 'unknown';
    const raw = (e.response && e.response.data) || e.body || e.cause || e.message;
    const m   = typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
    throw new Error(`IN ${method} ${path} → ${s}: ${m}`);
  }
  const status = r.statusCode || r.status || 0;
  let parsed = (r.body !== undefined) ? r.body : r;
  if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed); } catch (_) {} }
  if (status >= 400) {
    const m = typeof parsed === 'object' ? JSON.stringify(parsed) : String(parsed);
    throw new Error(`IN ${method} ${path} → ${status}: ${m}`);
  }
  return parsed;
};

// ── Catálogo de productos legadoweb ─────────────────────────────────────
const prodResp = await httpReq('GET', '/products?per_page=100');
const allProducts = (prodResp.data || []).filter(p =>
  !p.is_deleted && p.custom_value1 === 'legadoweb'
);

const familyProducts = allProducts.filter(p => p.custom_value3 === ctx.planFamily);
if (familyProducts.length === 0) {
  throw new Error(`Sin productos para familia '${ctx.planFamily}' (slug: '${ctx.plan}'). Revisar custom_value3.`);
}

let strategy, strategyLabel, lineItems1, lineItems2, frequencyId2;
let recurringProductId = '';   // UUID del producto recurrente (Monthly/Annualy)
let oneTimeProductId   = '';   // UUID del producto Unico (solo Selecto)
let recurringUnitPrice = 0;

if (ctx.isVen) {
  const unicoProd   = familyProducts.find(p => (p.custom_value2 || '').toLowerCase() === 'unico');
  const monthlyProd = familyProducts.find(p => (p.custom_value2 || '').toLowerCase() === 'monthly');
  if (!unicoProd)   throw new Error(`Producto 'Unico' no encontrado para '${ctx.planFamily}'`);
  if (!monthlyProd) throw new Error(`Producto 'Monthly' no encontrado para '${ctx.planFamily}'`);

  strategy      = 'ven';
  strategyLabel = 'Suscripción mensual (con cuota inicial)';
  lineItems1 = [
    { product_key: unicoProd.product_key,   notes: unicoProd.notes   || 'Cuota inicial del plan', cost: unicoProd.price,   qty: 1 },
    { product_key: monthlyProd.product_key, notes: 'Primer mes de mensualidad',                   cost: monthlyProd.price, qty: 1 },
  ];
  lineItems2          = [{ product_key: monthlyProd.product_key, notes: monthlyProd.notes || 'Mensualidad del plan', cost: monthlyProd.price, qty: 1 }];
  frequencyId2        = 4;
  recurringProductId  = monthlyProd.id;
  oneTimeProductId    = unicoProd.id;
  recurringUnitPrice  = monthlyProd.price;
} else {
  const targetProd = familyProducts.find(p =>
    (p.custom_value2 || '').toLowerCase() === ctx.frequencyLabel.toLowerCase()
  );
  if (!targetProd) throw new Error(`Producto no encontrado para '${ctx.planFamily}' con frecuencia '${ctx.frequencyLabel}'`);

  strategy      = ctx.paymentType === 'annual' ? 'zulia-annual'  : 'zulia-monthly';
  strategyLabel = ctx.paymentType === 'annual' ? 'Suscripción anual' : 'Suscripción mensual';
  lineItems1    = [{ product_key: targetProd.product_key, notes: targetProd.notes || '', cost: targetProd.price, qty: 1 }];
  lineItems2    = null;
  frequencyId2  = null;
  recurringProductId = targetProd.id;
  recurringUnitPrice = targetProd.price;
}

// ── Resolver / crear el Subscription template en Invoice Ninja ──────────
//    Convención de nombre: 'legadoweb-{planFamily}-{frequencyName}'
//    Esto permite que el mismo template se reuse para todos los clientes
//    del mismo plan + frecuencia.
const recurringFreqId  = ctx.isVen ? frequencyId2 : ctx.frequencyId;
const freqNameForName  = ctx.isVen ? 'monthly' : ctx.paymentType;
const subscriptionName = `legadoweb-${ctx.planFamily}-${freqNameForName}`;

const subsResp = await httpReq('GET', '/subscriptions?per_page=100');
const allSubs  = subsResp.data || [];
let subscription = allSubs.find(s => s.name === subscriptionName && !s.is_deleted);

if (!subscription) {
  // Intentar auto-crear el Subscription template. Si IN falla (500/422/etc.)
  // NO rompemos el flujo: el subscription_id es solo un link visual en el
  // portal del cliente; la recurring invoice cobra recurrente igualmente.
  const subBody = {
    name:                            subscriptionName,
    recurring_product_ids:           recurringProductId,
    product_ids:                     oneTimeProductId || '',
    optional_product_ids:            '',
    optional_recurring_product_ids:  '',
    frequency_id:                    recurringFreqId,
    auto_bill:                       'off',
    promo_code:                      '',
    promo_discount:                  0,
    is_amount_discount:              false,
    allow_cancellation:              true,
    per_seat_enabled:                false,
    max_seats_limit:                 0,
    trial_enabled:                   false,
    trial_duration:                  0,
    allow_query_overrides:           false,
    allow_plan_changes:              false,
    refund_period:                   0,
    use_inventory_management:        false,
    registration_required:           false,
    plan_map:                        '',
    steps:                           'cart,checkout',
    webhook_configuration: {
      post_purchase_url:           '',
      post_purchase_rest_method:   '',
      post_purchase_headers:       [],
      post_purchase_body:          '',
      return_url:                  ''
    },
  };

  try {
    const createSub = await httpReq('POST', '/subscriptions', subBody);
    subscription = createSub.data || createSub;
    if (!subscription || !subscription.id) subscription = null;
  } catch (e) {
    // IN rechazó la creación. Loguear y continuar sin subscription_id.
    console.warn('Auto-creación del Subscription falló; continuando sin link:', e.message);
    subscription = null;
  }
}

return [{ json: {
  ...ctx,
  strategy, strategyLabel,
  lineItems1, lineItems2, frequencyId2,
  subscriptionId:   subscription ? subscription.id : null,
  subscriptionName,
} }];