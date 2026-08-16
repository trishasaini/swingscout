// marketHealth.test.js — Market Health classifier (RULES.md §5 / spec §3.7).
// Boundary-exact, same style as filters.test.js.

const { classifyMarketHealth, MESSAGES } = require('../scripts/marketHealth');
const { makeSuite } = require('./harness');

function run() {
  const t = makeSuite('marketHealth');

  // --- GREEN: above both -------------------------------------------------------
  {
    const r = classifyMarketHealth(500, 490, 480);
    t.check('above both EMAs -> GREEN', r.status === 'GREEN');
    t.check('GREEN message matches spec §3.7 exactly', r.message === 'Market supports swing entries.');
  }

  // --- YELLOW: above exactly one ------------------------------------------------
  {
    const r1 = classifyMarketHealth(500, 490, 510); // above EMA20, below EMA50
    t.check('above EMA20 only -> YELLOW', r1.status === 'YELLOW');
    const r2 = classifyMarketHealth(500, 510, 490); // below EMA20, above EMA50
    t.check('above EMA50 only -> YELLOW', r2.status === 'YELLOW');
    t.check('YELLOW message matches spec §3.7 exactly', r1.message === 'Market is mixed — use smaller position size or wait for confirmation.');
  }

  // --- RED: below both -----------------------------------------------------------
  {
    const r = classifyMarketHealth(500, 510, 520);
    t.check('below both EMAs -> RED', r.status === 'RED');
    t.check('RED message matches spec §3.7 exactly', r.message === 'Setup is valid, but market conditions are unfavorable.');
  }

  // --- Boundary: exactly equal to an EMA (documented interpretation) -----------
  {
    // Exactly equal to EMA20, above EMA50 -> "equal" is NOT "above" -> only 1 real "above" -> YELLOW
    const r = classifyMarketHealth(500, 500, 480);
    t.check('price exactly equal to EMA20 (not "above") + above EMA50 -> YELLOW, not GREEN', r.status === 'YELLOW');
  }
  {
    // Exactly equal to BOTH EMAs -> neither is "above" -> RED
    const r = classifyMarketHealth(500, 500, 500);
    t.check('price exactly equal to both EMAs -> RED (neither counts as "above")', r.status === 'RED');
  }

  // --- Display values are rounded, but classification uses raw values ----------
  {
    const r = classifyMarketHealth(500.126, 490.001, 480.999);
    t.check('qqqPrice rounded to 2dp for display', r.qqqPrice === 500.13);
    t.check('ema20 rounded to 2dp for display', r.ema20 === 490.0);
    t.check('ema50 rounded to 2dp for display', r.ema50 === 481.0);
  }
  {
    // Classification must use the raw (unrounded) inputs, not the rounded
    // display values — 500.006 > 500.004 is true at full precision even though
    // both round to the same 2dp display value (500.01 vs 500.00 respectively).
    const r = classifyMarketHealth(500.006, 500.004, 600);
    t.check('classification compares raw pre-rounding values, not display-rounded ones', r.status === 'YELLOW');
  }

  // --- MESSAGES export sanity ----------------------------------------------------
  t.check('MESSAGES has exactly the 3 valid statuses', Object.keys(MESSAGES).sort().join(',') === 'GREEN,RED,YELLOW');

  return t.summary();
}

if (require.main === module) {
  const { failed } = run();
  process.exit(failed ? 1 : 0);
}

module.exports = { run };
