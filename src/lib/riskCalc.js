// riskCalc.js — Position sizing / suggested stop (RULES.md §5, spec §3.6).
// Pure, computed client-side from data already in data.json (RULES §6:
// "Position sizing computed client-side") — never recomputes price/EMA
// indicators, only combines numbers already shipped by the nightly refresh.

const EMA50_STOP_PCT = 0.015; // EMA50 support stop = EMA50 - 1.5%
const SWING_LOW_LOOKBACK = 10; // last 10 trading days
const WIDE_STOP_PCT = 0.08; // stop >8% below entry -> warn (>= treated as the boundary, inclusive of the warning)

export const WIDE_STOP_WARNING = 'Wide stop — position size reduced or setup may be too volatile.';

/**
 * @param {{ price: number, ema50: number, bars: Array<{low:number}> }} r a passing result row
 * @param {{ accountSize?: number, riskPct?: number }} opts account size in $ (default 5000), risk % of account per trade (default 1, meaning 1%)
 * @returns {object} plan — see `valid` field: false means riskPerShare <= 0, calculator should show a disabled/explanatory state instead of the numbers.
 */
export function computeRiskPlan(r, { accountSize = 5000, riskPct = 1 } = {}) {
  const entry = r.price;

  const lookback = r.bars.slice(-Math.min(SWING_LOW_LOOKBACK, r.bars.length));
  const swingLow = Math.min(...lookback.map((b) => b.low));
  const ema50Stop = r.ema50 * (1 - EMA50_STOP_PCT);

  // Tie (equal to the cent) goes to swing low — an arbitrary but deterministic
  // choice; RULES doesn't specify a tiebreak and an exact tie is effectively
  // never reachable with real floating-point prices.
  const stopBasis = swingLow <= ema50Stop ? 'swing low' : 'EMA50 support';
  const stop = Math.min(swingLow, ema50Stop);

  const riskPerShare = entry - stop;
  if (riskPerShare <= 0) {
    return { valid: false, entry, stop, stopBasis };
  }

  const safeAccountSize = Math.max(0, accountSize);
  const safeRiskPct = Math.max(0, riskPct);
  const maxDollarRisk = safeAccountSize * (safeRiskPct / 100);
  const shares = Math.floor(maxDollarRisk / riskPerShare);
  const capitalRequired = shares * entry;
  const wideStop = (entry - stop) / entry >= WIDE_STOP_PCT;

  return { valid: true, entry, stop, stopBasis, riskPerShare, maxDollarRisk, shares, capitalRequired, wideStop };
}
