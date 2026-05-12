/* =============================================================================
   LEGADO — js/wizard.js
   4-step purchase wizard modal.
   Depends on: main.js  (WIZARD_WEBHOOK_URL, PLANS, currentLang, wizardOpen,
               $, $$, t, escapeHTML, checkIcon, showToast)
   ============================================================================= */

let wizardSubmitted = false;
let wizardStep = 0;
let wizardSelectedPlan = null;
let wizardPaymentType = "monthly";
let wizardAcceptedTerms = false;
let wizardBuyer = {
  name: "",
  lastName: "",
  cedula: "",
  phone: "",
  email: "",
  birthDate: "",
  zip: "",
};
let wizardFamily = [];

/* ── Open / Close ─────────────────────────────────────────────────────────── */

function openWizard(planId) {
  wizardOpen = true;
  wizardSubmitted = false;
  wizardStep = 0;
  wizardSelectedPlan = planId;
  wizardPaymentType = "monthly";
  wizardAcceptedTerms = false;
  wizardBuyer = { name: "", lastName: "", cedula: "", phone: "", email: "", birthDate: "", zip: "" };
  wizardFamily = [];
  $("#wizard-overlay").classList.remove("hidden");
  renderWizardContent();
}

function closeWizard() {
  if (!wizardSubmitted && wizardBuyer.name) {
    const payload = {
      intent:      "lead_abandoned",
      plan:        wizardSelectedPlan,
      paymentType: wizardPaymentType,
      buyer:       wizardBuyer,
      family:      wizardFamily,
      step:        wizardStep,
      timestamp:   new Date().toISOString(),
    };
    try {
      fetch(WIZARD_WEBHOOK_URL, {
        method:    "POST",
        headers:   { "Content-Type": "application/json" },
        body:      JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {});
    } catch (_) {}
  }
  wizardOpen = false;
  $("#wizard-overlay").classList.add("hidden");
}

/* ── Success / Error screens ─────────────────────────────────────────────── */

function showWizardSuccessScreen(email) {
  wizardSubmitted = true;
  const isEs = currentLang === "es";
  const msg = isEs
    ? `Tu solicitud fue recibida correctamente. Recibirás un correo en <strong>${escapeHTML(email)}</strong> con el enlace para completar tu pago.`
    : `Your request was received successfully. You will receive an email at <strong>${escapeHTML(email)}</strong> with the link to complete your payment.`;
  const closeLabel = isEs ? "Cerrar" : "Close";

  const body = $("#wizard-body");
  if (body) {
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:1.5rem;padding:2rem 1rem;text-align:center;">
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>
        <p style="font-size:1rem;color:#374151;line-height:1.6;">${msg}</p>
        <button class="btn-back" id="wizard-success-close-btn">${closeLabel}</button>
      </div>`;
    $("#wizard-success-close-btn")?.addEventListener("click", closeWizard);
  }

  const footer = $(".wizard-footer");
  if (footer) footer.style.display = "none";
  const steps = $("#wizard-steps");
  if (steps) steps.style.display = "none";
}

function showWizardError(msg) {
  const body = $("#wizard-body");
  if (!body) { showToast(msg, "error"); return; }
  body.innerHTML = `<div class="wizard-error">${escapeHTML(msg)}</div>
    <div style="margin-top:1rem"><button id="wizard-retry-btn" class="btn-outline">Reintentar</button></div>`;
  $("#wizard-retry-btn")?.addEventListener("click", () => renderWizardContent());
}

function showWizardInfo(title, link, text) {
  const body = $("#wizard-body");
  if (!body) { showToast(text || title, "info"); return; }
  const parts = [];
  if (title) parts.push(`<div class="wizard-info-title">${escapeHTML(title)}</div>`);
  if (text)  parts.push(`<div class="wizard-info-text">${escapeHTML(text)}</div>`);
  if (link)  parts.push(`<div class="wizard-info-link"><a href="${escapeHTML(link)}" target="_blank" rel="noopener">${link}</a></div>`);
  parts.push('<div style="margin-top:1rem"><button id="wizard-retry-btn" class="btn-outline">Volver a intentar</button></div>');
  body.innerHTML = parts.join("");
  $("#wizard-retry-btn")?.addEventListener("click", () => renderWizardContent());
}

/* ── Render orchestration ────────────────────────────────────────────────── */

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
    t("wiz_step_plan"),
    t("wiz_step_summary"),
  ];
  el.innerHTML = labels
    .map((label, i) => {
      const dotClass   = i < wizardStep ? "done" : i === wizardStep ? "active" : "inactive";
      const labelClass = i <= wizardStep ? "active" : "inactive";
      return `
      <div class="step-dot-wrap">
        <div class="step-dot ${dotClass}">
          ${i < wizardStep
            ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
            : i + 1}
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
  if      (wizardStep === 0) div.innerHTML = renderStep0();
  else if (wizardStep === 1) div.innerHTML = renderStep1();
  else if (wizardStep === 2) div.innerHTML = renderStep2();
  else if (wizardStep === 3) div.innerHTML = renderStep3();
  body.appendChild(div);
  bindWizardStepEvents();
}

/* ── Individual step renderers ───────────────────────────────────────────── */

function renderStep0() {
  const b = wizardBuyer;
  const maxAge = PLANS[wizardSelectedPlan]?.maxAge || 65;
  const minDate = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - maxAge); return d.toISOString().split("T")[0]; })();
  const maxDate = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 18);  return d.toISOString().split("T")[0]; })();
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
    <div class="form-row cols-2">
      <div class="form-group"><label class="form-label">${t("wiz_birth")}</label>
        <input class="form-input" id="wf-birthDate" type="date" value="${b.birthDate}" min="${minDate}" max="${maxDate}">
        <div id="age-error" class="form-error" style="display:none">
          ${currentLang === "es" ? "Edad máxima permitida: " + maxAge + " años" : "Maximum allowed age: " + maxAge + " years"}
        </div>
      </div>
      <div class="form-group"><label class="form-label">${currentLang === "es" ? "Código Postal (ZIP)" : "ZIP Code"}</label>
        <input class="form-input" id="wf-zip" type="text" value="${escapeHTML(b.zip)}" placeholder="33101" maxlength="10"></div>
    </div>`;
}

function renderStep1() {
  const maxAge = PLANS[wizardSelectedPlan]?.maxAge || 65;
  const minDate = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - maxAge); return d.toISOString().split("T")[0]; })();
  const maxDate = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 18);  return d.toISOString().split("T")[0]; })();
  const ageErrMsg = currentLang === "es" ? "Máximo " + maxAge + " años" : "Max " + maxAge + " years";

  const cards = wizardFamily.map((m, i) => `
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
    </div>`).join("");

  return `
    <p style="color:var(--muted-foreground);font-size:0.875rem;margin-bottom:1.25rem">${t("wiz_family_hint")}</p>
    <div id="family-cards">${cards}</div>
    ${wizardFamily.length < 6 ? `
      <button class="btn-add-family" id="btn-add-family">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        ${t("wiz_add_family")}
      </button>` : ""}`;
}

function renderStep2() {
  const plan = PLANS[wizardSelectedPlan];
  if (!plan) return "<p>Plan no encontrado.</p>";
  const isSelecto = plan.initial !== undefined;
  const monthlyLabel = currentLang === "es" ? "Domiciliar a tarjeta de crédito" : "Charge to credit card";
  const annualSub    = currentLang === "es" ? "¡Oferta de lanzamiento!" : "Launch offer!";

  const monthlyPrice = (isSelecto ? plan.initial + " + " : "") + (plan.monthly || "");
  const annualPrice  = (isSelecto ? plan.initial + " + " : "") + (plan.annual  || "");

  const showMonthly = !!plan.monthly;
  const showAnnual  = !!plan.annual;

  return `
    <p style="color:var(--muted-foreground);font-size:0.875rem;margin-bottom:0.5rem">${t("wiz_select_payment")}</p>
    ${showMonthly ? `
    <button class="payment-option${wizardPaymentType === "monthly" ? " selected" : ""}" data-type="monthly">
      <div>
        <p class="payment-option-title">${t("wiz_monthly_title")}</p>
        <p class="payment-option-sub">${monthlyLabel}</p>
      </div>
      <div class="payment-option-price">${monthlyPrice}<span>${t("plan_mo")}</span></div>
    </button>` : ""}
    ${showAnnual ? `
    <button class="payment-option${wizardPaymentType === "annual" ? " selected" : ""}" data-type="annual">
      <div>
        <p class="payment-option-title">${t("wiz_annual_title")}</p>
        <p class="payment-option-sub highlight">${annualSub}</p>
      </div>
      <div class="payment-option-price">${annualPrice}<span>${t("plan_yr")}</span></div>
    </button>` : ""}`;
}

function renderStep3() {
  const plan = PLANS[wizardSelectedPlan];
  if (!plan) return "<p>Plan no encontrado.</p>";
  const planName   = t(`plan_${wizardSelectedPlan}_name`);
  const isSelecto  = plan.initial !== undefined;
  const prefix     = isSelecto ? plan.initial + " + " : "";
  const priceVal   = wizardPaymentType === "monthly" ? plan.monthly : plan.annual;
  const priceSuffix = wizardPaymentType === "monthly" ? t("plan_mo") : t("plan_yr");
  const launchNote  = wizardPaymentType === "annual"
    ? (currentLang === "es" ? " (oferta lanzamiento)" : " (launch offer)") : "";
  const priceDisplay = prefix + (priceVal || "") + priceSuffix + launchNote;
  const billingMode  = wizardPaymentType === "monthly" ? t("wiz_monthly_title") : t("wiz_annual_title");

  return `
    <div class="summary-box">
      <h4>${t("wiz_summary_title")}</h4>
      <div class="summary-row"><span class="label">${t("wiz_sum_plan")}</span><span class="value">${planName}</span></div>
      <div class="summary-row"><span class="label">${t("wiz_sum_billing")}</span><span class="value">${billingMode}</span></div>
      <div class="summary-row"><span class="label">${t("wiz_sum_payment")}</span><span class="value highlight">${priceDisplay}</span></div>
      <div class="summary-row"><span class="label">${t("wiz_sum_buyer")}</span><span class="value">${escapeHTML(wizardBuyer.name)} ${escapeHTML(wizardBuyer.lastName)}</span></div>
      <div class="summary-row"><span class="label">${t("wiz_sum_members")}</span><span class="value">${wizardFamily.length}</span></div>
    </div>
    <div class="contract-box">
      <h4>${t("wiz_contract_title")}</h4>
      <div class="contract-text">
        <p><strong>${t("wiz_contract_p0")}</strong></p>
        <p>${t("wiz_contract_p1")}</p>
        <p>${t("wiz_contract_p2")}</p>
        <p>${t("wiz_contract_p3")}</p>
        <p>${t("wiz_contract_p4")}</p>
      </div>
      <label class="checkbox-row">
        <input type="checkbox" id="terms-check" ${wizardAcceptedTerms ? "checked" : ""}>
        <span class="text">${t("wiz_contract_chk")}</span>
      </label>
    </div>`;
}

/* ── Age validation ──────────────────────────────────────────────────────── */

function validateAge(dateStr, maxAge) {
  if (!dateStr) return true;
  const birth = new Date(dateStr);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age <= (maxAge || 65);
}

/* ── Event binding ───────────────────────────────────────────────────────── */

function bindWizardStepEvents() {
  if (wizardStep === 0) {
    const maxAge = PLANS[wizardSelectedPlan]?.maxAge || 65;
    ["name", "lastName", "cedula", "phone", "email", "birthDate", "zip"].forEach((field) => {
      const el = $(`#wf-${field}`);
      if (!el) return;
      el.addEventListener("input", () => {
        wizardBuyer[field] = el.value;
        if (field === "birthDate") {
          const err = $("#age-error");
          if (err) err.style.display = !validateAge(el.value, maxAge) ? "" : "none";
        }
        updateWizardFooter();
      });
    });
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
        wizardFamily[parseInt(input.dataset.idx)][input.dataset.field] = input.value;
        updateWizardFooter();
      });
    });
    $("#btn-add-family")?.addEventListener("click", () => {
      if (wizardFamily.length < 6) {
        wizardFamily.push({ name: "", lastName: "", cedula: "", phone: "", birthDate: "", relationship: "" });
        renderWizardStep();
        updateWizardFooter();
      }
    });
  }

  if (wizardStep === 2) {
    $$(".payment-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        wizardPaymentType = btn.dataset.type;
        $$(".payment-option").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        updateWizardFooter();
      });
    });
  }

  if (wizardStep === 3) {
    $("#terms-check")?.addEventListener("change", (e) => {
      wizardAcceptedTerms = e.target.checked;
      updateWizardFooter();
    });
  }
}

/* Called by applyLanguage in main.js to re-render the family step on language change */
function renderWizardFamilyStep() {
  if (wizardOpen && wizardStep === 1) renderWizardStep();
}

/* ── Footer / navigation ─────────────────────────────────────────────────── */

function canWizardNext() {
  if (wizardStep === 0) {
    const b = wizardBuyer;
    const maxAge = PLANS[wizardSelectedPlan]?.maxAge || 65;
    return !!(b.name && b.lastName && b.cedula && b.phone && b.email && b.birthDate && b.zip && validateAge(b.birthDate, maxAge));
  }
  if (wizardStep === 1) return true;
  if (wizardStep === 2) return !!(wizardSelectedPlan && wizardPaymentType);
  if (wizardStep === 3) return wizardAcceptedTerms;
  return true;
}

function updateWizardFooter() {
  const footer = $(".wizard-footer");
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
  if (wizardStep < 3) {
    wizardStep++;
    renderWizardContent();
  } else {
    submitWizard();
  }
}

function wizardBack() {
  if (wizardStep > 0) {
    wizardStep--;
    renderWizardContent();
  }
}

/* ── Submit ──────────────────────────────────────────────────────────────── */

async function submitWizard() {
  const payload = {
    intent:      "create_payment_intent",
    plan:        wizardSelectedPlan,
    paymentType: wizardPaymentType,
    buyer:       wizardBuyer,
    family:      wizardFamily,
    timestamp:   new Date().toISOString(),
  };

  setWizardProcessing(true);

  try {
    const resp = await fetch(WIZARD_WEBHOOK_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    await resp.json().catch(() => null);
    setWizardProcessing(false);
    showWizardSuccessScreen(wizardBuyer.email);
  } catch (e) {
    console.error("Webhook error:", e);
    setWizardProcessing(false);
    showWizardError(
      currentLang === "es"
        ? "Error de conexión. Por favor intenta de nuevo."
        : "Connection error. Please try again.",
    );
  }
}

function setWizardProcessing(on) {
  const overlay = $("#wizard-overlay");
  const nextBtn = $("#wizard-next-btn");
  const backBtn = $("#wizard-back-btn");
  if (nextBtn) nextBtn.disabled = on;
  if (backBtn) backBtn.disabled = on;
  if (overlay) overlay.classList.toggle("wizard-processing", !!on);
}

/* ── Init ────────────────────────────────────────────────────────────────── */

function initWizard() {
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
