// marketHealth.js — Market Health classifier (RULES.md §5 / spec §3.7).
//
// Advisory ONLY — never overrides stock filters (enforced by the caller:
// refresh.js adds this as a sibling field on the assembled data, it never
// touches filters.js/verdict.js or the results/rejected arrays).
//
// GREEN: QQQ above both EMA20 and EMA50.
// YELLOW: above exactly one of the two.
// RED: below both.
//
// Boundary interpretation (RULES doesn't specify equal-to-EMA explicitly):
// "above" is treated as strictly greater than, consistent with how every
// other strict RULES boundary in this project is handled (e.g. filters.js's
// beta/volume checks). QQQ price exactly equal to an EMA counts as NOT above
// that EMA — grouped with "below" for classification purposes.

const MESSAGES = {
  GREEN: 'Market supports swing entries.',
  YELLOW: 'Market is mixed — use smaller position size or wait for confirmation.',
  RED: 'Setup is valid, but market conditions are unfavorable.',
};

/**
 * @param {number} qqqPrice
 * @param {number} ema20
 * @param {number} ema50
 * @returns {{ status: 'GREEN'|'YELLOW'|'RED', message: string, qqqPrice: number, ema20: number, ema50: number }}
 */
function classifyMarketHealth(qqqPrice, ema20, ema50) {
  // Classification decisions use the RAW values; only the returned display
  // fields are rounded, consistent with scoreTicker() in refresh.js (filter
  // decisions there are also made pre-rounding).
  const aboveEma20 = qqqPrice > ema20;
  const aboveEma50 = qqqPrice > ema50;

  let status;
  if (aboveEma20 && aboveEma50) status = 'GREEN';
  else if (aboveEma20 || aboveEma50) status = 'YELLOW';
  else status = 'RED';

  return {
    status,
    message: MESSAGES[status],
    qqqPrice: round2(qqqPrice),
    ema20: round2(ema20),
    ema50: round2(ema50),
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { classifyMarketHealth, MESSAGES };
