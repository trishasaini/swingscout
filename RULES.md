# SwingScout — Hard Rules & Decisions

This file is the source of truth for constraints that must never drift.
If code conflicts with anything here, the code is wrong. When in doubt, ask
before changing logic — every rule maps to a live trading system.

---

## 1. The Six Hard Filters

Applied in this order. **Fail any one = reject immediately.** No rounding,
no exceptions, no "close enough."

| # | Filter          | Rule                                  | Fails at        |
|---|-----------------|---------------------------------------|-----------------|
| 1 | Price           | $20.00 – $200.00 inclusive            | $19.99 / $200.01 |
| 2 | Beta            | > 1.2                                 | 1.2 exactly, or below |
| 3 | Avg Volume      | > 1,000,000 shares/day                | 1,000,000 or below |
| 4 | EMA50 Extension | 0.0% – 10.0% inclusive                | −0.1% / 10.1%   |
| 5 | RSI (daily, 14) | 38.0 – 50.0 inclusive                 | 37.9 / 50.1     |
| 6 | Earnings Date   | No earnings within 14 calendar days   | earnings in 14 days or fewer |

**Extension** = ((price − EMA50) / EMA50) × 100.
- Negative extension (price BELOW EMA50) = **FAIL** — broken trend, not a pullback.
- This is a true EMA, never an SMA. See §3.

**Beta < 1.2 stocks must not be displayed at all** — not shown as FAIL, just excluded.

**Earnings within 14 days = FAIL regardless of how good the chart looks.**

---

## 2. Universe

- US-listed only (NYSE, NASDAQ).
- Sectors: Technology, Fintech, AI infrastructure.
- **Excluded: energy, defense, biotech.**
- Liquid only: avg daily volume > 1M shares (also filter #3).

---

## 3. Indicator Correctness (non-negotiable)

- **EMA50 must be a true exponential moving average.** Seed = SMA of first 50
  closes, then EMA = close·k + prevEMA·(1−k), k = 2/(period+1). Never a plain SMA.
- **RSI(14) uses Wilder's smoothing**, not a simple average of gains/losses.
- Both are implemented and tested in `indicators.js` / `test_indicators.js`.
  Use them as-is. Do not reinvent.
- **Never use AI-generated or estimated price/RSI/EMA values anywhere.** All
  numbers come from the nightly polygon fetch. The browser only reads data.json;
  it must not invent or interpolate values.
- Fetch ~150 daily bars per stock (EMA50 needs warmup before the 60-day window).

---

## 4. Phase 2 — Pullback Verdict

Assess the last 5–10 trading days on four checks:

1. **Candle size** — recent candle range < 80% of 60-day avg range = good (small).
2. **Candle overlap** — > 60% of consecutive body pairs overlap = good (consolidation).
3. **Volume trend** — pullback vol < 80% of 20-day avg = good; > 100% = bad (distribution).
4. **EMA direction** — EMA50 today > EMA50 5 days ago > EMA50 10 days ago = rising = good.

Verdict:
- **BUY SETUP** (green): all 4 align.
- **NOT YET** (yellow): exactly 2 of 4 pass.
- **AVOID** (red): sharp candles OR elevated volume OR EMA50 declining.

Always show the signal breakdown table with actual values beneath the verdict.

---

## 5. Phase 3 — Risk & Market Health

### Position sizing / stop
- Recent swing low = lowest low of last 10 days.
- EMA50 support stop = EMA50 − 1.5%.
- **Suggested stop = the LOWER of those two.** Always display which basis was used.
- If stop > 8% below entry: warn "Wide stop — position size reduced or too volatile."
- Account size default $5,000; risk per trade default 1%.
- Max dollar risk = account × risk%. Risk/share = entry − stop.
- Shares = floor(max dollar risk / risk per share). Capital required = shares × entry.
- Position sizing is based on **max dollar risk, not available cash alone.**

### Market health (advisory ONLY — never overrides stock filters)
- QQQ vs its EMA20 and EMA50.
- GREEN: above both. YELLOW: above one. RED: below both.
- RED → show setups but warn "market conditions unfavorable."
- YELLOW → warn "market mixed — smaller size or wait."
- GREEN → "market supports swing entries."

---

## 6. Architecture Decisions

- **Data provider: polygon.io free tier** (not Alpha Vantage — AV's 25/day &
  5/min limits can't cover an 80-stock scan under 15s). 15-min delay is
  irrelevant for EOD.
- **Beta + earnings: yfinance.**
- **Nightly GitHub Action** runs the refresh script → commits `data.json` →
  Vercel auto-redeploys. The user never runs anything.
- **Frontend: React + Vite**, reads static `data.json`. **lightweight-charts**
  for the chart panel. Position sizing computed client-side.
- **No live backend. No API keys in the browser.** Polygon key lives in GitHub
  repo secrets only.

---

## 7. The User Is Non-Technical

Built for one non-technical user on her own laptop/phone. She never runs scripts,
sees keys, or maintains anything — she opens a page and hits "Run Scan."

- Every screen shows a prominent **"Data as of [timestamp]"** label.
- Each result leads with a **plain-language verdict** ("BUY SETUP — small candles,
  calm volume, uptrend intact"), with the numeric breakdown table underneath.
- Mobile-friendly, dark mode, no clutter, no ads, no login.

---

## 8. Out of Scope (v1)

No order execution, no portfolio tracking, no alerts/notifications, no news feed,
no multi-user, no backtesting.

---

## 9. Verification Gate

Before trusting the tool: pull real GOOG daily closes, compute RSI(14) and EMA50,
compare against a TradingView GOOG reading (NASDAQ:GOOG). Match within ~0.5 =
indicator layer is trustworthy and all downstream filters/verdicts inherit it.
