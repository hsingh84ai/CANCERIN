// Exhaustive search over fingerprinter subsets.
//
// imp-no's column indices only mean something relative to which fingerprinters
// were enabled when the background was built. If a different subset was active,
// every block offset shifts. PaDEL emits blocks in a fixed order, so we can
// enumerate all 2^10 subsets, recompute the layout each time, re-map the 108
// indices onto the bits we already computed, and see which subset (if any)
// reproduces the stored background rows.
import fs from "node:fs";

const ORDER = [
  ["FP", 1024], ["ExtFP", 1024], ["EStateFP", 79], ["GraphFP", 1024],
  ["MACCSFP", 166], ["PubchemFP", 881], ["SubFP", 307], ["KRFP", 4860],
  ["SubFPC", 307], ["KRFPC", 4860],
];

const out = fs.readFileSync("cancerin_out", "utf8").trim().split(/\r?\n/);
const header = out[0].split(",").map((s) => s.replace(/^"|"$/g, ""));
const idx = fs.readFileSync("imp-no", "utf8").trim().split(/\r?\n/).map(Number);
const ann = JSON.parse(fs.readFileSync("data/annotations.json", "utf8"));
const bg = new Uint32Array(fs.readFileSync("data/background.bin").buffer);
const bitsOf = (r) => Array.from({ length: 108 }, (_, b) => (bg[r * 4 + (b >>> 5)] >>> (b & 31)) & 1);

// name -> value, for every fingerprint bit of both test molecules
const mols = [];
for (let r = 1; r < out.length; r++) {
  const cells = out[r].split(",").map((s) => s.replace(/^"|"$/g, ""));
  const row = ann.ncititles.indexOf(cells[0]);
  if (row < 0) continue;
  const byName = new Map();
  for (let c = 1; c < header.length; c++) byName.set(header[c], cells[c] === "" ? 0 : Number(cells[c]));
  mols.push({ name: cells[0], byName, want: bitsOf(row) });
}

const results = [];
for (let mask = 1; mask < (1 << ORDER.length); mask++) {
  // layout for this subset
  const blocks = [];
  let col = 1;
  for (let k = 0; k < ORDER.length; k++) {
    if (!(mask & (1 << k))) continue;
    const [pre, n] = ORDER[k];
    blocks.push({ pre, start: col, end: col + n - 1 });
    col += n;
  }
  if (Math.max(...idx) > col - 1) continue; // indices would fall off the end

  let total = 0, matched = 0, ok = true;
  for (const m of mols) {
    for (let b = 0; b < 108 && ok; b++) {
      const z = idx[b];
      const blk = blocks.find((x) => z >= x.start && z <= x.end);
      if (!blk) { ok = false; break; }
      const v = m.byName.get(`${blk.pre}${z - blk.start + 1}`);
      if (v === undefined) { ok = false; break; }
      total++;
      if (v === m.want[b]) matched++;
    }
  }
  if (ok && total) {
    results.push({
      subset: blocks.map((b) => b.pre).join("+"),
      pct: (matched / total) * 100,
      matched, total,
    });
  }
}

results.sort((a, b) => b.pct - a.pct);
console.log(`evaluated ${results.length} viable fingerprinter subsets\n`);
console.log("best 12 by agreement with the stored background:");
for (const r of results.slice(0, 12)) {
  console.log(`  ${r.pct.toFixed(1).padStart(5)}%  ${r.matched}/${r.total}   ${r.subset}`);
}
const full = results.find((r) => r.subset.startsWith("FP+ExtFP+EStateFP+GraphFP+MACCSFP+PubchemFP+SubFP+KRFP"));
if (full) console.log(`\n  (shipped descriptors.xml config: ${full.pct.toFixed(1)}%)`);
console.log(`\n  random-chance baseline is ~50%; a correct layout would be ~100%.`);
