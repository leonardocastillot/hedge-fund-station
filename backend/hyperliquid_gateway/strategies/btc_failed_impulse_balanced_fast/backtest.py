from __future__ import annotations

from pathlib import Path
from typing import Any

try:
    from ...backtesting.engine import BacktestConfig
except ImportError:
    from backtesting.engine import BacktestConfig

from ..btc_failed_impulse_reversal.backtest import run_backtest_with_params
from .params import INVALIDATION_PLAN, STRATEGY_ID, THESIS, TRIGGER_PLAN, VARIANT_ID, VARIANT_PARAMS


def run_backtest(dataset_path: Path, config: BacktestConfig) -> dict[str, Any]:
    result = run_backtest_with_params(
        dataset_path,
        config,
        params=VARIANT_PARAMS,
        variant_id=VARIANT_ID,
    )
    for trade in result.get("trades") or []:
        if isinstance(trade, dict):
            trade["strategy_id"] = STRATEGY_ID
            entry_context = trade.get("entry_context") if isinstance(trade.get("entry_context"), dict) else {}
            signal = entry_context.get("signal") if isinstance(entry_context.get("signal"), dict) else {}
            score = entry_context.get("score") if isinstance(entry_context.get("score"), dict) else {}
            entry_context["signal"] = {**signal, "strategy_id": STRATEGY_ID, "variant_id": VARIANT_ID}
            entry_context["score"] = {**score, "strategy_id": STRATEGY_ID, "variant_id": VARIANT_ID}
            trade["entry_context"] = entry_context

    latest_signal = result.get("latest_signal") if isinstance(result.get("latest_signal"), dict) else {}
    result["latest_signal"] = {
        **latest_signal,
        "strategy_id": STRATEGY_ID,
        "variant_id": VARIANT_ID,
        "trigger_plan": TRIGGER_PLAN,
        "invalidation_plan": INVALIDATION_PLAN,
    }
    result["variant"] = {
        "variant_id": VARIANT_ID,
        "parent_strategy_id": "btc_failed_impulse_reversal",
        "params": VARIANT_PARAMS,
        "promoted_strategy_id": STRATEGY_ID,
    }
    result["notes"] = [
        "BTC Failed Impulse Balanced Fast is a named research variant promoted from the optimizer artifact.",
        THESIS,
        "Passing validation only permits paper review; this is not a live-trading route.",
    ]
    return result
