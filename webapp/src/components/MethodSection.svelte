<script>
  // Plain imports: the hosted build emits these as separate cacheable files,
  // and build-standalone.mjs inlines them as data URIs for the single-file build.
  import selectionFig from "../assets/fingerprint-selection.webp";
  import potencyFig from "../assets/potency-score.webp";

  let open = $state(false);
  let zoomed = $state(null);

  function toggleZoom(id) {
    zoomed = zoomed === id ? null : id;
  }
</script>

<section class="method">
  <button
    type="button"
    class="disclosure"
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    <span class="chevron" aria-hidden="true">{open ? "▾" : "▸"}</span>
    How the method works
    <span class="sub">fingerprint selection and the potency score</span>
  </button>

  {#if open}
    <div class="body">
      <article>
        <h3>Selecting the fingerprints</h3>

        <figure class:zoomed={zoomed === "selection"}>
          <button type="button" class="zoom" onclick={() => toggleZoom("selection")}>
            <img src={selectionFig} alt="Flow diagram of the frequency-based fingerprint classification approach, showing how F11 and F10 scores are derived and used to classify molecules" />
          </button>
          <figcaption>
            Frequency-based fingerprint classification (MCC<sub>a-i</sub>).
            <span class="tip">Click to {zoomed === "selection" ? "shrink" : "enlarge"}.</span>
          </figcaption>
        </figure>

        <p>
          Each fingerprint bit is either present (1) or absent (0) in a molecule. For a
          given bit <strong>A</strong>, the average frequency of A=1 and A=0 is computed
          separately across the active and the inactive molecules.
        </p>
        <p>
          Subtracting the two gives <strong>F11</strong> — how much more often the bit is
          present in actives than in inactives — and likewise <strong>F10</strong> for its
          absence. A positive score means the bit favours active molecules. The original
          1/0 values are then replaced by their F11 and F10 scores, and a molecule is
          classified active when its total is positive.
        </p>
        <p>
          The classification threshold was swept from −30 to +30 in steps of 5 and scored
          on sensitivity, specificity, accuracy, MCC, FPR and ROC. Repeating this for all
          9,365 candidate fingerprints and ranking by MCC gave <strong>126 fingerprints
          with MCC ≥ 0.22</strong>.
        </p>
      </article>

      <article>
        <h3>Calculating the potency score</h3>

        <figure class:zoomed={zoomed === "potency"}>
          <button type="button" class="zoom" onclick={() => toggleZoom("potency")}>
            <img src={potencyFig} alt="Flow chart of the potency score calculation, from Tanimoto coefficients TC1 and TC0 through the highest-scoring active and inactive matches to the final difference" />
          </button>
          <figcaption>
            Potency score calculation.
            <span class="tip">Click to {zoomed === "potency" ? "shrink" : "enlarge"}.</span>
          </figcaption>
        </figure>

        <p>
          Some of the 126 fingerprints correlated with each other at 0.6; of each such
          pair the weaker performer was dropped, leaving the final selected set used here.
        </p>
        <p>
          For a query molecule two Tanimoto coefficients are computed against every one of
          the 8,565 active compounds: <strong>TC1</strong> over the bits present, and
          <strong>TC0</strong> over the bits absent. The highest of each are taken, and the
          larger of the two becomes <strong>HaTs</strong>, the best match among actives.
          The same against the 9,804 inactives gives <strong>HnTs</strong>.
        </p>
        <p class="formula">Potency score = HaTs − HnTs</p>
        <p>
          The score ranges from −1 to +1 and measures how much closer the query sits to
          active molecules than to inactive ones. The original work found
          <strong>0.02</strong> to be the threshold giving the best classification
          performance.
        </p>
      </article>

      <p class="source">
        Method text and figures adapted from the original
        <a href="https://webs.iiitd.edu.in/raghava/cancerin/" target="_blank" rel="noopener noreferrer">CancerIN</a>
        server (Raghava group), lightly edited for clarity. See
        <a href="https://doi.org/10.1186/s12885-016-2082-y" target="_blank" rel="noopener noreferrer">Singh <em>et al.</em>, BMC Cancer 16:77 (2016)</a>
        for the full description.
      </p>
    </div>
  {/if}
</section>

<style>
  .method {
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface);
  }

  .disclosure {
    width: 100%;
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    background: none;
    border: none;
    color: var(--text);
    font: inherit;
    font-size: 0.9rem;
    font-weight: 600;
    text-align: left;
    padding: 0.8rem 1rem;
    cursor: pointer;
    border-radius: 10px;
  }
  .disclosure:hover { background: var(--hover); }
  .disclosure:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }

  .chevron { color: var(--muted); font-size: 0.8rem; }
  .sub { font-weight: 400; color: var(--muted); font-size: 0.82rem; }

  .body {
    padding: 0 1rem 1.1rem;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
    gap: 1.75rem;
  }

  h3 {
    font-size: 0.86rem;
    font-weight: 600;
    margin: 0 0 0.7rem;
    color: var(--text);
  }

  p {
    margin: 0 0 0.65rem;
    font-size: 0.83rem;
    line-height: 1.6;
    color: var(--muted);
  }
  p strong { color: var(--text); font-weight: 600; }

  .formula {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    color: var(--text);
    background: var(--hover);
    border-radius: 6px;
    padding: 0.5rem 0.7rem;
    font-size: 0.82rem;
  }

  figure { margin: 0 0 0.85rem; }

  .zoom {
    display: block;
    width: 100%;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: #fff;      /* the diagrams have white backgrounds */
    cursor: zoom-in;
    overflow: hidden;
  }
  .zoom:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

  img {
    display: block;
    width: 100%;
    height: auto;
    max-height: 15rem;
    object-fit: contain;
    object-position: top;
  }

  .zoomed .zoom { cursor: zoom-out; }
  .zoomed img { max-height: none; }

  figcaption {
    font-size: 0.76rem;
    color: var(--muted);
    margin-top: 0.4rem;
    line-height: 1.45;
  }
  .tip { opacity: 0.7; }

  .source {
    grid-column: 1 / -1;
    margin: 0;
    padding-top: 0.4rem;
    border-top: 1px solid var(--line);
    font-size: 0.78rem;
  }
  .source a { color: var(--accent); }
</style>
