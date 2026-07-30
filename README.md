# CANCERIN

Anticancer potency prediction by molecular similarity, running **entirely in the browser** — no server, no Python, no Java runtime, no third-party CDN.

A query molecule is fingerprinted, compared against a reference set of 18,369 compounds (8,565 actives and 9,804 inactives screened against the NCI-60 panel), and scored by how much more it resembles the actives than the inactives.

This is a port of the original Python 2.7 + Java CLI tool published with the paper below. It reproduces the original's numbers exactly — see [Fidelity](#fidelity).

---

## What you need

| If you want to… | You need | Size |
|---|---|---|
| **Just run it** | `cancerin.html` — one file, opens from disk | 1.4 MB |
| **Host it** | `webapp/dist/` — a static folder | 1.4 MB |
| **Build the app** | Node 18+ | — |
| **Rebuild the fingerprint engine** | JDK 17+, Maven and `lib/` | 19 MB |

Most people only need the first row. **`lib/` is not needed to run or even to build
the app** — the compiled engine is committed at `engine/prebuilt/`. The jars matter
only if you want to change or re-derive the fingerprint engine itself.

## Quick start

```bash
cd webapp
npm install
npm run dev            # http://localhost:5173
```

To produce the static site, or a single self-contained file:

```bash
npm run build              # -> webapp/dist            a static folder
npm run build:standalone   # -> dist-standalone/cancerin.html
```

`cancerin.html` is the whole application in one file — styles, code, the Web
Worker, the fingerprint engine and all 18,369 reference compounds inlined.
Double-click it. No server, no install, no network, not even sibling files.
Verified by opening it over `file://` and asserting it makes zero external
requests (`npm run verify:standalone`).

`webapp/dist` is self-contained: static files only, no server-side anything.
Serve it from any host, or open it from disk.

Building from a clean clone needs nothing but Node — reference data is rebuilt by
`tools/build-data.mjs`, and the engine comes from `engine/prebuilt/`.

---

## Using it

- Paste SMILES, one per line, with an optional id after a space, tab or comma. Lines starting with `#` are ignored.
- Or upload a `.smi` / `.txt` / `.csv` file.
- Long runs show a progress bar with counts, throughput and estimated time remaining, and can be cancelled.
- Click any result row to see the molecule's 2D structure.
- Each result is labelled **active** or **inactive** using the published potency-score threshold of 0.02.
- Results export as CSV in the original tool's column format, with `Prediction` appended as a seventh column — the original six keep their exact names, order and positions.
- A collapsible **How the method works** section explains fingerprint selection and the potency score, with the original flow diagrams.

### Fidelity modes

| Mode | Behaviour |
|---|---|
| **Legacy** (default) | Reproduces the original script exactly, including an off-by-one that drops the last active and last inactive compound |
| **Corrected** | Uses the full reference set |

The original sliced `arr[0:8564]` and `arr[8565:18368]` where it meant `arr[0:8565]`. The difference is usually invisible — 0 of 200 random queries changed — but is dramatic for molecules near the dropped rows. Both modes ship so results can be compared against historical output.

### Interpreting the score

`Potency score = max similarity to any active − max similarity to any inactive`, ranging from −1 to +1. The original work found **0.02** to be the threshold giving the best classification performance, and the app labels each result active or inactive on that basis. The raw score is always shown alongside, since the verdict is only a threshold applied to it — `CANCERIN.py` itself reports the score and never classifies.

⚠️ The method takes `max(TC1, TC0)`, where TC0 measures agreement on *absent* features. For sparse fingerprints TC0 dominates, so the reported "maximum Tanimoto" (often ~0.83 even for unrelated molecules) is usually TC0, not conventional similarity. That is inherent to the published method, not an artefact of the port.

---

## How it works

```
SMILES ──► fingerprint engine ──► 108 bits ──► Tanimoto vs 18,369 rows ──► potency score
           (CDK 1.4.6, compiled                (packed bitset, 287 KB)
            to JavaScript by TeaVM)
```

The fingerprint engine is CDK 1.4.6 plus PaDEL's Pubchem fingerprinter — the *same* Java code the original used — ahead-of-time compiled to JavaScript with [TeaVM](https://teavm.org/). It is not a reimplementation, which is why it can match the original bit for bit.

Of the 14,532 fingerprint columns PaDEL can produce, the model uses 108, selected in the original work by MCC ranking: 48 ExtFP, 29 FP, 20 GraphFP, 10 PubchemFP, 1 MACCSFP.

Scoring is plain typed-array work — 0.2 ms per query against all 18,369 reference compounds. Fingerprint generation dominates, at roughly 8 molecules/sec, and runs in a Web Worker so the interface stays responsive.

Structure drawings come from CDK's own 2D layout engine, so the picture is generated from the same parse of the same SMILES that was scored.

---

## Fidelity

The engine is checked against **PaDEL's own output**, molecule by molecule and bit by bit:

| Check | Result |
|---|---|
| Java engine vs PaDEL, 41 molecules × 108 columns | **41/41 exact**, 0 wrong bits |
| Browser (TeaVM) engine vs PaDEL | **41/41 exact** |
| Scoring engine self-test | 13/13 |
| `test.smi` end to end | NSC 17 and NSC 185 self-match at Tanimoto 1.0 |

Failure behaviour matches too: a molecule CDK 1.4.6 cannot type — a selenium compound, for instance — is reported as unprocessable, exactly as PaDEL leaves an empty row.

```bash
node tools/selftest.mjs           # scoring engine
node tools/verify-js-engine.mjs   # browser engine vs PaDEL (needs the engine built)
cd webapp
npm run verify:worker             # built worker under Node, against a live server
npm run verify:browser            # real Chromium: progress, ETA, depiction
npm run verify:standalone         # the single file, opened over file://
```

### A bug in the original distribution

The published `cancerin-fingerprint` matrix stores its 108 columns in **feature-importance order**, while `imp-no` lists the same indices **sorted ascending** — which is how the CLI extracts them. The two never lined up, so the original tool could not recognise its own training compounds, reporting NSC 65381 and NSC 168597 instead of exact self-matches.

This port recovers the true column order (`data/column-order.json`) and rewrites the matrix into canonical order, so the app never sees the permutation. The recovered order matches the paper's published MCC ranking with Spearman ρ = 1.000.

`HANDOFF.md` documents how this was found and proven.

---

## Repository layout

| Path | What it is |
|---|---|
| `webapp/` | the Svelte 5 app |
| `engine/` | Java fingerprint engine, compiled to JavaScript by TeaVM |
| `tools/` | data pipeline and verification scripts (Node, no dependencies) |
| `data/` | generated assets, plus the recovered `column-order.json` |
| `engine/prebuilt/` | the compiled engine, committed so the app builds with Node alone |
| `lib/`, `PaDEL-Descriptor.jar`, `descriptors.xml` | CDK 1.4.6 and PaDEL. **Only needed to rebuild the engine or regenerate ground truth** — not to run or build the app |
| `cancerin-fingerprint`, `ids.cpk`, `imp-no`, `test.smi` | original reference data; **cannot be regenerated** |
| `HANDOFF.md` | detailed engineering notes and rationale |

---

## Rebuilding from source

Only needed if you are changing the fingerprint engine. Requires JDK 17+, Maven
and Node 18+; everything else builds with Node alone.

```bash
# 1. reference data  ->  data/background.bin + data/annotations.json
node tools/build-data.mjs

# 2. install the bundled jars into the local Maven repo (once)
for a in "cdk:1.4.6:lib/cdk-1.4.6.jar" "libpadel-descriptor:1.0:lib/libPaDEL-Descriptor.jar" \
         "vecmath:1.14:lib/vecmath1.2-1.14.jar" "jgrapht:0.6.0:lib/jgrapht-0.6.0.jar" "xom:1.1:lib/xom-1.1.jar"; do
  IFS=: read -r id ver jar <<<"$a"
  mvn install:install-file -Dfile="$jar" -DgroupId=local.cancerin -DartifactId="$id" -Dversion="$ver" -Dpackaging=jar
done

# 3. patch CDK for TeaVM, then compile the engine to JavaScript
tools/build-cdk-teavm.sh
cd engine && mvn -Ppatched,web package

# 4. refresh the committed engine, then build the app
cp engine/target/js/cancerin-engine.js engine/prebuilt/cancerin-engine.js
md5sum engine/target/js/cancerin-engine.js | cut -d' ' -f1 > engine/prebuilt/cancerin-engine.js.md5
cd webapp && npm install && npm run build
```

`sync-assets.mjs` prefers a freshly built engine and falls back to `engine/prebuilt/`,
warning if a local build has drifted from the committed copy.

CDK loads its reference data through reflection and SAX XML parsing, neither of which TeaVM can compile. `tools/build-cdk-teavm.sh` replaces that layer with generated lookup tables — produced by running the real CDK and round-trip verifying every entry — and redirects CDK's fingerprint hashing to a specification-exact `java.util.Random`, because TeaVM's is not bit-compatible with the JDK's. `HANDOFF.md` explains each patch and why it is safe.

---

## Scope

Potency-score method only. The published hybrid model additionally uses an SVM whose trained model file is not present in any available distribution, so it is out of scope.

---

## Licence

Original CANCERIN code and data: see `GNU_LICENSE`. Bundled third-party libraries (CDK, PaDEL-Descriptor and their dependencies) retain their own licences under `license/`.

## Reference

Singh, H., Kumar, R., Singh, S., Chaudhary, K., Gautam, A., & Raghava, G. P. S. (2016). *Prediction of anticancer molecules using hybrid model developed on molecules screened against NCI-60 cancer cell lines.* BMC Cancer, 16(1), 1–11. https://doi.org/10.1186/s12885-016-2082-y
