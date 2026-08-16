// test_indicators.js — verification against known-good values
const { ema, rsi, extensionPct } = require('./indicators');

let passed = 0, failed = 0;
function check(name, got, expected, tol = 0.01) {
  const ok = Math.abs(got - expected) <= tol;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: got ${got.toFixed(4)}, expected ${expected} (tol ${tol})`);
  ok ? passed++ : failed++;
}

// ---------------------------------------------------------------------------
// TEST 1: EMA sanity on a simple ramp.
// For a constant series, EMA must equal that constant.
const flat = new Array(60).fill(100);
const emaFlat = ema(flat, 50);
check('EMA(50) of constant 100', emaFlat[emaFlat.length - 1], 100, 1e-9);

// ---------------------------------------------------------------------------
// TEST 2: EMA against a manually verifiable short case, period 3.
// closes: [1,2,3,4,5]. Seed (SMA of first 3) = 2 at index 2.
// k = 2/4 = 0.5.  idx3 = 4*0.5 + 2*0.5 = 3.  idx4 = 5*0.5 + 3*0.5 = 4.
const small = [1, 2, 3, 4, 5];
const e3 = ema(small, 3);
check('EMA(3) idx2 seed', e3[2], 2, 1e-9);
check('EMA(3) idx3', e3[3], 3, 1e-9);
check('EMA(3) idx4', e3[4], 4, 1e-9);

// ---------------------------------------------------------------------------
// TEST 3: RSI against Wilder's canonical 14-period example (from
// "New Concepts in Technical Trading Systems", 1978). This closing series is
// the standard reference reproduced across TA libraries; the first RSI value
// (at index 14) is ~70.53, and the next (index 15) is ~66.32.
const wilder = [
  44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42,
  45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00,
];
const r = rsi(wilder, 14);
check('RSI(14) Wilder idx14', r[14], 70.53, 0.1);
check('RSI(14) Wilder idx15', r[15], 66.32, 0.3);

// ---------------------------------------------------------------------------
// TEST 4: RSI bounds — strictly rising series -> RSI = 100.
const rising = Array.from({ length: 20 }, (_, i) => 10 + i);
const rr = rsi(rising, 14);
check('RSI(14) monotonic rising', rr[rr.length - 1], 100, 1e-9);

// ---------------------------------------------------------------------------
// TEST 5: Extension math from spec example.
// Spec: extension 1.7% is a pass. Construct price/ema giving ~1.7%.
check('extension sign (below EMA)', extensionPct(95, 100), -5, 1e-9);
check('extension 7.2% example', extensionPct(107.2, 100), 7.2, 1e-9);

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
