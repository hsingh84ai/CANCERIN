// Converts the legacy CANCERIN data files into browser-ready assets.
//
//   cancerin-fingerprint  ->  data/background.bin   (packed bitset, 18369 x 108)
//   ids.cpk               ->  data/annotations.json (NSC ids, SIDs, GI50, pbackground)
//
// Run: node tools/build-data.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data");
const FP_SRC = path.join(ROOT, "cancerin-fingerprint");
const CPK_SRC = path.join(ROOT, "ids.cpk");

export const N_BITS = 108;
export const WORDS_PER_ROW = Math.ceil(N_BITS / 32); // 4

// ---------------------------------------------------------------- unpickler
// Minimal protocol-0 (ASCII) pickle reader. ids.cpk only uses dicts, lists,
// strings and floats, so this covers it without needing Python.
function unpickle(text) {
  let i = 0;
  const stack = [];
  const memo = new Map();
  const marks = [];

  const readLine = () => {
    const nl = text.indexOf("\n", i);
    const s = text.slice(i, nl);
    i = nl + 1;
    return s;
  };

  // S'...'  — repr-quoted string
  const readString = () => {
    const raw = readLine().trim();
    const q = raw[0];
    if (q !== "'" && q !== '"') throw new Error(`bad string: ${raw}`);
    let out = "";
    for (let k = 1; k < raw.length - 1; k++) {
      if (raw[k] === "\\") {
        const n = raw[++k];
        out += n === "n" ? "\n" : n === "t" ? "\t" : n;
      } else out += raw[k];
    }
    return out;
  };

  loop: while (i < text.length) {
    const op = text[i++];
    switch (op) {
      case "(": marks.push(stack.length); break;
      case "d": { // dict from mark
        const at = marks.pop();
        const items = stack.splice(at);
        const d = new Map();
        for (let k = 0; k < items.length; k += 2) d.set(items[k], items[k + 1]);
        stack.push(d);
        break;
      }
      case "l": { // list from mark
        const at = marks.pop();
        stack.push(stack.splice(at));
        break;
      }
      case "S": stack.push(readString()); break;
      case "F": stack.push(parseFloat(readLine())); break;
      case "I": { const v = readLine(); stack.push(v === "01" ? true : v === "00" ? false : parseInt(v, 10)); break; }
      case "N": stack.push(null); break;
      case "p": memo.set(readLine().trim(), stack[stack.length - 1]); break;
      case "g": stack.push(memo.get(readLine().trim())); break;
      case "s": { const v = stack.pop(), k = stack.pop(); stack[stack.length - 1].set(k, v); break; }
      case "a": { const v = stack.pop(); stack[stack.length - 1].push(v); break; }
      case "t": { const at = marks.pop(); stack.push(stack.splice(at)); break; }
      case ".": break loop;
      case "\n": case "\r": break;
      default: throw new Error(`unhandled pickle opcode ${JSON.stringify(op)} at ${i - 1}`);
    }
  }
  return stack.pop();
}

// ------------------------------------------------------------------ packing
// `cancerin-fingerprint` stores its 108 columns in feature-importance order,
// not in the ascending imp-no order the extraction step uses. `inv` maps
// canonical slot -> stored column, undoing that so the app never sees it.
// See data/column-order.json and tools/solve-permutation.mjs.
function packBackground(txt, inv) {
  const lines = txt.split("\n").filter((l) => l.length > 0);
  const rows = lines.length;
  const words = new Uint32Array(rows * WORDS_PER_ROW);

  lines.forEach((line, r) => {
    const cells = line.split(",");
    if (cells.length !== N_BITS) {
      throw new Error(`row ${r}: expected ${N_BITS} columns, got ${cells.length}`);
    }
    const base = r * WORDS_PER_ROW;
    for (let b = 0; b < N_BITS; b++) {
      const c = cells[inv ? inv[b] : b];
      if (c !== "0" && c !== "1") throw new Error(`row ${r} col ${b}: non-binary ${JSON.stringify(c)}`);
      if (c === "1") words[base + (b >>> 5)] |= 1 << (b & 31);
    }
  });

  return { rows, words };
}

// order[storedBit] = canonical slot  ->  inv[canonicalSlot] = storedBit
function loadColumnOrder() {
  const f = path.join(OUT, "column-order.json");
  if (!fs.existsSync(f)) return null;
  const { order } = JSON.parse(fs.readFileSync(f, "utf8"));
  const inv = new Array(N_BITS);
  order.forEach((slot, storedBit) => { inv[slot] = storedBit; });
  if (inv.some((x) => x == null)) throw new Error("column-order.json is not a permutation");
  return inv;
}

// --------------------------------------------------------------------- main
function main() {
  fs.mkdirSync(OUT, { recursive: true });

  console.log("reading", path.relative(ROOT, FP_SRC));
  const src = fs.readFileSync(FP_SRC, "latin1");

  // Raw (as-stored) copy: the permutation solver needs the original order.
  const raw = packBackground(src, null);
  fs.writeFileSync(path.join(OUT, "background-raw.bin"), Buffer.from(raw.words.buffer));

  const inv = loadColumnOrder();
  const { rows, words } = inv ? packBackground(src, inv) : raw;
  fs.writeFileSync(path.join(OUT, "background.bin"), Buffer.from(words.buffer));
  console.log(`  ${rows} rows x ${N_BITS} bits -> background.bin (${(words.byteLength / 1024).toFixed(1)} KB)` +
    (inv ? "  [canonical imp-no order]" : "  [RAW importance order — column-order.json not found]"));

  console.log("reading", path.relative(ROOT, CPK_SRC));
  const cpk = unpickle(fs.readFileSync(CPK_SRC, "latin1"));
  const ncititles = cpk.get("ncititles");
  const nsc2sid = cpk.get("nsc2sid");
  const GI50 = cpk.get("GI50");
  const pbackground = cpk.get("pbackground");

  const annotations = {
    nBits: N_BITS,
    backgroundRows: rows,
    nActives: ncititles.length,
    ncititles,
    nsc2sid: Object.fromEntries(nsc2sid),
    GI50: Object.fromEntries(GI50),
    pbackground,
  };
  fs.writeFileSync(path.join(OUT, "annotations.json"), JSON.stringify(annotations));
  const sz = fs.statSync(path.join(OUT, "annotations.json")).size;
  console.log(`  ncititles=${ncititles.length} nsc2sid=${nsc2sid.size} GI50=${GI50.size} pbackground=${pbackground.length}`);
  console.log(`  -> annotations.json (${(sz / 1024).toFixed(1)} KB)`);

  // consistency checks against what the legacy script assumes
  const problems = [];
  if (ncititles.length !== 8565) problems.push(`expected 8565 actives, got ${ncititles.length}`);
  if (rows !== 18369) problems.push(`expected 18369 background rows, got ${rows}`);
  for (const nsc of ncititles) {
    if (!nsc2sid.has(nsc)) problems.push(`nsc2sid missing ${nsc}`);
    if (!GI50.has(nsc)) problems.push(`GI50 missing ${nsc}`);
    if (problems.length > 5) break;
  }
  console.log(problems.length ? `WARN:\n  ${problems.join("\n  ")}` : "  all consistency checks passed");
}

main();
