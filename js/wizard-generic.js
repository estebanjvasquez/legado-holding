/* =============================================================================
   LEGADO — js/wizard-generic.js
   Wizard genérico de 5 pasos: lanzado desde "PROTEGE TU LEGADO" (sin plan)
   Completamente independiente de main.js. No comparte estado ni funciones.

   PASOS:
     0 — Datos del titular
     1 — Familiares a afiliar
     2 — Selección de plan
     3 — Forma de pago
     4 — Resumen + Contrato + Acepto y Paga
   ============================================================================= */

(function () {
  "use strict";

  /* ══════════════════════════════════════════════════════════════════════════
     ESTADO PROPIO — completamente aislado de main.js
     ══════════════════════════════════════════════════════════════════════════ */
  var gStep    = 0;
  var gOpen    = false;
  var gPlan    = null;
  var gPayment = "monthly";
  var gTerms   = false;
  var gBuyer   = { name:"", lastName:"", cedula:"", phone:"", email:"", birthDate:"" };
  var gFamily  = [];

  var TOTAL = 5;

  /* ══════════════════════════════════════════════════════════════════════════
     HELPERS
     ══════════════════════════════════════════════════════════════════════════ */
  function q(sel, ctx)  { return (ctx || document).querySelector(sel); }
  function qa(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }

  function esc(s) {
    return String(s)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;")
      .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  /* Lee traducciones del diccionario de main.js */
  function tr(key) {
    try {
      if (typeof LANG !== "undefined" && LANG[key]) {
        var lang = (typeof currentLang !== "undefined") ? currentLang : "es";
        return lang === "es" ? LANG[key][0] : LANG[key][1];
      }
    } catch(e) {}
    return key;
  }

  function lang() {
    try { return (typeof currentLang !== "undefined") ? currentLang : "es"; }
    catch(e) { return "es"; }
  }

  /* Edad máxima del plan seleccionado (65 por defecto, 80 para vanguardia-zulia) */
  function maxAge() {
    try {
      if (gPlan && typeof PLANS !== "undefined" && PLANS[gPlan] && PLANS[gPlan].maxAge) {
        return PLANS[gPlan].maxAge;
      }
    } catch(e) {}
    return 65;
  }

  function dateMin() {
    var d = new Date(); d.setFullYear(d.getFullYear() - maxAge());
    return d.toISOString().split("T")[0];
  }
  function dateMax() {
    var d = new Date(); d.setFullYear(d.getFullYear() - 18);
    return d.toISOString().split("T")[0];
  }

  function ageOk(dateStr) {
    if (!dateStr) return true;
    var birth = new Date(dateStr), today = new Date();
    var age   = today.getFullYear() - birth.getFullYear();
    var m     = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age <= maxAge();
  }

  var CHECK_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  var ARROW_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
  var BACK_SVG  = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';

  /* ══════════════════════════════════════════════════════════════════════════
     ABRIR / CERRAR
     ══════════════════════════════════════════════════════════════════════════ */
  function open() {
    gStep    = 0;
    gOpen    = true;
    gPlan    = null;
    gPayment = "monthly";
    gTerms   = false;
    gBuyer   = { name:"", lastName:"", cedula:"", phone:"", email:"", birthDate:"" };
    gFamily  = [];

    var ov = q("#wg-overlay");
    if (!ov) { buildDOM(); ov = q("#wg-overlay"); }
    if (!ov) return;
    ov.classList.remove("hidden");
    refresh();
  }
  window.openGenericWizard = open;

  function close() {
    gOpen = false;
    var ov = q("#wg-overlay");
    if (ov) ov.classList.add("hidden");
  }

  /* ══════════════════════════════════════════════════════════════════════════
     RENDER PRINCIPAL
     ══════════════════════════════════════════════════════════════════════════ */
  function refresh() {
    renderBar();
    renderBody();
    renderFooter();
    /* Nombre del plan en el header */
    var nameEl = q("#wg-plan-name");
    if (nameEl) {
      if (gPlan) { nameEl.textContent = tr("plan_" + gPlan + "_name"); nameEl.style.display = ""; }
      else       { nameEl.style.display = "none"; }
    }
    /* Actualiza el título del wizard según idioma */
    var titleEl = q("#wg-title");
    if (titleEl) titleEl.textContent = tr("wiz_title");
  }

  /* ── Barra de progreso ─────────────────────────────────────────────────── */
  function renderBar() {
    var el = q("#wg-steps");
    if (!el) return;
    var L = lang();
    var labels = L === "es"
      ? ["Datos","Familia","Plan","Pago","Resumen"]
      : ["Info","Family","Plan","Payment","Summary"];

    el.innerHTML = labels.map(function(label, i) {
      var dc  = i < gStep ? "done"   : (i === gStep ? "active"   : "inactive");
      var lc  = i <= gStep ? "active" : "inactive";
      var dot = i < gStep ? CHECK_SVG : String(i + 1);
      var line = i < labels.length - 1
        ? '<div class="step-line ' + (i < gStep ? "done" : "") + '"></div>'
        : "";
      return '<div class="step-dot-wrap">'
        + '<div class="step-dot ' + dc + '">' + dot + '</div>'
        + '<span class="step-label ' + lc + '">' + label + '</span>'
        + line
        + '</div>';
    }).join("");
  }

  /* ── Cuerpo del paso ───────────────────────────────────────────────────── */
  function renderBody() {
    var body = q("#wg-body");
    if (!body) return;
    body.innerHTML = "";
    var div = document.createElement("div");
    div.className = "wizard-step active";

    if      (gStep === 0) div.innerHTML = buildStep0();
    else if (gStep === 1) div.innerHTML = buildStep1();
    else if (gStep === 2) div.innerHTML = buildStep2();
    else if (gStep === 3) div.innerHTML = buildStep3();
    else if (gStep === 4) div.innerHTML = buildStep4();

    body.appendChild(div);
    bindStepEvents();
  }

  /* ── Footer ────────────────────────────────────────────────────────────── */
  function renderFooter() {
    var backBtn = q("#wg-back");
    var nextBtn = q("#wg-next");
    if (!backBtn || !nextBtn) return;

    backBtn.classList.toggle("hidden", gStep === 0);
    nextBtn.disabled = !canNext();

    if (gStep === TOTAL - 1) {
      nextBtn.textContent = tr("wiz_confirm");
    } else {
      nextBtn.innerHTML = tr("wiz_next") + " " + ARROW_SVG;
    }
    /* Botón Atrás */
    backBtn.innerHTML = BACK_SVG + " " + (lang() === "es" ? "Atrás" : "Back");
  }

  /* ── Validación ────────────────────────────────────────────────────────── */
  function canNext() {
    if (gStep === 0) {
      var b = gBuyer;
      return !!(b.name && b.lastName && b.cedula && b.phone && b.email && b.birthDate && ageOk(b.birthDate));
    }
    if (gStep === 1) return true;
    if (gStep === 2) return !!gPlan;
    if (gStep === 3) return !!gPlan && !!gPayment;
    if (gStep === 4) return gTerms;
    return true;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     PASO 0 — Datos del titular
     ══════════════════════════════════════════════════════════════════════════ */
  function buildStep0() {
    var b = gBuyer;
    var L = lang();
    return ''
      + '<div class="form-row cols-2">'
      +   '<div class="form-group"><label class="form-label">' + tr("wiz_fname") + '</label>'
      +     '<input class="form-input" id="wg-name" type="text" value="' + esc(b.name) + '" placeholder="' + tr("wiz_fname") + '"></div>'
      +   '<div class="form-group"><label class="form-label">' + tr("wiz_lname") + '</label>'
      +     '<input class="form-input" id="wg-lastName" type="text" value="' + esc(b.lastName) + '" placeholder="' + tr("wiz_lname") + '"></div>'
      + '</div>'
      + '<div class="form-row">'
      +   '<div class="form-group"><label class="form-label">' + tr("wiz_cedula") + '</label>'
      +     '<input class="form-input" id="wg-cedula" type="text" value="' + esc(b.cedula) + '" placeholder="V-12345678"></div>'
      + '</div>'
      + '<div class="form-row cols-2">'
      +   '<div class="form-group"><label class="form-label">' + tr("wiz_phone") + '</label>'
      +     '<input class="form-input" id="wg-phone" type="tel" value="' + esc(b.phone) + '" placeholder="+1 (555) 000-0000"></div>'
      +   '<div class="form-group"><label class="form-label">Email</label>'
      +     '<input class="form-input" id="wg-email" type="email" value="' + esc(b.email) + '" placeholder="correo@email.com"></div>'
      + '</div>'
      + '<div class="form-row">'
      +   '<div class="form-group"><label class="form-label">' + tr("wiz_birth") + '</label>'
      +     '<input class="form-input" id="wg-birthDate" type="date" value="' + b.birthDate + '" min="' + dateMin() + '" max="' + dateMax() + '">'
      +     '<div id="wg-age-error" class="form-error" style="display:none">'
      +       (L === "es" ? "Edad máxima permitida: 65 años" : "Maximum allowed age: 65 years")
      +     '</div>'
      +   '</div>'
      + '</div>';
  }

  /* ══════════════════════════════════════════════════════════════════════════
     PASO 1 — Familiares
     ══════════════════════════════════════════════════════════════════════════ */
  function buildStep1() {
    var L     = lang();
    var cards = gFamily.map(function(m, i) {
      var ageErr = m.birthDate && !ageOk(m.birthDate)
        ? '<div class="form-error">' + (L === "es" ? "Máx. 65 años" : "Max 65 years") + '</div>'
        : "";
      return '<div class="family-card">'
        + '<div class="family-card-header">'
        +   '<span class="family-card-title">' + tr("wiz_member") + " " + (i+1) + '</span>'
        +   '<button class="family-remove-btn" data-gremove="' + i + '">'
        +     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>'
        +   '</button>'
        + '</div>'
        + '<div class="form-row cols-2">'
        +   '<div class="form-group"><label class="form-label">' + tr("wiz_fname") + '</label><input class="form-input gfm" data-gi="' + i + '" data-gf="name" type="text" value="' + esc(m.name) + '"></div>'
        +   '<div class="form-group"><label class="form-label">' + tr("wiz_lname") + '</label><input class="form-input gfm" data-gi="' + i + '" data-gf="lastName" type="text" value="' + esc(m.lastName) + '"></div>'
        +   '<div class="form-group"><label class="form-label">' + tr("wiz_cedula") + '</label><input class="form-input gfm" data-gi="' + i + '" data-gf="cedula" type="text" value="' + esc(m.cedula) + '"></div>'
        +   '<div class="form-group"><label class="form-label">' + tr("wiz_relation") + '</label><input class="form-input gfm" data-gi="' + i + '" data-gf="relationship" type="text" value="' + esc(m.relationship) + '" placeholder="' + tr("wiz_relation_ph") + '"></div>'
        +   '<div class="form-group"><label class="form-label">' + tr("wiz_phone") + '</label><input class="form-input gfm" data-gi="' + i + '" data-gf="phone" type="tel" value="' + esc(m.phone) + '"></div>'
        +   '<div class="form-group"><label class="form-label">' + tr("wiz_birth") + '</label>'
        +     '<input class="form-input gfm" data-gi="' + i + '" data-gf="birthDate" type="date" value="' + m.birthDate + '" min="' + dateMin() + '" max="' + dateMax() + '">' + ageErr
        +   '</div>'
        + '</div>'
        + '</div>';
    }).join("");

    var addBtn = gFamily.length < 6
      ? '<button class="btn-add-family" id="wg-add-fam">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
        + tr("wiz_add_family") + '</button>'
      : "";

    return '<p style="color:var(--muted-foreground);font-size:0.875rem;margin-bottom:1.25rem">'
      + tr("wiz_family_hint") + '</p>'
      + '<div id="wg-fam-cards">' + cards + '</div>'
      + addBtn;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     PASO 2 — Selección de plan
     ══════════════════════════════════════════════════════════════════════════ */
  function buildStep2() {
    if (typeof PLANS === "undefined" || typeof PLAN_GROUPS === "undefined") {
      return '<p style="color:var(--muted-foreground);text-align:center;padding:2rem">Cargando planes...</p>';
    }
    var L     = lang();
    var intro = L === "es"
      ? "Selecciona el plan que mejor se adapte a tu familia:"
      : "Select the plan that best fits your family:";

    var html = '<p style="color:var(--muted-foreground);font-size:0.875rem;margin-bottom:1.5rem">' + intro + '</p>';

    PLAN_GROUPS.forEach(function(group) {
      html += '<div class="wiz-plan-group">';
      html += '<div class="wiz-plan-group-label">' + tr(group.region_key) + '</div>';
      group.plans.forEach(function(planId) {
        var plan      = PLANS[planId];
        var name      = tr("plan_" + planId + "_name");
        var sub       = (typeof PLAN_SUBTITLE !== "undefined" && PLAN_SUBTITLE[planId])
                          ? PLAN_SUBTITLE[planId][L] : "";
        var isS       = plan.initial !== undefined;
        var isHL      = typeof HIGHLIGHTED !== "undefined" && HIGHLIGHTED.has(planId);
        var selected  = gPlan === planId;
        var priceStr  = isS
          ? plan.initial + " " + (L === "es" ? "inicial" : "initial") + " + " + plan.monthly + tr("plan_mo")
          : plan.monthly + tr("plan_mo");
        var star      = isHL ? ' <span class="wiz-plan-star">★</span>' : "";
        var selCls    = (selected ? " selected" : "") + (isHL ? " highlighted" : "");

        html += '<button class="wiz-plan-option' + selCls + '" data-gplan="' + planId + '">'
          + '<div class="wiz-plan-option-left">'
          +   '<span class="wiz-plan-option-name">' + name + star + '</span>'
          +   '<span class="wiz-plan-option-sub">' + sub + '</span>'
          + '</div>'
          + '<span class="wiz-plan-option-price">' + priceStr + '</span>'
          + '</button>';
      });
      html += '</div>';
    });
    return html;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     PASO 3 — Forma de pago
     ══════════════════════════════════════════════════════════════════════════ */
  function buildStep3() {
    if (!gPlan || typeof PLANS === "undefined") {
      return '<p style="color:var(--muted-foreground);text-align:center;padding:2rem">'
        + (lang() === "es" ? "Por favor selecciona un plan primero" : "Please select a plan first")
        + '</p>';
    }
    var plan = PLANS[gPlan];
    var L    = lang();
    var isS  = plan.initial !== undefined;
    var pfx  = isS ? plan.initial + " + " : "";
    var mLbl = L === "es" ? "Domiciliar a tarjeta de crédito" : "Charge to credit card";
    var aLbl = L === "es" ? "¡Oferta de lanzamiento!" : "Launch offer!";

    return '<p style="color:var(--muted-foreground);font-size:0.875rem;margin-bottom:1rem">' + tr("wiz_select_payment") + '</p>'
      + '<button class="payment-option' + (gPayment === "monthly" ? " selected" : "") + '" data-gpay="monthly">'
      +   '<div><p class="payment-option-title">' + tr("wiz_monthly_title") + '</p><p class="payment-option-sub">' + mLbl + '</p></div>'
      +   '<div class="payment-option-price">' + pfx + plan.monthly + '<span>' + tr("plan_mo") + '</span></div>'
      + '</button>'
      + '<button class="payment-option' + (gPayment === "annual" ? " selected" : "") + '" data-gpay="annual">'
      +   '<div><p class="payment-option-title">' + tr("wiz_annual_title") + '</p><p class="payment-option-sub highlight">' + aLbl + '</p></div>'
      +   '<div class="payment-option-price">' + pfx + plan.annual + '<span>' + tr("plan_yr") + '</span></div>'
      + '</button>';
  }

  /* ══════════════════════════════════════════════════════════════════════════
     PASO 4 — Resumen + Contrato
     ══════════════════════════════════════════════════════════════════════════ */
  function buildStep4() {
    if (!gPlan || typeof PLANS === "undefined") {
      return '<p style="color:var(--muted-foreground);text-align:center;padding:2rem">Error: plan no seleccionado.</p>';
    }
    var plan    = PLANS[gPlan];
    var L       = lang();
    var isS     = plan.initial !== undefined;
    var pfx     = isS ? plan.initial + " + " : "";
    var price   = gPayment === "monthly"
      ? pfx + plan.monthly + tr("plan_mo")
      : pfx + plan.annual + tr("plan_yr") + (L === "es" ? " (lanzamiento)" : " (launch offer)");

    return '<div class="summary-box">'
      + '<h4>' + tr("wiz_summary_title") + '</h4>'
      + '<div class="summary-row"><span class="label">' + tr("wiz_sum_plan") + '</span><span class="value">' + tr("plan_" + gPlan + "_name") + '</span></div>'
      + '<div class="summary-row"><span class="label">' + tr("wiz_sum_payment") + '</span><span class="value highlight">' + price + '</span></div>'
      + '<div class="summary-row"><span class="label">' + tr("wiz_sum_buyer") + '</span><span class="value">' + esc(gBuyer.name) + " " + esc(gBuyer.lastName) + '</span></div>'
      + '<div class="summary-row"><span class="label">' + tr("wiz_sum_members") + '</span><span class="value">' + gFamily.length + '</span></div>'
      + '</div>'
      + '<div class="contract-box">'
      + '<h4>' + tr("wiz_contract_title") + '</h4>'
      + '<div class="contract-text">'
      +   '<p><strong>' + tr("wiz_contract_p0") + '</strong></p>'
      +   '<p>' + tr("wiz_contract_p1") + '</p>'
      +   '<p>' + tr("wiz_contract_p2") + '</p>'
      +   '<p>' + tr("wiz_contract_p3") + '</p>'
      +   '<p>' + tr("wiz_contract_p4") + '</p>'
      + '</div>'
      + '<label class="checkbox-row">'
      +   '<input type="checkbox" id="wg-terms" ' + (gTerms ? "checked" : "") + '>'
      +   '<span class="text">' + tr("wiz_contract_chk") + '</span>'
      + '</label>'
      + '</div>';
  }

  /* ══════════════════════════════════════════════════════════════════════════
     BIND DE EVENTOS DEL PASO ACTIVO
     ══════════════════════════════════════════════════════════════════════════ */
  function bindStepEvents() {

    /* Paso 0 */
    if (gStep === 0) {
      ["name","lastName","cedula","phone","email","birthDate"].forEach(function(f) {
        var el = q("#wg-" + f);
        if (!el) return;
        el.addEventListener("input", function() {
          gBuyer[f] = el.value;
          if (f === "birthDate") {
            var err = q("#wg-age-error");
            if (err) err.style.display = ageOk(el.value) ? "none" : "";
          }
          renderFooter();
        });
      });
    }

    /* Paso 1 */
    if (gStep === 1) {
      qa(".family-remove-btn[data-gremove]").forEach(function(btn) {
        btn.addEventListener("click", function() {
          gFamily.splice(parseInt(btn.dataset.gremove), 1);
          renderBody(); renderFooter();
        });
      });
      qa(".gfm").forEach(function(inp) {
        inp.addEventListener("input", function() {
          gFamily[parseInt(inp.dataset.gi)][inp.dataset.gf] = inp.value;
          renderFooter();
        });
      });
      var addBtn = q("#wg-add-fam");
      if (addBtn) {
        addBtn.addEventListener("click", function() {
          if (gFamily.length < 6) {
            gFamily.push({ name:"", lastName:"", cedula:"", phone:"", birthDate:"", relationship:"" });
            renderBody(); renderFooter();
          }
        });
      }
    }

    /* Paso 2 — selección de plan */
    if (gStep === 2) {
      qa(".wiz-plan-option[data-gplan]").forEach(function(btn) {
        btn.addEventListener("click", function() {
          gPlan = btn.dataset.gplan;
          qa(".wiz-plan-option").forEach(function(b) { b.classList.remove("selected"); });
          btn.classList.add("selected");
          var pEl = q("#wg-plan-name");
          if (pEl) { pEl.textContent = tr("plan_" + gPlan + "_name"); pEl.style.display = ""; }
          renderFooter();
        });
      });
    }

    /* Paso 3 — pago */
    if (gStep === 3) {
      qa(".payment-option[data-gpay]").forEach(function(btn) {
        btn.addEventListener("click", function() {
          gPayment = btn.dataset.gpay;
          qa(".payment-option").forEach(function(b) { b.classList.remove("selected"); });
          btn.classList.add("selected");
          renderFooter();
        });
      });
    }

    /* Paso 4 — términos */
    if (gStep === 4) {
      var cb = q("#wg-terms");
      if (cb) {
        cb.addEventListener("change", function() {
          gTerms = cb.checked;
          renderFooter();
        });
      }
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
     NAVEGACIÓN
     ══════════════════════════════════════════════════════════════════════════ */
  function goNext() {
    if (!canNext()) return;
    if (gStep < TOTAL - 1) { gStep++; refresh(); }
    else { submit(); }
  }

  function goBack() {
    if (gStep > 0) { gStep--; refresh(); }
  }

  function submit() {
    try { if (typeof showToast === "function") showToast(tr("toast_confirm"), "success"); } catch(e) {}
    close();
  }

  /* ══════════════════════════════════════════════════════════════════════════
     CONSTRUCCIÓN DEL DOM DEL MODAL GENÉRICO
     ══════════════════════════════════════════════════════════════════════════ */
  function buildDOM() {
    if (q("#wg-overlay")) return; /* ya existe */

    var ov = document.createElement("div");
    ov.id        = "wg-overlay";
    ov.className = "hidden";
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-modal", "true");
    /* Usa los mismos estilos de #wizard-overlay del CSS */
    ov.style.cssText = "position:fixed;inset:0;z-index:1100;"
      + "background:rgba(15,22,35,0.45);backdrop-filter:blur(6px);"
      + "display:flex;align-items:center;justify-content:center;"
      + "padding:1rem;animation:fadeIn 0.2s ease;";

    ov.innerHTML =
      '<div class="wizard-modal">'
        + '<div class="wizard-header">'
        +   '<div>'
        +     '<h3 class="wizard-header-title" id="wg-title">Compra tu plan</h3>'
        +     '<p id="wg-plan-name" class="wizard-header-plan" style="display:none"></p>'
        +   '</div>'
        +   '<button id="wg-close" class="wizard-close-btn" aria-label="Cerrar">'
        +     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">'
        +       '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'
        +     '</svg>'
        +   '</button>'
        + '</div>'
        + '<div id="wg-steps" class="wizard-steps" role="list"></div>'
        + '<div id="wg-body" class="wizard-body"></div>'
        + '<div class="wizard-footer">'
        +   '<button id="wg-back" class="btn-back hidden"></button>'
        +   '<button id="wg-next" class="btn-next" disabled></button>'
        + '</div>'
      + '</div>';

    document.body.appendChild(ov);

    /* Eventos del modal */
    ov.addEventListener("click", function(e) {
      if (e.target === ov) close();
    });
    q("#wg-close").addEventListener("click", close);
    q("#wg-next").addEventListener("click", goNext);
    q("#wg-back").addEventListener("click", goBack);
  }

  /* ══════════════════════════════════════════════════════════════════════════
     INICIALIZACIÓN
     ══════════════════════════════════════════════════════════════════════════ */
  function init() {
    buildDOM();

    /* ESC cierra el wizard genérico */
    document.addEventListener("keydown", function(e) {
      if (e.key === "Escape" && gOpen) close();
    });

    /* Delegación para todos los botones [data-open-wizard] sin data-plan */
    document.addEventListener("click", function(e) {
      var btn = e.target.closest("[data-open-wizard]:not([data-plan])");
      if (btn) open();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
