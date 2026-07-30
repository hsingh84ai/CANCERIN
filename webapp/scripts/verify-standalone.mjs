// Verifies the single-file build by opening it from disk over file:// — the way
// someone who downloaded it actually would.
//
// This is the real test of the standalone artifact: file:// is an opaque origin,
// so Blob-URL workers and inline module scripts behave differently there than on
// http://. Passing on a preview server proves nothing about it.
//
// Run: npm run verify:standalone
import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..");
const FILE = path.join(APP, "dist-standalone", "cancerin.html");

if (!fs.existsSync(FILE)) {
  console.error("no dist-standalone/cancerin.html — run `npm run build:standalone` first");
  process.exit(1);
}

const url = pathToFileURL(FILE).href;
const problems = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
page.on("console", (m) => { if (m.type() === "error") problems.push(`console error: ${m.text()}`); });
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));

// Nothing may be fetched over the network — that is the whole point.
const external = [];
page.on("request", (r) => {
  if (!r.url().startsWith("file://") && !r.url().startsWith("blob:") && !r.url().startsWith("data:")) {
    external.push(r.url());
  }
});

console.log(`opening ${url}`);
console.log(`  size: ${(fs.statSync(FILE).size / 1024 / 1024).toFixed(2)} MB`);
await page.goto(url, { waitUntil: "domcontentloaded" });

const runButton = page.getByRole("button", { name: "Run prediction" });
await runButton.waitFor({ state: "visible", timeout: 120000 });
console.log("  engine ready (no server, no network)");

const stats = await page.locator(".masthead p").innerText();
console.log(`  reference set: ${(stats.match(/([\d,]+)-compound/) || [])[1] ?? "?"}`);

// ---- score a batch ----------------------------------------------------------
await page.locator("#smiles").fill([
  "c1(ccc(cc1CCCCCCCCCCCCCCC)O)N\t17",
  "O=C1[C@H](C[C@@H](C[C@H]1[C@H](O)CC1CC(=O)NC(=O)C1)C)C\t185",
  "CC(=O)Oc1ccccc1C(=O)O\taspirin",
  "Cn1cnc2c1c(=O)n(C)c(=O)n2C\tcaffeine",
  "not-a-smiles\tbogus",
].join("\n"));
await runButton.click();
await page.locator("table tbody tr").first().waitFor({ timeout: 120000 });
await page.waitForTimeout(800);

const rows = await page.locator("table tbody tr[role='button']").count();
console.log(`\nresults: ${rows} rows`);
for (let i = 0; i < Math.min(rows, 5); i++) {
  console.log("  " + (await page.locator("table tbody tr[role='button']").nth(i).innerText()).replace(/\s+/g, " "));
}

// ---- structure depiction ----------------------------------------------------
await page.locator("table tbody tr[role='button']").first().click();
const svg = page.locator("tr.detail svg");
await svg.waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
const bonds = (await svg.count()) ? await svg.locator("line").count() : 0;
console.log(`\nstructure: ${bonds} bond lines`);

// ---- method section: figures must be inlined AND actually decode ------------
await page.getByRole("button", { name: /How the method works/ }).click();
await page.locator(".method img").first().waitFor({ state: "visible", timeout: 15000 });
const figures = await page.locator(".method img").evaluateAll((imgs) =>
  imgs.map((i) => ({ dataUri: i.src.startsWith("data:"), w: i.naturalWidth, h: i.naturalHeight }))
);
console.log(`\nmethod figures: ${figures.length}`);
for (const f of figures) console.log(`  ${f.w}x${f.h}  data-uri=${f.dataUri}`);

await page.screenshot({ path: path.join(APP, "shot-standalone.png"), fullPage: true });
await browser.close();

// ---- checks -----------------------------------------------------------------
if (rows !== 5) problems.push(`expected 5 result rows, got ${rows}`);
if (bonds < 5) problems.push(`structure did not draw (${bonds} bonds)`);
if (external.length) problems.push(`made ${external.length} external request(s): ${external.slice(0, 3).join(", ")}`);
if (figures.length !== 2) problems.push(`expected 2 method figures, got ${figures.length}`);
for (const f of figures) {
  if (!f.dataUri) problems.push("a method figure is not inlined as a data URI");
  if (!f.w || !f.h) problems.push("a method figure failed to decode (0x0)");
}

console.log();
if (problems.length) {
  for (const p of problems) console.log(`FAIL  ${p}`);
  process.exit(1);
}
console.log("Standalone file works from disk — no server, no network, no sibling files.");
