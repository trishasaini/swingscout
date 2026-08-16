// HowItWorksPanel — plain-language explainer for a non-technical user (RULES.md
// §7). Static content, not derived from data.json — it explains the RULE SET
// (RULES.md §1, §4, §5), not any one night's numbers. Keep this in sync by hand
// whenever RULES.md changes; nothing here should contradict it.
export default function HowItWorksPanel() {
  return (
    <div className="info-panel">
      <p className="info-panel-intro">
        Every night, this program looks through a fixed list of large, well-known tech and fintech
        stocks for one specific pattern: a strong stock that's taking a brief "breather" (a
        pullback) before likely continuing higher. It never predicts the future and it's not
        financial advice — it just flags stocks matching this pattern using real market numbers,
        and shows you exactly why.
      </p>

      <h3>Step 1 — Six pass/fail checks</h3>
      <p className="muted">
        A stock must pass <strong>all six</strong> of these to be shown as a candidate at all. Fail
        even one and it's dropped (or, for the Beta check, hidden entirely).
      </p>
      <ul className="howitworks-list">
        <li><strong>Price $20–$200</strong> — not a penny stock, not too pricey to size a position.</li>
        <li><strong>Beta above 1.2</strong> — moves more than the overall market; a market-hugger isn't worth the trade. Stocks below this bar aren't shown at all, not even as "rejected."</li>
        <li><strong>Average volume over 1,000,000 shares/day</strong> — enough buyers and sellers that you can actually get in and out.</li>
        <li><strong>Within 10% above its 50-day trend line</strong> — still close to its recent uptrend, not overextended and not broken down (below the line fails too — that's a broken trend, not a pullback).</li>
        <li><strong>RSI between 38–50</strong> — a momentum gauge; this range means "cooled off, not crashing."</li>
        <li><strong>No earnings report within 14 days</strong> — earnings can cause wild, unpredictable swings that have nothing to do with the chart pattern.</li>
      </ul>

      <h3>Step 2 — Is the pullback calm or dangerous?</h3>
      <p className="muted">
        For stocks that pass all six checks, the last 5–10 trading days get checked for four signs
        of a healthy pause:
      </p>
      <ul className="howitworks-list">
        <li><strong>Small daily price swings</strong> — not sharp, panicky drops.</li>
        <li><strong>Overlapping days</strong> — the stock is consolidating sideways, not falling in a straight line.</li>
        <li><strong>Lighter trading volume during the dip</strong> — no one's rushing for the exits.</li>
        <li><strong>50-day trend line still rising</strong> — the underlying uptrend is intact.</li>
      </ul>

      <h3>Step 3 — What the colors mean</h3>
      <ul className="howitworks-list">
        <li><span className="badge green">BUY SETUP</span> all four signs look calm and healthy.</li>
        <li><span className="badge yellow">NOT YET</span> mixed signals — worth watching, not worth acting on yet.</li>
        <li><span className="badge red">AVOID</span> a sharp drop, heavy selling, or a broken uptrend — skip it.</li>
      </ul>
      <p className="muted">
        Every result also shows the actual numbers behind its color — you never have to just take
        its word for it.
      </p>

      <h3>Market Health banner — a weather report, not a filter</h3>
      <p className="muted">
        Separately, a banner near the top reports on the market as a whole (using QQQ, a fund that
        tracks 100 large tech-heavy stocks), never on any one stock:
      </p>
      <ul className="howitworks-list">
        <li><span className="badge green">GREEN</span> the broader market is healthy — generally a good time to consider new positions.</li>
        <li><span className="badge yellow">YELLOW</span> mixed — consider a smaller position size or waiting.</li>
        <li><span className="badge red">RED</span> the broader market is weak — be extra cautious even if a stock's own setup looks good.</li>
      </ul>
      <p className="muted">
        This banner never removes a stock from the list — it's context, not a verdict.
      </p>

      <p className="info-panel-disclaimer">
        None of this is a recommendation to buy or sell anything. It's a tool for spotting a
        specific chart pattern using real data — always double-check before acting on it.
      </p>
    </div>
  );
}
