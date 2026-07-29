// Generates engine/src/main/java/cancerin/Columns.java.
//
// data/background.bin is written in CANONICAL order (ascending imp-no) by
// build-data.mjs, which already undoes the stored feature-importance order.
// So the browser engine wants imp-no ascending -- NOT column-order.json's
// padelColumns, which is the stored order and would re-apply the permutation.
//
// Run: node tools/gen-columns.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cols = fs.readFileSync(path.join(ROOT, "imp-no"), "utf8").trim().split(/\r?\n/).map(Number);
if (cols.length !== 108) throw new Error(`expected 108 columns, got ${cols.length}`);
if (!cols.every((v, i, a) => i === 0 || a[i - 1] < v)) throw new Error("imp-no is not strictly ascending");

const rows = [];
for (let i = 0; i < cols.length; i += 12) rows.push("        " + cols.slice(i, i + 12).join(", "));

const src = `package cancerin;

/**
 * The 108 selected PaDEL columns, ascending -- the CANONICAL order, matching
 * data/background.bin as written by tools/build-data.mjs.
 *
 * Note this is deliberately NOT column-order.json's padelColumns: that is the
 * stored feature-importance order, which build-data.mjs has already undone.
 *
 * GENERATED from imp-no by tools/gen-columns.mjs. Do not edit.
 */
public final class Columns {
    private Columns() {}

    public static final int[] PADEL = {
${rows.join(",\n")}
    };
}
`;

const out = path.join(ROOT, "engine", "src", "main", "java", "cancerin", "Columns.java");
fs.writeFileSync(out, src);
console.log(`wrote ${path.relative(ROOT, out)} with ${cols.length} columns (ascending imp-no)`);
console.log(`first 12: ${cols.slice(0, 12).join(", ")}`);
