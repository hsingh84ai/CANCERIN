<script>
  import { formatClock, formatEta, formatBytes, formatRate } from "../lib/format.js";

  let { phase, loading, run, onCancel } = $props();

  const isLoading = $derived(phase === "loading");
  const isRunning = $derived(phase === "running");

  // Loading knows its byte total only once headers arrive; until then the bar
  // is indeterminate rather than pretending to a percentage it cannot justify.
  const fraction = $derived(
    isLoading
      ? (loading.total > 0 ? loading.loaded / loading.total : null)
      : (run.total > 0 ? run.done / run.total : null)
  );

  const percent = $derived(fraction == null ? null : Math.min(100, Math.round(fraction * 100)));
  const eta = $derived(isRunning ? formatEta(run.etaMs, run.total - run.done) : null);
  const rate = $derived(isRunning ? formatRate(run.rate) : null);
</script>

<section class="panel" aria-live="polite">
  <header>
    <span class="spinner" aria-hidden="true"></span>
    <h2>{isLoading ? loading.detail || "Loading" : "Scoring molecules"}</h2>
    {#if percent != null}<span class="percent">{percent}%</span>{/if}
  </header>

  <div
    class="track"
    role="progressbar"
    aria-valuemin="0"
    aria-valuemax={isLoading ? loading.total || 100 : run.total}
    aria-valuenow={percent == null ? undefined : (isLoading ? loading.loaded : run.done)}
    aria-valuetext={isLoading
      ? `${formatBytes(loading.loaded)} of ${formatBytes(loading.total)}`
      : `${run.done} of ${run.total} molecules`}
  >
    {#if fraction == null}
      <div class="fill indeterminate"></div>
    {:else}
      <div class="fill" style="width: {percent}%"></div>
    {/if}
  </div>

  <div class="meta">
    <span class="counts">
      {#if isLoading}
        {formatBytes(loading.loaded)}{#if loading.total} of {formatBytes(loading.total)}{/if}
      {:else}
        <strong>{run.done.toLocaleString()}</strong> of {run.total.toLocaleString()} molecules
        {#if run.total > run.done}<span class="pending">· {(run.total - run.done).toLocaleString()} pending</span>{/if}
      {/if}
    </span>

    <span class="timing">
      {#if isRunning}
        <span title="Elapsed">{formatClock(run.elapsedMs)}</span>
        {#if eta}<span class="eta">· {eta}</span>{/if}
        {#if rate}<span class="rate" title="Throughput">· {rate}</span>{/if}
      {/if}
    </span>

    {#if isRunning && onCancel}
      <button type="button" class="cancel" onclick={onCancel}>Cancel</button>
    {/if}
  </div>
</section>

<style>
  .panel {
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 1rem 1.15rem 1.1rem;
    background: var(--surface);
  }

  header {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-bottom: 0.7rem;
  }

  h2 {
    font-size: 0.95rem;
    font-weight: 600;
    margin: 0;
    flex: 1;
  }

  .percent {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    color: var(--accent);
  }

  .spinner {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid var(--line);
    border-top-color: var(--accent);
    animation: spin 0.8s linear infinite;
    flex: none;
  }

  .track {
    height: 8px;
    border-radius: 999px;
    background: var(--track);
    overflow: hidden;
  }

  .fill {
    height: 100%;
    border-radius: 999px;
    background: var(--accent);
    transition: width 180ms ease-out;
  }

  /* Byte totals are unknown until headers arrive; sweep rather than sit at 0%. */
  .fill.indeterminate {
    width: 35%;
    animation: sweep 1.1s ease-in-out infinite;
  }

  .meta {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-top: 0.65rem;
    font-size: 0.82rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .counts { flex: 1; }
  .counts strong { color: var(--text); font-weight: 600; }
  .pending { opacity: 0.75; }
  .timing { white-space: nowrap; }
  .eta { color: var(--text); }
  .rate { opacity: 0.75; }

  .cancel {
    border: 1px solid var(--line);
    background: transparent;
    color: var(--muted);
    border-radius: 6px;
    padding: 0.2rem 0.6rem;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .cancel:hover { color: var(--text); border-color: var(--muted); }

  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes sweep {
    0% { margin-left: -35%; }
    100% { margin-left: 100%; }
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner { animation: none; }
    .fill { transition: none; }
    .fill.indeterminate { animation: none; width: 100%; opacity: 0.4; }
  }
</style>
