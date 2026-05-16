#!/usr/bin/env python3
"""Quick test of btc_trend_cascade strategy."""
import sys, time
from pathlib import Path
REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "backend" / "hyperliquid_gateway"))
from backtesting.engine import BacktestConfig

DP = REPO / "backend/hyperliquid_gateway/data/market_data/btc_usd_daily_yahoo.json"
cfg = BacktestConfig(initial_equity=500.0, taker_fee_rate=0.00045, fee_model="taker", risk_fraction=1.0)

t0 = time.time()
import strategies.btc_trend_cascade.backtest as BT
print(f"Import: {time.time()-t0:.2f}s")

t0 = time.time()
r = BT.run_backtest(DP, cfg)
t1 = time.time()
print(f"Backtest: {t1-t0:.1f}s")
print(f"  Return: {r['summary']['return_pct']:.2f}%")
print(f"  Trades: {r['summary']['total_trades']}")
print(f"  WR: {r['summary']['win_rate_pct']:.1f}%")
print(f"  PF: {r['summary']['profit_factor']:.2f}")
print(f"  DD: {r['summary']['max_drawdown_pct']:.2f}%")
print(f"  Beats champion: {r['summary'].get('beats_champion', 'N/A')}")

if r['trades']:
    rets = [round(t['return_pct'], 1) for t in r['trades']]
    reasons = [t['exit_reason'] for t in r['trades']]
    print(f"  Exit reasons: {dict((r, reasons.count(r)) for r in set(reasons))}")
    print(f"  Trade returns: min={min(rets)}% max={max(rets)}%")
