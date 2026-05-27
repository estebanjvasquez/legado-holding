/* =============================================================================
   Pipeline de checkout para EMERGENCIAS funerarias.
   Diferente del checkout legadoweb (planes preventivos recurrentes): aquí el
   producto es de catálogo 'urgencias', factura única, sin suscripción.

   Entrada: { customer:{name,email,phone,id_number,address}, items:[product_key],
             notes? }
   Salida:  { invoiceId, invoiceNumber, invitationLink, invoiceTotal,
              clientId, isNewClient }
   ============================================================================= */

import { createIN } from "./invoiceninja.js";

async function resolveEmergencyClient(IN, customer) {
  const email = (customer.email || "").toLowerCase().trim();
  if (!email) throw new Error("Email del cliente es requerido");

  const resp = await IN.searchClientByEmail(email);
  const list = resp && Array.isArray(resp.data) ? resp.data : [];
  const existing = list.find((c) =>
    (c.contacts || []).some(
      (ct) => ct.email && ct.email.toLowerCase().trim() === email,
    ),
  );
  if (existing) {
    console.log(`[emergency] client found id=${existing.id}`);
    return { id: existing.id, isNew: false };
  }

  const fullName = (customer.name || "").trim() || email;
  const parts = fullName.split(/\s+/);
  const firstName = parts.shift() || fullName;
  const lastName  = parts.join(" ");

  const createResp = await IN.createClient({
    name:        fullName,
    vat_number:  customer.id_number || "",
    phone:       customer.phone || "",
    address1:    customer.address || "",
    private_notes:
      `[Urgencia ${new Date().toISOString().split("T")[0]}] alta vía chat Alma 2`,
    contacts: [
      {
        first_name: firstName,
        last_name:  lastName,
        email,
        phone:      customer.phone || "",
        send_email: true,
      },
    ],
  });
  const created = createResp.data || createResp;
  if (!created || !created.id) {
    throw new Error("No se pudo crear el cliente: " + JSON.stringify(createResp));
  }
  console.log(`[emergency] client created id=${created.id}`);
  return { id: created.id, isNew: true };
}

async function resolveUrgencyProducts(IN, productKeys, partnerBrand) {
  if (!Array.isArray(productKeys) || productKeys.length === 0) {
    throw new Error("Lista de servicios vacía");
  }
  const resp = await IN.listProducts();
  const brand = (partnerBrand || "").trim();
  /* Filtramos por catálogo 'urgencias' + brand del aliado en custom_value4
     (campo 'aliados' en IN). Esto evita que el bot facture servicios de
     un aliado bajo el código de otro. */
  const urg  = (resp.data || []).filter(
    (p) =>
      !p.is_deleted &&
      p.custom_value1 === "urgencias" &&
      (!brand || (p.custom_value4 || "") === brand),
  );
  if (brand && urg.length === 0) {
    throw new Error(
      `No hay productos urgencias para el aliado '${brand}'. Verifica que existan productos en Invoice Ninja con custom_value1=urgencias Y custom_value4=${brand} (campo 'aliados').`,
    );
  }

  /* El agente puede mandar cualquiera de varios identificadores del producto:
       - product_key   (SKU / nombre interno; es lo que devuelve /emergency-products)
       - hashed_id     (la columna "Identificación" del admin de IN)
       - id            (id numérico interno)
       - notes         (descripción, último recurso)
     Probamos en orden de especificidad. Sólo se busca dentro del catálogo
     urgencias para evitar contaminación cruzada.

     `norm` también quita acentos (NFD + strip de diacríticos). Cuando
     Gemini propone "Cremación básica" pero el product_key real es
     "Cremacion Basica" sin tildes, sin esto el match falla. */
  /* RegExp con string ASCII puro para evitar problemas de encoding al
     editar el archivo: ̀-ͯ es el rango de combining diacritical
     marks de Unicode. Strippearlos tras normalize("NFD") quita tildes/acentos. */
  const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");
  const norm = (s) =>
    String(s || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(DIACRITICS, "");
  const wanted = productKeys.map((k) => String(k).trim()).filter(Boolean);
  /* Log diagnóstico: brand recibido + keys pedidas vs keys disponibles.
     Útil cuando el bot pasa un key que no existe (typos, key partial,
     key de otro aliado por confusión). */
  console.log(
    `[emergency] resolveUrgencyProducts brand=${brand || "(none)"} ` +
    `wanted=${JSON.stringify(wanted)} ` +
    `available=${JSON.stringify(urg.map((p) => p.product_key))}`,
  );

  const found = wanted.map((key) => {
    const k = norm(key);
    const matchers = [
      (p) => norm(p.product_key) === k,
      (p) => norm(p.hashed_id)   === k,
      (p) => norm(p.id)          === k,
      (p) => norm(p.notes)       === k,
      (p) => norm(p.notes).includes(k),
      /* Última red de seguridad: incluye también product_key como substring
         (ej: bot pide "Inhumación" y el real es "Inhumación tradicional"). */
      (p) => norm(p.product_key).includes(k),
      (p) => k.includes(norm(p.product_key)),
    ];
    for (const test of matchers) {
      const hit = urg.find(test);
      if (hit) return hit;
    }
    /* Error con info diagnóstica para el modelo. El bot recibe esto en
       tool_result y puede auto-corregirse o disculparse con contexto. */
    const available = urg.map((p) => p.product_key).join(", ");
    throw new Error(
      `Producto urgencia no encontrado: '${key}'. ` +
      (brand ? `Brand activo: '${brand}'. ` : "") +
      `Productos disponibles: ${available || "(ninguno)"}. ` +
      `Si el aliado no ofrece este servicio, propón otro del catálogo disponible.`,
    );
  });

  return found;
}

export async function emergencyCheckout(input, env, executionCtx) {
  const customer = input.customer || {};
  const items    = input.items    || [];
  const notes    = (input.notes   || "").trim();
  const partnerBrand = (input.partnerBrand || "").trim();

  const IN = createIN(env);
  console.log(`[emergency] start email=${customer.email} items=${items.length} brand=${partnerBrand || "(none)"}`);

  const client = await resolveEmergencyClient(IN, customer);

  const products = await resolveUrgencyProducts(IN, items, partnerBrand);

  const today = new Date().toISOString().split("T")[0];
  const line_items = products.map((p) => ({
    product_key: p.product_key,
    notes:       p.notes || p.product_key,
    cost:        Number(p.price) || 0,
    quantity:    1,
  }));
  const total = line_items
    .reduce((sum, li) => sum + li.cost * (li.quantity || 1), 0)
    .toFixed(2);

  const publicNotes =
    `Servicios funerarios — atención inmediata\n` +
    `Cliente: ${customer.name || customer.email}\n` +
    (customer.phone   ? `Tel: ${customer.phone}\n`     : "") +
    (customer.address ? `Dir: ${customer.address}\n`   : "") +
    (notes            ? `\nNotas:\n${notes}`           : "");

  const invResp = await IN.createInvoice({
    client_id:    client.id,
    date:         today,
    due_date:     today,
    line_items,
    public_notes: publicNotes,
  });
  const inv = invResp.data || invResp;
  if (!inv || !inv.id) {
    throw new Error("Error creando factura urgencia: " + JSON.stringify(invResp));
  }
  const invLink =
    inv.invitations && inv.invitations[0] ? inv.invitations[0].link : "";

  console.log(
    `[emergency] invoice ${inv.number} created total=$${total} link=${invLink ? "ok" : "missing"}`,
  );

  /* Email opcional según EMAIL_MODE (mismo patrón que checkout legadoweb). */
  const emailMode = (env.EMAIL_MODE || "explicit").toLowerCase();
  if (emailMode === "explicit") {
    const emailPromise = IN.emailInvoice(inv.id)
      .then(() => console.log(`[emergency] email enviado invoice=${inv.id}`))
      .catch((e) => console.warn(`[emergency] email falló: ${e.message}`));
    if (executionCtx?.waitUntil) {
      executionCtx.waitUntil(emailPromise);
    } else {
      await emailPromise;
    }
  }

  return {
    clientId:       client.id,
    isNewClient:    client.isNew,
    invoiceId:      inv.id,
    invoiceNumber:  inv.number || "",
    invitationLink: invLink,
    invoiceTotal:   total,
  };
}
