from __future__ import annotations

from typing import Any

from .logic import STRATEGY_ID, SYMBOL

SETUP_TAGS = (STRATEGY_ID, "btc-structural-market-alpha", "volume-cycle-phase")


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
        "thesis": (
            "Structural market alpha using volume cycles, volatility compression/expansion, "
            "momentum quality, and market phase detection. Four structural factors grounded in "
            "market mechanics, not data mining."
        ),
        "trigger_plan": "Enter long when composite >= 45 with trend bullish, RSI 40-72, "
                        "vol not extreme, and pullback or momentum trigger.",
        "invalidation_plan": "Exit on vol-scaled ATR trail (2.5-5.5x), trend structure break, or time stop (200 days).",
        "report_context": {
            "return_pct": summary.get("return_pct"),
            "profit_factor": summary.get("profit_factor"),
            "win_rate_pct": summary.get("win_rate_pct"),
            "max_drawdown_pct": summary.get("max_drawdown_pct"),
            "total_trades": summary.get("total_trades"),
            "fees_paid": summary.get("fees_paid"),
        },
        "paperTradeMatch": {"symbol": SYMBOL, "setupTags": list(SETUP_TAGS)},
        "review_fields": [
            "composite_score",
            "component_scores (vol, volume, momentum, phase)",
            "sma50/sma200/rsi14",
            "atr/atr_percentile",
            "trail_multiplier",
            "exit reason",
        ],
    }
