// network.test.js — Phase 0 gap-fill: fetchYfinanceMeta and fetchPolygonBars'
// retry/backoff LOOP (not just the pure computeThrottleWait/backoffMs helpers,
// which rate-limit.test.js already covers). No real network or real Python
// process here — fetchImpl/sleepImpl/spawn are injected fakes, exercising the
// REAL retry logic in scripts/refresh.js, not a reimplementation of it.

const { fetchYfinanceMeta, fetchPolygonBars } = require('../scripts/refresh');
const { makeSuite } = require('./harness');

// --- fakes -------------------------------------------------------------------
function fakeSpawn({ status = 0, stdout = '{}', stderr = '' } = {}) {
  const calls = [];
  return {
    calls,
    spawn: (cmd, args, opts) => {
      calls.push({ cmd, args, opts });
      return { status, stdout, stderr };
    },
  };
}

function fakeResponse({ status, retryAfter = null, results = [{ t: 0, o: 1, h: 2, l: 0.5, c: 1.5, v: 100 }] }) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => (name.toLowerCase() === 'retry-after' ? retryAfter : null) },
    json: async () => ({ results }),
  };
}

// A queue of canned responses/errors, consumed in order (last one repeats).
function fakeFetchQueue(responses) {
  const calls = [];
  let i = 0;
  return {
    calls,
    fetchImpl: async (url) => {
      calls.push(url);
      const r = responses[Math.min(i, responses.length - 1)];
      i++;
      if (r instanceof Error) throw r;
      return r;
    },
  };
}

// Instant, non-blocking fake sleep that still records what it was asked to wait.
function fakeSleep() {
  const calls = [];
  return { calls, sleepImpl: async (ms) => { calls.push(ms); } };
}

function run() {
  const t = makeSuite('network');

  // === fetchYfinanceMeta =======================================================
  {
    const { spawn } = fakeSpawn({ status: 0, stdout: '{"AAPL":{"name":"Apple Inc.","beta":1.3,"daysToEarnings":30}}' });
    const result = fetchYfinanceMeta(['AAPL'], { spawn });
    t.check('valid JSON stdout -> parsed object returned', result.AAPL && result.AAPL.beta === 1.3);
  }
  {
    const { spawn } = fakeSpawn({ status: 1, stdout: '', stderr: 'python3: command not found' });
    t.throws('non-zero exit code -> throws', () => fetchYfinanceMeta(['AAPL'], { spawn }));
    try {
      fetchYfinanceMeta(['AAPL'], { spawn });
    } catch (e) {
      t.check('error message surfaces stderr', /command not found/.test(e.message));
    }
  }
  {
    const { spawn } = fakeSpawn({ status: 0, stdout: '' });
    t.throws('empty stdout (status 0) -> throws, not silently returns {}', () => fetchYfinanceMeta(['AAPL'], { spawn }));
  }
  {
    const { spawn } = fakeSpawn({ status: 0, stdout: 'not valid json {{{' });
    t.throws('malformed JSON stdout -> throws (surfaces, not silently swallowed)', () => fetchYfinanceMeta(['AAPL'], { spawn }));
  }
  {
    const { spawn, calls } = fakeSpawn({ status: 0, stdout: '{}' });
    fetchYfinanceMeta(['AAPL', 'MSFT'], { spawn });
    t.check('spawn invoked once with all tickers as args', calls.length === 1 && calls[0].args.includes('AAPL') && calls[0].args.includes('MSFT'));
  }

  // === fetchPolygonBars retry loop =============================================
  async function asyncRun() {
    {
      // 429 then 200 -> succeeds, retried exactly once.
      const { fetchImpl, calls } = fakeFetchQueue([fakeResponse({ status: 429 }), fakeResponse({ status: 200 })]);
      const { sleepImpl } = fakeSleep();
      const bars = await fetchPolygonBars('AAPL', 'key', { fetchImpl, sleepImpl });
      t.check('429 then 200 -> succeeds', Array.isArray(bars) && bars.length === 1);
      t.check('429 then 200 -> fetch called exactly twice', calls.length === 2);
    }
    {
      // All 429s -> eventually throws, and gives up after MAX_RETRIES+1 attempts (doesn't loop forever).
      const { fetchImpl, calls } = fakeFetchQueue([fakeResponse({ status: 429 })]);
      const { sleepImpl } = fakeSleep();
      let threw = null;
      try {
        await fetchPolygonBars('AAPL', 'key', { fetchImpl, sleepImpl });
      } catch (e) {
        threw = e;
      }
      t.check('all-429s -> eventually throws', threw !== null && /429/.test(threw.message));
      t.check('all-429s -> gives up after a bounded number of attempts (5), does not loop forever', calls.length === 5);
    }
    {
      // retry-after header is honored over computed backoff.
      const { fetchImpl } = fakeFetchQueue([fakeResponse({ status: 429, retryAfter: '3' }), fakeResponse({ status: 200 })]);
      const { sleepImpl, calls: sleepCalls } = fakeSleep();
      await fetchPolygonBars('AAPL', 'key', { fetchImpl, sleepImpl });
      // sleepCalls includes the throttle-limiter's own (likely 0ms) wait plus the retry wait;
      // the retry-after-driven wait must be exactly 3000ms (3s), not a computed backoff value.
      t.check('retry-after header honored (3s -> 3000ms sleep)', sleepCalls.includes(3000));
    }
    {
      // Non-429 non-ok status fails immediately, no retry.
      const { fetchImpl, calls } = fakeFetchQueue([fakeResponse({ status: 500 })]);
      const { sleepImpl } = fakeSleep();
      let threw = null;
      try {
        await fetchPolygonBars('AAPL', 'key', { fetchImpl, sleepImpl });
      } catch (e) {
        threw = e;
      }
      t.check('non-429 error status throws immediately', threw !== null && /500/.test(threw.message));
      t.check('non-429 error status does not retry', calls.length === 1);
    }
    {
      // Network-level throw (fetch itself rejects) is retried like a 429.
      const { fetchImpl, calls } = fakeFetchQueue([new Error('ECONNRESET'), fakeResponse({ status: 200 })]);
      const { sleepImpl } = fakeSleep();
      const bars = await fetchPolygonBars('AAPL', 'key', { fetchImpl, sleepImpl });
      t.check('network error then success -> recovers', Array.isArray(bars));
      t.check('network error -> retried', calls.length === 2);
    }
    {
      // Polygon 200 OK but empty results array -> throws (no silent empty-bars return).
      const { fetchImpl } = fakeFetchQueue([fakeResponse({ status: 200, results: [] })]);
      const { sleepImpl } = fakeSleep();
      let threw = null;
      try {
        await fetchPolygonBars('AAPL', 'key', { fetchImpl, sleepImpl });
      } catch (e) {
        threw = e;
      }
      t.check('empty results array -> throws, not silently empty', threw !== null && /no bars/.test(threw.message));
    }
  }

  return asyncRun().then(() => t.summary());
}

if (require.main === module) {
  run().then(({ failed }) => process.exit(failed ? 1 : 0));
}

module.exports = { run };
