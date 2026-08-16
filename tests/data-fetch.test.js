// data-fetch.test.js — "the data fetched": scoreTicker() and assemble() in
// scripts/refresh.js, the layer that turns raw bars + Beta + earnings into
// what data.json actually ships. No network calls here (fetchPolygonBars /
// fetchYfinanceMeta are excluded — those need live credentials); this tests
// the pure scoring/assembly logic that every fetched row passes through,
// plus the deterministic demo-data generators used for local development.

const { scoreTicker, assemble, round, demoBars, demoMeta, demoMarketHealth } = require('../scripts/refresh');
const { makeSuite } = require('./harness');

// ASML is a deterministic demo ticker (scripts/refresh.js's mulberry32 fixture
// generator) verified to pass all six hard filters as-is — confirmed by
// scanning the full watchlist rather than hand-tuning a synthetic series to
// hit the narrow RSI 38-50 / extension 0-10% intersection, which is fragile
// to derive by hand. Using the SAME generator the demo pipeline ships with
// means this test tracks reality if that generator ever changes.
const PASSING_TICKER = 'ASML';
const goodBars = () => demoBars(PASSING_TICKER);
const goodMeta = () => demoMeta(PASSING_TICKER);

function run() {
  const t = makeSuite('data-fetch');

  // --- scoreTicker: structural guards -----------------------------------------
  {
    const r = scoreTicker('XYZ', 'XYZ Corp', [], 1.5, 30);
    t.check('empty bars -> kind error', r.kind === 'error');
    t.check('error reason mentions insufficient bars', /insufficient bars/.test(r.reason));
  }
  {
    const shortBars = goodBars().slice(0, 50);
    const r = scoreTicker('XYZ', 'XYZ Corp', shortBars, 1.5, 30);
    t.check('too-few bars -> kind error', r.kind === 'error');
  }
  {
    const r = scoreTicker('XYZ', 'XYZ Corp', goodBars(), undefined, 30);
    t.check('missing beta (undefined) -> kind error, not a silent pass', r.kind === 'error');
    t.check('error reason names Beta', /Beta/.test(r.reason));
  }
  {
    const r = scoreTicker('XYZ', 'XYZ Corp', goodBars(), NaN, 30);
    t.check('NaN beta -> kind error', r.kind === 'error');
  }

  // --- scoreTicker: beta exclusion vs. beta fail (RULES §1) --------------------
  {
    const r = scoreTicker('XYZ', 'XYZ Corp', goodBars(), 0.9, 30);
    t.check('beta 0.9 (<1.2) -> kind excluded, never a displayed FAIL', r.kind === 'excluded');
    t.check('excluded row carries the beta value', r.beta === 0.9);
  }
  {
    // Beta exactly 1.2 fails filter #2 (strict >) but must NOT be excluded —
    // it should proceed through scoring and surface as rejected.
    const r = scoreTicker('XYZ', 'XYZ Corp', goodBars(), 1.2, 30);
    t.check('beta exactly 1.2 -> NOT excluded, proceeds to filter evaluation', r.kind !== 'excluded');
    t.check('beta exactly 1.2 -> rejected (fails strict >1.2)', r.kind === 'rejected');
  }

  // --- scoreTicker: a fully valid pass-all-filters scenario ---------------------
  {
    const meta = goodMeta();
    const r = scoreTicker('GOOD', 'Good Co', goodBars(), meta.beta, meta.daysToEarnings);
    t.check('valid scenario -> kind result', r.kind === 'result');
    t.check('all six filterChecks true', Object.values(r.filterChecks).every(Boolean));
    t.check('verdict is one of the three valid strings', ['BUY SETUP', 'NOT YET', 'AVOID'].includes(r.verdict));
    t.check('chart bars trimmed to 60', r.bars.length === 60);
    t.check('series.ema50 aligned to 60', r.series.ema50.length === 60);
    t.check('series.ema20 aligned to 60', r.series.ema20.length === 60);
    t.check('series.rsi aligned to 60', r.series.rsi.length === 60);
    t.check('signals breakdown present', r.signals && typeof r.signals === 'object');
    t.check('numeric fields are numbers, not strings', typeof r.price === 'number' && typeof r.rsi === 'number' && typeof r.extensionPct === 'number');
  }

  // --- scoreTicker: a rejected scenario carries no chart payload ---------------
  {
    // Sharp multi-day decline in the last 5 bars pushes extension/RSI out of
    // band (verified: yields "Extension ... outside 0-10%").
    const bars = goodBars();
    const n = bars.length;
    for (let i = n - 5; i < n; i++) {
      bars[i] = { ...bars[i], open: bars[i].open * 0.9, close: bars[i].close * 0.85, high: bars[i].high * 0.9, low: bars[i].low * 0.8 };
    }
    const meta = goodMeta();
    const r = scoreTicker('BAD', 'Bad Co', bars, meta.beta, meta.daysToEarnings);
    t.check('sharp decline -> kind rejected (RSI or extension out of band)', r.kind === 'rejected');
    t.check('rejected row has a failReason string', typeof r.failReason === 'string' && r.failReason.length > 0);
    t.check('rejected row carries NO chart bars payload', r.bars === undefined);
    t.check('rejected row carries NO series payload', r.series === undefined);
  }

  // --- scoreTicker: earnings within 14 days fails regardless of chart quality --
  {
    const r = scoreTicker('EARN', 'Earnings Co', goodBars(), goodMeta().beta, 10);
    t.check('earnings in 10 days -> rejected even with a clean chart', r.kind === 'rejected');
    t.check('failReason mentions earnings', /[Ee]arnings/.test(r.failReason));
  }

  // --- scoreTicker: avgVolume is the mean of the last 20 bars' volume ----------
  {
    const bars = goodBars();
    const last20 = bars.slice(-20);
    const expected = Math.round(last20.reduce((s, b) => s + b.volume, 0) / 20);
    const r = scoreTicker('VOL', 'Vol Co', bars, goodMeta().beta, goodMeta().daysToEarnings);
    t.check('avgVolume matches mean of last 20 bars exactly', r.avgVolume === expected);
  }

  // --- assemble: sorting, counts, dataAsOf, stripChart --------------------------
  {
    const meta = goodMeta();
    const good1 = scoreTicker('AAA', 'AAA Co', goodBars(), meta.beta, meta.daysToEarnings); // result
    const good2 = { ...scoreTicker('BBB', 'BBB Co', goodBars(), meta.beta, meta.daysToEarnings), rsi: good1.rsi - 5 }; // lower RSI, should sort first
    const rejected = scoreTicker('CCC', 'CCC Co', goodBars(), meta.beta, 10); // earnings fail -> rejected
    const excluded = scoreTicker('DDD', 'DDD Co', goodBars(), 0.9, 30); // low beta -> excluded
    const errored = scoreTicker('EEE', 'EEE Co', [], meta.beta, 30); // insufficient bars -> error

    const data = assemble([good1, good2, rejected, excluded, errored]);

    t.check('counts.passed matches results length', data.counts.passed === data.results.length);
    t.check('counts.rejected matches rejected length', data.counts.rejected === data.rejected.length);
    t.check('counts.excludedLowBeta matches excludedLowBeta length', data.counts.excludedLowBeta === data.excludedLowBeta.length);
    t.check('counts.errors matches errors length', data.counts.errors === data.errors.length);
    t.check('results sorted by RSI ascending (spec §3.1)', data.results[0].rsi <= data.results[1].rsi);
    t.check('results sorted correctly: BBB (lower rsi) first', data.results[0].ticker === 'BBB');
    t.check('rejected rows have chart payload stripped', data.rejected.every((r) => r.bars === undefined && r.series === undefined));
    t.check('excludedLowBeta rows only carry ticker/name/beta', Object.keys(data.excludedLowBeta[0]).sort().join(',') === 'beta,name,ticker');
    t.check('errors rows carry ticker/name/reason', 'reason' in data.errors[0]);
    t.check('dataAsOf is the latest bar date among scored rows', data.dataAsOf === good1.bars[good1.bars.length - 1].time);
    t.check('universeCount reflects the full watchlist, not just this call', typeof data.universeCount === 'number');
  }

  // --- assemble: stripChart defends against a hypothetical future bug ----------
  // If scoreTicker ever accidentally attached bars/series to a rejected row,
  // assemble() must still strip them before they reach rejected[] in data.json.
  {
    const leaky = { kind: 'rejected', ticker: 'LEAK', name: 'Leak Co', rsi: 40, bars: [{ time: '2026-01-01' }], series: { ema50: [1] }, failReason: 'test' };
    const data = assemble([leaky]);
    t.check('assemble strips bars even if a rejected row carries them', data.rejected[0].bars === undefined);
    t.check('assemble strips series even if a rejected row carries them', data.rejected[0].series === undefined);
  }

  // --- assemble: dataAsOf must come from ANY scored row, not just chart-bearing
  // ("result") ones. Regression test for a real bug found on the first-ever
  // live run: with zero stocks passing all six filters, the old
  // `.flatMap(r => r.bars ? ... : [])` lookup only checked passing rows for a
  // `bars` payload, found none, and silently produced dataAsOf: null — which
  // also fully disables staleness detection, since isStale(null) is always
  // false. Every kind now stamps its own `lastBarDate`; assemble() must read
  // that field, not `.bars`.
  {
    const onlyRejected = scoreTicker('CCC', 'CCC Co', goodBars(), goodMeta().beta, 10);
    const data = assemble([onlyRejected]);
    t.check('rejected-only day still gets a real dataAsOf', data.dataAsOf === onlyRejected.lastBarDate);
    t.check('rejected-only dataAsOf is not null', data.dataAsOf !== null);
  }
  {
    // Mirrors the exact real-world scenario: 0 results, only rejected/excluded/
    // error rows — dataAsOf must still reflect the most recent bar actually seen.
    const rejected = scoreTicker('CCC', 'CCC Co', goodBars(), goodMeta().beta, 10);
    const excluded = scoreTicker('DDD', 'DDD Co', goodBars(), 0.5, 30); // beta < 1.2
    const erroredNoBeta = { kind: 'error', ticker: 'EEE', name: 'EEE Co', reason: 'missing Beta', lastBarDate: null };
    const data = assemble([rejected, excluded, erroredNoBeta]);
    t.check('zero-results day: counts.passed is 0', data.counts.passed === 0);
    t.check('zero-results day: dataAsOf is still a real date, not null', data.dataAsOf !== null && typeof data.dataAsOf === 'string');
  }

  // --- assemble([]): empty input, Phase 0 gap-fill ------------------------------
  // Real scenario: every ticker errors out (e.g. polygon is down for the whole
  // run) -> rows is []. `dataAsOf` is computed via `.flatMap().sort().pop()` on
  // an array derived from `rows` — must not throw on an empty array, and every
  // count must read as a real zero, not undefined/NaN.
  {
    let data = null;
    let threw = null;
    try {
      data = assemble([]);
    } catch (e) {
      threw = e;
    }
    t.check('assemble([]) does not throw', threw === null);
    if (data) {
      t.check('assemble([]): counts.passed is 0', data.counts.passed === 0);
      t.check('assemble([]): counts.rejected is 0', data.counts.rejected === 0);
      t.check('assemble([]): counts.excludedLowBeta is 0', data.counts.excludedLowBeta === 0);
      t.check('assemble([]): counts.errors is 0', data.counts.errors === 0);
      t.check('assemble([]): results is an empty array', Array.isArray(data.results) && data.results.length === 0);
      t.check('assemble([]): rejected is an empty array', Array.isArray(data.rejected) && data.rejected.length === 0);
      t.check('assemble([]): dataAsOf is null, not undefined or a crash', data.dataAsOf === null);
      t.check('assemble([]): universeCount still reflects the full watchlist', typeof data.universeCount === 'number' && data.universeCount > 0);
    } else {
      t.check('assemble([]): counts.passed is 0', false);
      t.check('assemble([]): counts.rejected is 0', false);
      t.check('assemble([]): counts.excludedLowBeta is 0', false);
      t.check('assemble([]): counts.errors is 0', false);
      t.check('assemble([]): results is an empty array', false);
      t.check('assemble([]): rejected is an empty array', false);
      t.check('assemble([]): dataAsOf is null, not undefined or a crash', false);
      t.check('assemble([]): universeCount still reflects the full watchlist', false);
    }
  }

  // --- assemble: marketHealth wiring (Phase 3) ----------------------------------
  {
    const gh = { status: 'GREEN', message: 'Market supports swing entries.', qqqPrice: 500, ema20: 490, ema50: 480 };
    const data = assemble([], gh);
    t.check('assemble passes marketHealth through unchanged when provided', data.marketHealth === gh);
  }
  {
    const data = assemble([]); // marketHealth omitted
    t.check('assemble defaults marketHealth to null when omitted (advisory-only degradation)', data.marketHealth === null);
  }
  {
    const data = assemble([], null); // marketHealth explicitly null (a real fetch failure)
    t.check('assemble accepts an explicit null marketHealth (fetch failure case)', data.marketHealth === null);
  }

  // --- demoMarketHealth: determinism + real classifier wiring -------------------
  {
    const a = demoMarketHealth();
    const b = demoMarketHealth();
    t.check('demoMarketHealth is deterministic (seeded by the fixed "QQQ" ticker)', JSON.stringify(a) === JSON.stringify(b));
    t.check('demoMarketHealth.status is one of the three valid values', ['GREEN', 'YELLOW', 'RED'].includes(a.status));
    t.check('demoMarketHealth includes a real message string', typeof a.message === 'string' && a.message.length > 0);
    t.check('demoMarketHealth includes numeric qqqPrice/ema20/ema50', typeof a.qqqPrice === 'number' && typeof a.ema20 === 'number' && typeof a.ema50 === 'number');
  }

  // --- demoBars / demoMeta: determinism (same ticker -> identical fixture) -----
  {
    const a = demoBars('AAPL');
    const b = demoBars('AAPL');
    t.check('demoBars is deterministic per ticker', JSON.stringify(a) === JSON.stringify(b));
    t.check('demoBars produces FETCH_BARS (150) bars', a.length === 150);

    const different = demoBars('MSFT');
    t.check('demoBars differs across tickers', JSON.stringify(a) !== JSON.stringify(different));

    t.check('demoBars OHLC invariant holds for every bar', a.every((bar) => bar.low <= Math.min(bar.open, bar.close) && bar.high >= Math.max(bar.open, bar.close)));
    t.check('demoBars volumes are all positive', a.every((bar) => bar.volume > 0));
    t.check('demoBars times are strictly increasing', a.every((bar, i) => i === 0 || bar.time > a[i - 1].time));

    const m1 = demoMeta('AAPL');
    const m2 = demoMeta('AAPL');
    t.check('demoMeta is deterministic per ticker', JSON.stringify(m1) === JSON.stringify(m2));
    t.check('demoMeta.beta is a number', typeof m1.beta === 'number');
    t.check('demoMeta.name is a string', typeof m1.name === 'string');
  }

  // --- round(): basic correctness ------------------------------------------------
  t.check('round(10.456, 2) === 10.46', round(10.456, 2) === 10.46);
  t.check('round(10.454, 2) === 10.45', round(10.454, 2) === 10.45);
  t.check('round(100, 2) === 100', round(100, 2) === 100);

  return t.summary();
}

if (require.main === module) {
  const { failed } = run();
  process.exit(failed ? 1 : 0);
}

module.exports = { run };
