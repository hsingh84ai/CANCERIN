# CANCERIN → Svelte 5 web app: session handoff

Context for resuming work in a fresh Claude Code session (WSL).

---

## Goal

Port the legacy Python 2.7 CANCERIN standalone predictor to a **Svelte 5** web app.

**Scope decided by the user:**
- **Potency-score method only.** No SVM, no hybrid score. (The hybrid variant needed an SVM-light model file `model-complete` that was **not present** in any distribution we had, and shelled out to a Linux `svm_classify` binary. Out of scope; that script has since been deleted.)
- **Fidelity: both modes, user-toggleable**, `legacy` as default (see off-by-one below).
- Fingerprint engine: **not yet decided** — deferred until the blocker below is resolved. Leading candidate was TeaVM (AOT-compile CDK's fingerprint classes to WASM/JS for a pure static site); fallback is a thin backend that runs the existing PaDEL jar.

---

## Repo layout

WSL path: `/mnt/c/Users/MyPC/Documents/git/CANCERIN`

| Path | What it is |
|---|---|
| `cancerin-fingerprint` | the background matrix, 18,369 x 108. **Irreplaceable** — md5 `9534adb3dd9e88010f11d75c3e76293a` |
| `PaDEL-Descriptor.jar`, `lib/`, `descriptors.xml` | PaDEL 2011/CDK 1.4.6 fingerprint generator |
| `ids.cpk` | protocol-0 pickle: `ncititles`, `nsc2sid`, `GI50`, `pbackground` |
| `imp-no` | the 108 selected column indices, ascending |
| `test.smi` | 2 molecules: NSC 17 and NSC 185 |
| `data/` | **generated** — `background.bin`, `annotations.json` |
| `tools/` | **written this session** — see below |

`ids.cpk`, `imp-no`, `descriptors.xml` are byte-identical across all three copies.

⚠️ `.gitignore` used to contain a bare `lib/` (from a Python template), silently excluding the CDK and PaDEL jars. Fixed — `lib/` is now tracked and is **required** to build the engine. Do not reintroduce that rule.

---

## What was built and verified

All in `tools/`, plain Node ESM, no dependencies:

- **`build-data.mjs`** — protocol-0 unpickler (no Python needed) + bitset packer.
  `cancerin-fingerprint` 3.97 MB text → `data/background.bin` **287 KB**; `ids.cpk` → `data/annotations.json` 385 KB.
- **`scoring.mjs`** — TC1/TC0 Tanimoto + potency scoring, both fidelity modes. Both coefficients derive from the same two popcounts.
- **`selftest.mjs`** — **13/13 passing.** Replays background rows as queries; self-similarity must be exactly 1.0 at the row's own index.
- **`verify-layout.mjs`** — checks PaDEL column layout and fingerprint reproduction. Takes an optional CSV path argument.
- **`search-layout.mjs`** — exhaustive search over all 2^10 fingerprinter subsets.
- **`score-scan.mjs`**, **`scan-padel-options.ps1`** — PaDEL option sweep (PowerShell; rewrite for bash in WSL).
- **`block-perm.mjs`** — tests block-order column hypotheses. Ruled out; kept as a record.
- **`pick-probes.mjs`** — picks which actives to fetch, by maximising column-signature separation offline.
- **`fetch-smiles.mjs`** — read-only PubChem PUG-REST fetch (SID → CID → SMILES).
- **`solve-permutation.mjs`** — Hungarian assignment + outlier dropping; writes `data/column-order.json`.
- **`cancerin_py3.py`** — faithful Python 3 port of the legacy script (Python 2 is unavailable and uninstallable on Ubuntu 24.04). Reproduces the original's broken output, and with `--fix-column-order` matches `scoring.mjs` exactly. Run it from a directory containing the data files and the jar.

Re-verify with:
```bash
node tools/build-data.mjs && node tools/selftest.mjs
```

**Measured:** 0.34 ms per query against all 18,369 background compounds. The matching stage is effectively free; SMILES parsing will dominate.

---

## Verified facts (do not re-derive)

**Background matrix** — 18,369 rows × 108 binary columns, no header.
- rows `0..8564` = **8,565 actives**, indexed by `ncititles`
- rows `8565..18368` = **9,804 inactives**, anonymous (no IDs anywhere)
- 8565 + 9804 = 18369 ✓

**Legacy off-by-one.** `CANCERIN.py` slices `arr[0:8564]` and `arr[8565:18368]`, dropping the last active (row 8564) and last inactive (row 18368). Author meant `arr[0:8565]`. Impact is small (0/200 random queries differed) but dramatic near the dropped rows. `PARTITIONS` in `scoring.mjs` implements both.

**Not a bug:** the string comparison at `CANCERIN.py:184`. Lexicographic ordering of fixed-format decimals (`"0.667"`, `"1.0"`) agrees with numeric ordering.

**`ids.cpk` counts:** `ncititles` 8565, `nsc2sid` 8565, `GI50` 8565, `pbackground` 1001.
(Beware: grepping `^aS'` undercounts by one — the first list element has no APPEND opcode.)

**PaDEL column layout** — verified against the real header. 14,533 columns including `Name` at 0:

| block | cols | selected by imp-no |
|---|---|---|
| FP | 1–1024 | 29 |
| ExtFP | 1025–2048 | 48 |
| EStateFP | 2049–2127 | 0 |
| GraphFP | 2128–3151 | 20 |
| MACCSFP | 3152–3317 | 1 |
| PubchemFP | 3318–4198 | 10 |
| SubFP | 4199–4505 | 0 |
| KRFP | 4506–9365 | 0 |
| SubFPC | 9366–9672 | 0 |
| KRFPC | 9673–14532 | 0 |

Note the tail order: **KRFP precedes SubFPC**.

**PaDEL output format:** only `Name` is quoted; bit cells are bare `0`/`1`.

**`test.smi` molecules are training-set actives:** NSC 17 = background row 0, NSC 185 = background row 1 (cycloheximide). They should self-match at TC 1.0.

**Method quirk:** the score takes `max(TC1, TC0)`. TC0 measures agreement on *absent* features and dominates for sparse vectors, so reported "maximum Tanimoto" values (~0.83) are usually TC0, not conventional similarity. Inherent to the published method.

**Running PaDEL:**
```bash
java -Xmx1024M -jar PaDEL-Descriptor.jar -fingerprints \
  -descriptortypes descriptors.xml -dir test.smi -file cancerin_out
```
Works fine on Java 21 (~1.5 s for 2 molecules). Needs `lib/` beside the jar.

---

## ✅ RESOLVED — the column permutation (2026-07-28)

**`cancerin-fingerprint` stores its 108 columns in feature-importance order, not in ascending `imp-no` order.** `imp-no` holds the same 108 indices *sorted ascending*, which is how the CLI extracts them — so the two never lined up. That single mismatch is the whole bug: the legacy tool could not recognise its own training compounds, reporting NSC 65381 / NSC 168597 instead of self-matches.

**First confirmation of the "importance order" reading** (superseded in strength by the paper cross-check below, but derived from the repo alone): ranking the 108 stored columns by information gain w.r.t. the active/inactive split reproduces the stored order closely — stored columns 0–9 are IG ranks 0–9, Spearman ρ = **0.973**, stored column 0 has the maximum IG (0.1494) and column 107 near the minimum (0.0359). Hence the filename: `imp-no` = "important numbers". IG is only a proxy; the paper shows the real criterion is **MCC**, which gives ρ = 1.000.

### How it was solved

`tools/pick-probes.mjs` → `tools/fetch-smiles.mjs` → PaDEL → `tools/solve-permutation.mjs`.

With M probe molecules each column carries an M-bit signature, so columns match one-to-one. Probe selection was optimised offline against the background matrix itself: a greedy row picker separated all 108 columns with just **10** molecules (near-perfect doubling: 2→4→8→16→32→60→82→97→106→108). 40 were fetched anyway for redundancy.

- 41/42 SIDs resolved via PubChem PUG-REST (NSC 624657 has no CID).
- 17 of 39 probes disagreed on a few bits — modern PubChem records that have drifted from the 2014 structures (two badly: NSC 666302 by 38 bits, NSC 686554 by 36). Dropping them left 22 mutually consistent probes.
- **The recovered permutation was identical before and after dropping the outliers** — the drifted structures never influenced it.
- Final solve: signature multisets match, all 108 signatures distinct, Hungarian assignment residual **0** over 2,376 cells.

**Verification — held-out molecules took no part in the solve:**

| check | result |
|---|---|
| NSC 17 vs background row 0 | **108/108 EXACT** |
| NSC 185 vs background row 1 | **108/108 EXACT** |
| 22 training probes, end to end | 22/22 exact |
| `test.smi` end-to-end score, both modes | self-match, TC **1.0** |

### Cross-check against the original Python (2026-07-28)

**Python 2 cannot be run here** — Ubuntu 24.04 dropped the `python2` package entirely (`apt-cache policy python2` shows no candidate), and the script needs `cPickle`, `print` statements and py2 `round()`. So `tools/cancerin_py3.py` is a faithful mechanical port that preserves the quirks: the `arr[0:8564]` / `arr[8565:18368]` off-by-one, the string comparison for the best match, `.index()` on the unsorted list, and **Python 2 `round()` semantics (half away from zero, not py3 banker's rounding)**. Deviations are inert: numpy dropped (`np.where(a==1)[0]` is just "indices where the value is 1"), `cPickle` → `pickle(encoding="latin1")`, and the background is parsed once instead of re-split inside the inner loop (pure speed — 2.3 s instead of minutes).

It reads the original `cancerin-fingerprint` **text file** directly, so it shares no code and no data artifact with the Node engine.

```bash
python3 tools/cancerin_py3.py test.smi out.csv                                  # original behaviour
python3 tools/cancerin_py3.py test.smi out.csv --fix-column-order=data/column-order.json
```

Run as the original does (ascending `imp-no`), it reproduces the documented failure **exactly**:

```
"17",65381,110751,-4.799,-0.016000000000000014,0.83
"185",168597,441682,-7.493,0.0,0.838
```

Change *only* the column order and it returns the self-matches — and agrees with `scoring.mjs` **bit-for-bit, float noise included**:

| | Python 3 port | Node `scoring.mjs` |
|---|---|---|
| NSC 17 | `17,66970,-4.994,0.06499999999999995,1.0` | `17,66970,-4.994,0.06499999999999995,1` |
| NSC 185 | `185,67121,-7.277,0.07399999999999995,1.0` | `185,67121,-7.277,0.07399999999999995,1` |

This is the strongest end-to-end evidence in the repo: two independent implementations, different languages, different data paths, identical output — and it pins the bug to the column order alone, since nothing else was touched between the two runs.

### Independent confirmation from the published paper (2026-07-28)

The paper's supplementary file (Additional file 1, Table S2 — "individual performance of best 126 selected fingerprints") was parsed with `tools/parse-supplementary.mjs`. It confirms the solve from a source that played no part in it:

- **Spearman ρ = 1.000 over all 108 columns.** The background is stored in *exactly* the paper's published MCC rank order. This is not a statistical near-match; it is the identical ordering.
- All **108** `imp-no` columns appear in the paper's 126, with **0** unaccounted for. The standalone dropped 18: 4 FP, 5 GraphFP, 4 MACCSFP, 4 PubchemFP, 1 KRFP.
- Skips in the rank mapping (stored 8→paper 9, 12→14, …) fall exactly where the dropped features sit, order otherwise preserved.

⚠️ **The paper numbers PubChem bits 0-based (CACTVS convention); PaDEL names them `PubchemFP1..881`.** Every other block agrees. Reading Table S2 without this correction gives 99/126 instead of 108/126.

Paper cross-refs: 8,565 actives / 9,804 inactives, feature pool of 9,365 (= columns 1–9365, all binary blocks, count blocks excluded), and `Ps = max(HaTs1,HaTs0) − max(HnTs1,HnTs0)` — all match this repo exactly.

### The 108 features, by block — what the fingerprint engine must implement

| block | count | CDK class |
|---|---|---|
| ExtFP | 48 | `ExtendedFingerprinter` (hashed paths + ring bits) |
| FP | 29 | `Fingerprinter` (hashed paths) |
| GraphFP | 20 | `GraphOnlyFingerprinter` (hashed paths, bond orders ignored) |
| PubchemFP | 10 | `PubchemFingerprinter` (CACTVS 881 rules) |
| MACCSFP | 1 | `MACCSFingerprinter` |

**No EState, no SubFP, no KRFP, and neither count block are needed** — a large saving, since KRFP alone is 4,860 SMARTS. But **97 of 108 are hashed path fingerprints**, which depend on CDK 1.4.6's aromaticity perception; that is what makes a hand-port risky and favours compiling CDK itself.

### What changed in the data pipeline

`data/column-order.json` records the mapping. `build-data.mjs` now emits **two** files:

- `data/background.bin` — **canonical ascending `imp-no` order** (applies `column-order.json`). Everything downstream uses this; the app never sees the permutation.
- `data/background-raw.bin` — as-stored importance order, used only by `pick-probes.mjs` / `solve-permutation.mjs` / `block-perm.mjs` so the solve stays reproducible.

⚠️ `data/` is untracked. `data/column-order.json` is the one derived artifact that is **expensive to regenerate** (needs network + a PaDEL run) — worth committing.

**Ruled out along the way** (don't repeat):
- row ordering — no background row matches anywhere (best 92/108, TC1 0.20)
- column offsets −3…+3 — all noise (74–85)
- PaDEL standardisation flags (`-removesalt`, `-detectaromaticity`, `-convert3d`) — byte-identical output
- all 770 viable fingerprinter subsets — best 81.9%, shipped config 69.9%
- simple orderings — file order 76/74, lexicographic asc/desc 78/76, numeric desc & reversed 80/82
- **block-order permutations** (`tools/block-perm.mjs`, all 5! × asc/desc × reversed) — best 82/108, chance level. A random permutation scores ~75/108 by construction, since 79 of the 108 columns are 0 in both test molecules.

Note for anyone re-reading the old analysis: the "six-for-six permutation-invariant statistics" argument was really **three** independent numbers (|NSC 17| = 20, |NSC 185| = 20, overlap = 11) — the 79/9/9/11 contingency table is fully determined by those. The conclusion was right, the evidence was weaker than stated.

---

## Environment notes (WSL)

- **Java:** OpenJDK **21.0.11 is installed in WSL** and on PATH. PaDEL runs fine (~1.2 s for 2 molecules, ~2.4 s/mol for 41).
- **Maven:** NOT installed (`winget install Apache.Maven` failed). Needed only if the TeaVM route is chosen.
- **Node:** WSL has **v18.19.1**. `import.meta.dirname` needs ≥20.11, so the tools now use `fileURLToPath(import.meta.url)` instead. Keep it that way unless WSL's Node is upgraded. All `tools/*.mjs` are dependency-free ESM.
- **Network:** the user approved read-only PubChem PUG-REST access on 2026-07-28 for the permutation solve. Treat any *new* outbound access as needing a fresh ask.
- **Python 2:** unavailable and **uninstallable** — Ubuntu 24.04 ships no `python2` package. Not required: `build-data.mjs` replaces the pickle reading, and `tools/cancerin_py3.py` covers the cross-check. Python 3.12.11 + numpy 2.3.3 are present.
- `.gitignore` now covers build output (`engine/target/`, `webapp/dist/`, `webapp/node_modules/`), the assets `sync-assets.mjs` copies, and the regenerable parts of `data/`. `data/column-order.json` and `data/probes*` stay tracked — they needed PubChem access and a PaDEL run to produce.

## The fingerprint engine (`engine/`) — Java reference DONE, browser build in progress

`engine/` is a Maven module holding the fingerprint engine. `mvn compile` builds it; `mvn -Pweb package` is the (not yet working) TeaVM browser build.

The five jars it needs are not on Maven Central and must be installed from `lib/` once:
```bash
cd /mnt/c/Users/MyPC/Documents/git/CANCERIN
for a in "cdk:1.4.6:lib/cdk-1.4.6.jar" "libpadel-descriptor:1.0:lib/libPaDEL-Descriptor.jar" \
         "vecmath:1.14:lib/vecmath1.2-1.14.jar" "jgrapht:0.6.0:lib/jgrapht-0.6.0.jar" "xom:1.1:lib/xom-1.1.jar"; do
  IFS=: read -r id ver jar <<<"$a"
  mvn install:install-file -Dfile="$jar" -DgroupId=local.cancerin -DartifactId="$id" -Dversion="$ver" -Dpackaging=jar
done
```

### ✅ The Java engine reproduces PaDEL exactly

`cancerin.Fingerprint108` — **41/41 molecules exact, 0 wrong bits** out of 4,428, verified by `cancerin.Validate` against PaDEL's own `data/probes_out.csv`:

```bash
cd engine && mvn -q exec:java -Dexec.mainClass=cancerin.Validate -Dexec.args=".."
```

**PaDEL's real pipeline**, recovered by disassembling `libpadeldescriptor.libPaDELDescriptorWorker`:

```
SmilesParser.parseSmiles (setPreservingAromaticity)
  -> AtomContainerManipulator.percieveAtomTypesAndConfigureAtoms
  -> CDKHydrogenAdder.addImplicitHydrogens
  -> [convertImplicitToExplicitHydrogens]              if addHydrogens
  -> [CDKHueckelAromaticityDetector.detectAromaticity] if detectAromaticity
```

**The switch settings were established by sweeping all 8×8 combinations against PaDEL's output, not guessed:**

| block | preserveAromaticity | detectAromaticity | addHydrogens |
|---|---|---|---|
| FP / ExtFP / GraphFP / MACCSFP | **false** | false | **false** |
| PubchemFP | **true** | false | false |

⚠️ **The molecule is prepared differently per block** — PubchemFP parses with `preserveAromaticity=true`, the path blocks with `false`. Using one setting for everything gives 16/41 (29 wrong bits, all in PaDEL columns 3507/3514 = Pubchem ring bits 189/196). `addHydrogens=true` is catastrophic for the path blocks (425 wrong bits).

**Four of five blocks use CDK's fingerprinters; PubchemFP uses `libpadeldescriptor.PubchemFingerprinter`, which is PaDEL's own reimplementation, not CDK's.** Using CDK's would be wrong.

**Failure semantics match too:** NSC 251219 (`CN1C=NC(=C1N)C(=N)[Se]`) throws `NoSuchAtomTypeException: Se.2` — and PaDEL emitted an entirely empty row (all 14,532 cells) for it. Agreeing that a molecule is unprocessable counts as a match.

`cancerin.Columns.PADEL` is generated by `tools/gen-columns.mjs` from `imp-no` — **ascending order**, matching canonical `background.bin`. Deliberately *not* `column-order.json`'s `padelColumns`, which is the stored order and would re-apply the permutation.

### ✅ The browser engine works — 41/41 exact, fully self-contained

**`tools/verify-js-engine.mjs` reports 41/41 molecules exact against PaDEL's own output**, running the TeaVM-compiled JavaScript in Node. 543 KB minified, no runtime, no network, no Java. CheerpJ was not needed.

```bash
tools/build-cdk-teavm.sh                            # patch CDK once
cd engine && mvn -Ppatched,web package              # -> engine/target/js/cancerin-engine.js
node tools/verify-js-engine.mjs                     # 41/41
```

Full stack confirmed: `test.smi` SMILES -> TeaVM engine -> `scoring.mjs` gives NSC 17 and NSC 185 self-matching at TC 1.0 with potency 0.0650 / 0.0740 — identical to PaDEL and to the Python port.

**Four problems had to be solved. Two were silent.**

**1. Reflection + SAX in CDK's config layer** (loud: compile errors). `AtomTypeFactory` used `ClassLoader.loadClass` to pick a reader that parses XML with SAX. Replaced by `engine/src/patch/java/.../AtomTypeFactory.java`, serving 264 atom types from `GeneratedAtomTypeData`. `LoggingToolFactory` (reflection) became a no-op.

**2. The periodic table** (loud). `new Atom(symbol)` calls `PeriodicTable.getAtomicNumber`, which lazily parses `elementdata.xml` via SAX — so **every atom creation** hit it. Replaced with a generated table of 112 elements.

Both tables are produced by `cancerin.build.GenerateTables`, which runs the **real** CDK on the JVM and **round-trip verifies every entry**, so the tables cannot silently drift. That is why the `stock` Maven profile exists — table generation needs the real XML/SAX CDK.

**3. `MACCSFingerprinter` reads `maccs.txt` via `getResourceAsStream`**, which returns null under TeaVM and NPEs (silent: compiled fine, failed at run time). Not needed at all — `imp-no` selects exactly **one** MACCS column, 3276 = bit 124 = key 125 "Aromatic Ring > 1", which is one of the `?` keys CDK computes in code rather than by SMARTS. `Fingerprint108.maccsBits` implements just that key (AllRingsFinder, count rings whose bonds are all flagged aromatic, set when > 1) and **throws for any other MACCS bit** rather than silently returning 0. So the browser build needs neither `maccs.txt` nor the SMARTS engine.

**4. ⚠️ TeaVM's `java.util.Random` is not bit-compatible with the JDK's** (silent, and the nastiest). CDK maps each path string to a bit with `new Random(path.hashCode()).nextInt(size)`. `String.hashCode` matches TeaVM exactly, but the RNG does not:

| seed | JDK | TeaVM |
|---|---|---|
| 0 | 748 | 312 |
| 1 | 748 | 402 |
| 12345 | 370 | 214 |

This corrupted **FP, ExtFP and GraphFP** while leaving MACCSFP and PubchemFP correct — the giveaway, since only those three use an RNG. It compiled and ran happily, just produced wrong bits.

The RNG call sits inside `Fingerprinter.findPathes`, which is `protected` and returns **already-hashed** positions, so it cannot be intercepted by subclassing, and reimplementing the path enumeration would risk changing fingerprints. Instead `cancerin.build.RemapRandom` uses ASM to rewrite references to `java/util/Random` into `org/openscience/cdk/fingerprint/JdkRandom` (a spec-exact LCG) in the three CDK fingerprint classes that use it — `Fingerprinter`, `GraphOnlyFingerprinter`, `HybridizationFingerprinter`. Signatures mirror `java.util.Random`, so it is a pure owner substitution: the RNG changes and provably nothing else.

**Regression discipline:** after every patch, `mvn -Ppatched exec:java -Dexec.mainClass=cancerin.Validate` must still print 41/41. It did at each step — which is also what proves `JdkRandom` behaves identically to `java.util.Random` on the JVM.

**Performance:** ~237 ms per molecule in Node. Fine for interactive single queries; worth revisiting if bulk upload of hundreds of molecules is wanted (a Web Worker would keep the UI responsive).

`Web.java` also exports diagnostics used to find all this: `lastError()`, `stage(smiles, which)` for per-block isolation, and `rnd`/`strHash` for the RNG comparison. Keep them — they localise any future divergence in minutes.

## Still to build

**The Svelte 5 UI is built** (`webapp/`) — SMILES input/upload, progress + ETA, results table, CSV export, legacy/corrected toggle. See the section after this table for details.

Everything is now solved and verified:

| layer | status |
|---|---|
| background matrix, canonical column order | ✅ verified |
| scoring (`tools/scoring.mjs`), both fidelity modes | ✅ 13/13 |
| fingerprint engine, Java reference | ✅ 41/41 vs PaDEL |
| fingerprint engine, browser JS | ✅ 41/41 vs PaDEL |
| full stack, SMILES → bits → score | ✅ NSC 17 / 185 self-match at TC 1.0 |

The app assembles three artifacts, all of which exist:
`engine/target/js/cancerin-engine.js` (543 KB), `data/background.bin` (287 KB), `data/annotations.json` (385 KB) — about 1.2 MB total, fully static, no backend.

Engine API: `fingerprint(smiles)` returns 108 `"0"`/`"1"` characters in canonical order (directly indexable against `background.bin`), or `null` on failure with the reason in `lastError()`. Returning null for an unprocessable molecule is correct behaviour matching PaDEL — the UI shows it as a per-row error rather than failing the run.

---

## Legacy cleanup (2026-07-29)

The Python 2.7 distributions were deleted after the port was verified; the user held a backup. Repo went from **316 MB to 178 MB**.

Removed: `potency-score/` (exact duplicate), `CANCERIN-standalone/` (duplicate `lib/` plus the out-of-scope hybrid script), root `CANCERIN.py`, and stray run artifacts.

**Kept deliberately, despite looking legacy** — these are live build inputs, not history:

| Kept | Why |
|---|---|
| `lib/` | CDK 1.4.6 + PaDEL jars. `tools/build-cdk-teavm.sh` and the engine build need them; without `lib/` the engine cannot be rebuilt at all |
| `cancerin-fingerprint` | the background matrix. **Cannot be regenerated from anything.** Moved from `CANCERIN-standalone/` to the repo root; `build-data.mjs` updated accordingly, checksum verified before and after |
| `ids.cpk`, `imp-no`, `test.smi` | build inputs; `imp-no` alone has 28 references across `tools/` |
| `PaDEL-Descriptor.jar`, `descriptors.xml` | the oracle that produced `data/probes_out.csv`. Without them the 41/41 correctness claim could never be re-derived — only trusted |

All three copies of `lib/` and of `imp-no`/`ids.cpk`/`descriptors.xml`/`test.smi` were confirmed byte-identical before deleting the duplicates.

The full chain was re-verified after deletion: data pipeline 13/13, patched CDK build, Java engine 41/41, TeaVM engine 41/41, webapp suites.

---

## Who needs what (and why `lib/` is optional)

| Audience | Needs | Size |
|---|---|---|
| run the app | `webapp/dist/` — static files only | 1.4 MB |
| build the app | Node 18+ | — |
| rebuild the engine | JDK 17+, Maven, `lib/` | 19 MB |

`engine/prebuilt/cancerin-engine.js` is the TeaVM-compiled engine, **committed
deliberately**. Without it a fresh clone could not build the app at all, because
`engine/target/` is gitignored and the engine cannot be regenerated without the
whole Java toolchain. With it, `lib/` is needed only to change or re-derive the
fingerprint engine.

`sync-assets.mjs` prefers `engine/target/js/` when a local Java build exists and
falls back to `engine/prebuilt/`, printing which it used. It compares against
`engine/prebuilt/cancerin-engine.js.md5` and warns when a local build has drifted
— i.e. `prebuilt/` needs refreshing before commit.

⚠️ **After any engine change, refresh `engine/prebuilt/` and re-run
`node tools/verify-js-engine.mjs` (expects 41/41) before committing.** A stale
prebuilt engine would silently ship old fingerprints to anyone who builds without
Java — the same class of silent failure as the RNG remap.

Verified by hiding `engine/target/` and the generated data, then building with
Node alone: both the worker and browser suites passed.

`lib/` also carried extracted copies of two jars — `lib/cdk-1.4.6/` (47 MB) and
`lib/libPaDEL-Descriptor/` — that nothing referenced: the PaDEL manifest's
`Class-Path` lists only the `.jar` files. Deleted after confirming PaDEL still
runs, the CDK patch still builds, and both engines still score 41/41. `lib/` went
from 66 MB to **19 MB**.

**Keeping `lib/` is still recommended.** CDK 1.4.6 (2011) and this exact PaDEL
build are not on Maven Central; if they become hard to find, the engine could
never be rebuilt or independently audited, and the committed JavaScript would
become an unverifiable blob. Their licences permit redistribution and `license/`
carries them.

---

## The web app (`webapp/`)

Svelte 5 (runes) + Vite 5. Node 18 constrains the versions: Vite 6+ and Playwright 1.50+ both require Node 20.

```bash
cd webapp
npm install
npm run dev              # sync assets + dev server
npm run build            # -> webapp/dist, fully static
npm run verify:worker    # deterministic, no browser needed
npm run verify:browser   # real Chromium via Playwright
```

`npm run sync` (automatic before dev/build) copies the engine, `background.bin` and `annotations.json` into `public/`, and copies `tools/scoring.mjs` to `src/lib/scoring.generated.js` so the browser and the Node tools can never drift. **Rebuild the engine first** if it has changed — sync copies, it does not build. Everything it generates is gitignored.

### Architecture

Scoring runs in a **Web Worker** (`src/lib/predictor.worker.js`). This is not optional: fingerprinting is ~120 ms per molecule in Chromium, so on the main thread the page would freeze and the progress bar could not paint — the one thing it exists for.

⚠️ The worker is a **classic** worker, not a module worker, because the TeaVM engine is a UMD bundle loaded with `importScripts`. Vite's default worker format (`iife`) gives us that. Switching to `{ type: "module" }` would break the engine load.

The worker fetches the engine as bytes, wraps it in a Blob and `importScripts` that, rather than using a `<script>` tag, so asset URLs stay relative to the app's base and the build works from any path (`base: "./"`).

**Warm-up matters:** the worker fingerprints one throwaway molecule during init. TeaVM's one-off class initialisation is expensive, and without this it lands in the first timing sample and inflates the ETA for the whole run.

### Progress and ETA

Both phases report real progress, never a fake animation:

- **Loading** — genuine byte progress from a streaming `ReadableStream` reader (~1.2 MB across three assets). The bar is indeterminate until `content-length` headers arrive rather than pretending to a percentage it cannot justify.
- **Scoring** — done/total, percent, pending count, elapsed, throughput, and time remaining, with a cancel button.

`src/lib/eta.js` uses an **exponential moving average** (α = 0.25) of per-item time, not a cumulative mean. Molecules vary several-fold in cost, and a cumulative average reacts far too slowly to feel right. No estimate is shown until 3 samples exist.

`formatEta` deliberately rounds into buckets — a precise "37s left" that keeps changing reads as broken. It also takes the remaining *count*, because "almost done" beside "18 pending" reads as a contradiction even when the arithmetic is correct.

### Structure depiction

Clicking a results row expands it to show the 2D structure, drawn from **CDK's own** `StructureDiagramGenerator` (`cancerin.Depict`, exported as `depict(smiles)`), not a separate JavaScript depiction library. That means the picture comes from the same parse of the same SMILES that was scored, so it cannot disagree with the numbers beside it.

Layout is computed **on demand** when a row is opened and cached in a `SvelteMap`, so a thousand-row result costs nothing until something is actually looked at.

Getting it through TeaVM needed two more patched classes:

| class | why | replacement |
|---|---|---|
| `TemplateHandler` | `StructureDiagramGenerator.setMolecule` constructs it unconditionally, and it loads a CML template library via SAX — so `setUseTemplates(false)` does **not** avoid the dependency | no-op stub; layouts are computed rather than taken from canned templates, which is slightly less pretty for some polycyclics and otherwise identical |
| `IsotopeFactory` | CDK's layout sorts fragments by molecular weight, reaching `isotopes.xml` (809 KB) via SAX + reflection | generated table of the **major isotope only** — all the reachable code needs; full-list methods throw rather than answer wrongly |

⚠️ **CDK returns aromatic rings unkekulised** — bond order 1 with an aromatic flag — so drawing by bond order alone renders benzene as a plain hexagon. `MoleculeView.svelte` draws aromatic bonds with an inner dashed line, offset toward the molecular centroid as a stand-in for ring perception (exact for a single ring, good enough for fused systems).

Salts and mixtures are handled: `Depict` partitions into connected fragments with `ConnectivityChecker` and lays them out side by side, since CDK lays out one fragment at a time.

Depiction is deliberately separate from `Fingerprint108` — it perceives aromaticity, which the scoring path must **not** do. It cannot affect a score.

### Single-file build

`npm run build:standalone` packs everything into one `cancerin.html` (1.40 MB):
styles, app, the Web Worker, the TeaVM engine, the packed background bitset
(base64) and the annotations. It opens straight from disk.

Two things make it possible:

- The worker is imported with `?worker&inline`, so Vite embeds it as a base64
  data URL instead of a sibling file. The worker is only ~5 KB, so this costs
  the hosted build nothing and removes a request.
- The worker gained an `initInline` message. Normally it *fetches* its assets
  (which is what gives the loading bar real byte progress); in the single-file
  build the page hands them over directly and nothing is fetched.

Payloads are embedded as `<script type="text/plain">` blocks rather than JS
string literals — no escaping of ~1 MB of source, and a smaller file. Any
`</script` inside them is rewritten to `<\/script`, which is safe in both JS
source and JSON. The blocks are removed from the DOM once read so the text is
not retained.

⚠️ **`npm run verify:standalone` opens it over `file://`, not a preview server.**
That distinction matters: `file://` is an opaque origin, so Blob-URL workers and
inline module scripts can behave differently there. It also asserts **zero**
external requests — the claim of self-containment is tested, not assumed.

### Verification

`npm run verify:worker` runs the **built** worker bundle under Node with browser shims (Blob, `importScripts`, object URLs) against a live preview server. It exercises the real shipped code path — streaming fetch, engine load, warm-up, scoring, progress, ETA — and asserts NSC 17/185 self-match at TC 1.0, that bad SMILES are reported per-row rather than crashing, and that progress is monotonic and reaches the total.

`npm run verify:browser` drives real Chromium: waits for ready, runs 25 molecules, samples the live panel, and fails if the bar never shows an intermediate state or no ETA ever appears. It also fails on any console/page error.

⚠️ **Do not verify with `chrome --headless --virtual-time-budget`.** Virtual time does not track *worker* network, so it races ahead and captures the page still on "Loading fingerprint engine" — which looks exactly like a hung app but is an artifact. That cost real debugging time; Playwright waits on actual state instead.

The browser suite also opens a results row and fails if the structure SVG has too few bonds or no atom labels.

**Measured in Chromium: ~8 molecules/sec**, notably faster than the ~4/sec seen under Node — the TeaVM output JITs better there. So the earlier 237 ms/molecule figure was pessimistic for real use.
