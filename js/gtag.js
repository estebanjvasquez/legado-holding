/* Google tag (gtag.js) — Google Analytics 4
   Property: G-6NQKC8DHDV
   Carga el script remoto de gtag e inicializa el tracking.
   Incluir desde index.html con:  <script src="js/gtag.js"></script>            */
(function () {
  var GA_ID = "G-6NQKC8DHDV";

  // Cargar el script remoto de Google Tag Manager (async)
  var s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
  document.head.appendChild(s);

  // Inicializar dataLayer y gtag
  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  window.gtag = gtag;

  gtag("js", new Date());
  gtag("config", GA_ID);
})();
