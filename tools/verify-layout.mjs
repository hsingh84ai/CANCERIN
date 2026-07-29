// Verifies (a) the PaDEL column layout assumed by imp-no, and (b) that the
// fingerprints PaDEL computes for test.smi reproduce the stored background rows.
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
const bg = new Uint32Array(fs.readFileSync(path.join(ROOT, "data", "background.bin")).buffer);

// ---- (a) real column layout -------------------------------------------------
console.log(`cancerin_out: ${out.length - 1} molecules, ${header.length} columns`);
console.log(`col 0 = ${JSON.stringify(header[0])}\n`);

const blocks = [];
for (let c = 1; c < header.length; c++) {
  const m = header[c].match(/^([A-Za-z]+?)(\d+)$/);
  const pre = m ? m[1] : header[c];
  const last = blocks[blocks.length - 1];
  if (!last || last.prefix !== pre) blocks.push({ prefix: pre, start: c, end: c });
  else last.end = c;
}
console.log("actual block layout");
for (const b of blocks) {
  const hit = idx.filter((i) => i >= b.start && i <= b.end);
  console.log(`  ${b.prefix.padEnd(10)} cols ${String(b.start).padStart(5)}-${String(b.end).padEnd(5)} (${b.end - b.start + 1})  selected: ${hit.length}`);
}

// ---- (b) do PaDEL's bits reproduce the stored background rows? ---------------
const rowOf = (r) => bg.subarray(r * WORDS_PER_ROW, (r + 1) * WORDS_PER_ROW);
const bitsOf = (words) => Array.from({ length: N_BITS }, (_, b) => (words[b >>> 5] >>> (b & 31)) & 1);

console.log("\nfingerprint reproduction (test.smi vs stored background)");
let allMatch = true;
for (let r = 1; r < out.length; r++) {
  const cells = out[r].split(",").map((s) => s.replace(/^"|"$/g, ""));
  const name = cells[0];
  const bgRow = ann.ncititles.indexOf(name);
  if (bgRow < 0) { console.log(`  ${name}: not in ncititles, skipping`); continue; }

  const got = idx.map((z) => (cells[z] === "" || cells[z] == null ? 0 : Number(cells[z])));
  const want = bitsOf(rowOf(bgRow));
  const diffs = [];
  for (let b = 0; b < N_BITS; b++) if (got[b] !== want[b]) diffs.push({ b, col: idx[b], name: header[idx[b]], got: got[b], want: want[b] });

  if (diffs.length === 0) {
    console.log(`  ${name}: EXACT MATCH to background row ${bgRow} (108/108 bits)`);
  } else {
    allMatch = false;
    console.log(`  ${name}: ${N_BITS - diffs.length}/${N_BITS} bits match background row ${bgRow} — ${diffs.length} differ`);
    for (const d of diffs.slice(0, 12)) console.log(`      bit ${String(d.b).padStart(3)} col ${String(d.col).padStart(5)} ${String(d.name).padEnd(12)} got ${d.got} want ${d.want}`);
    if (diffs.length > 12) console.log(`      ... and ${diffs.length - 12} more`);
  }
}
console.log(allMatch ? "\nLayout and fingerprint generation both confirmed." : "\nMismatch — see above.");
