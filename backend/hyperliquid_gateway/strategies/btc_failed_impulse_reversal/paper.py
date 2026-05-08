"""Paper candidate helpers for BTC Failed Impulse Reversal."""

from __future__ import annotations

from bisect import bisect_right
from datetime import datetime, timezone
from typing import Any

from .logic import calculate_funding_percentile, evaluate_signal
from .risk import MAX_HOLD_MINUTES, STOP_LOSS_PCT, TAKE_PROFIT_PCT, build_risk_plan, calculate_position_size
from .scoring import calculate_execution_quality, score_setup

STRATEGY_ID = "btc_failed_impulse_reversal"
SETUP_TAGS = (
    STRATEGY_ID,
    "btc-failed-impulse-reversal",
    "failed_impulse_reversal",
    "failed-impulse-reversal",
)
FIVE_MINUTES_MS = 5 * 60 * 1000
ONE_HOUR_MS = 60 * 60 * 1000
FOUR_HOURS_MS = 4 * ONE_HOUR_MS
SEVEN_DAYS_MS = 7 * 24 * ONE_HOUR_MS
DEFAULT_PORTFOLIO_VALUE = 100_000.0


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


def build_paper_runtime_plan(
    history_entries: list[dict[str, Any]],
    open_trades: list[dict[str, Any]],
    *,
    portfolio_value: float = DEFAULT_PORTFOLIO_VALUE,
) -> dict[str, Any]:
    market_data = build_runtime_market_data(history_entries)
    if market_data is None:
        return {
            "strategyId": STRATEGY_ID,
            "status": "blocked-no-market-data",
            "market": None,
            "signalEval": {"strategy_id": STRATEGY_ID, "signal": "none"},
            "setupScore": None,
            "exitActions": [],
            "entry": {
                "shouldOpen": False,
                "blockReason": "no_btc_market_history",
                "tradePayload": None,
                "signalPayload": None,
            },
        }

    matching_open_trades = [trade for trade in open_trades if runtime_trade_matches_strategy(trade)]
    exit_actions = [
        action
        for trade in matching_open_trades
        if (action := evaluate_paper_runtime_exit(trade, market_data)) is not None
    ]

    signal_eval = evaluate_signal(market_data)
    setup_score = score_setup(market_data, signal_eval)
    entry = build_entry_decision(
        market_data=market_data,
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
        "market": compact_runtime_market(market_data),
        "signalEval": signal_eval,
        "setupScore": setup_score,
        "openTradeCount": len(matching_open_trades),
        "exitActions": exit_actions,
        "entry": entry,
    }


def build_runtime_market_data(history_entries: list[dict[str, Any]]) -> dict[str, Any] | None:
    entries = sorted(
        (
            entry
            for entry in (_normalize_history_entry(item) for item in history_entries)
            if entry is not None and entry.get("symbol") == "BTC" and float(entry.get("price") or 0.0) > 0
        ),
        key=lambda item: int(item["timestamp_ms"]),
    )
    if not entries:
        return None

    latest = entries[-1]
    timestamps = [int(item["timestamp_ms"]) for item in entries]
    timestamp_ms = int(latest["timestamp_ms"])
    funding_history = [
        float(item.get("fundingRate") or 0.0)
        for item in entries
        if int(item["timestamp_ms"]) >= timestamp_ms - SEVEN_DAYS_MS
    ]
    price = float(latest["price"])
    market_data = {
        "timestamp": latest["timestamp"],
        "timestamp_ms": timestamp_ms,
        "symbol": "BTC",
        "price": price,
        "fundingRate": float(latest.get("fundingRate") or 0.0),
        "fundingPercentile": calculate_funding_percentile(float(latest.get("fundingRate") or 0.0), funding_history),
        "change5m": pct_change(price, reference_value(entries, timestamps, timestamp_ms - FIVE_MINUTES_MS, "price")),
        "change15m": pct_change(price, reference_value(entries, timestamps, timestamp_ms - (3 * FIVE_MINUTES_MS), "price")),
        "change1h": pct_change(price, reference_value(entries, timestamps, timestamp_ms - ONE_HOUR_MS, "price")),
        "change4h": pct_change(price, reference_value(entries, timestamps, timestamp_ms - FOUR_HOURS_MS, "price")),
        "change24h": float(latest.get("change24h") or 0.0),
        "openInterestUsd": float(latest.get("openInterestUsd") or 0.0),
        "volume24h": float(latest.get("volume24h") or 0.0),
        "opportunityScore": round(float(latest.get("opportunityScore") or 0.0)),
        "crowdingBias": latest.get("crowdingBias") or "balanced",
        "primarySetup": latest.get("primarySetup") or "no-trade",
        "setupScores": latest.get("setupScores") or {},
        "estimatedTotalLiquidationUsd": float(latest.get("estimatedTotalLiquidationUsd") or 0.0),
        "historyPoints": len(entries),
    }
    market_data["executionQuality"] = calculate_execution_quality(market_data)
    return market_data


def build_entry_decision(
    *,
    market_data: dict[str, Any],
    signal_eval: dict[str, Any],
    setup_score: dict[str, Any],
    matching_open_trades: list[dict[str, Any]],
    portfolio_value: float,
) -> dict[str, Any]:
    if matching_open_trades:
        return {
            "shouldOpen": False,
            "blockReason": "matching_open_trade",
            "tradePayload": None,
            "signalPayload": None,
        }

    if signal_eval.get("signal") not in {"long", "short"}:
        return {
            "shouldOpen": False,
            "blockReason": "no_reversal_signal",
            "tradePayload": None,
            "signalPayload": None,
        }

    sizing = calculate_position_size(
        portfolio_value=portfolio_value,
        market_data=market_data,
        current_positions=[],
        signal_eval=signal_eval,
    )
    if not sizing.get("can_enter"):
        return {
            "shouldOpen": False,
            "blockReason": sizing.get("block_reason") or "risk_blocked",
            "tradePayload": None,
            "signalPayload": None,
        }

    side = str(signal_eval["signal"])
    entry_price = round(float(market_data["price"]), 6)
    risk_plan = build_risk_plan({**market_data, "price": entry_price, "side": side}, side=side)
    trigger_plan = "Fade a BTC one-hour impulse only after fifteen-minute follow-through fails."
    invalidation_plan = "Use 0.65% stop, 1.75% target, 8h time stop, one BTC position, and post-exit cooldown."
    thesis = "BTC Failed Impulse Reversal paper runtime entry from backend strategy signal."
    trade_payload = {
        "symbol": "BTC",
        "side": side,
        "setup_tag": STRATEGY_ID,
        "thesis": thesis,
        "entry_price": entry_price,
        "size_usd": float(sizing["size_usd"]),
        "stop_loss_pct": STOP_LOSS_PCT,
        "take_profit_pct": TAKE_PROFIT_PCT,
        "decision_label": "watch-now",
        "trigger_plan": trigger_plan,
        "invalidation_plan": invalidation_plan,
        "execution_quality": int(setup_score.get("execution_quality") or market_data.get("executionQuality") or 0),
    }
    signal_payload = {
        "symbol": "BTC",
        "setup_tag": STRATEGY_ID,
        "direction": side,
        "confidence": int(signal_eval.get("confidence") or 0),
        "thesis": thesis,
        "entry_price": entry_price,
        "invalidation": invalidation_plan,
        "decision_label": "watch-now",
        "trigger_plan": trigger_plan,
        "execution_quality": trade_payload["execution_quality"],
    }
    return {
        "shouldOpen": True,
        "blockReason": None,
        "tradePayload": trade_payload,
        "signalPayload": signal_payload,
        "riskPlan": risk_plan,
    }


def evaluate_paper_runtime_exit(trade: dict[str, Any], market_data: dict[str, Any]) -> dict[str, Any] | None:
    if str(value_at(trade, "status") or "").lower() != "open":
        return None
    entry_price = float(value_at(trade, "entryPrice", "entry_price") or 0.0)
    current_price = float(market_data.get("price") or 0.0)
    size_usd = float(value_at(trade, "sizeUsd", "size_usd") or 0.0)
    side = str(value_at(trade, "side") or "").lower()
    if entry_price <= 0 or current_price <= 0 or size_usd <= 0 or side not in {"long", "short"}:
        return None

    stop_loss_pct = float(value_at(trade, "stopLossPct", "stop_loss_pct") or STOP_LOSS_PCT)
    take_profit_pct = float(value_at(trade, "takeProfitPct", "take_profit_pct") or TAKE_PROFIT_PCT)
    exit_reason: str | None = None
    if side == "long":
        if current_price <= entry_price * (1 - stop_loss_pct / 100.0):
            exit_reason = "stop_loss"
        elif current_price >= entry_price * (1 + take_profit_pct / 100.0):
            exit_reason = "take_profit"
    else:
        if current_price >= entry_price * (1 + stop_loss_pct / 100.0):
            exit_reason = "stop_loss"
        elif current_price <= entry_price * (1 - take_profit_pct / 100.0):
            exit_reason = "take_profit"

    created_at = int(value_at(trade, "createdAt", "created_at_ms") or market_data.get("timestamp_ms") or 0)
    timestamp_ms = int(market_data.get("timestamp_ms") or created_at)
    if exit_reason is None and timestamp_ms - created_at >= MAX_HOLD_MINUTES * 60 * 1000:
        exit_reason = "time_stop"
    if exit_reason is None:
        return None

    pnl = paper_trade_pnl(side=side, entry_price=entry_price, exit_price=current_price, size_usd=size_usd)
    return {
        "tradeId": int(value_at(trade, "id") or 0),
        "exitReason": exit_reason,
        "closedAt": timestamp_ms,
        "exitPrice": round(current_price, 6),
        "realizedPnlUsd": round(pnl, 2),
        "pnlPct": round((pnl / size_usd) * 100, 4) if size_usd else 0.0,
    }


def runtime_trade_matches_strategy(trade: dict[str, Any]) -> bool:
    symbol = str(value_at(trade, "symbol") or "").upper()
    setup_tag = str(value_at(trade, "setupTag", "setup_tag") or "").strip().lower()
    return symbol == "BTC" and setup_tag in {tag.lower() for tag in SETUP_TAGS}


def paper_trade_pnl(*, side: str, entry_price: float, exit_price: float, size_usd: float) -> float:
    units = 0.0 if entry_price == 0 else size_usd / entry_price
    return (exit_price - entry_price) * units if side == "long" else (entry_price - exit_price) * units


def compact_runtime_market(market_data: dict[str, Any]) -> dict[str, Any]:
    keys = [
        "timestamp",
        "timestamp_ms",
        "symbol",
        "price",
        "fundingPercentile",
        "change5m",
        "change15m",
        "change1h",
        "change4h",
        "openInterestUsd",
        "volume24h",
        "crowdingBias",
        "primarySetup",
        "setupScores",
        "executionQuality",
        "historyPoints",
    ]
    return {key: market_data.get(key) for key in keys}


def _normalize_history_entry(entry: dict[str, Any]) -> dict[str, Any] | None:
    timestamp_ms = int(value_at(entry, "timestamp_ms", "time", "createdAt") or 0)
    symbol = str(value_at(entry, "symbol") or "").upper()
    price = float(value_at(entry, "price") or 0.0)
    if not timestamp_ms or not symbol or price <= 0:
        return None
    return {
        "timestamp_ms": timestamp_ms,
        "timestamp": str(value_at(entry, "timestamp") or iso_from_ms(timestamp_ms)),
        "symbol": symbol,
        "price": price,
        "change24h": float(value_at(entry, "change24h", "change24hPct", "change24h_pct") or 0.0),
        "openInterestUsd": float(value_at(entry, "openInterestUsd", "open_interest_usd") or 0.0),
        "volume24h": float(value_at(entry, "volume24h") or 0.0),
        "fundingRate": float(value_at(entry, "fundingRate", "funding_rate") or 0.0),
        "opportunityScore": float(value_at(entry, "opportunityScore", "opportunity_score") or 0.0),
        "crowdingBias": value_at(entry, "crowdingBias", "crowding_bias") or "balanced",
        "primarySetup": value_at(entry, "primarySetup", "primary_setup") or "no-trade",
        "setupScores": value_at(entry, "setupScores", "setup_scores") or {},
        "estimatedTotalLiquidationUsd": float(
            value_at(entry, "estimatedTotalLiquidationUsd", "estimated_total_liquidation_usd") or 0.0
        ),
    }


def value_at(record: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in record:
            return record.get(key)
    return None


def reference_value(entries: list[dict[str, Any]], timestamps: list[int], target_ms: int, key: str) -> float | None:
    index = bisect_right(timestamps, target_ms) - 1
    if index < 0:
        return None
    value = entries[index].get(key)
    return float(value) if value is not None else None


def pct_change(current: float, previous: float | None) -> float:
    if previous in (None, 0):
        return 0.0
    return round(((current - previous) / previous) * 100, 4)


def iso_from_ms(timestamp_ms: int) -> str:
    return datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
