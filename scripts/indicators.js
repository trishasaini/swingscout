// indicators.js — SwingScout reference indicator implementations
// CRITICAL: these must match TradingView / standard charting conventions exactly.
// Every hard filter and verdict depends on EMA50 and RSI(14) being correct.

/**
 * Exponential Moving Average.
 * Standard convention (TradingView, Alpha Vantage EMA endpoint):
 *   - Seed with the SMA of the first `period` values.
 *   - Then apply EMA = close * k + prevEMA * (1 - k), where k = 2/(period+1).
 * This is NOT a simple moving average. Section 8 of the spec forbids SMA here.
 *
 * @param {number[]} closes - chronological closing prices (oldest first)
 * @param {number} period
 * @returns {number[]} EMA series, aligned to closes; entries before the seed are null
 */
function ema(closes, period) {
  if (closes.length < period) {
    throw new Error(`Need >= ${period} closes for EMA(${period}), got ${closes.length}`);
  }
  const k = 2 / (period + 1);
  const out = new Array(closes.length).fill(null);

  // Seed = SMA of first `period` closes
  let seed = 0;
  for (let i = 0; i < period; i++) seed += closes[i];
  seed /= period;
  out[period - 1] = seed;

  let prev = seed;
  for (let i = period; i < closes.length; i++) {
    prev = closes[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/**
 * Relative Strength Index using Wilder's smoothing (RSI-14 as on TradingView).
 * This is the correct method. A common bug is using a plain average of gains/losses
 * over the window (that gives Cutler's RSI and reads differently).
 *
 * Method:
 *   - First avgGain/avgLoss = simple mean of gains/losses over first `period` deltas.
 *   - Then Wilder smoothing: avg = (prevAvg * (period-1) + current) / period.
 *   - RS = avgGain / avgLoss; RSI = 100 - 100/(1+RS).
 *
 * @param {number[]} closes - chronological closes (oldest first)
 * @param {number} period - default 14
 * @returns {number[]} RSI series aligned to closes; entries before first value are null
 */
function rsi(closes, period = 14) {
  if (closes.length < period + 1) {
    throw new Error(`Need >= ${period + 1} closes for RSI(${period}), got ${closes.length}`);
  }
  const out = new Array(closes.length).fill(null);

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gainSum += diff;
    else lossSum += -diff;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/**
 * Extension above EMA50, per spec: ((price - ema50) / ema50) * 100.
 * Negative result = price below EMA50 = fail.
 */
function extensionPct(price, ema50Value) {
  return ((price - ema50Value) / ema50Value) * 100;
}

module.exports = { ema, rsi, extensionPct };
