import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MarketHealthBanner from '../src/components/MarketHealthBanner';

describe('MarketHealthBanner', () => {
  it.each([
    ['GREEN', 'Market supports swing entries.'],
    ['YELLOW', 'Market is mixed — use smaller position size or wait for confirmation.'],
    ['RED', 'Setup is valid, but market conditions are unfavorable.'],
  ])('renders the exact spec §3.7 message for %s', (status, expectedMessage) => {
    const marketHealth = { status, message: expectedMessage, qqqPrice: 500, ema20: 490, ema50: 480 };
    const { container } = render(<MarketHealthBanner marketHealth={marketHealth} />);
    expect(screen.getByText(expectedMessage)).toBeInTheDocument();
    expect(screen.getByText(status)).toBeInTheDocument();
    expect(container.querySelector(`.market-health-${status.toLowerCase()}`)).not.toBeNull();
  });

  it('shows QQQ price and both EMA values', () => {
    const marketHealth = { status: 'GREEN', message: 'Market supports swing entries.', qqqPrice: 512.34, ema20: 500.1, ema50: 495.55 };
    render(<MarketHealthBanner marketHealth={marketHealth} />);
    expect(screen.getByText(/\$512\.34/)).toBeInTheDocument();
    expect(screen.getByText(/\$500\.10/)).toBeInTheDocument();
    expect(screen.getByText(/\$495\.55/)).toBeInTheDocument();
  });

  it('shows an "unavailable" state when marketHealth is null (QQQ fetch failed) — never crashes, never blocks', () => {
    const { container } = render(<MarketHealthBanner marketHealth={null} />);
    expect(screen.getByText(/unavailable/i)).toBeInTheDocument();
    expect(container.querySelector('.market-health-unavailable')).not.toBeNull();
    // Must not render any color-status class when unavailable.
    expect(container.querySelector('.market-health-green, .market-health-yellow, .market-health-red')).toBeNull();
  });

  it('shows the unavailable state for undefined too (not just literal null)', () => {
    render(<MarketHealthBanner marketHealth={undefined} />);
    expect(screen.getByText(/unavailable/i)).toBeInTheDocument();
  });
});
