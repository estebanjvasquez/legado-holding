/* =============================================================================
   LEGADO — js/wizard-generic.js
   Los botones "Protege tu Legado" (data-open-wizard sin data-plan) ahora
   hacen scroll a la sección de planes para que el usuario elija desde allí.
   ============================================================================= */
(function () {
  "use strict";

  function init() {
    document.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-open-wizard]:not([data-plan])");
      if (!btn) return;
      e.preventDefault();
      var planesSection = document.querySelector("#planes");
      if (planesSection) {
        planesSection.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
