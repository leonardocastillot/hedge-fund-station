"""Paper candidate helpers for Liquidation Pressure Flip Reversal."""

from __future__ import annotations

from typing import Any

STRATEGY_ID = "liquidation_pressure_flip_reversal"


def paper_candidate(payload: dict[str, Any]) -> dict[str, Any]:
    latest_signal = payload.get("latest_signal", {}) or {}
    summary = payload.get("report_summary", {}) or {}
    validation = payload.get("validation", {}) or {}
    ready = validation.get("status") == "ready-for-paper"
    signal = latest_signal.get("signal", "none")
    return {
        "strategy_id": STRATEGY_ID,
        "symbol": latest_signal.get("symbol"),
        "signal": signal,
        "status": "candidate" if ready and signal in {"long", "short"} else "standby",
        "promotion_gate": "eligible-for-paper-review" if ready else "blocked-by-validation",
        "validation_status": validation.get("status"),
        "validation_blockers": validation.get("blocking_reasons", []),
        "thesis": "Fade stretched liquidation pressure only after the recent impulse starts to stall.",
        "trigger_plan": latest_signal.get(
            "trigger_plan",
            "Wait for visible liquidation pressure, stretched crowding, fade/pressure setup scores, and 5m/15m stall.",
        ),
        "invalidation_plan": latest_signal.get(
            "invalidation_plan",
            "Use dynamic stop, impulse reassertion exit, OI expansion guard, no-progress at 20m, and 60m time stop.",
        ),
        "report_context": {
            "return_pct": summary.get("return_pct"),
            "profit_factor": summary.get("profit_factor"),
            "win_rate_pct": summary.get("win_rate_pct"),
            "max_drawdown_pct": summary.get("max_drawdown_pct"),
            "total_trades": summary.get("total_trades"),
            "fees_paid": summary.get("fees_paid"),
        },
        "review_fields": [
            "symbol",
            "side",
            "estimated_liquidation_usd",
            "pressure_score",
            "fade_score",
            "change5m_pct",
            "change15m_pct",
            "execution_quality",
            "exit_reason_counts",
            "symbol_leaderboard",
            "paper journal outcome",
        ],
    }
