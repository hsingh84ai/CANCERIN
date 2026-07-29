// Drives the built app in a real browser: waits for the engine to load, runs a
// batch, and checks the progress bar and ETA actually appear and advance.
//
// Usage:
//   npm run build && npx vite preview --port 4173 &
//   node scripts/verify-browser.mjs [url]
import { chromium } from "playwright";

const URL_ = process.argv[2] || "http://localhost:4173/";
const problems = [];
const seen = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });

page.on("console", (m) => {
  if (m.type() === "error") problems.push(`console error: ${m.text()}`);
});
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));

console.log(`opening ${URL_}`);
await page.goto(URL_, { waitUntil: "domcontentloaded" });

// ---- loading phase ----------------------------------------------------------
const bar = page.locator('[role="progressbar"]');
if (await bar.count()) console.log("  loading progress bar present");

console.log("  waiting for engine to become ready…");
const runButton = page.getByRole("button", { name: "Run prediction" });
await runButton.waitFor({ state: "visible", timeout: 120000 });
console.log("  engine ready");

const blurb = await page.locator(".masthead p").innerText();
console.log(`  masthead: ${blurb.replace(/\s+/g, " ").slice(0, 90)}…`);

// ---- run a batch ------------------------------------------------------------
const N = 25;
const smiles = [
  "c1(ccc(cc1CCCCCCCCCCCCCCC)O)N\t17",
  "O=C1[C@H](C[C@@H](C[C@H]1[C@H](O)CC1CC(=O)NC(=O)C1)C)C\t185",
];
while (smiles.length < N) {
  smiles.push(`CC(=O)Oc1ccccc1C(=O)O\taspirin-${smiles.length}`);
}
await page.locator("#smiles").fill(smiles.join("\n"));
console.log(`\nrunning ${N} molecules`);
await runButton.click();

// Sample the live progress panel while it works.
const deadline = Date.now() + 120000;
let sawEta = false, sawPartial = false;
while (Date.now() < deadline) {
  if (!(await bar.count())) break;                    // run finished
  const text = (await page.locator(".panel .meta").innerText().catch(() => "")).replace(/\s+/g, " ");
  const pct = await page.locator(".panel .percent").innerText().catch(() => null);
  if (text && (!seen.length || seen.at(-1) !== `${pct} ${text}`)) {
    seen.push(`${pct} ${text}`);
    if (/left|almost done/.test(text)) sawEta = true;
    const m = text.match(/([\d,]+) of ([\d,]+)/);
    if (m && Number(m[1].replace(/,/g, "")) > 0 && m[1] !== m[2]) sawPartial = true;
  }
  await page.waitForTimeout(120);
}

console.log("\nprogress panel samples:");
for (const s of seen.slice(0, 14)) console.log(`  ${s}`);
if (seen.length > 14) console.log(`  … ${seen.length - 14} more`);

// ---- results ----------------------------------------------------------------
await page.locator("table tbody tr").first().waitFor({ timeout: 60000 });
const rows = await page.locator("table tbody tr").count();
const summary = (await page.locator(".summary").innerText()).replace(/\s+/g, " ");
console.log(`\n${summary}`);
console.log(`table rows: ${rows}`);

const first = await page.locator("table tbody tr").first().innerText();
const second = await page.locator("table tbody tr").nth(1).innerText();
console.log(`  ${first.replace(/\s+/g, " ")}`);
console.log(`  ${second.replace(/\s+/g, " ")}`);

// ---- structure depiction ----------------------------------------------------
console.log("\nopening a row to draw its structure");
await page.locator("table tbody tr[role='button']").first().click();
const svg = page.locator("tr.detail svg");
await svg.waitFor({ state: "visible", timeout: 30000 }).catch(() => {});

let bondCount = 0, atomLabels = 0;
if (await svg.count()) {
  bondCount = await svg.locator("line").count();
  atomLabels = await svg.locator("text").count();
  console.log(`  structure drawn: ${bondCount} bond lines, ${atomLabels} atom labels`);
} else {
  const msg = await page.locator("tr.detail .unavailable").innerText().catch(() => "(no detail panel)");
  console.log(`  no structure: ${msg}`);
}

// Aromatic caffeine exercises rings, hetero atoms and double bonds.
await page.locator("table tbody tr[role='button']").first().click();  // collapse
await page.screenshot({ path: "shot-results.png", fullPage: false });
console.log("screenshot -> shot-results.png");

// ---- checks -----------------------------------------------------------------
if (rows !== N) problems.push(`expected ${N} result rows, got ${rows}`);
if (!sawPartial) problems.push("never observed a partial count (progress bar did not show intermediate state)");
if (!sawEta) problems.push("no time-remaining estimate was ever displayed");
if (!/17\b/.test(first) || !/\b1\b/.test(first)) problems.push("NSC 17 row does not look like a self-match");
if (bondCount < 5) problems.push(`structure drawing has too few bonds (${bondCount}) — depiction likely failed`);
if (atomLabels < 1) problems.push("structure drawing has no atom labels");

await browser.close();

console.log();
if (problems.length) {
  for (const p of problems) console.log(`FAIL  ${p}`);
  process.exit(1);
}
console.log("Browser checks passed — progress bar, counts and ETA all render and advance.");
