#!/usr/bin/env python3
"""Tune cascade entry logic for better strong-trend capture."""
import sys, time
from pathlib import Path
REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "backend" / "hyperliquid_gateway"))
from backtesting.engine import BacktestConfig

YAHOO = REPO / "backend/hyperliquid_gateway/data/market_data/btc_usd_daily_yahoo.json"
BINANCE = REPO / "backend/hyperliquid_gateway/data/market_data/one_bitcoin_btc_usd_daily.json"
BASE = BacktestConfig(initial_equity=500.0, taker_fee_rate=0.00045, fee_model="taker", risk_fraction=1.0)

# Will test different logic variants by modifying the evaluate_signal function
# Variant A: baseline + collapse=-3 (current best)
# Variant B: add roc5 > -0.5 filter on entry
# Variant C: add roc5 > 0 AND collapse=-3
# Variant D: require close > sma20 on entry + collapse=-3
# Variant E: require close > sma20 AND roc5 > 0 AND collapse=-3

VARIANTS = {
    "baseline": """
positive_momentum = roc10 > 0.5 or roc20 > 2.0
""",
    "A_roc5_filter": """
positive_momentum = (roc5 > -0.5) and (roc10 > 0.5 or roc20 > 2.0)
""",
    "B_roc5_pos": """
positive_momentum = (roc5 > 0) and (roc10 > 0.5 or roc20 > 2.0)
""",
    "C_sma20": """
positive_momentum = (close > (ctx.get('sma20') or 0)) and (roc10 > 0.5 or roc20 > 2.0)
""",
    "D_sma20_roc5": """
positive_momentum = (close > (ctx.get('sma20') or 0)) and (roc5 > 0) and (roc10 > 0.5 or roc20 > 2.0)
""",
}

import strategies.btc_trend_cascade.logic as L
import importlib

orig_vals = {k: getattr(L, k) for k in dir(L) if k.isupper() and not k.startswith('_')}
# Set collapse to -3
L.MOMENTUM_COLLAPSE_THRESH = -3.0

# Read logic source
import inspect
logic_src = inspect.getsource(L)
# We'll test each variant by replacing the positive_momentum line
# and re-executing... Actually simpler: test each variant by
# modifying L's module and using eval.

# Actually let me use a function-based approach
def test_variant(vname, momentum_line):
    # Create a modified version of evaluate_signal
    # by patching logic.py's variable
    L._TEST_PM = momentum_line
    # We need to replace the entry logic... this is getting complex

    # Simple approach: just monkey-patch the evaluate_signal to use our variant
    importlib.reload(importlib.import_module("strategies.btc_trend_cascade.backtest"))
    from strategies.btc_trend_cascade.backtest import run_backtest

    wins = {}
    for wname, ws, we in [("full","2014-09-17","2026-05-13"),
                          ("train","2014-09-17","2021-12-31"),
                          ("oostest","2022-01-01","2026-05-13"),
                          ("wf_17_22","2017-06-01","2022-05-31"),
                          ("wf_19_24","2019-06-01","2024-05-31")]:
        r = run_backtest(YAHOO, BacktestConfig(initial_equity=500.0, taker_fee_rate=0.00045,
                          fee_model="taker", risk_fraction=1.0, start=ws, end=we))
        wins[wname] = r["summary"]["return_pct"]
    # Binance
    try:
        rb = run_backtest(BINANCE, BASE)
        wins["binance"] = rb["summary"]["return_pct"]
    except:
        wins["binance"] = 0.0

    return wins

# This approach won't work easily because the logic is embedded in the function
# Let me try a different approach: just test by editing the file and re-importing

print("Parameter tuning requires editing logic.py directly.")
print()
print("Best so far: MOMENTUM_COLLAPSE_THRESH = -3.0")
print("  Full: 352.0% | Train: 201.7% | OOS: 48.1%")
print("  wf_2017_2022: 61.6% | wf_2019_2024: 84.0%")
print()
print("To improve strong-trend windows, try:")
print("  1. Widen trail to 3.0/5.5 during ADX>30")
print("  2. Add close > SMA20 to entry filter")
print("  3. Require ROC5 > -1.0 for re-entry after momentum collapse")
print("  4. Use different collapse thresholds based on ADX regime")
