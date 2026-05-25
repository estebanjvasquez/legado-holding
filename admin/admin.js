/* =============================================================================
   Admin UI — Legado Holding
   Vanilla JS, sin frameworks. Habla con el Worker en api.legadoholding.com
   bajo /admin/* con X-Admin-Token header.
   ============================================================================= */

const API_BASE =
  (typeof window !== "undefined" && window.LEGADO_ADMIN_API) ||
  "https://api.legadoholding.com";

const TOKEN_KEY = "legado_admin_token";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const getToken   = () => localStorage.getItem(TOKEN_KEY) || "";
const setToken   = (t) => localStorage.setItem(TOKEN_KEY, t);
const clearToken = ()  => localStorage.removeItem(TOKEN_KEY);

/* ── HTTP wrapper ─────────────────────────────────────────────────────────── */
async function api(path, opts = {}) {
  const headers = {
    "Content-Type":  "application/json",
    "X-Admin-Token": getToken(),
    ...(opts.headers || {}),
  };
  const init = { method: opts.method || "GET", headers };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
  const r = await fetch(API_BASE + path, init);
  const text = await r.text();
  let body = text;
  try { body = text ? JSON.parse(text) : null; } catch (_) { /* keep text */ }
  if (!r.ok) {
    const msg = (body && body.error) || `HTTP ${r.status}`;
    throw new Error(msg);
  }
  return body;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString("es-VE", { dateStyle: "short", timeStyle: "short" });
  } catch (_) {
    return iso;
  }
}

/* ── Login ────────────────────────────────────────────────────────────────── */
async function tryLogin(token) {
  setToken(token);
  await api("/admin/health");
}

$("#login-btn").addEventListener("click", async () => {
  const t = $("#login-token").value.trim();
  const errEl = $("#login-error");
  errEl.classList.add("hidden");
  if (!t) { errEl.textContent = "Ingresa el token."; errEl.classList.remove("hidden"); return; }
  try {
    await tryLogin(t);
    $("#login-modal").classList.add("hidden");
    $("#app").classList.remove("hidden");
    init();
  } catch (e) {
    clearToken();
    errEl.textContent = "Token inválido: " + e.message;
    errEl.classList.remove("hidden");
  }
});

$("#login-token").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("#login-btn").click();
});

$("#logout-btn").addEventListener("click", () => {
  clearToken();
  location.reload();
});

/* ── Tabs ─────────────────────────────────────────────────────────────────── */
function setupTabs() {
  $$(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".tab").forEach((b) => b.classList.remove("active"));
      $$(".tab-content").forEach((c) => c.classList.remove("active"));
      btn.classList.add("active");
      $(`#tab-${btn.dataset.tab}`).classList.add("active");
      if (btn.dataset.tab === "locations") LocationsCtrl.load();
      if (btn.dataset.tab === "partners")  PartnersCtrl.load();
      if (btn.dataset.tab === "agent")     AgentCtrl.load();
      if (btn.dataset.tab === "sessions")  SessionsCtrl.load();
    });
  });
}

/* ── Locations ────────────────────────────────────────────────────────────── */
const LocationsCtrl = {
  rows: [],
  async load() {
    const tbody = $("#loc-tbody");
    tbody.innerHTML = '<tr><td colspan="4" class="muted">Cargando...</td></tr>';
    try {
      const filter = $("#loc-state-filter").value;
      const { data } = await api(`/admin/locations${filter ? `?state=${encodeURIComponent(filter)}` : ""}`);
      this.rows = data || [];
      this.render();
      this.populateStateFilter();
      /* Refrescar selector de location en tab Aliados */
      PartnersCtrl.populateLocationSelect(this.rows);
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="4" class="error">Error: ${escapeHtml(e.message)}</td></tr>`;
    }
  },
  populateStateFilter() {
    const states = [...new Set(this.rows.map((r) => r.state))].sort();
    const sel = $("#loc-state-filter");
    const current = sel.value;
    sel.innerHTML = '<option value="">(Todos los estados)</option>' +
      states.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
    sel.value = current;
  },
  render() {
    const tbody = $("#loc-tbody");
    if (this.rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="muted">Sin resultados.</td></tr>';
      return;
    }
    tbody.innerHTML = this.rows.map((r) => `
      <tr data-id="${r.id}">
        <td>${escapeHtml(r.state)}</td>
        <td>${escapeHtml(r.city)}</td>
        <td>${r.is_capital ? '<span class="badge state-coverage">Capital</span>' : ''}</td>
        <td>
          <button class="btn-secondary btn" data-action="edit" style="padding: 4px 10px; font-size: 12px;">Editar</button>
          <button class="btn-danger" data-action="delete">Eliminar</button>
        </td>
      </tr>
    `).join("");
  },
  async create() {
    const msg = $("#loc-create-msg");
    msg.textContent = "";
    const state = $("#loc-state").value.trim();
    const city  = $("#loc-city").value.trim();
    if (!state || !city) { msg.textContent = "Estado y ciudad son obligatorios."; msg.style.color = "var(--danger)"; return; }
    try {
      await api("/admin/locations", { method: "POST", body: { state, city, is_capital: $("#loc-is-capital").checked } });
      $("#loc-state").value = ""; $("#loc-city").value = ""; $("#loc-is-capital").checked = false;
      msg.textContent = "Creada ✓"; msg.style.color = "var(--success)";
      await this.load();
    } catch (e) {
      msg.textContent = "Error: " + e.message; msg.style.color = "var(--danger)";
    }
  },
  async editRow(id) {
    const row = this.rows.find((r) => String(r.id) === String(id));
    if (!row) return;
    const newState = prompt("Estado:", row.state);
    if (newState === null) return;
    const newCity = prompt("Ciudad:", row.city);
    if (newCity === null) return;
    const newCap  = confirm("¿Es capital del estado? (cancelar = no)");
    try {
      await api(`/admin/locations/${id}`, { method: "PATCH", body: { state: newState, city: newCity, is_capital: newCap } });
      await this.load();
    } catch (e) { alert("Error: " + e.message); }
  },
  async deleteRow(id) {
    const row = this.rows.find((r) => String(r.id) === String(id));
    if (!confirm(`¿Eliminar ${row?.city} (${row?.state})? Si hay aliados asociados, fallará.`)) return;
    try {
      await api(`/admin/locations/${id}`, { method: "DELETE" });
      await this.load();
    } catch (e) { alert("Error: " + e.message); }
  },
};

$("#loc-create-btn").addEventListener("click", () => LocationsCtrl.create());
$("#loc-reload-btn").addEventListener("click", () => LocationsCtrl.load());
$("#loc-state-filter").addEventListener("change", () => LocationsCtrl.load());
$("#loc-tbody").addEventListener("click", (e) => {
  const tr = e.target.closest("tr"); if (!tr) return;
  const action = e.target.dataset.action;
  if (action === "edit")   LocationsCtrl.editRow(tr.dataset.id);
  if (action === "delete") LocationsCtrl.deleteRow(tr.dataset.id);
});

/* ── Partners ─────────────────────────────────────────────────────────────── */
const PartnersCtrl = {
  rows: [],
  async load() {
    const tbody = $("#p-tbody");
    tbody.innerHTML = '<tr><td colspan="7" class="muted">Cargando...</td></tr>';
    try {
      const { data } = await api("/admin/partners");
      this.rows = data || [];
      this.render();
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="7" class="error">Error: ${escapeHtml(e.message)}</td></tr>`;
    }
  },
  populateLocationSelect(locations) {
    const sel = $("#p-location");
    if (!locations) return;
    sel.innerHTML = '<option value="">— elige —</option>' +
      locations.map((l) => `<option value="${l.id}">${escapeHtml(l.state)} · ${escapeHtml(l.city)}</option>`).join("");
  },
  render() {
    const tbody = $("#p-tbody");
    if (this.rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="muted">Sin aliados.</td></tr>';
      return;
    }
    tbody.innerHTML = this.rows.map((r) => {
      const locTxt = r.location ? `${escapeHtml(r.location.state)} · ${escapeHtml(r.location.city)}` : '<span class="muted">—</span>';
      const cov    = r.state_coverage ? '<span class="badge state-coverage">Estado completo</span>' : '<span class="muted">Solo ciudad</span>';
      const svc    = Array.isArray(r.services) ? r.services.join(", ") : "";
      const act    = r.is_active ? '<span class="badge active">Activo</span>' : '<span class="badge inactive">Inactivo</span>';
      return `
        <tr data-id="${r.id}">
          <td><strong>${escapeHtml(r.name)}</strong>${r.phone ? `<br><span class="muted" style="font-size: 12px;">${escapeHtml(r.phone)}</span>` : ""}</td>
          <td>${escapeHtml(r.brand || "")}</td>
          <td>${locTxt}</td>
          <td>${cov}</td>
          <td style="font-size: 12px;">${escapeHtml(svc)}</td>
          <td>${act}</td>
          <td>
            <button class="btn-secondary btn" data-action="toggle" style="padding: 4px 10px; font-size: 12px;">${r.is_active ? "Desactivar" : "Activar"}</button>
            <button class="btn-danger" data-action="delete">Eliminar</button>
          </td>
        </tr>
      `;
    }).join("");
  },
  async create() {
    const msg = $("#p-create-msg");
    msg.textContent = "";
    const location_id = $("#p-location").value;
    const name        = $("#p-name").value.trim();
    if (!location_id || !name) { msg.textContent = "Ubicación y nombre son obligatorios."; msg.style.color = "var(--danger)"; return; }
    const services = $("#p-services").value.split(",").map((s) => s.trim()).filter(Boolean);
    const row = {
      location_id:    parseInt(location_id, 10),
      name,
      brand:          $("#p-brand").value.trim()   || null,
      contact_name:   $("#p-contact").value.trim() || null,
      phone:          $("#p-phone").value.trim()   || null,
      email:          $("#p-email").value.trim()   || null,
      address:        $("#p-address").value.trim() || null,
      services:       services.length ? services : null,
      state_coverage: $("#p-state-coverage").checked,
      is_active:      $("#p-active").checked,
      notes:          $("#p-notes").value.trim() || null,
    };
    try {
      await api("/admin/partners", { method: "POST", body: row });
      ["p-name","p-brand","p-contact","p-phone","p-email","p-address","p-services","p-notes"].forEach((id) => $("#"+id).value = "");
      $("#p-state-coverage").checked = false; $("#p-active").checked = true;
      msg.textContent = "Creado ✓"; msg.style.color = "var(--success)";
      await this.load();
    } catch (e) {
      msg.textContent = "Error: " + e.message; msg.style.color = "var(--danger)";
    }
  },
  async toggle(id) {
    const r = this.rows.find((x) => String(x.id) === String(id));
    if (!r) return;
    try { await api(`/admin/partners/${id}`, { method: "PATCH", body: { is_active: !r.is_active } }); await this.load(); }
    catch (e) { alert("Error: " + e.message); }
  },
  async deleteRow(id) {
    const r = this.rows.find((x) => String(x.id) === String(id));
    if (!confirm(`¿Eliminar aliado "${r?.name}"?`)) return;
    try { await api(`/admin/partners/${id}`, { method: "DELETE" }); await this.load(); }
    catch (e) { alert("Error: " + e.message); }
  },
};

$("#p-create-btn").addEventListener("click", () => PartnersCtrl.create());
$("#p-reload-btn").addEventListener("click", () => PartnersCtrl.load());
$("#p-tbody").addEventListener("click", (e) => {
  const tr = e.target.closest("tr"); if (!tr) return;
  const action = e.target.dataset.action;
  if (action === "toggle") PartnersCtrl.toggle(tr.dataset.id);
  if (action === "delete") PartnersCtrl.deleteRow(tr.dataset.id);
});

/* ── Agent config ─────────────────────────────────────────────────────────── */
const AgentCtrl = {
  config: {},        /* key → {value, description} */
  knownKeys: ["model", "temperature", "emergency_phone", "system_prompt_es", "system_prompt_en"],
  async load() {
    const msg = $("#cfg-msg");
    msg.textContent = "Cargando...";
    try {
      const { data } = await api("/admin/config");
      this.config = {};
      (data || []).forEach((r) => { this.config[r.key] = { value: r.value || "", description: r.description || "" }; });
      this.render();
      msg.textContent = "";
    } catch (e) {
      msg.textContent = "Error: " + e.message; msg.style.color = "var(--danger)";
    }
  },
  render() {
    /* Conocidos */
    $("#cfg-model").value           = this.config.model?.value           || "gemini-2.5-flash";
    $("#cfg-temperature").value     = this.config.temperature?.value     || "0.7";
    $("#cfg-emergency-phone").value = this.config.emergency_phone?.value || "";
    $("#cfg-prompt-es").value       = this.config.system_prompt_es?.value || "";
    $("#cfg-prompt-en").value       = this.config.system_prompt_en?.value || "";

    /* Otros (key arbitrarias agregadas a futuro) */
    const extraDiv = $("#cfg-extra");
    const extras = Object.entries(this.config).filter(([k]) => !this.knownKeys.includes(k));
    if (extras.length === 0) {
      extraDiv.innerHTML = '<p class="muted" style="margin: 8px 0;">No hay keys adicionales aún.</p>';
    } else {
      extraDiv.innerHTML = extras.map(([k, v]) => `
        <div style="margin-bottom: 12px; padding: 12px; border: 1px solid var(--border); border-radius: 4px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <strong>${escapeHtml(k)}</strong>
            <button class="btn-danger" data-cfg-key="${escapeHtml(k)}">Eliminar key</button>
          </div>
          ${v.description ? `<p class="muted" style="margin: 4px 0;">${escapeHtml(v.description)}</p>` : ""}
          <input type="text" data-cfg-input="${escapeHtml(k)}" value="${escapeHtml(v.value)}" />
        </div>
      `).join("");
    }
  },
  async save() {
    const msg = $("#cfg-msg");
    msg.textContent = "Guardando...";
    const entries = [
      { key: "model",           value: $("#cfg-model").value.trim() },
      { key: "temperature",     value: $("#cfg-temperature").value.trim() },
      { key: "emergency_phone", value: $("#cfg-emergency-phone").value.trim() },
      { key: "system_prompt_es", value: $("#cfg-prompt-es").value },
      { key: "system_prompt_en", value: $("#cfg-prompt-en").value },
    ];
    /* Extras */
    $$('input[data-cfg-input]').forEach((el) => {
      entries.push({ key: el.dataset.cfgInput, value: el.value });
    });
    try {
      await api("/admin/config", { method: "PUT", body: { entries } });
      msg.textContent = "Guardado ✓"; msg.style.color = "var(--success)";
      await this.load();
      setTimeout(() => { msg.textContent = ""; }, 3000);
    } catch (e) {
      msg.textContent = "Error: " + e.message; msg.style.color = "var(--danger)";
    }
  },
  async addNewKey() {
    const key = $("#cfg-new-key").value.trim();
    const value = $("#cfg-new-value").value;
    const description = $("#cfg-new-desc").value.trim();
    if (!key) return alert("Indica una key");
    try {
      await api("/admin/config", { method: "PUT", body: { entries: [{ key, value, description }] } });
      $("#cfg-new-key").value = ""; $("#cfg-new-value").value = ""; $("#cfg-new-desc").value = "";
      await this.load();
    } catch (e) { alert("Error: " + e.message); }
  },
  async deleteKey(key) {
    if (!confirm(`¿Eliminar la key "${key}"?`)) return;
    try { await api(`/admin/config/${encodeURIComponent(key)}`, { method: "DELETE" }); await this.load(); }
    catch (e) { alert("Error: " + e.message); }
  },
};

$("#cfg-save-btn").addEventListener("click", () => AgentCtrl.save());
$("#cfg-reload-btn").addEventListener("click", () => AgentCtrl.load());
$("#cfg-new-btn").addEventListener("click", () => AgentCtrl.addNewKey());
$("#cfg-extra").addEventListener("click", (e) => {
  const k = e.target.dataset.cfgKey;
  if (k) AgentCtrl.deleteKey(k);
});

/* ── Sessions (read-only) ─────────────────────────────────────────────────── */
const SessionsCtrl = {
  rows: [],
  async load() {
    const tbody = $("#s-tbody");
    tbody.innerHTML = '<tr><td colspan="6" class="muted">Cargando...</td></tr>';
    try {
      const { data } = await api("/admin/sessions?limit=50");
      this.rows = data || [];
      this.render();
      $("#s-detail").classList.add("hidden");
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6" class="error">Error: ${escapeHtml(e.message)}</td></tr>`;
    }
  },
  render() {
    const tbody = $("#s-tbody");
    if (this.rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="muted">Sin conversaciones.</td></tr>';
      return;
    }
    tbody.innerHTML = this.rows.map((r) => {
      const cliente = r.customer_name ? `${escapeHtml(r.customer_name)}<br><span class="muted" style="font-size: 12px;">${escapeHtml(r.customer_email || "")}</span>` : '<span class="muted">—</span>';
      const meta = r.metadata || {};
      const ciudad = meta.coverage_city
        ? `${escapeHtml(meta.coverage_city)}, ${escapeHtml(meta.coverage_state || "")}`
        : '<span class="muted">—</span>';
      const fallecido = r.deceased_name ? `<br><span class="muted" style="font-size: 12px;">Fallecido: ${escapeHtml(r.deceased_name)}</span>` : "";
      const fac = r.invoice_number
        ? `<span class="badge active">#${escapeHtml(r.invoice_number)}</span><br><span class="muted" style="font-size: 12px;">$${r.invoice_total || 0}</span>`
        : (meta.coverage === "not_covered" ? '<span class="badge inactive">No cobertura</span>' : '<span class="muted">—</span>');
      return `
        <tr data-id="${escapeHtml(r.session_id)}">
          <td>${formatDate(r.created_at)}</td>
          <td style="font-family: ui-monospace, Consolas, monospace; font-size: 11px;">${escapeHtml(r.session_id)}</td>
          <td>${cliente}</td>
          <td>${ciudad}${fallecido}</td>
          <td>${fac}</td>
          <td><button class="btn-secondary btn" data-action="view" style="padding: 4px 10px; font-size: 12px;">Ver detalle</button></td>
        </tr>
      `;
    }).join("");
  },
  async showDetail(sessionId) {
    const div = $("#s-detail");
    const content = $("#s-detail-content");
    div.classList.remove("hidden");
    content.textContent = "Cargando...";
    try {
      const { data } = await api(`/admin/sessions/${encodeURIComponent(sessionId)}`);
      const turns = data.turns || [];
      const sessionBlock = JSON.stringify(data.session, null, 2);
      const turnsBlock = turns.map((t) => {
        const head = `[${t.role}${t.tool_name ? ` · ${t.tool_name}` : ""}${t.hop !== null ? ` hop=${t.hop}` : ""}${t.latency_ms ? ` ${t.latency_ms}ms` : ""}]`;
        const content = t.content || (t.tool_args ? `args: ${JSON.stringify(t.tool_args)}` : t.tool_result ? `result: ${JSON.stringify(t.tool_result).slice(0, 200)}` : "");
        const err = t.error ? `  ERROR: ${t.error}` : "";
        return `<div class="turn ${t.role}"><div class="role">${head}</div><div>${escapeHtml(content)}</div>${err ? `<div class="error">${escapeHtml(err)}</div>` : ""}</div>`;
      }).join("");
      content.innerHTML = `<strong>chat_sessions:</strong>\n${escapeHtml(sessionBlock)}\n\n<strong>chat_turns (${turns.length}):</strong>\n${turnsBlock}`;
    } catch (e) {
      content.textContent = "Error: " + e.message;
    }
  },
};

$("#s-reload-btn").addEventListener("click", () => SessionsCtrl.load());
$("#s-tbody").addEventListener("click", (e) => {
  const tr = e.target.closest("tr"); if (!tr) return;
  if (e.target.dataset.action === "view") SessionsCtrl.showDetail(tr.dataset.id);
});

/* ── Init ─────────────────────────────────────────────────────────────────── */
function init() {
  setupTabs();
  LocationsCtrl.load();
}

(async function bootstrap() {
  if (getToken()) {
    try {
      await api("/admin/health");
      $("#login-modal").classList.add("hidden");
      $("#app").classList.remove("hidden");
      init();
    } catch (_) {
      clearToken();
      /* deja el login modal visible */
    }
  }
})();
