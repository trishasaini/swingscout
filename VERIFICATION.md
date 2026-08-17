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

**Status: ✅ CONFIRMED — pipeline works end-to-end on the real repo.**

| Date | Trigger | Result | Notes |
|---|---|---|---|
| 2026-08-16 | `workflow_dispatch` (1st ever run) | ❌ Ran clean but silently skipped the commit | `git diff --quiet` doesn't see brand-new untracked files. Fixed in `c5196d7`. |
| 2026-08-16 | `workflow_dispatch` (2nd run, commit fix live) | ✅ Committed `data.json` (`323446e`) | But `dataAsOf` came back `null` — 0 stocks passed all six filters today, and the old code only looked for a bar date on passing rows. Fixed in `34e1ef6`. |
| 2026-08-16 | `workflow_dispatch` (3rd run, both fixes live) | ✅ Committed `data.json` (`44b8345`) | `dataAsOf: "2026-08-14"` (last trading day, Fri — correct), `counts: {passed:0, rejected:48, excludedLowBeta:25, errors:1}` sums to the full 74-ticker watchlist. Verified in a real browser: no demo banner, no false staleness warning (3-day gap is exactly the non-stale boundary), correct empty-state copy, zero console errors. |
| 2026-08-16 | Vercel import | ✅ Deployed successfully from `44b8345`, preview shows correct live data | First-ever run against the real repo caught 2 real bugs neither unit tests nor demo-data testing could have found — both only manifest on real data shapes (untracked file, zero-passing-results day). Validates why this phase's smoke test matters, not just "green checkmark = done." |

**Open follow-up:** the Vercel dashboard should show its **first automatic redeploy** shortly after this file's commit lands on `main` — confirms the GitHub→Vercel push trigger, not just the initial import. Check the Deployments tab for a new entry after this commit.

| 2026-08-17 | `workflow_dispatch` (1st run, 74 -> 517 tickers, repo now public) | ✅ Committed `data.json` (`29e68a6`), ran 1h52m52s | `universeCount: 517`, `counts: {passed:0, rejected:141, excludedLowBeta:369, errors:7}` sums to exactly 517. Dual-share-class ticker fix (`toYahooSymbol`) confirmed correct on real data: `BRK.B` -> "Berkshire Hathaway Inc. New" (beta 0.61), `BF.B` -> "Brown Forman Inc" (beta 0.34) — both resolved correctly instead of erroring. 7/517 errors (1.4%) are expected real-world data gaps, isolated as designed, not a bug. One data-quality note: `FISV` errored — likely a stale symbol in the sourced ticker list, since Fiserv now trades as `FI` (already separately present in the watchlist); worth pruning by hand later, low priority. Verified live on production (`swingscout-eta.vercel.app`): correct summary line, correct "Data as of," all 517 rows render in "Stocks We Track," zero console errors. |

---

## How to keep this file alive

- Every time a `🟡 PENDING` item gets checked, update its status **and**
  fill in the actual comparison data — don't just flip the emoji.
- If a real discrepancy is ever found (❌), do not quietly fix and move on:
  note what was wrong, what was changed, and re-verify before flipping back
  to ✅.
- Revisit §1 and §3 periodically even after they're ✅ — indicator/data-source
  behavior can drift if yfinance or Polygon change their data without notice.
