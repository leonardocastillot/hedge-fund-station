from __future__ import annotations

import json
import sqlite3
from bisect import bisect_right
from collections import defaultdict
from pathlib import Path
from typing import Any

try:
    from ...backtesting.diagnostics import build_trade_diagnostics
    from ...backtesting.engine import BacktestConfig, calculate_trade_fee
    from ...backtesting.filters import build_snapshot_filter
    from ...backtesting.metrics import build_summary
except ImportError:
    from backtesting.diagnostics import build_trade_diagnostics
    from backtesting.engine import BacktestConfig, calculate_trade_fee
    from backtesting.filters import build_snapshot_filter
    from backtesting.metrics import build_summary
from .logic import calculate_funding_percentile, evaluate_signal
from .risk import build_risk_plan, calculate_position_size
from .scoring import calculate_execution_quality, score_setup

STRATEGY_ID = "oi_expansion_failure_fade"
FIVE_MINUTES_MS = 5 * 60 * 1000
FIFTEEN_MINUTES_MS = 15 * 60 * 1000
TWENTY_MINUTES_MS = 20 * 60 * 1000
ONE_HOUR_MS = 60 * 60 * 1000
FOUR_HOURS_MS = 4 * ONE_HOUR_MS
SEVEN_DAYS_MS = 7 * 24 * ONE_HOUR_MS
DEFAULT_SYMBOLS = ("BTC", "SOL", "HYPE")

FAILURE_FADE_ROBUST_GATE = {
    "min_trades": 30,
    "min_return_pct": 0.10,
    "min_profit_factor": 1.20,
    "max_drawdown_pct": 5.0,
    "min_avg_net_trade_return_pct": 0.06,
    "max_largest_trade_pnl_share_pct": 55.0,
    "max_exit_reason_pnl_share_pct": 85.0,
}


def run_backtest(dataset_path: Path, config: BacktestConfig) -> dict[str, Any]:
    sampled_rows, replay_filter = load_sampled_snapshots(dataset_path, config)
    equity = config.initial_equity
    equity_curve: list[dict[str, float | int | str]] = []
    trades: list[dict[str, Any]] = []
    open_positions: dict[str, dict[str, Any]] = {}
    symbol_histories: dict[str, list[dict[str, Any]]] = defaultdict(list)
    cooldown_until_by_symbol: dict[str, int] = defaultdict(int)
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
                cooldown_until_by_symbol[symbol] = int(market_data["timestamp_ms"]) + (
                    30 * 60 * 1000 if float(maybe_trade["net_pnl"]) < 0 else FIVE_MINUTES_MS
                )
                del open_positions[symbol]

        equity_curve.append({"timestamp": market_data["timestamp"], "equity": round(equity, 2)})

        if len(history) < 13 or symbol in open_positions:
            continue
        if int(market_data["timestamp_ms"]) < cooldown_until_by_symbol[symbol]:
            continue

        market_data["cooldownUntilMs"] = cooldown_until_by_symbol[symbol]
        signal_eval = evaluate_signal(market_data)
        if signal_eval.get("signal") not in {"long", "short"}:
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

        side = str(signal_eval["signal"])
        entry_price = apply_slippage(float(market_data["price"]), side, int(setup_score["execution_quality"]), is_exit=False)
        size_usd = min(float(sizing["size_usd"]), equity * config.risk_fraction)
        if size_usd <= 0:
            continue

        risk_plan = build_risk_plan({**market_data, "price": entry_price, "side": side}, side=side)
        entry_fee_result = calculate_trade_fee(notional_usd=size_usd, config=config)
        entry_fee = float(entry_fee_result["fee"])
        equity -= entry_fee
        fees_paid += entry_fee
        open_positions[symbol] = {
            "strategy_id": STRATEGY_ID,
            "symbol": symbol,
            "side": side,
            "createdAt": int(market_data["timestamp_ms"]),
            "entry_timestamp": market_data["timestamp"],
            "entry_price": round(entry_price, 6),
            "size_usd": round(size_usd, 2),
            "entry_fee": round(entry_fee, 6),
            "entry_fee_rate": round(float(entry_fee_result["fee_rate"]), 8),
            "entry_liquidity_role": entry_fee_result["liquidity_role"],
            "stop_loss": risk_plan["stop_loss"],
            "take_profit": risk_plan["take_profit"],
            "risk_plan": risk_plan,
            "entry_context": {
                "signal": signal_eval,
                "score": setup_score,
                "risk_plan": risk_plan,
                "market": compact_market_context(market_data),
            },
        }

    for position in list(open_positions.values()):
        latest_market_data = symbol_histories[str(position["symbol"])][-1]
        trade = close_position(
            position,
            latest_market_data["timestamp"],
            apply_slippage(float(latest_market_data["price"]), str(position["side"]), int(latest_market_data.get("executionQuality", 60)), True),
            "forced_close",
            config,
        )
        equity += float(trade.get("equity_delta", trade["net_pnl"]))
        fees_paid += float(trade["fees"]) - float(position["entry_fee"])
        trades.append(trade)
        equity_curve.append({"timestamp": latest_market_data["timestamp"], "equity": round(equity, 2)})

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
        robust_gate=FAILURE_FADE_ROBUST_GATE,
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
            "Gateway snapshot replay for OI expansion failure fade setups.",
            "Default universe is BTC,SOL,HYPE unless symbols or universe=all is explicitly provided.",
            "Passing validation only permits paper review; this is not a live-trading route.",
        ],
    }


def load_sampled_snapshots(dataset_path: Path, config: BacktestConfig) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    replay_config = config
    default_symbols_applied = False
    if config.universe.strip().lower() != "all" and not config.effective_symbols():
        from dataclasses import replace

        replay_config = replace(config, symbols=DEFAULT_SYMBOLS)
        default_symbols_applied = True

    connection = sqlite3.connect(dataset_path)
    connection.row_factory = sqlite3.Row
    where_sql, where_params, replay_filter = build_snapshot_filter(
        connection,
        table="market_snapshots",
        timestamp_column="timestamp_ms",
        config=replay_config,
    )
    rows = connection.execute(
        f"""
        WITH filtered AS (
            SELECT id, timestamp_ms, symbol
            FROM market_snapshots
            {where_sql}
        ),
        sampled AS (
            SELECT MAX(id) AS id
            FROM filtered
            GROUP BY symbol, CAST(timestamp_ms / ? AS INTEGER)
        )
        SELECT ms.*
        FROM market_snapshots ms
        JOIN sampled s ON s.id = ms.id
        ORDER BY ms.timestamp_ms ASC, ms.symbol ASC
        """,
        (*where_params, FIVE_MINUTES_MS),
    ).fetchall()
    connection.close()
    replay_filter["default_symbols_applied"] = default_symbols_applied
    normalized = [
        {
            "timestamp_ms": int(row["timestamp_ms"]),
            "timestamp": iso_from_ms(int(row["timestamp_ms"])),
            "symbol": row["symbol"],
            "price": float(row["price"] or 0.0),
            "change24h_pct": float(row["change24h_pct"] or 0.0),
            "open_interest_usd": float(row["open_interest_usd"] or 0.0),
            "volume24h": float(row["volume24h"] or 0.0),
            "funding_rate": float(row["funding_rate"] or 0.0),
            "opportunity_score": float(row["opportunity_score"] or 0.0),
            "signal_label": row["signal_label"],
            "risk_label": row["risk_label"],
            "estimated_total_liquidation_usd": float(row["estimated_total_liquidation_usd"] or 0.0),
            "crowding_bias": row["crowding_bias"] or "balanced",
            "primary_setup": row["primary_setup"] or "no-trade",
            "setup_scores": json.loads(row["setup_scores_json"] or "{}"),
        }
        for row in rows
    ]
    return normalized, replay_filter


def build_market_data(history: list[dict[str, Any]], row: dict[str, Any]) -> dict[str, Any]:
    timestamps = [item["timestamp_ms"] for item in history]
    funding_history = [item["fundingRate"] for item in history if item["timestamp_ms"] >= row["timestamp_ms"] - SEVEN_DAYS_MS]
    price_5m = reference_value(history, timestamps, row["timestamp_ms"] - FIVE_MINUTES_MS, "price")
    price_15m = reference_value(history, timestamps, row["timestamp_ms"] - FIFTEEN_MINUTES_MS, "price")
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
        "change5m": pct_change(row["price"], price_5m),
        "change15m": pct_change(row["price"], price_15m),
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
    side = str(position["side"])
    price = float(market_data["price"])
    execution_quality = int(market_data.get("executionQuality", 60) or 60)
    if side == "long":
        if price <= float(position["stop_loss"]):
            return close_position(position, market_data["timestamp"], apply_slippage(price, side, execution_quality, True), "stop_loss", config)
        if price >= float(position["take_profit"]):
            return close_position(position, market_data["timestamp"], apply_slippage(price, side, execution_quality, True), "take_profit", config)
    else:
        if price >= float(position["stop_loss"]):
            return close_position(position, market_data["timestamp"], apply_slippage(price, side, execution_quality, True), "stop_loss", config)
        if price <= float(position["take_profit"]):
            return close_position(position, market_data["timestamp"], apply_slippage(price, side, execution_quality, True), "take_profit", config)

    held_ms = int(market_data["timestamp_ms"]) - int(position["createdAt"])
    pnl_pct = current_pnl_pct(position, price)
    if held_ms >= TWENTY_MINUTES_MS and abs(pnl_pct) < 0.12:
        return close_position(position, market_data["timestamp"], apply_slippage(price, side, execution_quality, True), "no_progress", config)
    if held_ms >= ONE_HOUR_MS:
        return close_position(position, market_data["timestamp"], apply_slippage(price, side, execution_quality, True), "time_stop", config)
    if held_ms >= FIFTEEN_MINUTES_MS:
        if side == "long" and float(market_data.get("change15m", 0.0) or 0.0) <= -0.28:
            return close_position(position, market_data["timestamp"], apply_slippage(price, side, execution_quality, True), "impulse_reasserted", config)
        if side == "short" and float(market_data.get("change15m", 0.0) or 0.0) >= 0.28:
            return close_position(position, market_data["timestamp"], apply_slippage(price, side, execution_quality, True), "impulse_reasserted", config)
    return None


def close_position(position: dict[str, Any], exit_timestamp: str, exit_price: float, exit_reason: str, config: BacktestConfig) -> dict[str, Any]:
    entry_price = float(position["entry_price"])
    size_usd = float(position["size_usd"])
    units = 0.0 if entry_price == 0 else size_usd / entry_price
    side = str(position["side"])
    gross_pnl = (exit_price - entry_price) * units if side == "long" else (entry_price - exit_price) * units
    exit_fee_result = calculate_trade_fee(notional_usd=size_usd, config=config)
    exit_fee = float(exit_fee_result["fee"])
    total_fees = float(position["entry_fee"]) + exit_fee
    equity_delta = gross_pnl - exit_fee
    net_pnl = gross_pnl - total_fees
    return {
        "strategy_id": STRATEGY_ID,
        "symbol": position["symbol"],
        "side": side,
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
        return {"strategy_id": STRATEGY_ID, "signal": "none"}
    _, market_data, signal_eval, setup_score = sorted(candidates, key=lambda item: item[0], reverse=True)[0]
    return {
        **signal_eval,
        "symbol": market_data.get("symbol"),
        "rank_score": setup_score.get("rank_score"),
        "execution_quality": setup_score.get("execution_quality"),
        "trigger_plan": "Fade a liquid 1h impulse only after OI expands and 5m/15m continuation stalls.",
        "invalidation_plan": "Exit on dynamic stop, impulse reassertion, no-progress after 20m, or 60m time stop.",
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


def current_pnl_pct(position: dict[str, Any], current_price: float) -> float:
    entry_price = float(position["entry_price"])
    if entry_price == 0:
        return 0.0
    if position.get("side") == "short":
        return ((entry_price - current_price) / entry_price) * 100
    return ((current_price - entry_price) / entry_price) * 100


def apply_slippage(price: float, side: str, execution_quality: int, is_exit: bool) -> float:
    base = 0.0003 if execution_quality >= 75 else 0.00055 if execution_quality >= 55 else 0.0009
    slippage = base * (1.3 if is_exit else 1.0)
    if is_exit:
        return price * (1 - slippage) if side == "long" else price * (1 + slippage)
    return price * (1 + slippage) if side == "long" else price * (1 - slippage)


def compact_market_context(market_data: dict[str, Any]) -> dict[str, Any]:
    keys = [
        "timestamp",
        "symbol",
        "price",
        "fundingPercentile",
        "change5m",
        "change15m",
        "change1h",
        "change4h",
        "openInterestUsd",
        "openInterestUsd1hAgo",
        "volume24h",
        "crowdingBias",
        "primarySetup",
        "setupScores",
        "executionQuality",
    ]
    return {key: market_data.get(key) for key in keys}


def iso_from_ms(timestamp_ms: int) -> str:
    from datetime import datetime, timezone

    return datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
