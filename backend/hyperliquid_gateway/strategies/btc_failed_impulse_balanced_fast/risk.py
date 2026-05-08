"""Risk helpers for BTC Failed Impulse Balanced Fast."""

from __future__ import annotations

from typing import Any

from ..btc_failed_impulse_reversal.risk import build_risk_plan as parent_build_risk_plan
from ..btc_failed_impulse_reversal.risk import calculate_position_size as parent_calculate_position_size
from .params import STRATEGY_ID, VARIANT_PARAMS

STOP_LOSS_PCT = 0.65
TAKE_PROFIT_PCT = 1.45
MAX_HOLD_MINUTES = 360


def build_risk_plan(context: dict[str, Any], side: str | None = None) -> dict[str, Any]:
    plan = parent_build_risk_plan(context, side=side, params=VARIANT_PARAMS)
    return {**plan, "strategy_id": STRATEGY_ID}


def calculate_position_size(
    *,
    portfolio_value: float,
    market_data: dict[str, Any],
    current_positions: list[dict[str, Any]],
    signal_eval: dict[str, Any],
) -> dict[str, Any]:
    return parent_calculate_position_size(
        portfolio_value=portfolio_value,
        market_data=market_data,
        current_positions=current_positions,
        signal_eval=signal_eval,
        params=VARIANT_PARAMS,
    )
