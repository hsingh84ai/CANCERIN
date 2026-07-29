// Human-readable durations and sizes for the progress display.

/** Elapsed time as a stopwatch: 0:07, 4:31, 1:02:03. */
export function formatClock(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * Time remaining, deliberately vague. A precise-looking "37s left" that keeps
 * changing reads as broken; rounded buckets stay believable as the estimate
 * moves around.
 */
export function formatEta(ms, remaining = null) {
  if (ms == null || !isFinite(ms)) return null;
  const s = Math.round(ms / 1000);
  // "almost done" beside "18 pending" reads as a contradiction even when the
  // arithmetic is right, so it needs a short queue as well as a short time.
  if (s <= 2 && (remaining == null || remaining <= 5)) return "almost done";
  if (s < 15) return "a few seconds left";
  if (s < 60) return `about ${Math.round(s / 5) * 5}s left`;
  if (s < 3600) {
    const m = Math.round(s / 30) / 2;           // nearest half minute
    const shown = m < 2 ? Math.max(1, Math.round(m * 2) / 2) : Math.round(m);
    return `about ${shown} min left`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return `about ${h} h ${m} min left`;
}

export function formatBytes(n) {
  if (!n) return "0 KB";
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatRate(perSecond) {
  if (perSecond == null) return null;
  if (perSecond >= 10) return `${Math.round(perSecond)}/s`;
  if (perSecond >= 1) return `${perSecond.toFixed(1)}/s`;
  return `${(perSecond * 60).toFixed(0)}/min`;
}
