#!/usr/bin/env python3
"""Time a single full backtest."""
import sys, time
from pathlib import Path
REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "backend" / "hyperliquid_gateway"))
from backtesting.engine import BacktestConfig

import strategies.btc_regime_adaptive_confluence.backtest as BT
import strategies.btc_vol_dynamic_trail_trend.backtest as CHAMP_BT

DP = REPO / "backend/hyperliquid_gateway/data/market_data/btc_usd_daily_yahoo.json"
cfg = BacktestConfig(initial_equity=500.0, taker_fee_rate=0.00045, fee_model="taker", risk_fraction=1.0)

# Time new strategy full
t0 = time.time()
r = BT.run_backtest(DP, cfg)
t1 = time.time()
print(f"NEW: {t1-t0:.2f}s  ret={r['summary']['return_pct']:.2f}% trades={r['summary']['total_trades']}")

# Time champion full
t0 = time.time()
r = CHAMP_BT.run_backtest(DP, cfg)
t1 = time.time()
print(f"CHAMP: {t1-t0:.2f}s  ret={r['summary']['return_pct']:.2f}% trades={r['summary']['total_trades']}")

# Time with date filter
cfg2 = BacktestConfig(initial_equity=500.0, taker_fee_rate=0.00045, fee_model="taker", risk_fraction=1.0, start="2020-01-01", end="2024-01-01")
t0 = time.time()
r = BT.run_backtest(DP, cfg2)
t1 = time.time()
print(f"NEW 4y: {t1-t0:.2f}s  ret={r['summary']['return_pct']:.2f}% trades={r['summary']['total_trades']}")
