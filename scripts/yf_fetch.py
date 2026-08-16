#!/usr/bin/env python3
"""yf_fetch.py — fetch Beta + next-earnings distance from yfinance.

Called by refresh.js (Node orchestrator) as:
    python3 scripts/yf_fetch.py AAPL MSFT NVDA ...

Emits a single JSON object to stdout:
    { "AAPL": { "name": "...", "beta": 1.29, "daysToEarnings": 21 }, ... }

Rules (RULES.md §1, §5):
  - Beta and earnings come from Yahoo Finance (yfinance), never estimated.
  - daysToEarnings is calendar days to the NEXT earnings date, or null if none
    is scheduled. refresh.js turns <=14 into a hard FAIL.
  - Per-ticker failures are isolated: a ticker we can't read gets an "error"
    field instead of crashing the whole scan.
"""
import sys
import json
from datetime import date, datetime


def next_earnings_days(tk):
    """Calendar days until the next future earnings date, or None."""
    today = date.today()
    candidates = []

    # Preferred: explicit earnings-dates table.
    try:
        df = tk.get_earnings_dates(limit=12)
        if df is not None and len(df) > 0:
            for ts in df.index:
                d = ts.date() if hasattr(ts, "date") else ts
                candidates.append(d)
    except Exception:
        pass

    # Fallback: the calendar summary.
    try:
        cal = tk.calendar
        if isinstance(cal, dict):
            ed = cal.get("Earnings Date")
            if isinstance(ed, (list, tuple)):
                for d in ed:
                    candidates.append(d.date() if hasattr(d, "date") else d)
            elif ed is not None:
                candidates.append(ed.date() if hasattr(ed, "date") else ed)
    except Exception:
        pass

    future = []
    for d in candidates:
        try:
            if isinstance(d, datetime):
                d = d.date()
            if d >= today:
                future.append((d - today).days)
        except Exception:
            continue
    return min(future) if future else None


def main():
    tickers = sys.argv[1:]
    try:
        import yfinance as yf
    except ImportError:
        # No yfinance installed — report per-ticker so refresh.js routes to errors[].
        out = {t: {"error": "yfinance not installed"} for t in tickers}
        print(json.dumps(out))
        return

    out = {}
    for t in tickers:
        try:
            tk = yf.Ticker(t)
            info = {}
            try:
                info = tk.info or {}
            except Exception:
                info = {}
            beta = info.get("beta")
            name = info.get("shortName") or info.get("longName") or t
            out[t] = {
                "name": name,
                "beta": float(beta) if isinstance(beta, (int, float)) else None,
                "daysToEarnings": next_earnings_days(tk),
            }
        except Exception as e:  # isolate per-ticker failure
            out[t] = {"error": str(e)}

    print(json.dumps(out))


if __name__ == "__main__":
    main()
