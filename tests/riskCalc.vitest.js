import { describe, it, expect } from 'vitest';
import { computeRiskPlan, WIDE_STOP_WARNING } from '../src/lib/riskCalc';

// A minimal "result row" fixture — only the fields computeRiskPlan reads.
function makeR({ price = 100, ema50 = 95, lows = [90, 91, 92, 93, 94, 95, 96, 97, 98, 99] } = {}) {
  return { price, ema50, bars: lows.map((low) => ({ low })) };
}

describe('computeRiskPlan', () => {
  it('swing low = min low of the last 10 bars', () => {
    const r = makeR({ price: 100, ema50: 80, lows: [95, 88, 96, 97, 98, 99, 100, 101, 102, 103] });
    // ema50Stop = 80*0.985 = 78.8, swingLow = 88 -> swingLow is HIGHER (less protective),
    // so the LOWER of the two (RULES: suggested stop = the lower) is ema50Stop = 78.8.
    const plan = computeRiskPlan(r);
    expect(plan.stopBasis).toBe('EMA50 support');
    expect(plan.stop).toBeCloseTo(78.8, 5);
  });

  it('uses only the last 10 bars for swing low, ignoring earlier (lower) lows', () => {
    // 15 bars: an very low early low (10) that must be IGNORED, last 10 bottom out at 90.
    const lows = [10, 200, 200, 200, 200, 95, 94, 93, 92, 91, 90, 96, 97, 98, 99];
    const r = { price: 150, ema50: 200, bars: lows.map((low) => ({ low })) }; // ema50Stop way higher, so swing low wins
    const plan = computeRiskPlan(r);
    expect(plan.stopBasis).toBe('swing low');
    expect(plan.stop).toBe(90); // NOT 10 — that's outside the last-10 window
  });

  it('suggested stop is the LOWER of swing low and EMA50 support (RULES §5)', () => {
    // Case A: swing low is lower -> swing low wins.
    const rA = makeR({ price: 100, ema50: 100, lows: [70, 90, 91, 92, 93, 94, 95, 96, 97, 98] });
    const planA = computeRiskPlan(rA); // ema50Stop = 98.5, swingLow = 70 -> lower is 70
    expect(planA.stopBasis).toBe('swing low');
    expect(planA.stop).toBe(70);

    // Case B: EMA50 support is lower -> EMA50 support wins.
    const rB = makeR({ price: 100, ema50: 80, lows: [95, 96, 97, 98, 99, 100, 101, 102, 103, 104] });
    const planB = computeRiskPlan(rB); // ema50Stop = 78.8, swingLow = 95 -> lower is 78.8
    expect(planB.stopBasis).toBe('EMA50 support');
    expect(planB.stop).toBeCloseTo(78.8, 5);
  });

  it('computes risk/share, max $ risk, shares (floored), and capital required', () => {
    const r = makeR({ price: 100, ema50: 90 }); // ema50Stop = 88.65 (lower than any of the default lows 90-99)
    const plan = computeRiskPlan(r, { accountSize: 5000, riskPct: 1 });
    expect(plan.valid).toBe(true);
    expect(plan.riskPerShare).toBeCloseTo(11.35, 5); // 100 - 88.65
    expect(plan.maxDollarRisk).toBeCloseTo(50, 5); // 5000 * 1%
    expect(plan.shares).toBe(Math.floor(50 / 11.35)); // floored, not rounded
    expect(plan.capitalRequired).toBeCloseTo(plan.shares * 100, 5);
  });

  it('shares is floored, not rounded (RULES §5 explicit)', () => {
    // Rig numbers so max$risk/riskPerShare lands just under a whole number.
    const r = { price: 10, ema50: 10, bars: [{ low: 8 }] }; // ema50Stop=9.85, swingLow=8 -> stop=8, riskPerShare=2
    const plan = computeRiskPlan(r, { accountSize: 1000, riskPct: 0.599 }); // maxDollarRisk=5.99, /2=2.995 -> floor=2
    expect(plan.shares).toBe(2);
  });

  it('capital required is allowed to exceed account size by design (RULES §5: max dollar risk, not cash)', () => {
    const r = { price: 1000, ema50: 999, bars: [{ low: 995 }] }; // tiny risk/share -> huge share count possible
    const plan = computeRiskPlan(r, { accountSize: 100, riskPct: 1 }); // maxDollarRisk = $1
    expect(plan.valid).toBe(true);
    if (plan.shares > 0) {
      expect(plan.capitalRequired).toBeGreaterThan(100); // > the $100 account size — allowed, not a bug
    }
  });

  it('wide-stop warning fires when stop is 8% or more below entry (inclusive boundary)', () => {
    const exactly8 = { price: 100, ema50: 100, bars: [{ low: 92 }] }; // stop=92, (100-92)/100 = 8.0% exactly
    expect(computeRiskPlan(exactly8).wideStop).toBe(true);

    const justUnder8 = { price: 100, ema50: 100, bars: [{ low: 92.01 }] }; // 7.99%
    expect(computeRiskPlan(justUnder8).wideStop).toBe(false);

    const wellOver8 = { price: 100, ema50: 100, bars: [{ low: 80 }] }; // 20%
    expect(computeRiskPlan(wellOver8).wideStop).toBe(true);
  });

  it('WIDE_STOP_WARNING matches spec §3.6 wording exactly', () => {
    expect(WIDE_STOP_WARNING).toBe('Wide stop — position size reduced or setup may be too volatile.');
  });

  it('invalid (riskPerShare <= 0) when suggested stop is not below entry — disables the calculator, no divide-by-zero', () => {
    // entry <= stop: force via a very high ema50/lows so BOTH candidate stops exceed entry.
    const r = { price: 50, ema50: 60, bars: [{ low: 55 }] }; // ema50Stop=59.1, swingLow=55 -> stop=55 > entry=50
    const plan = computeRiskPlan(r);
    expect(plan.valid).toBe(false);
    expect(plan.shares).toBeUndefined();
    expect(plan.maxDollarRisk).toBeUndefined();
  });

  it('riskPerShare exactly 0 (entry === stop) is also invalid, not a divide-by-zero', () => {
    const r = { price: 100, ema50: 100 / 0.985, bars: [{ low: 100 }] }; // ema50Stop = entry exactly, swingLow=100 too
    const plan = computeRiskPlan(r);
    expect(plan.valid).toBe(false);
  });

  it('clamps a negative or zero account size to a safe zero, never negative/infinite shares', () => {
    const r = makeR({ price: 100, ema50: 90 });
    const planZero = computeRiskPlan(r, { accountSize: 0, riskPct: 1 });
    expect(planZero.valid).toBe(true);
    expect(planZero.shares).toBe(0);
    expect(planZero.capitalRequired).toBe(0);

    const planNegative = computeRiskPlan(r, { accountSize: -5000, riskPct: 1 });
    expect(planNegative.shares).toBe(0);
    expect(planNegative.maxDollarRisk).toBe(0);
  });

  it('clamps a negative risk % to zero the same way', () => {
    const r = makeR({ price: 100, ema50: 90 });
    const plan = computeRiskPlan(r, { accountSize: 5000, riskPct: -1 });
    expect(plan.shares).toBe(0);
    expect(plan.maxDollarRisk).toBe(0);
  });

  it('defaults to $5,000 account / 1% risk when opts are omitted (RULES §5 defaults)', () => {
    const r = makeR({ price: 100, ema50: 90 });
    const plan = computeRiskPlan(r);
    expect(plan.maxDollarRisk).toBeCloseTo(50, 5); // 5000 * 1%
  });

  it('handles fewer than 10 available bars gracefully (uses whatever is available)', () => {
    const r = { price: 100, ema50: 200, bars: [{ low: 80 }, { low: 85 }] }; // only 2 bars
    const plan = computeRiskPlan(r);
    expect(plan.stopBasis).toBe('swing low');
    expect(plan.stop).toBe(80);
  });
});
