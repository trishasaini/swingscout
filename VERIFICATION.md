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

| 2026-08-17 | `workflow_dispatch` (1st run, 74 -> 517 tickers, repo now public) | ✅ Committed `data.json` (`29e68a6`), ran 1h52m52s | `universeCount: 517`, `counts: {passed:0, rejected:141, excludedLowBeta:369, errors:7}` sums to exactly 517. Dual-share-class ticker fix (`toYahooSymbol`) confirmed correct on real data: `BRK.B` -> "Berkshire Hathaway Inc. New" (beta 0.61), `BF.B` -> "Brown Forman Inc" (beta 0.34) — both resolved correctly instead of erroring. 7/517 errors (1.4%) are expected real-world data gaps, isolated as designed, not a bug — including `FISV` ("missing Beta from yfinance"): initially assumed to be a stale symbol (thought Fiserv traded as `FI` instead), but verified empirically against both live APIs and that assumption was wrong. `FISV` is Fiserv's correct, real, currently-active ticker (confirmed on Polygon: active, listed since 1986, ~$28.9B market cap; confirmed on yfinance: recognized as `EQUITY`, name resolves correctly) — Yahoo's dataset simply has no `beta` value cached for it, a genuine data gap, not an invalid ticker. `FI` by contrast is not a real ticker at all (404 on both providers) — the *old* pre-expansion 74-ticker list's `FI: 'Fiserv Inc.'` mapping was itself the error. No watchlist change needed here. Verified live on production (`swingscout-eta.vercel.app`): correct summary line, correct "Data as of," all 517 rows render in "Stocks We Track," zero console errors. |

---

## 5. Scheduled-run timing vs Polygon data-finalization lag

**What:** Does the nightly cron actually land after Polygon has finished
finalizing that trading day's daily aggregate bar? If it fires too early,
the fetch doesn't error — it silently succeeds with the *previous* trading
day's data instead, one day stale, no visible failure signal.

**Status: ✅ CONFIRMED — the first real `event:"schedule"` run at 07:30 UTC landed correctly.**

| Date | What happened | Notes |
|---|---|---|
| 2026-08-17 | First-ever real `schedule`-triggered run (not `workflow_dispatch`) fired at 22:16 UTC Monday, completed ~00:11 UTC Tuesday | ❌ `dataAsOf` came back `2026-08-14` (Friday) instead of `2026-08-17` (Monday) — one full trading day stale, job reported `success` throughout, `StalenessWarning` correctly caught it in the UI (4 days old > 3-day threshold) since that's exactly the failure mode it exists for. |
| 2026-08-17 | Diagnosed live: queried Polygon directly right after — `AAPL` daily bars showed Monday's close *was* available by then, just wasn't yet at 22:16 UTC when the workflow ran. Confirmed via Polygon's own docs: daily aggregates are continuously finalized as trades (including delayed dark-pool prints) keep reporting in after close, with no fixed published SLA, especially on the free/delayed tier. | Not a code bug — a real timing gap between the old 22:00 UTC cron (only ~1-2h after the 4pm ET close, not the "5-6h" originally and incorrectly estimated) and how long Polygon actually takes to finalize. |
| 2026-08-17 | **Fix applied**: cron moved from `0 22 * * 1-5` (22:00 UTC weekdays) to `30 7 * * 2-6` (07:30 UTC, Tue-Sat) — ~10-11h after close instead of ~1-2h. Trigger weekday shifted forward one day (UTC) since it now runs past midnight ET. New IST arrival: ~1:00 PM IST Tue-Sat (was ~3:30 AM IST). | This is a generous best-effort buffer, **not a proven-safe cutoff** — Polygon publishes no exact finalization SLA. |

| 2026-08-18 | Manual `workflow_dispatch` (not the scheduled cron), fired 14:30 UTC — well after 07:30 | ✅ `dataAsOf: "2026-08-17"` (Monday, the correct prior trading day), `generatedAt: 2026-08-18T16:22:26Z`. First-ever real BUY SETUP produced (`GM`) — verified live on production: chart panel, EMA overlay, RSI subpanel, and position-sizing math (`$84.37` entry / `$81.70` stop / 18 shares / `$1,518.66` capital) all rendered correctly, zero console errors. | This confirms data IS available by 14:30 UTC, but this was a **manual** trigger, not the actual 07:30 UTC scheduled cron — doesn't yet prove the new schedule's specific buffer is early-enough-but-not-too-early. Still waiting on an actual `event: "schedule"` run at 07:30 UTC to confirm the real fix. |

| 2026-08-19 | First real `event:"schedule"` run at the new time — fired 08:00 UTC Wednesday (07:30 UTC cron + ~30min GitHub Actions queue delay, normal jitter), ran 1h52m52s, completed ~09:53 UTC | ✅ `dataAsOf: "2026-08-18"` (Tuesday, the correct prior trading day, no lag), `generatedAt: 2026-08-19T09:53:02.791Z` = 3:23 PM IST. `counts: {passed:4, rejected:137, excludedLowBeta:369, errors:7}`. This is the actual proof the fix works — not a manual trigger standing in for it. | 07:30 UTC (~10-11h after close) is confirmed sufficient, at least for this one night. Keep watching future scheduled runs rather than treat one success as permanent — Polygon still publishes no fixed SLA. |

**Next action:** keep an eye on `dataAsOf` over the next several scheduled
runs. It should consistently equal the actual prior trading day (e.g. a
Thursday run should show Wednesday's date), never lag an extra day. If it
ever lags again even at 07:30 UTC, push the buffer later still rather than
assume one good night settled it permanently.

---

## 6. "Data as of" showed a fabricated time (found by actual use, not testing)

**What happened:** the header showed "Data as of Aug 18, 5:30 AM" every
single day, regardless of when the scan actually ran. `dataAsOf` is a bare
trading-day *date* with no time-of-day (e.g. `"2026-08-18"`); JavaScript
parses a date-only string as UTC midnight, which is always exactly 5:30 AM
in IST — so the displayed "time" was never real, just a fixed artifact of
the timezone conversion. Caught because the user, actually using the site
day to day, noticed the displayed time didn't match when they knew the
scan had run (~1:30-3:30 PM IST) — not caught by any test or smoke check,
since those never assert on the *meaning* of a correctly-formatted date.

**Fix:** `formatAsOf` now shows the date only, no time. A separate new
"Last refreshed" line shows `generatedAt` (a real full timestamp, when the
script actually ran), formatted in the viewer's own local timezone —
verified live: showed "Last refreshed Aug 19, 2026, 3:23 PM" against a real
`generatedAt` of `2026-08-19T09:53:02.791Z` UTC, which is correct.

**Status: ✅ CONFIRMED fixed and verified live**, but worth remembering as a
pattern: a technically-correct computation (UTC midnight, real timezone
math) can still produce a misleading result if the underlying value never
had the granularity being displayed. Worth a second look anywhere else in
the app that formats a bare date with a time component.

---

## How to keep this file alive

- Every time a `🟡 PENDING` item gets checked, update its status **and**
  fill in the actual comparison data — don't just flip the emoji.
- If a real discrepancy is ever found (❌), do not quietly fix and move on:
  note what was wrong, what was changed, and re-verify before flipping back
  to ✅.
- Revisit §1 and §3 periodically even after they're ✅ — indicator/data-source
  behavior can drift if yfinance or Polygon change their data without notice.
