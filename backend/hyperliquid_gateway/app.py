from __future__ import annotations

import asyncio
import json
import os
import sqlite3
import time
from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, List, Optional, Union

import httpx
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field
from fastapi.middleware.cors import CORSMiddleware

try:
    from .backtesting.engine import BacktestConfig, normalize_symbols
    from .backtesting.registry import available_strategies, get_strategy_definition
    from .backtesting.workflow import (
        build_paper_workflow,
        build_status_snapshot,
        is_strategy_document_path,
        latest_json,
        latest_matching_validation,
        run_backtest_workflow,
        strategy_document_id,
        validation_policy_payload,
        validate_strategy_workflow,
    )
    from .agents import (
        agent_runtime_status,
        latest_agent_run_payload,
        list_agent_runs,
        load_agent_run,
        run_agent_audit,
        run_agent_research,
    )
    from .pine_lab import build_preview, generate_pine_indicator
except ImportError:
    from backtesting.engine import BacktestConfig, normalize_symbols
    from backtesting.registry import available_strategies, get_strategy_definition
    from backtesting.workflow import (
        build_paper_workflow,
        build_status_snapshot,
        is_strategy_document_path,
        latest_json,
        latest_matching_validation,
        run_backtest_workflow,
        strategy_document_id,
        validation_policy_payload,
        validate_strategy_workflow,
    )
    from agents import (
        agent_runtime_status,
        latest_agent_run_payload,
        list_agent_runs,
        load_agent_run,
        run_agent_audit,
        run_agent_research,
    )
    from pine_lab import build_preview, generate_pine_indicator

try:
    from .ai_provider import provider_status
    from .macro_intelligence import (
        get_bank_holidays,
        get_calendar_analysis,
        get_calendar_intelligence,
        get_calendar_week,
        get_macro_news,
        get_weekly_brief,
        test_ai_provider,
    )
    from .polymarket_api import init_polymarket_db, router as polymarket_router
except ImportError:
    from ai_provider import provider_status
    from macro_intelligence import (
        get_bank_holidays,
        get_calendar_analysis,
        get_calendar_intelligence,
        get_calendar_week,
        get_macro_news,
        get_weekly_brief,
        test_ai_provider,
    )
    from polymarket_api import init_polymarket_db, router as polymarket_router

HYPERLIQUID_API = os.getenv("HYPERLIQUID_API_URL", "https://api.hyperliquid.xyz/info")
TIMEOUT_SECONDS = float(os.getenv("HYPERLIQUID_TIMEOUT", "12"))
OVERVIEW_CACHE_MS = int(os.getenv("HYPERLIQUID_OVERVIEW_CACHE_MS", "8000"))
REFRESH_LOOP_SECONDS = float(os.getenv("HYPERLIQUID_REFRESH_LOOP_SECONDS", "8"))
MAX_HISTORY_POINTS = int(os.getenv("HYPERLIQUID_MAX_HISTORY_POINTS", "120"))
MAX_ALERTS = int(os.getenv("HYPERLIQUID_MAX_ALERTS", "160"))
DB_PATH_OVERRIDE = os.getenv("HYPERLIQUID_DB_PATH")
BACKEND_ROOT = Path(__file__).resolve().parent
if BACKEND_ROOT.name == "hyperliquid_gateway" and BACKEND_ROOT.parent.name == "backend":
    REPO_ROOT = BACKEND_ROOT.parents[1]
else:
    REPO_ROOT = BACKEND_ROOT
DATA_ROOT = Path(os.getenv("HYPERLIQUID_DATA_ROOT", str(BACKEND_ROOT / "data"))).expanduser()
DB_PATH = DB_PATH_OVERRIDE or str(DATA_ROOT / "hyperliquid.db")
REPORTS_ROOT = DATA_ROOT / "backtests"
VALIDATIONS_ROOT = DATA_ROOT / "validations"
PAPER_ROOT = DATA_ROOT / "paper"
DOCS_STRATEGIES_ROOT = REPO_ROOT / "docs" / "strategies"
STRATEGIES_ROOT = BACKEND_ROOT / "strategies"

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
db_summary_cache: dict[str, Any] | None = None
db_summary_cache_at = 0
DB_SUMMARY_CACHE_MS = 60_000


class PaperSignalCreate(BaseModel):
    symbol: str
    setup_tag: str
    direction: str
    confidence: int = Field(ge=0, le=100)
    thesis: str
    entry_price: Optional[float] = None
    invalidation: Optional[str] = None
    decision_label: Optional[str] = None
    trigger_plan: Optional[str] = None
    execution_quality: Optional[int] = None


class PaperTradeCreate(BaseModel):
    symbol: str
    side: str
    setup_tag: str
    thesis: str
    entry_price: float
    size_usd: float = Field(gt=0)
    stop_loss_pct: Optional[float] = None
    take_profit_pct: Optional[float] = None
    decision_label: Optional[str] = None
    trigger_plan: Optional[str] = None
    invalidation_plan: Optional[str] = None
    execution_quality: Optional[int] = None


class PaperTradeReviewCreate(BaseModel):
    close_reason: str
    outcome_tag: str
    execution_score: int = Field(ge=1, le=10)
    notes: Optional[str] = None


class BacktestRunCreate(BaseModel):
    strategy_id: str
    dataset_path: Optional[str] = None
    initial_equity: float = 100_000.0
    risk_fraction: float = 0.10
    fee_rate: Optional[float] = None
    taker_fee_rate: Optional[float] = None
    maker_fee_rate: Optional[float] = None
    fee_model: str = "taker"
    maker_ratio: float = 0.0
    symbol: Optional[str] = None
    symbols: Optional[Union[List[str], str]] = None
    universe: str = "default"
    start: Optional[str] = None
    end: Optional[str] = None
    lookback_days: Optional[int] = None
    run_validation: bool = True
    build_paper_candidate: bool = False


class PaperCandidateCreate(BaseModel):
    strategy_id: str
    report_path: Optional[str] = None
    validation_path: Optional[str] = None


class AgentRunCreate(BaseModel):
    strategy_id: str
    runtime: str = "auto"
    model: Optional[str] = None
    codex_profile: Optional[str] = None
    provider_order: Optional[str] = None
    mission_id: Optional[str] = None


class PineIndicatorGenerate(BaseModel):
    request: str = Field(min_length=8, max_length=2000)
    symbol: str = "BTC"
    interval: str = "1h"
    lookback_hours: int = Field(default=72, ge=4, le=240)
    indicator_type: Optional[str] = None


def build_backtest_config_from_filters(
    *,
    initial_equity: float = 100_000.0,
    risk_fraction: float = 0.10,
    fee_rate: Optional[float] = None,
    taker_fee_rate: Optional[float] = None,
    maker_fee_rate: Optional[float] = None,
    fee_model: str = "taker",
    maker_ratio: float = 0.0,
    symbol: Optional[str] = None,
    symbols: Optional[Union[List[str], str]] = None,
    universe: str = "default",
    start: Optional[str] = None,
    end: Optional[str] = None,
    lookback_days: Optional[int] = None,
) -> BacktestConfig:
    symbol_items: list[str] = []
    if symbol:
        symbol_items.append(symbol)
    if isinstance(symbols, str):
        symbol_items.append(symbols)
    elif symbols:
        symbol_items.extend(symbols)
    return BacktestConfig(
        initial_equity=initial_equity,
        fee_rate=fee_rate,
        taker_fee_rate=taker_fee_rate,
        maker_fee_rate=maker_fee_rate,
        fee_model=fee_model,
        maker_ratio=maker_ratio,
        risk_fraction=risk_fraction,
        symbols=normalize_symbols(symbol_items),
        universe=universe,
        start=start,
        end=end,
        lookback_days=lookback_days,
    )


def build_backtest_result_leaderboard(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    leaderboard: list[dict[str, Any]] = []
    for item in results:
        summary = item.get("summary") or {}
        robust = item.get("robustAssessment") or {}
        leaderboard.append(
            {
                "strategyId": item.get("strategyId"),
                "success": bool(item.get("success")),
                "robustStatus": robust.get("status") if robust else None,
                "robustBlockers": robust.get("blockers") if robust else item.get("error"),
                "returnPct": summary.get("return_pct"),
                "profitFactor": summary.get("profit_factor"),
                "maxDrawdownPct": summary.get("max_drawdown_pct"),
                "totalTrades": summary.get("total_trades"),
                "reportPath": item.get("reportPath"),
                "validationStatus": item.get("validationStatus"),
            }
        )
    leaderboard.sort(
        key=lambda row: (
            row["robustStatus"] == "passes",
            float(row["returnPct"] or -999.0),
            float(row["profitFactor"] or 0.0),
            int(row["totalTrades"] or 0),
        ),
        reverse=True,
    )
    return leaderboard


def latest_backtest_payload(normalized_strategy_id: str, *, created: bool | None = None) -> dict[str, Any]:
    report_path = latest_json(REPORTS_ROOT, f"{normalized_strategy_id}-")
    paper_path = latest_json(PAPER_ROOT, f"{normalized_strategy_id}-")
    if report_path is None:
        raise HTTPException(status_code=404, detail=f"No backtest artifact found for {normalized_strategy_id}.")
    report_payload = safe_load_json(report_path)
    validation_path = latest_strategy_validation_path(
        strategy_id=normalized_strategy_id,
        report_path=report_path,
        report_artifact_id=(report_payload or {}).get("artifact_id"),
    ) or latest_json(VALIDATIONS_ROOT, f"{normalized_strategy_id}-")
    payload = {
        "strategyId": normalized_strategy_id,
        "reportPath": str(report_path),
        "validationPath": str(validation_path) if validation_path else None,
        "paperPath": str(paper_path) if paper_path else None,
        "report": report_payload,
        "validation": safe_load_json(validation_path) if validation_path else None,
        "paper": safe_load_json(paper_path) if paper_path else None,
    }
    if created is not None:
        payload["created"] = created
    return payload


def artifact_strategy_id(path: Path, payload: dict[str, Any]) -> str:
    return normalize_strategy_id(str(payload.get("strategy_id") or path.stem.split("-")[0]))


def artifact_generated_ms(path: Path, payload: dict[str, Any]) -> int:
    return parse_time_ms(payload.get("generated_at")) or int(path.stat().st_mtime * 1000)


def latest_strategy_validation_path(
    *,
    strategy_id: str,
    report_path: Path,
    report_artifact_id: str | None,
) -> Path | None:
    if not VALIDATIONS_ROOT.exists():
        return None
    matches = sorted(
        (path for path in VALIDATIONS_ROOT.glob(f"{strategy_id}-*.json") if path.is_file()),
        key=lambda item: item.stat().st_mtime,
        reverse=True,
    )
    for path in matches:
        payload = safe_load_json(path)
        if payload is None:
            continue
        if payload.get("report_artifact_id") == report_artifact_id:
            return path
        if payload.get("report_path") == str(report_path):
            return path
    return None


def backtest_artifact_summaries(normalized_strategy_id: str, limit: int = 20) -> list[dict[str, Any]]:
    if not REPORTS_ROOT.exists():
        return []

    summaries: list[dict[str, Any]] = []
    for path in REPORTS_ROOT.glob(f"{normalized_strategy_id}-*.json"):
        payload = safe_load_json(path)
        if not payload or artifact_strategy_id(path, payload) != normalized_strategy_id:
            continue
        validation_path = latest_strategy_validation_path(
            strategy_id=normalized_strategy_id,
            report_path=path,
            report_artifact_id=payload.get("artifact_id"),
        )
        validation_payload = safe_load_json(validation_path) if validation_path else None
        summaries.append(
            {
                "artifactId": payload.get("artifact_id") or path.stem,
                "reportPath": str(path),
                "validationPath": str(validation_path) if validation_path else None,
                "generatedAt": artifact_generated_ms(path, payload),
                "summary": payload.get("summary") or {},
                "robustAssessment": payload.get("robust_assessment"),
                "validationStatus": validation_payload.get("status") if validation_payload else None,
            }
        )

    summaries.sort(key=lambda item: int(item.get("generatedAt") or 0), reverse=True)
    return summaries[:limit]


def backtest_artifact_payload(normalized_strategy_id: str, artifact_id: str) -> dict[str, Any]:
    if not REPORTS_ROOT.exists():
        raise HTTPException(status_code=404, detail=f"No backtest artifacts found for {normalized_strategy_id}.")

    requested = artifact_id.strip()
    matched_path: Path | None = None
    matched_payload: dict[str, Any] | None = None
    for path in REPORTS_ROOT.glob("*.json"):
        payload = safe_load_json(path)
        if not payload:
            continue
        if (payload.get("artifact_id") or path.stem) != requested:
            continue
        matched_path = path
        matched_payload = payload
        break

    if matched_path is None or matched_payload is None:
        raise HTTPException(status_code=404, detail=f"Backtest artifact {requested} was not found.")

    payload_strategy = artifact_strategy_id(matched_path, matched_payload)
    if payload_strategy != normalized_strategy_id:
        raise HTTPException(
            status_code=400,
            detail=f"Backtest artifact {requested} belongs to {payload_strategy}, not {normalized_strategy_id}.",
        )

    validation_path = latest_strategy_validation_path(
        strategy_id=normalized_strategy_id,
        report_path=matched_path,
        report_artifact_id=matched_payload.get("artifact_id"),
    ) or latest_json(VALIDATIONS_ROOT, f"{normalized_strategy_id}-")
    paper_path = latest_json(PAPER_ROOT, f"{normalized_strategy_id}-")
    return {
        "strategyId": normalized_strategy_id,
        "reportPath": str(matched_path),
        "validationPath": str(validation_path) if validation_path else None,
        "paperPath": str(paper_path) if paper_path else None,
        "report": matched_payload,
        "validation": safe_load_json(validation_path) if validation_path else None,
        "paper": safe_load_json(paper_path) if paper_path else None,
    }


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
            CREATE INDEX IF NOT EXISTS idx_paper_signals_symbol_setup_time ON paper_signals(symbol, setup_tag, created_at_ms DESC);
            CREATE INDEX IF NOT EXISTS idx_paper_signals_status_time ON paper_signals(status, created_at_ms DESC);
            CREATE INDEX IF NOT EXISTS idx_paper_trades_time ON paper_trades(created_at_ms DESC);
            CREATE INDEX IF NOT EXISTS idx_paper_trades_symbol_setup_time ON paper_trades(symbol, setup_tag, created_at_ms DESC);
            CREATE INDEX IF NOT EXISTS idx_paper_trades_status_time ON paper_trades(status, created_at_ms DESC);

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
            CREATE INDEX IF NOT EXISTS idx_paper_trade_reviews_trade_id ON paper_trade_reviews(trade_id);

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


def aggregate_chart_rows(hours: int) -> list[sqlite3.Row]:
    now_ms = int(time.time() * 1000)
    since_ms = now_ms - (hours * 3_600_000)
    with db_connection() as connection:
        rows = connection.execute(
            """
            SELECT timestamp_ms, total_usd, longs_usd, shorts_usd
            FROM aggregate_snapshots
            WHERE timestamp_ms >= ?
            ORDER BY timestamp_ms ASC
            """,
            (since_ms,),
        ).fetchall()
    return rows


def chart_coverage_label(point_count: int, oldest_ms: int | None, newest_ms: int | None, hours: int) -> str:
    if point_count < 2 or oldest_ms is None or newest_ms is None:
        return "insufficient"
    requested_ms = hours * 3_600_000
    covered_ms = max(0, newest_ms - oldest_ms)
    coverage_ratio = covered_ms / requested_ms if requested_ms > 0 else 0
    if point_count >= 8 and coverage_ratio >= 0.75:
        return "good"
    return "thin"


def aggregate_chart_payload(hours: int) -> dict[str, Any]:
    rows = aggregate_chart_rows(hours)
    oldest_ms = int(rows[0]["timestamp_ms"]) if rows else None
    newest_ms = int(rows[-1]["timestamp_ms"]) if rows else None
    return {
        "timestamps": [iso_timestamp(row["timestamp_ms"]) for row in rows],
        "longs": [row["longs_usd"] for row in rows],
        "shorts": [row["shorts_usd"] for row in rows],
        "total": [row["total_usd"] for row in rows],
        "metadata": {
            "windowHours": hours,
            "pointCount": len(rows),
            "oldestTimestamp": iso_timestamp(oldest_ms) if oldest_ms is not None else None,
            "newestTimestamp": iso_timestamp(newest_ms) if newest_ms is not None else None,
            "source": "sqlite_aggregate_snapshots",
            "isEstimate": True,
            "coverageLabel": chart_coverage_label(len(rows), oldest_ms, newest_ms, hours),
        },
    }


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


def paper_trade_rows(limit: int = 100, status: str = "all") -> list[sqlite3.Row]:
    query = "SELECT * FROM paper_trades"
    params: list[Any] = []
    if status in {"open", "closed"}:
        query += " WHERE status = ?"
        params.append(status)
    query += " ORDER BY created_at_ms DESC LIMIT ?"
    params.append(limit)
    with db_connection() as connection:
        return connection.execute(query, tuple(params)).fetchall()


async def paper_trade_payloads(limit: int = 100, status: str = "all") -> list[dict[str, Any]]:
    await ensure_overview_data()
    prices = current_price_map()
    reviews = review_map()
    trades_payload = []
    for row in paper_trade_rows(limit=limit, status=status):
        payload = trade_mark_to_market(row, prices)
        payload["review"] = reviews.get(payload["id"])
        trades_payload.append(payload)
    return trades_payload


def paper_trade_payloads_without_mark_to_market(limit: int = 100, status: str = "all") -> list[dict[str, Any]]:
    reviews = review_map()
    trades_payload = []
    for row in paper_trade_rows(limit=limit, status=status):
        payload = trade_mark_to_market(row, {})
        payload["review"] = reviews.get(payload["id"])
        trades_payload.append(payload)
    return trades_payload


def paper_signal_payloads(limit: int = 500) -> list[dict[str, Any]]:
    with db_connection() as connection:
        rows = connection.execute(
            """
            SELECT * FROM paper_signals
            ORDER BY created_at_ms DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [
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


def table_exists(connection: sqlite3.Connection, table_name: str) -> bool:
    row = connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table_name,),
    ).fetchone()
    return row is not None


def polymarket_trade_payloads(limit: int = 500) -> list[dict[str, Any]]:
    with db_connection() as connection:
        if not table_exists(connection, "polymarket_btc_5m_trades"):
            return []
        rows = connection.execute(
            """
            SELECT *
            FROM polymarket_btc_5m_trades
            ORDER BY created_at_ms DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [
        {
            "id": row["id"],
            "createdAt": row["created_at_ms"],
            "mode": row["mode"],
            "slug": row["slug"],
            "eventId": row["event_id"],
            "side": row["side"],
            "status": row["status"],
            "confidence": row["signal_confidence"],
            "entryPrice": row["entry_price"],
            "exitPrice": row["exit_price"],
            "sizeUsd": row["size_usd"],
            "shares": row["shares"],
            "grossPnlUsd": row["gross_pnl_usd"],
            "netPnlUsd": row["net_pnl_usd"],
            "roiPct": row["roi_pct"],
            "notes": row["notes"],
        }
        for row in rows
    ]


def strategy_key(strategy_id: str) -> str:
    return f"strategy:{normalize_strategy_id(strategy_id)}"


def runtime_key(symbol: str, setup_tag: str) -> str:
    return f"runtime:{symbol.upper()}::{normalize_strategy_id(setup_tag)}"


def normalize_strategy_id(value: str) -> str:
    return value.strip().lower().replace("-", "_").replace(" ", "_")


def docs_id_to_strategy_id(path: Path) -> str:
    return strategy_document_id(path)


def make_strategy_row(strategy_id: str, *, display_name: str | None = None) -> dict[str, Any]:
    normalized = normalize_strategy_id(strategy_id)
    return {
        "strategyKey": strategy_key(normalized),
        "strategyId": normalized,
        "displayName": display_name or normalized.replace("_", " ").title(),
        "symbol": None,
        "setupTag": normalized,
        "side": "n/a",
        "stage": "research",
        "pipelineStage": "research",
        "gateStatus": "backtest-required",
        "gateReasons": [],
        "nextAction": {
            "label": "Prepare Backtest",
            "command": f"npm run hf:strategy:new -- --strategy-id {normalized}",
            "enabled": False,
            "targetStage": "backtesting",
        },
        "sourceTypes": [],
        "registeredForBacktest": False,
        "canBacktest": False,
        "validationPolicy": None,
        "latestBacktestSummary": None,
        "latestBacktestConfig": None,
        "robustAssessment": None,
        "exitReasonCounts": {},
        "documentationPaths": [],
        "latestArtifactPaths": {
            "docs": None,
            "spec": None,
            "backtest": None,
            "validation": None,
            "paper": None,
        },
        "validationStatus": None,
        "evidenceCounts": {
            "backtestTrades": 0,
            "paperCandidates": 0,
            "paperSignals": 0,
            "paperTrades": 0,
            "polymarketTrades": 0,
            "runtimeSetups": 0,
        },
        "tradeCount": 0,
        "openTrades": 0,
        "closedTrades": 0,
        "reviewableClosedTrades": 0,
        "reviewedTrades": 0,
        "wins": 0,
        "notionalUsd": 0.0,
        "realizedPnlUsd": 0.0,
        "unrealizedPnlUsd": 0.0,
        "totalPnlUsd": 0.0,
        "openRiskUsd": 0.0,
        "winRate": 0.0,
        "reviewCoverage": 0.0,
        "avgExecutionQuality": None,
        "lastActivityAt": None,
        "lastActivityLabel": None,
        "decisionLabels": {},
        "checklist": {
            "docsExists": False,
            "specExists": False,
            "backendModuleExists": False,
            "backtestExists": False,
            "validationExists": False,
            "paperCandidateExists": False,
            "paperLedgerExists": False,
            "reviewsComplete": False,
        },
        "missingAuditItems": [],
        "trades": [],
        "timeline": [],
        "_executionQualityTotal": 0.0,
        "_executionQualityCount": 0,
        "_validationBlockingReasons": [],
    }


def touch_strategy(row: dict[str, Any], timestamp_ms: int | None, label: str) -> None:
    if timestamp_ms is None:
        return
    if row["lastActivityAt"] is None or timestamp_ms > row["lastActivityAt"]:
        row["lastActivityAt"] = timestamp_ms
        row["lastActivityLabel"] = label


def add_source(row: dict[str, Any], source: str) -> None:
    if source not in row["sourceTypes"]:
        row["sourceTypes"].append(source)


def add_timeline(row: dict[str, Any], item: dict[str, Any]) -> None:
    row["timeline"].append(item)
    touch_strategy(row, item.get("timestampMs"), item.get("title", item["type"]))


def parse_time_ms(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        numeric = int(value)
        return numeric if numeric > 10_000_000_000 else numeric * 1000
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    if cleaned.isdigit():
        return parse_time_ms(int(cleaned))
    try:
        parsed = datetime.fromisoformat(cleaned.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return int(parsed.timestamp() * 1000)


def safe_load_json(path: Path) -> dict[str, Any] | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def latest_artifacts(root: Path) -> dict[str, tuple[Path, dict[str, Any]]]:
    latest: dict[str, tuple[Path, dict[str, Any]]] = {}
    if not root.exists():
        return latest
    for path in root.glob("*.json"):
        payload = safe_load_json(path)
        if not payload:
            continue
        strategy_id = normalize_strategy_id(str(payload.get("strategy_id") or path.stem.split("-")[0]))
        current = latest.get(strategy_id)
        if current is None or path.stat().st_mtime > current[0].stat().st_mtime:
            latest[strategy_id] = (path, payload)
    return latest


def first_markdown_heading(path: Path) -> str | None:
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.startswith("# "):
                return line[2:].strip()
    except OSError:
        return None
    return None


def strategy_document_sort_key(strategy_id: str, path: str) -> tuple[bool, str]:
    return (Path(path).stem != strategy_id.replace("_", "-"), path)


def summarize_db(exact_counts: bool = False) -> dict[str, Any]:
    global db_summary_cache, db_summary_cache_at

    now = int(time.time() * 1000)
    if not exact_counts and db_summary_cache and now - db_summary_cache_at <= DB_SUMMARY_CACHE_MS:
        return dict(db_summary_cache)

    db_file = Path(DB_PATH)
    summary = {
        "path": str(db_file),
        "exists": db_file.exists(),
        "sizeBytes": db_file.stat().st_size if db_file.exists() else 0,
        "journalMode": None,
        "tableCountMode": "exact" if exact_counts else "skipped",
        "tables": {},
        "indexes": {
            "paperTradesSymbolSetupTime": False,
            "paperTradesStatusTime": False,
            "paperReviewsTradeId": False,
        },
        "recommendation": "sqlite_wal_current_phase",
        "migrationTrigger": "Move to Postgres/Timescale when continuous multi-worker writes, long retention analytics, or query latency becomes the bottleneck.",
    }
    with db_connection() as connection:
        summary["journalMode"] = connection.execute("PRAGMA journal_mode").fetchone()[0]
        existing_tables = {
            row["name"]
            for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
        }
        for table_name in [
            "market_snapshots",
            "aggregate_snapshots",
            "alerts",
            "paper_signals",
            "paper_trades",
            "paper_trade_reviews",
            "polymarket_btc_5m_trades",
        ]:
            if table_name not in existing_tables:
                summary["tables"][table_name] = None
                continue
            summary["tables"][table_name] = (
                connection.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0]
                if exact_counts
                else None
            )
        index_names = {
            row["name"]
            for table_name in ["paper_trades", "paper_trade_reviews"]
            if table_name in existing_tables
            for row in connection.execute(f"PRAGMA index_list({table_name})").fetchall()
        }
        summary["indexes"] = {
            "paperTradesSymbolSetupTime": "idx_paper_trades_symbol_setup_time" in index_names,
            "paperTradesStatusTime": "idx_paper_trades_status_time" in index_names,
            "paperReviewsTradeId": "idx_paper_trade_reviews_trade_id" in index_names,
        }
    if not exact_counts:
        db_summary_cache = dict(summary)
        db_summary_cache_at = now
    return summary


def status_from_artifacts(row: dict[str, Any]) -> None:
    checklist = row["checklist"]
    if row["openTrades"] > 0 or row["evidenceCounts"]["paperTrades"] > 0:
        row["stage"] = "paper_runtime"
    elif row["evidenceCounts"]["runtimeSetups"] > 0:
        row["stage"] = "runtime_setup"
    elif checklist["paperCandidateExists"]:
        row["stage"] = "paper_candidate"
    elif row["validationStatus"] == "ready-for-paper":
        row["stage"] = "validated"
    elif checklist["validationExists"]:
        row["stage"] = "validation_blocked"
    elif checklist["backtestExists"]:
        row["stage"] = "backtested"
    elif row["registeredForBacktest"]:
        row["stage"] = "registered"
    elif checklist["backendModuleExists"] or checklist["docsExists"]:
        row["stage"] = "research"
    else:
        row["stage"] = "unknown"

    missing = []
    if not checklist["docsExists"]:
        missing.append("strategy_doc")
    if not checklist["backendModuleExists"]:
        missing.append("backend_module")
    if not checklist["backtestExists"]:
        missing.append("backtest_artifact")
    if not checklist["validationExists"]:
        missing.append("validation_artifact")
    if not checklist["paperCandidateExists"]:
        missing.append("paper_candidate")
    if not checklist["paperLedgerExists"]:
        missing.append("paper_runtime_ledger")
    if row["reviewableClosedTrades"] > 0 and row["reviewCoverage"] < 80:
        missing.append("post_trade_reviews")
    row["missingAuditItems"] = missing


def _clean_gate_reasons(reasons: list[Any]) -> list[str]:
    cleaned: list[str] = []
    for reason in reasons:
        text = str(reason).strip()
        if text and text not in cleaned:
            cleaned.append(text)
    return cleaned


def _pipeline_action(label: str, command: str, enabled: bool, target_stage: str) -> dict[str, Any]:
    return {
        "label": label,
        "command": command,
        "enabled": enabled,
        "targetStage": target_stage,
    }


def apply_pipeline_gate(row: dict[str, Any]) -> None:
    strategy_id = row["strategyId"]
    checklist = row["checklist"]
    robust = row.get("robustAssessment") or {}
    robust_status = robust.get("status")
    robust_blockers = robust.get("blockers") or []
    validation_status = row.get("validationStatus")
    validation_blockers = row.get("_validationBlockingReasons") or []

    if checklist["paperLedgerExists"] or row["evidenceCounts"]["paperTrades"] > 0 or row["openTrades"] > 0:
        row["pipelineStage"] = "paper"
        row["gateStatus"] = "paper-active"
        row["gateReasons"] = _clean_gate_reasons(["Paper runtime ledger has strategy evidence."])
        row["nextAction"] = _pipeline_action("Review Paper Lab", "npm run hf:paper", True, "paper")
        return

    if checklist["paperCandidateExists"] or validation_status == "ready-for-paper":
        row["pipelineStage"] = "paper"
        row["gateStatus"] = "ready-for-paper"
        row["gateReasons"] = _clean_gate_reasons(["Validation is ready for paper review."])
        row["nextAction"] = _pipeline_action(
            "Review Paper Candidate" if checklist["paperCandidateExists"] else "Create Paper Candidate",
            f"npm run hf:paper -- --strategy {strategy_id}",
            True,
            "paper",
        )
        return

    if validation_status == "blocked":
        row["pipelineStage"] = "blocked"
        row["gateStatus"] = "audit-blocked"
        row["gateReasons"] = _clean_gate_reasons(validation_blockers or robust_blockers or ["validation_blocked"])
        row["nextAction"] = _pipeline_action(
            "Re-run Validation",
            f"npm run hf:validate -- --strategy {strategy_id}",
            True,
            "audit",
        )
        return

    if checklist["backtestExists"]:
        if robust_status == "passes":
            row["pipelineStage"] = "audit"
            row["gateStatus"] = "audit-eligible"
            row["gateReasons"] = _clean_gate_reasons(["Latest robust backtest passed after costs."])
            row["nextAction"] = _pipeline_action(
                "Run Audit",
                f"npm run hf:agent:audit -- --strategy {strategy_id} --runtime auto",
                True,
                "audit",
            )
            return
        row["pipelineStage"] = "blocked"
        row["gateStatus"] = "audit-blocked"
        row["gateReasons"] = _clean_gate_reasons(robust_blockers or ["robust_backtest_not_passing"])
        row["nextAction"] = _pipeline_action(
            "Re-run Backtest",
            f"npm run hf:backtest -- --strategy {strategy_id}",
            bool(row["registeredForBacktest"]),
            "backtesting",
        )
        return

    if row["registeredForBacktest"]:
        row["pipelineStage"] = "backtesting"
        row["gateStatus"] = "backtest-running-eligible"
        row["gateReasons"] = _clean_gate_reasons(["No backtest artifact exists yet."])
        row["nextAction"] = _pipeline_action(
            "Run Backtest",
            f"npm run hf:backtest -- --strategy {strategy_id}",
            True,
            "backtesting",
        )
        return

    row["pipelineStage"] = "research"
    row["gateStatus"] = "backtest-required"
    missing = []
    if not checklist["docsExists"]:
        missing.append("strategy_doc")
    if not checklist["backendModuleExists"]:
        missing.append("backend_module")
    if not row["registeredForBacktest"]:
        missing.append("registered_backtest")
    row["gateReasons"] = _clean_gate_reasons(missing or ["research_package_required"])
    row["nextAction"] = _pipeline_action(
        "Prepare Backtest Package",
        f"npm run hf:strategy:new -- --strategy-id {strategy_id}",
        False,
        "backtesting",
    )


def finalize_strategy_row(row: dict[str, Any]) -> dict[str, Any]:
    closed = row["closedTrades"]
    reviewable = row["reviewableClosedTrades"]
    row["winRate"] = (row["wins"] / closed) * 100 if closed else 0.0
    row["reviewCoverage"] = (row["reviewedTrades"] / reviewable) * 100 if reviewable else 0.0
    row["checklist"]["paperLedgerExists"] = row["evidenceCounts"]["paperTrades"] > 0
    row["checklist"]["reviewsComplete"] = row["reviewableClosedTrades"] == 0 or row["reviewCoverage"] >= 80
    quality_count = row.pop("_executionQualityCount", 0)
    quality_total = row.pop("_executionQualityTotal", 0.0)
    row["avgExecutionQuality"] = round(quality_total / quality_count, 1) if quality_count else None
    row["sourceTypes"].sort()
    row["documentationPaths"].sort(key=lambda path: strategy_document_sort_key(row["strategyId"], path))
    if row["documentationPaths"]:
        row["latestArtifactPaths"]["docs"] = row["documentationPaths"][0]
    row["timeline"].sort(key=lambda item: item.get("timestampMs") or 0, reverse=True)
    row["timeline"] = row["timeline"][:50]
    row["trades"] = row["trades"][:25]
    status_from_artifacts(row)
    apply_pipeline_gate(row)
    row.pop("_validationBlockingReasons", None)
    return row


async def build_strategy_evidence(
    limit: int = 500,
    runtime_limit: int = 60,
    *,
    include_database: bool = True,
    exact_db_counts: bool = False,
    mark_paper_trades: bool = True,
) -> dict[str, Any]:
    rows: dict[str, dict[str, Any]] = {}

    def get_row(strategy_id: str, display_name: str | None = None) -> dict[str, Any]:
        key = strategy_key(strategy_id)
        if key not in rows:
            rows[key] = make_strategy_row(strategy_id, display_name=display_name)
        elif display_name and rows[key]["displayName"] == rows[key]["strategyId"].replace("_", " ").title():
            rows[key]["displayName"] = display_name
        return rows[key]

    for strategy_id in available_strategies():
        row = get_row(strategy_id)
        add_source(row, "registered_backtest")
        row["registeredForBacktest"] = True
        row["canBacktest"] = True
        try:
            row["validationPolicy"] = validation_policy_payload(get_strategy_definition(strategy_id).validation_policy)
        except Exception:
            row["validationPolicy"] = None

    if DOCS_STRATEGIES_ROOT.exists():
        for path in DOCS_STRATEGIES_ROOT.glob("*.md"):
            if not is_strategy_document_path(path):
                continue
            strategy_id = docs_id_to_strategy_id(path)
            row = get_row(strategy_id, first_markdown_heading(path))
            add_source(row, "docs")
            if str(path) not in row["documentationPaths"]:
                row["documentationPaths"].append(str(path))
            row["latestArtifactPaths"]["docs"] = row["latestArtifactPaths"]["docs"] or str(path)
            row["checklist"]["docsExists"] = True

    if STRATEGIES_ROOT.exists():
        for path in STRATEGIES_ROOT.iterdir():
            if not path.is_dir() or path.name.startswith("__"):
                continue
            strategy_id = normalize_strategy_id(path.name)
            row = get_row(strategy_id)
            add_source(row, "backend_module")
            row["checklist"]["backendModuleExists"] = (path / "logic.py").exists()
            row["checklist"]["specExists"] = (path / "spec.md").exists()
            row["latestArtifactPaths"]["spec"] = str(path / "spec.md") if (path / "spec.md").exists() else None

    for artifact_type, root, source in [
        ("backtest", REPORTS_ROOT, "backtest_artifact"),
        ("validation", VALIDATIONS_ROOT, "validation_artifact"),
        ("paper", PAPER_ROOT, "paper_candidate_artifact"),
    ]:
        for strategy_id, (path, payload) in latest_artifacts(root).items():
            row = get_row(strategy_id)
            add_source(row, source)
            row["latestArtifactPaths"][artifact_type] = str(path)
            generated_at = parse_time_ms(payload.get("generated_at")) or int(path.stat().st_mtime * 1000)
            summary = payload.get("summary") or {}
            if artifact_type == "backtest":
                trades = payload.get("trades") or []
                row["checklist"]["backtestExists"] = True
                row["latestBacktestSummary"] = summary
                row["latestBacktestConfig"] = payload.get("config") or {}
                row["robustAssessment"] = payload.get("robust_assessment")
                row["exitReasonCounts"] = payload.get("exit_reason_counts") or {}
                row["evidenceCounts"]["backtestTrades"] = len(trades)
                row["tradeCount"] += len(trades)
                row["closedTrades"] += len(trades)
                row["wins"] += int(summary.get("wins") or sum(1 for trade in trades if (trade.get("net_pnl") or 0) > 0))
                row["notionalUsd"] += sum(float(trade.get("size_usd") or 0.0) for trade in trades)
                row["realizedPnlUsd"] += float(summary.get("net_profit") or sum(float(trade.get("net_pnl") or 0.0) for trade in trades))
                row["totalPnlUsd"] += float(summary.get("net_profit") or 0.0)
                for trade in trades[:12]:
                    add_timeline(
                        row,
                        {
                            "id": f"backtest:{strategy_id}:{trade.get('entry_timestamp')}",
                            "type": "backtest_trade",
                            "source": "json_artifact",
                            "timestampMs": parse_time_ms(trade.get("entry_timestamp")),
                            "title": f"Backtest {str(trade.get('side') or '').upper()}",
                            "subtitle": trade.get("exit_reason") or "historical sample",
                            "status": "closed",
                            "pnlUsd": trade.get("net_pnl"),
                            "entryPrice": trade.get("entry_price"),
                            "exitPrice": trade.get("exit_price"),
                            "path": str(path),
                        },
                    )
            elif artifact_type == "validation":
                row["checklist"]["validationExists"] = True
                row["validationStatus"] = payload.get("status")
                row["validationPolicy"] = payload.get("validation_policy") or row["validationPolicy"]
                row["robustAssessment"] = row["robustAssessment"] or payload.get("robust_assessment")
                row["_validationBlockingReasons"] = payload.get("blocking_reasons") or []
                add_timeline(
                    row,
                    {
                        "id": f"validation:{strategy_id}:{generated_at}",
                        "type": "validation_report",
                        "source": "json_artifact",
                        "timestampMs": generated_at,
                        "title": f"Validation {payload.get('status') or 'unknown'}",
                        "subtitle": ", ".join(payload.get("blocking_reasons") or []) or "validation gates recorded",
                        "status": payload.get("status") or "unknown",
                        "path": str(path),
                    },
                )
            else:
                row["checklist"]["paperCandidateExists"] = True
                row["evidenceCounts"]["paperCandidates"] += 1
                candidate = payload.get("paper_candidate") or {}
                add_timeline(
                    row,
                    {
                        "id": f"paper-candidate:{strategy_id}:{generated_at}",
                        "type": "paper_candidate",
                        "source": "json_artifact",
                        "timestampMs": generated_at,
                        "title": f"Paper candidate {candidate.get('status') or 'created'}",
                        "subtitle": candidate.get("trigger_plan") or candidate.get("promotion_gate") or "candidate evidence",
                        "status": candidate.get("status") or "candidate",
                        "path": str(path),
                    },
                )

    paper_signals = paper_signal_payloads(limit=limit)
    for signal in paper_signals:
        key = runtime_key(signal["symbol"], signal["setupTag"])
        row = rows.setdefault(key, make_strategy_row(key, display_name=f"{signal['symbol']} {signal['setupTag']}"))
        row["strategyKey"] = key
        row["strategyId"] = key
        row["symbol"] = signal["symbol"]
        row["setupTag"] = signal["setupTag"]
        row["side"] = signal["direction"]
        add_source(row, "sqlite_paper_signal")
        row["evidenceCounts"]["paperSignals"] += 1
        touch_strategy(row, signal["createdAt"], "paper signal")
        add_timeline(
            row,
            {
                "id": f"paper-signal:{signal['id']}",
                "type": "paper_signal",
                "source": "sqlite",
                "timestampMs": signal["createdAt"],
                "title": f"Signal {signal['direction'].upper()} {signal['symbol']}",
                "subtitle": signal.get("triggerPlan") or signal.get("thesis"),
                "status": signal["status"],
                "entryPrice": signal.get("entryPrice"),
            },
        )

    trades = (
        await paper_trade_payloads(limit=limit)
        if mark_paper_trades
        else paper_trade_payloads_without_mark_to_market(limit=limit)
    )
    for trade in trades:
        key = runtime_key(trade["symbol"], trade["setupTag"])
        row = rows.setdefault(key, make_strategy_row(key, display_name=f"{trade['symbol']} {trade['setupTag']}"))
        row["strategyKey"] = key
        row["strategyId"] = key
        row["symbol"] = trade["symbol"]
        row["setupTag"] = trade["setupTag"]
        row["side"] = trade["side"]
        add_source(row, "sqlite_paper_trade")
        row["evidenceCounts"]["paperTrades"] += 1
        row["tradeCount"] += 1
        row["notionalUsd"] += float(trade.get("sizeUsd") or 0.0)
        pnl = trade.get("realizedPnlUsd") if trade["status"] == "closed" else trade.get("unrealizedPnlUsd")
        pnl = float(pnl or 0.0)
        row["totalPnlUsd"] += pnl
        label = trade.get("decisionLabel") or "unlabeled"
        row["decisionLabels"][label] = row["decisionLabels"].get(label, 0) + 1
        if trade.get("executionQuality") is not None:
            row["_executionQualityTotal"] += float(trade["executionQuality"])
            row["_executionQualityCount"] += 1
        if trade["status"] == "open":
            row["openTrades"] += 1
            row["unrealizedPnlUsd"] += pnl
            row["openRiskUsd"] += float(trade.get("sizeUsd") or 0.0)
        else:
            row["closedTrades"] += 1
            row["reviewableClosedTrades"] += 1
            row["realizedPnlUsd"] += pnl
            if pnl > 0:
                row["wins"] += 1
            if trade.get("review"):
                row["reviewedTrades"] += 1
        row["trades"].append(trade)
        add_timeline(
            row,
            {
                "id": f"paper-trade:{trade['id']}",
                "type": "paper_trade",
                "source": "sqlite",
                "timestampMs": trade["createdAt"],
                "title": f"Paper {trade['side'].upper()} {trade['symbol']}",
                "subtitle": trade.get("triggerPlan") or trade.get("thesis"),
                "status": trade["status"],
                "pnlUsd": pnl,
                "entryPrice": trade.get("entryPrice"),
                "exitPrice": trade.get("exitPrice"),
                "review": trade.get("review"),
            },
        )

    polymarket_trades = polymarket_trade_payloads(limit=limit)
    if polymarket_trades:
        row = get_row("polymarket_btc_5m_runtime", "Polymarket BTC 5m Runtime")
        row["symbol"] = "BTC"
        row["setupTag"] = "polymarket-btc-5m"
        row["side"] = "binary"
        add_source(row, "sqlite_polymarket_trade")
        for trade in polymarket_trades:
            row["evidenceCounts"]["polymarketTrades"] += 1
            row["tradeCount"] += 1
            row["notionalUsd"] += float(trade.get("sizeUsd") or 0.0)
            pnl = float(trade.get("netPnlUsd") or 0.0)
            row["totalPnlUsd"] += pnl
            row["realizedPnlUsd"] += pnl
            row["closedTrades"] += 1 if trade.get("status") in {"closed", "settled"} else 0
            row["openTrades"] += 1 if trade.get("status") not in {"closed", "settled"} else 0
            if pnl > 0:
                row["wins"] += 1
            add_timeline(
                row,
                {
                    "id": f"polymarket-trade:{trade['id']}",
                    "type": "polymarket_trade",
                    "source": "sqlite",
                    "timestampMs": trade["createdAt"],
                    "title": f"Polymarket {str(trade.get('side') or '').upper()}",
                    "subtitle": trade.get("slug") or trade.get("notes") or "BTC 5m runtime trade",
                    "status": trade.get("status"),
                    "pnlUsd": pnl,
                    "entryPrice": trade.get("entryPrice"),
                    "exitPrice": trade.get("exitPrice"),
                },
            )

    runtime_error = None
    if runtime_limit > 0:
        try:
            overview_payload = await ensure_overview_data()
            runtime_markets = [
                item for item in overview_payload.get("markets", [])
                if item.get("primarySetup") and item.get("primarySetup") != "no-trade"
            ][:runtime_limit]
            for market in runtime_markets:
                key = runtime_key(market["symbol"], market.get("primarySetup", "runtime-setup"))
                row = rows.setdefault(key, make_strategy_row(key, display_name=f"{market['symbol']} {market.get('primarySetup')}"))
                row["strategyKey"] = key
                row["strategyId"] = key
                row["symbol"] = market["symbol"]
                row["setupTag"] = market.get("primarySetup")
                row["side"] = setup_direction(market.get("primarySetup", "no-trade"), market)
                add_source(row, "gateway_runtime")
                row["evidenceCounts"]["runtimeSetups"] += 1
                row["stage"] = "runtime_setup"
                if market.get("executionQuality") is not None:
                    row["_executionQualityTotal"] += float(market["executionQuality"])
                    row["_executionQualityCount"] += 1
                add_timeline(
                    row,
                    {
                        "id": f"runtime-setup:{market['symbol']}:{market.get('primarySetup')}",
                        "type": "runtime_setup",
                        "source": "gateway_live",
                        "timestampMs": overview_payload.get("updatedAt"),
                        "title": f"{market['symbol']} {market.get('primarySetup')}",
                        "subtitle": market.get("triggerPlan"),
                        "status": market.get("decisionLabel"),
                        "entryPrice": market.get("price"),
                        "executionQuality": market.get("executionQuality"),
                    },
                )
        except Exception as exc:  # keep artifact audit usable when upstream is flaky
            runtime_error = str(exc)

    finalized = [finalize_strategy_row(row) for row in rows.values()]
    finalized.sort(
        key=lambda item: (
            item["stage"] in {"paper_runtime", "runtime_setup"},
            item["tradeCount"],
            item["lastActivityAt"] or 0,
            item["displayName"],
        ),
        reverse=True,
    )
    closed_trades = sum(item["closedTrades"] for item in finalized)
    reviewable_closed_trades = sum(item["reviewableClosedTrades"] for item in finalized)
    reviewed_trades = sum(item["reviewedTrades"] for item in finalized)
    payload = {
        "updatedAt": int(time.time() * 1000),
        "summary": {
            "strategyCount": len(finalized),
            "tradeCount": sum(item["tradeCount"] for item in finalized),
            "backtestTrades": sum(item["evidenceCounts"]["backtestTrades"] for item in finalized),
            "paperSignals": sum(item["evidenceCounts"]["paperSignals"] for item in finalized),
            "paperTrades": sum(item["evidenceCounts"]["paperTrades"] for item in finalized),
            "polymarketTrades": sum(item["evidenceCounts"]["polymarketTrades"] for item in finalized),
            "runtimeSetups": sum(item["evidenceCounts"]["runtimeSetups"] for item in finalized),
            "openTrades": sum(item["openTrades"] for item in finalized),
            "closedTrades": closed_trades,
            "reviewableClosedTrades": reviewable_closed_trades,
            "reviewedTrades": reviewed_trades,
            "reviewCoverage": (reviewed_trades / reviewable_closed_trades) * 100 if reviewable_closed_trades else 0.0,
            "totalPnlUsd": sum(item["totalPnlUsd"] for item in finalized),
            "openRiskUsd": sum(item["openRiskUsd"] for item in finalized),
        },
        "runtimeError": runtime_error,
        "strategies": finalized,
    }
    if include_database:
        payload["database"] = await asyncio.to_thread(summarize_db, exact_db_counts)
    return payload


def strategy_catalog_card(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "strategyKey": row.get("strategyKey"),
        "strategyId": row.get("strategyId"),
        "displayName": row.get("displayName"),
        "stage": row.get("stage"),
        "pipelineStage": row.get("pipelineStage"),
        "gateStatus": row.get("gateStatus"),
        "gateReasons": row.get("gateReasons") or [],
        "nextAction": row.get("nextAction") or {},
        "sourceTypes": row.get("sourceTypes") or [],
        "registeredForBacktest": bool(row.get("registeredForBacktest")),
        "canBacktest": bool(row.get("canBacktest")),
        "symbol": row.get("symbol"),
        "setupTag": row.get("setupTag"),
        "side": row.get("side"),
        "validationStatus": row.get("validationStatus"),
        "validationPolicy": row.get("validationPolicy"),
        "latestArtifactPaths": row.get("latestArtifactPaths") or {},
        "documentationPaths": row.get("documentationPaths") or [],
        "evidenceCounts": row.get("evidenceCounts") or {},
        "tradeCount": row.get("tradeCount") or 0,
        "closedTrades": row.get("closedTrades") or 0,
        "winRate": row.get("winRate") or 0.0,
        "totalPnlUsd": row.get("totalPnlUsd") or 0.0,
        "notionalUsd": row.get("notionalUsd") or 0.0,
        "avgExecutionQuality": row.get("avgExecutionQuality"),
        "lastActivityAt": row.get("lastActivityAt"),
        "lastActivityLabel": row.get("lastActivityLabel"),
        "checklist": row.get("checklist") or {},
        "missingAuditItems": row.get("missingAuditItems") or [],
        "latestBacktestSummary": row.get("latestBacktestSummary"),
        "latestBacktestConfig": row.get("latestBacktestConfig"),
        "robustAssessment": row.get("robustAssessment"),
        "exitReasonCounts": row.get("exitReasonCounts") or {},
    }


def strategy_catalog_payload(evidence: dict[str, Any]) -> dict[str, Any]:
    strategy_rows = [
        row for row in evidence.get("strategies") or []
        if not str(row.get("strategyId") or "").startswith("runtime:")
    ]
    return {
        "updatedAt": evidence.get("updatedAt"),
        "summary": evidence.get("summary") or {},
        "runtimeError": evidence.get("runtimeError"),
        "strategies": [strategy_catalog_card(row) for row in strategy_rows],
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


@app.get("/api/ai/status")
async def ai_status() -> dict[str, Any]:
    return provider_status()


@app.post("/api/ai/test")
async def ai_test() -> dict[str, Any]:
    return await test_ai_provider()


@app.get("/calendar/this-week")
async def calendar_this_week(days: int = Query(default=7, ge=1, le=21), refresh: bool = Query(default=False)) -> dict[str, Any]:
    return await get_calendar_week(days=days, force=refresh)


@app.get("/calendar/analysis")
async def calendar_analysis(days: int = Query(default=7, ge=1, le=21), refresh: bool = Query(default=False)) -> dict[str, Any]:
    return await get_calendar_analysis(days=days, force=refresh)


@app.get("/calendar/news")
async def calendar_news(days: int = Query(default=7, ge=1, le=21), refresh: bool = Query(default=False)) -> dict[str, Any]:
    return await get_macro_news(days=days, force=refresh)


@app.get("/calendar/holidays")
async def calendar_holidays(
    countries: str = Query(default="US,CL,GB,JP,DE"),
    days: int = Query(default=14, ge=1, le=60),
    refresh: bool = Query(default=False),
) -> dict[str, Any]:
    country_list = [item.strip().upper() for item in countries.split(",") if item.strip()]
    return await get_bank_holidays(countries=country_list, days=days, force=refresh)


@app.get("/calendar/weekly-brief")
async def calendar_weekly_brief(days: int = Query(default=7, ge=1, le=21), refresh: bool = Query(default=False)) -> dict[str, Any]:
    return await get_weekly_brief(days=days, force=refresh)


@app.get("/calendar/intelligence")
async def calendar_intelligence(days: int = Query(default=7, ge=1, le=21), refresh: bool = Query(default=False)) -> dict[str, Any]:
    return await get_calendar_intelligence(days=days, force=refresh)


@app.post("/calendar/refresh")
async def calendar_refresh(days: int = Query(default=7, ge=1, le=21)) -> dict[str, Any]:
    calendar, analysis, news, holidays, brief = await asyncio.gather(
        get_calendar_week(days=days, force=True),
        get_calendar_analysis(days=days, force=True),
        get_macro_news(days=days, force=True),
        get_bank_holidays(days=days, force=True),
        get_weekly_brief(days=days, force=True),
    )
    return {
        "success": True,
        "calendar": calendar,
        "analysis": analysis,
        "news": news,
        "holidays": holidays,
        "brief": brief,
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


@app.get("/api/hyperliquid/backtests/status")
async def backtests_status() -> dict[str, Any]:
    return build_status_snapshot()


@app.get("/api/hyperliquid/agent-runs")
async def agent_runs(strategy: Optional[str] = None, limit: int = Query(50, ge=1, le=200)) -> dict[str, Any]:
    runs = list_agent_runs(strategy_id=strategy, limit=limit)
    return {
        "updatedAt": int(time.time() * 1000),
        "strategyId": normalize_strategy_id(strategy) if strategy else None,
        "count": len(runs),
        "runs": runs,
    }


@app.get("/api/hyperliquid/agent-runtime/status")
async def agent_runtime() -> dict[str, Any]:
    return agent_runtime_status()


def agent_run_response(result: dict[str, Any], *, mission_id: str | None = None, created: bool = True) -> dict[str, Any]:
    payload = result["payload"]
    decision = payload.get("decision") or {}
    return {
        "created": created,
        "missionId": mission_id,
        "runPath": str(result["run_path"]),
        "runId": payload.get("run_id"),
        "strategyId": payload.get("strategy_id"),
        "mode": payload.get("mode"),
        "runtimeMode": (payload.get("ai") or {}).get("runtime_mode"),
        "runtimeProvider": (payload.get("ai") or {}).get("provider", "deterministic"),
        "recommendation": decision.get("recommendation"),
        "promotionAllowed": decision.get("promotion_allowed", False),
        "blockerCount": len(decision.get("blockers") or []),
        "recommendedCommands": decision.get("recommended_commands") or [],
        "agentRun": payload,
    }


@app.post("/api/hyperliquid/agent-runs/research")
async def create_agent_research(request: AgentRunCreate) -> dict[str, Any]:
    normalized = normalize_strategy_id(request.strategy_id)
    try:
        result = await asyncio.to_thread(
            run_agent_research,
            normalized,
            provider_order=request.provider_order,
            model=request.model,
            runtime=request.runtime,
            codex_profile=request.codex_profile,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return agent_run_response(result, mission_id=request.mission_id)


@app.post("/api/hyperliquid/agent-runs/audit")
async def create_agent_audit(request: AgentRunCreate) -> dict[str, Any]:
    normalized = normalize_strategy_id(request.strategy_id)
    try:
        result = await asyncio.to_thread(
            run_agent_audit,
            normalized,
            provider_order=request.provider_order,
            model=request.model,
            runtime=request.runtime,
            codex_profile=request.codex_profile,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return agent_run_response(result, mission_id=request.mission_id)


@app.get("/api/hyperliquid/agent-runs/{run_id}")
async def agent_run_detail(run_id: str) -> dict[str, Any]:
    try:
        payload = load_agent_run(run_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if payload is None:
        raise HTTPException(status_code=404, detail=f"No agent run found for {run_id}.")
    return payload


@app.get("/api/hyperliquid/agent-runs/strategy/{strategy_id}/latest")
async def latest_agent_run(strategy_id: str) -> dict[str, Any]:
    normalized = normalize_strategy_id(strategy_id)
    payload = latest_agent_run_payload(normalized)
    if payload is None:
        raise HTTPException(status_code=404, detail=f"No agent run found for {normalized}.")
    status = build_status_snapshot()
    strategy_status_row = next(
        (row for row in status.get("strategy_status", []) if row.get("strategy_id") == normalized),
        None,
    )
    return {
        "strategyId": normalized,
        "agentRun": payload,
        "strategyStatus": strategy_status_row,
        "comparison": {
            "agentRecommendation": payload.get("decision", {}).get("recommendation"),
            "agentPromotionAllowed": payload.get("decision", {}).get("promotion_allowed", False),
            "backendPromotionStage": strategy_status_row.get("promotion_stage") if strategy_status_row else "unknown",
            "recommendedCommands": payload.get("decision", {}).get("recommended_commands") or [],
            "validationGaps": payload.get("decision", {}).get("validation_gaps") or [],
        },
    }


@app.get("/api/hyperliquid/backtests/{strategy_id}/latest")
async def latest_backtest(strategy_id: str) -> dict[str, Any]:
    normalized = normalize_strategy_id(strategy_id)
    return latest_backtest_payload(normalized)


@app.get("/api/hyperliquid/backtests/{strategy_id}/artifacts")
async def list_backtest_artifacts(
    strategy_id: str,
    limit: int = 20,
) -> dict[str, Any]:
    normalized = normalize_strategy_id(strategy_id)
    return {
        "strategyId": normalized,
        "artifacts": backtest_artifact_summaries(normalized, limit=limit),
    }


@app.get("/api/hyperliquid/backtests/{strategy_id}/artifacts/{artifact_id}")
async def get_backtest_artifact(strategy_id: str, artifact_id: str) -> dict[str, Any]:
    normalized = normalize_strategy_id(strategy_id)
    return backtest_artifact_payload(normalized, artifact_id)


@app.post("/api/hyperliquid/validations/{strategy_id}/run")
async def run_strategy_validation(
    strategy_id: str,
    report_path: Optional[str] = None,
) -> dict[str, Any]:
    normalized = normalize_strategy_id(strategy_id)
    resolved_report = Path(report_path) if report_path else latest_json(REPORTS_ROOT, f"{normalized}-")
    if resolved_report is None or not resolved_report.exists():
        raise HTTPException(status_code=404, detail=f"No backtest artifact found for {normalized}.")

    report_payload = safe_load_json(resolved_report) or {}
    report_strategy = artifact_strategy_id(resolved_report, report_payload)
    if report_strategy != normalized:
        raise HTTPException(
            status_code=400,
            detail=f"Backtest artifact belongs to {report_strategy}, not {normalized}.",
        )

    try:
        validation_result = await asyncio.to_thread(
            validate_strategy_workflow,
            strategy_id=normalized,
            report_path=resolved_report,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {
        "success": True,
        "strategyId": normalized,
        "reportPath": str(resolved_report),
        "validationPath": str(validation_result["validation_path"]),
        "validation": validation_result["payload"],
    }


@app.post("/api/hyperliquid/backtests/{strategy_id}/ensure")
async def ensure_strategy_backtest(
    strategy_id: str,
    run_validation: bool = Query(default=True),
    build_paper_candidate: bool = Query(default=False),
    symbol: Optional[str] = Query(default=None),
    symbols: Optional[str] = Query(default=None),
    universe: str = Query(default="default"),
    start: Optional[str] = Query(default=None),
    end: Optional[str] = Query(default=None),
    lookback_days: Optional[int] = Query(default=None, ge=1),
    fee_rate: Optional[float] = Query(default=None),
    taker_fee_rate: Optional[float] = Query(default=None),
    maker_fee_rate: Optional[float] = Query(default=None),
    fee_model: str = Query(default="taker", pattern="^(taker|maker|mixed)$"),
    maker_ratio: float = Query(default=0.0, ge=0.0, le=1.0),
) -> dict[str, Any]:
    normalized = normalize_strategy_id(strategy_id)
    if latest_json(REPORTS_ROOT, f"{normalized}-") is not None:
        return latest_backtest_payload(normalized, created=False)
    if normalized not in available_strategies():
        raise HTTPException(status_code=400, detail=f"Strategy {normalized} is not registered for backend backtesting.")

    try:
        result = await asyncio.to_thread(
            run_backtest_workflow,
            strategy_id=normalized,
            dataset_path=None,
            config=build_backtest_config_from_filters(
                symbol=symbol,
                symbols=symbols,
                universe=universe,
                start=start,
                end=end,
                lookback_days=lookback_days,
                fee_rate=fee_rate,
                taker_fee_rate=taker_fee_rate,
                maker_fee_rate=maker_fee_rate,
                fee_model=fee_model,
                maker_ratio=maker_ratio,
            ),
        )
        validation_result = None
        if run_validation:
            validation_result = await asyncio.to_thread(
                validate_strategy_workflow,
                strategy_id=normalized,
                report_path=result["report_path"],
            )
        if build_paper_candidate:
            await asyncio.to_thread(
                build_paper_workflow,
                strategy_id=normalized,
                report_path=result["report_path"],
                validation_path=validation_result["validation_path"] if validation_result else None,
            )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return latest_backtest_payload(normalized, created=True)


@app.post("/api/hyperliquid/backtests/run")
async def run_strategy_backtest(payload: BacktestRunCreate) -> dict[str, Any]:
    normalized = normalize_strategy_id(payload.strategy_id)
    if normalized not in available_strategies():
        raise HTTPException(status_code=400, detail=f"Strategy {normalized} is not registered for backend backtesting.")

    try:
        result = await asyncio.to_thread(
            run_backtest_workflow,
            strategy_id=normalized,
            dataset_path=Path(payload.dataset_path) if payload.dataset_path else None,
            config=BacktestConfig(
                initial_equity=payload.initial_equity,
                fee_rate=payload.fee_rate,
                taker_fee_rate=payload.taker_fee_rate,
                maker_fee_rate=payload.maker_fee_rate,
                fee_model=payload.fee_model,
                maker_ratio=payload.maker_ratio,
                risk_fraction=payload.risk_fraction,
                symbols=normalize_symbols(
                    [
                        *([payload.symbol] if payload.symbol else []),
                        *([payload.symbols] if isinstance(payload.symbols, str) else (payload.symbols or [])),
                    ]
                ),
                universe=payload.universe,
                start=payload.start,
                end=payload.end,
                lookback_days=payload.lookback_days,
            ),
        )
        validation_result = None
        paper_result = None
        if payload.run_validation:
            validation_result = await asyncio.to_thread(
                validate_strategy_workflow,
                strategy_id=normalized,
                report_path=result["report_path"],
            )
        if payload.build_paper_candidate:
            paper_result = await asyncio.to_thread(
                build_paper_workflow,
                strategy_id=normalized,
                report_path=result["report_path"],
                validation_path=validation_result["validation_path"] if validation_result else None,
            )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {
        "success": True,
        "strategyId": normalized,
        "reportPath": str(result["report_path"]),
        "validationPath": str(validation_result["validation_path"]) if validation_result else None,
        "paperPath": str(paper_result["paper_path"]) if paper_result else None,
        "summary": result["payload"].get("summary"),
        "robustAssessment": result["payload"].get("robust_assessment"),
        "symbolLeaderboard": result["payload"].get("symbol_leaderboard") or [],
        "validation": validation_result["payload"] if validation_result else None,
        "paper": paper_result["payload"] if paper_result else None,
    }


@app.post("/api/hyperliquid/backtests/run-all")
async def run_all_strategy_backtests(
    run_validation: bool = Query(default=True),
    build_paper_candidate: bool = Query(default=False),
    symbol: Optional[str] = Query(default=None),
    symbols: Optional[str] = Query(default=None),
    universe: str = Query(default="default"),
    start: Optional[str] = Query(default=None),
    end: Optional[str] = Query(default=None),
    lookback_days: Optional[int] = Query(default=None, ge=1),
    fee_rate: Optional[float] = Query(default=None),
    taker_fee_rate: Optional[float] = Query(default=None),
    maker_fee_rate: Optional[float] = Query(default=None),
    fee_model: str = Query(default="taker", pattern="^(taker|maker|mixed)$"),
    maker_ratio: float = Query(default=0.0, ge=0.0, le=1.0),
) -> dict[str, Any]:
    results = []
    config = build_backtest_config_from_filters(
        symbol=symbol,
        symbols=symbols,
        universe=universe,
        start=start,
        end=end,
        lookback_days=lookback_days,
        fee_rate=fee_rate,
        taker_fee_rate=taker_fee_rate,
        maker_fee_rate=maker_fee_rate,
        fee_model=fee_model,
        maker_ratio=maker_ratio,
    )
    for strategy_id in available_strategies():
        item: dict[str, Any] = {"strategyId": strategy_id, "success": False}
        try:
            result = await asyncio.to_thread(
                run_backtest_workflow,
                strategy_id=strategy_id,
                dataset_path=None,
                config=config,
            )
            item.update(
                {
                    "success": True,
                    "reportPath": str(result["report_path"]),
                    "summary": result["payload"].get("summary"),
                    "robustAssessment": result["payload"].get("robust_assessment"),
                    "symbolLeaderboard": result["payload"].get("symbol_leaderboard") or [],
                }
            )
            validation_result = None
            if run_validation:
                validation_result = await asyncio.to_thread(
                    validate_strategy_workflow,
                    strategy_id=strategy_id,
                    report_path=result["report_path"],
                )
                item["validationPath"] = str(validation_result["validation_path"])
                item["validationStatus"] = validation_result["payload"].get("status")
            if build_paper_candidate:
                paper_result = await asyncio.to_thread(
                    build_paper_workflow,
                    strategy_id=strategy_id,
                    report_path=result["report_path"],
                    validation_path=validation_result["validation_path"] if validation_result else None,
                )
                item["paperPath"] = str(paper_result["paper_path"])
        except Exception as exc:
            item["error"] = str(exc)
        results.append(item)
    return {
        "success": all(item.get("success") for item in results),
        "results": results,
        "btcFirstLeaderboard": build_backtest_result_leaderboard(results),
    }


@app.post("/api/hyperliquid/paper/candidates/build")
async def build_strategy_paper_candidate(payload: PaperCandidateCreate) -> dict[str, Any]:
    normalized = normalize_strategy_id(payload.strategy_id)
    if normalized not in available_strategies():
        raise HTTPException(status_code=400, detail=f"Strategy {normalized} is not registered for backend paper review.")

    report_path = Path(payload.report_path) if payload.report_path else latest_json(REPORTS_ROOT, f"{normalized}-")
    if report_path is None or not report_path.exists():
        raise HTTPException(status_code=404, detail=f"No backtest artifact found for {normalized}.")

    report_payload = safe_load_json(report_path) or {}
    validation_path = Path(payload.validation_path) if payload.validation_path else latest_matching_validation(
        strategy_id=normalized,
        report_path=report_path,
        report_artifact_id=report_payload.get("artifact_id"),
    )
    validation_path = validation_path or latest_json(VALIDATIONS_ROOT, f"{normalized}-")
    validation_payload = safe_load_json(validation_path) if validation_path else None
    if not validation_payload or validation_payload.get("status") != "ready-for-paper":
        raise HTTPException(
            status_code=400,
            detail="Paper candidate creation requires a ready-for-paper validation artifact.",
        )

    try:
        result = await asyncio.to_thread(
            build_paper_workflow,
            strategy_id=normalized,
            report_path=report_path,
            validation_path=validation_path,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {
        "success": True,
        "strategyId": normalized,
        "reportPath": str(report_path),
        "validationPath": str(validation_path) if validation_path else None,
        "paperPath": str(result["paper_path"]),
        "paper": result["payload"],
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
    return {"trades": await paper_trade_payloads(status=status)}


@app.get("/api/hyperliquid/strategy-audit")
async def strategy_audit(
    limit: int = 200,
    exact_db_counts: bool = False,
) -> dict[str, Any]:
    return await build_strategy_evidence(limit=limit, exact_db_counts=exact_db_counts)


@app.get("/api/hyperliquid/strategies/catalog")
async def strategies_catalog(
    limit: int = 500,
    include_runtime: bool = False,
) -> dict[str, Any]:
    evidence = await build_strategy_evidence(
        limit=limit,
        runtime_limit=60 if include_runtime else 0,
        include_database=False,
        mark_paper_trades=False,
    )
    return strategy_catalog_payload(evidence)


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


@app.post("/api/hyperliquid/pine/indicators/generate")
async def pine_indicator_generate(request: PineIndicatorGenerate) -> dict[str, Any]:
    generated = await generate_pine_indicator(request.model_dump())
    candle_payload = await candles(request.symbol, interval=request.interval, lookback_hours=request.lookback_hours)
    preview = build_preview(candle_payload.get("candles", []), generated.get("previewRecipe", {}))
    return {
        "symbol": request.symbol.upper(),
        "interval": request.interval,
        "lookbackHours": request.lookback_hours,
        "generatedAt": int(time.time() * 1000),
        **generated,
        "candles": candle_payload,
        "preview": preview,
    }


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
    return {"success": True, "data": aggregate_chart_payload(hours)}


@app.get("/api/liquidations/insights")
async def liquidations_insights() -> dict[str, Any]:
    if not aggregate_history:
        await ensure_overview_data()
    snapshot = aggregate_history[-1] if aggregate_history else build_aggregate_snapshot([], int(time.time() * 1000))
    return {"success": True, "data": build_liquidations_insights(snapshot)}
