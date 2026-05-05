"""Paper candidate helpers for OI Expansion Failure Fade."""

from __future__ import annotations

from typing import Any

STRATEGY_ID = "oi_expansion_failure_fade"


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
        "thesis": "Fade a leveraged impulse when open interest expands but short-term follow-through stalls.",
        "trigger_plan": latest_signal.get(
            "trigger_plan",
            "Wait for a liquid fade setup with 1h impulse, rising OI, and failing 5m/15m continuation.",
        ),
        "invalidation_plan": latest_signal.get(
            "invalidation_plan",
            "Use dynamic stop, no-progress at 20m, time stop at 60m, and 30m symbol cooldown after losses.",
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
            "fade_score",
            "oi_delta_1h_pct",
            "change5m_pct",
            "change15m_pct",
            "change1h_pct",
            "execution_quality",
            "exit_reason_counts",
            "symbol_leaderboard",
            "paper journal outcome",
        ],
    }
