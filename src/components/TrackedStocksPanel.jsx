// TrackedStocksPanel — "what does this scan even look at?" Answers it from
// data.json itself rather than a separate hardcoded ticker list: every ticker
// in the watchlist ends up in exactly one of results/rejected/excludedLowBeta/
// errors (scripts/refresh.js's scoreTicker never drops one silently), so their
// union IS the full scanned universe for this run — no second source of truth
// to drift out of sync with scripts/watchlist.js.
const STATUS_LABEL = {
  result: 'Candidate today',
  rejected: 'Rejected today',
  excluded: 'Excluded — Beta below 1.2',
  error: 'Data error',
};

function collectUniverse(data) {
  const rows = [
    ...(data.results ?? []).map((r) => ({ ...r, status: 'result' })),
    ...(data.rejected ?? []).map((r) => ({ ...r, status: 'rejected' })),
    ...(data.excludedLowBeta ?? []).map((r) => ({ ...r, status: 'excluded' })),
    ...(data.errors ?? []).map((r) => ({ ...r, status: 'error' })),
  ];
  return rows.sort((a, b) => a.ticker.localeCompare(b.ticker));
}

export default function TrackedStocksPanel({ data }) {
  const universe = collectUniverse(data);

  return (
    <div className="info-panel">
      <p className="info-panel-intro">
        This is every stock this scan looked at last run ({universe.length} total) — technology,
        fintech, and AI-infrastructure companies, hand-picked ahead of time. It never buys or sells
        anything on its own; it only reads and reports.
      </p>
      <ul className="plain-list tracked-list">
        {universe.map((r) => (
          <li key={r.ticker}>
            <span className="tk">{r.ticker}</span>
            <span className="nm">{r.name}</span>
            <span className="muted status-tag">{STATUS_LABEL[r.status]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
