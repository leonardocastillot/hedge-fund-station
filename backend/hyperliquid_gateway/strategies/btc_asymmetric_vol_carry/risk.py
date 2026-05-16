"""Risk and sizing helpers for BTC Asymmetric Vol Carry."""

from __future__ import annotations

from typing import Any

from .logic import (
    COMPRESSION_EXPOSURE,
    PANIC_EXPOSURE,
    STRATEGY_ID,
)

MAX_EXPOSURE_FRACTION = 0.25


def calculate_position_size(
    *,
    portfolio_value: float,
    signal_eval: dict[str, Any] | None = None,
    risk_fraction: float | None = None,
) -> dict[str, Any]:
    signal_target = float((signal_eval or {}).get("target_exposure_fraction") or 0.0)
    requested_fraction = float(risk_fraction if risk_fraction is not None else MAX_EXPOSURE_FRACTION)
    fraction = min(MAX_EXPOSURE_FRACTION, max(0.0, requested_fraction), max(0.0, signal_target))
    size_usd = max(0.0, float(portfolio_value) * fraction)
    return {
        "strategy_id": STRATEGY_ID,
        "can_enter": size_usd > 0,
        "size_usd": round(size_usd, 2),
        "exposure_fraction": round(fraction, 4),
        "target_exposure_fraction": round(signal_target, 4),
        "block_reason": None if size_usd > 0 else "zero_position_size",
    }


def build_risk_plan(context: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "strategy_id": STRATEGY_ID,
        "paper_allowed": True,
        "live_allowed": False,
        "max_exposure_fraction": MAX_EXPOSURE_FRACTION,
        "panic_long_exposure": PANIC_EXPOSURE,
        "compression_long_exposure": COMPRESSION_EXPOSURE,
        "max_concurrent_positions": 1,
        "invalidation_plan": "Long exits: RSI<40 trend failure or 60-day time stop.",
        "context": context or {},
    }
