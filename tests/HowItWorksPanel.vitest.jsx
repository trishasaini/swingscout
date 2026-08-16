import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import HowItWorksPanel from '../src/components/HowItWorksPanel';

describe('HowItWorksPanel', () => {
  it('explains all six hard filters (RULES.md §1)', () => {
    render(<HowItWorksPanel />);
    expect(screen.getByText(/\$20–\$200/)).toBeInTheDocument();
    expect(screen.getByText(/Beta above 1.2/)).toBeInTheDocument();
    expect(screen.getByText(/1,000,000 shares\/day/)).toBeInTheDocument();
    expect(screen.getByText(/10% above its 50-day trend line/)).toBeInTheDocument();
    expect(screen.getByText(/RSI between 38–50/)).toBeInTheDocument();
    expect(screen.getByText(/14 days/)).toBeInTheDocument();
  });

  it('explains all four pullback signals (RULES.md §4)', () => {
    render(<HowItWorksPanel />);
    expect(screen.getByText(/Small daily price swings/)).toBeInTheDocument();
    expect(screen.getByText(/Overlapping days/)).toBeInTheDocument();
    expect(screen.getByText(/Lighter trading volume/)).toBeInTheDocument();
    expect(screen.getByText(/50-day trend line still rising/)).toBeInTheDocument();
  });

  it('shows all three verdict colors with their meaning', () => {
    render(<HowItWorksPanel />);
    expect(screen.getByText('BUY SETUP')).toBeInTheDocument();
    expect(screen.getByText('NOT YET')).toBeInTheDocument();
    expect(screen.getByText('AVOID')).toBeInTheDocument();
  });

  it('shows all three market-health colors with their meaning', () => {
    render(<HowItWorksPanel />);
    expect(screen.getByText('GREEN')).toBeInTheDocument();
    expect(screen.getByText('YELLOW')).toBeInTheDocument();
    expect(screen.getByText('RED')).toBeInTheDocument();
    expect(screen.getByText(/never removes a stock from the list/)).toBeInTheDocument();
  });

  it('includes a not-financial-advice disclaimer', () => {
    render(<HowItWorksPanel />);
    expect(screen.getByText(/is a recommendation to buy or sell/)).toBeInTheDocument();
  });
});
