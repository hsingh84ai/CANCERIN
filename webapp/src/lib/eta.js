// Time-remaining estimation for the scoring run.
//
// Molecules vary a lot in cost — a big fused-ring structure takes several times
// longer than ethanol — so a plain "elapsed / done * remaining" average reacts
// far too slowly and reads as wrong to the user. An exponential moving average
// tracks the recent rate instead, so the estimate settles quickly and adapts
// when a run hits a stretch of heavier molecules.

const DEFAULT_ALPHA = 0.25;   // weight of the newest sample
const MIN_SAMPLES = 3;        // below this an estimate is noise, so show nothing

export function createEta({ alpha = DEFAULT_ALPHA, minSamples = MIN_SAMPLES } = {}) {
  let ema = null;
  let samples = 0;
  let startedAt = null;
  let lastAt = null;

  return {
    start(now = performance.now()) {
      ema = null;
      samples = 0;
      startedAt = now;
      lastAt = now;
    },

    /** Record that one item finished. Returns the duration it measured. */
    tick(now = performance.now()) {
      const duration = lastAt == null ? 0 : now - lastAt;
      lastAt = now;
      samples++;
      ema = ema == null ? duration : alpha * duration + (1 - alpha) * ema;
      return duration;
    },

    /** Milliseconds left for `remaining` items, or null while still unreliable. */
    estimate(remaining) {
      if (ema == null || samples < minSamples || remaining <= 0) return null;
      return ema * remaining;
    },

    elapsed(now = performance.now()) {
      return startedAt == null ? 0 : now - startedAt;
    },

    /** Smoothed milliseconds per item, or null if not yet known. */
    perItem() {
      return samples < minSamples ? null : ema;
    },

    /** Items per second, or null if not yet known. */
    rate() {
      return ema == null || ema <= 0 || samples < minSamples ? null : 1000 / ema;
    },
  };
}
