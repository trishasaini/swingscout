// helpers.js — synthetic bar builders shared by tests/verdict.test.js and
// tests/data-fetch.test.js. Every number a test scenario needs (range, volume,
// overlap) is explicit at the call site; these just assemble valid OHLCV shape.

const DAY_MS = 24 * 3600 * 1000;
const T0 = Date.UTC(2026, 0, 1);

function day(i) {
  return new Date(T0 + i * DAY_MS).toISOString().slice(0, 10);
}

// Flat, calm "normal" bars: fixed high-low range, small green body (so they
// never count as a "red day" in the volume-trend lookback).
function baselineBars(count, { mid = 100, range = 2.0, volume = 5_000_000, startIndex = 0 } = {}) {
  const half = range / 2;
  return Array.from({ length: count }, (_, i) => ({
    time: day(startIndex + i),
    open: mid - 0.05,
    close: mid + 0.05,
    high: mid + half,
    low: mid - half,
    volume,
  }));
}

// Recent/pullback bars. `mids` controls candle body price level per day
// (single number = same level every day; array = cycles per day, letting
// bodies overlap or not). `red` sets red/green for every day uniformly;
// `reds` (array of booleans, cycles per day like `mids`) overrides `red` on
// a per-day basis when a mixed red/green sequence is needed (e.g. testing
// verdict.js's bullish-recovery overlap check, RULES.md §4 signal 2).
function pullbackBars(count, { mids = 100, range = 0.6, volume = 2_500_000, red = true, reds = null, startIndex = 0 } = {}) {
  const half = range / 2;
  const bodyHalf = 0.1;
  return Array.from({ length: count }, (_, i) => {
    const mid = Array.isArray(mids) ? mids[i % mids.length] : mids;
    const isRedDay = reds ? reds[i % reds.length] : red;
    const open = isRedDay ? mid + bodyHalf : mid - bodyHalf;
    const close = isRedDay ? mid - bodyHalf : mid + bodyHalf;
    return { time: day(startIndex + i), open, close, high: mid + half, low: mid - half, volume };
  });
}

function risingEma(n, { start = 90, step = 0.2 } = {}) {
  return Array.from({ length: n }, (_, i) => start + i * step);
}
function decliningEma(n, { start = 110, step = 0.2 } = {}) {
  return Array.from({ length: n }, (_, i) => start - i * step);
}

module.exports = { day, baselineBars, pullbackBars, risingEma, decliningEma };
