from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

try:
    from ...backtesting.engine import BacktestConfig
    from ...backtesting.metrics import build_summary
except ImportError:
    from backtesting.engine import BacktestConfig
    from backtesting.metrics import build_summary
from .logic import evaluate_maker_setup, maker_outcome_book
from .paper import calculate_realized_pnl, estimate_fee_pct, estimate_maker_rebate_pct
from .risk import allow_maker_entry
from .scoring import score_maker_setup

DEFAULT_CONFIG = {
    "tick_size": 0.01,
    "min_seconds_to_expiry": 70,
    "max_seconds_to_expiry": 180,
    "min_abs_basis_bps": 8.0,
    "basis_sensitivity_bps": 10.0,
    "min_spread_pct": 1.0,
    "max_entry_price": 0.40,
    "allowed_entry_buckets": ["cheap-tail", "discount"],
    "target_move_pct": 0.06,
    "max_open_positions": 1,
    "min_confidence": 82,
    "min_net_edge_pct": 3.0,
    "stake_pct": 8.0,
    "max_notional_usd": 12.0,
}

VARIANT_CONFIGS: dict[str, dict[str, float | int | list[str]]] = {
    "maker_balanced": DEFAULT_CONFIG,
    "maker_conservative": {
        **DEFAULT_CONFIG,
        "min_abs_basis_bps": 12.0,
        "min_spread_pct": 1.2,
        "max_entry_price": 0.35,
        "target_move_pct": 0.05,
        "min_confidence": 88,
        "min_net_edge_pct": 4.0,
    },
    "maker_extreme": {
        **DEFAULT_CONFIG,
        "min_seconds_to_expiry": 80,
        "max_seconds_to_expiry": 150,
        "min_abs_basis_bps": 16.0,
        "min_spread_pct": 1.5,
        "max_entry_price": 0.30,
        "allowed_entry_buckets": ["cheap-tail"],
        "target_move_pct": 0.04,
        "min_confidence": 94,
        "min_net_edge_pct": 5.0,
    },
}


def run_backtest(dataset_path: Path, config: BacktestConfig) -> dict[str, Any]:
    snapshots = load_snapshots(dataset_path)
    grouped = group_by_slug(snapshots)
    initial_equity = min(config.initial_equity, 250.0)
    baseline = simulate_variant(grouped, initial_equity, VARIANT_CONFIGS["maker_balanced"])
    variant_results = {
        name: simulate_variant(grouped, initial_equity, variant_config)
        for name, variant_config in VARIANT_CONFIGS.items()
    }
    variant_leaderboard = build_variant_leaderboard(variant_results)
    recommended_next_variant = recommend_next_variant(variant_leaderboard)
    return {
        "dataset": {
            "path": str(dataset_path),
            "type": "polymarket_btc_5m_snapshot_db",
            "rows": len(snapshots),
            "events": len(grouped),
            "start": snapshots[0]["captured_at"] if snapshots else None,
            "end": snapshots[-1]["captured_at"] if snapshots else None,
        },
        "summary": baseline["summary"],
        "latest_signal": baseline["latest_signal"],
        "trades": baseline["trades"],
        "equity_curve": baseline["equity_curve"],
        "research_summary": {
            "variant_leaderboard": variant_leaderboard,
            "recommended_next_variant": recommended_next_variant,
            "live_pilot_candidate": next((item for item in variant_leaderboard if item["variant"] == "maker_conservative"), None),
            "notes": [
                "Maker replay only assumes fills when later snapshots trade through the passive quote.",
                "This strategy is designed to beat taker variants on execution quality, not to trade often.",
            ],
        },
        "notes": [
            "Replay uses top-of-book snapshots only and cannot model queue priority exactly.",
            "Entry rebate is modeled, but fill assumptions remain conservative.",
        ],
    }


def simulate_variant(grouped: dict[str, list[dict[str, Any]]], initial_equity: float, variant_config: dict[str, Any]) -> dict[str, Any]:
    balance_usd = initial_equity
    trades: list[dict[str, Any]] = []
    equity_curve: list[dict[str, Any]] = []
    latest_signal = {"strategy_id": "polymarket_btc_5m_maker_basis_skew", "signal": "HOLD", "status": "watch"}
    for slug, rows in grouped.items():
        rows.sort(key=lambda item: item["created_at_ms"])
        trade = simulate_single_event(slug, rows, balance_usd, variant_config)
        if trade:
            trades.append(trade)
            balance_usd += float(trade["net_pnl"])
        for snapshot in rows:
            latest_signal = build_latest_signal(snapshot, evaluate_maker_setup(snapshot, variant_config))
            equity_curve.append({"timestamp": snapshot["captured_at"], "equity": round(balance_usd, 2)})
    summary = build_summary(
        initial_equity=initial_equity,
        equity_curve=equity_curve or [{"timestamp": "n/a", "equity": initial_equity}],
        trades=trades,
        fees_paid=sum(float(trade["fees"]) for trade in trades),
    )
    return {
        "summary": summary,
        "latest_signal": latest_signal,
        "trades": trades,
        "equity_curve": equity_curve,
    }


def simulate_single_event(slug: str, rows: list[dict[str, Any]], balance_usd: float, config: dict[str, Any]) -> dict[str, Any] | None:
    size_usd = round(min(balance_usd * (float(config.get("stake_pct", 8.0)) / 100.0), float(config.get("max_notional_usd", 12.0)), balance_usd), 2)
    for index, snapshot in enumerate(rows[:-1]):
        signal_eval = evaluate_maker_setup(snapshot, config)
        allowed = allow_maker_entry(signal_eval, [], config)
        if not allowed["allowed"]:
            continue
        fill_index = find_fill_index(rows, index + 1, signal_eval["side"], float(signal_eval["entry_price"]))
        if fill_index is None:
            continue
        exit_index, exit_price, exit_reason = find_exit(rows, fill_index + 1, signal_eval["side"], float(signal_eval["target_exit_price"]))
        if exit_index is None:
            exit_index = len(rows) - 1
            exit_price = settlement_price(rows[-1], signal_eval["side"])
            exit_reason = "event_resolution"
        entry_rebate_usd = round(size_usd * (estimate_maker_rebate_pct(float(signal_eval["entry_price"])) / 100), 6)
        exit_fee_usd = round(size_usd * (estimate_fee_pct(exit_price) / 100), 6)
        pnl = calculate_realized_pnl(
            entry_price=float(signal_eval["entry_price"]),
            exit_price=float(exit_price),
            size_usd=size_usd,
            entry_rebate_usd=entry_rebate_usd,
            exit_fee_usd=exit_fee_usd,
        )
        rank = score_maker_setup(snapshot, signal_eval)
        return {
            "strategy_id": "polymarket_btc_5m_maker_basis_skew",
            "slug": slug,
            "side": signal_eval["side"],
            "entry_timestamp": rows[fill_index]["captured_at"],
            "exit_timestamp": rows[exit_index]["captured_at"],
            "entry_price": round(float(signal_eval["entry_price"]), 6),
            "exit_price": round(float(exit_price), 6),
            "size_usd": size_usd,
            "gross_pnl": pnl["gross_pnl_usd"],
            "net_pnl": pnl["net_pnl_usd"],
            "return_pct": pnl["roi_pct"],
            "fees": round(exit_fee_usd - entry_rebate_usd, 6),
            "exit_reason": exit_reason,
            "entry_context": {
                "snapshot": snapshot,
                "signal_eval": signal_eval,
                "rank": rank,
                "fill_index": fill_index,
            },
        }
    return None


def find_fill_index(rows: list[dict[str, Any]], start_index: int, side: str, entry_price: float) -> int | None:
    for index in range(start_index, len(rows)):
        _, outcome_ask = maker_outcome_book(side, float(rows[index]["best_bid"]), float(rows[index]["best_ask"]))
        if outcome_ask <= entry_price:
            return index
    return None


def find_exit(rows: list[dict[str, Any]], start_index: int, side: str, target_exit_price: float) -> tuple[int | None, float, str]:
    for index in range(start_index, len(rows)):
        outcome_bid, _ = maker_outcome_book(side, float(rows[index]["best_bid"]), float(rows[index]["best_ask"]))
        if outcome_bid >= target_exit_price:
            return index, target_exit_price, "maker_target"
    return None, 0.0, "event_resolution"


def settlement_price(snapshot: dict[str, Any], side: str) -> float:
    yes_price = float(snapshot.get("yes_price", 0.0) or 0.0)
    if side == "BUY_YES":
        return yes_price
    return round(max(0.0, 1.0 - yes_price), 6)


def load_snapshots(dataset_path: Path) -> list[dict[str, Any]]:
    connection = sqlite3.connect(dataset_path)
    connection.row_factory = sqlite3.Row
    rows = connection.execute(
        """
        SELECT created_at_ms, slug, event_id, yes_price, best_bid, best_ask,
               spread_pct, basis_bps, seconds_to_expiry, payload_json
        FROM polymarket_btc_5m_snapshots
        ORDER BY created_at_ms ASC
        """
    ).fetchall()
    connection.close()
    snapshots: list[dict[str, Any]] = []
    for row in rows:
        payload = json.loads(row["payload_json"] or "{}")
        snapshots.append(
            {
                "created_at_ms": int(row["created_at_ms"]),
                "captured_at": iso_from_ms(int(row["created_at_ms"])),
                "slug": row["slug"],
                "event_id": row["event_id"],
                "yes_price": float(row["yes_price"] or 0.0),
                "best_bid": float(row["best_bid"] or 0.0),
                "best_ask": float(row["best_ask"] or 0.0),
                "spread_pct": float(row["spread_pct"] or 0.0),
                "basis_bps": float(row["basis_bps"] or 0.0),
                "seconds_to_expiry": int(row["seconds_to_expiry"] or 0),
                "price_to_beat": extract_price_to_beat_from_payload(payload),
                "accepting_orders": bool(payload.get("acceptingOrders", True)),
                "payload": payload,
            }
        )
    return snapshots


def extract_price_to_beat_from_payload(payload: dict[str, Any]) -> float | None:
    event_metadata = payload.get("eventMetadata") if isinstance(payload.get("eventMetadata"), dict) else {}
    price_to_beat = event_metadata.get("priceToBeat")
    if price_to_beat is not None:
        return float(price_to_beat)
    events = payload.get("events")
    if isinstance(events, list):
        for event in events:
            if not isinstance(event, dict):
                continue
            metadata = event.get("eventMetadata")
            if isinstance(metadata, dict) and metadata.get("priceToBeat") is not None:
                return float(metadata.get("priceToBeat"))
    return None


def group_by_slug(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        grouped.setdefault(str(row["slug"]), []).append(row)
    return grouped


def build_latest_signal(snapshot: dict[str, Any], signal_eval: dict[str, Any]) -> dict[str, Any]:
    rank = score_maker_setup(snapshot, signal_eval)
    return {
        "strategy_id": "polymarket_btc_5m_maker_basis_skew",
        "slug": snapshot["slug"],
        "signal": signal_eval.get("signal", "HOLD"),
        "side": signal_eval.get("side"),
        "confidence": signal_eval.get("confidence", 0),
        "net_edge_pct": signal_eval.get("net_edge_pct"),
        "seconds_to_expiry": snapshot.get("seconds_to_expiry"),
        "rank_score": rank.get("rank_score"),
        "watchlist_label": rank.get("watchlist_label"),
        "status": "ready" if signal_eval.get("signal") == "ENTER" else "watch",
    }


def build_variant_leaderboard(variant_results: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    leaderboard = []
    for variant_name, result in variant_results.items():
        summary = result["summary"]
        leaderboard.append(
            {
                "variant": variant_name,
                "return_pct": summary.get("return_pct", 0.0),
                "profit_factor": summary.get("profit_factor", 0.0),
                "total_trades": summary.get("total_trades", 0),
                "win_rate_pct": summary.get("win_rate_pct", 0.0),
                "max_drawdown_pct": summary.get("max_drawdown_pct", 0.0),
                "fees_paid": summary.get("fees_paid", 0.0),
                "latest_signal_status": result["latest_signal"].get("status"),
            }
        )
    leaderboard.sort(
        key=lambda item: (
            float(item["return_pct"]),
            float(item["profit_factor"]),
            int(item["total_trades"]),
        ),
        reverse=True,
    )
    return leaderboard


def recommend_next_variant(leaderboard: list[dict[str, Any]]) -> dict[str, Any]:
    if not leaderboard:
        return {"variant": "maker_conservative", "reason": "No replay evidence is available yet."}
    best = leaderboard[0]
    return {
        "variant": best["variant"],
        "reason": "Maker variants should be compared first because they reduce spread crossing and fee drag.",
    }


def iso_from_ms(timestamp_ms: int) -> str:
    from datetime import datetime, timezone

    return datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
