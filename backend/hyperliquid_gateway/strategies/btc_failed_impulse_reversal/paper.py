"""Paper candidate helpers for BTC Failed Impulse Reversal."""

from __future__ import annotations

from typing import Any

STRATEGY_ID = "btc_failed_impulse_reversal"


def paper_candidate(payload: dict[str, Any]) -> dict[str, Any]:
    latest_signal = payload.get("latest_signal", {}) or {}
    summary = payload.get("report_summary", {}) or {}
    validation = payload.get("validation", {}) or {}
    ready = validation.get("status") == "ready-for-paper"
    signal = latest_signal.get("signal", "none")
    return {
        "strategy_id": STRATEGY_ID,
        "symbol": latest_signal.get("symbol", "BTC"),
        "signal": signal,
        "status": "candidate" if ready and signal in {"long", "short"} else "standby",
        "promotion_gate": "eligible-for-paper-review" if ready else "blocked-by-validation",
        "validation_status": validation.get("status"),
        "validation_blockers": validation.get("blocking_reasons", []),
        "thesis": "Fade a BTC one-hour impulse only after fifteen-minute follow-through fails.",
        "trigger_plan": latest_signal.get(
            "trigger_plan",
            "Wait for a liquid BTC 1h impulse and enter the opposite side only when 15m continuation stalls.",
        ),
        "invalidation_plan": latest_signal.get(
            "invalidation_plan",
            "Use 0.65% stop, 1.75% target, 8h time stop, one BTC position, and post-exit cooldown.",
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
            "change1h_pct",
            "change15m_pct",
            "change4h_pct",
            "execution_quality",
            "rank_score",
            "exit_reason_counts",
            "paper journal outcome",
        ],
    }
