// Runs the BUILT worker bundle (dist/assets/predictor.worker-*.js) under Node
// with browser shims, against a live preview server.
//
// This exercises what actually ships: asset fetching with byte progress, the
// UMD engine load via importScripts, warm-up, scoring, progress messages and
// the ETA. Only DOM rendering is out of scope.
//
// Usage:
//   npm run build && npx vite preview --port 4173 &
//   node scripts/verify-worker.mjs [http://localhost:4173/]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..");
const BASE = process.argv[2] || "http://localhost:4173/";

const assets = path.join(APP, "dist", "assets");
const workerFile = fs.readdirSync(assets).find((f) => /^predictor\.worker-.*\.js$/.test(f));
if (!workerFile) {
  console.error("no built worker found in dist/assets — run `npm run build` first");
  process.exit(1);
}
console.log(`worker bundle: ${workerFile}`);

// ---- browser shims ----------------------------------------------------------
const blobs = new Map();
let blobSeq = 0;

class FakeBlob {
  constructor(parts) { this.parts = parts; }
}

const FakeURL = class extends URL {};
FakeURL.createObjectURL = (blob) => {
  const url = `blob:fake/${++blobSeq}`;
  blobs.set(url, blob);
  return url;
};
FakeURL.revokeObjectURL = (url) => blobs.delete(url);

const messages = [];
let onMessageHandler = null;

const self = {
  postMessage: (m) => { messages.push(m); onMessage(m); },
  set onmessage(fn) { onMessageHandler = fn; },
  get onmessage() { return onMessageHandler; },
  importScripts: (url) => {
    const blob = blobs.get(url);
    if (!blob) throw new Error(`importScripts: unknown url ${url}`);
    const src = new TextDecoder().decode(new Uint8Array(blob.parts[0]));
    // UMD: with exports/define undefined it attaches to `self`.
    new Function("self", "exports", "define", "module", src)(self, undefined, undefined, undefined);
  },
  location: { href: BASE },
};

// ---- observe progress -------------------------------------------------------
let ready = null, done = null, failed = null;
const progress = [];
const loading = [];

function onMessage(m) {
  if (m.type === "loading") loading.push(m);
  else if (m.type === "status") console.log(`  status: ${m.detail}`);
  else if (m.type === "ready") ready(m);
  else if (m.type === "progress") progress.push(m);
  else if (m.type === "done") done(m);
  else if (m.type === "error") failed(new Error(m.message));
}

// ---- load the worker --------------------------------------------------------
const src = fs.readFileSync(path.join(assets, workerFile), "utf8");
new Function("self", "Blob", "URL", src)(self, FakeBlob, FakeURL);

const send = (msg) => self.onmessage({ data: msg });

console.log(`\ninit from ${BASE}`);
const readyMsg = await new Promise((res, rej) => {
  ready = res; failed = rej;
  send({ type: "init", baseUrl: BASE });
});
console.log(`  ready: ${readyMsg.background.toLocaleString()} background rows, ${readyMsg.actives.toLocaleString()} actives`);

const maxLoaded = loading.at(-1);
console.log(`  loading events: ${loading.length}, final ${(maxLoaded.loaded / 1024).toFixed(0)} KB of ${(maxLoaded.total / 1024).toFixed(0)} KB`);

// ---- run --------------------------------------------------------------------
// A .smi path as the second argument runs a longer batch, which is the only
// way to see the ETA actually settle.
const smiPath = process.argv[3];
const items = smiPath
  ? fs.readFileSync(smiPath, "utf8").trim().split(/\r?\n/).map((l, i) => {
      const [smiles, id] = l.trim().split(/[\s,\t]+/);
      return { id: id || String(i + 1), smiles };
    })
  : [
      { id: "17", smiles: "c1(ccc(cc1CCCCCCCCCCCCCCC)O)N" },
      { id: "185", smiles: "O=C1[C@H](C[C@@H](C[C@H]1[C@H](O)CC1CC(=O)NC(=O)C1)C)C" },
      { id: "aspirin", smiles: "CC(=O)Oc1ccccc1C(=O)O" },
      { id: "caffeine", smiles: "Cn1cnc2c1c(=O)n(C)c(=O)n2C" },
      { id: "bogus", smiles: "not-a-smiles" },
    ];

console.log(`\nrun ${items.length} molecules (legacy mode)`);
const result = await new Promise((res, rej) => {
  done = res; failed = rej;
  send({ type: "run", items, mode: "legacy" });
});

// ---- report -----------------------------------------------------------------
console.log(`\nprogress events: ${progress.length}`);
for (const p of progress) {
  const eta = p.etaMs == null ? "—" : `${(p.etaMs / 1000).toFixed(1)}s`;
  const per = p.perItemMs == null ? "—" : `${p.perItemMs.toFixed(0)}ms`;
  console.log(`  ${p.done}/${p.total}  elapsed ${(p.elapsedMs / 1000).toFixed(1)}s  eta ${eta}  per-item ${per}`);
}

console.log(`\nresults (${result.elapsedMs.toFixed(0)} ms total):`);
for (const r of result.rows) {
  console.log(r.ok
    ? `  ${String(r.id).padEnd(9)} match NSC ${String(r.matchNscId).padEnd(7)} TC ${r.maxTanimoto}  potency ${Number(r.potencyScore).toFixed(4)}`
    : `  ${String(r.id).padEnd(9)} FAILED: ${r.error}`);
}

// ---- assertions -------------------------------------------------------------
const problems = [];
const byId = Object.fromEntries(result.rows.map((r) => [r.id, r]));
if (byId["17"] && (byId["17"].matchNscId !== "17" || byId["17"].maxTanimoto !== 1)) problems.push("NSC 17 should self-match at TC 1.0");
if (byId["185"] && (byId["185"].matchNscId !== "185" || byId["185"].maxTanimoto !== 1)) problems.push("NSC 185 should self-match at TC 1.0");
if (!smiPath && byId["bogus"]?.ok !== false) problems.push("invalid SMILES should be reported as failed, not crash the run");
if (result.rows.length !== items.length) problems.push(`expected ${items.length} rows, got ${result.rows.length}`);
if (!progress.some((p) => p.etaMs != null)) problems.push("no ETA was ever produced");
const monotonic = progress.every((p, i) => i === 0 || p.done >= progress[i - 1].done);
if (!monotonic) problems.push("progress went backwards");
if (progress.at(-1)?.done !== items.length) problems.push("final progress event did not reach the total");

console.log();
if (problems.length) {
  for (const p of problems) console.log(`FAIL  ${p}`);
  process.exit(1);
}
console.log("All checks passed — worker, engine, progress and ETA behave correctly.");
