import { describe, it, expect } from 'vitest';
import { daysSince, isStale, STALE_THRESHOLD_DAYS } from '../src/lib/staleness';

const DAY_MS = 24 * 3600 * 1000;
const NOW = Date.parse('2026-08-16T12:00:00Z');

describe('daysSince', () => {
  it('returns null for a missing/falsy date', () => {
    expect(daysSince(null, NOW)).toBeNull();
    expect(daysSince(undefined, NOW)).toBeNull();
    expect(daysSince('', NOW)).toBeNull();
  });

  it('returns null for an unparseable date string', () => {
    expect(daysSince('not-a-date', NOW)).toBeNull();
  });

  it('computes whole calendar days between dataAsOf and now', () => {
    expect(daysSince('2026-08-16', NOW)).toBe(0); // same day
    expect(daysSince('2026-08-15', NOW)).toBe(1);
    expect(daysSince('2026-08-13', NOW)).toBe(3);
    expect(daysSince('2026-08-10', NOW)).toBe(6);
  });
});

describe('isStale', () => {
  it(`STALE_THRESHOLD_DAYS is 3 (documented interpretation)`, () => {
    expect(STALE_THRESHOLD_DAYS).toBe(3);
  });

  it('boundary: exactly at the threshold is NOT stale (strictly greater than)', () => {
    const threeDaysAgo = new Date(NOW - 3 * DAY_MS).toISOString().slice(0, 10);
    expect(isStale(threeDaysAgo, NOW)).toBe(false);
  });

  it('boundary: one day past the threshold IS stale', () => {
    const fourDaysAgo = new Date(NOW - 4 * DAY_MS).toISOString().slice(0, 10);
    expect(isStale(fourDaysAgo, NOW)).toBe(true);
  });

  it('fresh data (today, or 1-2 days old — e.g. a normal weekend gap) is not flagged', () => {
    expect(isStale('2026-08-16', NOW)).toBe(false);
    expect(isStale('2026-08-15', NOW)).toBe(false); // 1 day
    expect(isStale('2026-08-14', NOW)).toBe(false); // 2 days
  });

  it('null dataAsOf is never flagged as stale (nothing to compare — a load error is a separate concern)', () => {
    expect(isStale(null, NOW)).toBe(false);
  });

  it('genuinely old data (e.g. a week-long outage) is flagged', () => {
    const weekAgo = new Date(NOW - 7 * DAY_MS).toISOString().slice(0, 10);
    expect(isStale(weekAgo, NOW)).toBe(true);
  });
});
