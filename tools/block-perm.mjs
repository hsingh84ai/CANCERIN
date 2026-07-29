// Tests *structured* column-order hypotheses against the two known training
// molecules in test.smi (NSC 17 = background row 0, NSC 185 = row 1).
//
// Hypothesis under test: the author wrote the 108 selected columns grouped by
// fingerprint block, but emitted the blocks in an order other than PaDEL's.
// That is only 5! = 120 candidates, so it costs nothing to rule in or out.
//
// Run: node tools/block-perm.mjs <padel-output.csv>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WORDS_PER_ROW, N_BITS } from "./scoring.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSV = process.argv[2] || path.join(ROOT, "cancerin_out");

const out = fs.readFileSync(CSV, "utf8").trim().split(/\r?\n/);
const header = out[0].split(",").map((s) => s.replace(/^"|"$/g, ""));
const idx = fs.readFileSync(path.join(ROOT, "imp-no"), "utf8").trim().split(/\r?\n/).map(Number);
const ann = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "annotations.json"), "utf8"));
const bg = new Uint32Array(fs.readFileSync(path.join(ROOT, "data", "background-raw.bin")).buffer);

const bitsOf = (r) =>
  Array.from({ length: N_BITS }, (_, b) => (bg[r * WORDS_PER_ROW + (b >>> 5)] >>> (b & 31)) & 1);

// ---- the molecules we can check against ------------------------------------
const mols = [];
for (let r = 1; r < out.length; r++) {
  const cells = out[r].split(",").map((s) => s.replace(/^"|"$/g, ""));
  const row = ann.ncititles.indexOf(cells[0]);
  if (row < 0) continue;
  const vals = new Map(idx.map((z) => [z, cells[z] === "" || cells[z] == null ? 0 : Number(cells[z])]));
  mols.push({ name: cells[0], row, vals, want: bitsOf(row) });
}
console.log(`checking against ${mols.length} known molecules: ${mols.map((m) => `NSC ${m.name}=row ${m.row}`).join(", ")}\n`);

// ---- group the selected columns into blocks --------------------------------
const prefixOf = (c) => {
  const m = header[c].match(/^([A-Za-z]+?)\d+$/);
  return m ? m[1] : header[c];
};
const blocks = new Map();
for (const c of idx) {
  const p = prefixOf(c);
  if (!blocks.has(p)) blocks.set(p, []);
  blocks.get(p).push(c);
}
const names = [...blocks.keys()];
for (const [p, cols] of blocks) console.log(`  block ${p.padEnd(10)} ${String(cols.length).padStart(3)} columns`);
console.log(`\n${names.length} blocks -> ${factorial(names.length)} orderings x within-block asc/desc\n`);

function factorial(n) { return n <= 1 ? 1 : n * factorial(n - 1); }
function* permutations(a) {
  if (a.length <= 1) { yield a; return; }
  for (let i = 0; i < a.length; i++)
    for (const rest of permutations([...a.slice(0, i), ...a.slice(i + 1)])) yield [a[i], ...rest];
}

// ---- score every candidate ordering ----------------------------------------
// A candidate is a list of 108 PaDEL column indices; position b in that list is
// claimed to be background bit b.
const score = (order) =>
  mols.map((m) => order.reduce((n, c, b) => n + (m.vals.get(c) === m.want[b] ? 1 : 0), 0));

const results = [];
for (const order of permutations(names)) {
  for (const dir of ["asc", "desc"]) {
    for (const rev of [false, true]) {
      let cols = order.flatMap((p) => {
        const s = [...blocks.get(p)].sort((x, y) => x - y);
        return dir === "desc" ? s.reverse() : s;
      });
      if (rev) cols = cols.reverse();
      const s = score(cols);
      results.push({ label: `${order.join(">")} ${dir}${rev ? " reversed" : ""}`, s, total: s.reduce((a, b) => a + b, 0) });
    }
  }
}
results.sort((a, b) => b.total - a.total);

console.log("top candidate orderings (bits matching, per molecule)");
for (const r of results.slice(0, 10)) console.log(`  ${String(r.total).padStart(4)}  ${r.s.map((x) => `${x}/${N_BITS}`).join("  ")}   ${r.label}`);

const perfect = results.filter((r) => r.s.every((x) => x === N_BITS));
console.log(perfect.length ? `\nPERFECT: ${perfect.length} ordering(s) reproduce every molecule exactly` : `\nNo block ordering reproduces both molecules. Best total ${results[0].total}/${mols.length * N_BITS}.`);
