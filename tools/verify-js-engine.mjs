// Verifies the TeaVM-compiled JavaScript engine against PaDEL's own output.
//
// This is the same test cancerin.Validate runs on the JVM, but through the
// browser artifact: if this passes, the Svelte app can compute fingerprints
// client-side with no server, no Java and no network.
//
// Run: node tools/verify-js-engine.mjs
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

const ENGINE = path.join(ROOT, "engine", "target", "js", "cancerin-engine.js");
if (!fs.existsSync(ENGINE)) {
  console.error(`missing ${path.relative(ROOT, ENGINE)}\nbuild it: cd engine && mvn -Ppatched,web package`);
  process.exit(1);
}

const engine = require(ENGINE);
if (typeof engine.fingerprint !== "function") {
  console.error("engine does not export fingerprint(); exports:", Object.keys(engine));
  process.exit(1);
}
if (typeof engine.main === "function") engine.main([]);

const idx = fs.readFileSync(path.join(ROOT, "imp-no"), "utf8").trim().split(/\r?\n/).map(Number);

// PaDEL's own answers. A row of entirely empty cells means PaDEL failed on that
// molecule; the engine is expected to fail too (returns null).
const csv = fs.readFileSync(path.join(ROOT, "data", "probes_out.csv"), "utf8").trim().split(/\r?\n/);
const expected = new Map();
for (let r = 1; r < csv.length; r++) {
  const cells = csv[r].split(",").map((s) => s.replace(/^"|"$/g, ""));
  const name = cells[0];
  const allEmpty = cells.slice(1).every((c) => c === "");
  expected.set(name, allEmpty ? null : idx.map((z) => (cells[z] === "" ? 0 : Number(cells[z]))));
}

const smi = fs.readFileSync(path.join(ROOT, "data", "probes.smi"), "utf8").trim().split(/\r?\n/);

let exact = 0, mismatched = 0, agreedFailures = 0, disagreedFailures = 0, total = 0;
const t0 = Date.now();

for (const line of smi) {
  const [smiles, name] = line.split(/\s+/);
  if (!expected.has(name)) continue;
  total++;
  const want = expected.get(name);
  const got = engine.fingerprint(smiles);

  if (got == null) {
    if (want === null) { agreedFailures++; exact++; }
    else { disagreedFailures++; console.log(`  NSC ${name}: engine returned null but PaDEL succeeded`); }
    continue;
  }
  if (want === null) {
    disagreedFailures++;
    console.log(`  NSC ${name}: engine succeeded but PaDEL failed`);
    continue;
  }
  if (got.length !== idx.length) {
    console.log(`  NSC ${name}: expected ${idx.length} bits, got ${got.length}`);
    mismatched++;
    continue;
  }
  let bad = 0;
  const byBlock = {};
  for (let b = 0; b < idx.length; b++) {
    if (Number(got[b]) === want[b]) continue;
    bad++;
    const c = idx[b];
    const block = c <= 1024 ? "FP" : c <= 2048 ? "ExtFP" : c <= 3151 ? "GraphFP"
                : c <= 3317 ? "MACCSFP" : "PubchemFP";
    byBlock[block] = (byBlock[block] || 0) + 1;
  }
  if (bad === 0) exact++;
  else {
    mismatched++;
    const detail = Object.entries(byBlock).map(([k, v]) => `${k} ${v}`).join(", ");
    console.log(`  NSC ${name}: ${bad}/${idx.length} bits differ  (${detail})`);
  }
}

const ms = Date.now() - t0;
console.log(`\n${exact}/${total} molecules exact  (${agreedFailures} unprocessable in both)`);
if (mismatched || disagreedFailures) console.log(`${mismatched} mismatched, ${disagreedFailures} disagreed on failure`);
console.log(`${(ms / total).toFixed(1)} ms per molecule`);
console.log(exact === total
  ? "\nJS ENGINE MATCHES PaDEL EXACTLY — the app can run fully client-side."
  : "\nJS engine does not yet match PaDEL.");
process.exit(exact === total ? 0 : 1);
