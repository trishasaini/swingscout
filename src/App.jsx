import { useEffect, useState } from 'react';

// SwingScout SPA — Phase 1 scaffold.
// The full Results UI / chart panel / risk calculator land in later phases.
// For now this proves the pipeline: it loads the nightly data.json, shows the
// mandatory "Data as of" label, and clearly flags demo (non-live) data.
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
        <div className="asof">Data as of {formatAsOf(data.generatedAt)}</div>
      </header>

      {isDemo && (
        <div className="demo-banner">
          ⚠️ DEMO DATA — these numbers are synthetic, not live market data. Do not
          trade on them.
        </div>
      )}

      <section className="summary">
        <p>
          Scanned <strong>{data.universeCount ?? '—'}</strong> stocks ·{' '}
          <strong>{data.results?.length ?? 0}</strong> passed all six hard filters ·{' '}
          <strong>{data.rejected?.length ?? 0}</strong> rejected
          {data.errors?.length ? <> · <strong>{data.errors.length}</strong> data errors</> : null}
        </p>
        <p className="muted">
          Phase 1 scaffold. Results cards, chart panel, and the risk calculator
          are coming in the next phases — this screen confirms the nightly data
          pipeline works end to end.
        </p>
      </section>

      {data.results?.length > 0 && (
        <ul className="peek">
          {data.results.slice(0, 10).map((r) => (
            <li key={r.ticker}>
              <span className={`badge ${r.verdictColor}`}>{r.verdict}</span>
              <span className="tk">{r.ticker}</span>
              <span className="muted">
                ${r.price?.toFixed(2)} · RSI {r.rsi?.toFixed(1)} · ext{' '}
                {r.extensionPct?.toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
