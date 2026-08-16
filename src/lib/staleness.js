// staleness.js — is the nightly data suspiciously old?
//
// Not a full trading-calendar implementation (no holiday awareness) — a
// pragmatic threshold of 3 CALENDAR days, chosen so a normal Friday-to-Monday
// gap (viewing Friday's data on Monday, only 1 trading day stale) never
// falsely warns, while a genuinely failed nightly Action (data stuck for
// several real days) does. Documented interpretation, not a hidden guess.
export const STALE_THRESHOLD_DAYS = 3;

/**
 * @param {string|null} dataAsOfDateStr an ISO date string like "2026-08-15"
 * @param {number} [now] injectable current time (ms) for deterministic tests
 * @returns {number|null} whole calendar days since dataAsOf, or null if unknown
 */
export function daysSince(dataAsOfDateStr, now = Date.now()) {
  if (!dataAsOfDateStr) return null;
  const then = new Date(`${dataAsOfDateStr}T00:00:00Z`).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((now - then) / (24 * 3600 * 1000));
}

export function isStale(dataAsOfDateStr, now = Date.now()) {
  const days = daysSince(dataAsOfDateStr, now);
  return days !== null && days > STALE_THRESHOLD_DAYS;
}
