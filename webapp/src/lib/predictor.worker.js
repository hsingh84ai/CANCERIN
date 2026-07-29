// Runs fingerprinting and scoring off the main thread.
//
// Fingerprinting costs roughly a quarter of a second per molecule, so doing it
// on the main thread would freeze the page and make the progress bar itself
// unpaintable — the one thing it exists to avoid.
//
// Protocol
//   in  { type: "init", baseUrl }
//       { type: "run", items: [{ id, smiles }], mode }
//       { type: "cancel" }
//       { type: "depict", id, smiles }
//   out { type: "loading", loaded, total }      byte progress while fetching
//       { type: "status", detail }              phase label
//       { type: "ready", background, actives }
//       { type: "progress", done, total, elapsedMs, etaMs, perItemMs, rate }
//       { type: "done", rows, elapsedMs, cancelled }
//       { type: "structure", id, structure, error }
//       { type: "error", message }

import { score, annotate, WORDS_PER_ROW } from "./scoring.generated.js";
import { createEta } from "./eta.js";

const PROGRESS_INTERVAL_MS = 80;

let engine = null;
let background = null;
let annotations = null;
let cancelled = false;

/** Fetch reporting bytes as they arrive, so the load bar is real. */
async function fetchWithProgress(url, onChunk) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const length = Number(res.headers.get("content-length")) || 0;
  onChunk(0, length);

  if (!res.body) return { buffer: await res.arrayBuffer(), length };

  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onChunk(value.length, length);
  }
  const buffer = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) { buffer.set(c, offset); offset += c.length; }
  return { buffer: buffer.buffer, length: received };
}

async function init(baseUrl) {
  const url = (p) => new URL(p, baseUrl).href;

  // fetchWithProgress announces each asset's size once (delta 0), then reports
  // chunks. So a zero delta grows the total and a non-zero delta grows loaded.
  let loaded = 0;
  let total = 0;
  const bump = (delta, declared) => {
    if (delta === 0) total += declared || 0;
    else loaded += delta;
    self.postMessage({ type: "loading", loaded, total: Math.max(total, loaded) });
  };

  self.postMessage({ type: "status", detail: "Loading fingerprint engine" });
  const eng = await fetchWithProgress(url("engine/cancerin-engine.js"), bump);

  self.postMessage({ type: "status", detail: "Loading reference compounds" });
  const bg = await fetchWithProgress(url("data/background.bin"), bump);
  const ann = await fetchWithProgress(url("data/annotations.json"), bump);

  // The engine is a UMD bundle; in a classic worker it attaches to self.
  const blob = new Blob([eng.buffer], { type: "text/javascript" });
  self.importScripts(URL.createObjectURL(blob));
  if (typeof self.fingerprint !== "function") throw new Error("engine did not export fingerprint()");
  if (typeof self.main === "function") self.main([]);
  engine = {
    fingerprint: self.fingerprint.bind(self),
    lastError: self.lastError?.bind(self),
    depict: self.depict?.bind(self),
  };

  background = new Uint32Array(bg.buffer);
  annotations = JSON.parse(new TextDecoder().decode(ann.buffer));

  // Warm up. The first call pays TeaVM's one-off class initialisation, which
  // would otherwise land in the first timing sample and inflate the ETA for
  // the whole run.
  self.postMessage({ type: "status", detail: "Warming up" });
  try { engine.fingerprint("CCO"); } catch { /* warm-up failure is not fatal */ }

  self.postMessage({
    type: "ready",
    background: annotations.backgroundRows,
    actives: annotations.ncititles.length,
  });
}

function scoreOne(item, mode) {
  const bits = engine.fingerprint(item.smiles);
  if (!bits) {
    return {
      id: item.id,
      smiles: item.smiles,
      ok: false,
      error: engine.lastError?.() || "could not be processed",
    };
  }
  const query = new Uint32Array(WORDS_PER_ROW);
  for (let b = 0; b < bits.length; b++) {
    if (bits[b] === "1") query[b >>> 5] |= 1 << (b & 31);
  }
  const raw = score(query, background, annotations.backgroundRows, mode);
  return { id: item.id, smiles: item.smiles, ok: true, ...annotate(raw, annotations) };
}

async function run(items, mode) {
  cancelled = false;
  const eta = createEta();
  eta.start();
  const rows = [];
  let lastPost = 0;

  const post = (force) => {
    const now = performance.now();
    if (!force && now - lastPost < PROGRESS_INTERVAL_MS) return;
    lastPost = now;
    self.postMessage({
      type: "progress",
      done: rows.length,
      total: items.length,
      elapsedMs: eta.elapsed(now),
      etaMs: eta.estimate(items.length - rows.length),
      perItemMs: eta.perItem(),
      rate: eta.rate(),
    });
  };

  post(true);
  for (const item of items) {
    if (cancelled) break;
    try {
      rows.push(scoreOne(item, mode));
    } catch (e) {
      rows.push({ id: item.id, smiles: item.smiles, ok: false, error: String(e?.message || e) });
    }
    eta.tick();
    post(false);
    // Yield so a cancel message can be delivered and progress can be painted.
    await new Promise((r) => setTimeout(r, 0));
  }
  post(true);
  self.postMessage({ type: "done", rows, elapsedMs: eta.elapsed(), cancelled });
}

/** 2D coordinates for one molecule, computed on demand when a row is opened. */
function depict(id, smiles) {
  if (!engine?.depict) {
    self.postMessage({ type: "structure", id, structure: null, error: "engine has no depict()" });
    return;
  }
  try {
    const json = engine.depict(smiles);
    self.postMessage(json
      ? { type: "structure", id, structure: JSON.parse(json) }
      : { type: "structure", id, structure: null, error: engine.lastError?.() || "could not lay out structure" });
  } catch (e) {
    self.postMessage({ type: "structure", id, structure: null, error: String(e?.message || e) });
  }
}

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === "init") await init(msg.baseUrl);
    else if (msg.type === "run") await run(msg.items, msg.mode);
    else if (msg.type === "cancel") cancelled = true;
    else if (msg.type === "depict") depict(msg.id, msg.smiles);
  } catch (err) {
    self.postMessage({ type: "error", message: String(err?.message || err) });
  }
};
