// Validates the scoring engine by replaying background rows as queries.
// A row scored against itself must yield Tanimoto 1.0 at its own index.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { score, annotate, WORDS_PER_ROW, PARTITIONS } from "./scoring.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bg = new Uint32Array(fs.readFileSync(path.join(ROOT, "data", "background.bin")).buffer);
const ann = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "annotations.json"), "utf8"));
const rows = ann.backgroundRows;
const row = (r) => bg.subarray(r * WORDS_PER_ROW, (r + 1) * WORDS_PER_ROW);

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
};

console.log(`background: ${rows} rows, ${bg.byteLength / 1024} KB`);
console.log(`actives:    ${ann.nActives}  (ncititles)\n`);

console.log("self-similarity of active rows (corrected mode)");
for (const r of [0, 1, 4000, 8563, 8564]) {
  const s = score(row(r), bg, rows, "corrected");
  check(`row ${r} -> activeRow ${s.activeRow}, maxActiveTC ${s.maxActiveTC}`,
    s.activeRow === r && s.maxActiveTC === 1,
    `got activeRow=${s.activeRow} tc=${s.maxActiveTC}`);
}

console.log("\nself-similarity of inactive rows (corrected mode)");
for (const r of [8565, 12000, 18368]) {
  const s = score(row(r), bg, rows, "corrected");
  check(`row ${r} -> maxInactiveTC ${s.maxInactiveTC}, potency ${s.potencyScore.toFixed(3)}`,
    s.maxInactiveTC === 1 && s.potencyScore <= 0,
    `got maxInactiveTC=${s.maxInactiveTC}`);
}

console.log("\nlegacy off-by-one is observable");
{
  // Row 8564 is the last active. Legacy's [0:8564] / [8565:18368] slices skip
  // it entirely, so its own perfect self-match is invisible in legacy mode.
  const q = row(8564);
  const L = score(q, bg, rows, "legacy");
  const C = score(q, bg, rows, "corrected");
  check(`row 8564 found in corrected (tc=${C.maxActiveTC}, activeRow=${C.activeRow})`,
    C.maxActiveTC === 1 && C.activeRow === 8564);
  check(`row 8564 invisible in legacy (tc=${L.maxActiveTC}, activeRow=${L.activeRow})`,
    L.activeRow !== 8564);
  console.log(`        legacy potency ${L.potencyScore.toFixed(3)} vs corrected ${C.potencyScore.toFixed(3)}`);

  // Row 18368 is the last inactive, dropped by legacy's [8565:18368].
  const q2 = row(18368);
  const L2 = score(q2, bg, rows, "legacy");
  const C2 = score(q2, bg, rows, "corrected");
  check(`row 18368 self-matches in corrected (maxInactiveTC=${C2.maxInactiveTC})`, C2.maxInactiveTC === 1);
  check(`row 18368 missed in legacy (maxInactiveTC=${L2.maxInactiveTC})`, L2.maxInactiveTC < 1);
}

console.log("\nannotation lookup");
{
  const s = score(row(0), bg, rows, "corrected");
  const a = annotate(s, ann);
  check(`row 0 -> NSC ${a.matchNscId}, SID ${a.matchPubchemSid}, logGI50 ${a.meanLogGI50}`,
    a.matchNscId != null && a.matchPubchemSid != null && a.meanLogGI50 != null);
  console.log("       ", JSON.stringify(a));
}

console.log("\nhow often the two modes disagree (200 random queries)");
{
  let diff = 0;
  for (let n = 0; n < 200; n++) {
    const r = (Math.random() * rows) | 0;
    const L = score(row(r), bg, rows, "legacy");
    const C = score(row(r), bg, rows, "corrected");
    if (L.potencyScore !== C.potencyScore || L.activeRow !== C.activeRow) diff++;
  }
  console.log(`        ${diff}/200 queries differ between legacy and corrected`);
}

console.log("\nthroughput");
{
  const t0 = performance.now();
  const N = 200;
  for (let n = 0; n < N; n++) score(row(n), bg, rows, "legacy");
  const ms = (performance.now() - t0) / N;
  console.log(`        ${ms.toFixed(2)} ms per query (${rows} comparisons each)`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
