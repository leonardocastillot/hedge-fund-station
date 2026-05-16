from __future__ import annotations

from typing import Any

from .logic import STRATEGY_ID, SYMBOL

SETUP_TAGS = (
    STRATEGY_ID,
    "btc-regime-adaptive-confluence",
    "regime_adaptive_confluence",
    "progressive-trail",
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
        "thesis": "Capture BTC daily trends with progressive ATR trailing (3.5x first 15 days, 5.5x after). Tight stop cuts false breakouts early; wide stop captures full trends. 263.78% vs 180.24% champion in backtest.",
        "trigger_plan": latest_signal.get(
            "trigger_plan",
            "Enter long when close > SMA150, SMA50 > SMA150, RSI14 > 42, ATR percentile < 82, "
            "and pullback or momentum condition met.",
        ),
        "invalidation_plan": latest_signal.get(
            "invalidation_plan",
            "Exit on progressive ATR trailing stop (3.5x first 15d, then 5.5x), "
            "trend break (close < SMA150 + SMA50 < SMA150), or time stop (200 days).",
        ),
        "report_context": {
            "return_pct": summary.get("return_pct"),
            "champion_strategy": "btc_vol_dynamic_trail_trend",
            "champion_return_pct": 180.24,
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
            "atr",
            "atr_percentile",
            "vol regime",
            "trail_phase",
            "days_in_trade",
            "atr_stop_distance_pct",
            "target risk pct",
            "target position size pct",
            "trade peak drawdown",
            "exit reason",
            "paper journal outcome",
        ],
    }
