// verdict.test.js — Phase 2 Pullback Verdict (RULES.md §4).
//
// Each scenario builds 60 bars (53 calm "baseline" days + 7 controlled
// "pullback" days) so every one of the four checks can be pinned to a known
// pass/fail independently, then asserts the verdict AND the individual
// signal breakdown. Numbers are derived by hand in comments so a failure here
// points at exactly which threshold moved.

const { pullbackVerdict } = require('../scripts/verdict');
const { makeSuite } = require('./harness');
const { baselineBars, pullbackBars, risingEma, decliningEma } = require('./helpers');

const N = 60;
const BASE_COUNT = 53;
const PULLBACK_COUNT = 7;

function scenario({ pullback, ema }) {
  const bars = [...baselineBars(BASE_COUNT), ...pullbackBars(PULLBACK_COUNT, { startIndex: BASE_COUNT, ...pullback })];
  return pullbackVerdict(bars, ema);
}

function run() {
  const t = makeSuite('verdict');

  // --- TEST A: all four signals pass -> BUY SETUP -----------------------------
  // baselineRange = (53*2.0 + 7*0.6)/60 = 1.837; recentRange = 0.6 < 0.8*1.837 -> pass
  // overlap: mids all 100 -> bodies identical -> 6/6 pairs overlap -> pass
  // avg20 = (13*5,000,000 + 7*2,500,000)/20 = 4,125,000; redDays mean = 2,500,000
  //   2,500,000 < 0.8*4,125,000=3,300,000 -> pass, and not > avg20 -> not elevated
  // ema: rising array -> e0=101.8 > e5=100.8 > e10=99.8 -> pass
  {
    const r = scenario({
      pullback: { mids: 100, range: 0.6, volume: 2_500_000, red: true },
      ema: risingEma(N),
    });
    t.check('A: all 4 pass -> BUY SETUP', r.verdict === 'BUY SETUP');
    t.check('A: color green', r.color === 'green');
    t.check('A: candleSize signal passes', r.signals.candleSize.pass === true);
    t.check('A: candleOverlap signal passes', r.signals.candleOverlap.pass === true);
    t.check('A: volumeTrend signal passes', r.signals.volumeTrend.pass === true);
    t.check('A: emaDirection signal passes', r.signals.emaDirection.pass === true);
  }

  // --- TEST B: sharp candles alone -> AVOID -----------------------------------
  // pullback range=5.0: baselineRange=(53*2.0+7*5.0)/60=2.35; recentRange=5.0
  //   5.0 < 0.8*2.35=1.88 is FALSE -> candleSize fails -> sharpCandles=true
  // overlap/volume/ema left "good" (same as A) to isolate this as the sole trigger.
  {
    const r = scenario({
      pullback: { mids: 100, range: 5.0, volume: 2_500_000, red: true },
      ema: risingEma(N),
    });
    t.check('B: sharp candles alone -> AVOID', r.verdict === 'AVOID');
    t.check('B: color red', r.color === 'red');
    t.check('B: candleSize signal fails', r.signals.candleSize.pass === false);
    t.check('B: other 3 signals still pass (isolated trigger)',
      r.signals.candleOverlap.pass && r.signals.volumeTrend.pass && r.signals.emaDirection.pass);
  }

  // --- TEST C: elevated volume alone -> AVOID ---------------------------------
  // pullback volume=7,500,000 (1.5x baseline 5,000,000):
  //   avg20=(13*5,000,000+7*7,500,000)/20=5,875,000; redDays mean=7,500,000
  //   7,500,000 > 5,875,000 -> volumeElevated=true. Range/overlap/EMA stay "good".
  {
    const r = scenario({
      pullback: { mids: 100, range: 0.6, volume: 7_500_000, red: true },
      ema: risingEma(N),
    });
    t.check('C: elevated volume alone -> AVOID', r.verdict === 'AVOID');
    t.check('C: volumeTrend signal fails', r.signals.volumeTrend.pass === false);
    t.check('C: candleSize/overlap/ema still pass (isolated trigger)',
      r.signals.candleSize.pass && r.signals.candleOverlap.pass && r.signals.emaDirection.pass);
  }

  // --- TEST D: declining EMA50 alone -> AVOID ---------------------------------
  // decliningEma: e0=98.2 < e5=99.2 < e10=100.2 -> emaPass=false -> emaDeclining=true.
  {
    const r = scenario({
      pullback: { mids: 100, range: 0.6, volume: 2_500_000, red: true },
      ema: decliningEma(N),
    });
    t.check('D: declining EMA50 alone -> AVOID', r.verdict === 'AVOID');
    t.check('D: emaDirection signal fails', r.signals.emaDirection.pass === false);
    t.check('D: candleSize/overlap/volume still pass (isolated trigger)',
      r.signals.candleSize.pass && r.signals.candleOverlap.pass && r.signals.volumeTrend.pass);
  }

  // --- TEST I/J: overlap boundary granularity (break-and-confirm-red finding) --
  // With PULLBACK_WINDOW=7 (6 consecutive pairs), achievable overlap fractions
  // are quantized to multiples of 1/6 (~16.7%): 0, 16.7, 33, 50, 66.7, 83, 100%.
  // There is NO achievable fraction strictly between 50% and 66.7%, so no test
  // built on this window can distinguish OVERLAP_MIN=0.6 from any other value
  // in (0.5, 0.667) — confirmed by intentionally changing OVERLAP_MIN to 0.5 and
  // finding zero tests went red. That's a structural granularity limit, not a
  // gap that more tests can close without shortening PULLBACK_WINDOW. What IS
  // meaningfully testable: the strict-inequality direction at the nearest
  // achievable fractions either side of 0.6.
  {
    // Exactly 4/6 overlapping pairs (mids: 100,100,100,200,200,200,100) -> 66.7%,
    // the nearest achievable fraction ABOVE 0.6 -> must pass.
    const r = scenario({
      pullback: { mids: [100, 100, 100, 200, 200, 200, 100], range: 0.6, volume: 2_500_000, red: true },
      ema: risingEma(N),
    });
    t.check('I: 4/6 (66.7%) overlap, nearest achievable fraction above 0.6 -> passes', r.signals.candleOverlap.pass === true);
    t.check('I: overlap count reported as 4/6', r.signals.candleOverlap.value === '4/6 body pairs overlap');
  }
  {
    // Exactly 3/6 overlapping pairs (mids: 100,100,200,200,300,300,400) -> 50%,
    // the nearest achievable fraction AT/BELOW 0.6 -> must fail (strict >).
    const r = scenario({
      pullback: { mids: [100, 100, 200, 200, 300, 300, 400], range: 0.6, volume: 2_500_000, red: true },
      ema: risingEma(N),
    });
    t.check('J: 3/6 (50%) overlap -> fails (not strictly greater than 0.6)', r.signals.candleOverlap.pass === false);
    t.check('J: overlap count reported as 3/6', r.signals.candleOverlap.value === '3/6 body pairs overlap');
  }

  // --- TEST E: literal "exactly 2 of 4" -> NOT YET ----------------------------
  // mids alternate [95,105]: bodies never intersect -> overlap fails.
  // volume mult 0.9 lands in the 80-100% neutral band (neither good nor elevated):
  //   avg20=(13*5,000,000+7*4,500,000)/20=4,825,000; redDays mean=4,500,000
  //   4,500,000 is not <3,860,000 (fail "good") and not >4,825,000 (not elevated).
  // candleSize + EMA stay good -> passCount = 2 (candleSize, ema).
  {
    const r = scenario({
      pullback: { mids: [95, 105], range: 0.6, volume: 4_500_000, red: true },
      ema: risingEma(N),
    });
    t.check('E: exactly 2 of 4 pass -> NOT YET', r.verdict === 'NOT YET');
    t.check('E: color yellow', r.color === 'yellow');
    t.check('E: candleOverlap fails', r.signals.candleOverlap.pass === false);
    t.check('E: volumeTrend fails (neutral band, not elevated)', r.signals.volumeTrend.pass === false);
    t.check('E: no AVOID trigger fired', r.verdict !== 'AVOID');
  }

  // --- TEST F: 3 of 4 pass, no AVOID trigger -> NOT YET (catch-all) ----------
  // Same non-overlapping mids as E, but volume back to the "good" 0.5x band.
  // This is the confirmed interpretation of RULES §4's ambiguous "exactly 2 of 4"
  // wording: any non-AVOID case that isn't a clean 4-of-4 lands in NOT YET.
  {
    const r = scenario({
      pullback: { mids: [95, 105], range: 0.6, volume: 2_500_000, red: true },
      ema: risingEma(N),
    });
    t.check('F: 3 of 4 pass (only overlap fails) -> NOT YET, not AVOID', r.verdict === 'NOT YET');
    t.check('F: candleSize/volume/ema all pass', r.signals.candleSize.pass && r.signals.volumeTrend.pass && r.signals.emaDirection.pass);
    t.check('F: only overlap fails', r.signals.candleOverlap.pass === false);
  }

  // --- TEST G: no red days in the pullback -> falls back to window mean ------
  // All pullback candles green (red:false): the "red day" pool (last 10 bars =
  // 3 baseline + 7 pullback) is empty since baseline is also green, so
  // pullbackVol must fall back to mean(last 7 bars) instead of NaN from an
  // empty-array mean. mult 0.3 keeps it clearly "good".
  {
    const r = scenario({
      pullback: { mids: 100, range: 0.6, volume: 1_500_000, red: false },
      ema: risingEma(N),
    });
    t.check('G: fallback volume calc produced a real boolean, not NaN-derived', r.signals.volumeTrend.pass === true || r.signals.volumeTrend.pass === false);
    t.check('G: fallback volume reads as good (well below 20d avg)', r.signals.volumeTrend.pass === true);
    t.check('G: no NaN leaks into any signal text', !/NaN/.test(JSON.stringify(r.signals)));
    t.check('G: falls through to BUY SETUP (all 4 pass via fallback)', r.verdict === 'BUY SETUP');
  }

  // --- TEST H: null EMA50 entries (Phase 0 gap-fill) --------------------------
  // Real scenario: a newly-listed stock without a full 60-day EMA50 warmup —
  // ema()/rsi() in indicators.js return `null` for entries before the seed
  // period. verdict.js's e0/e5/e10 null-guard (line ~79) must degrade this to
  // "EMA check fails, no crash" rather than NaN comparisons or a throw.
  {
    const emaWithGap = risingEma(N);
    emaWithGap[N - 11] = null; // the "10 days ago" reading is missing
    let r = null;
    let threw = null;
    try {
      r = scenario({ pullback: { mids: 100, range: 0.6, volume: 2_500_000, red: true }, ema: emaWithGap });
    } catch (e) {
      threw = e;
    }
    t.check('H: null EMA entry does not throw', threw === null);
    if (r) {
      t.check('H: emaDirection signal fails gracefully when e10 is null', r.signals.emaDirection.pass === false);
      t.check('H: emaDirection value reports insufficient history', r.signals.emaDirection.value === 'insufficient EMA history');
      t.check("H: verdict is not BUY SETUP (a failing signal can't produce a clean 4-of-4)", r.verdict !== 'BUY SETUP');
      t.check('H: verdict still classifies as one of the two remaining valid values', ['AVOID', 'NOT YET'].includes(r.verdict));
    } else {
      t.check('H: emaDirection signal fails gracefully when e10 is null', false);
      t.check('H: emaDirection value reports insufficient history', false);
      t.check("H: verdict is not BUY SETUP (a failing signal can't produce a clean 4-of-4)", false);
      t.check('H: verdict still classifies as one of the two remaining valid values', false);
    }
  }
  {
    // Same, but the "5 days ago" reading is the missing one instead of "10 days ago".
    const emaWithGap = risingEma(N);
    emaWithGap[N - 6] = null;
    let r = null;
    let threw = null;
    try {
      r = scenario({ pullback: { mids: 100, range: 0.6, volume: 2_500_000, red: true }, ema: emaWithGap });
    } catch (e) {
      threw = e;
    }
    t.check('H2: null at e5 also degrades gracefully, no throw', threw === null);
    t.check('H2: emaDirection signal fails', r ? r.signals.emaDirection.pass === false : false);
  }

  // --- Signal breakdown shape (always present, RULES §4 "always show") ------
  {
    const r = scenario({ pullback: { mids: 100, range: 0.6, volume: 2_500_000, red: true }, ema: risingEma(N) });
    for (const key of ['candleSize', 'candleOverlap', 'volumeTrend', 'emaDirection']) {
      const s = r.signals[key];
      t.check(`signals.${key} has label/pass/value/detail`, typeof s.label === 'string' && typeof s.pass === 'boolean' && typeof s.value === 'string' && typeof s.detail === 'string');
    }
    t.check('summary is a non-empty string', typeof r.summary === 'string' && r.summary.length > 0);
  }

  // --- Guard rails -------------------------------------------------------------
  t.throws('throws with fewer than 60 bars', () => {
    const bars = [...baselineBars(BASE_COUNT), ...pullbackBars(PULLBACK_COUNT - 1, { startIndex: BASE_COUNT })];
    pullbackVerdict(bars, risingEma(N - 1));
  });
  t.throws('throws when ema50 length does not match bars length', () => {
    const bars = [...baselineBars(BASE_COUNT), ...pullbackBars(PULLBACK_COUNT, { startIndex: BASE_COUNT })];
    pullbackVerdict(bars, risingEma(N - 1)); // one short
  });

  return t.summary();
}

if (require.main === module) {
  const { failed } = run();
  process.exit(failed ? 1 : 0);
}

module.exports = { run };
