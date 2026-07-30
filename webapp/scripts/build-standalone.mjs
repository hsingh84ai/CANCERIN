// Packs the built app into ONE self-contained .html file.
//
// Everything goes inline: styles, script, the Web Worker (already inlined by
// Vite's ?worker&inline), the TeaVM engine, the packed background bitset and the
// annotations. The result opens straight from disk — no server, no network, no
// sibling files.
//
// Payloads are embedded as <script type="text/plain"> blocks rather than as
// JavaScript string literals, which avoids escaping ~1 MB of source and keeps
// the file appreciably smaller.
//
// Run: npm run build:standalone   (runs `npm run build` first)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..");
const ROOT = path.resolve(APP, "..");
const DIST = path.join(APP, "dist");
const OUT_DIR = path.join(APP, "dist-standalone");

const read = (p) => fs.readFileSync(p, "utf8");
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

if (!fs.existsSync(path.join(DIST, "index.html"))) {
  console.error("no dist/ — run `npm run build` first");
  process.exit(1);
}

// A payload containing `</script` would close its own block early. Replacing it
// with `<\/script` is safe: in JavaScript source that sequence is only valid
// inside a string literal, where \/ and / are identical; in JSON, \/ is a
// legal escape for /.
const guard = (s) => s.replace(/<\/script/gi, "<\\/script");

let html = read(path.join(DIST, "index.html"));

// ---- inline the stylesheet --------------------------------------------------
html = html.replace(/<link[^>]+rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_, href) => {
  const css = read(path.join(DIST, href.replace(/^\.?\//, "")));
  return `<style>\n${css}\n</style>`;
});

// ---- inline the app script --------------------------------------------------
let appScript = null;
html = html.replace(/<script[^>]*src="([^"]+)"[^>]*><\/script>/g, (_, src) => {
  appScript = read(path.join(DIST, src.replace(/^\.?\//, "")));
  return "<!--APP_SCRIPT-->";
});
if (!appScript) {
  console.error("could not find the app script in dist/index.html");
  process.exit(1);
}

// ---- the three data payloads ------------------------------------------------
const engine = read(path.join(DIST, "engine", "cancerin-engine.js"));
const annotations = read(path.join(DIST, "data", "annotations.json"));
const background = fs.readFileSync(path.join(DIST, "data", "background.bin")).toString("base64");

const payloads = `
<script type="text/plain" id="cancerin-engine">${guard(engine)}</script>
<script type="application/json" id="cancerin-annotations">${guard(annotations)}</script>
<script type="text/plain" id="cancerin-background">${background}</script>
<script>
  // Hand the embedded assets to the app, which passes them straight to the
  // worker instead of fetching. Removed from the DOM afterwards so ~1 MB of
  // text is not retained by the document.
  (function () {
    var pick = function (id) {
      var el = document.getElementById(id);
      var text = el.textContent;
      el.remove();
      return text;
    };
    window.__CANCERIN_INLINE__ = {
      engine: pick("cancerin-engine"),
      annotations: pick("cancerin-annotations"),
      background: pick("cancerin-background").trim()
    };
  })();
</script>
<script type="module">
${appScript}
</script>
`;

html = html.replace("<!--APP_SCRIPT-->", payloads);

fs.mkdirSync(OUT_DIR, { recursive: true });
const outFile = path.join(OUT_DIR, "cancerin.html");
fs.writeFileSync(outFile, html);

const size = fs.statSync(outFile).size;
console.log(`  engine        ${kb(engine.length)}`);
console.log(`  annotations   ${kb(annotations.length)}`);
console.log(`  background    ${kb(background.length)} (base64)`);
console.log(`  app + styles  ${kb(appScript.length)}`);
console.log(`  -> ${path.relative(ROOT, outFile)}  ${(size / 1024 / 1024).toFixed(2)} MB`);
