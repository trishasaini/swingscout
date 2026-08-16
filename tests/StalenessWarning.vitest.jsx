import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StalenessWarning from '../src/components/StalenessWarning';

// Mirrors STALE_THRESHOLD_DAYS=3 from src/lib/staleness.js — this test relies
// on the REAL current time (Date.now()) rather than injecting `now`, since the
// component itself doesn't expose that seam; dates are built relative to
// "today" so the test stays correct regardless of when it's actually run.
function daysAgoStr(days) {
  const d = new Date(Date.now() - days * 24 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

describe('StalenessWarning', () => {
  it('renders nothing when data is fresh (today)', () => {
    const { container } = render(<StalenessWarning dataAsOf={daysAgoStr(0)} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for a normal 1-2 day gap (e.g. a weekend)', () => {
    const { container: c1 } = render(<StalenessWarning dataAsOf={daysAgoStr(1)} />);
    expect(c1.firstChild).toBeNull();
    const { container: c2 } = render(<StalenessWarning dataAsOf={daysAgoStr(2)} />);
    expect(c2.firstChild).toBeNull();
  });

  it('renders nothing when dataAsOf is null (a load error is a separate concern)', () => {
    const { container } = render(<StalenessWarning dataAsOf={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a warning once data is genuinely old', () => {
    render(<StalenessWarning dataAsOf={daysAgoStr(6)} />);
    expect(screen.getByText(/data is 6 days old/)).toBeInTheDocument();
    expect(screen.getByText(/nightly refresh may have failed/)).toBeInTheDocument();
  });
});
