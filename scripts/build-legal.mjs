/* Genera el contenido de terminos-condiciones.html y politica-privacidad.html a
   partir de los textos aprobados en la raíz del repo:
     terminos-condiciones-es.txt / terminos-condiciones-en.txt
     politica-privacidad-es.txt  / politica-privacidad-en.txt
   Reemplaza solo lo que está entre <main class="container"> y </main> y la
   fecha de "Última actualización". Uso: node scripts/build-legal.mjs */
import { readFileSync, writeFileSync } from "node:fs";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const linkify = (s) =>
  esc(s)
    .replace(/\b([\w.+-]+@[\w-]+\.[\w.-]*\w)\b/g, '<a href="mailto:$1">$1</a>')
    .replace(/\b((?:https?:\/\/)?www\.legadoholding\.com[\w/.-]*)/g, (m) => `<a href="${m.startsWith("http") ? m : "https://" + m}">${m}</a>`);

function toHTML(txt) {
  const lines = txt.replace(/\r/g, "").split("\n");
  const [, subtitle] = lines; // línea 0 = título (va en el h1 de la página)
  const out = [`<p class="updated-inline"><strong>${esc(subtitle.trim())}</strong></p>`];
  let section = false;
  let list = false;
  const closeList = () => { if (list) { out.push("</ul>"); list = false; } };
  for (const raw of lines.slice(2)) {
    const line = raw.trim();
    if (!line) { closeList(); continue; }
    if (/^\d+\.\s+\S/.test(line) && line === line.toUpperCase()) {
      closeList();
      if (section) out.push("</section>");
      out.push(`<section class="clause">`, `<h2>${esc(line)}</h2>`);
      section = true;
    } else if (/^[-•]\s+/.test(line)) {
      if (!list) { out.push("<ul>"); list = true; }
      out.push(`<li>${linkify(line.replace(/^[-•]\s+/, ""))}</li>`);
    } else {
      closeList();
      out.push(`<p>${linkify(line)}</p>`);
    }
  }
  closeList();
  if (section) out.push("</section>");
  return out.map((l) => "                " + l).join("\n");
}

function build(page, base, updated) {
  const es = readFileSync(`${base}-es.txt`, "utf8");
  const en = readFileSync(`${base}-en.txt`, "utf8");
  let html = readFileSync(page, "utf8");
  const main = `<main class="container">
            <!-- Generado por scripts/build-legal.mjs desde ${base}-es.txt / ${base}-en.txt. No editar a mano. -->
            <div lang-block="es" class="active">
${toHTML(es)}
            </div>

            <div lang-block="en">
${toHTML(en)}
            </div>
        </main>`;
  html = html.replace(/<main class="container">[\s\S]*?<\/main>/, main);
  html = html.replace(/Última actualización: [^"<\n]+/g, `Última actualización: ${updated.es}`);
  html = html.replace(/Last updated: [^"<\n]+/g, `Last updated: ${updated.en}`);
  writeFileSync(page, html);
  console.log(`${page} ← ${base}-es/en.txt`);
}

const updated = { es: "noviembre de 2026 (versión 2.0)", en: "November 2026 (version 2.0)" };
build("terminos-condiciones.html", "terminos-condiciones", updated);
build("politica-privacidad.html", "politica-privacidad", updated);
