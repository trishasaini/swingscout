// verdict.js — Phase 2 Pullback Quality Verdict (RULES.md §4 / spec §3.4–3.5).
//
// Four checks over the recent pullback window, combined into BUY SETUP / NOT YET
// / AVOID. Always returns the full signal breakdown (actual values) so the UI
// can render the table beneath the plain-language verdict.
//
// VERDICT MAPPING — note on the "exactly 2 of 4" wording in RULES §4:
//   1. AVOID   if sharp candles OR elevated volume OR EMA50 declining.
//   2. BUY     if all 4 checks pass (and no AVOID trigger).
//   3. NOT YET otherwise (the "forming" bucket).
// The only checks that can fail WITHOUT firing an AVOID trigger are candle
// overlap and volume in the 80–100% neutral band, so in practice the NOT YET
// bucket resolves to the "~2 of 4 pass, needs more time" case RULES describes.
// This is an interpretation of a hard rule (RULES doesn't partition 1/3-of-4
// non-AVOID cases) — flagged to the user for confirmation.

const BASELINE_WINDOW = 60; // days for average true range baseline
const PULLBACK_WINDOW = 7; // recent days assessed (spec: "last 5–10")
const VOLUME_AVG_WINDOW = 20; // 20-day average volume
const RED_LOOKBACK = 10; // look for pullback (red) days in the last 10

const CANDLE_SIZE_MAX = 0.8; // recent range must be < 80% of baseline
const RED_RECOVERY_MIN = 0.5; // >= 50% of red candles need a later green recovery
const VOL_GOOD = 0.8; // pullback vol < 80% of 20d avg = good
const VOL_ELEVATED = 1.0; // pullback vol > 100% of 20d avg = distribution

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const range = (b) => b.high - b.low;
const isRed = (b) => b.close < b.open;
const isGreen = (b) => b.close > b.open;

/**
 * @param {Array<{open,high,low,close,volume}>} bars oldest-first, >= 60 bars
 * @param {Array<number|null>} ema50 series aligned to bars
 * @returns {{ verdict, color, summary, signals }}
 */
function pullbackVerdict(bars, ema50) {
  const n = bars.length;
  if (n < BASELINE_WINDOW || ema50.length !== n) {
    throw new Error(`pullbackVerdict needs >= ${BASELINE_WINDOW} aligned bars`);
  }

  // --- 1. Candle size ------------------------------------------------------
  const baselineRange = mean(bars.slice(-BASELINE_WINDOW).map(range));
  const recentRange = mean(bars.slice(-PULLBACK_WINDOW).map(range));
  const candleSizePass = recentRange < CANDLE_SIZE_MAX * baselineRange;

  // --- 2. Candle overlap (bullish recovery) ---------------------------------
  // Redefined by explicit user instruction (was: generic consecutive-body
  // overlap regardless of direction). Now checks for BULLISH recovery: for
  // each red (down) candle in the pullback window, is there a LATER green
  // (up) candle in the same window whose close climbs back above that red
  // candle's open? One strong green candle can cover several earlier reds at
  // once — this is deliberately not a 1:1 pairing (e.g. one green candle
  // recovering 2-3 prior reds still counts each of them as recovered).
  //
  // Interpretation flagged, not silently decided: a pullback window with NO
  // red candles has nothing to recover from, so it trivially passes (100%)
  // rather than failing on a 0/0 count.
  const window = bars.slice(-PULLBACK_WINDOW);
  let redCount = 0;
  let recoveredCount = 0;
  for (let i = 0; i < window.length; i++) {
    if (!isRed(window[i])) continue;
    redCount++;
    const redOpen = window[i].open;
    const recovered = window.slice(i + 1).some((later) => isGreen(later) && later.close > redOpen);
    if (recovered) recoveredCount++;
  }
  const overlapFrac = redCount > 0 ? recoveredCount / redCount : 1;
  const overlapPass = overlapFrac >= RED_RECOVERY_MIN;

  // --- 3. Volume trend -----------------------------------------------------
  const avg20 = mean(bars.slice(-VOLUME_AVG_WINDOW).map((b) => b.volume));
  const redDays = bars
    .slice(-RED_LOOKBACK)
    .filter((b) => b.close < b.open)
    .map((b) => b.volume);
  // Fall back to the whole pullback window if there were no down days.
  const pullbackVol = redDays.length
    ? mean(redDays)
    : mean(window.map((b) => b.volume));
  const volumePass = pullbackVol < VOL_GOOD * avg20;
  const volumeElevated = pullbackVol > VOL_ELEVATED * avg20;

  // --- 4. EMA50 direction --------------------------------------------------
  const e0 = ema50[n - 1];
  const e5 = ema50[n - 6];
  const e10 = ema50[n - 11];
  const emaPass = e0 != null && e5 != null && e10 != null && e0 > e5 && e5 > e10;
  const emaDeclining = !emaPass;

  // --- Verdict -------------------------------------------------------------
  const sharpCandles = !candleSizePass;
  const passCount = [candleSizePass, overlapPass, volumePass, emaPass].filter(
    Boolean
  ).length;

  let verdict, color, summary;
  if (sharpCandles || volumeElevated || emaDeclining) {
    verdict = 'AVOID';
    color = 'red';
    const reasons = [];
    if (sharpCandles) reasons.push('sharp candles (large range)');
    if (volumeElevated) reasons.push('elevated volume (distribution)');
    if (emaDeclining) reasons.push('EMA50 flat or declining');
    summary = reasons.join(', ');
  } else if (passCount === 4) {
    verdict = 'BUY SETUP';
    color = 'green';
    summary = 'small candles, buyers absorbing dips, calm volume, uptrend intact';
  } else {
    verdict = 'NOT YET';
    color = 'yellow';
    const missing = [];
    if (!overlapPass) missing.push('buyers not yet absorbing the dip');
    if (!volumePass) missing.push('volume not yet drying up');
    summary = missing.length
      ? `${missing.join(', ')} — needs more time`
      : 'setup forming — needs more time';
  }

  const signals = {
    candleSize: {
      label: 'Small candles',
      pass: candleSizePass,
      value: `recent avg range ${recentRange.toFixed(2)} vs 60d ${baselineRange.toFixed(2)}`,
      detail: `${((recentRange / baselineRange) * 100).toFixed(0)}% of baseline (want <80%)`,
    },
    candleOverlap: {
      label: 'Buyers absorbing dip',
      pass: overlapPass,
      value:
        redCount > 0
          ? `${recoveredCount}/${redCount} red candles recovered by a later green close`
          : 'no red candles in the pullback window',
      detail: "green candle closes above red candle's open (want ≥50% of red candles recovered)",
    },
    volumeTrend: {
      label: 'Declining volume',
      pass: volumePass,
      value: `pullback vol ${Math.round(pullbackVol).toLocaleString()} vs 20d ${Math.round(avg20).toLocaleString()}`,
      detail: `${((pullbackVol / avg20) * 100).toFixed(0)}% of 20d avg (want <80%; >100% = distribution)`,
    },
    emaDirection: {
      label: 'EMA50 rising',
      pass: emaPass,
      value:
        e0 != null && e5 != null && e10 != null
          ? `today ${e0.toFixed(2)} · 5d ${e5.toFixed(2)} · 10d ${e10.toFixed(2)}`
          : 'insufficient EMA history',
      detail: 'today > 5d ago > 10d ago',
    },
  };

  return { verdict, color, summary, signals };
}

module.exports = {
  pullbackVerdict,
  CONST: {
    BASELINE_WINDOW,
    PULLBACK_WINDOW,
    VOLUME_AVG_WINDOW,
    RED_LOOKBACK,
    CANDLE_SIZE_MAX,
    RED_RECOVERY_MIN,
    VOL_GOOD,
    VOL_ELEVATED,
  },
};
