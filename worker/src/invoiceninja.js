/* =============================================================================
   Cliente HTTP de Invoice Ninja.
   Encapsula la autenticación (X-API-TOKEN) y los endpoints usados por el
   pipeline de checkout. Cualquier error 4xx/5xx levanta excepción con el
   método, path y cuerpo de respuesta para facilitar debug en `wrangler tail`.
   ============================================================================= */

export function createIN(env) {
  if (!env.IN_TOKEN) {
    throw new Error("IN_TOKEN no configurado en el Worker");
  }
  const base = env.IN_BASE;
  const baseHeaders = {
    "X-API-TOKEN": env.IN_TOKEN,
    Accept: "application/json",
  };

  async function req(method, path, body) {
    const opts = { method, headers: { ...baseHeaders } };
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    const r = await fetch(base + path, opts);
    const text = await r.text();
    let parsed = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch (_) {
      /* deja parsed como texto crudo */
    }
    if (!r.ok) {
      const detail =
        typeof parsed === "object" ? JSON.stringify(parsed) : String(parsed);
      throw new Error(`IN ${method} ${path} -> ${r.status}: ${detail}`);
    }
    return parsed;
  }

  return {
    /* ── Clients ──────────────────────────────────────────────────────── */
    searchClientByEmail: (email) =>
      req("GET", `/clients?email=${encodeURIComponent(email)}`),
    createClient: (data) => req("POST", "/clients", data),

    /* ── Products ─────────────────────────────────────────────────────── */
    listProducts: () => req("GET", "/products?per_page=100"),

    /* ── Subscriptions (templates en el portal) ───────────────────────── */
    listSubscriptions: () => req("GET", "/subscriptions?per_page=100"),
    createSubscription: (data) => req("POST", "/subscriptions", data),

    /* ── Recurring invoices ──────────────────────────────────────────── */
    createRecurringInvoice: (data) => req("POST", "/recurring_invoices", data),
    updateRecurringInvoice: (id, data) =>
      req("PUT", `/recurring_invoices/${id}`, data),
    bulkRecurring: (action, ids) =>
      req("POST", "/recurring_invoices/bulk", { action, ids }),

    /* ── Invoices ─────────────────────────────────────────────────────── */
    listInvoicesByClient: (clientId) =>
      req(
        "GET",
        `/invoices?client_id=${encodeURIComponent(clientId)}&per_page=20&sort=id|desc`,
      ),
    getInvoiceWithInvitations: (id) =>
      req("GET", `/invoices/${id}?include=invitations`),
    createInvoice: (data) => req("POST", "/invoices?include=invitations", data),

    /* ── Email (reemplazo del nodo Gmail de n8n) ──────────────────────── */
    /* POST /invoices/bulk action:email dispara la plantilla configurada en
       Settings → Email Settings del propio Invoice Ninja. */
    emailInvoice: (id) =>
      req("POST", "/invoices/bulk", { action: "email", ids: [id] }),
  };
}
