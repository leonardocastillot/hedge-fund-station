from __future__ import annotations

import asyncio
import json
import os
import sqlite3
import time
from collections import defaultdict, deque
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field
from fastapi.middleware.cors import CORSMiddleware

from polymarket_api import init_polymarket_db, router as polymarket_router

HYPERLIQUID_API = os.getenv("HYPERLIQUID_API_URL", "https://api.hyperliquid.xyz/info")
TIMEOUT_SECONDS = float(os.getenv("HYPERLIQUID_TIMEOUT", "12"))
OVERVIEW_CACHE_MS = int(os.getenv("HYPERLIQUID_OVERVIEW_CACHE_MS", "8000"))
REFRESH_LOOP_SECONDS = float(os.getenv("HYPERLIQUID_REFRESH_LOOP_SECONDS", "8"))
MAX_HISTORY_POINTS = int(os.getenv("HYPERLIQUID_MAX_HISTORY_POINTS", "120"))
MAX_ALERTS = int(os.getenv("HYPERLIQUID_MAX_ALERTS", "160"))
DB_PATH = os.getenv("HYPERLIQUID_DB_PATH", "/data/hyperliquid.db")

app = FastAPI(title="Hyperliquid Gateway", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(polymarket_router)

overview_refresh_lock = asyncio.Lock()
overview_cache: dict[str, Any] | None = None
overview_cache_at = 0
overview_refresh_task: asyncio.Task[None] | None = None
overview_monitor_task: asyncio.Task[None] | None = None
monitor_started_at = int(time.time() * 1000)
last_refresh_attempt_at = 0
last_refresh_ok_at = 0
last_refresh_error: str | None = None
market_history: dict[str, deque[dict[str, Any]]] = defaultdict(lambda: deque(maxlen=MAX_HISTORY_POINTS))
market_alerts: deque[dict[str, Any]] = deque(maxlen=MAX_ALERTS)
aggregate_history: deque[dict[str, Any]] = deque(maxlen=MAX_HISTORY_POINTS)


class PaperSignalCreate(BaseModel):
    symbol: str
    setup_tag: str
    direction: str
    confidence: int = Field(ge=0, le=100)
    thesis: str
    entry_price: float | None = None
    invalidation: str | None = None
    decision_label: str | None = None
    trigger_plan: str | None = None
    execution_quality: int | None = None


class PaperTradeCreate(BaseModel):
    symbol: str
    side: str
    setup_tag: str
    thesis: str
    entry_price: float
    size_usd: float = Field(gt=0)
    stop_loss_pct: float | None = None
    take_profit_pct: float | None = None
    decision_label: str | None = None
    trigger_plan: str | None = None
    invalidation_plan: str | None = None
    execution_quality: int | None = None


class PaperTradeReviewCreate(BaseModel):
    close_reason: str
    outcome_tag: str
    execution_score: int = Field(ge=1, le=10)
    notes: str | None = None


def db_connection() -> sqlite3.Connection:
    db_file = Path(DB_PATH)
    db_file.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_file, timeout=30)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA busy_timeout = 30000")
    connection.execute("PRAGMA journal_mode = WAL")
    connection.execute("PRAGMA synchronous = NORMAL")
    return connection


def init_db() -> None:
    with db_connection() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS market_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp_ms INTEGER NOT NULL,
                symbol TEXT NOT NULL,
                price REAL,
                change24h_pct REAL,
                open_interest_usd REAL,
                volume24h REAL,
                funding_rate REAL,
                opportunity_score REAL,
                signal_label TEXT,
                risk_label TEXT,
                estimated_total_liquidation_usd REAL,
                crowding_bias TEXT,
                primary_setup TEXT,
                setup_scores_json TEXT
            );

            CREATE TABLE IF NOT EXISTS aggregate_snapshots (
                timestamp_ms INTEGER PRIMARY KEY,
                total_usd REAL NOT NULL,
                longs_usd REAL NOT NULL,
                shorts_usd REAL NOT NULL,
                dominant_side TEXT,
                payload_json TEXT
            );

            CREATE TABLE IF NOT EXISTS alerts (
                id TEXT PRIMARY KEY,
                created_at_ms INTEGER NOT NULL,
                symbol TEXT NOT NULL,
                type TEXT NOT NULL,
                severity TEXT NOT NULL,
                message TEXT NOT NULL,
                value REAL,
                delta REAL,
                payload_json TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_market_snapshots_symbol_time ON market_snapshots(symbol, timestamp_ms DESC);
            CREATE INDEX IF NOT EXISTS idx_alerts_time ON alerts(created_at_ms DESC);

            CREATE TABLE IF NOT EXISTS paper_signals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at_ms INTEGER NOT NULL,
                symbol TEXT NOT NULL,
                setup_tag TEXT NOT NULL,
                direction TEXT NOT NULL,
                confidence INTEGER NOT NULL,
                thesis TEXT NOT NULL,
                entry_price REAL,
                invalidation TEXT,
                decision_label TEXT,
                trigger_plan TEXT,
                execution_quality INTEGER,
                status TEXT NOT NULL DEFAULT 'open'
            );

            CREATE TABLE IF NOT EXISTS paper_trades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at_ms INTEGER NOT NULL,
                symbol TEXT NOT NULL,
                side TEXT NOT NULL,
                setup_tag TEXT NOT NULL,
                thesis TEXT NOT NULL,
                entry_price REAL NOT NULL,
                size_usd REAL NOT NULL,
                stop_loss_pct REAL,
                take_profit_pct REAL,
                decision_label TEXT,
                trigger_plan TEXT,
                invalidation_plan TEXT,
                execution_quality INTEGER,
                status TEXT NOT NULL DEFAULT 'open',
                closed_at_ms INTEGER,
                exit_price REAL,
                realized_pnl_usd REAL
            );

            CREATE INDEX IF NOT EXISTS idx_paper_signals_time ON paper_signals(created_at_ms DESC);
            CREATE INDEX IF NOT EXISTS idx_paper_trades_time ON paper_trades(created_at_ms DESC);

            CREATE TABLE IF NOT EXISTS paper_trade_reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                trade_id INTEGER NOT NULL UNIQUE,
                reviewed_at_ms INTEGER NOT NULL,
                close_reason TEXT NOT NULL,
                outcome_tag TEXT NOT NULL,
                execution_score INTEGER NOT NULL,
                notes TEXT,
                FOREIGN KEY(trade_id) REFERENCES paper_trades(id)
            );

            CREATE INDEX IF NOT EXISTS idx_paper_trade_reviews_time ON paper_trade_reviews(reviewed_at_ms DESC);

            """
        )
        ensure_column(connection, "paper_signals", "decision_label", "TEXT")
        ensure_column(connection, "paper_signals", "trigger_plan", "TEXT")
        ensure_column(connection, "paper_signals", "execution_quality", "INTEGER")
        ensure_column(connection, "paper_trades", "decision_label", "TEXT")
        ensure_column(connection, "paper_trades", "trigger_plan", "TEXT")
        ensure_column(connection, "paper_trades", "invalidation_plan", "TEXT")
        ensure_column(connection, "paper_trades", "execution_quality", "INTEGER")


def ensure_column(connection: sqlite3.Connection, table_name: str, column_name: str, column_type: str) -> None:
    columns = connection.execute(f"PRAGMA table_info({table_name})").fetchall()
    existing = {row["name"] for row in columns}
    if column_name not in existing:
        connection.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}")
        connection.commit()


def persist_market_snapshot(entry: dict[str, Any]) -> None:
    with db_connection() as connection:
        connection.execute(
            """
            INSERT INTO market_snapshots (
                timestamp_ms, symbol, price, change24h_pct, open_interest_usd, volume24h,
                funding_rate, opportunity_score, signal_label, risk_label,
                estimated_total_liquidation_usd, crowding_bias, primary_setup, setup_scores_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                entry["time"],
                entry["symbol"],
                entry["price"],
                entry["change24hPct"],
                entry["openInterestUsd"],
                entry["volume24h"],
                entry["fundingRate"],
                entry["opportunityScore"],
                entry["signalLabel"],
                entry["riskLabel"],
                entry.get("estimatedTotalLiquidationUsd"),
                entry.get("crowdingBias"),
                entry.get("primarySetup"),
                json.dumps(entry.get("setupScores", {})),
            ),
        )
        connection.commit()


def persist_aggregate_snapshot(snapshot: dict[str, Any]) -> None:
    with db_connection() as connection:
        connection.execute(
            """
            INSERT OR REPLACE INTO aggregate_snapshots (
                timestamp_ms, total_usd, longs_usd, shorts_usd, dominant_side, payload_json
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                snapshot["timestamp"],
                snapshot["total_usd"],
                snapshot["longs_usd"],
                snapshot["shorts_usd"],
                snapshot["dominant_side"],
                json.dumps(snapshot),
            ),
        )
        connection.commit()


def persist_alert(alert: dict[str, Any]) -> None:
    with db_connection() as connection:
        connection.execute(
            """
            INSERT OR IGNORE INTO alerts (
                id, created_at_ms, symbol, type, severity, message, value, delta, payload_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                alert["id"],
                alert["createdAt"],
                alert["symbol"],
                alert["type"],
                alert["severity"],
                alert["message"],
                alert.get("value"),
                alert.get("delta"),
                json.dumps(alert),
            ),
        )
        connection.commit()


def restore_state_from_db() -> None:
    market_history.clear()
    market_alerts.clear()
    aggregate_history.clear()

    with db_connection() as connection:
        snapshot_rows = connection.execute(
            """
            SELECT *
            FROM market_snapshots
            WHERE id IN (
                SELECT MAX(id)
                FROM market_snapshots
                GROUP BY symbol, ((id - 1) / ?)
            )
            ORDER BY timestamp_ms DESC
            LIMIT ?
            """,
            (MAX_HISTORY_POINTS, MAX_HISTORY_POINTS * 40),
        ).fetchall()
        counts: dict[str, int] = defaultdict(int)
        for row in reversed(snapshot_rows):
            symbol = row["symbol"]
            if counts[symbol] >= MAX_HISTORY_POINTS:
                continue
            market_history[symbol].append(
                {
                    "time": row["timestamp_ms"],
                    "symbol": symbol,
                    "price": row["price"],
                    "change24hPct": row["change24h_pct"],
                    "openInterestUsd": row["open_interest_usd"],
                    "volume24h": row["volume24h"],
                    "fundingRate": row["funding_rate"],
                    "opportunityScore": row["opportunity_score"],
                    "signalLabel": row["signal_label"],
                    "riskLabel": row["risk_label"],
                    "estimatedTotalLiquidationUsd": row["estimated_total_liquidation_usd"],
                    "crowdingBias": row["crowding_bias"],
                    "primarySetup": row["primary_setup"],
                    "setupScores": json.loads(row["setup_scores_json"] or "{}"),
                }
            )
            counts[symbol] += 1

        aggregate_rows = connection.execute(
            """
            SELECT payload_json FROM aggregate_snapshots
            ORDER BY timestamp_ms DESC
            LIMIT ?
            """,
            (MAX_HISTORY_POINTS,),
        ).fetchall()
        for row in reversed(aggregate_rows):
            aggregate_history.append(json.loads(row["payload_json"]))

        alert_rows = connection.execute(
            """
            SELECT payload_json FROM alerts
            ORDER BY created_at_ms DESC
            LIMIT ?
            """,
            (MAX_ALERTS,),
        ).fetchall()
        for row in alert_rows:
            market_alerts.append(json.loads(row["payload_json"]))


def current_price_map() -> dict[str, float]:
    if not overview_cache:
        return {}
    return {
        item["symbol"]: item["price"]
        for item in overview_cache.get("markets", [])
        if item.get("price") is not None
    }


def trade_mark_to_market(row: sqlite3.Row, prices: dict[str, float]) -> dict[str, Any]:
    entry = float(row["entry_price"])
    current = row["exit_price"] if row["status"] == "closed" and row["exit_price"] is not None else prices.get(row["symbol"])
    current = float(current) if current is not None else None
    side = row["side"]
    size_usd = float(row["size_usd"])
    units = 0 if entry == 0 else size_usd / entry
    unrealized = None
    pnl_pct = None
    if current is not None:
        if side == "long":
            unrealized = (current - entry) * units
            pnl_pct = ((current - entry) / entry) * 100
        else:
            unrealized = (entry - current) * units
            pnl_pct = ((entry - current) / entry) * 100

    return {
        "id": row["id"],
        "createdAt": row["created_at_ms"],
        "symbol": row["symbol"],
        "side": side,
        "setupTag": row["setup_tag"],
        "decisionLabel": row["decision_label"],
        "triggerPlan": row["trigger_plan"],
        "invalidationPlan": row["invalidation_plan"],
        "executionQuality": row["execution_quality"],
        "thesis": row["thesis"],
        "entryPrice": entry,
        "sizeUsd": size_usd,
        "stopLossPct": row["stop_loss_pct"],
        "takeProfitPct": row["take_profit_pct"],
        "status": row["status"],
        "closedAt": row["closed_at_ms"],
        "exitPrice": row["exit_price"],
        "realizedPnlUsd": row["realized_pnl_usd"],
        "markPrice": current,
        "unrealizedPnlUsd": unrealized if row["status"] == "open" else None,
        "pnlPct": pnl_pct if row["status"] == "open" else None,
    }


def review_map() -> dict[int, dict[str, Any]]:
    with db_connection() as connection:
        rows = connection.execute(
            """
            SELECT trade_id, reviewed_at_ms, close_reason, outcome_tag, execution_score, notes
            FROM paper_trade_reviews
            """
        ).fetchall()
    return {
        int(row["trade_id"]): {
            "reviewedAt": row["reviewed_at_ms"],
            "closeReason": row["close_reason"],
            "outcomeTag": row["outcome_tag"],
            "executionScore": row["execution_score"],
            "notes": row["notes"],
        }
        for row in rows
    }


def setup_direction(setup_name: str, row: dict[str, Any]) -> str:
    if setup_name in {"breakout-continuation", "short-squeeze"}:
        return "long"
    if setup_name in {"long-flush", "fade"}:
        return "short" if row.get("change24hPct", 0) > 0 else "long"
    return "neutral"




@app.on_event("startup")
async def startup_event() -> None:
    init_db()
    init_polymarket_db()
    asyncio.create_task(asyncio.to_thread(restore_state_from_db))
    start_overview_monitor()
    asyncio.create_task(refresh_overview_cache(force=True))


@app.on_event("shutdown")
async def shutdown_event() -> None:
    global overview_monitor_task, overview_refresh_task

    tasks = [overview_monitor_task, overview_refresh_task]
    for task in tasks:
        if task and not task.done():
            task.cancel()

    for task in tasks:
        if task:
            try:
                await task
            except asyncio.CancelledError:
                pass


async def post_info(payload: dict[str, Any]) -> Any:
    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
        response = await client.post(HYPERLIQUID_API, json=payload)
        response.raise_for_status()
        return response.json()


def to_float(value: Any) -> float | None:
    try:
        if value is None or value == "":
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def rank(value: float | None, sorted_values: list[float]) -> float:
    if value is None or not sorted_values:
        return 0.0
    for idx, current in enumerate(sorted_values):
        if value <= current:
            return idx / len(sorted_values)
    return 1.0


def build_signal(score_change: int, score_volume: int, score_oi: int, score_funding: int) -> str:
    if score_volume >= 70 and score_oi >= 70 and score_change >= 60:
        return "momentum-expansion"
    if score_oi >= 75 and score_funding >= 70:
        return "crowded-trend"
    if score_funding >= 75 and score_change <= 35:
        return "mean-reversion-watch"
    return "neutral"


def build_risk(score_oi: int, score_funding: int, score_change: int) -> str:
    if score_oi >= 80 and score_funding >= 75:
        return "high-crowding"
    if score_change >= 75 or score_oi >= 65:
        return "expanding"
    return "balanced"


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def iso_timestamp(timestamp_ms: int) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(timestamp_ms / 1000))


def pct_delta(current: float | None, previous: float | None) -> float | None:
    if current is None or previous in (None, 0):
        return None
    return ((current - previous) / previous) * 100


def append_alert(
    symbol: str,
    alert_type: str,
    severity: str,
    message: str,
    created_at: int,
    *,
    value: float | None = None,
    delta: float | None = None,
) -> None:
    alert = {
        "id": f"{symbol}-{alert_type}-{created_at}",
        "symbol": symbol,
        "type": alert_type,
        "severity": severity,
        "message": message,
        "value": value,
        "delta": delta,
        "createdAt": created_at,
    }
    market_alerts.appendleft(alert)
    persist_alert(alert)


def pressure_metrics(row: dict[str, Any]) -> dict[str, Any]:
    oi_usd = row.get("openInterestUsd") or 0.0
    change = row.get("change24hPct") or 0.0
    funding = row.get("fundingRate") or 0.0
    scores = row.get("scoreBreakdown", {})

    oi_factor = clamp((scores.get("openInterest", 0) or 0) / 100)
    volume_factor = clamp((scores.get("volume", 0) or 0) / 100)
    move_up_factor = clamp(max(change, 0) / 12)
    move_down_factor = clamp(max(-change, 0) / 12)
    funding_pos_factor = clamp(max(funding, 0) * 10_000 / 8)
    funding_neg_factor = clamp(max(-funding, 0) * 10_000 / 8)

    long_risk_factor = clamp(oi_factor * 0.45 + volume_factor * 0.15 + funding_pos_factor * 0.25 + move_down_factor * 0.15)
    short_risk_factor = clamp(oi_factor * 0.45 + volume_factor * 0.15 + funding_neg_factor * 0.25 + move_up_factor * 0.15)
    long_risk_usd = oi_usd * long_risk_factor
    short_risk_usd = oi_usd * short_risk_factor
    total_risk_usd = long_risk_usd + short_risk_usd
    imbalance = 0.0 if total_risk_usd == 0 else (short_risk_usd - long_risk_usd) / total_risk_usd
    if imbalance >= 0.18:
        crowding_bias = "shorts-at-risk"
    elif imbalance <= -0.18:
        crowding_bias = "longs-at-risk"
    else:
        crowding_bias = "balanced"

    return {
        "estimatedLongLiquidationUsd": long_risk_usd,
        "estimatedShortLiquidationUsd": short_risk_usd,
        "estimatedTotalLiquidationUsd": total_risk_usd,
        "pressureImbalance": imbalance,
        "crowdingBias": crowding_bias,
    }


def setup_scores(row: dict[str, Any]) -> dict[str, Any]:
    scores = row.get("scoreBreakdown", {})
    volume_score = scores.get("volume", 0) or 0
    oi_score = scores.get("openInterest", 0) or 0
    funding_score = scores.get("funding", 0) or 0
    change_score = scores.get("change", 0) or 0
    imbalance = row.get("pressureImbalance", 0.0) or 0.0
    signal_label = row.get("signalLabel")
    risk_label = row.get("riskLabel")

    breakout = round(clamp(volume_score * 0.35 + change_score * 0.3 + oi_score * 0.2 + max(imbalance, 0) * 25 + (8 if signal_label == "momentum-expansion" else 0), 0, 100))
    short_squeeze = round(clamp(oi_score * 0.35 + funding_score * 0.2 + change_score * 0.2 + max(imbalance, 0) * 45 + (10 if row.get("crowdingBias") == "shorts-at-risk" else 0), 0, 100))
    long_flush = round(clamp(oi_score * 0.35 + funding_score * 0.2 + change_score * 0.15 + max(-imbalance, 0) * 45 + (10 if row.get("crowdingBias") == "longs-at-risk" else 0), 0, 100))
    fade = round(clamp(funding_score * 0.35 + change_score * 0.25 + oi_score * 0.2 + (10 if signal_label == "mean-reversion-watch" else 0) + (8 if risk_label == "high-crowding" else 0), 0, 100))
    no_trade = round(clamp(100 - max(breakout, short_squeeze, long_flush, fade) + (15 if signal_label == "neutral" else 0), 0, 100))

    return {
        "breakoutContinuation": breakout,
        "shortSqueeze": short_squeeze,
        "longFlush": long_flush,
        "fade": fade,
        "noTrade": no_trade,
    }


def primary_setup_name(scores: dict[str, Any]) -> str:
    if not scores:
        return "no-trade"
    setup_key = max(scores, key=lambda key: scores[key])
    mapping = {
        "breakoutContinuation": "breakout-continuation",
        "shortSqueeze": "short-squeeze",
        "longFlush": "long-flush",
        "fade": "fade",
        "noTrade": "no-trade",
    }
    return mapping.get(setup_key, "no-trade")


def execution_quality(row: dict[str, Any]) -> int:
    volume_score = row.get("scoreBreakdown", {}).get("volume", 0) or 0
    oi_score = row.get("scoreBreakdown", {}).get("openInterest", 0) or 0
    pressure_score = round(clamp((row.get("estimatedTotalLiquidationUsd") or 0) / 75_000_000) * 100)
    funding_penalty = 0
    if row.get("riskLabel") == "high-crowding":
        funding_penalty = 14
    elif row.get("riskLabel") == "expanding":
        funding_penalty = 6
    return max(0, min(100, round(volume_score * 0.45 + oi_score * 0.35 + pressure_score * 0.2 - funding_penalty)))


def decision_label(row: dict[str, Any], exec_quality: int) -> str:
    opportunity = row.get("opportunityScore", 0) or 0
    setup = row.get("primarySetup", "no-trade")
    if setup == "no-trade":
        return "avoid"
    if opportunity >= 82 and exec_quality >= 64:
        return "watch-now"
    if opportunity >= 68 and exec_quality >= 48:
        return "wait-trigger"
    return "avoid"


def trigger_plan(row: dict[str, Any]) -> str:
    setup = row.get("primarySetup")
    crowding = row.get("crowdingBias")
    if setup == "breakout-continuation":
        return "Wait for pullback hold or fresh expansion with bids staying in control."
    if setup == "short-squeeze":
        return "Wait for offers to keep lifting and shorts to stay trapped on continuation."
    if setup == "long-flush":
        return "Wait for failed bounce and renewed downside pressure into crowded longs."
    if setup == "fade":
        return "Wait for exhaustion and failed continuation before fading the move."
    if crowding == "shorts-at-risk":
        return "Watch if price reclaims local highs and forces more short covering."
    if crowding == "longs-at-risk":
        return "Watch if support fails and liquidation pressure starts cascading."
    return "Wait for structure and flow to align."


def invalidation_plan(row: dict[str, Any]) -> str:
    setup = row.get("primarySetup")
    crowding = row.get("crowdingBias")
    if setup == "breakout-continuation":
        return "Invalidate if breakout loses follow-through and pullbacks fail to hold."
    if setup == "short-squeeze":
        return "Invalidate if squeeze stalls and aggressive buyers stop lifting offers."
    if setup == "long-flush":
        return "Invalidate if sellers fail to press lows and shorts lose momentum."
    if setup == "fade":
        return "Invalidate if trend keeps expanding with volume and OI still building."
    if crowding == "shorts-at-risk":
        return "Invalidate if trapped shorts unwind but price cannot extend higher."
    if crowding == "longs-at-risk":
        return "Invalidate if stressed longs hold structure and selling fails to accelerate."
    return "Invalidate if volume, OI and structure stop confirming the thesis."


def build_aggregate_snapshot(markets: list[dict[str, Any]], created_at: int) -> dict[str, Any]:
    longs_usd = sum(market.get("estimatedLongLiquidationUsd") or 0 for market in markets)
    shorts_usd = sum(market.get("estimatedShortLiquidationUsd") or 0 for market in markets)
    total_usd = longs_usd + shorts_usd
    ratio = 0.0 if shorts_usd == 0 else longs_usd / shorts_usd
    dominant_side = "balanced"
    if longs_usd > shorts_usd * 1.08:
        dominant_side = "longs"
    elif shorts_usd > longs_usd * 1.08:
        dominant_side = "shorts"

    high_risk_markets = sorted(
        markets,
        key=lambda item: item.get("estimatedTotalLiquidationUsd") or 0,
        reverse=True,
    )[:8]

    return {
        "timestamp": created_at,
        "timeframe": "rolling-1h",
        "total_usd": total_usd,
        "longs_usd": longs_usd,
        "shorts_usd": shorts_usd,
        "num_longs": sum(1 for item in markets if item.get("crowdingBias") == "longs-at-risk"),
        "num_shorts": sum(1 for item in markets if item.get("crowdingBias") == "shorts-at-risk"),
        "ratio_long_short": ratio,
        "dominant_side": dominant_side,
        "top_markets": [
            {
                "symbol": item["symbol"],
                "pressure_usd": item.get("estimatedTotalLiquidationUsd"),
                "bias": item.get("crowdingBias"),
                "price_change_pct": item.get("change24hPct"),
                "funding_rate": item.get("fundingRate"),
                "open_interest_usd": item.get("openInterestUsd"),
            }
            for item in high_risk_markets
        ],
    }


def build_liquidations_stats(snapshot: dict[str, Any]) -> dict[str, Any]:
    total_alerts = len(market_alerts)
    cascade_risk = "low"
    if snapshot["total_usd"] >= 4_500_000_000 or total_alerts >= 18:
        cascade_risk = "high"
    elif snapshot["total_usd"] >= 2_000_000_000 or total_alerts >= 8:
        cascade_risk = "medium"

    current_sentiment = "balanced"
    if snapshot["dominant_side"] == "longs":
        current_sentiment = "bullish but crowded"
    elif snapshot["dominant_side"] == "shorts":
        current_sentiment = "bearish but crowded"

    return {
        "is_running": True,
        "start_time": iso_timestamp(monitor_started_at),
        "runtime_hours": round((time.time() * 1000 - monitor_started_at) / 3_600_000, 2),
        "current_sentiment": current_sentiment,
        "cascade_risk": cascade_risk,
        "liquidations_1h": {
            "total_usd": snapshot["total_usd"],
            "longs_usd": snapshot["longs_usd"],
            "shorts_usd": snapshot["shorts_usd"],
            "ratio_long_short": snapshot["ratio_long_short"],
            "dominant_side": snapshot["dominant_side"],
        },
        "total_snapshots": len(aggregate_history),
        "total_alerts": total_alerts,
    }


def build_liquidations_insights(snapshot: dict[str, Any]) -> dict[str, Any]:
    dominant_side = snapshot["dominant_side"]
    reasoning: list[str] = []
    if dominant_side == "longs":
        trading_signal = "short"
        market_condition = "long crowding"
        reasoning.append("Long-side pressure dominates the market-wide positioning map.")
        reasoning.append("Look for failed continuation and liquidation cascades on crowded longs.")
    elif dominant_side == "shorts":
        trading_signal = "long"
        market_condition = "short crowding"
        reasoning.append("Short-side pressure dominates the market-wide positioning map.")
        reasoning.append("Look for squeeze continuation where price stays bid and shorts remain crowded.")
    else:
        trading_signal = "neutral"
        market_condition = "balanced"
        reasoning.append("Liquidation pressure is balanced across both sides.")

    top_market = snapshot["top_markets"][0] if snapshot.get("top_markets") else None
    if top_market:
        reasoning.append(f"Highest stress market right now is {top_market['symbol']} with {top_market['bias']}.")

    stats = build_liquidations_stats(snapshot)
    confidence = "high" if stats["cascade_risk"] == "high" else "medium" if top_market else "low"

    return {
        "market_condition": market_condition,
        "cascade_risk": stats["cascade_risk"],
        "trading_signal": trading_signal,
        "confidence": confidence,
        "reasoning": reasoning,
    }


def record_snapshot(markets: list[dict[str, Any]], created_at: int) -> None:
    for market in markets:
        symbol = market["symbol"]
        history = market_history[symbol]
        previous = history[-1] if history else None

        entry = {
            "time": created_at,
            "symbol": symbol,
            "price": market["price"],
            "change24hPct": market["change24hPct"],
            "openInterestUsd": market["openInterestUsd"],
            "volume24h": market["volume24h"],
            "fundingRate": market["fundingRate"],
            "opportunityScore": market["opportunityScore"],
            "signalLabel": market["signalLabel"],
            "riskLabel": market["riskLabel"],
            "estimatedTotalLiquidationUsd": market.get("estimatedTotalLiquidationUsd"),
            "crowdingBias": market.get("crowdingBias"),
            "primarySetup": market.get("primarySetup"),
            "setupScores": market.get("setupScores", {}),
        }
        history.append(entry)
        persist_market_snapshot(entry)

        if previous is None:
            if market["opportunityScore"] >= 88:
                append_alert(
                    symbol,
                    "high-priority",
                    "medium",
                    f"High priority market opened with score {market['opportunityScore']}.",
                    created_at,
                    value=market["opportunityScore"],
                )
            if market["riskLabel"] == "high-crowding":
                append_alert(
                    symbol,
                    "crowding",
                    "medium",
                    "Market is already in high crowding conditions.",
                    created_at,
                )
            continue

        score_delta = market["opportunityScore"] - previous.get("opportunityScore", 0)
        oi_delta = pct_delta(market["openInterestUsd"], previous.get("openInterestUsd"))
        price_delta = pct_delta(market["price"], previous.get("price"))
        funding_delta = None
        if market["fundingRate"] is not None and previous.get("fundingRate") is not None:
            funding_delta = (market["fundingRate"] - previous["fundingRate"]) * 10_000

        if abs(score_delta) >= 12:
            append_alert(
                symbol,
                "score-shift",
                "high" if abs(score_delta) >= 20 else "medium",
                f"Opportunity score moved {score_delta:+.0f} to {market['opportunityScore']}.",
                created_at,
                value=market["opportunityScore"],
                delta=score_delta,
            )

        if oi_delta is not None and abs(oi_delta) >= 8:
            append_alert(
                symbol,
                "oi-expansion",
                "high" if abs(oi_delta) >= 15 else "medium",
                f"Open interest moved {oi_delta:+.1f}% to {market['openInterestUsd'] or 0:,.0f} USD.",
                created_at,
                value=market["openInterestUsd"],
                delta=oi_delta,
            )

        if price_delta is not None and abs(price_delta) >= 2.5:
            append_alert(
                symbol,
                "price-impulse",
                "high" if abs(price_delta) >= 4 else "medium",
                f"Price moved {price_delta:+.2f}% between refreshes.",
                created_at,
                value=market["price"],
                delta=price_delta,
            )

        if funding_delta is not None and abs(funding_delta) >= 3:
            append_alert(
                symbol,
                "funding-shift",
                "high" if abs(funding_delta) >= 6 else "medium",
                f"Funding shifted {funding_delta:+.2f} bps to {(market['fundingRate'] or 0) * 100:.4f}%.",
                created_at,
                value=market["fundingRate"],
                delta=funding_delta,
            )

        if market["riskLabel"] == "high-crowding" and previous.get("riskLabel") != "high-crowding":
            append_alert(
                symbol,
                "crowding",
                "high",
                "Market entered high crowding conditions.",
                created_at,
            )

        if market["signalLabel"] != previous.get("signalLabel") and market["signalLabel"] != "neutral":
            append_alert(
                symbol,
                "signal-change",
                "medium",
                f"Signal rotated into {market['signalLabel']}.",
                created_at,
            )

    snapshot = build_aggregate_snapshot(markets, created_at)
    previous_aggregate = aggregate_history[-1] if aggregate_history else None
    aggregate_history.append(snapshot)
    persist_aggregate_snapshot(snapshot)

    if previous_aggregate:
        total_delta = pct_delta(snapshot["total_usd"], previous_aggregate.get("total_usd"))
        if total_delta is not None and abs(total_delta) >= 10:
            append_alert(
                "MARKET",
                "pressure-shift",
                "high" if abs(total_delta) >= 18 else "medium",
                f"Market-wide liquidation pressure moved {total_delta:+.1f}%.",
                created_at,
                value=snapshot["total_usd"],
                delta=total_delta,
            )
        if snapshot["dominant_side"] != previous_aggregate.get("dominant_side") and snapshot["dominant_side"] != "balanced":
            append_alert(
                "MARKET",
                "side-flip",
                "medium",
                f"Dominant liquidation pressure flipped to {snapshot['dominant_side']}.",
                created_at,
            )


def restore_markets_from_history() -> list[dict[str, Any]]:
    restored: list[dict[str, Any]] = []
    for symbol, entries in market_history.items():
        if not entries:
            continue
        latest = entries[-1]
        restored_row = {
            "symbol": symbol,
            "price": latest.get("price"),
            "prevDayPx": None,
            "change24hPct": latest.get("change24hPct", 0.0),
            "openInterest": None,
            "openInterestUsd": latest.get("openInterestUsd"),
            "volume24h": latest.get("volume24h"),
            "fundingRate": latest.get("fundingRate"),
            "premium": None,
            "maxLeverage": None,
            "sizeDecimals": None,
            "opportunityScore": latest.get("opportunityScore", 0),
            "scoreBreakdown": {"volume": 0, "openInterest": 0, "funding": 0, "change": 0},
            "signalLabel": latest.get("signalLabel", "neutral"),
            "riskLabel": latest.get("riskLabel", "balanced"),
            "estimatedLongLiquidationUsd": None,
            "estimatedShortLiquidationUsd": None,
            "estimatedTotalLiquidationUsd": latest.get("estimatedTotalLiquidationUsd"),
            "pressureImbalance": None,
            "crowdingBias": latest.get("crowdingBias"),
            "setupScores": latest.get("setupScores", {}),
            "primarySetup": latest.get("primarySetup", "no-trade"),
        }
        restored_row["executionQuality"] = execution_quality(restored_row)
        restored_row["decisionLabel"] = decision_label(restored_row, restored_row["executionQuality"])
        restored_row["triggerPlan"] = trigger_plan(restored_row)
        restored_row["invalidationPlan"] = invalidation_plan(restored_row)
        restored.append(restored_row)

    restored.sort(key=lambda item: item.get("opportunityScore", 0), reverse=True)
    return restored


def cached_overview_payload(markets: list[dict[str, Any]], updated_at: int) -> dict[str, Any]:
    return {
        "updatedAt": updated_at,
        "markets": markets,
        "leaders": {
            "topOpportunity": markets[0]["symbol"] if markets else None,
            "topVolume": max(markets, key=lambda item: item.get("volume24h") or 0)["symbol"] if markets else None,
            "topOpenInterest": max(markets, key=lambda item: item.get("openInterestUsd") or 0)["symbol"] if markets else None,
        },
    }


def build_overview_rows(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, list) or len(payload) < 2:
        raise HTTPException(status_code=502, detail="Unexpected Hyperliquid response shape.")

    meta = payload[0]
    contexts = payload[1]
    universe = meta.get("universe", []) if isinstance(meta, dict) else []

    rows: list[dict[str, Any]] = []
    for item, ctx in zip(universe, contexts):
        if not isinstance(item, dict) or not isinstance(ctx, dict):
            continue

        symbol = item.get("name")
        if not symbol:
            continue

        price = to_float(ctx.get("markPx") or ctx.get("midPx") or ctx.get("oraclePx"))
        prev_day = to_float(ctx.get("prevDayPx"))
        open_interest = to_float(ctx.get("openInterest"))
        volume_24h = to_float(ctx.get("dayNtlVlm"))
        funding = to_float(ctx.get("funding"))
        premium = to_float(ctx.get("premium"))
        change_24h = ((price - prev_day) / prev_day * 100) if price and prev_day else 0.0
        oi_usd = (open_interest * price) if open_interest and price else None

        rows.append(
            {
                "symbol": symbol,
                "price": price,
                "prevDayPx": prev_day,
                "change24hPct": change_24h,
                "openInterest": open_interest,
                "openInterestUsd": oi_usd,
                "volume24h": volume_24h,
                "fundingRate": funding,
                "premium": premium,
                "maxLeverage": item.get("maxLeverage"),
                "sizeDecimals": item.get("szDecimals"),
            }
        )

    volume_values = sorted([row["volume24h"] for row in rows if isinstance(row["volume24h"], (int, float))])
    oi_values = sorted([row["openInterestUsd"] for row in rows if isinstance(row["openInterestUsd"], (int, float))])
    funding_values = sorted([abs(row["fundingRate"]) for row in rows if isinstance(row["fundingRate"], (int, float))])
    change_values = sorted([abs(row["change24hPct"]) for row in rows if isinstance(row["change24hPct"], (int, float))])

    scored: list[dict[str, Any]] = []
    for row in rows:
        volume_score = round(rank(row["volume24h"], volume_values) * 100)
        oi_score = round(rank(row["openInterestUsd"], oi_values) * 100)
        funding_score = round(rank(abs(row["fundingRate"]) if row["fundingRate"] is not None else None, funding_values) * 100)
        change_score = round(rank(abs(row["change24hPct"]), change_values) * 100)
        opportunity_score = round(volume_score * 0.35 + oi_score * 0.3 + funding_score * 0.2 + change_score * 0.15)

        score_breakdown = {
            "volume": volume_score,
            "openInterest": oi_score,
            "funding": funding_score,
            "change": change_score,
        }
        enriched_row = {
            **row,
            "opportunityScore": opportunity_score,
            "scoreBreakdown": score_breakdown,
            "signalLabel": build_signal(change_score, volume_score, oi_score, funding_score),
            "riskLabel": build_risk(oi_score, funding_score, change_score),
        }
        enriched_row.update(pressure_metrics(enriched_row))
        enriched_row["setupScores"] = setup_scores(enriched_row)
        enriched_row["primarySetup"] = primary_setup_name(enriched_row["setupScores"])
        enriched_row["executionQuality"] = execution_quality(enriched_row)
        enriched_row["decisionLabel"] = decision_label(enriched_row, enriched_row["executionQuality"])
        enriched_row["triggerPlan"] = trigger_plan(enriched_row)
        enriched_row["invalidationPlan"] = invalidation_plan(enriched_row)
        scored.append(enriched_row)

    scored.sort(key=lambda item: item["opportunityScore"], reverse=True)
    return scored


async def refresh_overview_cache(force: bool = False) -> None:
    global overview_cache, overview_cache_at, last_refresh_attempt_at, last_refresh_ok_at, last_refresh_error

    now = int(time.time() * 1000)
    if not force and overview_cache and now - overview_cache_at <= OVERVIEW_CACHE_MS:
        return

    async with overview_refresh_lock:
        now = int(time.time() * 1000)
        if not force and overview_cache and now - overview_cache_at <= OVERVIEW_CACHE_MS:
            return

        last_refresh_attempt_at = now
        try:
            payload = await post_info({"type": "metaAndAssetCtxs"})
            markets = build_overview_rows(payload)
            overview_cache = cached_overview_payload(markets, now)
            overview_cache_at = now
            last_refresh_ok_at = now
            last_refresh_error = None
            record_snapshot(markets, now)
            return
        except Exception as exc:
            last_refresh_error = str(exc)
            restored_markets = restore_markets_from_history()
            if restored_markets:
                overview_cache = cached_overview_payload(restored_markets, now)
                overview_cache_at = now
                if not aggregate_history:
                    aggregate_history.append(build_aggregate_snapshot(restored_markets, now))
                return
            if overview_cache:
                return
            raise


def schedule_overview_refresh() -> None:
    global overview_refresh_task

    if overview_refresh_task and not overview_refresh_task.done():
        return
    overview_refresh_task = asyncio.create_task(refresh_overview_cache())


async def overview_monitor_loop() -> None:
    while True:
        try:
            await refresh_overview_cache(force=True)
        except Exception:
            pass
        await asyncio.sleep(REFRESH_LOOP_SECONDS)


def start_overview_monitor() -> None:
    global overview_monitor_task

    if overview_monitor_task and not overview_monitor_task.done():
        return
    overview_monitor_task = asyncio.create_task(overview_monitor_loop())


async def ensure_overview_data() -> dict[str, Any]:
    global overview_cache, overview_cache_at
    start_overview_monitor()

    now = int(time.time() * 1000)
    if overview_cache and now - overview_cache_at <= OVERVIEW_CACHE_MS:
        return overview_cache

    if overview_cache:
        schedule_overview_refresh()
        return overview_cache

    restored_markets = restore_markets_from_history()
    if restored_markets:
        overview_cache = cached_overview_payload(restored_markets, now)
        overview_cache_at = now
        if not aggregate_history:
            aggregate_history.append(build_aggregate_snapshot(restored_markets, now))
        schedule_overview_refresh()
        return overview_cache

    await refresh_overview_cache(force=True)
    if overview_cache:
        return overview_cache
    raise HTTPException(status_code=503, detail="Hyperliquid overview unavailable")


@app.get("/health")
async def health() -> dict[str, Any]:
    start_overview_monitor()
    now = int(time.time() * 1000)
    cache_age_ms = now - overview_cache_at if overview_cache_at else None
    return {
        "ok": True,
        "upstream": HYPERLIQUID_API,
        "cacheWarm": overview_cache is not None,
        "cacheUpdatedAt": overview_cache_at or None,
        "cacheAgeMs": cache_age_ms,
        "lastRefreshAttemptAt": last_refresh_attempt_at or None,
        "lastRefreshOkAt": last_refresh_ok_at or None,
        "lastRefreshError": last_refresh_error,
        "refreshLoopSeconds": REFRESH_LOOP_SECONDS,
    }


@app.get("/api/hyperliquid/overview")
async def overview(limit: int = Query(default=40, ge=5, le=150)) -> dict[str, Any]:
    payload = await ensure_overview_data()
    return {
        "updatedAt": payload["updatedAt"],
        "markets": payload["markets"][:limit],
        "leaders": payload["leaders"],
    }


@app.get("/api/hyperliquid/watchlist")
async def watchlist(limit: int = Query(default=18, ge=6, le=60)) -> dict[str, Any]:
    payload = await ensure_overview_data()
    markets = payload["markets"]
    ranked = sorted(
        markets,
        key=lambda item: (item.get("decisionLabel") == "watch-now", item.get("executionQuality", 0), item["opportunityScore"], item.get("estimatedTotalLiquidationUsd") or 0),
        reverse=True,
    )
    return {
        "updatedAt": payload["updatedAt"],
        "watchNow": [item for item in ranked if item.get("decisionLabel") == "watch-now"][:limit],
        "waitTrigger": [item for item in ranked if item.get("decisionLabel") == "wait-trigger"][:limit],
        "avoid": [item for item in ranked if item.get("decisionLabel") == "avoid"][:limit],
        "squeezeWatch": [item for item in ranked if item.get("primarySetup") in {"short-squeeze", "long-flush"}][:limit],
        "breakoutWatch": [item for item in ranked if item.get("primarySetup") == "breakout-continuation"][:limit],
        "fadeWatch": [item for item in ranked if item.get("primarySetup") == "fade"][:limit],
    }


@app.get("/api/hyperliquid/paper/signals")
async def paper_signals(limit: int = Query(default=20, ge=5, le=100)) -> dict[str, Any]:
    with db_connection() as connection:
        rows = connection.execute(
            """
            SELECT * FROM paper_signals
            ORDER BY created_at_ms DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return {
        "signals": [
            {
                "id": row["id"],
                "createdAt": row["created_at_ms"],
                "symbol": row["symbol"],
                "setupTag": row["setup_tag"],
                "direction": row["direction"],
                "confidence": row["confidence"],
                "thesis": row["thesis"],
                "entryPrice": row["entry_price"],
                "invalidation": row["invalidation"],
                "decisionLabel": row["decision_label"],
                "triggerPlan": row["trigger_plan"],
                "executionQuality": row["execution_quality"],
                "status": row["status"],
            }
            for row in rows
        ]
    }


@app.post("/api/hyperliquid/paper/signals")
async def create_paper_signal(payload: PaperSignalCreate) -> dict[str, Any]:
    created_at = int(time.time() * 1000)
    with db_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO paper_signals (
                created_at_ms, symbol, setup_tag, direction, confidence, thesis, entry_price, invalidation, decision_label, trigger_plan, execution_quality, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')
            """,
            (
                created_at,
                payload.symbol.upper(),
                payload.setup_tag,
                payload.direction,
                payload.confidence,
                payload.thesis,
                payload.entry_price,
                payload.invalidation,
                payload.decision_label,
                payload.trigger_plan,
                payload.execution_quality,
            ),
        )
        signal_id = cursor.lastrowid
        connection.commit()
    return {"success": True, "id": signal_id}


@app.post("/api/hyperliquid/paper/signals/seed")
async def seed_paper_signals(limit: int = Query(default=6, ge=3, le=12)) -> dict[str, Any]:
    payload = await ensure_overview_data()
    created = 0
    now = int(time.time() * 1000)
    watch_candidates = [item for item in payload["markets"] if item.get("primarySetup") != "no-trade"][:limit]
    with db_connection() as connection:
        for item in watch_candidates:
            symbol = item["symbol"]
            existing = connection.execute(
                """
                SELECT 1 FROM paper_signals
                WHERE symbol = ? AND status = 'open'
                ORDER BY created_at_ms DESC
                LIMIT 1
                """,
                (symbol,),
            ).fetchone()
            if existing:
                continue
            direction = setup_direction(item.get("primarySetup", "no-trade"), item)
            if direction == "neutral":
                continue
            connection.execute(
                """
                INSERT INTO paper_signals (
                    created_at_ms, symbol, setup_tag, direction, confidence, thesis, entry_price, invalidation, decision_label, trigger_plan, execution_quality, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')
                """,
                (
                    now,
                    symbol,
                    item.get("primarySetup", "no-trade"),
                    direction,
                    item.get("opportunityScore", 0),
                    f"{setup_direction(item.get('primarySetup', 'no-trade'), item)} bias from {item.get('primarySetup')} with OI/funding/pressure alignment.",
                    item.get("price"),
                    item.get("invalidationPlan") or f"Invalid if setup loses edge: {item.get('signalLabel')} / {item.get('crowdingBias')}",
                    item.get("decisionLabel"),
                    item.get("triggerPlan"),
                    item.get("executionQuality"),
                ),
            )
            created += 1
        connection.commit()
    return {"success": True, "created": created}


@app.get("/api/hyperliquid/paper/trades")
async def paper_trades(status: str = Query(default="all")) -> dict[str, Any]:
    await ensure_overview_data()
    prices = current_price_map()
    reviews = review_map()
    query = "SELECT * FROM paper_trades"
    params: tuple[Any, ...] = ()
    if status in {"open", "closed"}:
        query += " WHERE status = ?"
        params = (status,)
    query += " ORDER BY created_at_ms DESC LIMIT 100"
    with db_connection() as connection:
        rows = connection.execute(query, params).fetchall()
    trades_payload = []
    for row in rows:
        payload = trade_mark_to_market(row, prices)
        payload["review"] = reviews.get(payload["id"])
        trades_payload.append(payload)
    return {"trades": trades_payload}


@app.post("/api/hyperliquid/paper/trades")
async def create_paper_trade(payload: PaperTradeCreate) -> dict[str, Any]:
    created_at = int(time.time() * 1000)
    with db_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO paper_trades (
                created_at_ms, symbol, side, setup_tag, thesis, entry_price, size_usd, stop_loss_pct, take_profit_pct, decision_label, trigger_plan, invalidation_plan, execution_quality, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')
            """,
            (
                created_at,
                payload.symbol.upper(),
                payload.side,
                payload.setup_tag,
                payload.thesis,
                payload.entry_price,
                payload.size_usd,
                payload.stop_loss_pct,
                payload.take_profit_pct,
                payload.decision_label,
                payload.trigger_plan,
                payload.invalidation_plan,
                payload.execution_quality,
            ),
        )
        trade_id = cursor.lastrowid
        connection.commit()
    return {"success": True, "id": trade_id}


@app.post("/api/hyperliquid/paper/trades/{trade_id}/close")
async def close_paper_trade(trade_id: int) -> dict[str, Any]:
    await ensure_overview_data()
    prices = current_price_map()
    with db_connection() as connection:
        row = connection.execute("SELECT * FROM paper_trades WHERE id = ?", (trade_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Paper trade not found.")
        if row["status"] == "closed":
            return {"success": True, "id": trade_id}
        symbol = row["symbol"]
        exit_price = prices.get(symbol)
        if exit_price is None:
            raise HTTPException(status_code=400, detail=f"No mark price for {symbol}.")
        mtm = trade_mark_to_market(row, prices)
        connection.execute(
            """
            UPDATE paper_trades
            SET status = 'closed', closed_at_ms = ?, exit_price = ?, realized_pnl_usd = ?
            WHERE id = ?
            """,
            (
                int(time.time() * 1000),
                exit_price,
                mtm.get("unrealizedPnlUsd"),
                trade_id,
            ),
        )
        connection.commit()
    return {"success": True, "id": trade_id}


@app.post("/api/hyperliquid/paper/trades/{trade_id}/review")
async def review_paper_trade(trade_id: int, payload: PaperTradeReviewCreate) -> dict[str, Any]:
    with db_connection() as connection:
        trade = connection.execute("SELECT id, status FROM paper_trades WHERE id = ?", (trade_id,)).fetchone()
        if not trade:
            raise HTTPException(status_code=404, detail="Paper trade not found.")
        if trade["status"] != "closed":
            raise HTTPException(status_code=400, detail="Trade must be closed before review.")
        connection.execute(
            """
            INSERT INTO paper_trade_reviews (
                trade_id, reviewed_at_ms, close_reason, outcome_tag, execution_score, notes
            ) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(trade_id) DO UPDATE SET
                reviewed_at_ms = excluded.reviewed_at_ms,
                close_reason = excluded.close_reason,
                outcome_tag = excluded.outcome_tag,
                execution_score = excluded.execution_score,
                notes = excluded.notes
            """,
            (
                trade_id,
                int(time.time() * 1000),
                payload.close_reason,
                payload.outcome_tag,
                payload.execution_score,
                payload.notes,
            ),
        )
        connection.commit()
    return {"success": True, "id": trade_id}


@app.get("/api/hyperliquid/paper/session-analytics")
async def paper_session_analytics() -> dict[str, Any]:
    with db_connection() as connection:
        rows = connection.execute(
            """
            SELECT created_at_ms, realized_pnl_usd
            FROM paper_trades
            WHERE status = 'closed'
            ORDER BY created_at_ms DESC
            LIMIT 500
            """
        ).fetchall()

    hour_buckets: dict[int, dict[str, Any]] = defaultdict(lambda: {"trades": 0, "wins": 0, "pnl_usd": 0.0})
    for row in rows:
        created_at = int(row["created_at_ms"])
        hour = int(time.localtime(created_at / 1000).tm_hour)
        pnl_value = float(row["realized_pnl_usd"] or 0.0)
        bucket = hour_buckets[hour]
        bucket["trades"] += 1
        bucket["pnl_usd"] += pnl_value
        if pnl_value > 0:
            bucket["wins"] += 1

    best_hours = [
        {
            "hour": f"{hour:02d}:00",
            "trades": values["trades"],
            "wins": values["wins"],
            "winRate": 0 if values["trades"] == 0 else round((values["wins"] / values["trades"]) * 100, 1),
            "pnlUsd": round(values["pnl_usd"], 2),
        }
        for hour, values in sorted(hour_buckets.items(), key=lambda item: item[1]["pnl_usd"], reverse=True)
    ][:8]

    return {
        "bestHours": best_hours,
    }




@app.get("/api/hyperliquid/alerts")
async def alerts(limit: int = Query(default=24, ge=5, le=100)) -> dict[str, Any]:
    return {
        "updatedAt": overview_cache_at or int(time.time() * 1000),
        "alerts": list(market_alerts)[:limit],
    }


@app.get("/api/hyperliquid/history/{symbol}")
async def history(symbol: str, limit: int = Query(default=60, ge=10, le=120)) -> dict[str, Any]:
    await ensure_overview_data()
    entries = list(market_history[symbol.upper()])
    return {
        "symbol": symbol.upper(),
        "updatedAt": overview_cache_at or int(time.time() * 1000),
        "points": entries[-limit:],
    }


@app.get("/api/hyperliquid/orderbook/{symbol}")
async def orderbook(symbol: str) -> dict[str, Any]:
    payload = await post_info({"type": "l2Book", "coin": symbol.upper()})
    if not isinstance(payload, dict):
        raise HTTPException(status_code=502, detail="Unexpected orderbook payload.")

    levels = payload.get("levels", [])
    bids = levels[0] if isinstance(levels, list) and len(levels) > 0 else []
    asks = levels[1] if isinstance(levels, list) and len(levels) > 1 else []

    def normalize(level_set: list[Any]) -> list[dict[str, Any]]:
        normalized = []
        for level in level_set[:12]:
            if isinstance(level, dict):
                px = to_float(level.get("px"))
                sz = to_float(level.get("sz"))
                normalized.append({"price": px, "size": sz, "count": level.get("n")})
        return normalized

    bid_levels = normalize(bids)
    ask_levels = normalize(asks)
    bid_total = sum(level["size"] or 0 for level in bid_levels)
    ask_total = sum(level["size"] or 0 for level in ask_levels)
    imbalance = 0 if bid_total + ask_total == 0 else (bid_total - ask_total) / (bid_total + ask_total)

    return {
        "symbol": symbol.upper(),
        "bids": bid_levels,
        "asks": ask_levels,
        "stats": {
            "bestBid": bid_levels[0]["price"] if bid_levels else None,
            "bestAsk": ask_levels[0]["price"] if ask_levels else None,
            "bidDepth": bid_total,
            "askDepth": ask_total,
            "imbalance": imbalance,
        },
    }


@app.get("/api/hyperliquid/candles/{symbol}")
async def candles(
    symbol: str,
    interval: str = Query(default="1h"),
    lookback_hours: int = Query(default=24, ge=1, le=240),
) -> dict[str, Any]:
    end_time = int(time.time() * 1000)
    start_time = end_time - lookback_hours * 60 * 60 * 1000
    payload = await post_info(
        {
            "type": "candleSnapshot",
            "req": {
                "coin": symbol.upper(),
                "interval": interval,
                "startTime": start_time,
                "endTime": end_time,
            },
        }
    )

    if not isinstance(payload, list):
        raise HTTPException(status_code=502, detail="Unexpected candles payload.")

    candles = []
    for candle in payload[-200:]:
        if not isinstance(candle, dict):
            continue
        candles.append(
            {
                "time": candle.get("t"),
                "open": to_float(candle.get("o")),
                "high": to_float(candle.get("h")),
                "low": to_float(candle.get("l")),
                "close": to_float(candle.get("c")),
                "volume": to_float(candle.get("v")),
            }
        )

    return {"symbol": symbol.upper(), "interval": interval, "candles": candles}


@app.get("/api/hyperliquid/trades/{symbol}")
async def trades(symbol: str, limit: int = Query(default=60, ge=10, le=200)) -> dict[str, Any]:
    payload = await post_info({"type": "recentTrades", "coin": symbol.upper()})
    if not isinstance(payload, list):
        raise HTTPException(status_code=502, detail="Unexpected trades payload.")

    recent = []
    buy_volume = 0.0
    sell_volume = 0.0
    for trade in payload[:limit]:
        if not isinstance(trade, dict):
            continue
        price = to_float(trade.get("px"))
        size = to_float(trade.get("sz"))
        side = str(trade.get("side") or "").lower()
        notional = (price or 0) * (size or 0)
        if side == "b":
            buy_volume += notional
            side_label = "buy"
        else:
            sell_volume += notional
            side_label = "sell"
        recent.append(
            {
                "time": trade.get("time"),
                "price": price,
                "size": size,
                "side": side_label,
                "notional": notional,
            }
        )

    total = buy_volume + sell_volume
    imbalance = 0 if total == 0 else (buy_volume - sell_volume) / total

    return {
        "symbol": symbol.upper(),
        "trades": recent,
        "stats": {
            "buyNotional": buy_volume,
            "sellNotional": sell_volume,
            "imbalance": imbalance,
        },
    }


@app.get("/api/hyperliquid/detail/{symbol}")
async def detail(
    symbol: str,
    interval: str = Query(default="1h"),
    lookback_hours: int = Query(default=24, ge=1, le=240),
) -> dict[str, Any]:
    overview_payload, orderbook_payload, candles_payload, trades_payload = await asyncio.gather(
        overview(limit=200),
        orderbook(symbol),
        candles(symbol, interval=interval, lookback_hours=lookback_hours),
        trades(symbol, limit=60),
    )

    markets = overview_payload.get("markets", [])
    market = next((row for row in markets if row.get("symbol") == symbol.upper()), None)
    if not market:
        raise HTTPException(status_code=404, detail=f"Symbol {symbol.upper()} not found in overview.")

    return {
        "market": market,
        "orderbook": orderbook_payload,
        "candles": candles_payload,
        "trades": trades_payload,
    }


@app.post("/api/liquidations/start")
async def liquidations_start() -> dict[str, Any]:
    if not aggregate_history:
        await ensure_overview_data()
    return {"success": True, "data": {"is_running": True}}


@app.post("/api/liquidations/stop")
async def liquidations_stop() -> dict[str, Any]:
    return {"success": True, "data": {"is_running": True}}


@app.get("/api/liquidations/status")
async def liquidations_status() -> dict[str, Any]:
    if not aggregate_history:
        await ensure_overview_data()
    snapshot = aggregate_history[-1] if aggregate_history else build_aggregate_snapshot([], int(time.time() * 1000))
    return {"success": True, "data": build_liquidations_stats(snapshot)}


@app.get("/api/liquidations/snapshots")
async def liquidations_snapshots(limit: int = Query(default=20, ge=5, le=120)) -> dict[str, Any]:
    if not aggregate_history:
        await ensure_overview_data()
    snapshots = [
        {
            "timestamp": iso_timestamp(item["timestamp"]),
            "timeframe": item["timeframe"],
            "total_usd": item["total_usd"],
            "longs_usd": item["longs_usd"],
            "shorts_usd": item["shorts_usd"],
            "num_longs": item["num_longs"],
            "num_shorts": item["num_shorts"],
            "exchanges": {"hyperliquid": item["total_usd"]},
            "top_markets": item["top_markets"],
        }
        for item in list(aggregate_history)[-limit:]
    ]
    snapshots.reverse()
    return {"success": True, "data": snapshots}


@app.get("/api/liquidations/alerts")
async def liquidations_alerts(limit: int = Query(default=20, ge=5, le=100)) -> dict[str, Any]:
    if not market_alerts and not aggregate_history:
        await ensure_overview_data()
    alerts_payload = [
        {
            "id": index + 1,
            "timestamp": iso_timestamp(item["createdAt"]),
            "type": item["type"],
            "severity": item["severity"],
            "message": item["message"],
            "data": {
                "symbol": item["symbol"],
                "value": item.get("value"),
                "delta": item.get("delta"),
            },
        }
        for index, item in enumerate(list(market_alerts)[:limit])
    ]
    return {"success": True, "data": alerts_payload}


@app.get("/api/liquidations/chart-data")
async def liquidations_chart_data(hours: int = Query(default=24, ge=1, le=72)) -> dict[str, Any]:
    if not aggregate_history:
        await ensure_overview_data()
    max_points = max(8, min(MAX_HISTORY_POINTS, hours * 5))
    entries = list(aggregate_history)[-max_points:]
    return {
        "success": True,
        "data": {
            "timestamps": [iso_timestamp(item["timestamp"]) for item in entries],
            "longs": [item["longs_usd"] for item in entries],
            "shorts": [item["shorts_usd"] for item in entries],
            "total": [item["total_usd"] for item in entries],
        },
    }


@app.get("/api/liquidations/insights")
async def liquidations_insights() -> dict[str, Any]:
    if not aggregate_history:
        await ensure_overview_data()
    snapshot = aggregate_history[-1] if aggregate_history else build_aggregate_snapshot([], int(time.time() * 1000))
    return {"success": True, "data": build_liquidations_insights(snapshot)}
