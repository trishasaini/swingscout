// fixtures.js — data.json-shaped fixtures for frontend tests. Field names
// mirror scripts/refresh.js's assemble()/scoreTicker() output exactly, so a
// drift between the real pipeline's shape and what the UI expects would show
// up as a broken render in these tests, not just a passing-in-isolation mock.

export function makeSignal(overrides = {}) {
  return {
    label: 'Small candles',
    pass: true,
    value: 'recent avg range 0.60 vs 60d 1.84',
    detail: '33% of baseline (want <80%)',
    ...overrides,
  };
}

export function makeResult(overrides = {}) {
  return {
    ticker: 'AAPL',
    name: 'Apple Inc.',
    price: 123.45,
    ema50: 120.0,
    ema20: 121.0,
    extensionPct: 2.88,
    rsi: 44.5,
    beta: 1.8,
    avgVolume: 5_000_000,
    daysToEarnings: 30,
    filterChecks: { price: true, beta: true, volume: true, extension: true, rsi: true, earnings: true },
    verdict: 'BUY SETUP',
    verdictColor: 'green',
    verdictSummary: 'small candles, calm volume, uptrend intact',
    signals: {
      candleSize: makeSignal({ label: 'Small candles', pass: true }),
      candleOverlap: makeSignal({ label: 'Overlapping candles', pass: true, value: '6/6 body pairs overlap', detail: '100% overlap (want >60%)' }),
      volumeTrend: makeSignal({ label: 'Declining volume', pass: true, value: 'pullback vol 2,500,000 vs 20d 4,125,000', detail: '61% of 20d avg (want <80%; >100% = distribution)' }),
      emaDirection: makeSignal({ label: 'EMA50 rising', pass: true, value: 'today 101.80 · 5d 100.80 · 10d 99.80', detail: 'today > 5d ago > 10d ago' }),
    },
    bars: [],
    series: { ema50: [], ema20: [], rsi: [] },
    ...overrides,
  };
}

// A NOT YET fixture — deliberately gives a couple of the four signals pass:false
// so BreakdownTable's fail-state styling/marks are exercised too, not just all-pass.
export function makeNotYetResult(overrides = {}) {
  return makeResult({
    ticker: 'MSFT',
    name: 'Microsoft Corp.',
    verdict: 'NOT YET',
    verdictColor: 'yellow',
    verdictSummary: 'candles not yet consolidating — needs more time',
    signals: {
      candleSize: makeSignal({ pass: true }),
      candleOverlap: makeSignal({ label: 'Overlapping candles', pass: false, value: '0/6 body pairs overlap', detail: '0% overlap (want >60%)' }),
      volumeTrend: makeSignal({ label: 'Declining volume', pass: false, value: 'pullback vol 4,500,000 vs 20d 4,825,000', detail: '93% of 20d avg (want <80%; >100% = distribution)' }),
      emaDirection: makeSignal({ pass: true }),
    },
    ...overrides,
  });
}

export function makeAvoidResult(overrides = {}) {
  return makeResult({
    ticker: 'NVDA',
    name: 'NVIDIA Corp.',
    verdict: 'AVOID',
    verdictColor: 'red',
    verdictSummary: 'sharp candles (large range)',
    signals: {
      candleSize: makeSignal({ pass: false, value: 'recent avg range 5.00 vs 60d 2.35', detail: '213% of baseline (want <80%)' }),
      candleOverlap: makeSignal({ pass: true }),
      volumeTrend: makeSignal({ pass: true }),
      emaDirection: makeSignal({ pass: true }),
    },
    ...overrides,
  });
}

export function makeRejected(overrides = {}) {
  return {
    ticker: 'ZS',
    name: 'Zscaler Inc.',
    price: 118.95,
    ema50: 126.87,
    ema20: 125.94,
    extensionPct: -6.24,
    rsi: 19.83,
    beta: 1.81,
    avgVolume: 27_184_330,
    daysToEarnings: 68,
    filterChecks: { price: true, beta: true, volume: true, extension: false, rsi: false, earnings: true },
    failReason: 'Extension -6.24% outside 0–10%',
    ...overrides,
  };
}

export function makeExcluded(overrides = {}) {
  return { ticker: 'TSM', name: 'Taiwan Semiconductor', beta: 1.08, ...overrides };
}

export function makeError(overrides = {}) {
  return { ticker: 'XYZ', name: 'XYZ Corp', reason: 'polygon returned no bars', ...overrides };
}

// dataAsOf defaults to "today" (computed at call time, not a fixed date) so
// this fixture never drifts into accidentally-stale territory as real time
// passes — StalenessWarning compares against the real Date.now() with no
// injectable seam, so a hardcoded past date here would eventually start
// failing tests that don't even care about staleness. Tests that DO want to
// exercise staleness pass an explicit relative-to-now override.
function today() {
  return new Date().toISOString().slice(0, 10);
}

export function makeData(overrides = {}) {
  return {
    generatedAt: '2026-08-16T02:00:00.000Z',
    dataAsOf: today(),
    demo: false,
    marketHealth: null,
    universeCount: 75,
    counts: { passed: 1, rejected: 1, excludedLowBeta: 1, errors: 0 },
    results: [makeResult()],
    rejected: [makeRejected()],
    excludedLowBeta: [makeExcluded()],
    errors: [],
    ...overrides,
  };
}
