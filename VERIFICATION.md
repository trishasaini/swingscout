# SwingScout — Accuracy Verification Log

A **durable, living** record of independent checks against the numbers this
tool produces. The point of this file is to never let a check silently rot
into "we probably checked that once." Every entry has a status and a date;
update it in place rather than letting it go stale.

Status legend: 🟡 PENDING (not yet done) · ✅ CONFIRMED (checked and matched)
· ❌ FAILED (checked and did NOT match — do not trust downstream numbers
until resolved).

---

## 1. Indicator correctness (RULES.md §9 gate)

**What:** Pull real GOOG daily closes, compute RSI(14) and EMA50 locally
(`npm run verify:goog`), compare against a TradingView GOOG reading
(NASDAQ:GOOG). Match within ~0.5 = the indicator layer (`indicators.js`) is
trustworthy, and every downstream filter/verdict inherits that trust.

**Status: 🟡 PENDING**

- `npm run verify:goog` has been run live once (prior session): close
  **357.89**, EMA50 **356.49**, RSI14 **49.69**.
- The actual side-by-side comparison against a live TradingView GOOG chart
  has **not** been done yet — this is the one part of the gate that's still
  open. Until it's done, treat the indicator layer as "probably right, not
  yet independently confirmed."

**Next action:** open TradingView, pull up NASDAQ:GOOG, read its EMA50 and
RSI(14) for the same date as the `verify:goog` run, compare by hand. Update
this section with the date, the TradingView readings, and the delta.

---

## 2. Staleness detection

**What:** If `data.json`'s `dataAsOf` is more than 3 calendar days old (e.g.
a failed nightly Action left old data in place), the UI must visibly warn
the user rather than silently showing old numbers as if current.

**Status: ✅ CONFIRMED — built and tested, closed.**

- Implemented in `src/lib/staleness.js` + `src/components/StalenessWarning.jsx`.
- Covered by `tests/staleness.vitest.js` and `tests/StalenessWarning.vitest.jsx`.
- No live-data spot check needed for this one — it's pure date arithmetic,
  fully covered by unit tests. Nothing further to verify here.

---

## 3. Beta / earnings-date accuracy (yfinance)

**What:** `scripts/yf_fetch.py` supplies Beta and next-earnings-date via
yfinance. These numbers directly drive hard filters #2 and #6 (RULES.md §1)
— a wrong Beta or a missed earnings date could let a stock through that
should have failed, or hide one that should have passed.

**Status: 🟡 PENDING — never independently spot-checked against a second source.**

**Next action:** pick 3–5 tickers from the watchlist, compare yfinance's
Beta and next-earnings-date against a second source (e.g. the ticker's page
on a broker site or Nasdaq/Yahoo Finance directly in a browser). Log the
comparison below.

| Ticker | yfinance Beta | 2nd-source Beta | yfinance earnings date | 2nd-source earnings date | Match? | Date checked |
|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — |

---

## 4. Live pipeline smoke test (Phase 4 go-live)

**What:** Confirm the real nightly Action, running against the real
`trishasaini/swingscout` repo with the real `POLYGON_API_KEY` secret,
actually produces a correct `data.json`, commits it, and that Vercel
redeploys from it.

**Status: 🟡 PENDING — see session log below.**

| Date | Trigger | Result | Notes |
|---|---|---|---|
| — | — | — | — |

---

## How to keep this file alive

- Every time a `🟡 PENDING` item gets checked, update its status **and**
  fill in the actual comparison data — don't just flip the emoji.
- If a real discrepancy is ever found (❌), do not quietly fix and move on:
  note what was wrong, what was changed, and re-verify before flipping back
  to ✅.
- Revisit §1 and §3 periodically even after they're ✅ — indicator/data-source
  behavior can drift if yfinance or Polygon change their data without notice.
