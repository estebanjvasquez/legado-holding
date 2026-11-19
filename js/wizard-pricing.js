/* =============================================================================
   LEGADO — js/wizard-pricing.js
   Montos que el wizard MUESTRA según la frecuencia elegida. Solo presentación:
   el monto real lo calcula siempre Previsión a partir de plan_id +
   frecuencia_pago (el sitio nunca envía montos). Los centavos vienen tal cual
   de GET /planes:
     mensual → precio_mensual_centavos
     anual   → precio_anual_centavos
     Selecto → + cuota_inicial_centavos (cobro único, solo en el 1er cobro)
   Script clásico: asigna window.LegadoWizardPricing (testeable en Node).
   ============================================================================= */
(function (root) {
  "use strict";

  var TYPES = ["monthly", "annual"];

  function cents(v) {
    var n = Number(v);
    return v !== null && v !== undefined && v !== "" && Number.isFinite(n) && n >= 0
      ? Math.round(n)
      : null;
  }

  /* Frecuencias que el plan puede ofrecer (las que tienen precio publicado). */
  function availableTypes(plan) {
    if (!plan) return [];
    return TYPES.filter(function (t) {
      return cents(t === "monthly" ? plan.monthlyCents : plan.annualCents) !== null;
    });
  }

  /* null si la frecuencia no es válida o el plan no tiene ese precio. */
  function summary(plan, type) {
    if (!plan || TYPES.indexOf(type) === -1) return null;
    var recurring = cents(type === "monthly" ? plan.monthlyCents : plan.annualCents);
    if (recurring === null) return null;
    var initial = cents(plan.initialCents);
    if (!initial) initial = 0;
    return {
      type: type,
      frecuenciaPago: type === "annual" ? "anual" : "mensual",
      recurringCents: recurring,
      initialCents: initial,
      firstChargeCents: recurring + initial,
    };
  }

  /* 9470 → "$94,70" (siempre 2 decimales: es un monto a cobrar). */
  function formatCents(c) {
    return "$" + (c / 100).toFixed(2).replace(".", ",");
  }

  root.LegadoWizardPricing = { TYPES: TYPES, availableTypes: availableTypes, summary: summary, formatCents: formatCents };
})(typeof window !== "undefined" ? window : globalThis);
