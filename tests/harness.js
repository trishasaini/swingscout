// harness.js — tiny shared test harness for the tests/ suites.
// Mirrors the style of scripts/test_indicators.js (which stays untouched —
// RULES.md says don't reinvent the indicator reference tests).

function makeSuite(name) {
  let passed = 0;
  let failed = 0;

  function check(label, cond, detail) {
    const ok = !!cond;
    ok ? passed++ : failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  [${name}] ${label}${detail ? ' — ' + detail : ''}`);
    return ok;
  }

  function close(label, got, expected, tol = 1e-9) {
    return check(label, Math.abs(got - expected) <= tol, `got ${got}, expected ${expected} (tol ${tol})`);
  }

  function throws(label, fn) {
    try {
      fn();
      return check(label, false, 'expected a throw, none occurred');
    } catch {
      return check(label, true);
    }
  }

  function summary() {
    console.log(`\n[${name}] ${passed} passed, ${failed} failed`);
    return { passed, failed };
  }

  return { check, close, throws, summary };
}

module.exports = { makeSuite };
