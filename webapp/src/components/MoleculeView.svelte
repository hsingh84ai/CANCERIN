<script>
  // Draws the 2D structure from CDK's own layout coordinates.
  // See cancerin.Depict for the payload shape.
  let { structure, smiles } = $props();

  const PAD = 22;          // room for atom labels at the edges
  const BOND = 26;         // px per CDK bond-length unit
  const DOUBLE_GAP = 3.4;  // px between the lines of a double bond

  // Element colours. Carbon is drawn as a plain vertex with no label, so it
  // needs no colour.
  const COLOURS = {
    O: "#c0392b", N: "#2465b8", S: "#b8860b", P: "#cc7000",
    F: "#2e9e5b", Cl: "#2e9e5b", Br: "#a0522d", I: "#7b3fa0",
    Na: "#8e44ad", K: "#8e44ad", Ca: "#8e44ad", Fe: "#a0522d", Se: "#b8860b",
  };

  const view = $derived(layout(structure));

  function layout(s) {
    if (!s?.atoms?.length) return null;
    const xs = s.atoms.map((a) => a.x);
    const ys = s.atoms.map((a) => a.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);

    // CDK's y axis points up; SVG's points down, so flip it.
    const pts = s.atoms.map((a) => ({
      x: (a.x - minX) * BOND + PAD,
      y: (maxY - a.y) * BOND + PAD,
    }));

    // CDK reports aromatic rings unkekulised — order 1 with an aromatic flag —
    // so those bonds need an inner line drawn on the ring-interior side. We
    // have no ring perception here, so the molecular centroid stands in for it:
    // exact for a single ring, and good enough for fused systems.
    const cx = pts.reduce((t, p) => t + p.x, 0) / pts.length;
    const cy = pts.reduce((t, p) => t + p.y, 0) / pts.length;

    return {
      pts,
      centroid: { x: cx, y: cy },
      width: (maxX - minX) * BOND + PAD * 2,
      height: (maxY - minY) * BOND + PAD * 2,
      atoms: s.atoms,
      bonds: s.bonds ?? [],
    };
  }

  /** Sign that puts the inner line of an aromatic bond toward the centroid. */
  function innerSign(p, q, centroid) {
    const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
    const dx = q.x - p.x, dy = q.y - p.y;
    // Normal is (-dy, dx); pick the direction pointing at the centroid.
    return (-dy * (centroid.x - mx) + dx * (centroid.y - my)) >= 0 ? 1 : -1;
  }

  /** Offset segments for the second/third line of a multiple bond. */
  function parallel(p, q, offset) {
    const dx = q.x - p.x, dy = q.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * offset, ny = (dx / len) * offset;
    return { x1: p.x + nx, y1: p.y + ny, x2: q.x + nx, y2: q.y + ny };
  }

  /** Shorten a bond so it stops short of a drawn atom label. */
  function trim(p, q, atomP, atomQ) {
    const dx = q.x - p.x, dy = q.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const a = labelled(atomP) ? 9 : 0;
    const b = labelled(atomQ) ? 9 : 0;
    return { x1: p.x + ux * a, y1: p.y + uy * a, x2: q.x - ux * b, y2: q.y - uy * b };
  }

  const labelled = (a) => a.s !== "C" || a.c;

  function charge(a) {
    if (!a.c) return "";
    const n = Math.abs(a.c) > 1 ? Math.abs(a.c) : "";
    return a.c > 0 ? `${n}+` : `${n}−`;
  }
</script>

{#if !view}
  <p class="unavailable">Structure could not be drawn.</p>
{:else}
  <svg
    viewBox="0 0 {view.width} {view.height}"
    width={view.width}
    height={view.height}
    role="img"
    aria-label="Chemical structure of {smiles}"
  >
    {#each view.bonds as b}
      {@const p = view.pts[b.a]}
      {@const q = view.pts[b.b]}
      {@const atomP = view.atoms[b.a]}
      {@const atomQ = view.atoms[b.b]}
      {#if p && q}
        {@const seg = trim(p, q, atomP, atomQ)}
        {#if b.r}
          {@const sgn = innerSign(p, q, view.centroid)}
          {@const inner = parallel({ x: seg.x1, y: seg.y1 }, { x: seg.x2, y: seg.y2 }, DOUBLE_GAP * sgn)}
          <line x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2} />
          <line {...inner} class="aromatic" />
        {:else if b.o === 2}
          {@const l1 = parallel({ x: seg.x1, y: seg.y1 }, { x: seg.x2, y: seg.y2 }, DOUBLE_GAP)}
          {@const l2 = parallel({ x: seg.x1, y: seg.y1 }, { x: seg.x2, y: seg.y2 }, -DOUBLE_GAP)}
          <line {...l1} />
          <line {...l2} />
        {:else if b.o === 3}
          {@const l1 = parallel({ x: seg.x1, y: seg.y1 }, { x: seg.x2, y: seg.y2 }, DOUBLE_GAP + 1)}
          {@const l2 = parallel({ x: seg.x1, y: seg.y1 }, { x: seg.x2, y: seg.y2 }, -DOUBLE_GAP - 1)}
          <line {...l1} />
          <line x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2} />
          <line {...l2} />
        {:else}
          <line x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2} />
        {/if}
      {/if}
    {/each}

    {#each view.atoms as a, i}
      {@const p = view.pts[i]}
      {#if labelled(a)}
        <!-- Knock a hole in the bonds behind the label so it stays readable. -->
        <circle cx={p.x} cy={p.y} r="9" class="halo" />
        <text x={p.x} y={p.y} fill={COLOURS[a.s] ?? "currentColor"}>
          {a.s}{#if a.h}H{#if a.h > 1}<tspan class="sub">{a.h}</tspan>{/if}{/if}{#if a.c}<tspan class="sup">{charge(a)}</tspan>{/if}
        </text>
      {/if}
    {/each}
  </svg>
{/if}

<style>
  svg {
    max-width: 100%;
    height: auto;
    color: var(--text);
    overflow: visible;
  }

  line {
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
  }

  /* Inner line of an aromatic bond: lighter and dashed. */
  line.aromatic { stroke-dasharray: 4.5 3; opacity: 0.7; stroke-width: 1.2; }

  .halo { fill: var(--surface); }

  text {
    font-family: ui-sans-serif, system-ui, sans-serif;
    font-size: 12px;
    font-weight: 600;
    text-anchor: middle;
    dominant-baseline: central;
  }

  .sub { font-size: 9px; baseline-shift: -3px; font-weight: 500; }
  .sup { font-size: 9px; baseline-shift: 5px; font-weight: 500; }

  .unavailable { color: var(--muted); font-size: 0.82rem; margin: 0; font-style: italic; }
</style>
