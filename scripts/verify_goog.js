#!/usr/bin/env node
// verify_goog.js — RULES.md §9 Verification Gate.
//
// Pulls REAL daily bars for GOOG from polygon.io (no demo/synthetic data),
// computes EMA50 and RSI(14) with the exact same scripts/indicators.js used
// by the nightly pipeline (via refresh.js's fetchPolygonBars, so this is the
// identical fetch path — not a reimplementation), and prints the numbers for
// manual comparison against a TradingView NASDAQ:GOOG reading.
//
// RULES.md §9: "pull real GOOG daily closes, compute RSI(14) and EMA50,
// compare against a TradingView GOOG reading. Match within ~0.5 = the
// indicator layer is trustworthy and all downstream filters/verdicts
// inherit it." This script does NOT decide pass/fail on its own — the user
// compares by eye against TradingView and confirms.
//
// Usage:
//   npm run verify:goog
// Requires POLYGON_API_KEY, either exported in the shell or in a local .env
// file (see .env.example).

const fs = require('fs');
const path = require('path');

// Tiny .env loader (no dependency) — only fills vars not already set.
function loadDotEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, key, rawVal] = m;
    if (process.env[key] === undefined) {
      process.env[key] = rawVal.replace(/^["']|["']$/g, '');
    }
  }
}

async function main() {
  loadDotEnv();
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    console.error(
      'POLYGON_API_KEY not set.\n' +
        'Set it in your shell (export POLYGON_API_KEY=...) or copy .env.example to .env and fill it in.'
    );
    process.exit(1);
  }

  const { fetchPolygonBars } = require('./refresh');
  const { ema, rsi, extensionPct } = require('./indicators');

  const ticker = 'GOOG';
  console.log(`Fetching live daily bars for ${ticker} from polygon.io…`);
  const bars = await fetchPolygonBars(ticker, apiKey);
  console.log(`Got ${bars.length} bars, ${bars[0].time} → ${bars[bars.length - 1].time}\n`);

  const closes = bars.map((b) => b.close);
  const ema50Series = ema(closes, 50);
  const rsiSeries = rsi(closes, 14);

  const i = bars.length - 1;
  const latestClose = closes[i];
  const latestDate = bars[i].time;
  const ema50Now = ema50Series[i];
  const rsiNow = rsiSeries[i];
  const ext = extensionPct(latestClose, ema50Now);

  console.log('='.repeat(50));
  console.log(`RULES §9 VERIFICATION GATE — ${ticker} (NASDAQ:${ticker})`);
  console.log('='.repeat(50));
  console.log(`Latest bar date:   ${latestDate}`);
  console.log(`Latest close:      ${latestClose.toFixed(2)}`);
  console.log(`EMA50 (computed):  ${ema50Now.toFixed(2)}`);
  console.log(`RSI(14) (Wilder):  ${rsiNow.toFixed(2)}`);
  console.log(`Extension:         ${ext.toFixed(2)}%`);
  console.log('='.repeat(50));
  console.log(
    '\nCompare EMA50 and RSI(14) above against a TradingView NASDAQ:GOOG\n' +
      'reading for the same date. Per RULES.md §9, match within ~0.5 confirms\n' +
      'the indicator layer (and everything downstream) is trustworthy.'
  );
}

main().catch((e) => {
  console.error('verify:goog failed:', e.message);
  process.exit(1);
});
