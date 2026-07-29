// Extracts Table S2 ("individual performance of best 126 selected fingerprints")
// from the paper's supplementary .doc (OLE2, 8-bit text) and cross-checks the
// paper's fingerprint list against imp-no and the recovered column order.
//
// Usage: node tools/parse-supplementary.mjs <path-to-.doc>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOC = process.argv[2];

// PaDEL block layout, verified against the real CSV header (col 0 = Name).
const BLOCKS = [
  ["FP", 1, 1024], ["ExtFP", 1025, 2048], ["EStateFP", 2049, 2127],
  ["GraphFP", 2128, 3151], ["MACCSFP", 3152, 3317], ["PubchemFP", 3318, 4198],
  ["SubFP", 4199, 4505], ["KRFP", 4506, 9365], ["SubFPC", 9366, 9672],
  ["KRFPC", 9673, 14532],
];
// The paper numbers PubChem bits with the CACTVS 0-based convention, while
// PaDEL names them PubchemFP1..881. Every other block agrees, so PubChem alone
// needs a +1 correction to land on the right PaDEL column.
const colOf = (name) => {
  const m = name.match(/^([A-Za-z]+?)(\d+)$/);
  const b = BLOCKS.find((x) => x[0] === m[1]);
  if (!b) return null;
  return b[1] + Number(m[2]) - 1 + (m[1] === "PubchemFP" ? 1 : 0);
};

const raw = fs.readFileSync(DOC, "latin1");
// Word cell/row marks are \x07; keep them as separators, drop other control bytes.
const text = raw.replace(/[\x00-\x06\x08-\x0c\x0e-\x1f]/g, " ");

// Identifiers, longest prefix first so "FP" doesn't swallow "PubchemFP".
const RE = /(PubchemFP|EStateFP|MACCSFP|GraphFP|SubFPC|KRFPC|ExtFP|SubFP|KRFP|FP)(\d+)/g;
const seen = [];
const seenSet = new Set();
for (const m of text.matchAll(RE)) {
  const id = m[1] + m[2];
  if (seenSet.has(id)) continue;      // table may repeat headers
  seenSet.add(id);
  seen.push({ id, block: m[1], bit: Number(m[2]), col: colOf(id), at: m.index });
}

console.log(`extracted ${seen.length} distinct fingerprint identifiers from ${path.basename(DOC)}\n`);

const byBlock = {};
for (const s of seen) byBlock[s.block] = (byBlock[s.block] || 0) + 1;
console.log("by block (paper's selected set):");
for (const [b] of BLOCKS) if (byBlock[b]) console.log(`  ${b.padEnd(10)} ${String(byBlock[b]).padStart(3)}`);

// ---- cross-check against imp-no ---------------------------------------------
const impno = fs.readFileSync(path.join(ROOT, "imp-no"), "utf8").trim().split(/\r?\n/).map(Number);
const impSet = new Set(impno);
const paperCols = seen.filter((s) => s.col != null);
const inImp = paperCols.filter((s) => impSet.has(s.col));
const notInImp = paperCols.filter((s) => !impSet.has(s.col));
const impNotInPaper = impno.filter((c) => !paperCols.some((s) => s.col === c));

console.log(`\ncross-check vs imp-no (${impno.length} indices):`);
console.log(`  paper identifiers that map to an imp-no column : ${inImp.length}`);
console.log(`  paper identifiers NOT in imp-no                : ${notInImp.length}`);
console.log(`  imp-no columns NOT named in the paper          : ${impNotInPaper.length}`);
if (notInImp.length) {
  console.log(`  -> dropped from the standalone: ${notInImp.slice(0, 30).map((s) => `${s.id}(col ${s.col})`).join(", ")}${notInImp.length > 30 ? " ..." : ""}`);
  const db = {};
  for (const s of notInImp) db[s.block] = (db[s.block] || 0) + 1;
  console.log(`  -> by block: ${JSON.stringify(db)}`);
}

// ---- does the paper's order match the recovered column order? ---------------
const ORDER_PATH = path.join(ROOT, "data", "column-order.json");
if (fs.existsSync(ORDER_PATH) && inImp.length) {
  // column-order.json: stored background bit b holds PaDEL column impno[order[b]]
  const { order } = JSON.parse(fs.readFileSync(ORDER_PATH, "utf8"));
  const paperRank = new Map();
  paperCols.forEach((s, i) => { if (impSet.has(s.col) && !paperRank.has(s.col)) paperRank.set(s.col, i); });

  const pairs = [];
  order.forEach((oi, b) => {
    const c = impno[oi];
    if (paperRank.has(c)) pairs.push([b, paperRank.get(c)]);
  });
  const n = pairs.length;
  const rankOf = (a) => { const s = [...a].sort((x, y) => x - y); return a.map((v) => s.indexOf(v)); };
  const X = rankOf(pairs.map((p) => p[0])), Y = rankOf(pairs.map((p) => p[1]));
  const d2 = X.reduce((a, x, i) => a + (x - Y[i]) ** 2, 0);
  const rho = 1 - (6 * d2) / (n * (n * n - 1));

  console.log(`\nrecovered stored order vs paper's MCC ranking:`);
  console.log(`  Spearman rho = ${rho.toFixed(3)} over ${n} columns`);
  console.log(rho === 1
    ? `  EXACT — the background is stored in the paper's published MCC rank order.`
    : `  not exact; inspect pairs`);
  const idOf = (c) => (paperCols.find((q) => q.col === c) || {}).id ?? "?";
  console.log(`\n  most important stored columns:`);
  order.slice(0, 8).forEach((oi, b) => {
    const c = impno[oi];
    console.log(`    bit ${String(b).padStart(3)}  PaDEL col ${String(c).padStart(5)}  ${idOf(c).padEnd(13)} paper rank ${paperRank.get(c) ?? "n/a"}`);
  });
}

fs.writeFileSync(path.join(ROOT, "data", "paper-fingerprints.json"),
  JSON.stringify(seen.map(({ id, block, bit, col }) => ({ id, block, bit, col })), null, 1));
console.log(`\nwrote data/paper-fingerprints.json`);
