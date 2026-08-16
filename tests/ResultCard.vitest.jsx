import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ResultCard from '../src/components/ResultCard';
import { makeResult, makeNotYetResult, makeAvoidResult } from './fixtures';

// ResultCard renders a REAL ChartPanel child when expanded, which calls the
// real lightweight-charts unless mocked (canvas APIs jsdom doesn't support).
// ChartPanel's own internals are already thoroughly covered in
// ChartPanel.vitest.jsx — this file only needs to confirm ResultCard wires
// the toggle and props through correctly, so a minimal no-op mock suffices.
vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => ({
    addCandlestickSeries: vi.fn(() => ({ setData: vi.fn(), setMarkers: vi.fn() })),
    addHistogramSeries: vi.fn(() => ({ setData: vi.fn(), priceScale: vi.fn(() => ({ applyOptions: vi.fn() })) })),
    addLineSeries: vi.fn(() => ({ setData: vi.fn(), createPriceLine: vi.fn() })),
    timeScale: vi.fn(() => ({
      fitContent: vi.fn(),
      subscribeVisibleLogicalRangeChange: vi.fn(),
      unsubscribeVisibleLogicalRangeChange: vi.fn(),
      setVisibleLogicalRange: vi.fn(),
    })),
    applyOptions: vi.fn(),
    remove: vi.fn(),
  })),
}));

describe('ResultCard', () => {
  it('renders ticker, name, price, RSI, beta from the fixture data', () => {
    const { container } = render(<ResultCard r={makeResult()} />);
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
    // Scoped to the top metrics block: "$123.45" also legitimately appears
    // again inside RiskCalculator's "Suggested entry" (entry === price), so a
    // page-wide getByText would be ambiguous — that duplication is correct
    // behavior, not a bug, so the test scopes rather than avoids it.
    const metrics = container.querySelector('dl.metrics');
    expect(metrics.textContent).toContain('$123.45');
    expect(screen.getByText('44.5')).toBeInTheDocument();
    expect(screen.getByText('1.80')).toBeInTheDocument();
  });

  it('leads with the plain-language verdict text BEFORE the breakdown table in DOM order (RULES §7)', () => {
    const { container } = render(<ResultCard r={makeResult()} />);
    const verdictEl = container.querySelector('.verdict-line');
    const tableEl = container.querySelector('table.breakdown');
    expect(verdictEl).not.toBeNull();
    expect(tableEl).not.toBeNull();
    // DOCUMENT_POSITION_FOLLOWING (4) means tableEl comes AFTER verdictEl.
    // eslint-disable-next-line no-bitwise
    expect(verdictEl.compareDocumentPosition(tableEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows the full "VERDICT — summary" headline verbatim (RULES §7 example format)', () => {
    const { container } = render(<ResultCard r={makeResult()} />);
    // "BUY SETUP" legitimately appears twice (badge + headline) — scope to the
    // verdict-line specifically rather than searching the whole document.
    const verdictLine = container.querySelector('.verdict-line');
    expect(verdictLine.textContent).toBe('BUY SETUP — small candles, calm volume, uptrend intact');
  });

  it('renders all 4 signal rows in the breakdown table with correct pass/fail marks', () => {
    render(<ResultCard r={makeNotYetResult()} />);
    // makeNotYetResult: candleSize pass, candleOverlap fail, volumeTrend fail, emaDirection pass.
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(4);
    const passRows = rows.filter((r) => r.className.includes('sig-pass'));
    const failRows = rows.filter((r) => r.className.includes('sig-fail'));
    expect(passRows).toHaveLength(2);
    expect(failRows).toHaveLength(2);
  });

  it.each([
    ['BUY SETUP', 'green', makeResult()],
    ['NOT YET', 'yellow', makeNotYetResult()],
    ['AVOID', 'red', makeAvoidResult()],
  ])('renders the %s verdict with badge color class "%s"', (verdict, color, fixture) => {
    const { container } = render(<ResultCard r={fixture} />);
    const badge = container.querySelector('.badge');
    expect(badge).toHaveTextContent(verdict);
    expect(badge.className).toContain(color);
    expect(container.querySelector(`.card-${color}`)).not.toBeNull();
  });

  it('does not recompute or override the verdict/signals — renders exactly what data.json provided', () => {
    // A deliberately "wrong-looking" combination (AVOID with an all-pass signal set)
    // must still render as-given: the component must never second-guess the pipeline.
    const weird = makeResult({ verdict: 'AVOID', verdictColor: 'red', verdictSummary: 'test override' });
    const { container } = render(<ResultCard r={weird} />);
    const verdictLine = container.querySelector('.verdict-line');
    expect(verdictLine.textContent).toBe('AVOID — test override');
    // All 4 signals in the base fixture are pass:true — component must show them as passing
    // even though the verdict says AVOID, because it's not the component's job to reconcile that.
    const rows = screen.getAllByRole('row');
    expect(rows.every((r) => r.className.includes('sig-pass'))).toBe(true);
  });

  it('"View Chart" toggles the chart panel open and closed (spec §3.2)', () => {
    render(<ResultCard r={makeResult()} />); // default fixture has empty bars -> "no chart data" fallback
    expect(screen.queryByText(/No chart data available/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'View Chart' }));
    expect(screen.getByText(/No chart data available/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide Chart' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hide Chart' }));
    expect(screen.queryByText(/No chart data available/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View Chart' })).toBeInTheDocument();
  });

  it.each([
    ['BUY SETUP', makeResult(), true],
    ['NOT YET', makeNotYetResult(), true],
    ['AVOID', makeAvoidResult(), false],
  ])('shows RiskCalculator for %s: %s (spec §3.6 — "every BUY SETUP or NOT YET result")', (verdict, fixture, shouldShow) => {
    const { container } = render(<ResultCard r={fixture} />);
    const riskCalc = container.querySelector('.risk-calc');
    if (shouldShow) {
      expect(riskCalc).not.toBeNull();
    } else {
      expect(riskCalc).toBeNull();
    }
  });

  it('passes real bars/series through to ChartPanel when expanded (props actually wired, not just some child rendering)', async () => {
    const { createChart } = await import('lightweight-charts');
    const bars = [{ time: '2026-01-01', open: 100, high: 101, low: 99, close: 100.5, volume: 1_000_000 }];
    const r = makeResult({ bars, series: { ema50: [100], ema20: [100], rsi: [45] } });
    render(<ResultCard r={r} />);
    fireEvent.click(screen.getByRole('button', { name: 'View Chart' }));
    expect(createChart).toHaveBeenCalled();
  });
});
