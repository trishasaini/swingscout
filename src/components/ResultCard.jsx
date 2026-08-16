import VerdictBadge from './VerdictBadge';
import BreakdownTable from './BreakdownTable';

// ResultCard — a stock that passed all six hard filters (spec §3.2 fields +
// RULES.md §7: plain-language verdict leads, numeric breakdown table underneath).
export default function ResultCard({ r }) {
  return (
    <article className={`card card-${r.verdictColor}`}>
      <header className="card-head">
        <span className="tk">{r.ticker}</span>
        <span className="nm">{r.name}</span>
        <VerdictBadge verdict={r.verdict} color={r.verdictColor} />
      </header>

      <p className="verdict-line">
        <strong>{r.verdict}</strong> — {r.verdictSummary}
      </p>

      <dl className="metrics">
        <div>
          <dt>Price</dt>
          <dd>${r.price.toFixed(2)}</dd>
        </div>
        <div>
          <dt>EMA50 ext.</dt>
          <dd>
            ${r.ema50.toFixed(2)} (+{r.extensionPct.toFixed(1)}%)
          </dd>
        </div>
        <div>
          <dt>RSI</dt>
          <dd>{r.rsi.toFixed(1)}</dd>
        </div>
        <div>
          <dt>Beta</dt>
          <dd>{r.beta.toFixed(2)}</dd>
        </div>
        <div>
          <dt>Earnings</dt>
          <dd>{r.daysToEarnings != null ? `in ${r.daysToEarnings}d` : 'none scheduled'}</dd>
        </div>
      </dl>

      <BreakdownTable signals={r.signals} />
    </article>
  );
}
