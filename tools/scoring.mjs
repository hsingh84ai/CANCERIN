// CANCERIN potency-score engine — a faithful port of the Tanimoto/potency half
// of the legacy CANCERIN.py, operating on packed 108-bit fingerprints.
//
// Two fidelity modes:
//   "legacy"    reproduces CANCERIN.py exactly, including its slice off-by-ones
//   "corrected" uses the full active/inactive partition
//
// Background layout (18369 rows x 108 bits):
//   rows 0..8564      actives   (8565, indexed by annotations.ncititles)
//   rows 8565..18368  inactives (9804)
//
// The legacy script slices `arr[0:8564]` and `arr[8565:18368]`, which silently
// drops the last active (row 8564) and the last inactive (row 18368). The
// author evidently meant `arr[0:8565]`. "corrected" mode restores both rows.

export const N_BITS = 108;
export const WORDS_PER_ROW = 4;

export const PARTITIONS = {
  legacy:    { activeStart: 0, activeEnd: 8564, inactiveStart: 8565, inactiveEnd: 18368 },
  corrected: { activeStart: 0, activeEnd: 8565, inactiveStart: 8565, inactiveEnd: 18369 },
};

const popcount = (v) => {
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
};

// Python 2 `round()` — half away from zero, unlike JS Math.round (half up).
function pyRound3(x) {
  const s = x < 0 ? -1 : 1;
  return (s * Math.floor(Math.abs(x) * 1000 + 0.5)) / 1000;
}

/**
 * Tanimoto over set bits (TC1) and unset bits (TC0), for one query against
 * every background row. Both derive from the same two popcounts:
 *
 *   TC1 = |A&B| / |A|B|
 *   TC0 = (n - |A|B|) / (n - |A&B|)
 *
 * Values are rounded to 3dp to match the legacy pipeline, which round-tripped
 * them through text files.
 */
export function tanimotoAll(query, background, rows) {
  const tc1 = new Float64Array(rows);
  const tc0 = new Float64Array(rows);
  const q0 = query[0], q1 = query[1], q2 = query[2], q3 = query[3];

  for (let r = 0; r < rows; r++) {
    const b = r * WORDS_PER_ROW;
    const and = popcount(q0 & background[b]) + popcount(q1 & background[b + 1]) +
                popcount(q2 & background[b + 2]) + popcount(q3 & background[b + 3]);
    const or  = popcount(q0 | background[b]) + popcount(q1 | background[b + 1]) +
                popcount(q2 | background[b + 2]) + popcount(q3 | background[b + 3]);

    tc1[r] = or === 0 ? 0 : pyRound3(and / or);
    const zAnd = N_BITS - or;   // positions 0 in both
    const zOr  = N_BITS - and;  // positions 0 in either
    tc0[r] = zOr === 0 ? 0 : pyRound3(zAnd / zOr);
  }
  return { tc1, tc0 };
}

// Max value in [start, end) plus the index of its FIRST occurrence, matching
// Python's list.index() on the legacy string representations.
function maxWithFirstIndex(arr, start, end) {
  let best = -Infinity, at = -1;
  for (let i = start; i < end; i++) {
    if (arr[i] > best) { best = arr[i]; at = i; }
  }
  return { value: best, index: at };
}

/**
 * Potency score for a single query fingerprint.
 *
 * Legacy takes the larger of the TC1/TC0 maxima over actives, and independently
 * the larger over inactives; the score is their difference. The original
 * compared the rounded values as *strings*, which for fixed-format decimals
 * ("0.667", "1.0") orders identically to numeric comparison, so comparing
 * numerically here is equivalent rather than a behaviour change.
 */
export function score(query, background, rows, mode = "legacy") {
  const p = PARTITIONS[mode];
  if (!p) throw new Error(`unknown mode ${mode}`);
  const { tc1, tc0 } = tanimotoAll(query, background, rows);

  const a1 = maxWithFirstIndex(tc1, p.activeStart, p.activeEnd);
  const a0 = maxWithFirstIndex(tc0, p.activeStart, p.activeEnd);
  const i1 = maxWithFirstIndex(tc1, p.inactiveStart, p.inactiveEnd);
  const i0 = maxWithFirstIndex(tc0, p.inactiveStart, p.inactiveEnd);

  const bestActive = a1.value >= a0.value ? a1 : a0;
  const maxInactive = Math.max(i1.value, i0.value);

  return {
    activeRow: bestActive.index,          // index into ncititles
    maxActiveTC: bestActive.value,
    maxInactiveTC: maxInactive,
    potencyScore: bestActive.value - maxInactive,
    from: a1.value >= a0.value ? "tc1" : "tc0",
  };
}

/** Attach NSC/SID/GI50 annotations to a raw score. */
export function annotate(result, ann) {
  const nsc = ann.ncititles[result.activeRow];
  return {
    matchNscId: nsc,
    matchPubchemSid: ann.nsc2sid[nsc],
    meanLogGI50: ann.GI50[nsc],
    potencyScore: result.potencyScore,
    maxTanimoto: result.maxActiveTC,
  };
}
