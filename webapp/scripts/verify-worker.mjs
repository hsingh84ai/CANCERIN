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

// The worker is inlined into the main bundle by Vite (?worker&inline) as a
// base64 data URL, so there is no standalone worker file to load. Extract it
// back out — this still exercises the exact bytes that ship.
const assets = path.join(APP, "dist", "assets");
const mainFile = fs.readdirSync(assets).find((f) => /^index-.*\.js$/.test(f));
if (!mainFile) {
  console.error("no built bundle found in dist/assets — run `npm run build` first");
  process.exit(1);
}
const bundle = fs.readFileSync(path.join(assets, mainFile), "utf8");
const b64 = bundle.match(/const\s+(\w+)\s*=\s*"([A-Za-z0-9+/=]{5000,})"/);
if (!b64) {
  console.error("could not find the inlined worker payload in " + mainFile);
  process.exit(1);
}
const workerSource = Buffer.from(b64[2], "base64").toString("utf8");
console.log(`worker: extracted from ${mainFile} (${(workerSource.length / 1024).toFixed(1)} KB)`);

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
    // Blob parts may be a string (inline init) or an ArrayBuffer (fetch init).
    const part = blob.parts[0];
    const src = typeof part === "string" ? part : new TextDecoder().decode(new Uint8Array(part));
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
new Function("self", "Blob", "URL", workerSource)(self, FakeBlob, FakeURL);

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
