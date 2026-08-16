import { useState } from 'react';
import { computeRiskPlan, WIDE_STOP_WARNING } from '../lib/riskCalc';

// RiskCalculator — position sizing & suggested stop (RULES.md §5, spec §3.6).
// Shown for BUY SETUP / NOT YET results only (gated by the caller, ResultCard)
// — spec: "For every BUY SETUP or NOT YET result." Account size / risk % are
// editable inputs, defaulting to RULES' $5,000 / 1%.
export default function RiskCalculator({ r }) {
  const [accountSize, setAccountSize] = useState(5000);
  const [riskPct, setRiskPct] = useState(1);

  const plan = computeRiskPlan(r, { accountSize, riskPct });

  return (
    <div className="risk-calc">
      <h4>Position Size &amp; Stop</h4>

      <div className="risk-inputs">
        <label>
          Account size ($)
          <input
            type="number"
            min="0"
            step="100"
            value={accountSize}
            onChange={(e) => setAccountSize(Number(e.target.value))}
          />
        </label>
        <label>
          Risk per trade (%)
          <input
            type="number"
            min="0"
            step="0.1"
            value={riskPct}
            onChange={(e) => setRiskPct(Number(e.target.value))}
          />
        </label>
      </div>

      {!plan.valid ? (
        <p className="risk-invalid">
          Suggested stop (${plan.stop.toFixed(2)}, based on {plan.stopBasis}) is not below entry ($
          {plan.entry.toFixed(2)}) — position sizing unavailable for this setup.
        </p>
      ) : (
        <>
          <dl className="risk-metrics">
            <div>
              <dt>Suggested entry</dt>
              <dd>${plan.entry.toFixed(2)}</dd>
            </div>
            <div>
              <dt>Suggested stop</dt>
              <dd>${plan.stop.toFixed(2)}</dd>
            </div>
            <div>
              <dt>Stop basis</dt>
              <dd>{plan.stopBasis}</dd>
            </div>
            <div>
              <dt>Risk/share</dt>
              <dd>${plan.riskPerShare.toFixed(2)}</dd>
            </div>
            <div>
              <dt>Max $ risk</dt>
              <dd>${plan.maxDollarRisk.toFixed(2)}</dd>
            </div>
            <div>
              <dt>Shares</dt>
              <dd>{plan.shares}</dd>
            </div>
            <div>
              <dt>Capital required</dt>
              <dd>${plan.capitalRequired.toFixed(2)}</dd>
            </div>
          </dl>
          {plan.wideStop && <p className="risk-warning">{WIDE_STOP_WARNING}</p>}
        </>
      )}
    </div>
  );
}
