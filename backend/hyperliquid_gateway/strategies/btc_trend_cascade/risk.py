from typing import Any


def build_risk_plan(signal_eval: dict[str, Any]) -> dict[str, Any]:
    return {
        "position_size_pct": float(signal_eval.get("target_position_size_pct", 0.0)),
        "stop_loss_pct": float(signal_eval.get("atr_stop_distance_pct", 5.0)),
        "max_exposure_pct": float(signal_eval.get("max_exposure_fraction", 0.2)) * 100,
        "max_drawdown_target_pct": 20.0,
        "time_stop_days": 150,
        "notes": [
            "Conviction-based sizing: stronger momentum → larger position.",
            "Momentum collapse exit if cascade score turns negative.",
        ],
    }


def calculate_position_size(
    portfolio_value: float,
    signal_eval: dict[str, Any],
) -> dict[str, Any]:
    target_pct = float(signal_eval.get("target_position_size_pct", 0.0))
    if target_pct <= 0:
        return {"can_enter": False, "size_usd": 0.0, "reason": "No signal"}
    raw_size = portfolio_value * (target_pct / 100.0)
    max_size = portfolio_value * 0.45
    size_usd = min(raw_size, max_size)
    if size_usd < 1.0:
        return {"can_enter": False, "size_usd": 0.0, "reason": "Size too small"}
    return {"can_enter": True, "size_usd": round(size_usd, 2), "reason": "Conviction entry"}
