"""Paper candidate helpers for BTC Failed Impulse Balanced Fast."""

from __future__ import annotations

from typing import Any

from .params import INVALIDATION_PLAN, STRATEGY_ID, THESIS, TRIGGER_PLAN, VARIANT_ID


def paper_candidate(payload: dict[str, Any]) -> dict[str, Any]:
    latest_signal = payload.get("latest_signal", {}) or {}
    summary = payload.get("report_summary", {}) or {}
    validation = payload.get("validation", {}) or {}
    ready = validation.get("status") == "ready-for-paper"
    signal = latest_signal.get("signal", "none")
    return {
        "strategy_id": STRATEGY_ID,
        "variant_id": VARIANT_ID,
        "symbol": latest_signal.get("symbol", "BTC"),
        "signal": signal,
        "status": "candidate" if ready and signal in {"long", "short"} else "standby",
        "promotion_gate": "eligible-for-paper-review" if ready else "blocked-by-validation",
        "validation_status": validation.get("status"),
        "validation_blockers": validation.get("blocking_reasons", []),
        "thesis": THESIS,
        "trigger_plan": latest_signal.get("trigger_plan") or TRIGGER_PLAN,
        "invalidation_plan": latest_signal.get("invalidation_plan") or INVALIDATION_PLAN,
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
            "change1h_pct",
            "change15m_pct",
            "change4h_pct",
            "execution_quality",
            "rank_score",
            "exit_reason_counts",
            "paper journal outcome",
        ],
    }
