/* =============================================================================
   Admin UI — Legado Holding
   Vanilla JS, sin frameworks. Habla con el Worker en api.legadoholding.com
   bajo /admin/* con X-Admin-Token header.
   ============================================================================= */

const API_BASE =
  (typeof window !== "undefined" && window.LEGADO_ADMIN_API) ||
  "https://api.legadoholding.com";

const TOKEN_KEY = "legado_admin_token";
const USER_KEY  = "legado_admin_user";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

/* sessionStorage: el token se pierde al cerrar la pestaña. Reduce ventana
   de exposición vs localStorage (XSS sigue siendo riesgo, pero el atacante
   no puede usar un token que ya no está). */
const getToken   = () => sessionStorage.getItem(TOKEN_KEY) || "";
const setToken   = (t) => sessionStorage.setItem(TOKEN_KEY, t);
const clearToken = ()  => { sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(USER_KEY); };

const getUser = () => {
  try { return JSON.parse(sessionStorage.getItem(USER_KEY) || "null"); }
  catch (_) { return null; }
};
const setUser = (u) => sessionStorage.setItem(USER_KEY, JSON.stringify(u));

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
  /* /admin/login es público y valida el token contra el secret ADMIN_TOKEN
     del Worker (Invoice Ninja ya no existe). */
  const r = await fetch(API_BASE + "/admin/login", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ token }),
  });
  const text = await r.text();
  let body = text;
  try { body = text ? JSON.parse(text) : null; } catch (_) { /* keep text */ }
  if (!r.ok) {
    const msg = (body && body.error) || `HTTP ${r.status}`;
    throw new Error(msg);
  }
  if (!body || !body.token) throw new Error("Respuesta inválida del servidor");
  setToken(body.token);
  setUser(body.user || null);
}

$("#login-btn").addEventListener("click", async () => {
  const token = ($("#login-token").value || "").trim();
  const errEl = $("#login-error");
  const btn   = $("#login-btn");
  errEl.classList.add("hidden");
  if (!token) {
    errEl.textContent = "El token de acceso es requerido.";
    errEl.classList.remove("hidden");
    return;
  }
  btn.disabled = true;
  try {
    await tryLogin(token);
    $("#login-token").value = "";
    $("#login-modal").classList.add("hidden");
    $("#app").classList.remove("hidden");
    init();
  } catch (e) {
    clearToken();
    errEl.textContent = e.message;
    errEl.classList.remove("hidden");
  } finally {
    btn.disabled = false;
  }
});

["#login-token"].forEach((sel) => {
  $(sel).addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("#login-btn").click();
  });
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
      if (btn.dataset.tab === "agent")     AgentCtrl.load();
      if (btn.dataset.tab === "sessions")  SessionsCtrl.load();
    });
  });
}

/* Ubicaciones y Aliados se retiraron (2026-11-17): viven en Prevision-Funeraria. */

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
    $("#cfg-model").value           = this.config.model?.value           || "gpt-5.6-luna";
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
  AgentCtrl.load();
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
