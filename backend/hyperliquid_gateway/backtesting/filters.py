from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from typing import Any

from .engine import BacktestConfig, parse_time_to_ms

DAY_MS = 24 * 60 * 60 * 1000


def build_snapshot_filter(
    connection: sqlite3.Connection,
    *,
    table: str,
    timestamp_column: str,
    config: BacktestConfig,
    symbol_column: str | None = "symbol",
) -> tuple[str, list[Any], dict[str, Any]]:
    symbols = config.effective_symbols() if symbol_column else ()
    start_ms = parse_time_to_ms(config.start)
    end_ms = parse_time_to_ms(config.end)

    if config.lookback_days and start_ms is None:
        reference_end = end_ms or latest_timestamp(
            connection,
            table=table,
            timestamp_column=timestamp_column,
            symbol_column=symbol_column,
            symbols=symbols,
        )
        if reference_end is not None:
            end_ms = end_ms or reference_end
            start_ms = reference_end - (int(config.lookback_days) * DAY_MS)

    conditions: list[str] = []
    params: list[Any] = []
    if symbol_column and symbols:
        placeholders = ", ".join("?" for _ in symbols)
        conditions.append(f"{symbol_column} IN ({placeholders})")
        params.extend(symbols)
    if start_ms is not None:
        conditions.append(f"{timestamp_column} >= ?")
        params.append(start_ms)
    if end_ms is not None:
        conditions.append(f"{timestamp_column} <= ?")
        params.append(end_ms)

    where_sql = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    summary = {
        "universe": config.universe,
        "requested_symbols": list(symbols),
        "start_ms": start_ms,
        "end_ms": end_ms,
        "start": iso_from_ms(start_ms) if start_ms is not None else None,
        "end": iso_from_ms(end_ms) if end_ms is not None else None,
        "lookback_days": config.lookback_days,
    }
    return where_sql, params, summary


def latest_timestamp(
    connection: sqlite3.Connection,
    *,
    table: str,
    timestamp_column: str,
    symbol_column: str | None,
    symbols: tuple[str, ...],
) -> int | None:
    conditions: list[str] = []
    params: list[Any] = []
    if symbol_column and symbols:
        placeholders = ", ".join("?" for _ in symbols)
        conditions.append(f"{symbol_column} IN ({placeholders})")
        params.extend(symbols)
    where_sql = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    value = connection.execute(f"SELECT MAX({timestamp_column}) FROM {table} {where_sql}", params).fetchone()[0]
    return int(value) if value is not None else None


def iso_from_ms(timestamp_ms: int) -> str:
    return datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
