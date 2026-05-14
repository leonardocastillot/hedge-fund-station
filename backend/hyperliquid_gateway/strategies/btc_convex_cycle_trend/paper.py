"""Paper candidate helpers for BTC Convex Cycle Trend."""

from __future__ import annotations

from typing import Any

from .logic import STRATEGY_ID, SYMBOL

SETUP_TAGS = (
    STRATEGY_ID,
    "btc-convex-cycle-trend",
    "convex_cycle_trend",
    "convex-cycle-trend",
)


def paper_candidate(payload: dict[str, Any]) -> dict[str, Any]:
    latest_signal = payload.get("latest_signal", {}) or {}
    summary = payload.get("report_summary", {}) or {}
    validation = payload.get("validation", {}) or {}
    ready = validation.get("status") == "ready-for-paper"
    signal = latest_signal.get("signal", "none")
    return {
        "strategy_id": STRATEGY_ID,
        "symbol": SYMBOL,
        "signal": signal,
        "status": "candidate" if ready else "blocked",
        "promotion_gate": "eligible-for-paper-review" if ready else "blocked-by-validation",
        "validation_status": validation.get("status"),
        "validation_blockers": validation.get("blocking_reasons", []),
        "thesis": "Participate in BTC daily cycle uptrends with larger partial exposure only when momentum, trend, and drawdown filters are aligned.",
        "trigger_plan": latest_signal.get(
            "trigger_plan",
            "Enter long when close > SMA150, SMA50 > SMA150, and RSI14 > 42; use 25% exposure only in convex regime.",
        ),
        "invalidation_plan": latest_signal.get("invalidation_plan", "Exit on 15% close drawdown from trade peak, slow-trend break, or crash guard."),
        "report_context": {
            "return_pct": summary.get("return_pct"),
            "champion_strategy": summary.get("champion_strategy"),
            "champion_return_pct": summary.get("champion_return_pct"),
            "excess_return_vs_champion_pct": summary.get("excess_return_vs_champion_pct"),
            "beats_champion": summary.get("beats_champion"),
            "profit_factor": summary.get("profit_factor"),
            "win_rate_pct": summary.get("win_rate_pct"),
            "max_drawdown_pct": summary.get("max_drawdown_pct"),
            "total_trades": summary.get("total_trades"),
            "fees_paid": summary.get("fees_paid"),
        },
        "paperTradeMatch": {"symbol": SYMBOL, "setupTags": list(SETUP_TAGS)},
        "review_fields": [
            "daily close",
            "sma50",
            "sma150",
            "rsi14",
            "momentum_30d_pct",
            "convex regime",
            "target exposure fraction",
            "trade peak drawdown",
            "exit reason",
            "paper journal outcome",
        ],
    }
