from __future__ import annotations

import json
import sqlite3
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .engine import BacktestConfig
from .filters import build_snapshot_filter

SNAPSHOT_COLUMNS = (
    "timestamp_ms",
    "symbol",
    "price",
    "change24h_pct",
    "open_interest_usd",
    "volume24h",
    "funding_rate",
    "opportunity_score",
    "signal_label",
    "risk_label",
    "estimated_total_liquidation_usd",
    "crowding_bias",
    "primary_setup",
    "setup_scores_json",
)


def load_sampled_market_snapshots(
    dataset_path: Path,
    config: BacktestConfig,
    *,
    bucket_ms: int,
    default_symbols: tuple[str, ...] = (),
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    replay_config = config
    default_symbols_applied = False
    if default_symbols and config.universe.strip().lower() != "all" and not config.effective_symbols():
        replay_config = replace(config, symbols=default_symbols)
        default_symbols_applied = True

    connection = sqlite3.connect(dataset_path)
    connection.row_factory = sqlite3.Row
    try:
        where_sql, where_params, replay_filter = build_snapshot_filter(
            connection,
            table="market_snapshots",
            timestamp_column="timestamp_ms",
            config=replay_config,
        )
        select_columns = ",\n        ".join(f"ms.{column}" for column in SNAPSHOT_COLUMNS)
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
            SELECT
                {select_columns}
            FROM market_snapshots ms
            JOIN sampled s ON s.id = ms.id
            ORDER BY ms.timestamp_ms ASC, ms.symbol ASC
            """,
            (*where_params, bucket_ms),
        ).fetchall()
    finally:
        connection.close()

    replay_filter["default_symbols_applied"] = default_symbols_applied
    return [_normalize_snapshot_row(row) for row in rows], replay_filter


def _normalize_snapshot_row(row: sqlite3.Row) -> dict[str, Any]:
    timestamp_ms = int(row["timestamp_ms"])
    return {
        "timestamp_ms": timestamp_ms,
        "timestamp": _iso_from_ms(timestamp_ms),
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


def _iso_from_ms(timestamp_ms: int) -> str:
    return datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc).isoformat()
