// Reports how well a PaDEL output file reproduces the stored background rows.
// Usage: node tools/score-scan.mjs <padel-output.csv>
import fs from "node:fs";

const out = fs.readFileSync(process.argv[2], "utf8").trim().split(/\r?\n/);
const idx = fs.readFileSync("imp-no", "utf8").trim().split(/\r?\n/).map(Number);
const ann = JSON.parse(fs.readFileSync("data/annotations.json", "utf8"));
const bg = new Uint32Array(fs.readFileSync("data/background.bin").buffer);
const bitsOf = (r) => Array.from({ length: 108 }, (_, b) => (bg[r * 4 + (b >>> 5)] >>> (b & 31)) & 1);

const parts = [];
for (let r = 1; r < out.length; r++) {
  const cells = out[r].split(",").map((s) => s.replace(/^"|"$/g, ""));
  const row = ann.ncititles.indexOf(cells[0]);
  if (row < 0) continue;
  const want = bitsOf(row);
  let ok = 0;
  for (let b = 0; b < 108; b++) {
    const c = cells[idx[b]];
    if (((c === "" || c == null) ? 0 : Number(c)) === want[b]) ok++;
  }
  parts.push(`${cells[0]}: ${ok}/108`);
}
console.log(parts.join("   "));
