"""Paper candidate helpers for short squeeze continuation."""

from __future__ import annotations

from typing import Any


def paper_candidate(payload: dict[str, Any]) -> dict[str, Any]:
    latest_signal = payload.get("latest_signal", {}) or {}
    summary = payload.get("report_summary", {}) or {}
    validation = payload.get("validation", {}) or {}
    ready = validation.get("status") == "ready-for-paper"
    return {
        "strategy_id": "short_squeeze_continuation",
        "symbol": latest_signal.get("symbol"),
        "signal": latest_signal.get("signal", "none"),
        "status": "candidate" if ready and latest_signal.get("signal") == "long" else "standby",
        "promotion_gate": "eligible-for-paper-review" if ready else "blocked-by-validation",
        "trigger_plan": latest_signal.get("trigger_plan", "Wait for shorts-at-risk crowding, low funding, positive impulse, and OI stability."),
        "invalidation_plan": latest_signal.get("invalidation_plan", "Stop at -0.8%, OI collapse, crowding flip, or 120 minute time stop."),
        "report_context": {
            "return_pct": summary.get("return_pct"),
            "profit_factor": summary.get("profit_factor"),
            "max_drawdown_pct": summary.get("max_drawdown_pct"),
            "total_trades": summary.get("total_trades"),
        },
        "review_fields": [
            "symbol",
            "funding_percentile",
            "short_squeeze_score",
            "execution_quality",
            "profit_factor",
            "max_drawdown_pct",
            "paper journal outcome",
        ],
    }
