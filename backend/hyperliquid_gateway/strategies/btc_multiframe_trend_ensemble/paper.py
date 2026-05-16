from __future__ import annotations

from typing import Any

from .logic import STRATEGY_ID, SYMBOL

SETUP_TAGS = (
    STRATEGY_ID,
    "btc-multiframe-trend-ensemble",
    "multiframe_ensemble",
    "smooth-trail",
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
        "thesis": (
            "Multi-timeframe trend ensemble. Four MA pairs (20/50, 50/100, 100/200, close/200) "
            "vote independently. Entry when trend score >= 3/4 with pullback or momentum confirmation. "
            "Exit on smooth vol-scaled ATR trail (2.5x-6.0x continuous), structure consensus breakdown, "
            "or time stop. Smooth vol scaling instead of step functions for robustness."
        ),
        "trigger_plan": latest_signal.get(
            "trigger_plan",
            "Enter long when trend_score >= 3, RSI 40-75, ATR pct < 85, and pullback or momentum trigger. "
            "Pullback: price between MA20 and MA50, RSI < 58. "
            "Momentum: price > MA20, MA20 slope > 0.1%, RSI >= 48.",
        ),
        "invalidation_plan": latest_signal.get(
            "invalidation_plan",
            "Exit on smooth ATR trailing stop (2.5-6.0x), "
            "trend structure break (trend score <= 1), or time stop (250 days).",
        ),
        "report_context": {
            "return_pct": summary.get("return_pct"),
            "champion_strategy": "btc_regime_adaptive_confluence",
            "champion_return_pct": 263.78,
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
            "ma20/ma50/ma100/ma200",
            "trend_score",
            "rsi14",
            "atr",
            "atr_percentile",
            "vol regime",
            "trail_multiplier",
            "days_in_trade",
            "atr_stop_distance_pct",
            "target risk pct",
            "target position size pct",
            "trade peak drawdown",
            "exit reason",
            "paper journal outcome",
        ],
    }
