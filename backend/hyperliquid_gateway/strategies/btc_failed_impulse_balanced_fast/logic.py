"""Deterministic signal logic for BTC Failed Impulse Balanced Fast."""

from __future__ import annotations

from typing import Any

from ..btc_failed_impulse_reversal.logic import calculate_funding_percentile
from ..btc_failed_impulse_reversal.logic import evaluate_signal as parent_evaluate_signal
from .params import STRATEGY_ID, VARIANT_ID, VARIANT_PARAMS


def evaluate_signal(market_data: dict[str, Any]) -> dict[str, Any]:
    signal = parent_evaluate_signal(market_data, params=VARIANT_PARAMS)
    return {
        **signal,
        "strategy_id": STRATEGY_ID,
        "variant_id": VARIANT_ID,
    }
