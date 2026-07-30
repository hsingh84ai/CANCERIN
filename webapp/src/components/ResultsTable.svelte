<script>
  import MoleculeView from "./MoleculeView.svelte";
  import { ACTIVE_THRESHOLD } from "../lib/scoring.generated.js";

  let { rows, structures, onRequestStructure } = $props();

  let openId = $state(null);

  const failures = $derived(rows.filter((r) => !r.ok).length);

  const activeCount = $derived(rows.filter((r) => r.ok && r.prediction === "active").length);
  const scored = $derived(rows.filter((r) => r.ok).length);

  const num = (v, digits = 3) =>
    v == null || v === "" ? "—" : Number(v).toFixed(digits);

  function toggle(row) {
    if (openId === row.id) {
      openId = null;
      return;
    }
    openId = row.id;
    // Layout is computed on demand and cached by the parent, so reopening a
    // row is instant and a long results list costs nothing up front.
    if (!structures.has(row.id)) onRequestStructure(row);
  }

  function onKey(e, row) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle(row);
    }
  }
</script>

<div class="head">
  <h2>Results <span class="count">{rows.length.toLocaleString()}</span></h2>
  <p class="hint">
    {#if scored}
      <strong>{activeCount.toLocaleString()}</strong> predicted active of {scored.toLocaleString()} ·
    {/if}
    select a row to see its structure
  </p>
  {#if failures}
    <p class="failures">{failures} molecule{failures === 1 ? "" : "s"} could not be processed</p>
  {/if}
</div>

<div class="scroller">
  <table>
    <thead>
      <tr>
        <th scope="col"><span class="sr-only">Expand</span></th>
        <th scope="col">Query</th>
        <th scope="col">Prediction</th>
        <th scope="col">Match NSC</th>
        <th scope="col">PubChem SID</th>
        <th scope="col" class="n">Mean log GI50</th>
        <th scope="col" class="n">Potency score</th>
        <th scope="col" class="n">Max Tanimoto</th>
      </tr>
    </thead>
    <tbody>
      {#each rows as r (r.id)}
        {@const open = openId === r.id}
        <tr
          class:failed={!r.ok}
          class:open
          tabindex="0"
          role="button"
          aria-expanded={open}
          onclick={() => toggle(r)}
          onkeydown={(e) => onKey(e, r)}
        >
          <td class="chevron" aria-hidden="true">{open ? "▾" : "▸"}</td>
          <td>
            <span class="id">{r.id}</span>
            <span class="smiles" title={r.smiles}>{r.smiles}</span>
          </td>
          {#if r.ok}
            <td><span class="verdict {r.prediction}">{r.prediction}</span></td>
            <td>{r.matchNscId}</td>
            <td>{r.matchPubchemSid ?? "—"}</td>
            <td class="n">{num(r.meanLogGI50)}</td>
            <td class="n">{num(r.potencyScore)}</td>
            <td class="n">{num(r.maxTanimoto)}</td>
          {:else}
            <td colspan="6" class="err">{r.error}</td>
          {/if}
        </tr>

        {#if open}
          <tr class="detail">
            <td colspan="8">
              <div class="detail-body">
                <div class="structure">
                  {#if structures.has(r.id)}
                    {@const s = structures.get(r.id)}
                    {#if s.structure}
                      <MoleculeView structure={s.structure} smiles={r.smiles} />
                    {:else}
                      <p class="unavailable">{s.error || "Structure unavailable."}</p>
                    {/if}
                  {:else}
                    <p class="unavailable">Drawing…</p>
                  {/if}
                </div>
                <dl>
                  <dt>SMILES</dt>
                  <dd class="mono wrap">{r.smiles}</dd>
                  {#if r.ok}
                    <dt>Prediction</dt>
                    <dd>
                      <span class="verdict {r.prediction}">{r.prediction}</span>
                      <span class="threshold">potency {num(r.potencyScore, 4)} vs threshold {ACTIVE_THRESHOLD}</span>
                    </dd>
                    <dt>Closest active</dt>
                    <dd>NSC {r.matchNscId}{#if r.matchPubchemSid} · PubChem SID {r.matchPubchemSid}{/if}</dd>
                    <dt>Mean log GI50</dt>
                    <dd>{num(r.meanLogGI50)}</dd>
                    <dt>Potency score</dt>
                    <dd>{num(r.potencyScore, 4)}</dd>
                    <dt>Max Tanimoto</dt>
                    <dd>{num(r.maxTanimoto)}</dd>
                  {:else}
                    <dt>Error</dt>
                    <dd class="err">{r.error}</dd>
                  {/if}
                </dl>
              </div>
            </td>
          </tr>
        {/if}
      {/each}
    </tbody>
  </table>
</div>

<style>
  .head {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    margin-bottom: 0.6rem;
    flex-wrap: wrap;
  }

  h2 { font-size: 0.95rem; font-weight: 600; margin: 0; }

  .count {
    color: var(--muted);
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }

  .hint { margin: 0; font-size: 0.8rem; color: var(--muted); flex: 1; }
  .failures { margin: 0; font-size: 0.82rem; color: var(--warn); }

  /* The table scrolls inside its own box so the page never scrolls sideways. */
  .scroller {
    overflow-x: auto;
    border: 1px solid var(--line);
    border-radius: 10px;
    max-height: 70vh;
    overflow-y: auto;
  }

  table { border-collapse: collapse; width: 100%; font-size: 0.85rem; }

  th, td {
    text-align: left;
    padding: 0.5rem 0.7rem;
    border-bottom: 1px solid var(--line);
    white-space: nowrap;
  }

  thead th {
    position: sticky;
    top: 0;
    background: var(--surface);
    font-weight: 600;
    font-size: 0.78rem;
    color: var(--muted);
    z-index: 1;
  }

  tbody tr[role="button"] { cursor: pointer; }
  tbody tr[role="button"]:hover { background: var(--hover); }
  tbody tr[role="button"]:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  tbody tr.open { background: var(--hover); }
  tbody tr.open td { border-bottom-color: transparent; }

  .chevron { color: var(--muted); width: 1.2rem; padding-right: 0; }

  .n { text-align: right; font-variant-numeric: tabular-nums; }
  .id { font-weight: 600; margin-right: 0.5rem; }

  .smiles {
    color: var(--muted);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.78rem;
    display: inline-block;
    max-width: 22ch;
    overflow: hidden;
    text-overflow: ellipsis;
    vertical-align: bottom;
  }

  .failed .err { color: var(--warn); font-style: italic; white-space: normal; }

  .verdict {
    display: inline-block;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    padding: 0.12rem 0.45rem;
    border-radius: 4px;
    border: 1px solid transparent;
  }
  .verdict.active { color: var(--ok); border-color: var(--ok); background: var(--ok-bg); }
  .verdict.inactive { color: var(--muted); border-color: var(--line); }

  .threshold { color: var(--muted); font-size: 0.76rem; margin-left: 0.5rem; }

  .detail td { background: var(--hover); padding: 0 0.7rem 0.9rem; }

  .detail-body {
    display: flex;
    gap: 1.75rem;
    align-items: flex-start;
    flex-wrap: wrap;
    padding-top: 0.2rem;
  }

  .structure {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 0.6rem;
    min-width: 180px;
    min-height: 90px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow-x: auto;
  }

  dl {
    display: grid;
    grid-template-columns: auto auto;
    gap: 0.28rem 1rem;
    margin: 0;
    font-size: 0.8rem;
    align-content: start;
  }

  dt { color: var(--muted); }
  dd { margin: 0; font-variant-numeric: tabular-nums; }
  .mono { font-family: ui-mono, ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.76rem; }
  .wrap { white-space: normal; word-break: break-all; max-width: 34ch; }
  .unavailable { color: var(--muted); font-size: 0.8rem; margin: 0; font-style: italic; }

  .sr-only {
    position: absolute;
    width: 1px; height: 1px;
    padding: 0; margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
</style>
