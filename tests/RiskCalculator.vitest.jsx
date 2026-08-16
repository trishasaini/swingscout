import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RiskCalculator from '../src/components/RiskCalculator';

function makeR({ price = 100, ema50 = 90, lows = [92, 93, 94, 95, 96, 97, 98, 99, 100, 101] } = {}) {
  return { price, ema50, bars: lows.map((low) => ({ low })) };
}

// Reads the <dd> paired with a <dt>label</dt> — robust against multiple
// fields coincidentally sharing the same displayed value (e.g. entry and max
// $ risk both reading "$100.00"), which plain getByText(value) cannot
// disambiguate and correctly rejects as ambiguous.
function metricText(container, label) {
  const dts = Array.from(container.querySelectorAll('dt'));
  const dt = dts.find((el) => el.textContent === label);
  if (!dt) throw new Error(`No <dt> found with text "${label}"`);
  return dt.nextElementSibling.textContent;
}

describe('RiskCalculator', () => {
  it('renders default account size ($5,000) and risk % (1%) inputs', () => {
    render(<RiskCalculator r={makeR()} />);
    const accountInput = screen.getByLabelText(/Account size/i);
    const riskInput = screen.getByLabelText(/Risk per trade/i);
    expect(accountInput.value).toBe('5000');
    expect(riskInput.value).toBe('1');
  });

  it('renders suggested entry, stop, basis, risk/share, max $ risk, shares, capital required', () => {
    // ema50Stop = 90*0.985 = 88.65 (lower than swing low 92) -> basis EMA50 support.
    const { container } = render(<RiskCalculator r={makeR({ price: 100, ema50: 90 })} />);
    expect(metricText(container, 'Suggested entry')).toBe('$100.00');
    expect(metricText(container, 'Suggested stop')).toBe('$88.65');
    expect(metricText(container, 'Stop basis')).toBe('EMA50 support');
    expect(metricText(container, 'Risk/share')).toBe('$11.35');
    expect(metricText(container, 'Max $ risk')).toBe('$50.00'); // 5000 * 1%
    expect(metricText(container, 'Shares')).toBe(String(Math.floor(50 / 11.35)));
  });

  it('recomputes live when the account size input changes', () => {
    const { container } = render(<RiskCalculator r={makeR({ price: 100, ema50: 90 })} />);
    const accountInput = screen.getByLabelText(/Account size/i);
    fireEvent.change(accountInput, { target: { value: '20000' } });
    expect(metricText(container, 'Max $ risk')).toBe('$200.00'); // 20000 * 1%
  });

  it('recomputes live when the risk % input changes', () => {
    const { container } = render(<RiskCalculator r={makeR({ price: 100, ema50: 90 })} />);
    const riskInput = screen.getByLabelText(/Risk per trade/i);
    fireEvent.change(riskInput, { target: { value: '3' } });
    expect(metricText(container, 'Max $ risk')).toBe('$150.00'); // 5000 * 3%
  });

  it('shows the wide-stop warning when the stop is >=8% below entry', () => {
    // entry=100, ema50=100 -> ema50Stop=98.5; swing low=80 (well past 8%) -> stop=80 -> 20% away.
    render(<RiskCalculator r={makeR({ price: 100, ema50: 100, lows: [80, 96, 97, 98, 99, 100, 101, 102, 103, 104] })} />);
    expect(screen.getByText('Wide stop — position size reduced or setup may be too volatile.')).toBeInTheDocument();
  });

  it('does NOT show the wide-stop warning for a normal, tight stop', () => {
    // entry=100, ema50=99 -> ema50Stop=97.515 (~2.5% away), swing low=98 -> stop=97.515, not wide.
    render(<RiskCalculator r={makeR({ price: 100, ema50: 99, lows: [98, 98.5, 99, 99.5, 100, 100.5, 101, 101.5, 102, 102.5] })} />);
    expect(screen.queryByText('Wide stop — position size reduced or setup may be too volatile.')).not.toBeInTheDocument();
  });

  it('shows a disabled/explanatory state (not the metrics table) when riskPerShare <= 0', () => {
    // Force stop >= entry: high ema50 and high lows, both candidate stops exceed entry.
    const r = { price: 50, ema50: 60, bars: [{ low: 55 }] };
    render(<RiskCalculator r={r} />);
    expect(screen.getByText(/position sizing unavailable for this setup/)).toBeInTheDocument();
    expect(screen.queryByText('Shares')).not.toBeInTheDocument();
    expect(screen.queryByText(/Max \$ risk/i)).not.toBeInTheDocument();
  });

  it('clamps a manually-entered negative account size to a safe zero (no negative shares)', () => {
    const { container } = render(<RiskCalculator r={makeR({ price: 100, ema50: 90 })} />);
    const accountInput = screen.getByLabelText(/Account size/i);
    fireEvent.change(accountInput, { target: { value: '-5000' } });
    expect(metricText(container, 'Shares')).toBe('0');
    expect(metricText(container, 'Max $ risk')).toBe('$0.00');
    expect(metricText(container, 'Capital required')).toBe('$0.00');
  });
});
