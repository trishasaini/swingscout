import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import App from '../src/App';
import { makeData, makeResult, makeNotYetResult, makeAvoidResult, makeRejected, makeExcluded, makeError } from './fixtures';

// Mocks the browser fetch('data.json') call App.jsx makes on mount. Real
// network/file-loading is out of scope here — this tests the REAL App.jsx
// render logic against a controlled data shape, matching exactly what
// scripts/refresh.js's assemble() actually emits (see fixtures.js).
function mockFetchOnce(data, { ok = true } = {}) {
  global.fetch = vi.fn().mockResolvedValue({ ok, json: async () => data });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('App', () => {
  it('shows "Data as of" using dataAsOf (the actual market data date), not generatedAt (script run time)', async () => {
    // Dates chosen 5 months apart so the assertion holds regardless of the
    // test runner's local timezone offset (a 1-day-apart pair could collide
    // near a UTC/local midnight boundary and pass either way — this can't).
    mockFetchOnce(makeData({ dataAsOf: '2026-01-05', generatedAt: '2026-06-20T02:00:00.000Z' }));
    render(<App />);
    const asof = await screen.findByText(/Data as of/);
    expect(asof.textContent).toMatch(/Jan/);
    expect(asof.textContent).not.toMatch(/Jun/);
  });

  it('does not show the demo banner for live data (demo: false)', async () => {
    mockFetchOnce(makeData({ demo: false }));
    render(<App />);
    await screen.findByText(/Data as of/);
    expect(screen.queryByText(/DEMO DATA/)).not.toBeInTheDocument();
  });

  it('shows a loud demo banner when demo: true', async () => {
    mockFetchOnce(makeData({ demo: true }));
    render(<App />);
    expect(await screen.findByText(/DEMO DATA/)).toBeInTheDocument();
  });

  it('shows a real empty-state message when results is empty, not a blank screen', async () => {
    mockFetchOnce(makeData({ results: [] }));
    render(<App />);
    expect(await screen.findByText(/No stocks passed all six hard filters/)).toBeInTheDocument();
    expect(screen.queryByText('BUY SETUP')).not.toBeInTheDocument();
  });

  it('renders one card per result and preserves array order (does not re-sort in the UI)', async () => {
    // Deliberately "wrong" order (higher RSI first) — the component must render
    // exactly as given; sorting is assemble()'s job (scripts/refresh.js), not the UI's.
    const first = makeResult({ ticker: 'ZZZZ', rsi: 49 });
    const second = makeResult({ ticker: 'AAAA', rsi: 38 });
    mockFetchOnce(makeData({ results: [first, second] }));
    render(<App />);
    await screen.findByText('ZZZZ');
    const tickers = screen.getAllByText(/^(ZZZZ|AAAA)$/).map((el) => el.textContent);
    expect(tickers).toEqual(['ZZZZ', 'AAAA']);
  });

  it('renders all three verdict types together without crashing', async () => {
    mockFetchOnce(makeData({ results: [makeResult(), makeNotYetResult(), makeAvoidResult()] }));
    render(<App />);
    // Each verdict string legitimately appears twice per card (badge + headline).
    await screen.findAllByText('BUY SETUP');
    expect(screen.getAllByText('NOT YET').length).toBeGreaterThan(0);
    expect(screen.getAllByText('AVOID').length).toBeGreaterThan(0);
  });

  it('renders the rejected section with failReason, including a long reason string in full', async () => {
    const longReason = 'Extension 47.32% outside 0–10% (' + 'very '.repeat(20) + 'extended)';
    mockFetchOnce(makeData({ rejected: [makeRejected({ ticker: 'LONGCO', failReason: longReason })] }));
    render(<App />);
    const item = await screen.findByText('LONGCO');
    const li = item.closest('li');
    expect(within(li).getByText(longReason)).toBeInTheDocument();
  });

  it('does not render a rejected section at all when rejected is empty', async () => {
    mockFetchOnce(makeData({ rejected: [] }));
    render(<App />);
    await screen.findByText(/Data as of/);
    expect(screen.queryByText(/^Rejected/)).not.toBeInTheDocument();
  });

  it('renders the excluded-low-beta section with ticker and beta value', async () => {
    mockFetchOnce(makeData({ excludedLowBeta: [makeExcluded({ ticker: 'TSM', beta: 1.08 })] }));
    render(<App />);
    await screen.findByText('TSM');
    expect(screen.getByText(/beta 1\.08/)).toBeInTheDocument();
  });

  it('surfaces a non-empty errors[] as an actual list of items, not just a count', async () => {
    mockFetchOnce(
      makeData({
        errors: [makeError({ ticker: 'AAA', reason: 'polygon HTTP 500' }), makeError({ ticker: 'BBB', reason: 'missing Beta from yfinance' })],
      })
    );
    render(<App />);
    await screen.findByText('AAA');
    expect(screen.getByText('BBB')).toBeInTheDocument();
    expect(screen.getByText('polygon HTTP 500')).toBeInTheDocument();
    expect(screen.getByText('missing Beta from yfinance')).toBeInTheDocument();
  });

  it('does not render an errors section at all when errors is empty', async () => {
    mockFetchOnce(makeData({ errors: [] }));
    render(<App />);
    await screen.findByText(/Data as of/);
    expect(screen.queryByText(/Data errors/)).not.toBeInTheDocument();
  });

  it('falls back to data.demo.json when data.json is unavailable, and flags it as demo', async () => {
    let call = 0;
    global.fetch = vi.fn().mockImplementation(async (url) => {
      call += 1;
      if (String(url).includes('data.json') && !String(url).includes('demo')) {
        return { ok: false, json: async () => ({}) };
      }
      return { ok: true, json: async () => makeData({ demo: true }) };
    });
    render(<App />);
    expect(await screen.findByText(/DEMO DATA/)).toBeInTheDocument();
    expect(call).toBeGreaterThanOrEqual(2);
  });

  it('shows an error message (not a crash) when neither data.json nor data.demo.json exist', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    render(<App />);
    expect(await screen.findByText(/Could not load scan data/)).toBeInTheDocument();
  });
});
