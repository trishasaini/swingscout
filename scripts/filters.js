// filters.js — the Six Hard Filters (RULES.md §1 / spec §2.2, §8).
//
// Applied in order. Fail any one = reject. No rounding, no "close enough".
//
// Floating-point note: decisions are made on the RAW computed values, not on
// rounded ones. The rule granularity is 0.1 (10.0 passes, 10.1 fails; 50.0
// passes, 50.1 fails). We guard the inclusive boundaries with EPS = 1e-9 — far
// below 0.1 — purely to absorb IEEE-754 dust so a genuine 10.0 that computes to
// 10.0000000001 still passes. This never turns a real out-of-band value into a
// pass. (Flagged to the user as an interpretation of "no rounding".)

const EPS = 1e-9;

const LIMITS = {
  PRICE_MIN: 20.0,
  PRICE_MAX: 200.0,
  BETA_MIN: 1.2, // strictly greater than
  VOLUME_MIN: 1_000_000, // strictly greater than
  EXT_MIN: 0.0,
  EXT_MAX: 10.0,
  RSI_MIN: 38.0,
  RSI_MAX: 50.0,
  EARNINGS_MIN_DAYS: 14, // earnings within 14 calendar days (<=14) = fail
};

/**
 * A stock with Beta < 1.2 must not be displayed at all (RULES §1) — not shown
 * as FAIL, just excluded. Beta exactly 1.2 is a FAIL (filter #2 is strictly
 * ">") but is NOT excluded, so it can surface in the rejected list.
 *
 * Unknown/missing beta is NOT decided here; refresh.js routes it to errors[].
 */
function isExcludedByBeta(beta) {
  return typeof beta === 'number' && beta < LIMITS.BETA_MIN;
}

/**
 * Evaluate all six hard filters.
 * @param {object} m metrics: { price, beta, avgVolume, extensionPct, rsi, daysToEarnings }
 *   daysToEarnings === null means no upcoming earnings on the calendar (pass).
 * @returns {{ passed:boolean, checks:object, failReason:(string|null) }}
 */
function evaluateFilters(m) {
  const checks = {
    price:
      m.price >= LIMITS.PRICE_MIN - EPS && m.price <= LIMITS.PRICE_MAX + EPS,
    beta: m.beta > LIMITS.BETA_MIN + EPS,
    volume: m.avgVolume > LIMITS.VOLUME_MIN, // integer share counts; no EPS needed
    extension:
      m.extensionPct >= LIMITS.EXT_MIN - EPS &&
      m.extensionPct <= LIMITS.EXT_MAX + EPS,
    rsi: m.rsi >= LIMITS.RSI_MIN - EPS && m.rsi <= LIMITS.RSI_MAX + EPS,
    earnings:
      m.daysToEarnings === null ||
      m.daysToEarnings === undefined ||
      m.daysToEarnings > LIMITS.EARNINGS_MIN_DAYS,
  };

  // Report the first failure in rule order for a human-readable reason.
  const order = [
    ['price', `Price $${fmt(m.price)} outside $20–$200`],
    ['beta', `Beta ${fmt(m.beta)} not above 1.2`],
    ['volume', `Avg volume ${Math.round(m.avgVolume).toLocaleString()} not above 1M`],
    ['extension', `Extension ${fmt(m.extensionPct)}% outside 0–10%`],
    ['rsi', `RSI ${fmt(m.rsi)} outside 38–50`],
    ['earnings', `Earnings in ${m.daysToEarnings} day(s) (≤14)`],
  ];
  let failReason = null;
  for (const [key, msg] of order) {
    if (!checks[key]) {
      failReason = msg;
      break;
    }
  }

  return { passed: failReason === null, checks, failReason };
}

function fmt(n) {
  return typeof n === 'number' ? n.toFixed(2) : String(n);
}

module.exports = { LIMITS, isExcludedByBeta, evaluateFilters };
