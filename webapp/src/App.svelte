<script>
  import { onMount, onDestroy } from "svelte";
  import PredictorWorker from "./lib/predictor.worker.js?worker&inline";
  import ProgressPanel from "./components/ProgressPanel.svelte";
  import ResultsTable from "./components/ResultsTable.svelte";
  import MethodSection from "./components/MethodSection.svelte";
  import { formatClock } from "./lib/format.js";
  import { SvelteMap } from "svelte/reactivity";

  // idle -> loading -> ready -> running -> ready (with results)
  let phase = $state("loading");
  let error = $state(null);
  let loading = $state({ loaded: 0, total: 0, detail: "Starting" });
  let run = $state({ done: 0, total: 0, elapsedMs: 0, etaMs: null, perItemMs: null, rate: null });
  let stats = $state({ background: 0, actives: 0 });

  let input = $state("");
  let mode = $state("legacy");
  let rows = $state([]);
  let lastRun = $state(null);
  let fileName = $state(null);
  // Depictions are computed on demand when a row is opened and cached here, so
  // a thousand-row result costs nothing until something is actually looked at.
  let structures = $state(new SvelteMap());

  let worker;

  const molecules = $derived(parseInput(input));
  const canRun = $derived(phase === "ready" && molecules.length > 0);

  /**
   * One molecule per line: SMILES first, then an optional id separated by
   * whitespace, a comma or a tab — which covers .smi files, pasted lists and
   * simple CSV. Lines starting with # are comments.
   */
  function parseInput(text) {
    const out = [];
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith("#")) continue;
      const parts = line.split(/[\s,\t]+/);
      const smiles = parts[0];
      if (!smiles) continue;
      out.push({ id: parts[1] || String(out.length + 1), smiles });
    }
    return out;
  }

  onMount(() => {
    worker = new PredictorWorker();
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === "loading") {
        loading = { ...loading, loaded: m.loaded, total: m.total };
      } else if (m.type === "status") {
        loading = { ...loading, detail: m.detail };
      } else if (m.type === "ready") {
        stats = { background: m.background, actives: m.actives };
        phase = "ready";
      } else if (m.type === "progress") {
        run = { ...m };
      } else if (m.type === "done") {
        rows = m.rows;
        lastRun = { elapsedMs: m.elapsedMs, cancelled: m.cancelled, count: m.rows.length };
        phase = "ready";
      } else if (m.type === "structure") {
        structures.set(m.id, { structure: m.structure, error: m.error });
      } else if (m.type === "error") {
        error = m.message;
        phase = "error";
      }
    };
    worker.onerror = (e) => {
      error = e.message || "worker failed to start";
      phase = "error";
    };
    // Load immediately so the engine is ready by the time input is typed.
    // The single-file build carries its assets in the page, so there is nothing
    // to fetch — see webapp/scripts/build-standalone.mjs.
    const inlined = globalThis.__CANCERIN_INLINE__;
    if (inlined) {
      worker.postMessage({ type: "initInline", ...inlined });
    } else {
      worker.postMessage({
        type: "init",
        baseUrl: new URL(import.meta.env.BASE_URL, location.href).href,
      });
    }
  });

  onDestroy(() => worker?.terminate());

  function start() {
    if (!canRun) return;
    rows = [];
    lastRun = null;
    structures.clear();
    run = { done: 0, total: molecules.length, elapsedMs: 0, etaMs: null, perItemMs: null, rate: null };
    phase = "running";
    worker.postMessage({ type: "run", items: molecules, mode });
  }

  function requestStructure(row) {
    worker?.postMessage({ type: "depict", id: row.id, smiles: row.smiles });
  }

  function cancel() {
    worker?.postMessage({ type: "cancel" });
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    fileName = file.name;
    input = await file.text();
    e.target.value = "";
  }

  function loadExample() {
    fileName = null;
    input = [
      "c1(ccc(cc1CCCCCCCCCCCCCCC)O)N\t17",
      "O=C1[C@H](C[C@@H](C[C@H]1[C@H](O)CC1CC(=O)NC(=O)C1)C)C\t185",
      "CC(=O)Oc1ccccc1C(=O)O\taspirin",
    ].join("\n");
  }

  /** The legacy CANCERIN.py output format, so results drop into existing tooling. */
  function exportCsv() {
    const header = "#Qurey,Match_nscID,Match_pubchemSID,Mean_logGI50,Potency_Score,Maximum_tanimoto_Similarity_Score";
    const body = rows.map((r) =>
      r.ok
        ? [r.id, r.matchNscId, r.matchPubchemSid, r.meanLogGI50, r.potencyScore, r.maxTanimoto].join(",")
        : [r.id, "", "", "", "", ""].join(",")
    );
    const blob = new Blob([[header, ...body].join("\n") + "\n"], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "cancerin-results.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }
</script>

<main>
  <header class="masthead">
    <h1>CANCERIN</h1>
    <p>
      Anticancer potency prediction by molecular similarity. Everything —
      fingerprints, the {stats.background ? stats.background.toLocaleString() : "18,369"}-compound
      reference set and scoring — runs in your browser. Nothing is uploaded.
    </p>
  </header>

  {#if phase === "error"}
    <div class="error" role="alert">
      <strong>Something went wrong.</strong>
      <p>{error}</p>
    </div>
  {/if}

  <section class="input">
    <div class="input-head">
      <label for="smiles">SMILES <span class="hint">one per line, optional id after a space or comma</span></label>
      <div class="actions">
        <button type="button" class="link" onclick={loadExample}>Load example</button>
        <label class="link file">
          Upload file
          <input type="file" accept=".smi,.txt,.csv,.smiles" onchange={onFile} />
        </label>
      </div>
    </div>

    <textarea
      id="smiles"
      bind:value={input}
      spellcheck="false"
      placeholder="CC(=O)Oc1ccccc1C(=O)O  aspirin"
      rows="7"
      disabled={phase === "running"}
    ></textarea>

    <div class="controls">
      <span class="parsed">
        {#if fileName}<span class="file-name">{fileName}</span>{/if}
        {molecules.length.toLocaleString()} molecule{molecules.length === 1 ? "" : "s"} ready
      </span>

      <fieldset class="mode" disabled={phase === "running"}>
        <legend class="sr-only">Fidelity mode</legend>
        <label><input type="radio" bind:group={mode} value="legacy" /> Legacy</label>
        <label><input type="radio" bind:group={mode} value="corrected" /> Corrected</label>
      </fieldset>

      <button type="button" class="run" onclick={start} disabled={!canRun}>
        {phase === "loading" ? "Loading…" : "Run prediction"}
      </button>
    </div>
    <p class="mode-note">
      <strong>Legacy</strong> reproduces the original tool exactly, including an off-by-one that
      skips the last active and last inactive compound. <strong>Corrected</strong> uses the full
      reference set.
    </p>
  </section>

  {#if phase === "loading" || phase === "running"}
    <ProgressPanel {phase} {loading} {run} onCancel={phase === "running" ? cancel : null} />
  {/if}

  <MethodSection />

  {#if rows.length}
    <section class="results">
      {#if lastRun}
        <p class="summary">
          {lastRun.cancelled ? "Cancelled after" : "Scored"}
          {lastRun.count.toLocaleString()} molecule{lastRun.count === 1 ? "" : "s"} in
          {formatClock(lastRun.elapsedMs)}
          <button type="button" class="link" onclick={exportCsv}>Download CSV</button>
        </p>
      {/if}
      <ResultsTable {rows} {structures} onRequestStructure={requestStructure} />
    </section>
  {/if}
</main>

<style>
  main {
    max-width: 62rem;
    margin: 0 auto;
    padding: 2.5rem 1.25rem 4rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .masthead h1 {
    margin: 0 0 0.3rem;
    font-size: 1.5rem;
    letter-spacing: -0.02em;
  }

  .masthead p {
    margin: 0;
    color: var(--muted);
    max-width: 46rem;
    font-size: 0.9rem;
    line-height: 1.5;
  }

  .error {
    border: 1px solid var(--warn);
    border-radius: 10px;
    padding: 0.9rem 1rem;
    background: var(--surface);
  }
  .error p { margin: 0.35rem 0 0; color: var(--muted); font-size: 0.85rem; }

  .input-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.4rem;
  }

  label { font-size: 0.85rem; font-weight: 600; }
  .hint { font-weight: 400; color: var(--muted); }

  .actions { display: flex; gap: 0.9rem; }

  .link {
    background: none;
    border: none;
    padding: 0;
    font-size: 0.82rem;
    color: var(--accent);
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
    font-weight: 500;
  }
  .file input { display: none; }

  textarea {
    width: 100%;
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 0.75rem 0.85rem;
    background: var(--surface);
    color: var(--text);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.85rem;
    line-height: 1.55;
    resize: vertical;
  }
  textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

  .controls {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
    margin-top: 0.7rem;
  }

  .parsed { flex: 1; font-size: 0.82rem; color: var(--muted); }
  .file-name { color: var(--text); font-weight: 500; margin-right: 0.4rem; }

  .mode {
    border: none;
    margin: 0;
    padding: 0;
    display: flex;
    gap: 0.85rem;
    font-size: 0.82rem;
  }
  .mode label { font-weight: 400; display: flex; align-items: center; gap: 0.3rem; }

  .run {
    border: none;
    border-radius: 8px;
    background: var(--accent);
    color: var(--on-accent);
    font-weight: 600;
    font-size: 0.87rem;
    padding: 0.5rem 1.1rem;
    cursor: pointer;
  }
  .run:disabled { opacity: 0.45; cursor: not-allowed; }

  .mode-note {
    margin: 0.6rem 0 0;
    font-size: 0.78rem;
    color: var(--muted);
    line-height: 1.5;
  }
  .mode-note strong { color: var(--text); font-weight: 600; }

  .summary {
    margin: 0 0 0.75rem;
    font-size: 0.85rem;
    color: var(--muted);
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
  }

  .sr-only {
    position: absolute;
    width: 1px; height: 1px;
    padding: 0; margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
</style>
