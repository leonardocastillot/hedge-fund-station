"""Paper candidate helpers for Breakout OI Confirmation."""

from __future__ import annotations

from typing import Any

STRATEGY_ID = "breakout_oi_confirmation"


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
        "thesis": "Follow liquid breakouts only when open interest expands with the move.",
        "trigger_plan": latest_signal.get(
            "trigger_plan",
            "Wait for a liquid long or short breakout with rising OI, high breakoutContinuation score, and no dominant fade signal.",
        ),
        "invalidation_plan": latest_signal.get(
            "invalidation_plan",
            "Use dynamic stop, OI contraction exit, breakout reversal exit, no-progress at 25m, and 90m time stop.",
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
            "breakout_score",
            "oi_delta_1h_pct",
            "change15m_pct",
            "change1h_pct",
            "execution_quality",
            "exit_reason_counts",
            "symbol_leaderboard",
            "paper journal outcome",
        ],
    }
