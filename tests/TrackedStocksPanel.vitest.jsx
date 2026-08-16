import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TrackedStocksPanel from '../src/components/TrackedStocksPanel';
import { makeResult, makeRejected, makeExcluded, makeError } from './fixtures';

describe('TrackedStocksPanel', () => {
  it('lists every ticker across results, rejected, excludedLowBeta, and errors', () => {
    const data = {
      results: [makeResult({ ticker: 'AAPL', name: 'Apple Inc.' })],
      rejected: [makeRejected({ ticker: 'ZS', name: 'Zscaler Inc.' })],
      excludedLowBeta: [makeExcluded({ ticker: 'TSM', name: 'Taiwan Semiconductor' })],
      errors: [makeError({ ticker: 'XYZ', name: 'XYZ Corp' })],
    };
    render(<TrackedStocksPanel data={data} />);
    for (const ticker of ['AAPL', 'ZS', 'TSM', 'XYZ']) {
      expect(screen.getByText(ticker)).toBeInTheDocument();
    }
  });

  it('sorts alphabetically by ticker regardless of source-array order', () => {
    const data = {
      results: [makeResult({ ticker: 'ZEBRA', name: 'Zebra Corp' })],
      rejected: [],
      excludedLowBeta: [makeExcluded({ ticker: 'AARDVARK', name: 'Aardvark Inc.' })],
      errors: [],
    };
    render(<TrackedStocksPanel data={data} />);
    const tickers = screen.getAllByText(/AARDVARK|ZEBRA/).map((el) => el.textContent);
    expect(tickers).toEqual(['AARDVARK', 'ZEBRA']);
  });

  it('shows the correct status label for each category', () => {
    const data = {
      results: [makeResult({ ticker: 'AAPL' })],
      rejected: [makeRejected({ ticker: 'ZS' })],
      excludedLowBeta: [makeExcluded({ ticker: 'TSM' })],
      errors: [makeError({ ticker: 'XYZ' })],
    };
    render(<TrackedStocksPanel data={data} />);
    expect(screen.getByText('Candidate today')).toBeInTheDocument();
    expect(screen.getByText('Rejected today')).toBeInTheDocument();
    expect(screen.getByText('Excluded — Beta below 1.2')).toBeInTheDocument();
    expect(screen.getByText('Data error')).toBeInTheDocument();
  });

  it('shows the correct total count when arrays are missing entirely (not just empty)', () => {
    render(<TrackedStocksPanel data={{}} />);
    expect(screen.getByText(/0 total/)).toBeInTheDocument();
  });

  it('shows the correct total count in the intro text', () => {
    const data = {
      results: [makeResult({ ticker: 'AAPL' })],
      rejected: [makeRejected({ ticker: 'ZS' })],
      excludedLowBeta: [],
      errors: [],
    };
    render(<TrackedStocksPanel data={data} />);
    expect(screen.getByText(/2 total/)).toBeInTheDocument();
  });
});
