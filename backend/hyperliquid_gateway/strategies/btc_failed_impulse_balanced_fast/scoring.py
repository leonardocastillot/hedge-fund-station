"""Ranking helpers for BTC Failed Impulse Balanced Fast."""

from __future__ import annotations

from typing import Any

from ..btc_failed_impulse_reversal.scoring import calculate_execution_quality
from ..btc_failed_impulse_reversal.scoring import score_setup as parent_score_setup
from .params import STRATEGY_ID, VARIANT_ID


def score_setup(market_data: dict[str, Any], signal_eval: dict[str, Any] | None = None) -> dict[str, Any]:
    score = parent_score_setup(market_data, signal_eval)
    return {
        **score,
        "strategy_id": STRATEGY_ID,
        "variant_id": VARIANT_ID,
    }
