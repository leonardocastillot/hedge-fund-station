"""
Polymarket BTC Up/Down 5m runner.

Default mode is dry-run. Live mode requires valid Polymarket credentials and
the optional `py-clob-client` package.

This runner is intentionally backend-side and writes a local SQLite journal so
live vs paper performance can be audited with actual fills, fees, and ROI.
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.hyperliquid_gateway.strategies.polymarket_btc_updown_5m_oracle_lag import (  # noqa: E402
    calculate_position_size,
    calculate_realized_pnl,
    check_session_killswitch,
    entry_allowed,
    estimate_fee_pct,
    evaluate_signal,
    session_roi,
    side_entry_price,
)
from backend.hyperliquid_gateway.polymarket_api import execute_live_market_order  # noqa: E402


GAMMA_API = os.getenv("POLYMARKET_GAMMA_API", "https://gamma-api.polymarket.com")
DEFAULT_DB_PATH = ROOT / "backend" / "hyperliquid_gateway" / "data" / "polymarket_btc_5m.db"
DEFAULT_SLUG = os.getenv("POLYMARKET_MARKET_SLUG", "btc-updown-5m-1773548700")


@dataclass
class RunnerConfig:
    slug: str
    mode: str
    basis_bps: float
    balance_usd: float
    db_path: Path
    stake_pct: float
    max_notional_usd: float
    safety_margin_pct: float
    max_spread_pct: float
    min_seconds_to_expiry: int
    max_seconds_to_expiry: int
    max_consecutive_losses: int
    max_daily_drawdown_pct: float
    require_full_fill: bool


def db_connection(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    return connection


def init_db(path: Path) -> None:
    with db_connection(path) as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS session_state (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS market_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at_ms INTEGER NOT NULL,
                slug TEXT NOT NULL,
                event_id TEXT,
                yes_price REAL,
                best_bid REAL,
                best_ask REAL,
                spread_pct REAL,
                basis_bps REAL,
                seconds_to_expiry INTEGER,
                payload_json TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS trade_journal (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at_ms INTEGER NOT NULL,
                mode TEXT NOT NULL,
                slug TEXT NOT NULL,
                event_id TEXT,
                side TEXT NOT NULL,
                status TEXT NOT NULL,
                signal_confidence INTEGER,
                entry_price REAL,
                exit_price REAL,
                size_usd REAL,
                shares REAL,
                entry_fee_usd REAL,
                exit_fee_usd REAL,
                gross_pnl_usd REAL,
                net_pnl_usd REAL,
                roi_pct REAL,
                notes TEXT,
                payload_json TEXT
            );
            """
        )


def fetch_market_by_slug(slug: str) -> dict[str, Any]:
    with httpx.Client(timeout=12.0) as client:
        response = client.get(f"{GAMMA_API}/markets", params={"slug": slug, "limit": 1})
        response.raise_for_status()
        data = response.json()
    if isinstance(data, list) and data:
        return data[0]
    raise RuntimeError(f"Market slug not found: {slug}")


def parse_end_date_ms(raw_value: Any) -> int | None:
    if not raw_value:
        return None
    text = str(raw_value).replace("Z", "+00:00")
    try:
        return int(datetime.fromisoformat(text).timestamp() * 1000)
    except ValueError:
        return None


def extract_snapshot(market: dict[str, Any], basis_bps: float) -> dict[str, Any]:
    yes_price = float(market.get("lastTradePrice") or market.get("bestAsk") or 0.5)
    best_bid = float(market.get("bestBid") or yes_price)
    best_ask = float(market.get("bestAsk") or yes_price)
    end_ts_ms = parse_end_date_ms(market.get("endDate") or market.get("end_date_iso"))
    now_ms = int(time.time() * 1000)
    seconds_to_expiry = max(0, int(((end_ts_ms or now_ms) - now_ms) / 1000))

    spread_pct = max(0.0, (best_ask - best_bid) * 100)

    return {
        "slug": market.get("slug"),
        "event_id": str(market.get("eventId") or market.get("questionID") or ""),
        "yes_price": yes_price,
        "best_bid": best_bid,
        "best_ask": best_ask,
        "spread_pct": round(spread_pct, 4),
        "basis_bps": round(basis_bps, 4),
        "seconds_to_expiry": seconds_to_expiry,
        "yes_fee_pct": round(estimate_fee_pct(best_ask), 4),
        "no_fee_pct": round(estimate_fee_pct(1.0 - best_bid), 4),
        "fee_pct": round(max(estimate_fee_pct(best_ask), estimate_fee_pct(1.0 - best_bid)) * 2, 4),
        "slippage_pct": 0.12,
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "raw_market": market,
    }


def persist_snapshot(path: Path, snapshot: dict[str, Any]) -> None:
    with db_connection(path) as connection:
        connection.execute(
            """
            INSERT INTO market_snapshots (
                created_at_ms, slug, event_id, yes_price, best_bid, best_ask,
                spread_pct, basis_bps, seconds_to_expiry, payload_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                int(time.time() * 1000),
                snapshot["slug"],
                snapshot["event_id"],
                snapshot["yes_price"],
                snapshot["best_bid"],
                snapshot["best_ask"],
                snapshot["spread_pct"],
                snapshot["basis_bps"],
                snapshot["seconds_to_expiry"],
                json.dumps(snapshot["raw_market"]),
            ),
        )
        connection.commit()


def open_positions(path: Path) -> list[dict[str, Any]]:
    with db_connection(path) as connection:
        rows = connection.execute(
            "SELECT * FROM trade_journal WHERE status = 'OPEN' ORDER BY created_at_ms DESC"
        ).fetchall()
    return [dict(row) for row in rows]


def session_stats(path: Path, balance_usd: float) -> dict[str, Any]:
    with db_connection(path) as connection:
        rows = connection.execute(
            """
            SELECT net_pnl_usd
            FROM trade_journal
            WHERE status = 'CLOSED'
            ORDER BY created_at_ms DESC
            LIMIT 20
            """
        ).fetchall()

    consecutive_losses = 0
    realized_pnl_usd = 0.0
    for row in rows:
        pnl = float(row["net_pnl_usd"] or 0.0)
        realized_pnl_usd += pnl
        if pnl < 0:
            consecutive_losses += 1
        else:
            break

    drawdown_pct = (realized_pnl_usd / balance_usd) * 100 if balance_usd > 0 else 0.0
    return {
        "consecutive_losses": consecutive_losses,
        "daily_drawdown_pct": drawdown_pct,
    }


def place_live_order(config: RunnerConfig, market: dict[str, Any], signal_eval: dict[str, Any], size_usd: float) -> dict[str, Any]:
    return execute_live_market_order(
        market=market,
        snapshot=extract_snapshot(market, config.basis_bps),
        side=signal_eval["side"],
        size_usd=size_usd,
        require_full_fill=config.require_full_fill,
    )


def record_open_trade(
    path: Path,
    config: RunnerConfig,
    snapshot: dict[str, Any],
    signal_eval: dict[str, Any],
    size_usd: float,
    notes: str,
    execution: dict[str, Any] | None = None,
) -> None:
    entry_price = float(execution["avgPrice"]) if execution else side_entry_price(signal_eval["side"], float(snapshot["best_bid"]), float(snapshot["best_ask"]))
    shares = float(execution["shares"]) if execution else (size_usd / entry_price if entry_price > 0 else 0.0)
    entry_fee_usd = size_usd * (estimate_fee_pct(entry_price) / 100)
    with db_connection(path) as connection:
        connection.execute(
            """
            INSERT INTO trade_journal (
                created_at_ms, mode, slug, event_id, side, status, signal_confidence,
                entry_price, size_usd, shares, entry_fee_usd, notes, payload_json
            ) VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                int(time.time() * 1000),
                config.mode,
                snapshot["slug"],
                snapshot["event_id"],
                signal_eval["side"],
                signal_eval["confidence"],
                entry_price,
                round(size_usd, 4),
                round(shares, 8),
                round(entry_fee_usd, 6),
                notes,
                json.dumps({"snapshot": snapshot, "signal_eval": signal_eval, "execution": execution}),
            ),
        )
        connection.commit()


def close_trade(path: Path, trade_id: int, settlement_price: float) -> None:
    with db_connection(path) as connection:
        row = connection.execute("SELECT * FROM trade_journal WHERE id = ?", (trade_id,)).fetchone()
        if not row:
            return

        entry_fee_usd = float(row["entry_fee_usd"] or 0.0)
        exit_fee_usd = float(row["size_usd"] or 0.0) * (estimate_fee_pct(float(settlement_price)) / 100)
        pnl = calculate_realized_pnl(
            side=row["side"],
            entry_price=float(row["entry_price"]),
            exit_price=settlement_price,
            size_usd=float(row["size_usd"]),
            entry_fee_usd=entry_fee_usd,
            exit_fee_usd=exit_fee_usd,
        )
        connection.execute(
            """
            UPDATE trade_journal
            SET status = 'CLOSED',
                exit_price = ?,
                exit_fee_usd = ?,
                gross_pnl_usd = ?,
                net_pnl_usd = ?,
                roi_pct = ?
            WHERE id = ?
            """,
            (
                settlement_price,
                round(exit_fee_usd, 6),
                pnl["gross_pnl_usd"],
                pnl["net_pnl_usd"],
                pnl["roi_pct"],
                trade_id,
            ),
        )
        connection.commit()


def print_summary(path: Path, balance_usd: float) -> None:
    with db_connection(path) as connection:
        row = connection.execute(
            """
            SELECT
                COUNT(*) AS total_trades,
                COALESCE(SUM(net_pnl_usd), 0) AS total_pnl_usd
            FROM trade_journal
            WHERE status = 'CLOSED'
            """
        ).fetchone()

    total_pnl_usd = float(row["total_pnl_usd"] or 0.0)
    current_balance = balance_usd + total_pnl_usd
    print(
        json.dumps(
            {
                "total_closed_trades": int(row["total_trades"] or 0),
                "total_pnl_usd": round(total_pnl_usd, 4),
                "current_balance_usd": round(current_balance, 4),
                "session_roi_pct": session_roi(balance_usd, current_balance),
            },
            indent=2,
        )
    )


def run_once(config: RunnerConfig) -> None:
    init_db(config.db_path)
    market = fetch_market_by_slug(config.slug)
    snapshot = extract_snapshot(market, config.basis_bps)
    persist_snapshot(config.db_path, snapshot)

    session_guard = check_session_killswitch(
        session_stats(config.db_path, config.balance_usd),
        {
            "max_consecutive_losses": config.max_consecutive_losses,
            "max_daily_drawdown_pct": config.max_daily_drawdown_pct,
        },
    )

    signal_eval = evaluate_signal(
        snapshot,
        {
            "safety_margin_pct": config.safety_margin_pct,
            "max_spread_pct": config.max_spread_pct,
            "min_seconds_to_expiry": config.min_seconds_to_expiry,
            "max_seconds_to_expiry": config.max_seconds_to_expiry,
        },
    )
    position_sizing = calculate_position_size(
        balance_usd=config.balance_usd,
        config={
            "stake_pct": config.stake_pct,
            "max_notional_usd": config.max_notional_usd,
        },
        open_positions=open_positions(config.db_path),
    )
    allowed = entry_allowed(snapshot, signal_eval, session_guard)

    print(
        json.dumps(
            {
                "slug": config.slug,
                "mode": config.mode,
                "snapshot": {
                    "yes_price": snapshot["yes_price"],
                    "spread_pct": snapshot["spread_pct"],
                    "basis_bps": snapshot["basis_bps"],
                    "seconds_to_expiry": snapshot["seconds_to_expiry"],
                    "fee_pct": snapshot["fee_pct"],
                },
                "signal": signal_eval,
                "position_sizing": position_sizing,
                "session_guard": session_guard,
                "allowed": allowed,
            },
            indent=2,
        )
    )

    if not allowed["allowed"] or not position_sizing["can_enter"]:
        print_summary(config.db_path, config.balance_usd)
        return

    if config.mode == "live":
        execution = place_live_order(config, market, signal_eval, position_sizing["size_usd"])
        record_open_trade(
            config.db_path,
            config,
            snapshot,
            signal_eval,
            float(execution["spentUsd"]),
            f"Live CLOB order submitted: {execution['exchangeStatus']}",
            execution=execution,
        )
    else:
        record_open_trade(
            config.db_path,
            config,
            snapshot,
            signal_eval,
            position_sizing["size_usd"],
            "Dry-run entry recorded",
        )

    print_summary(config.db_path, config.balance_usd)


def parse_args() -> RunnerConfig:
    parser = argparse.ArgumentParser()
    parser.add_argument("--slug", default=DEFAULT_SLUG)
    parser.add_argument("--mode", choices=["dry-run", "live"], default="dry-run")
    parser.add_argument("--basis-bps", type=float, required=True)
    parser.add_argument("--balance-usd", type=float, default=12.0)
    parser.add_argument("--db-path", default=str(DEFAULT_DB_PATH))
    parser.add_argument("--stake-pct", type=float, default=100.0)
    parser.add_argument("--max-notional-usd", type=float, default=12.0)
    parser.add_argument("--safety-margin-pct", type=float, default=0.10)
    parser.add_argument("--max-spread-pct", type=float, default=1.2)
    parser.add_argument("--min-seconds-to-expiry", type=int, default=40)
    parser.add_argument("--max-seconds-to-expiry", type=int, default=250)
    parser.add_argument("--max-consecutive-losses", type=int, default=3)
    parser.add_argument("--max-daily-drawdown-pct", type=float, default=8.0)
    parser.add_argument("--require-full-fill", action="store_true")
    args = parser.parse_args()

    return RunnerConfig(
        slug=args.slug,
        mode=args.mode,
        basis_bps=args.basis_bps,
        balance_usd=args.balance_usd,
        db_path=Path(args.db_path),
        stake_pct=args.stake_pct,
        max_notional_usd=args.max_notional_usd,
        safety_margin_pct=args.safety_margin_pct,
        max_spread_pct=args.max_spread_pct,
        min_seconds_to_expiry=args.min_seconds_to_expiry,
        max_seconds_to_expiry=args.max_seconds_to_expiry,
        max_consecutive_losses=args.max_consecutive_losses,
        max_daily_drawdown_pct=args.max_daily_drawdown_pct,
        require_full_fill=args.require_full_fill,
    )


if __name__ == "__main__":
    run_once(parse_args())
