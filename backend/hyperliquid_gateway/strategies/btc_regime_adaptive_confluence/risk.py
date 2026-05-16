from __future__ import annotations

from typing import Any

from .logic import STRATEGY_ID


def calculate_position_size(
    *,
    portfolio_value: float,
    signal_eval: dict[str, Any] | None = None,
    risk_fraction: float | None = None,
) -> dict[str, Any]:
    sig = signal_eval or {}
    atr_stop_dist_pct = float(sig.get("atr_stop_distance_pct") or 5.0)
    target_risk = float(sig.get("target_risk_pct") or 0.35)
    max_frac = float(sig.get("max_exposure_fraction") or 0.12)

    if atr_stop_dist_pct <= 0:
        return {
            "strategy_id": STRATEGY_ID,
            "can_enter": False,
            "size_usd": 0.0,
            "exposure_fraction": 0.0,
            "block_reason": "atr_stop_distance_zero",
        }

    risk_budget_frac = target_risk / atr_stop_dist_pct
    final_frac = min(max_frac, risk_budget_frac)
    size_usd = max(0.0, float(portfolio_value) * final_frac)
    return {
        "strategy_id": STRATEGY_ID,
        "can_enter": size_usd > 0,
        "size_usd": round(size_usd, 2),
        "exposure_fraction": round(final_frac, 6),
        "target_risk_pct": round(target_risk, 4),
        "atr_stop_distance_pct": round(atr_stop_dist_pct, 4),
        "max_exposure_fraction": round(max_frac, 4),
        "risk_budget_frac": round(risk_budget_frac, 6),
        "dynamic_multiplier": float(sig.get("dynamic_multiplier") or 4.6),
        "block_reason": None if size_usd > 0 else "zero_position_size",
    }


def build_risk_plan(context: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "strategy_id": STRATEGY_ID,
        "paper_allowed": True,
        "live_allowed": False,
        "max_exposure_fraction": 0.20,
        "atr_stop_multiplier": "regime_adaptive_5.5-3.0_based_on_atr_percentile",
        "sizing_method": "regime_adaptive_risk_budgeting_with_conviction",
        "max_concurrent_positions": 1,
        "invalidation_plan": "Exit on regime-adaptive ATR trailing stop (5.5x-3.0x depending on vol regime), trend break (close < SMA150 + SMA50 < SMA150), or time stop (200 days).",
        "context": context or {},
    }
