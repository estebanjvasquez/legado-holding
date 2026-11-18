/* =============================================================================
   ATRIBUCIÓN DE VENDEDOR / CANAL  (?ref=CODIGO + UTMs)
   ─────────────────────────────────────────────────────────────────────────────
   Legado Holding opera con vendedores externos que reparten un enlace del tipo
   https://www.legadoholding.com?ref=MN4UYC5Y. El código tiene que sobrevivir a
   toda la navegación y viajar en cada compra (wizard) y cada prospecto/handoff
   (Alma) para que Prevision-Funeraria (tenant lh) atribuya la transacción al
   vendedor. Contrato: docs/api-publica-wizard.md §"Atribución de canal / vendedor".

   Modelo: FIRST-TOUCH entre códigos VÁLIDOS, con TTL de 90 días.
     - Un ?ref= se valida contra Previsión (Worker → GET /wizard/vendedor).
     - Un código inválido NO se queda con el crédito: antes podía quedar
       guardado 90 días y desplazar al enlace correcto de un vendedor real.
     - Si no se pudo verificar (Previsión caída), queda "sin_verificar", viaja
       igual en la compra (Previsión ignora un código inválido) y se revalida
       en la próxima visita.
     - Se guardan los últimos MAX_TOQUES toques (cada visita con ?ref=/UTM)
       para poder auditar y, a futuro, cambiar a last-touch o multi-touch.
       Viajan en el bloque `atribucion.toques`; el Worker los descarta hasta
       que la API de Previsión los acepte.

   Se carga ANTES de js/main.js. Expone window.LegadoAttribution.{init,get}.
   Las dependencias (storage, fetch, reloj) son inyectables para los tests
   (tests/attribution.test.mjs).
   ============================================================================= */
(function (root) {
  "use strict";

  const KEY = "legado_attribution";
  const TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 días
  /* 4–20 letras/números: mismo formato que acepta Previsión para códigos
     aleatorios o personalizados (ej. MARIAP2026). */
  const REF_RE = /^[A-Za-z0-9]{4,20}$/;
  const CANAL_ENUM = ["directo", "redes_sociales", "buscador", "otro"];
  const MAX_TOQUES = 10;
  const LOOKUP_TIMEOUT_MS = 5000;

  function deriveCanal(utm, referrerUrl) {
    const src = (utm.utm_source || "").toLowerCase();
    const med = (utm.utm_medium || "").toLowerCase();
    const blob = med + " " + src;
    if (/(social|instagram|facebook|tiktok|whatsapp|\big\b|\bfb\b|linkedin)/.test(blob)) {
      return "redes_sociales";
    }
    if (/(google|bing|yahoo|duckduckgo|search|cpc|ppc|sem|organic)/.test(blob)) {
      return "buscador";
    }
    if (utm.utm_source) return "otro";
    if (referrerUrl) {
      try {
        const host = new URL(referrerUrl).hostname.toLowerCase();
        if (/(^|\.)(google|bing|yahoo|duckduckgo)\./.test(host)) return "buscador";
        if (/(^|\.)(instagram|facebook|t\.co|twitter|x|tiktok|linkedin)\./.test(host)) {
          return "redes_sociales";
        }
        return "otro";
      } catch (_) {
        /* referrer no parseable */
      }
    }
    return "directo";
  }

  /* Toque de esta visita (o null si la visita no trae nada atribuible). */
  function readFromURL(search, pathname, referrer, now) {
    let params;
    try {
      params = new URLSearchParams(search || "");
    } catch (_) {
      return null;
    }
    const rawRef = (params.get("ref") || "").trim();
    const ref = REF_RE.test(rawRef) ? rawRef : "";
    const utm = {};
    ["utm_source", "utm_medium", "utm_campaign"].forEach((k) => {
      const v = (params.get(k) || "").trim().slice(0, 120);
      if (v) utm[k] = v;
    });
    const referrerUrl = String(referrer || "").slice(0, 500);
    if (!ref && Object.keys(utm).length === 0 && !referrerUrl) return null;

    const t = {
      ts: now,
      landing: (String(pathname || "") + String(search || "")).slice(0, 300),
      ...utm,
    };
    if (referrerUrl) t.referrer_url = referrerUrl;
    if (ref) t.ref = ref;
    t.canal_origen = ref ? "vendedor" : deriveCanal(utm, referrerUrl);
    return t;
  }

  function load(storage, now) {
    let raw;
    try {
      raw = storage && storage.getItem(KEY);
    } catch (_) {
      return null;
    }
    if (!raw) return null;
    let rec;
    try {
      rec = JSON.parse(raw);
    } catch (_) {
      return null;
    }
    if (!rec || typeof rec !== "object" || !rec.ts) return null;
    if (now - rec.ts > TTL_MS) return null; // vencido
    /* Registros de la versión anterior (sin ref_estado): el código nunca se
       validó — se revalida. */
    if (rec.ref && !rec.ref_estado) rec.ref_estado = "sin_verificar";
    if (!Array.isArray(rec.toques)) rec.toques = [];
    return rec;
  }

  function save(storage, rec) {
    try {
      storage && storage.setItem(KEY, JSON.stringify(rec));
    } catch (_) {
      /* storage lleno/bloqueado — se ignora, la compra igual funciona */
    }
  }

  /* Paso síncrono: registra el toque y, si todavía no hay vendedor, toma el
     ?ref= de esta visita como candidato "sin_verificar". Devuelve el registro
     a guardar (o null si no hay nada). */
  function applyTouch(rec, touch) {
    if (!touch) return rec;
    if (!rec) {
      rec = { v: 2, ts: touch.ts, toques: [] };
      copyContext(rec, touch);
    }
    rec.toques.push({ ...touch });
    if (rec.toques.length > MAX_TOQUES) rec.toques = rec.toques.slice(-MAX_TOQUES);

    if (touch.ref) {
      if (!rec.ref) {
        rec.ref = touch.ref;
        rec.ref_estado = "sin_verificar";
        /* Igual que antes: si el registro venía de UTM/referrer y ahora llega
           un vendedor, el contexto de campaña pasa a ser el de esta visita. */
        copyContext(rec, touch);
      } else if (rec.ref !== touch.ref && rec.ref_estado !== "valido" && !rec.ref_pendiente) {
        /* El primer código aún no está confirmado: este queda en espera por si
           el primero resulta inválido. */
        rec.ref_pendiente = touch.ref;
      }
    }
    return rec;
  }

  function copyContext(rec, touch) {
    ["utm_source", "utm_medium", "utm_campaign", "referrer_url", "landing"].forEach((k) => {
      if (touch[k]) rec[k] = touch[k];
      else delete rec[k];
    });
    rec.canal_origen = touch.canal_origen;
  }

  function markToques(rec, ref, estado) {
    rec.toques.forEach((t) => {
      if (t.ref === ref) t.estado = estado;
    });
  }

  /* Paso asíncrono: valida el código vigente. lookup(code) devuelve
     "valido" | "invalido" | "error". Como máximo dos rondas (vigente y
     pendiente). */
  async function validate(rec, lookup) {
    for (let i = 0; i < 2 && rec && rec.ref && rec.ref_estado !== "valido"; i++) {
      const res = await lookup(rec.ref);
      if (res === "valido") {
        rec.ref_estado = "valido";
        markToques(rec, rec.ref, "valido");
        delete rec.ref_pendiente;
        return rec;
      }
      if (res !== "invalido") return rec; // no se pudo verificar: queda sin_verificar
      markToques(rec, rec.ref, "invalido");
      if (rec.ref_pendiente) {
        rec.ref = rec.ref_pendiente;
        rec.ref_estado = "sin_verificar";
        delete rec.ref_pendiente;
      } else {
        delete rec.ref;
        delete rec.ref_estado;
      }
    }
    return rec;
  }

  function makeLookup(lookupUrl, fetchFn) {
    const detail = makeLookupDetail(lookupUrl, fetchFn);
    return async function lookup(code) {
      return (await detail(code)).estado;
    };
  }

  /* Igual que lookup pero devuelve también el nombre del vendedor:
     { estado: "valido" | "invalido" | "error", nombre }. */
  function makeLookupDetail(lookupUrl, fetchFn) {
    return async function lookupDetail(code) {
      if (!lookupUrl || typeof fetchFn !== "function") return { estado: "error", nombre: null };
      const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), LOOKUP_TIMEOUT_MS) : null;
      try {
        const r = await fetchFn(`${lookupUrl}?codigo=${encodeURIComponent(code)}`, {
          signal: ctrl ? ctrl.signal : undefined,
        });
        if (!r.ok) return { estado: "error", nombre: null };
        const d = await r.json();
        if (d && d.activo) return { estado: "valido", nombre: d.nombre || null };
        /* verificado:false = el Worker no pudo consultar a Previsión. */
        if (d && d.verificado === false) return { estado: "error", nombre: null };
        return { estado: "invalido", nombre: null };
      } catch (_) {
        return { estado: "error", nombre: null };
      } finally {
        if (timer) clearTimeout(timer);
      }
    };
  }

  function defaultDeps() {
    const w = typeof window !== "undefined" ? window : {};
    let storage = null;
    try {
      storage = w.localStorage || null;
    } catch (_) {
      storage = null;
    }
    return {
      storage,
      search: w.location ? w.location.search : "",
      pathname: w.location ? w.location.pathname : "",
      referrer: typeof document !== "undefined" ? document.referrer || "" : "",
      now: Date.now(),
      fetchFn: typeof fetch === "function" ? fetch.bind(w) : null,
    };
  }

  /* Se llama una vez al cargar la página. Devuelve una promesa que resuelve
     cuando terminó la validación (los tests la esperan; main.js no). */
  async function init(opts) {
    const d = { ...defaultDeps(), ...(opts || {}) };
    const touch = readFromURL(d.search, d.pathname, d.referrer, d.now);
    let rec = applyTouch(load(d.storage, d.now), touch);
    if (!rec) return null;
    save(d.storage, rec);
    if (rec.ref && rec.ref_estado !== "valido") {
      const lookup = d.lookup || makeLookup(d.lookupUrl, d.fetchFn);
      rec = await validate(rec, lookup);
      save(d.storage, rec);
    }
    return rec;
  }

  /* Bloque `atribucion` listo para el payload de compra/lead/chat, o {} si no
     hay nada que atribuir. Nunca lanza. Cuando hay vendedor NO mandamos
     canal_origen (la API lo infiere del código; evita un enum no soportado). */
  function get(opts) {
    const d = { ...defaultDeps(), ...(opts || {}) };
    const rec = load(d.storage, d.now);
    if (!rec) return {};
    const out = {};
    if (rec.ref) {
      out.codigo_vendedor = rec.ref;
    } else if (rec.canal_origen && CANAL_ENUM.includes(rec.canal_origen)) {
      out.canal_origen = rec.canal_origen;
    }
    ["utm_source", "utm_medium", "utm_campaign"].forEach((k) => {
      if (rec[k]) out[k] = rec[k];
    });
    if (rec.referrer_url) out.referrer_url = rec.referrer_url;
    if (rec.toques.length) {
      out.toques = rec.toques.map((t) => {
        const o = { fecha: new Date(t.ts).toISOString() };
        if (t.ref) o.codigo_vendedor = t.ref;
        if (t.estado) o.estado = t.estado;
        ["utm_source", "utm_medium", "utm_campaign"].forEach((k) => {
          if (t[k]) o[k] = t[k];
        });
        if (!t.ref && t.canal_origen) o.canal_origen = t.canal_origen;
        return o;
      });
    }
    return out;
  }

  /* Código vigente (para mostrarlo en el wizard), o null. */
  function current(opts) {
    const d = { ...defaultDeps(), ...(opts || {}) };
    const rec = load(d.storage, d.now);
    if (!rec || !rec.ref) return null;
    return { ref: rec.ref, ref_estado: rec.ref_estado, fuente: rec.fuente || "enlace" };
  }

  /* Código de asesor escrito a mano por el comprador en el wizard (respaldo
     para cuando el enlace ?ref= se perdió: otro dispositivo, Safari borra el
     localStorage a los 7 días sin interacción, etc.).
     Regla: NUNCA desplaza a un código de enlace ya validado (first-touch).
     `estado`: "valido" (Previsión lo confirmó) o "sin_verificar" (no se pudo
     consultar; viaja igual y Previsión ignora un código inválido).
     Devuelve true si quedó guardado. */
  function setManual(code, estado, opts) {
    const d = { ...defaultDeps(), ...(opts || {}) };
    if (!REF_RE.test(String(code || ""))) return false;
    let rec = load(d.storage, d.now);
    if (rec && rec.ref && rec.ref_estado === "valido" && rec.fuente !== "manual") return false;
    if (!rec) rec = { v: 2, ts: d.now, toques: [] };
    const st = estado === "valido" ? "valido" : "sin_verificar";
    rec.ref = code;
    rec.ref_estado = st;
    if (rec.fuente !== "manual") rec.canal_previo = rec.canal_origen || "directo";
    rec.fuente = "manual";
    rec.canal_origen = "vendedor";
    delete rec.ref_pendiente;
    rec.toques.push({ ts: d.now, ref: code, canal_origen: "vendedor", estado: st === "valido" ? "valido" : undefined, manual: true });
    if (rec.toques.length > MAX_TOQUES) rec.toques = rec.toques.slice(-MAX_TOQUES);
    save(d.storage, rec);
    return true;
  }

  /* Quita un código manual (el comprador borró el campo). Nunca toca un código
     que vino por enlace. */
  function clearManual(opts) {
    const d = { ...defaultDeps(), ...(opts || {}) };
    const rec = load(d.storage, d.now);
    if (!rec || rec.fuente !== "manual") return false;
    delete rec.ref;
    delete rec.ref_estado;
    delete rec.fuente;
    rec.canal_origen = rec.canal_previo || "directo";
    delete rec.canal_previo;
    save(d.storage, rec);
    return true;
  }

  function lookupCode(code, lookupUrl, opts) {
    const d = { ...defaultDeps(), ...(opts || {}) };
    return makeLookupDetail(lookupUrl, d.fetchFn)(code);
  }

  const api = { init, get, current, setManual, clearManual, lookupCode, _internals: { readFromURL, applyTouch, validate, load, KEY, TTL_MS, MAX_TOQUES, REF_RE } };
  root.LegadoAttribution = api;
})(typeof window !== "undefined" ? window : globalThis);
