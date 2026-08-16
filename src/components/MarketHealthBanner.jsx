// MarketHealthBanner — top-of-page QQQ status (RULES.md §5 / spec §3.7).
// Advisory only: shown once, never gates or filters the results below it.
export default function MarketHealthBanner({ marketHealth }) {
  if (!marketHealth) {
    return (
      <div className="market-health market-health-unavailable">
        Market health unavailable (QQQ data could not be fetched) — stock results below are unaffected.
      </div>
    );
  }

  const { status, message, qqqPrice, ema20, ema50 } = marketHealth;

  return (
    <div className={`market-health market-health-${status.toLowerCase()}`}>
      <span className="market-health-status">{status}</span>
      <span className="market-health-message">{message}</span>
      <span className="market-health-detail">
        QQQ ${qqqPrice.toFixed(2)} · EMA20 ${ema20.toFixed(2)} · EMA50 ${ema50.toFixed(2)}
      </span>
    </div>
  );
}
