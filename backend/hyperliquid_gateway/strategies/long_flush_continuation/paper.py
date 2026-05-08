"""Paper candidate helpers for long flush continuation."""

from __future__ import annotations

from typing import Any

STRATEGY_ID = "long_flush_continuation"


def paper_candidate(payload: dict[str, Any]) -> dict[str, Any]:
    latest_signal = payload.get("latest_signal", {}) or {}
    summary = payload.get("report_summary", {}) or {}
    validation = payload.get("validation", {}) or {}
    ready = validation.get("status") == "ready-for-paper"
    return {
        "strategy_id": STRATEGY_ID,
        "symbol": latest_signal.get("symbol"),
        "signal": latest_signal.get("signal", "none"),
        "status": "candidate" if ready and latest_signal.get("signal") == "short" else "standby",
        "promotion_gate": "eligible-for-paper-review" if ready else "blocked-by-validation",
        "trigger_plan": latest_signal.get(
            "trigger_plan",
            "Wait for long-pressure scores or longs-at-risk crowding, high funding, negative impulse, and OI stability.",
        ),
        "invalidation_plan": latest_signal.get(
            "invalidation_plan",
            "Stop at +0.8%, OI collapse, pressure fade, or 120 minute time stop.",
        ),
        "report_context": {
            "return_pct": summary.get("return_pct"),
            "profit_factor": summary.get("profit_factor"),
            "max_drawdown_pct": summary.get("max_drawdown_pct"),
            "total_trades": summary.get("total_trades"),
        },
        "review_fields": [
            "symbol",
            "funding_percentile",
            "long_flush_score",
            "execution_quality",
            "profit_factor",
            "max_drawdown_pct",
            "paper journal outcome",
        ],
    }
