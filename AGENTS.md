Purpose
- Short, high-signal guidance for automated OpenCode sessions working on this repo.

Quick starting checklist (read these files first)
- README.md, DOCUMENTACION.md (authoritative for site behaviour and webhook contract)
- js/main.js (single JS entrypoint; where webhooks are wired)
- index.html, css/main.css (static site; no build step)
- n8n/README-stripe-checkout-workflow.md (n8n recipe created in this work)

What this repo is
- Static website for Apache. No Node build, no package.json, no tests. Edit HTML/CSS/JS directly.

How to search & inspect (use the provided tools)
- Use Glob to find files: glob("**/main.js"), glob("**/*.md").
- Use Grep to search code: grep pattern include:"*.js".
- Use Read to open files (prefer larger windows for context).

Edit rules (follow these exactly)
- Always use apply_patch to modify files. Do not write files with ad-hoc shell commands.
- Keep changes minimal and local to one function when possible.
- Prefer small, reviewable commits. Don't create unrelated edits.

Frontend/webhook specifics to avoid mistakes
- js/main.js contains two webhook constants at the top: CHAT_WEBHOOK_URL and WIZARD_WEBHOOK_URL. Update these to real endpoints before testing.
- The frontend now expects webhook JSON responses that may include: checkoutUrl, instructions, success, message, chips. See DOCUMENTACION.md for examples.
- The frontend saves the last wizard payload in window.__lastWizardPayload. If you change the wizard flow, preserve that behaviour unless you also update the follow-up code.
- CORS: the webhook must return Access-Control-Allow-Origin and allow Content-Type for browser fetches. If you test locally and get CORS errors, fix server headers first.

Testing / verification (fast manual checks)
- Basic webhook smoke using curl (replace URL):
  curl -X POST 'https://YOUR-N8N-URL/webhook/legado-wizard' \
    -H 'Content-Type: application/json' \
    -d '{"paymentMethod":"card","plan":"esencial-zulia","paymentType":"annual","buyer":{"name":"Test","email":"test@example.com"},"timestamp":"2026-04-20T00:00:00Z","source":"wizard"}'
- The frontend will open checkoutUrl in a new tab. If popup blocked, it shows a link in the modal.

Git and commit rules (critical)
- Only create commits when explicitly asked by the user. Do not commit automatically.
- When asked to commit, follow the repository style: Conventional Commits like "feat(wizard): ...".
- Never force-push or amend commits unless user explicitly requests and understands remote implications.

Common pitfalls an agent would otherwise miss
- Attempting to "npm install" or run tests: there are none; repo is static.
- Changing webhook URLs in multiple places: only js/main.js needs update for runtime behaviour (see DOCUMENTACION.md too).
- Editing the workflow n8n JSON: this repo contains a human-readable n8n guide file (n8n/README-...), not an exported workflow. If you need an export, ask first.
- Line endings: repo may be used on Windows; git may warn about LF↔CRLF. Don't change global core.autocrlf here without asking the user.

If you need clarification
- Ask one short question about missing external info: e.g., "What is the public n8n webhook URL to use?" or "Should I commit changes?".

Files of highest interest (edit with care)
- js/main.js — primary JS logic and webhook wiring
- index.html — HTML structure and injected strings
- css/main.css — visual styles (single file)
- DOCUMENTACION.md — authoritative contract for webhooks and deployment notes
- n8n/README-stripe-checkout-workflow.md — implementation recipe for server-side

That's it — keep changes small, test webhook interactions with curl, and don't commit unless asked.
