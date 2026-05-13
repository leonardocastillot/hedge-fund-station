"""Risk and sizing helpers for BTC Guarded Cycle Trend."""

from __future__ import annotations

from typing import Any

from .logic import STRATEGY_ID, TRAILING_EXIT_DRAWDOWN_PCT

MAX_EXPOSURE_FRACTION = 0.10


def calculate_position_size(*, portfolio_value: float, risk_fraction: float | None = None) -> dict[str, Any]:
    fraction = min(MAX_EXPOSURE_FRACTION, max(0.0, float(risk_fraction if risk_fraction is not None else MAX_EXPOSURE_FRACTION)))
    size_usd = max(0.0, float(portfolio_value) * fraction)
    return {
        "strategy_id": STRATEGY_ID,
        "can_enter": size_usd > 0,
        "size_usd": round(size_usd, 2),
        "exposure_fraction": round(fraction, 4),
        "block_reason": None if size_usd > 0 else "zero_position_size",
    }


def build_risk_plan(context: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "strategy_id": STRATEGY_ID,
        "paper_allowed": True,
        "live_allowed": False,
        "max_exposure_fraction": MAX_EXPOSURE_FRACTION,
        "stop_loss_pct": TRAILING_EXIT_DRAWDOWN_PCT,
        "take_profit_pct": None,
        "max_concurrent_positions": 1,
        "invalidation_plan": "Exit on 15% close drawdown from trade peak, slow-trend break, or crash guard.",
        "context": context or {},
    }
