import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ResultCard from '../src/components/ResultCard';
import { makeResult, makeNotYetResult, makeAvoidResult } from './fixtures';

describe('ResultCard', () => {
  it('renders ticker, name, price, RSI, beta from the fixture data', () => {
    render(<ResultCard r={makeResult()} />);
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
    expect(screen.getByText('$123.45')).toBeInTheDocument();
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
});
