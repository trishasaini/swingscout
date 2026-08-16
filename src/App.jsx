import { useEffect, useState } from 'react';
import ResultCard from './components/ResultCard';
import MarketHealthBanner from './components/MarketHealthBanner';
import StalenessWarning from './components/StalenessWarning';
import TrackedStocksPanel from './components/TrackedStocksPanel';
import HowItWorksPanel from './components/HowItWorksPanel';

// SwingScout SPA — the real results page (Phases 1-3).
//
// Data-source rule (RULES.md §3): the browser only READS numbers. It never
// invents, interpolates, or estimates price/RSI/EMA. If live data is missing we
// fall back to data.demo.json ONLY with a loud banner so demo values are never
// mistaken for real ones.

async function loadData() {
  // Prefer live data; fall back to demo so the app is developable without keys.
  try {
    const live = await fetch('data.json', { cache: 'no-store' });
    if (live.ok) return { data: await live.json(), source: 'live' };
  } catch {
    /* fall through to demo */
  }
  const demo = await fetch('data.demo.json', { cache: 'no-store' });
  if (demo.ok) return { data: await demo.json(), source: 'demo' };
  throw new Error('No data.json or data.demo.json found.');
}

function formatAsOf(iso) {
  if (!iso) return 'unknown';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function App() {
  const [state, setState] = useState({ status: 'loading' });
  // Mutually exclusive, like tabs — both are page-level static/reference
  // panels rather than per-card detail (see ResultCard's inline-chart
  // pattern), so keeping only one open at a time avoids an overwhelming page.
  const [activePanel, setActivePanel] = useState(null);
  const togglePanel = (name) => setActivePanel((cur) => (cur === name ? null : name));

  useEffect(() => {
    loadData()
      .then(({ data, source }) => setState({ status: 'ready', data, source }))
      .catch((err) => setState({ status: 'error', error: err.message }));
  }, []);

  if (state.status === 'loading') {
    return <main className="app"><p className="muted">Loading latest scan…</p></main>;
  }
  if (state.status === 'error') {
    return (
      <main className="app">
        <h1>SwingScout</h1>
        <p className="error">
          Could not load scan data: {state.error}
          <br />
          Run <code>npm run refresh:demo</code> to generate sample data.
        </p>
      </main>
    );
  }

  const { data, source } = state;
  const isDemo = source === 'demo' || data.demo === true;

  return (
    <main className="app">
      <header className="topbar">
        <h1>SwingScout</h1>
        <div className="asof">Data as of {formatAsOf(data.dataAsOf)}</div>
      </header>

      <nav className="toolbar">
        <button
          type="button"
          className="toolbar-btn"
          aria-pressed={activePanel === 'stocks'}
          onClick={() => togglePanel('stocks')}
        >
          {activePanel === 'stocks' ? 'Hide Stocks We Track' : 'Stocks We Track'}
        </button>
        <button
          type="button"
          className="toolbar-btn"
          aria-pressed={activePanel === 'how'}
          onClick={() => togglePanel('how')}
        >
          {activePanel === 'how' ? 'Hide How This Works' : 'How This Works'}
        </button>
      </nav>
      {activePanel === 'stocks' && <TrackedStocksPanel data={data} />}
      {activePanel === 'how' && <HowItWorksPanel />}

      {isDemo && (
        <div className="demo-banner">
          ⚠️ DEMO DATA — these numbers are synthetic, not live market data. Do not
          trade on them.
        </div>
      )}

      <StalenessWarning dataAsOf={data.dataAsOf} />
      <MarketHealthBanner marketHealth={data.marketHealth} />

      <section className="summary">
        <p>
          Scanned <strong>{data.universeCount ?? '—'}</strong> stocks ·{' '}
          <strong>{data.results?.length ?? 0}</strong> passed all six hard filters ·{' '}
          <strong>{data.rejected?.length ?? 0}</strong> rejected
          {data.errors?.length ? <> · <strong>{data.errors.length}</strong> data errors</> : null}
        </p>
      </section>

      <section className="results" aria-label="Results">
        {(data.results?.length ?? 0) === 0 ? (
          <p className="empty-state">
            No stocks passed all six hard filters in this scan. Check back after
            the next nightly refresh.
          </p>
        ) : (
          data.results.map((r) => <ResultCard key={r.ticker} r={r} />)
        )}
      </section>

      {data.rejected?.length > 0 && (
        <section className="rejected" aria-label="Rejected">
          <h2>Rejected ({data.rejected.length})</h2>
          <ul className="plain-list">
            {data.rejected.map((r) => (
              <li key={r.ticker}>
                <span className="tk">{r.ticker}</span>
                <span className="muted">{r.name}</span>
                <span className="fail-reason">{r.failReason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.excludedLowBeta?.length > 0 && (
        <section className="excluded" aria-label="Excluded, low beta">
          <h2>Excluded — Beta below 1.2 ({data.excludedLowBeta.length})</h2>
          <ul className="plain-list">
            {data.excludedLowBeta.map((r) => (
              <li key={r.ticker}>
                <span className="tk">{r.ticker}</span>
                <span className="muted">{r.name}</span>
                <span className="muted">beta {r.beta.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.errors?.length > 0 && (
        <section className="errors" aria-label="Data errors">
          <h2>Data errors ({data.errors.length})</h2>
          <ul className="plain-list">
            {data.errors.map((r) => (
              <li key={r.ticker}>
                <span className="tk">{r.ticker}</span>
                <span className="muted">{r.name}</span>
                <span className="fail-reason">{r.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
