const ctx = $input.first().json;

const BASE    = 'https://invoicing.legadoholding.com/api/v1';
const TOKEN   = '__INVOICE_NINJA_TOKEN__';
const HEADERS = { 'X-API-TOKEN': TOKEN, 'Content-Type': 'application/json', 'Accept': 'application/json' };

const httpReq = async (method, path, body) => {
  const opts = {
    method,
    url: BASE + path,
    headers: { ...HEADERS },
    json: true,
    returnFullResponse:    true,
    ignoreHttpStatusErrors: true,
  };
  if (body) opts.body = JSON.stringify(body);
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

const toLineItems = (items) => items.map(li => ({
  product_key: li.product_key,
  notes:       li.notes || '',
  cost:        li.cost,
  quantity:    li.qty   || 1,
}));

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Total del primer ciclo (incluye Unico en Selecto)
const invoiceTotal = ctx.lineItems1
  .reduce((sum, li) => sum + (li.cost * (li.qty || 1)), 0)
  .toFixed(2);

const publicNotes =
  `${ctx.planName} — ${ctx.strategyLabel}\n` +
  `Titular: ${ctx.customerName}\n` +
  `Familiares afiliados (${ctx.family.length}/6):\n${ctx.familyText}`;

const today = new Date().toISOString().split('T')[0];

// Frecuencia recurrente: Selecto siempre mensual (frequencyId2),
// Zulia respeta la elección del cliente (frequencyId 4 ó 9).
const recurringFreqId = ctx.isVen ? ctx.frequencyId2 : ctx.frequencyId;

// ── 1. Crear la suscripción (Recurring Invoice) con los items del primer
//      ciclo. Para Selecto: Unico + Monthly. Para Zulia: Monthly o Annualy.
const recurringBody = {
  client_id:        ctx.clientId,
  frequency_id:     recurringFreqId,
  status_id:        2,        // 2 = active → se procesa por cron / send_now
  auto_bill:        'off',    // pago manual vía enlace
  next_send_date:   today,
  remaining_cycles: -1,       // sin límite
  line_items:       toLineItems(ctx.lineItems1),
  public_notes:     publicNotes,
};
// Linkear al Subscription template solo si está disponible (puede ser null
// si la auto-creación falló o si aún no se ha creado manualmente en IN).
if (ctx.subscriptionId) recurringBody.subscription_id = ctx.subscriptionId;

const recResp   = await httpReq('POST', '/recurring_invoices', recurringBody);
const recurring = recResp.data || recResp;
const recurringId = recurring.id;
if (!recurringId) {
  throw new Error('Error creando suscripción: ' + JSON.stringify(recResp));
}

// ── 2. Forzar la generación inmediata del primer invoice ───────────────
await httpReq('POST', '/recurring_invoices/bulk', {
  action: 'send_now',
  ids:    [recurringId],
});

// ── 3. Polling para encontrar el invoice generado (hasta ~8s) ──────────
let firstInvoice = null;
for (let attempt = 0; attempt < 10 && !firstInvoice; attempt++) {
  await sleep(800);
  const listResp = await httpReq('GET',
    `/invoices?client_id=${ctx.clientId}&per_page=20&sort=id|desc`);
  const list = (listResp.data || [])
    .filter(inv => inv.recurring_id === recurringId);
  if (list.length > 0) firstInvoice = list[0];
}

if (!firstInvoice || !firstInvoice.id) {
  throw new Error(`Factura inicial no generada (recurring_id=${recurringId}). Verifica el cron de Invoice Ninja.`);
}

// ── 4. Para Selecto: quitar 'Unico' de la suscripción para que los
//      ciclos siguientes solo cobren la mensualidad.
if (ctx.isVen && ctx.lineItems2) {
  await httpReq('PUT', `/recurring_invoices/${recurringId}`, {
    line_items: toLineItems(ctx.lineItems2),
  });
}

// ── 5. Obtener el enlace de invitación del invoice generado ────────────
const invFull = await httpReq('GET', `/invoices/${firstInvoice.id}?include=invitations`);
const invData = invFull.data || invFull;
const invLink = (invData.invitations && invData.invitations[0])
  ? invData.invitations[0].link
  : '';

return [{ json: {
  ...ctx,
  recurringId,
  invoiceId:      firstInvoice.id     || '',
  invoiceNumber:  firstInvoice.number || invData.number || '',
  invitationLink: invLink,
  invoiceTotal,
} }];