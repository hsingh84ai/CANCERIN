// Fetches structures for the probe molecules chosen by pick-probes.mjs.
//
// Read-only PubChem PUG-REST. Only the numeric SIDs already stored in ids.cpk
// are sent. Two hops, batched: SID -> CID, then CID -> SMILES.
//
// Run: node tools/fetch-smiles.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "https://pubchem.ncbi.nlm.nih.gov/rest/pug";
const CHUNK = 50; // PUG-REST handles comma lists comfortably at this size

const { probes, heldOut } = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "probes.json"), "utf8"));
const ann = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "annotations.json"), "utf8"));

// Verification molecules must go through the same pipeline as the probes.
const all = [...probes, ...heldOut.map((row) => ({ row, nsc: ann.ncititles[row], sid: ann.nsc2sid[ann.ncititles[row]] }))];

const chunks = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url) {
  const res = await fetch(url, { headers: { "User-Agent": "CANCERIN-port/1.0 (research; column-order recovery)" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

// ---- hop 1: SID -> CID ------------------------------------------------------
const sid2cid = new Map();
for (const c of chunks(all.filter((p) => p.sid), CHUNK)) {
  const url = `${BASE}/substance/sid/${c.map((p) => p.sid).join(",")}/cids/JSON`;
  process.stdout.write(`  SID->CID  ${c.length} ids ... `);
  const j = await getJSON(url);
  for (const info of j.InformationList?.Information || []) {
    const cid = (info.CID || []).find((x) => x > 0);
    if (cid) sid2cid.set(String(info.SID), cid);
  }
  console.log(`${sid2cid.size} mapped`);
  await sleep(250);
}

// ---- hop 2: CID -> SMILES ---------------------------------------------------
// PubChem renamed CanonicalSMILES; try the modern name first, fall back.
const cids = [...new Set(sid2cid.values())];
const cid2smiles = new Map();
for (const prop of ["SMILES", "CanonicalSMILES", "ConnectivitySMILES"]) {
  cid2smiles.clear();
  try {
    for (const c of chunks(cids, CHUNK)) {
      const j = await getJSON(`${BASE}/compound/cid/${c.join(",")}/property/${prop}/JSON`);
      for (const p of j.PropertyTable?.Properties || []) {
        const s = p[prop] ?? p.SMILES ?? p.CanonicalSMILES ?? p.ConnectivitySMILES;
        if (s) cid2smiles.set(String(p.CID), s);
      }
      await sleep(250);
    }
    if (cid2smiles.size) { console.log(`  CID->SMILES via property "${prop}": ${cid2smiles.size}/${cids.length}`); break; }
  } catch (e) {
    console.log(`  property "${prop}" rejected (${e.message.split(" for ")[0]}), trying next`);
  }
}

// ---- write a .smi PaDEL can read -------------------------------------------
const rows = [];
const failed = [];
for (const p of all) {
  const cid = sid2cid.get(String(p.sid));
  const smi = cid && cid2smiles.get(String(cid));
  if (smi) rows.push({ ...p, cid, smiles: smi });
  else failed.push(p);
}

fs.writeFileSync(path.join(ROOT, "data", "probes.smi"), rows.map((r) => `${r.smiles}\t${r.nsc}`).join("\n") + "\n");
fs.writeFileSync(path.join(ROOT, "data", "probes-resolved.json"), JSON.stringify(rows, null, 2));

console.log(`\nresolved ${rows.length}/${all.length} structures -> data/probes.smi`);
if (failed.length) console.log(`unresolved: ${failed.map((p) => `NSC ${p.nsc} (row ${p.row})`).join(", ")}`);
for (const h of heldOut) {
  const r = rows.find((x) => x.row === h);
  console.log(`  held-out row ${h}: NSC ${ann.ncititles[h]} ${r ? `-> ${r.smiles}` : "UNRESOLVED"}`);
}
