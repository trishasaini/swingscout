// filters.test.js — the Six Hard Filters (RULES.md §1), boundary-exact.
//
// Every number here is taken directly from the RULES.md table: pass at the
// inclusive edge, fail one tick past it. No rounding, no "close enough" — a
// regression here means a live trading rule silently drifted.

const { isExcludedByBeta, evaluateFilters, LIMITS } = require('../scripts/filters');
const { makeSuite } = require('./harness');

function run() {
  const t = makeSuite('filters');

  // Base metrics that pass all six filters; each test perturbs one field.
  const basePass = {
    price: 100,
    beta: 1.8,
    avgVolume: 5_000_000,
    extensionPct: 5.0,
    rsi: 44.0,
    daysToEarnings: 30,
  };
  t.check('sanity: basePass passes all filters', evaluateFilters(basePass).passed);

  // --- Filter 1: Price $20.00–$200.00 inclusive -----------------------------
  t.check('price 20.00 passes (lower inclusive edge)', evaluateFilters({ ...basePass, price: 20.0 }).passed);
  t.check('price 19.99 fails (below edge)', !evaluateFilters({ ...basePass, price: 19.99 }).passed);
  t.check('price 200.00 passes (upper inclusive edge)', evaluateFilters({ ...basePass, price: 200.0 }).passed);
  t.check('price 200.01 fails (above edge)', !evaluateFilters({ ...basePass, price: 200.01 }).passed);
  t.check('price 13.50 (NOK example, RULES §8) fails', !evaluateFilters({ ...basePass, price: 13.5 }).passed);

  // --- Filter 2: Beta > 1.2 (strict) -----------------------------------------
  t.check('beta 1.8 passes', evaluateFilters({ ...basePass, beta: 1.8 }).passed);
  t.check('beta exactly 1.2 fails (strict >)', !evaluateFilters({ ...basePass, beta: 1.2 }).passed);
  t.check('beta 1.1 fails', !evaluateFilters({ ...basePass, beta: 1.1 }).passed);
  t.check('beta 1.2001 passes (just above)', evaluateFilters({ ...basePass, beta: 1.2001 }).passed);

  // --- Filter 3: Avg volume > 1,000,000 (strict) ------------------------------
  t.check('volume 5M passes', evaluateFilters({ ...basePass, avgVolume: 5_000_000 }).passed);
  t.check('volume exactly 1,000,000 fails (strict >)', !evaluateFilters({ ...basePass, avgVolume: 1_000_000 }).passed);
  t.check('volume 999,999 fails', !evaluateFilters({ ...basePass, avgVolume: 999_999 }).passed);
  t.check('volume 1,000,001 passes', evaluateFilters({ ...basePass, avgVolume: 1_000_001 }).passed);

  // --- Filter 4: EMA50 extension 0.0%–10.0% inclusive -------------------------
  t.check('extension 0.0% passes (lower inclusive edge)', evaluateFilters({ ...basePass, extensionPct: 0.0 }).passed);
  t.check('extension -0.1% fails (below EMA50)', !evaluateFilters({ ...basePass, extensionPct: -0.1 }).passed);
  t.check('extension 10.0% passes (upper inclusive edge)', evaluateFilters({ ...basePass, extensionPct: 10.0 }).passed);
  t.check('extension 10.1% fails (above edge)', !evaluateFilters({ ...basePass, extensionPct: 10.1 }).passed);
  t.check('extension -25% (broken trend) fails', !evaluateFilters({ ...basePass, extensionPct: -25 }).passed);

  // --- Filter 5: RSI 38.0–50.0 inclusive ---------------------------------------
  t.check('RSI 38.0 passes (lower inclusive edge)', evaluateFilters({ ...basePass, rsi: 38.0 }).passed);
  t.check('RSI 37.9 fails (below edge)', !evaluateFilters({ ...basePass, rsi: 37.9 }).passed);
  t.check('RSI 50.0 passes (upper inclusive edge)', evaluateFilters({ ...basePass, rsi: 50.0 }).passed);
  t.check('RSI 50.1 fails (above edge)', !evaluateFilters({ ...basePass, rsi: 50.1 }).passed);
  t.check('RSI 68 (overbought) fails', !evaluateFilters({ ...basePass, rsi: 68 }).passed);

  // --- Filter 6: no earnings within 14 calendar days ---------------------------
  t.check('earnings in 45 days passes', evaluateFilters({ ...basePass, daysToEarnings: 45 }).passed);
  t.check('earnings in 15 days passes (just outside window)', evaluateFilters({ ...basePass, daysToEarnings: 15 }).passed);
  t.check('earnings in exactly 14 days fails (boundary is inclusive-fail)', !evaluateFilters({ ...basePass, daysToEarnings: 14 }).passed);
  t.check('earnings in 10 days fails', !evaluateFilters({ ...basePass, daysToEarnings: 10 }).passed);
  t.check('earnings today (0 days) fails', !evaluateFilters({ ...basePass, daysToEarnings: 0 }).passed);
  t.check('no earnings scheduled (null) passes', evaluateFilters({ ...basePass, daysToEarnings: null }).passed);
  t.check('no earnings scheduled (undefined) passes', evaluateFilters({ ...basePass, daysToEarnings: undefined }).passed);
  t.check(
    'a great chart with earnings in 10 days still fails regardless (RULES §1)',
    !evaluateFilters({ price: 50, beta: 2.0, avgVolume: 10_000_000, extensionPct: 2.0, rsi: 42, daysToEarnings: 10 }).passed
  );

  // --- isExcludedByBeta: hidden entirely, distinct from "shown as FAIL" -------
  t.check('beta 1.19 is excluded (hidden, not just failed)', isExcludedByBeta(1.19));
  t.check('beta exactly 1.2 is NOT excluded (fails filter #2 but is shown)', !isExcludedByBeta(1.2));
  t.check('beta 1.21 is NOT excluded', !isExcludedByBeta(1.21));
  t.check('beta 0.9 is excluded', isExcludedByBeta(0.9));

  // --- evaluateFilters: first failure reported in rule order -------------------
  {
    // Both price AND beta fail here; rule order (RULES §1 table) says price is
    // checked first, so failReason must name price, not beta.
    const { failReason } = evaluateFilters({ ...basePass, price: 10, beta: 0.5 });
    t.check('failReason reports the FIRST rule-order failure (price before beta)', /Price/.test(failReason));
  }
  {
    const { failReason } = evaluateFilters({ ...basePass, rsi: 60 });
    t.check('failReason names the actual failing filter (RSI)', /RSI/.test(failReason));
  }
  t.check('failReason is null when all filters pass', evaluateFilters(basePass).failReason === null);

  // --- evaluateFilters: full order-matrix (Phase 0 gap-fill) --------------------
  // Six filters, each failing ALONE (all others still pass) — a regression that
  // silently reorders the internal `order` array would misname the failure here
  // even though each individual filter's pass/fail bit is still correct.
  {
    const singleFailures = [
      { field: 'price', value: 10, reasonPattern: /Price/, label: 'price' },
      { field: 'beta', value: 0.5, reasonPattern: /Beta/, label: 'beta' }, // 0.5 < 1.2, still > 0 so not beta-excluded logic path here
      { field: 'avgVolume', value: 500_000, reasonPattern: /volume/i, label: 'avgVolume' },
      { field: 'extensionPct', value: 15, reasonPattern: /Extension/, label: 'extensionPct' },
      { field: 'rsi', value: 70, reasonPattern: /RSI/, label: 'rsi' },
      { field: 'daysToEarnings', value: 5, reasonPattern: /[Ee]arnings/, label: 'daysToEarnings' },
    ];
    const checksKeyFor = { price: 'price', beta: 'beta', avgVolume: 'volume', extensionPct: 'extension', rsi: 'rsi', daysToEarnings: 'earnings' };
    for (const { field, value, reasonPattern, label } of singleFailures) {
      const m = { ...basePass, [field]: value };
      const { passed, checks, failReason } = evaluateFilters(m);
      t.check(`order-matrix: ${label} alone fails -> passed is false`, passed === false);
      t.check(`order-matrix: ${label} alone fails -> failReason names ${label}`, reasonPattern.test(failReason));
      const failingKey = checksKeyFor[field];
      t.check(`order-matrix: ${label} alone fails -> only checks.${failingKey} is false`, Object.entries(checks).every(([k, v]) => (k === failingKey ? v === false : v === true)));
    }
  }
  {
    // Rule-order pairs: when two adjacent-in-order filters both fail, the
    // EARLIER one in RULES.md's table must be reported, not the later one.
    // (price=1, beta=2, volume=3, extension=4, rsi=5, earnings=6)
    const pairs = [
      [{ price: 10, beta: 0.5 }, /Price/, 'price (1) before beta (2)'],
      [{ beta: 0.5, avgVolume: 500_000 }, /Beta/, 'beta (2) before volume (3)'],
      [{ avgVolume: 500_000, extensionPct: 15 }, /volume/i, 'volume (3) before extension (4)'],
      [{ extensionPct: 15, rsi: 70 }, /Extension/, 'extension (4) before rsi (5)'],
      [{ rsi: 70, daysToEarnings: 5 }, /RSI/, 'rsi (5) before earnings (6)'],
    ];
    for (const [overrides, pattern, label] of pairs) {
      const { failReason } = evaluateFilters({ ...basePass, ...overrides });
      t.check(`order-matrix pair: ${label}`, pattern.test(failReason));
    }
  }

  // --- isExcludedByBeta: direct boundary tests on missing/invalid input ---------
  // (Phase 0 gap-fill: previously only exercised indirectly through scoreTicker,
  // which intercepts missing beta before it ever reaches this function.)
  t.check('isExcludedByBeta(undefined) is false (not a silent low-beta exclusion)', isExcludedByBeta(undefined) === false);
  t.check('isExcludedByBeta(NaN) is false (NaN < 1.2 is false in JS, and typeof NaN is "number" so the guard alone would not catch it — must not silently exclude)', isExcludedByBeta(NaN) === false);
  t.check('isExcludedByBeta(null) is false', isExcludedByBeta(null) === false);
  t.check('isExcludedByBeta("0.9") (string) is false — must not coerce', isExcludedByBeta('0.9') === false);

  // --- checks object reports every filter independently, not just first-fail ---
  {
    const { checks } = evaluateFilters({ ...basePass, price: 10, rsi: 60 });
    t.check('checks.price is false', checks.price === false);
    t.check('checks.rsi is false', checks.rsi === false);
    t.check('checks.beta is still true (independent per-filter result)', checks.beta === true);
  }

  // --- LIMITS sanity: constants match RULES.md exactly --------------------------
  t.close('LIMITS.PRICE_MIN', LIMITS.PRICE_MIN, 20.0);
  t.close('LIMITS.PRICE_MAX', LIMITS.PRICE_MAX, 200.0);
  t.close('LIMITS.BETA_MIN', LIMITS.BETA_MIN, 1.2);
  t.check('LIMITS.VOLUME_MIN', LIMITS.VOLUME_MIN === 1_000_000);
  t.close('LIMITS.EXT_MIN', LIMITS.EXT_MIN, 0.0);
  t.close('LIMITS.EXT_MAX', LIMITS.EXT_MAX, 10.0);
  t.close('LIMITS.RSI_MIN', LIMITS.RSI_MIN, 38.0);
  t.close('LIMITS.RSI_MAX', LIMITS.RSI_MAX, 50.0);
  t.check('LIMITS.EARNINGS_MIN_DAYS', LIMITS.EARNINGS_MIN_DAYS === 14);

  return t.summary();
}

if (require.main === module) {
  const { failed } = run();
  process.exit(failed ? 1 : 0);
}

module.exports = { run };
