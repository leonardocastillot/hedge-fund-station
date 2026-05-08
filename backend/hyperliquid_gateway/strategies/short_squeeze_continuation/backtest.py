from __future__ import annotations

from bisect import bisect_right
from collections import defaultdict
from pathlib import Path
from typing import Any

try:
    from ...backtesting.engine import BacktestConfig, calculate_trade_fee
    from ...backtesting.diagnostics import build_trade_diagnostics
    from ...backtesting.metrics import build_summary
    from ...backtesting.snapshots import load_sampled_market_snapshots
except ImportError:
    from backtesting.engine import BacktestConfig, calculate_trade_fee
    from backtesting.diagnostics import build_trade_diagnostics
    from backtesting.metrics import build_summary
    from backtesting.snapshots import load_sampled_market_snapshots
from .logic import calculate_funding_percentile, evaluate_signal
from .risk import build_risk_plan, calculate_position_size
from .scoring import calculate_execution_quality, score_setup

FIVE_MINUTES_MS = 5 * 60 * 1000
ONE_HOUR_MS = 60 * 60 * 1000
TWO_HOURS_MS = 2 * ONE_HOUR_MS
FOUR_HOURS_MS = 4 * ONE_HOUR_MS
SEVEN_DAYS_MS = 7 * 24 * ONE_HOUR_MS


def run_backtest(dataset_path: Path, config: BacktestConfig) -> dict[str, Any]:
    sampled_rows, replay_filter = load_sampled_snapshots(dataset_path, config)
    equity = config.initial_equity
    equity_curve: list[dict[str, float | int | str]] = []
    trades: list[dict[str, Any]] = []
    open_positions: dict[str, dict[str, Any]] = {}
    symbol_histories: dict[str, list[dict[str, Any]]] = defaultdict(list)
    fees_paid = 0.0

    for row in sampled_rows:
        symbol = str(row["symbol"])
        history = symbol_histories[symbol]
        market_data = build_market_data(history, row)
        history.append(market_data)

        if symbol in open_positions:
            maybe_trade = maybe_close_position(open_positions[symbol], market_data, config)
            if maybe_trade is not None:
                equity += float(maybe_trade.get("equity_delta", maybe_trade["net_pnl"]))
                fees_paid += float(maybe_trade["fees"]) - float(open_positions[symbol]["entry_fee"])
                trades.append(maybe_trade)
                del open_positions[symbol]

        equity_curve.append({"timestamp": market_data["timestamp"], "equity": round(equity, 2)})
        if len(history) < 4 or symbol in open_positions:
            continue

        signal_eval = evaluate_signal(market_data)
        if signal_eval.get("signal") != "long":
            continue
        setup_score = score_setup(market_data, signal_eval)
        market_data["executionQuality"] = setup_score["execution_quality"]
        sizing = calculate_position_size(
            portfolio_value=equity,
            market_data=market_data,
            current_positions=[*open_positions.values()],
            signal_eval=signal_eval,
        )
        if not sizing.get("can_enter"):
            continue

        entry_price = apply_slippage(float(market_data["price"]), "long", int(setup_score["execution_quality"]), is_exit=False)
        size_usd = min(float(sizing["size_usd"]), equity * config.risk_fraction)
        if size_usd <= 0:
            continue
        risk_plan = build_risk_plan(market_data)
        entry_fee_result = calculate_trade_fee(notional_usd=size_usd, config=config)
        entry_fee = float(entry_fee_result["fee"])
        equity -= entry_fee
        fees_paid += entry_fee
        open_positions[symbol] = {
            "strategy_id": "short_squeeze_continuation",
            "symbol": symbol,
            "side": "long",
            "createdAt": int(market_data["timestamp_ms"]),
            "entry_timestamp": market_data["timestamp"],
            "entry_price": round(entry_price, 6),
            "size_usd": round(size_usd, 2),
            "entry_fee": round(entry_fee, 6),
            "entry_fee_rate": round(float(entry_fee_result["fee_rate"]), 8),
            "entry_liquidity_role": entry_fee_result["liquidity_role"],
            "stop_loss": round(entry_price * 0.992, 6),
            "take_profit": round(entry_price * 1.014, 6),
            "entry_context": {
                "signal": signal_eval,
                "score": setup_score,
                "risk_plan": risk_plan,
                "market": compact_market_context(market_data),
            },
        }

    for position in list(open_positions.values()):
        trade = close_position(position, position["entry_timestamp"], float(position["entry_price"]), "forced_close", config)
        equity += float(trade.get("equity_delta", trade["net_pnl"]))
        fees_paid += float(trade["fees"]) - float(position["entry_fee"])
        trades.append(trade)
        equity_curve.append({"timestamp": position["entry_timestamp"], "equity": round(equity, 2)})

    summary = build_summary(
        initial_equity=config.initial_equity,
        equity_curve=equity_curve,
        trades=trades,
        fees_paid=fees_paid,
    )
    diagnostics = build_trade_diagnostics(
        summary=summary,
        trades=trades,
        initial_equity=config.initial_equity,
        requested_symbols=replay_filter["requested_symbols"],
    )
    return {
        "dataset": {
            "path": str(dataset_path),
            "type": "gateway_snapshot_db",
            "rows": len(sampled_rows),
            "symbols": len({row["symbol"] for row in sampled_rows}),
            "symbol_filter": replay_filter,
            "sampling_bucket_minutes": 5,
            "start": sampled_rows[0]["timestamp"] if sampled_rows else None,
            "end": sampled_rows[-1]["timestamp"] if sampled_rows else None,
        },
        "summary": summary,
        "latest_signal": build_latest_signal(symbol_histories),
        "trades": trades,
        "equity_curve": equity_curve,
        "symbol_leaderboard": diagnostics["symbol_leaderboard"],
        "exit_reason_counts": diagnostics["exit_reason_counts"],
        "robust_assessment": diagnostics["robust_assessment"],
        "notes": [
            "Backend replay for short squeeze continuation using gateway market snapshots.",
            "Uses low/negative funding, shorts-at-risk crowding, price impulse, OI stability, and setup scores.",
            "Still needs orderbook and trade-flow replay before production candidacy.",
        ],
    }


def load_sampled_snapshots(dataset_path: Path, config: BacktestConfig) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    return load_sampled_market_snapshots(dataset_path, config, bucket_ms=FIVE_MINUTES_MS)


def build_market_data(history: list[dict[str, Any]], row: dict[str, Any]) -> dict[str, Any]:
    timestamps = [item["timestamp_ms"] for item in history]
    funding_history = [item["fundingRate"] for item in history if item["timestamp_ms"] >= row["timestamp_ms"] - SEVEN_DAYS_MS]
    price_1h = reference_value(history, timestamps, row["timestamp_ms"] - ONE_HOUR_MS, "price")
    price_4h = reference_value(history, timestamps, row["timestamp_ms"] - FOUR_HOURS_MS, "price")
    oi_1h = reference_value(history, timestamps, row["timestamp_ms"] - ONE_HOUR_MS, "openInterestUsd")
    market_data = {
        "timestamp": row["timestamp"],
        "timestamp_ms": row["timestamp_ms"],
        "symbol": row["symbol"],
        "price": row["price"],
        "fundingRate": row["funding_rate"],
        "fundingPercentile": calculate_funding_percentile(row["funding_rate"], funding_history),
        "change1h": pct_change(row["price"], price_1h),
        "change4h": pct_change(row["price"], price_4h),
        "change24h": row["change24h_pct"],
        "openInterestUsd": row["open_interest_usd"],
        "openInterestUsd1hAgo": oi_1h if oi_1h is not None else row["open_interest_usd"],
        "volume24h": row["volume24h"],
        "opportunityScore": round(float(row["opportunity_score"])),
        "crowdingBias": row["crowding_bias"],
        "primarySetup": row["primary_setup"],
        "setupScores": row["setup_scores"],
        "estimatedTotalLiquidationUsd": row["estimated_total_liquidation_usd"],
    }
    market_data["executionQuality"] = calculate_execution_quality(market_data)
    return market_data


def maybe_close_position(position: dict[str, Any], market_data: dict[str, Any], config: BacktestConfig) -> dict[str, Any] | None:
    price = float(market_data["price"])
    if price <= float(position["stop_loss"]):
        return close_position(position, market_data["timestamp"], apply_slippage(price, "long", int(market_data.get("executionQuality", 60)), True), "stop_loss", config)
    if price >= float(position["take_profit"]):
        return close_position(position, market_data["timestamp"], apply_slippage(price, "long", int(market_data.get("executionQuality", 60)), True), "take_profit", config)
    held_ms = int(market_data["timestamp_ms"]) - int(position["createdAt"])
    entry_oi = float(position["entry_context"]["market"].get("openInterestUsd", 0.0) or 0.0)
    current_oi = float(market_data.get("openInterestUsd", 0.0) or 0.0)
    oi_delta = ((current_oi - entry_oi) / entry_oi) * 100 if entry_oi else 0.0
    if oi_delta < -6.0:
        return close_position(position, market_data["timestamp"], apply_slippage(price, "long", int(market_data.get("executionQuality", 60)), True), "oi_collapse", config)
    if market_data.get("crowdingBias") != "shorts-at-risk" and held_ms >= ONE_HOUR_MS:
        return close_position(position, market_data["timestamp"], apply_slippage(price, "long", int(market_data.get("executionQuality", 60)), True), "crowding_flip", config)
    if held_ms >= TWO_HOURS_MS:
        return close_position(position, market_data["timestamp"], apply_slippage(price, "long", int(market_data.get("executionQuality", 60)), True), "time_stop", config)
    return None


def close_position(position: dict[str, Any], exit_timestamp: str, exit_price: float, exit_reason: str, config: BacktestConfig) -> dict[str, Any]:
    entry_price = float(position["entry_price"])
    size_usd = float(position["size_usd"])
    units = 0.0 if entry_price == 0 else size_usd / entry_price
    gross_pnl = (exit_price - entry_price) * units
    exit_fee_result = calculate_trade_fee(notional_usd=size_usd, config=config)
    exit_fee = float(exit_fee_result["fee"])
    total_fees = float(position["entry_fee"]) + exit_fee
    equity_delta = gross_pnl - exit_fee
    net_pnl = gross_pnl - total_fees
    return {
        "strategy_id": "short_squeeze_continuation",
        "symbol": position["symbol"],
        "side": "long",
        "entry_timestamp": position["entry_timestamp"],
        "exit_timestamp": exit_timestamp,
        "entry_price": round(entry_price, 6),
        "exit_price": round(exit_price, 6),
        "size_usd": round(size_usd, 2),
        "gross_pnl": round(gross_pnl, 2),
        "net_pnl": round(net_pnl, 2),
        "equity_delta": round(equity_delta, 2),
        "return_pct": round((net_pnl / size_usd) * 100, 3) if size_usd else 0.0,
        "fees": round(total_fees, 6),
        "entry_fee_rate": position.get("entry_fee_rate"),
        "exit_fee_rate": round(float(exit_fee_result["fee_rate"]), 8),
        "entry_liquidity_role": position.get("entry_liquidity_role"),
        "exit_liquidity_role": exit_fee_result["liquidity_role"],
        "exit_reason": exit_reason,
        "entry_context": position["entry_context"],
    }


def build_latest_signal(symbol_histories: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    candidates = []
    for history in symbol_histories.values():
        if not history:
            continue
        market_data = history[-1]
        signal_eval = evaluate_signal(market_data)
        setup_score = score_setup(market_data, signal_eval)
        candidates.append((setup_score["rank_score"], market_data, signal_eval, setup_score))
    if not candidates:
        return {"strategy_id": "short_squeeze_continuation", "signal": "none"}
    _, market_data, signal_eval, setup_score = sorted(candidates, key=lambda item: item[0], reverse=True)[0]
    return {
        **signal_eval,
        "symbol": market_data.get("symbol"),
        "rank_score": setup_score.get("rank_score"),
        "execution_quality": setup_score.get("execution_quality"),
        "trigger_plan": "Enter long only after shorts-at-risk crowding, low funding, positive impulse, and OI stability align.",
        "invalidation_plan": "Exit on -0.8% stop, OI collapse, crowding flip, or 120 minute time stop.",
    }


def reference_value(history: list[dict[str, Any]], timestamps: list[int], target_ms: int, key: str) -> float | None:
    if not history:
        return None
    index = bisect_right(timestamps, target_ms) - 1
    if index < 0:
        return None
    value = history[index].get(key)
    return float(value) if value is not None else None


def pct_change(current: float, previous: float | None) -> float:
    if previous in (None, 0):
        return 0.0
    return round(((current - previous) / previous) * 100, 4)


def apply_slippage(price: float, side: str, execution_quality: int, is_exit: bool) -> float:
    base = 0.00035 if execution_quality >= 75 else 0.0007 if execution_quality >= 55 else 0.0012
    slippage = base * (1.35 if is_exit else 1.0)
    return price * (1 - slippage) if side == "long" and is_exit else price * (1 + slippage)


def compact_market_context(market_data: dict[str, Any]) -> dict[str, Any]:
    keys = [
        "timestamp",
        "symbol",
        "price",
        "fundingPercentile",
        "change1h",
        "change4h",
        "openInterestUsd",
        "volume24h",
        "crowdingBias",
        "setupScores",
        "executionQuality",
    ]
    return {key: market_data.get(key) for key in keys}
