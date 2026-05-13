"""Paper candidate and runtime helpers for BTC Adaptive Cycle Trend."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .logic import STRATEGY_ID, SYMBOL, evaluate_signal, row_close
from .risk import build_risk_plan, calculate_position_size
from .scoring import score_setup

SETUP_TAGS = (
    STRATEGY_ID,
    "btc-adaptive-cycle-trend",
    "adaptive_cycle_trend",
    "adaptive-cycle-trend",
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
        "thesis": "Participate in BTC cycle uptrends with adaptive partial exposure that only increases during cleaner daily trend regimes.",
        "trigger_plan": latest_signal.get(
            "trigger_plan",
            "Enter long when close > SMA150, SMA50 > SMA150, and RSI14 > 42; increase to 20% exposure only in strong adaptive regime.",
        ),
        "invalidation_plan": latest_signal.get("invalidation_plan", "Exit on 15% close drawdown from trade peak, slow-trend break, or crash guard."),
        "report_context": {
            "return_pct": summary.get("return_pct"),
            "paper_ready_benchmark_return_pct": summary.get("paper_ready_benchmark_return_pct"),
            "excess_return_vs_paper_ready_benchmark_pct": summary.get("excess_return_vs_paper_ready_benchmark_pct"),
            "beats_paper_ready_benchmark": summary.get("beats_paper_ready_benchmark"),
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
            "strong regime",
            "target exposure fraction",
            "trade peak drawdown",
            "exit reason",
            "paper journal outcome",
        ],
    }


def build_paper_runtime_plan(
    daily_rows: list[dict[str, Any]],
    open_trades: list[dict[str, Any]],
    *,
    portfolio_value: float,
) -> dict[str, Any]:
    if not daily_rows:
        return empty_plan("blocked-no-daily-history", "no_btc_daily_history")

    matching_open_trades = [trade for trade in open_trades if runtime_trade_matches_strategy(trade)]
    market_index = len(daily_rows) - 1
    market_data = build_runtime_market(daily_rows, market_index)
    exit_actions = [
        action
        for trade in matching_open_trades
        if (action := evaluate_paper_runtime_exit(trade, daily_rows, market_index)) is not None
    ]
    signal_eval = evaluate_signal(daily_rows, market_index, in_position=False)
    setup_score = score_setup(signal_eval)
    entry = build_entry_decision(
        signal_eval=signal_eval,
        setup_score=setup_score,
        matching_open_trades=matching_open_trades,
        portfolio_value=portfolio_value,
    )
    if exit_actions:
        status = "exit-ready"
    elif entry["shouldOpen"]:
        status = "entry-ready"
    elif matching_open_trades:
        status = "managing-open-trade"
    else:
        status = "flat-no-signal"

    return {
        "strategyId": STRATEGY_ID,
        "status": status,
        "market": market_data,
        "signalEval": signal_eval,
        "setupScore": setup_score,
        "openTradeCount": len(matching_open_trades),
        "exitActions": exit_actions,
        "entry": entry,
    }


def empty_plan(status: str, block_reason: str) -> dict[str, Any]:
    return {
        "strategyId": STRATEGY_ID,
        "status": status,
        "market": None,
        "signalEval": {"strategy_id": STRATEGY_ID, "symbol": SYMBOL, "signal": "none"},
        "setupScore": None,
        "exitActions": [],
        "entry": {"shouldOpen": False, "blockReason": block_reason, "tradePayload": None, "signalPayload": None},
    }


def build_runtime_market(rows: list[dict[str, Any]], index: int) -> dict[str, Any]:
    signal_eval = evaluate_signal(rows, index, in_position=False)
    close = row_close(rows[index])
    return {
        "timestamp": str(rows[index].get("date")),
        "timestamp_ms": date_to_ms(str(rows[index].get("date"))),
        "symbol": SYMBOL,
        "price": close,
        "close": close,
        "sma50": signal_eval.get("sma50"),
        "sma150": signal_eval.get("sma150"),
        "rsi14": signal_eval.get("rsi14"),
        "strongRegime": signal_eval.get("strong_regime"),
        "targetExposureFraction": signal_eval.get("target_exposure_fraction"),
        "drawdown180dPct": signal_eval.get("drawdown_180d_pct"),
        "historyPoints": len(rows),
        "change1h": None,
        "change15m": None,
    }


def build_entry_decision(
    *,
    signal_eval: dict[str, Any],
    setup_score: dict[str, Any],
    matching_open_trades: list[dict[str, Any]],
    portfolio_value: float,
) -> dict[str, Any]:
    if matching_open_trades:
        return {"shouldOpen": False, "blockReason": "matching_open_trade", "tradePayload": None, "signalPayload": None}
    if signal_eval.get("signal") != "long":
        return {"shouldOpen": False, "blockReason": "no_adaptive_cycle_signal", "tradePayload": None, "signalPayload": None}

    sizing = calculate_position_size(portfolio_value=portfolio_value, signal_eval=signal_eval, risk_fraction=0.20)
    if not sizing["can_enter"]:
        return {"shouldOpen": False, "blockReason": sizing["block_reason"], "tradePayload": None, "signalPayload": None}

    entry_price = round(float(signal_eval["close"]), 6)
    thesis = "BTC Adaptive Cycle Trend paper runtime entry from backend daily strategy signal."
    trigger_plan = "Enter long when BTC daily close > SMA150, SMA50 > SMA150, and RSI14 > 42; use 20% exposure only in strong adaptive regime."
    invalidation_plan = "Exit on 15% close drawdown from trade peak, slow-trend break, or crash guard."
    trade_payload = {
        "symbol": SYMBOL,
        "side": "long",
        "setup_tag": STRATEGY_ID,
        "thesis": thesis,
        "entry_price": entry_price,
        "size_usd": float(sizing["size_usd"]),
        "stop_loss_pct": 15.0,
        "take_profit_pct": None,
        "decision_label": "watch-now",
        "trigger_plan": trigger_plan,
        "invalidation_plan": invalidation_plan,
        "execution_quality": int(setup_score.get("execution_quality") or 0),
    }
    signal_payload = {
        "symbol": SYMBOL,
        "setup_tag": STRATEGY_ID,
        "direction": "long",
        "confidence": int(setup_score.get("rank_score") or 0),
        "thesis": thesis,
        "entry_price": entry_price,
        "invalidation": invalidation_plan,
        "decision_label": "watch-now",
        "trigger_plan": trigger_plan,
        "execution_quality": trade_payload["execution_quality"],
    }
    return {"shouldOpen": True, "blockReason": None, "tradePayload": trade_payload, "signalPayload": signal_payload, "riskPlan": build_risk_plan(signal_eval)}


def evaluate_paper_runtime_exit(trade: dict[str, Any], rows: list[dict[str, Any]], index: int) -> dict[str, Any] | None:
    if str(value_at(trade, "status") or "").lower() != "open":
        return None
    entry_price = float(value_at(trade, "entryPrice", "entry_price") or 0.0)
    size_usd = float(value_at(trade, "sizeUsd", "size_usd") or 0.0)
    created_at = int(value_at(trade, "createdAt", "created_at_ms") or 0)
    side = str(value_at(trade, "side") or "long")
    if side != "long" or entry_price <= 0 or size_usd <= 0:
        return None

    peak_close = max(entry_price, max(row_close(row) for row in rows_since(rows, created_at)) if rows_since(rows, created_at) else entry_price)
    signal_eval = evaluate_signal(rows, index, in_position=True, trade_peak_close=peak_close)
    if not signal_eval.get("exit_trigger"):
        return None
    exit_price = float(signal_eval["close"])
    units = size_usd / entry_price
    realized = (exit_price - entry_price) * units
    return {
        "tradeId": int(value_at(trade, "id") or 0),
        "closedAt": date_to_ms(str(rows[index].get("date"))),
        "exitPrice": round(exit_price, 6),
        "realizedPnlUsd": round(realized, 2),
        "exitReason": signal_eval.get("exit_reason"),
    }


def rows_since(rows: list[dict[str, Any]], timestamp_ms: int) -> list[dict[str, Any]]:
    selected = [row for row in rows if date_to_ms(str(row.get("date"))) >= timestamp_ms]
    return selected or rows[-1:]


def runtime_trade_matches_strategy(trade: dict[str, Any]) -> bool:
    symbol = str(value_at(trade, "symbol") or "").upper()
    setup_tag = str(value_at(trade, "setupTag", "setup_tag") or "").strip().lower()
    return symbol == SYMBOL and setup_tag in {tag.lower() for tag in SETUP_TAGS}


def value_at(payload: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in payload:
            return payload[key]
    return None


def date_to_ms(value: str) -> int:
    parsed = datetime.fromisoformat(value).replace(tzinfo=timezone.utc)
    return int(parsed.timestamp() * 1000)
