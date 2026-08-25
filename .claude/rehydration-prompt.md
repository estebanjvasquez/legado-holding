# Prompt de rehidratación

Pegar el contenido siguiente al inicio de una conversación nueva,
junto con el archivo `.claude/handoff.json` adjunto, para que Claude
retome el proyecto sin perder contexto.

---

Soy Esteban Vasquez. Estoy retomando el proyecto legado-holding.
Mi último checkpoint quedó en el JSON adjunto (`.claude/handoff.json`).

Ya se completó la migración de billing de Invoice Ninja a la API pública
de Prevision-Funeraria (wizard + bot Alma), desplegada a producción
(main → raíz de legadoholding.com, Worker en api.legadoholding.com).

Hay un hilo abierto sin cerrar: **`open_thread_needs_followup`** en el
JSON — el usuario reportó que Alma sigue presentándose dos veces en su
navegador, a pesar de que el fix está verificado como correcto tanto en
el código servido en producción como en el backend (probado directo
contra `/chat`). La hipótesis líder es caché de navegador/Cloudflare, no
un bug de código. Falta confirmar con el usuario probando en ventana de
incógnito.

Por favor:

1. Confirma que entiendes el estado del proyecto leyendo el JSON.
2. Resume en 3–5 líneas dónde estamos.
3. Si el usuario trae novedades sobre el doble-saludo, retoma desde
   `open_thread_needs_followup.next_step` en vez de re-investigar desde
   cero.
