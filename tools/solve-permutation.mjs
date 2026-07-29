// Recovers the column order used to write `cancerin-fingerprint`.
//
// Each of the 108 columns carries an M-bit signature across the probe
// molecules. If the stored matrix really is a permutation of the imp-no
// columns, the two sides' signature multisets are identical and the columns
// match one-to-one. Solved by exact signature match, with a Hungarian
// fallback so a probe whose modern structure drifted cannot silently break it.
//
// Held-out molecules (NSC 17, NSC 185) take no part in solving -- they are the
// test. Success is 108/108 on both.
//
// Run: node tools/solve-permutation.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WORDS_PER_ROW, N_BITS } from "./scoring.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ann = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "annotations.json"), "utf8"));
const bg = new Uint32Array(fs.readFileSync(path.join(ROOT, "data", "background-raw.bin")).buffer);
const resolved = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "probes-resolved.json"), "utf8"));
const { heldOut } = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "probes.json"), "utf8"));
const idx = fs.readFileSync(path.join(ROOT, "imp-no"), "utf8").trim().split(/\r?\n/).map(Number);

const csv = fs.readFileSync(path.join(ROOT, "data", "probes_out.csv"), "utf8").trim().split(/\r?\n/);
const header = csv[0].split(",").map((s) => s.replace(/^"|"$/g, ""));
const padel = new Map();
for (let r = 1; r < csv.length; r++) {
  const cells = csv[r].split(",").map((s) => s.replace(/^"|"$/g, ""));
  padel.set(cells[0], idx.map((z) => (cells[z] === "" || cells[z] == null ? 0 : Number(cells[z]))));
}

const bgBit = (row, b) => (bg[row * WORDS_PER_ROW + (b >>> 5)] >>> (b & 31)) & 1;

const held = new Set(heldOut);
let solveSet = resolved.filter((p) => !held.has(p.row) && padel.has(p.nsc));
const testSet = resolved.filter((p) => held.has(p.row) && padel.has(p.nsc));
console.log(`solving with ${solveSet.length} probes; holding out ${testSet.map((p) => `NSC ${p.nsc} (row ${p.row})`).join(", ")}\n`);

// A probe whose modern PubChem record differs from the 2014 structure poisons
// every column at once. Drop such probes and re-solve until the survivors are
// mutually consistent; the permutation must not move while we do it.
let prevPerm = null;
for (let pass = 1; ; pass++) {
  const p1 = solve(solveSet).perm;
  const perMol = solveSet.map((p) => {
    const v = padel.get(p.nsc);
    let bad = 0;
    for (let b = 0; b < N_BITS; b++) if (v[p1[b]] !== bgBit(p.row, b)) bad++;
    return { p, bad };
  });
  const dirty = perMol.filter((x) => x.bad);
  const key = p1.join(",");
  console.log(`pass ${pass}: ${solveSet.length} probes, ${dirty.length} inconsistent` +
    (prevPerm ? `, permutation ${key === prevPerm ? "UNCHANGED" : "CHANGED"}` : ""));
  if (dirty.length) console.log(`   dropping: ${dirty.map((x) => `NSC ${x.p.nsc}(${x.bad} bits)`).join(", ")}`);
  prevPerm = key;
  if (!dirty.length || solveSet.length - dirty.length < 12) { solveSet = perMol.filter((x) => !x.bad).map((x) => x.p); break; }
  solveSet = perMol.filter((x) => !x.bad).map((x) => x.p);
}
console.log(`\nre-solving on ${solveSet.length} mutually consistent probes\n`);

// ---- signatures + assignment ------------------------------------------------
// padelSig[j] = bits of imp-no column j across the given molecules
// bgSig[b]    = bits of background column b across the same molecules' rows
// cost[b][j]  = how many molecules disagree if background bit b is imp-no slot j
// A true permutation has a zero-cost matching.
function solve(set) {
  const padelSig = Array.from({ length: N_BITS }, (_, j) => set.map((p) => padel.get(p.nsc)[j]).join(""));
  const bgSig = Array.from({ length: N_BITS }, (_, b) => set.map((p) => bgBit(p.row, b)).join(""));
  const cost = Array.from({ length: N_BITS }, (_, b) =>
    Array.from({ length: N_BITS }, (_, j) => {
      let d = 0;
      for (let m = 0; m < set.length; m++) if (bgSig[b][m] !== padelSig[j][m]) d++;
      return d;
    })
  );
  const perm = hungarian(cost);
  return { perm, cost, padelSig, bgSig };
}

const { perm, cost, padelSig, bgSig } = solve(solveSet);

const uniq = (a) => new Set(a).size;
console.log(`distinct signatures: PaDEL side ${uniq(padelSig)}/${N_BITS}, background side ${uniq(bgSig)}/${N_BITS}`);

const multiset = (a) => JSON.stringify([...a].sort());
const identical = multiset(padelSig) === multiset(bgSig);
console.log(`signature multisets ${identical ? "MATCH — the permutation hypothesis holds" : "DIFFER — not a pure permutation"}\n`);

const residual = perm.reduce((s, j, b) => s + cost[b][j], 0);
console.log(`assignment residual: ${residual} disagreements over ${N_BITS * solveSet.length} cells`);
if (residual) {
  const bad = perm.map((j, b) => ({ b, j, c: cost[b][j] })).filter((x) => x.c).sort((a, b) => b.c - a.c);
  for (const x of bad.slice(0, 10)) console.log(`    bg bit ${String(x.b).padStart(3)} <- imp-no slot ${String(x.j).padStart(3)} (col ${idx[x.j]} ${header[idx[x.j]]}) : ${x.c} probe(s) disagree`);
}

// ---- the payoff: held-out verification --------------------------------------
console.log("\nHELD-OUT VERIFICATION (these molecules were not used to solve)");
let allPerfect = testSet.length > 0;
for (const p of testSet) {
  const v = padel.get(p.nsc);
  let ok = 0;
  for (let b = 0; b < N_BITS; b++) if (v[perm[b]] === bgBit(p.row, b)) ok++;
  const perfect = ok === N_BITS;
  if (!perfect) allPerfect = false;
  console.log(`  NSC ${p.nsc.padEnd(8)} background row ${String(p.row).padEnd(5)} ${ok}/${N_BITS} bits  ${perfect ? "EXACT" : "mismatch"}`);
}

// Also re-check every solve molecule end to end.
let solveOk = 0;
for (const p of solveSet) {
  const v = padel.get(p.nsc);
  let ok = 0;
  for (let b = 0; b < N_BITS; b++) if (v[perm[b]] === bgBit(p.row, b)) ok++;
  if (ok === N_BITS) solveOk++;
}
console.log(`  training probes reproduced exactly: ${solveOk}/${solveSet.length}`);

if (allPerfect && identical) {
  const outFile = path.join(ROOT, "data", "column-order.json");
  fs.writeFileSync(outFile, JSON.stringify({
    note: "background bit b is imp-no column impNo[order[b]]; i.e. PaDEL column impNo[order[b]]",
    nBits: N_BITS,
    order: perm,
    padelColumns: perm.map((j) => idx[j]),
    padelNames: perm.map((j) => header[idx[j]]),
    solvedWith: solveSet.map((p) => p.nsc),
    verifiedOn: testSet.map((p) => p.nsc),
  }, null, 2));
  console.log(`\nSOLVED -> ${path.relative(ROOT, outFile)}`);
} else {
  console.log("\nNot solved cleanly — do not write column-order.json.");
}

// ---- O(n^3) Hungarian -------------------------------------------------------
function hungarian(c) {
  const n = c.length;
  const u = new Array(n + 1).fill(0), v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0), way = new Array(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(Infinity);
    const used = new Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity, j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = c[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; }
        else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const res = new Array(n);
  for (let j = 1; j <= n; j++) if (p[j]) res[p[j] - 1] = j - 1;
  return res;
}
