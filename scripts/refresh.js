#!/usr/bin/env node
// refresh.js — nightly data pipeline (RULES.md §3, §6).
//
// LIVE (default): fetch ~150 daily bars/stock from polygon.io, Beta + earnings
// from yfinance (via scripts/yf_fetch.py), compute EMA50/EMA20/RSI locally with
// the tested indicators.js, apply the six hard filters (§1) and the Phase 2
// pullback verdict (§4), and write public/data.json.
//
// DEMO (--demo): same pipeline, but bars/Beta/earnings are synthetic and
// deterministic. Output goes to public/data.demo.json with demo:true so the UI
// can loudly flag it. Demo data is NEVER written to data.json — the live file is
// only ever produced from real polygon data (RULES.md §3).
//
// Usage:
//   POLYGON_API_KEY=xxx node scripts/refresh.js      # live
//   node scripts/refresh.js --demo                   # synthetic fixture

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { ema, rsi, extensionPct } = require('./indicators');
const { isExcludedByBeta, evaluateFilters } = require('./filters');
const { pullbackVerdict } = require('./verdict');
const { classifyMarketHealth } = require('./marketHealth');
const { WATCHLIST, NAMES } = require('./watchlist');

const DEMO = process.argv.includes('--demo');
const CHART_BARS = 60; // trading days shown on the chart (spec §3.3)
const FETCH_BARS = 150; // bars fetched per stock (EMA50 warmup, RULES §3)
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// ---------------------------------------------------------------------------
// Shared: turn raw bars + meta into a scored row using the REAL pipeline.
// ---------------------------------------------------------------------------
function scoreTicker(ticker, name, bars, beta, daysToEarnings) {
  if (!bars || bars.length < FETCH_BARS - 20) {
    return { kind: 'error', ticker, name, reason: `insufficient bars (${bars ? bars.length : 0})` };
  }

  const closes = bars.map((b) => b.close);
  const ema50 = ema(closes, 50);
  const ema20 = ema(closes, 20);
  const rsiSeries = rsi(closes, 14);

  const i = bars.length - 1;
  const price = closes[i];
  const ema50Now = ema50[i];
  const ema20Now = ema20[i];
  const rsiNow = rsiSeries[i];
  const ext = extensionPct(price, ema50Now);
  // 20-day average daily volume (RULES §1 filter #3).
  const avgVolume =
    bars.slice(-20).reduce((s, b) => s + b.volume, 0) / Math.min(20, bars.length);

  // Beta must be known to verify "> 1.2" — missing beta is a data error, not a
  // silent pass or hide (keeps the non-technical user's trust; RULES §7).
  if (typeof beta !== 'number' || Number.isNaN(beta)) {
    return { kind: 'error', ticker, name, reason: 'missing Beta from yfinance' };
  }
  // Beta < 1.2 → excluded entirely, never displayed (RULES §1).
  if (isExcludedByBeta(beta)) {
    return { kind: 'excluded', ticker, name, beta };
  }

  const metrics = {
    price,
    beta,
    avgVolume,
    extensionPct: ext,
    rsi: rsiNow,
    daysToEarnings,
  };
  const { passed, checks, failReason } = evaluateFilters(metrics);

  const common = {
    ticker,
    name,
    price: round(price, 2),
    ema50: round(ema50Now, 2),
    ema20: round(ema20Now, 2),
    extensionPct: round(ext, 2),
    rsi: round(rsiNow, 2),
    beta: round(beta, 2),
    avgVolume: Math.round(avgVolume),
    daysToEarnings,
    filterChecks: checks,
  };

  if (!passed) {
    return { kind: 'rejected', ...common, failReason };
  }

  // Passed all six hard filters → compute the Phase 2 verdict + chart payload.
  const chartBars = bars.slice(-CHART_BARS);
  const chartEma50 = ema50.slice(-CHART_BARS);
  const { verdict, color, summary, signals } = pullbackVerdict(chartBars, chartEma50);

  return {
    kind: 'result',
    ...common,
    verdict,
    verdictColor: color,
    verdictSummary: summary,
    signals,
    // Chart payload (last 60 bars + aligned indicator series) for lightweight-charts.
    bars: chartBars.map((b) => ({
      time: b.time,
      open: round(b.open, 2),
      high: round(b.high, 2),
      low: round(b.low, 2),
      close: round(b.close, 2),
      volume: Math.round(b.volume),
    })),
    series: {
      ema50: chartEma50.map((v) => (v == null ? null : round(v, 2))),
      ema20: ema20.slice(-CHART_BARS).map((v) => (v == null ? null : round(v, 2))),
      rsi: rsiSeries.slice(-CHART_BARS).map((v) => (v == null ? null : round(v, 2))),
    },
  };
}

const round = (n, d) => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

// ---------------------------------------------------------------------------
// LIVE fetch: polygon daily bars, rate-limited + retried (RULES.md §6:
// polygon free tier). Polygon's free tier caps at 5 requests/minute — an
// 80-stock refresh at 1 request/ticker takes ~16 minutes, which is fine for
// the unattended nightly Action (spec says "under 15s" for the SCAN once
// data.json is loaded in the browser; the nightly fetch itself has no such
// constraint).
// ---------------------------------------------------------------------------
const POLYGON_MAX_PER_MINUTE = 5;
const POLYGON_WINDOW_MS = 60_000;
const POLYGON_MAX_RETRIES = 4; // on top of the first attempt

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Pure sliding-window decision: given prior call timestamps (ms) and "now",
 * how long to wait before another call is allowed to stay under
 * `maxPerWindow` calls per `windowMs`. Returns the wait plus the pruned
 * timestamp list (expired entries dropped) so callers can maintain state
 * without this function needing any I/O — keeps it unit-testable without
 * fake timers.
 */
function computeThrottleWait(timestamps, now, { maxPerWindow = POLYGON_MAX_PER_MINUTE, windowMs = POLYGON_WINDOW_MS } = {}) {
  const pruned = timestamps.filter((ts) => now - ts < windowMs);
  if (pruned.length < maxPerWindow) {
    return { waitMs: 0, pruned };
  }
  const oldest = pruned[0];
  const waitMs = Math.max(0, windowMs - (now - oldest));
  return { waitMs, pruned };
}

/**
 * Exponential backoff with jitter for 429/network retries.
 * attempt 0 -> ~1s, 1 -> ~2s, 2 -> ~4s, 3 -> ~8s, capped at `cap`.
 * `rand` is injectable so tests can assert bounds deterministically.
 */
function backoffMs(attempt, { base = 1000, cap = 30_000, jitterMax = 500, rand = Math.random } = {}) {
  const exp = Math.min(base * 2 ** attempt, cap);
  return exp + rand() * jitterMax;
}

// Stateful sliding-window limiter shared across all polygon calls in this process.
const polygonCallTimestamps = [];
async function throttlePolygon(sleepImpl = sleep) {
  const { waitMs, pruned } = computeThrottleWait(polygonCallTimestamps, Date.now());
  polygonCallTimestamps.length = 0;
  polygonCallTimestamps.push(...pruned);
  if (waitMs > 0) await sleepImpl(waitMs);
  polygonCallTimestamps.push(Date.now());
}

// `fetchImpl`/`sleepImpl` default to the real global fetch and the real sleep —
// production behavior is unchanged. Tests inject fakes so the retry/backoff
// loop can be exercised without real network calls or real wall-clock delays.
async function fetchPolygonBars(ticker, apiKey, { fetchImpl = fetch, sleepImpl = sleep } = {}) {
  const to = new Date();
  const from = new Date(to.getTime() - 300 * 24 * 3600 * 1000); // ~300 cal days -> ~200 trading
  const fmt = (d) => d.toISOString().slice(0, 10);
  const url =
    `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/` +
    `${fmt(from)}/${fmt(to)}?adjusted=true&sort=asc&limit=400&apiKey=${apiKey}`;

  let lastErr;
  for (let attempt = 0; attempt <= POLYGON_MAX_RETRIES; attempt++) {
    await throttlePolygon(sleepImpl);

    let res;
    try {
      res = await fetchImpl(url);
    } catch (e) {
      lastErr = e;
      if (attempt < POLYGON_MAX_RETRIES) await sleepImpl(backoffMs(attempt));
      continue;
    }

    if (res.status === 429) {
      lastErr = new Error('polygon HTTP 429 (rate limited)');
      if (attempt < POLYGON_MAX_RETRIES) {
        const retryAfter = Number(res.headers.get('retry-after'));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoffMs(attempt);
        console.error(`  [${ticker}] 429 rate limited — retrying in ${Math.round(waitMs / 1000)}s (attempt ${attempt + 1}/${POLYGON_MAX_RETRIES + 1})`);
        await sleepImpl(waitMs);
      }
      continue;
    }

    if (!res.ok) {
      throw new Error(`polygon HTTP ${res.status}`);
    }
    const json = await res.json();
    if (!json.results || json.results.length === 0) {
      throw new Error('polygon returned no bars');
    }
    return json.results.slice(-FETCH_BARS).map((r) => ({
      time: new Date(r.t).toISOString().slice(0, 10),
      open: r.o,
      high: r.h,
      low: r.l,
      close: r.c,
      volume: r.v,
    }));
  }
  // Retries exhausted: this ticker fails, but the caller (runLive's per-ticker
  // try/catch) isolates that failure to errors[] — the overall run continues.
  throw lastErr || new Error('polygon fetch failed after retries');
}

// `spawn` defaults to the real spawnSync — production behavior is unchanged.
// Tests inject a fake so this can be exercised without a real Python process.
function fetchYfinanceMeta(tickers, { spawn = spawnSync } = {}) {
  const res = spawn('python3', [path.join(__dirname, 'yf_fetch.py'), ...tickers], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (res.status !== 0 || !res.stdout) {
    throw new Error(`yf_fetch.py failed: ${res.stderr || 'no output'}`);
  }
  return JSON.parse(res.stdout);
}

async function runLive() {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    console.error('POLYGON_API_KEY not set. For a keyless sample run: npm run refresh:demo');
    process.exit(1);
  }
  console.error(`Fetching yfinance meta for ${WATCHLIST.length} tickers…`);
  const meta = fetchYfinanceMeta(WATCHLIST);

  const rows = [];
  for (const ticker of WATCHLIST) {
    const m = meta[ticker] || {};
    if (m.error) {
      rows.push({ kind: 'error', ticker, name: NAMES[ticker] || ticker, reason: m.error });
      continue;
    }
    try {
      const bars = await fetchPolygonBars(ticker, apiKey);
      const name = m.name || NAMES[ticker] || ticker;
      rows.push(scoreTicker(ticker, name, bars, m.beta, m.daysToEarnings ?? null));
    } catch (e) {
      rows.push({ kind: 'error', ticker, name: NAMES[ticker] || ticker, reason: e.message });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Market Health (RULES §5): QQQ vs its own EMA20/EMA50. Advisory only — a
// failure here must never crash the whole run or block stock results, so it
// resolves to `null` (not a thrown error) on any failure; `fetchBarsImpl` is
// injectable so tests can exercise both paths without a real network call.
// ---------------------------------------------------------------------------
async function fetchMarketHealth(apiKey, { fetchBarsImpl = fetchPolygonBars } = {}) {
  try {
    const bars = await fetchBarsImpl('QQQ', apiKey);
    const closes = bars.map((b) => b.close);
    const ema20Series = ema(closes, 20);
    const ema50Series = ema(closes, 50);
    const i = bars.length - 1;
    return classifyMarketHealth(closes[i], ema20Series[i], ema50Series[i]);
  } catch (e) {
    console.error('Market health fetch failed (advisory only, continuing without it):', e.message);
    return null;
  }
}

function demoMarketHealth() {
  const bars = demoBars('QQQ');
  const closes = bars.map((b) => b.close);
  const ema20Series = ema(closes, 20);
  const ema50Series = ema(closes, 50);
  const i = bars.length - 1;
  return classifyMarketHealth(closes[i], ema20Series[i], ema50Series[i]);
}

// ---------------------------------------------------------------------------
// DEMO fetch: deterministic synthetic bars (fixture only; never live data.json).
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

function demoBars(ticker) {
  const rng = mulberry32(hash(ticker));
  const bucket = hash(ticker) % 4; // 0 BUY, 1 NOT YET, 2 AVOID, 3 mixed/reject
  let price = 25 + rng() * 150; // 25..175
  const baseVol = 2_000_000 + Math.floor(rng() * 28_000_000);
  const bars = [];
  const dayMs = 24 * 3600 * 1000;
  const start = Date.now() - FETCH_BARS * dayMs;

  for (let d = 0; d < FETCH_BARS; d++) {
    const daysFromEnd = FETCH_BARS - 1 - d;
    const inPullback = daysFromEnd < 8;

    // Uptrend drift, then a mild pullback in the last 8 days.
    let drift = 0.0012;
    let rangePct = 0.02;
    let volMult = 1;
    if (inPullback) {
      drift = -0.0025;
      if (bucket === 0) { rangePct = 0.008; volMult = 0.6; }         // small candles, calm vol -> BUY-ish
      else if (bucket === 1) { rangePct = 0.018; volMult = 0.9; }    // medium -> NOT YET-ish
      else if (bucket === 2) { rangePct = 0.05; volMult = 1.4; drift = -0.006; } // sharp + heavy -> AVOID
      else { rangePct = 0.02; volMult = 1.0; }
    }
    const noise = (rng() - 0.5) * 0.02;
    const prevClose = price;
    price = prevClose * (1 + drift + noise);

    const open = prevClose * (1 + (rng() - 0.5) * rangePct * 0.5);
    const close = price;
    const hi = Math.max(open, close) * (1 + rng() * rangePct * 0.5);
    const lo = Math.min(open, close) * (1 - rng() * rangePct * 0.5);
    const volume = Math.round(baseVol * volMult * (0.8 + rng() * 0.4));

    bars.push({
      time: new Date(start + d * dayMs).toISOString().slice(0, 10),
      open, high: hi, low: lo, close, volume,
    });
  }
  return bars;
}

function demoMeta(ticker) {
  const rng = mulberry32(hash(ticker) ^ 0x9e3779b9);
  const bucket = hash(ticker) % 4;
  // Mostly high beta; deterministically make a couple low-beta (excluded).
  let beta = 1.15 + rng() * 1.4; // 1.15..2.55
  if (bucket === 3 && rng() < 0.4) beta = 0.8 + rng() * 0.35; // <1.2 -> excluded
  // Mostly far-off earnings; occasionally within 14 days (earnings FAIL).
  let daysToEarnings = 20 + Math.floor(rng() * 50);
  if (bucket === 3 && rng() < 0.35) daysToEarnings = 3 + Math.floor(rng() * 10);
  return { beta: round(beta, 2), daysToEarnings, name: NAMES[ticker] || ticker };
}

function runDemo() {
  return WATCHLIST.map((ticker) => {
    const meta = demoMeta(ticker);
    const bars = demoBars(ticker);
    return scoreTicker(ticker, meta.name, bars, meta.beta, meta.daysToEarnings);
  });
}

// ---------------------------------------------------------------------------
// Assemble + write data.json.
// ---------------------------------------------------------------------------
function assemble(rows, marketHealth = null) {
  const results = rows.filter((r) => r.kind === 'result');
  const rejected = rows.filter((r) => r.kind === 'rejected');
  const excluded = rows.filter((r) => r.kind === 'excluded');
  const errors = rows.filter((r) => r.kind === 'error');

  // Sort passing results by RSI ascending (deepest pullback first, spec §3.1).
  results.sort((a, b) => a.rsi - b.rsi);
  // Rejected: keep stable, most-informative first (by RSI too).
  rejected.sort((a, b) => (a.rsi ?? 999) - (b.rsi ?? 999));

  // "Data as of" = latest bar date we actually scored.
  const lastBarDate = rows
    .flatMap((r) => (r.bars ? [r.bars[r.bars.length - 1].time] : []))
    .sort()
    .pop();

  return {
    generatedAt: new Date().toISOString(),
    dataAsOf: lastBarDate || null,
    demo: DEMO,
    marketHealth,
    universeCount: WATCHLIST.length,
    counts: {
      passed: results.length,
      rejected: rejected.length,
      excludedLowBeta: excluded.length,
      errors: errors.length,
    },
    results,
    rejected: rejected.map(stripChart),
    excludedLowBeta: excluded.map((r) => ({ ticker: r.ticker, name: r.name, beta: round(r.beta, 2) })),
    errors: errors.map((r) => ({ ticker: r.ticker, name: r.name, reason: r.reason })),
  };
}

// Rejected rows carry metrics but no chart payload (keeps data.json small).
function stripChart(r) {
  const { kind, bars, series, ...rest } = r;
  return rest;
}

async function main() {
  const rows = DEMO ? runDemo() : await runLive();
  const marketHealth = DEMO ? demoMarketHealth() : await fetchMarketHealth(process.env.POLYGON_API_KEY);
  const data = assemble(rows, marketHealth);

  if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  const outFile = path.join(PUBLIC_DIR, DEMO ? 'data.demo.json' : 'data.json');
  fs.writeFileSync(outFile, JSON.stringify(data, null, 2));

  console.error(
    `${DEMO ? 'DEMO ' : ''}scan complete: ${data.counts.passed} passed, ` +
      `${data.counts.rejected} rejected, ${data.counts.excludedLowBeta} excluded (low beta), ` +
      `${data.counts.errors} errors -> ${path.relative(process.cwd(), outFile)}`
  );
}

// Only auto-run when executed directly (`node scripts/refresh.js`), not when
// required by tests — requiring this module must be side-effect-free.
if (require.main === module) {
  main().catch((e) => {
    console.error('refresh failed:', e);
    process.exit(1);
  });
}

module.exports = {
  scoreTicker,
  assemble,
  stripChart,
  round,
  demoBars,
  demoMeta,
  fetchPolygonBars,
  fetchYfinanceMeta,
  fetchMarketHealth,
  demoMarketHealth,
  computeThrottleWait,
  backoffMs,
  CHART_BARS,
  FETCH_BARS,
  POLYGON_MAX_PER_MINUTE,
  POLYGON_WINDOW_MS,
};
