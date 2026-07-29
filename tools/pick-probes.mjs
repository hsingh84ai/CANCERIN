// Chooses which training actives to fetch structures for.
//
// With M molecules, each of the 108 background columns carries an M-bit
// signature. The permutation is only solvable where signatures are UNIQUE, so
// pick rows that split the columns apart as fast as possible. The background
// matrix already tells us every active's bits, so this is a free, offline
// optimisation -- it decides the fetch list before a single request is made.
//
// Run: node tools/pick-probes.mjs [count]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WORDS_PER_ROW, N_BITS } from "./scoring.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = Number(process.argv[2] || 60);

const ann = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "annotations.json"), "utf8"));
const bg = new Uint32Array(fs.readFileSync(path.join(ROOT, "data", "background-raw.bin")).buffer);
const nActives = ann.ncititles.length;

const bit = (r, b) => (bg[r * WORDS_PER_ROW + (b >>> 5)] >>> (b & 31)) & 1;

// Greedy: add the row that maximises the number of distinct column signatures.
// Rows 0 and 1 (NSC 17, NSC 185) are always held out for final verification,
// so they are deliberately NOT used to solve the assignment.
const HELD_OUT = new Set([0, 1]);
const sig = new Array(N_BITS).fill("");
const chosen = [];
let saturatedAt = 0;

const distinct = (s) => new Set(s).size;
const largestClass = (s) => {
  const m = new Map();
  for (const x of s) m.set(x, (m.get(x) || 0) + 1);
  return Math.max(...m.values());
};

// Candidate pool: sample across the whole active range for structural variety.
const pool = [];
for (let r = 0; r < nActives; r++) if (!HELD_OUT.has(r)) pool.push(r);

while (chosen.length < TARGET) {
  let best = null;
  for (const r of pool) {
    if (chosen.includes(r)) continue;
    const s = sig.map((v, b) => v + bit(r, b));
    const d = distinct(s);
    const l = largestClass(s);
    // maximise distinct signatures, break ties by shrinking the worst class
    if (!best || d > best.d || (d === best.d && l < best.l)) best = { r, d, l, s };
  }
  if (!best) break;
  chosen.push(best.r);
  for (let b = 0; b < N_BITS; b++) sig[b] = best.s[b];
  if (best.d === N_BITS && !saturatedAt) saturatedAt = chosen.length;
  console.log(`  +row ${String(best.r).padStart(5)}  distinct signatures ${String(best.d).padStart(3)}/${N_BITS}  largest ambiguous class ${best.l}`);
  if (saturatedAt) break;
}

// Past saturation the greedy has nothing left to maximise, but redundancy is
// what lets us detect a probe whose modern PubChem structure disagrees with the
// 2014 one. Top up with rows spread across the active range.
if (saturatedAt) {
  const step = Math.max(1, Math.floor(nActives / (TARGET - chosen.length + 1)));
  for (let r = 2; r < nActives && chosen.length < TARGET; r += step)
    if (!chosen.includes(r) && !HELD_OUT.has(r)) chosen.push(r);
  console.log(`  saturated at ${saturatedAt} probes; topped up to ${chosen.length} for redundancy`);
}

console.log(`\n${chosen.length} probe rows resolve ${distinct(sig)}/${N_BITS} columns uniquely (largest tie ${largestClass(sig)}).`);

// Emit the fetch list: NSC id + PubChem SID + background row.
const probes = chosen.map((r) => ({ row: r, nsc: ann.ncititles[r], sid: ann.nsc2sid[ann.ncititles[r]] }));
const missing = probes.filter((p) => !p.sid);
if (missing.length) console.log(`WARNING: ${missing.length} probes have no SID`);

const outFile = path.join(ROOT, "data", "probes.json");
fs.writeFileSync(outFile, JSON.stringify({ probes, heldOut: [...HELD_OUT] }, null, 2));
console.log(`-> ${path.relative(ROOT, outFile)} (${probes.length} probes, held out rows ${[...HELD_OUT].join(", ")})`);
