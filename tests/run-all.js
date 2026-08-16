#!/usr/bin/env node
// run-all.js — runs every test suite and reports one aggregate result.
//
// scripts/test_indicators.js is the pre-verified reference file (RULES.md:
// "Use them as-is. Do not reinvent.") and calls process.exit() at module
// scope, so it can't be require()'d alongside the others — it's spawned as a
// subprocess instead. The three new suites (filters/verdict/data-fetch) are
// required in-process and aggregated directly.

const path = require('path');
const { spawnSync } = require('child_process');

const suites = ['filters', 'verdict', 'data-fetch', 'rate-limit', 'network', 'marketHealth'];

async function main() {
  let totalPassed = 0;
  let totalFailed = 0;
  let anyFailed = false;

  console.log('=== indicators (reference, scripts/test_indicators.js) ===');
  const indicatorRun = spawnSync('node', [path.join(__dirname, '..', 'scripts', 'test_indicators.js')], {
    stdio: 'inherit',
  });
  if (indicatorRun.status !== 0) anyFailed = true;

  for (const name of suites) {
    console.log(`\n=== ${name} ===`);
    const { run } = require(`./${name}.test.js`);
    // `await` resolves synchronous {passed,failed} returns immediately too,
    // so this works for both sync suites and network.test.js's async one.
    const { passed, failed } = await run();
    totalPassed += passed;
    totalFailed += failed;
    if (failed > 0) anyFailed = true;
  }

  console.log(`\n${'='.repeat(40)}`);
  console.log(`TOTAL (filters+verdict+data-fetch+rate-limit+network): ${totalPassed} passed, ${totalFailed} failed`);
  console.log(`indicators suite: ${indicatorRun.status === 0 ? 'PASS' : 'FAIL'}`);
  console.log(anyFailed ? '\nFAILED' : '\nALL SUITES PASSED');

  process.exit(anyFailed ? 1 : 0);
}

main();
