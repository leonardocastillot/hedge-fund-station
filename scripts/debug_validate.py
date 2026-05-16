#!/usr/bin/env python3
"""Quick debug to verify import infrastructure works."""
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))
sys.path.insert(0, str(REPO / "backend" / "hyperliquid_gateway"))

print("sys.path[0]:", sys.path[0])
print("sys.path[1]:", sys.path[1])

try:
    from backtesting.engine import BacktestConfig
    print("✓ BacktestConfig imported")
except Exception as e:
    print(f"✗ BacktestConfig: {e}")

try:
    import strategies.btc_regime_adaptive_confluence.logic as LOGIC
    print("✓ LOGIC module imported")
    print(f"  TIGHT={LOGIC.TIGHT_TRAIL_MULT} WIDE={LOGIC.WIDE_TRAIL_MULT} TRANS={LOGIC.TRAIL_TRANSITION_DAY}")
except Exception as e:
    print(f"✗ LOGIC: {e}")

try:
    import strategies.btc_vol_dynamic_trail_trend.logic as CHAMP_LOGIC
    print("✓ CHAMP_LOGIC imported")
except Exception as e:
    print(f"✗ CHAMP_LOGIC: {e}")

try:
    import strategies.btc_regime_adaptive_confluence.backtest as NEW_BT
    print("✓ NEW backtest imported")
    result = NEW_BT.run_backtest(
        REPO / "backend/hyperliquid_gateway/data/market_data/btc_usd_daily_yahoo.json",
        BacktestConfig(initial_equity=500.0, taker_fee_rate=0.00045, fee_model="taker", risk_fraction=1.0,
                       start="2020-01-01", end="2020-06-30")
    )
    print(f"  return={result['summary']['return_pct']:.2f}% trades={result['summary']['total_trades']} time={result['summary']['max_drawdown_pct']:.2f}%dd")
except Exception as e:
    import traceback
    print(f"✗ NEW backtest run: {e}")
    traceback.print_exc()
