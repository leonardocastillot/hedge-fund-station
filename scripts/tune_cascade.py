#!/usr/bin/env python3
"""Tune collapse threshold and trail width for btc_trend_cascade."""
import sys, time
from pathlib import Path
REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "backend" / "hyperliquid_gateway"))
from backtesting.engine import BacktestConfig
import strategies.btc_trend_cascade.logic as L
import importlib

YAHOO = REPO / "backend/hyperliquid_gateway/data/market_data/btc_usd_daily_yahoo.json"
BINANCE = REPO / "backend/hyperliquid_gateway/data/market_data/one_bitcoin_btc_usd_daily.json"

BASE = BacktestConfig(initial_equity=500.0, taker_fee_rate=0.00045, fee_model="taker", risk_fraction=1.0)

# Parameters to test: (name, collapse_thresh, tight_mult, wide_mult, trans_day)
PARAMS = [
    ("baseline",     -2.0, 2.5, 4.5, 10),
    ("collapse_-3",  -3.0, 2.5, 4.5, 10),
    ("collapse_-4",  -4.0, 2.5, 4.5, 10),
    ("trail_3_5",    -2.0, 3.0, 5.0, 12),
    ("trail_3_5_c3", -3.0, 3.0, 5.0, 12),
    ("wide_3_6",     -2.0, 3.0, 6.0, 15),
    ("wide_3_6_c4",  -4.0, 3.0, 6.0, 15),
]

# Windows to test
WINDOWS = [
    ("full",     "2014-09-17", "2026-05-13"),
    ("train",    "2014-09-17", "2021-12-31"),
    ("test_oos", "2022-01-01", "2026-05-13"),
    ("wf_2017_2022", "2017-06-01", "2022-05-31"),
    ("wf_2019_2024", "2019-06-01", "2024-05-31"),
]

orig = {"TIGHT_TRAIL_MULT": L.TIGHT_TRAIL_MULT, "WIDE_TRAIL_MULT": L.WIDE_TRAIL_MULT,
        "TRAIL_TRANSITION_DAY": L.TRAIL_TRANSITION_DAY, "MOMENTUM_COLLAPSE_THRESH": L.MOMENTUM_COLLAPSE_THRESH}

print(f"{'params':20s}", end="")
for wname, ws, we in WINDOWS:
    print(f"{wname:>15s}", end="")
print(f"{'binance':>10s} {'dd':>6s} {'wr':>5s} {'pf':>5s} {'trades':>7s}")
print("-" * 90)

for pname, collapse, tight, wide, trans in PARAMS:
    L.TIGHT_TRAIL_MULT = tight
    L.WIDE_TRAIL_MULT = wide
    L.TRAIL_TRANSITION_DAY = trans
    L.MOMENTUM_COLLAPSE_THRESH = collapse

    # Force reload of backtest module to pick up new logic constants
    importlib.reload(importlib.import_module("strategies.btc_trend_cascade.backtest"))
    from strategies.btc_trend_cascade.backtest import run_backtest

    print(f"{pname:20s}", end="")
    dd_total = 0
    for wname, ws, we in WINDOWS:
        r = run_backtest(YAHOO, BacktestConfig(initial_equity=500.0, taker_fee_rate=0.00045,
                          fee_model="taker", risk_fraction=1.0, start=ws, end=we))
        ret = r["summary"]["return_pct"]
        print(f"{ret:>15.1f}", end="")
        if wname == "full":
            dd_total = r["summary"]["max_drawdown_pct"]
            wr_total = r["summary"]["win_rate_pct"]
            pf_total = r["summary"]["profit_factor"]
            tr_total = r["summary"]["total_trades"]

    # Binance
    try:
        rb = run_backtest(BINANCE, BacktestConfig(initial_equity=500.0, taker_fee_rate=0.00045,
                          fee_model="taker", risk_fraction=1.0, start="2017-08-17", end="2026-05-07"))
        print(f"{rb['summary']['return_pct']:>9.1f}%", end="")
    except:
        print(f"{'ERR':>9s}", end="")

    print(f"{dd_total:>6.1f} {wr_total:>4.1f}% {pf_total:>5.2f} {tr_total:>5d}")

# Restore
for k, v in orig.items():
    setattr(L, k, v)
