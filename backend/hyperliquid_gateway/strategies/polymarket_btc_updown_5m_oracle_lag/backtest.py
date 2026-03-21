from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

from ...backtesting.engine import BacktestConfig
from ...backtesting.metrics import build_summary
from .logic import apply_signal_confirmation, evaluate_signal, side_entry_price
from .paper import calculate_realized_pnl, estimate_fee_pct
from .risk import calculate_position_size, check_session_killswitch, entry_allowed
from .scoring import score_setup

DEFAULT_CONFIG = {
    "safety_margin_pct": 0.10,
    "max_spread_pct": 1.2,
    "min_seconds_to_expiry": 40,
    "max_seconds_to_expiry": 250,
    "basis_sensitivity_bps": 8.0,
    "min_gross_edge_pct": 0.20,
    "stake_pct": 8.0,
    "max_notional_usd": 12.0,
    "max_consecutive_losses": 3,
    "max_daily_drawdown_pct": 8.0,
}

VARIANT_CONFIGS: dict[str, dict[str, float | int]] = {
    "baseline_taker": DEFAULT_CONFIG,
    "strict_spread": {
        **DEFAULT_CONFIG,
        "max_spread_pct": 0.8,
        "min_gross_edge_pct": 0.35,
        "min_net_edge_pct": 0.35,
    },
    "cheap_tail_taker": {
        **DEFAULT_CONFIG,
        "max_spread_pct": 0.75,
        "min_gross_edge_pct": 0.45,
        "min_net_edge_pct": 0.55,
        "max_entry_price": 0.35,
        "min_confidence": 70,
    },
    "micro_live_tail": {
        **DEFAULT_CONFIG,
        "max_spread_pct": 0.6,
        "min_seconds_to_expiry": 45,
        "max_seconds_to_expiry": 180,
        "min_gross_edge_pct": 0.6,
        "min_net_edge_pct": 1.0,
        "max_entry_price": 0.2,
        "min_confidence": 85,
        "require_price_to_beat": True,
        "require_accepting_orders": True,
    },
    "extreme_tail_confirmed": {
        **DEFAULT_CONFIG,
        "max_spread_pct": 1.0,
        "min_seconds_to_expiry": 55,
        "max_seconds_to_expiry": 140,
        "min_gross_edge_pct": 0.8,
        "min_net_edge_pct": 6.0,
        "max_entry_price": 0.35,
        "min_confidence": 94,
        "require_price_to_beat": True,
        "require_accepting_orders": True,
        "allowed_entry_buckets": ["cheap-tail", "discount"],
        "required_signal_persistence_count": 3,
        "min_confirmed_basis_bps": 6.0,
    },
}


def run_backtest(dataset_path: Path, config: BacktestConfig) -> dict[str, Any]:
    snapshots = load_snapshots(dataset_path)
    grouped = group_by_slug(snapshots)
    initial_equity = min(config.initial_equity, 250.0)
    baseline = simulate_variant(grouped, initial_equity, VARIANT_CONFIGS["baseline_taker"])
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
            "live_pilot_candidate": next(
                (item for item in variant_leaderboard if item["variant"] == "extreme_tail_confirmed"),
                None,
            ),
            "notes": [
                "Local Polymarket sample is still sparse, so variant ranking is directional research rather than production evidence.",
                "If all taker variants remain weak, the next serious strategy should be maker-biased basis skew rather than looser taker thresholds.",
            ],
        },
        "notes": [
            "Replay is based on recorded polymarket_btc_5m_snapshots in local SQLite.",
            "Settlement uses the final recorded yes_price as a proxy for realized event outcome.",
            "This remains a research replay until live/paper journal density improves.",
        ],
    }


def simulate_variant(
    grouped: dict[str, list[dict[str, Any]]],
    initial_equity: float,
    variant_config: dict[str, float | int],
) -> dict[str, Any]:
    balance_usd = initial_equity
    equity_curve: list[dict[str, float | str]] = []
    trades: list[dict[str, Any]] = []
    latest_signal = {"strategy_id": "polymarket_btc_updown_5m_oracle_lag", "signal": "HOLD", "status": "watch"}

    session_state = {
        "consecutive_losses": 0,
        "daily_drawdown_pct": 0.0,
    }

    for slug, rows in grouped.items():
        rows.sort(key=lambda item: item["created_at_ms"])
        open_trade: dict[str, Any] | None = None

        for row_index, snapshot in enumerate(rows):
            signal_eval = evaluate_signal(snapshot, variant_config)
            signal_eval = apply_signal_confirmation(signal_eval, rows[: row_index + 1], variant_config)
            latest_signal = build_latest_signal(snapshot, signal_eval)

            if open_trade is None:
                session_guard = check_session_killswitch(session_state, variant_config)
                allowed = entry_allowed(snapshot, signal_eval, session_guard)
                sizing = calculate_position_size(
                    balance_usd=balance_usd,
                    config=variant_config,
                    open_positions=[],
                )
                allowed = entry_allowed(snapshot, signal_eval, session_guard, variant_config)
                if allowed["allowed"] and sizing["can_enter"]:
                    rank = score_setup(snapshot, signal_eval)
                    entry_price = side_entry_price(signal_eval["side"], float(snapshot["best_bid"]), float(snapshot["best_ask"]))
                    size_usd = float(sizing["size_usd"])
                    entry_fee_usd = round(size_usd * (estimate_fee_pct(entry_price) / 100), 6)
                    open_trade = {
                        "slug": slug,
                        "snapshot": snapshot,
                        "signal_eval": signal_eval,
                        "rank": rank,
                        "entry_price": entry_price,
                        "size_usd": size_usd,
                        "entry_fee_usd": entry_fee_usd,
                    }

            equity_curve.append(
                {
                    "timestamp": snapshot["captured_at"],
                    "equity": round(balance_usd, 2),
                }
            )

        if open_trade is not None:
            settlement_price = settlement_price_from_rows(rows)
            pnl = calculate_realized_pnl(
                side=open_trade["signal_eval"]["side"],
                entry_price=open_trade["entry_price"],
                exit_price=settlement_price,
                size_usd=open_trade["size_usd"],
                entry_fee_usd=open_trade["entry_fee_usd"],
                exit_fee_usd=round(open_trade["size_usd"] * (estimate_fee_pct(settlement_price) / 100), 6),
            )
            balance_usd += float(pnl["net_pnl_usd"])
            trade = {
                "strategy_id": "polymarket_btc_updown_5m_oracle_lag",
                "slug": slug,
                "side": open_trade["signal_eval"]["side"],
                "entry_timestamp": open_trade["snapshot"]["captured_at"],
                "exit_timestamp": rows[-1]["captured_at"],
                "entry_price": round(open_trade["entry_price"], 6),
                "exit_price": round(settlement_price, 6),
                "size_usd": round(open_trade["size_usd"], 2),
                "gross_pnl": pnl["gross_pnl_usd"],
                "net_pnl": pnl["net_pnl_usd"],
                "return_pct": pnl["roi_pct"],
                "fees": round(open_trade["entry_fee_usd"] + (open_trade["size_usd"] * (estimate_fee_pct(settlement_price) / 100)), 6),
                "exit_reason": "event_resolution",
                "entry_context": {
                    "snapshot": open_trade["snapshot"],
                    "signal_eval": open_trade["signal_eval"],
                    "rank": open_trade["rank"],
                },
            }
            trades.append(trade)
            session_state["consecutive_losses"] = session_state["consecutive_losses"] + 1 if float(pnl["net_pnl_usd"]) < 0 else 0
            session_state["daily_drawdown_pct"] = round(((balance_usd - initial_equity) / initial_equity) * 100, 4)
            equity_curve.append({"timestamp": rows[-1]["captured_at"], "equity": round(balance_usd, 2)})

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
                "fees_enabled": bool(payload.get("feesEnabled", True)),
                "accepting_orders": bool(payload.get("acceptingOrders", True)),
                "price_to_beat": extract_price_to_beat_from_payload(payload),
                "yes_fee_pct": round(estimate_fee_pct(float(row["best_ask"] or row["yes_price"] or 0.5)), 4),
                "no_fee_pct": round(estimate_fee_pct(1.0 - float(row["best_bid"] or row["yes_price"] or 0.5)), 4),
                "fee_pct": round(max(
                    estimate_fee_pct(float(row["best_ask"] or row["yes_price"] or 0.5)),
                    estimate_fee_pct(1.0 - float(row["best_bid"] or row["yes_price"] or 0.5)),
                ) * 2, 4),
                "slippage_pct": 0.12,
                "payload": payload,
            }
        )
    return snapshots


def group_by_slug(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        grouped.setdefault(str(row["slug"]), []).append(row)
    return grouped


def settlement_price_from_rows(rows: list[dict[str, Any]]) -> float:
    final_row = rows[-1]
    final_yes_price = float(final_row["yes_price"])
    if 0.0 <= final_yes_price <= 1.0 and final_yes_price != 0.0:
        return final_yes_price
    return float(final_row["best_bid"] or final_row["best_ask"] or 0.5)


def build_latest_signal(snapshot: dict[str, Any], signal_eval: dict[str, Any]) -> dict[str, Any]:
    rank = score_setup(snapshot, signal_eval)
    return {
        "strategy_id": "polymarket_btc_updown_5m_oracle_lag",
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
        return {
            "variant": "maker_basis_skew_research",
            "reason": "No replay evidence is available yet.",
        }

    best = leaderboard[0]
    if (
        float(best.get("return_pct", 0.0) or 0.0) > 0
        and float(best.get("profit_factor", 0.0) or 0.0) >= 1.0
        and int(best.get("total_trades", 0) or 0) >= 2
    ):
        return {
            "variant": best["variant"],
            "reason": "This is the best fee-adjusted taker variant in the local replay sample.",
        }

    return {
        "variant": "maker_basis_skew_research",
        "reason": "All current taker variants are too weak or too sparse after fees, so the next serious candidate should reduce crossing costs.",
    }


def extract_price_to_beat_from_payload(payload: dict[str, Any]) -> float | None:
    event_metadata = payload.get("eventMetadata")
    if isinstance(event_metadata, dict) and event_metadata.get("priceToBeat") is not None:
        try:
            return float(event_metadata["priceToBeat"])
        except (TypeError, ValueError):
            return None

    events = payload.get("events")
    if isinstance(events, list):
        for event in events:
            if not isinstance(event, dict):
                continue
            metadata = event.get("eventMetadata")
            if isinstance(metadata, dict) and metadata.get("priceToBeat") is not None:
                try:
                    return float(metadata["priceToBeat"])
                except (TypeError, ValueError):
                    return None
    return None


def iso_from_ms(timestamp_ms: int) -> str:
    from datetime import datetime, timezone

    return datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
