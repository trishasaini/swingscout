// rate-limit.test.js — polygon.io free-tier throttling (5 req/min) and
// 429 retry backoff. Tests the PURE decision logic (computeThrottleWait,
// backoffMs) with synthetic timestamps/injected RNG — no real network calls
// or real sleeps, so this suite runs instantly and deterministically.

const { computeThrottleWait, backoffMs, POLYGON_MAX_PER_MINUTE, POLYGON_WINDOW_MS } = require('../scripts/refresh');
const { makeSuite } = require('./harness');

function run() {
  const t = makeSuite('rate-limit');

  // --- computeThrottleWait: sliding window ------------------------------------
  t.check('constants: 5 requests per 60s (polygon free tier)', POLYGON_MAX_PER_MINUTE === 5 && POLYGON_WINDOW_MS === 60_000);

  {
    const { waitMs, pruned } = computeThrottleWait([], 100_000);
    t.check('no prior calls -> no wait', waitMs === 0);
    t.check('no prior calls -> empty pruned list', pruned.length === 0);
  }
  {
    // 4 calls well within the last 60s -> under the 5-call cap -> no wait.
    const now = 100_000;
    const timestamps = [now - 40_000, now - 30_000, now - 20_000, now - 10_000];
    const { waitMs, pruned } = computeThrottleWait(timestamps, now);
    t.check('4 calls in window (< 5 cap) -> no wait', waitMs === 0);
    t.check('none pruned (all still within window)', pruned.length === 4);
  }
  {
    // Exactly 5 calls spaced 12s apart, evenly filling the 60s window ->
    // the 6th call must wait until the oldest (at t=0) ages out.
    const now = 48_000;
    const timestamps = [0, 12_000, 24_000, 36_000, 48_000];
    const { waitMs } = computeThrottleWait(timestamps, now);
    // oldest=0, windowMs=60000 -> must wait until t=60000, i.e. 60000-48000=12000ms from now.
    t.close('5 calls at the cap -> waits exactly until the oldest ages out', waitMs, 12_000, 1e-9);
  }
  {
    // Stale timestamps (older than 60s) are pruned and don't count against the cap.
    const now = 200_000;
    const timestamps = [0, 1000, 2000, now - 5000, now - 1000]; // first 3 are >60s old
    const { waitMs, pruned } = computeThrottleWait(timestamps, now);
    t.check('stale timestamps pruned out of the window', pruned.length === 2);
    t.check('only 2 live timestamps (< 5 cap) -> no wait', waitMs === 0);
  }
  {
    // waitMs is never negative even at the exact window boundary.
    const now = 60_000;
    const timestamps = [0, 10_000, 20_000, 30_000, 40_000]; // oldest exactly at window edge
    const { waitMs } = computeThrottleWait(timestamps, now);
    t.check('waitMs is never negative at the window boundary', waitMs >= 0);
  }
  {
    // Custom window/cap params are respected (not hardcoded to the polygon defaults).
    // Both timestamps are still "live" under a 5s window (1s and 0.5s old).
    const now = 10_000;
    const timestamps = [9000, 9500];
    const { waitMs } = computeThrottleWait(timestamps, now, { maxPerWindow: 2, windowMs: 5000 });
    t.close('respects custom maxPerWindow/windowMs', waitMs, 4000, 1e-9); // 5000 - (10000-9000)
  }

  // --- backoffMs: exponential backoff with bounded jitter ----------------------
  {
    const noJitter = { jitterMax: 0, rand: () => 0 };
    t.close('attempt 0 -> ~1s (no jitter)', backoffMs(0, noJitter), 1000, 1e-9);
    t.close('attempt 1 -> ~2s (no jitter)', backoffMs(1, noJitter), 2000, 1e-9);
    t.close('attempt 2 -> ~4s (no jitter)', backoffMs(2, noJitter), 4000, 1e-9);
    t.close('attempt 3 -> ~8s (no jitter)', backoffMs(3, noJitter), 8000, 1e-9);
  }
  {
    const capped = { base: 1000, cap: 30_000, jitterMax: 0, rand: () => 0 };
    t.close('large attempt count is capped, not unbounded', backoffMs(10, capped), 30_000, 1e-9);
  }
  {
    t.close('rand=0 -> no jitter added', backoffMs(0, { jitterMax: 500, rand: () => 0 }), 1000, 1e-9);
    t.close('rand=1 -> full jitter added', backoffMs(0, { jitterMax: 500, rand: () => 1 }), 1500, 1e-9);
  }
  t.check('backoffMs is always >= the base exponential term (jitter never negative)', backoffMs(2, { rand: () => 0 }) >= 4000);

  return t.summary();
}

if (require.main === module) {
  const { failed } = run();
  process.exit(failed ? 1 : 0);
}

module.exports = { run };
