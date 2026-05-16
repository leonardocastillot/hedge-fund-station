from __future__ import annotations

import asyncio
import json
import os
import sqlite3
import subprocess
import time
from collections import Counter, defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, List, Literal, Optional, Union

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel, Field

try:
    from .backtesting.doubling import build_doubling_estimate, build_paper_readiness
    from .backtesting.btc_daily_history import load_btc_daily_history
    from .backtesting.engine import BacktestConfig, normalize_symbols
    from .backtesting.io import canonicalize_ohlcv_csv
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
    from .strategy_memory import (
        query_strategy_memory,
        strategy_memory_status,
        sync_strategy_memory,
    )
    from .strategy_scaffold import (
        StrategyScaffoldError,
        preview_strategy_scaffold,
        write_strategy_scaffold,
    )
    from .strategies.btc_failed_impulse_reversal.paper import (
        SETUP_TAGS as BTC_FAILED_IMPULSE_SETUP_TAGS,
        build_paper_runtime_plan as build_btc_failed_impulse_paper_runtime_plan,
    )
    from .strategies.btc_adaptive_cycle_trend.paper import (
        SETUP_TAGS as BTC_ADAPTIVE_CYCLE_TREND_SETUP_TAGS,
        build_paper_runtime_plan as build_btc_adaptive_cycle_trend_paper_runtime_plan,
    )
    from .strategies.btc_guarded_cycle_trend.paper import (
        SETUP_TAGS as BTC_GUARDED_CYCLE_TREND_SETUP_TAGS,
        build_paper_runtime_plan as build_btc_guarded_cycle_trend_paper_runtime_plan,
    )
except ImportError:
    from backtesting.doubling import build_doubling_estimate, build_paper_readiness
    from backtesting.btc_daily_history import load_btc_daily_history
    from backtesting.engine import BacktestConfig, normalize_symbols
    from backtesting.io import canonicalize_ohlcv_csv
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
    from strategy_memory import (
        query_strategy_memory,
        strategy_memory_status,
        sync_strategy_memory,
    )
    from strategy_scaffold import (
        StrategyScaffoldError,
        preview_strategy_scaffold,
        write_strategy_scaffold,
    )
    from strategies.btc_failed_impulse_reversal.paper import (
        SETUP_TAGS as BTC_FAILED_IMPULSE_SETUP_TAGS,
        build_paper_runtime_plan as build_btc_failed_impulse_paper_runtime_plan,
    )
    from strategies.btc_adaptive_cycle_trend.paper import (
        SETUP_TAGS as BTC_ADAPTIVE_CYCLE_TREND_SETUP_TAGS,
        build_paper_runtime_plan as build_btc_adaptive_cycle_trend_paper_runtime_plan,
    )
    from strategies.btc_guarded_cycle_trend.paper import (
        SETUP_TAGS as BTC_GUARDED_CYCLE_TREND_SETUP_TAGS,
        build_paper_runtime_plan as build_btc_guarded_cycle_trend_paper_runtime_plan,
    )

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
PAPER_RUNTIME_HISTORY_LIMIT = int(os.getenv("HYPERLIQUID_PAPER_RUNTIME_HISTORY_LIMIT", "2000"))
PAPER_RUNTIME_LOOKBACK_MS = 4 * 60 * 60 * 1000
DB_PATH_OVERRIDE = os.getenv("HYPERLIQUID_DB_PATH")
BACKEND_ROOT = Path(__file__).resolve().parent
if BACKEND_ROOT.name == "hyperliquid_gateway" and BACKEND_ROOT.parent.name == "backend":
    REPO_ROOT = BACKEND_ROOT.parents[1]
else:
    REPO_ROOT = BACKEND_ROOT
DATA_ROOT = Path(os.getenv("HYPERLIQUID_DATA_ROOT", str(BACKEND_ROOT / "data"))).expanduser()
DB_PATH = DB_PATH_OVERRIDE or str(DATA_ROOT / "hyperliquid.db")
REPORTS_ROOT = DATA_ROOT / "backtests"
AUDITS_ROOT = DATA_ROOT / "audits"
VALIDATIONS_ROOT = DATA_ROOT / "validations"
PAPER_ROOT = DATA_ROOT / "paper"
STRATEGY_MEMORY_ROOT = DATA_ROOT / "strategy_memory"
GRAPHIFY_OUT_ROOT = REPO_ROOT / "graphify-out"
DOCS_STRATEGIES_ROOT = REPO_ROOT / "docs" / "strategies"
STRATEGIES_ROOT = BACKEND_ROOT / "strategies"
MAX_STRATEGY_LAB_CANDLES = 8000
PAPER_LOOP_LOG_DIR = REPO_ROOT / ".tmp"
PAPER_LOOP_PID_FILE = PAPER_LOOP_LOG_DIR / "btc-paper-runtime-loop.pid"
PAPER_LOOP_LOG_FILE = PAPER_LOOP_LOG_DIR / "btc-paper-runtime-loop.log"
PAPER_LOOP_META_FILE = PAPER_LOOP_LOG_DIR / "btc-paper-runtime-loop.meta"
PAPER_LOOP_SCREEN_SESSION = os.getenv("BTC_PAPER_LOOP_SCREEN_SESSION", "btc-paper-runtime-loop")

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


class StrategyScaffoldPreviewCreate(BaseModel):
    title: str = Field(min_length=2, max_length=180)
    strategy_id: Optional[str] = Field(default=None, max_length=160)


class StrategyScaffoldCreate(BaseModel):
    title: str = Field(min_length=2, max_length=180)
    strategy_id: Optional[str] = Field(default=None, max_length=160)


class StrategyLearningEventCreate(BaseModel):
    strategy_id: str = Field(min_length=2, max_length=160)
    kind: Literal["hypothesis", "decision", "lesson", "postmortem", "rule_change"] = "lesson"
    outcome: Literal["win", "loss", "mixed", "unknown"] = "unknown"
    stage: Optional[str] = Field(default=None, max_length=120)
    title: str = Field(min_length=3, max_length=180)
    summary: str = Field(default="", max_length=4000)
    evidence_paths: List[str] = Field(default_factory=list)
    lesson: Optional[str] = Field(default=None, max_length=4000)
    rule_change: Optional[str] = Field(default=None, max_length=4000)
    next_action: Optional[str] = Field(default=None, max_length=1200)


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
    lookback_hours: int = Field(default=72, ge=4, le=4320)
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
        doubling_estimate = build_doubling_estimate(
            payload,
            report_path=path,
            validation_payload=validation_payload,
        )
        summaries.append(
            {
                "artifactId": payload.get("artifact_id") or path.stem,
                "reportPath": str(path),
                "validationPath": str(validation_path) if validation_path else None,
                "generatedAt": artifact_generated_ms(path, payload),
                "summary": payload.get("summary") or {},
                "robustAssessment": payload.get("robust_assessment"),
                "validationStatus": validation_payload.get("status") if validation_payload else None,
                "doublingEstimate": doubling_estimate,
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


def paper_runtime_history_entries(symbol: str, limit: int = PAPER_RUNTIME_HISTORY_LIMIT) -> list[dict[str, Any]]:
    normalized_symbol = symbol.upper()
    memory_entries = list(market_history[normalized_symbol])[-limit:]
    if history_span_ms(memory_entries) >= PAPER_RUNTIME_LOOKBACK_MS:
        return memory_entries

    with db_connection() as connection:
        latest_row = connection.execute(
            """
            SELECT MAX(timestamp_ms) AS latest_ms
            FROM market_snapshots
            WHERE symbol = ?
            """,
            (normalized_symbol,),
        ).fetchone()
        latest_ms = int(latest_row["latest_ms"] or 0) if latest_row else 0
        since_ms = max(0, latest_ms - PAPER_RUNTIME_LOOKBACK_MS)
        rows = connection.execute(
            """
            SELECT *
            FROM (
                SELECT *
                FROM market_snapshots
                WHERE symbol = ?
                  AND timestamp_ms >= ?
                ORDER BY timestamp_ms DESC
                LIMIT ?
            )
            ORDER BY timestamp_ms ASC
            """,
            (normalized_symbol, since_ms, limit),
        ).fetchall()
    db_entries = [
        {
            "time": row["timestamp_ms"],
            "timestamp": iso_timestamp(row["timestamp_ms"]),
            "symbol": row["symbol"],
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
        for row in rows
    ]
    return db_entries if history_span_ms(db_entries) > history_span_ms(memory_entries) else memory_entries


def history_span_ms(entries: list[dict[str, Any]]) -> int:
    if len(entries) < 2:
        return 0
    first = int(entries[0].get("time") or entries[0].get("timestamp_ms") or 0)
    last = int(entries[-1].get("time") or entries[-1].get("timestamp_ms") or 0)
    return max(0, last - first)


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


def paper_trade_matches_baseline(trade: dict[str, Any], baseline: dict[str, Any]) -> bool:
    match = baseline.get("paperTradeMatch") if isinstance(baseline.get("paperTradeMatch"), dict) else {}
    expected_symbol = str(match.get("symbol") or "").strip().upper()
    setup_tags = {
        str(item).strip().lower()
        for item in (match.get("setupTags") if isinstance(match.get("setupTags"), list) else [])
        if str(item).strip()
    }
    trade_symbol = str(trade.get("symbol") or "").strip().upper()
    trade_setup = str(trade.get("setupTag") or "").strip().lower()
    if expected_symbol and trade_symbol != expected_symbol:
        return False
    return bool(setup_tags and trade_setup in setup_tags)


def read_supervisor_metadata(path: Path | None = None) -> dict[str, str]:
    path = path or PAPER_LOOP_META_FILE
    metadata: dict[str, str] = {}
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return metadata
    for line in lines:
        key, separator, value = line.partition("=")
        if not separator:
            continue
        key = key.strip()
        if key:
            metadata[key] = value.strip()
    return metadata


def supervisor_screen_pid(session_name: str = PAPER_LOOP_SCREEN_SESSION) -> str | None:
    try:
        result = subprocess.run(
            ["screen", "-ls"],
            check=False,
            capture_output=True,
            text=True,
            timeout=2,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    suffix = f".{session_name}"
    for line in result.stdout.splitlines():
        token = line.strip().split(maxsplit=1)[0] if line.strip() else ""
        if token.endswith(suffix):
            return token.split(".", 1)[0]
    return None


def supervisor_pid_file_value(path: Path | None = None) -> str | None:
    path = path or PAPER_LOOP_PID_FILE
    try:
        value = path.read_text(encoding="utf-8").strip()
    except OSError:
        return None
    return value or None


def process_is_running(pid: str | None) -> bool:
    if not pid or not pid.isdigit():
        return False
    try:
        os.kill(int(pid), 0)
    except OSError:
        return False
    return True


def read_log_tail(path: Path | None = None, line_count: int = 20) -> list[str]:
    path = path or PAPER_LOOP_LOG_FILE
    if line_count <= 0:
        return []
    try:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return []
    return lines[-line_count:]


def parsed_json_log_events(lines: list[str]) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for line in lines:
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict):
            events.append(payload)
    return events


def file_modified_at_ms(path: Path) -> int | None:
    try:
        return int(path.stat().st_mtime * 1000)
    except OSError:
        return None


def supervisor_stale_after_seconds(interval_seconds: float | None) -> float:
    if interval_seconds is None or interval_seconds <= 0:
        return 900.0
    return max(900.0, interval_seconds * 3.0)


def meta_bool(metadata: dict[str, str], key: str) -> bool | None:
    value = metadata.get(key)
    if value is None:
        return None
    lowered = value.strip().lower()
    if lowered in {"true", "1", "yes"}:
        return True
    if lowered in {"false", "0", "no"}:
        return False
    return None


def meta_float(metadata: dict[str, str], key: str) -> float | None:
    try:
        return float(metadata[key])
    except (KeyError, TypeError, ValueError):
        return None


def meta_int(metadata: dict[str, str], key: str) -> int | None:
    try:
        return int(float(metadata[key]))
    except (KeyError, TypeError, ValueError):
        return None


def build_paper_runtime_supervisor_status(strategy_id: str, tail_lines: int = 20) -> dict[str, Any]:
    metadata = read_supervisor_metadata()
    screen_pid = supervisor_screen_pid()
    pid_file_value = supervisor_pid_file_value()
    fallback_pid = pid_file_value if process_is_running(pid_file_value) else None
    pid = screen_pid or fallback_pid
    log_tail = read_log_tail(line_count=tail_lines)
    events = parsed_json_log_events(log_tail)
    last_tick = next((event for event in reversed(events) if event.get("event") == "paper_runtime_tick"), None)
    last_event = events[-1] if events else None
    metadata_strategy = normalize_strategy_id(metadata.get("strategy", "")) if metadata.get("strategy") else None
    running = bool(pid)
    mode = "screen" if screen_pid else "pid" if fallback_pid else "stopped"
    supported = strategy_id == "btc_failed_impulse_reversal"
    strategy_matches = metadata_strategy in {None, strategy_id}
    interval_seconds = meta_float(metadata, "interval_seconds")
    stale_after_seconds = supervisor_stale_after_seconds(interval_seconds)
    last_log_at_ms = file_modified_at_ms(PAPER_LOOP_LOG_FILE)
    now_ms = int(time.time() * 1000)
    last_log_age_seconds = round((now_ms - last_log_at_ms) / 1000, 3) if last_log_at_ms else None
    dry_run = meta_bool(metadata, "dry_run")
    stale = bool(running and last_log_age_seconds is not None and last_log_age_seconds > stale_after_seconds)
    health_blockers: list[str] = []
    if not supported:
        health_blockers.append("unsupported_strategy")
    if not running:
        health_blockers.append("supervisor_not_running")
    if not strategy_matches:
        health_blockers.append("supervisor_strategy_mismatch")
    if dry_run is True:
        health_blockers.append("dry_run_enabled")
    if running and not PAPER_LOOP_LOG_FILE.exists():
        health_blockers.append("log_missing")
    if running and not last_tick:
        health_blockers.append("no_runtime_tick_seen")
    if stale:
        health_blockers.append("runtime_tick_stale")
    if isinstance(last_event, dict) and last_event.get("event") == "paper_runtime_tick_error":
        health_blockers.append("last_tick_error")
    if not supported:
        health_status = "unsupported"
    elif not running:
        health_status = "stopped"
    elif stale:
        health_status = "stale"
    elif health_blockers:
        health_status = "degraded"
    else:
        health_status = "healthy"
    return {
        "strategyId": strategy_id,
        "supported": supported,
        "running": running,
        "healthStatus": health_status,
        "healthBlockers": health_blockers,
        "healthChecks": {
            "supported": supported,
            "running": running,
            "strategyMatches": strategy_matches,
            "paperWriteMode": dry_run is False,
            "logExists": PAPER_LOOP_LOG_FILE.exists(),
            "hasRuntimeTick": bool(last_tick),
            "notStale": not stale,
        },
        "mode": mode,
        "screenSession": PAPER_LOOP_SCREEN_SESSION,
        "pid": pid,
        "pidFileValue": pid_file_value,
        "strategyMatches": strategy_matches,
        "metadata": metadata,
        "gatewayUrl": metadata.get("gateway_url"),
        "intervalSeconds": interval_seconds,
        "maxTicks": meta_int(metadata, "max_ticks"),
        "dryRun": dry_run,
        "failFast": meta_bool(metadata, "fail_fast"),
        "portfolioValue": meta_float(metadata, "portfolio_value"),
        "startedAt": metadata.get("started_at"),
        "logPath": str(PAPER_LOOP_LOG_FILE),
        "logExists": PAPER_LOOP_LOG_FILE.exists(),
        "lastLogAtMs": last_log_at_ms,
        "lastLogAt": iso_timestamp(last_log_at_ms) if last_log_at_ms else None,
        "lastLogAgeSeconds": last_log_age_seconds,
        "staleAfterSeconds": stale_after_seconds,
        "logTail": log_tail,
        "lastEvent": last_event,
        "lastTick": last_tick,
    }


def apply_btc_failed_impulse_paper_runtime_plan(plan: dict[str, Any]) -> dict[str, Any]:
    return apply_paper_runtime_plan(plan, setup_tags=BTC_FAILED_IMPULSE_SETUP_TAGS)


def apply_paper_runtime_plan(plan: dict[str, Any], *, setup_tags: tuple[str, ...]) -> dict[str, Any]:
    closed_trade_ids: list[int] = []
    opened_trade_id: int | None = None
    created_signal_id: int | None = None
    skipped_entry_reason: str | None = None
    now = int(time.time() * 1000)
    normalized_setup_tags = tuple(tag.lower() for tag in setup_tags)

    with db_connection() as connection:
        for action in plan.get("exitActions") or []:
            trade_id = int(action.get("tradeId") or 0)
            if trade_id <= 0:
                continue
            cursor = connection.execute(
                """
                UPDATE paper_trades
                SET status = 'closed', closed_at_ms = ?, exit_price = ?, realized_pnl_usd = ?
                WHERE id = ? AND status = 'open'
                """,
                (
                    int(action.get("closedAt") or now),
                    float(action.get("exitPrice") or 0.0),
                    float(action.get("realizedPnlUsd") or 0.0),
                    trade_id,
                ),
            )
            if cursor.rowcount:
                closed_trade_ids.append(trade_id)

        entry = plan.get("entry") if isinstance(plan.get("entry"), dict) else {}
        trade_payload = entry.get("tradePayload") if isinstance(entry.get("tradePayload"), dict) else None
        signal_payload = entry.get("signalPayload") if isinstance(entry.get("signalPayload"), dict) else None
        if trade_payload:
            placeholders = ",".join("?" for _ in normalized_setup_tags)
            existing = connection.execute(
                f"""
                SELECT 1 FROM paper_trades
                WHERE symbol = 'BTC'
                  AND status = 'open'
                  AND lower(setup_tag) IN ({placeholders})
                LIMIT 1
                """,
                normalized_setup_tags,
            ).fetchone()
            if existing:
                skipped_entry_reason = "matching_open_trade"
            else:
                if signal_payload:
                    signal_cursor = connection.execute(
                        """
                        INSERT INTO paper_signals (
                            created_at_ms, symbol, setup_tag, direction, confidence, thesis, entry_price, invalidation,
                            decision_label, trigger_plan, execution_quality, status
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')
                        """,
                        (
                            now,
                            str(signal_payload["symbol"]).upper(),
                            signal_payload["setup_tag"],
                            signal_payload["direction"],
                            int(signal_payload["confidence"]),
                            signal_payload["thesis"],
                            signal_payload.get("entry_price"),
                            signal_payload.get("invalidation"),
                            signal_payload.get("decision_label"),
                            signal_payload.get("trigger_plan"),
                            signal_payload.get("execution_quality"),
                        ),
                    )
                    created_signal_id = signal_cursor.lastrowid
                trade_cursor = connection.execute(
                    """
                    INSERT INTO paper_trades (
                        created_at_ms, symbol, side, setup_tag, thesis, entry_price, size_usd, stop_loss_pct, take_profit_pct,
                        decision_label, trigger_plan, invalidation_plan, execution_quality, status
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')
                    """,
                    (
                        now,
                        str(trade_payload["symbol"]).upper(),
                        trade_payload["side"],
                        trade_payload["setup_tag"],
                        trade_payload["thesis"],
                        trade_payload["entry_price"],
                        trade_payload["size_usd"],
                        trade_payload.get("stop_loss_pct"),
                        trade_payload.get("take_profit_pct"),
                        trade_payload.get("decision_label"),
                        trade_payload.get("trigger_plan"),
                        trade_payload.get("invalidation_plan"),
                        trade_payload.get("execution_quality"),
                    ),
                )
                opened_trade_id = trade_cursor.lastrowid

        connection.commit()

    return {
        "closedTradeIds": closed_trade_ids,
        "openedTradeId": opened_trade_id,
        "createdSignalId": created_signal_id,
        "skippedEntryReason": skipped_entry_reason,
    }


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
        "doublingEstimate": None,
        "doublingStability": None,
        "btcOptimization": None,
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
            "doublingStability": None,
            "btcOptimization": None,
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


def latest_artifacts_by_type(root: Path, artifact_type: str) -> dict[str, tuple[Path, dict[str, Any]]]:
    latest: dict[str, tuple[Path, dict[str, Any]]] = {}
    if not root.exists():
        return latest
    for path in root.glob("*.json"):
        payload = safe_load_json(path)
        if not payload or payload.get("artifact_type") != artifact_type:
            continue
        strategy_id = normalize_strategy_id(str(payload.get("strategy_id") or path.stem.split("-")[0]))
        current = latest.get(strategy_id)
        if current is None or path.stat().st_mtime > current[0].stat().st_mtime:
            latest[strategy_id] = (path, payload)
    return latest


def filename_slug(value: str, fallback: str = "event") -> str:
    slug = "".join(character.lower() if character.isalnum() else "-" for character in value)
    slug = "-".join(part for part in slug.split("-") if part)
    return slug[:72] or fallback


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def clean_learning_evidence_paths(paths: list[str]) -> list[str]:
    clean: list[str] = []
    seen: set[str] = set()
    for value in paths:
        candidate = str(value or "").strip()
        if not candidate or candidate in seen:
            continue
        seen.add(candidate)
        clean.append(candidate)
        if len(clean) >= 20:
            break
    return clean


def learning_event_sort_key(event: dict[str, Any]) -> int:
    return parse_time_ms(event.get("generated_at")) or parse_time_ms(event.get("updated_at")) or 0


def load_strategy_learning_event(path: Path) -> dict[str, Any] | None:
    payload = safe_load_json(path)
    if not payload:
        return None
    if payload.get("artifact_type") not in {None, "strategy_learning_event"}:
        return None
    strategy_id = normalize_strategy_id(str(payload.get("strategy_id") or path.parent.name))
    payload["strategy_id"] = strategy_id
    payload["event_id"] = str(payload.get("event_id") or path.stem)
    payload["path"] = str(path)
    payload["evidence_paths"] = clean_learning_evidence_paths(payload.get("evidence_paths") or [])
    return payload


def list_strategy_learning_events(strategy_id: str | None = None, limit: int = 100) -> dict[str, Any]:
    normalized_strategy_id = normalize_strategy_id(strategy_id) if strategy_id else None
    paths: list[Path] = []
    if STRATEGY_MEMORY_ROOT.exists():
        if normalized_strategy_id:
            paths = list((STRATEGY_MEMORY_ROOT / normalized_strategy_id).glob("*.json"))
        else:
            paths = list(STRATEGY_MEMORY_ROOT.glob("*/*.json"))

    events = [
        event for event in (load_strategy_learning_event(path) for path in paths)
        if event is not None and (normalized_strategy_id is None or event["strategy_id"] == normalized_strategy_id)
    ]
    events.sort(key=learning_event_sort_key, reverse=True)
    bounded_limit = max(1, min(limit, 500))
    return {
        "updatedAt": int(time.time() * 1000),
        "strategyId": normalized_strategy_id,
        "count": min(len(events), bounded_limit),
        "events": events[:bounded_limit],
    }


def write_strategy_learning_event(payload: StrategyLearningEventCreate) -> dict[str, Any]:
    strategy_id = normalize_strategy_id(payload.strategy_id)
    if not strategy_id:
        raise HTTPException(status_code=400, detail="strategy_id is required")

    generated_at = utc_now_iso()
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    event_id = f"{strategy_id}-{timestamp}-{time.time_ns()}-{filename_slug(payload.title)}"
    directory = STRATEGY_MEMORY_ROOT / strategy_id
    directory.mkdir(parents=True, exist_ok=True)
    file_path = directory / f"{event_id}.json"

    event = {
        "artifact_id": "strategy_learning_event",
        "artifact_type": "strategy_learning_event",
        "event_id": event_id,
        "strategy_id": strategy_id,
        "kind": payload.kind,
        "outcome": payload.outcome,
        "stage": (payload.stage or "").strip() or None,
        "title": payload.title.strip(),
        "summary": payload.summary.strip(),
        "evidence_paths": clean_learning_evidence_paths(payload.evidence_paths),
        "lesson": (payload.lesson or "").strip() or None,
        "rule_change": (payload.rule_change or "").strip() or None,
        "next_action": (payload.next_action or "").strip() or None,
        "generated_at": generated_at,
        "updated_at": generated_at,
        "path": str(file_path),
    }
    file_path.write_text(json.dumps(event, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return event


def graphify_required_paths() -> dict[str, Path]:
    return {
        "reportPath": GRAPHIFY_OUT_ROOT / "GRAPH_REPORT.md",
        "graphJsonPath": GRAPHIFY_OUT_ROOT / "graph.json",
        "htmlPath": GRAPHIFY_OUT_ROOT / "graph.html",
    }


def graphify_mtime_ms(paths: list[Path]) -> int | None:
    existing_times = [path.stat().st_mtime for path in paths if path.exists()]
    if not existing_times:
        return None
    return int(max(existing_times) * 1000)


def graphify_display_path(path: Path) -> str:
    try:
        return str(path.relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def graphify_git_value(args: list[str]) -> str | None:
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=2,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if result.returncode != 0:
        return None
    value = result.stdout.strip()
    return value or None


def graphify_built_commit(report_path: Path) -> str | None:
    if not report_path.exists():
        return None
    try:
        for line in report_path.read_text(encoding="utf-8").splitlines():
            if "Built from commit:" not in line:
                continue
            value = line.split("Built from commit:", 1)[1].strip()
            return value.strip("`").strip() or None
    except OSError:
        return None
    return None


def graphify_has_uncommitted_changes() -> bool | None:
    try:
        result = subprocess.run(
            ["git", "status", "--porcelain", "--untracked-files=all"],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=2,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if result.returncode != 0:
        return None
    return bool(result.stdout.strip())


def graphify_changed_paths_since_built(built_commit: str | None, current_commit: str | None) -> list[str] | None:
    if not built_commit or not current_commit or built_commit == current_commit:
        return []
    try:
        result = subprocess.run(
            ["git", "diff", "--name-only", f"{built_commit}..{current_commit}"],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=2,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if result.returncode != 0:
        return None
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def graphify_only_generated_changes(paths: list[str] | None) -> bool:
    if paths is None:
        return False
    return len(paths) > 0 and all(path == "graphify-out" or path.startswith("graphify-out/") for path in paths)


def graphify_freshness(
    available: bool,
    built_commit: str | None,
    current_commit: str | None,
    has_uncommitted_changes: bool | None,
    changed_paths_since_built: list[str] | None = None,
) -> str:
    if not available:
        return "missing"
    if has_uncommitted_changes:
        return "dirty"
    if built_commit and current_commit:
        if built_commit == current_commit or graphify_only_generated_changes(changed_paths_since_built):
            return "fresh"
        return "stale"
    return "unknown"


def graphify_collection(payload: dict[str, Any], primary: str, fallback: str | None = None) -> list[Any]:
    value = payload.get(primary)
    if isinstance(value, list):
        return value
    if fallback:
        fallback_value = payload.get(fallback)
        if isinstance(fallback_value, list):
            return fallback_value
    graph = payload.get("graph")
    if isinstance(graph, dict):
        nested = graph.get(primary)
        if isinstance(nested, list):
            return nested
        if fallback:
            nested_fallback = graph.get(fallback)
            if isinstance(nested_fallback, list):
                return nested_fallback
    return []


def first_present_graphify_value(node: dict[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        if key in node and node[key] is not None and node[key] != "":
            return node[key]
    return None


def graphify_community_count(payload: dict[str, Any], nodes: list[Any]) -> int | None:
    communities = payload.get("communities")
    if isinstance(communities, list):
        return len(communities)
    if isinstance(communities, dict):
        return len(communities)
    graph = payload.get("graph")
    if isinstance(graph, dict):
        nested = graph.get("communities")
        if isinstance(nested, list):
            return len(nested)
        if isinstance(nested, dict):
            return len(nested)

    community_values = {
        first_present_graphify_value(
            node,
            ("community", "cluster", "community_id", "communityId"),
        )
        for node in nodes
        if isinstance(node, dict)
    }
    community_values.discard(None)
    community_values.discard("")
    return len(community_values) if community_values else None


def graphify_text(value: Any, fallback: str = "") -> str:
    if value is None:
        return fallback
    text = str(value).strip()
    return text or fallback


def graphify_node_id(node: dict[str, Any]) -> str | None:
    value = first_present_graphify_value(node, ("id", "key", "name", "label"))
    text = graphify_text(value)
    return text or None


def graphify_edge_endpoint(edge: dict[str, Any], keys: tuple[str, ...]) -> str | None:
    value = first_present_graphify_value(edge, keys)
    text = graphify_text(value)
    return text or None


def graphify_load_graph_json() -> dict[str, Any]:
    graph_path = graphify_required_paths()["graphJsonPath"]
    if not graph_path.exists():
        raise HTTPException(status_code=404, detail="Graphify graph.json not found. Run npm run graph:build.")
    try:
        payload = json.loads(graph_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=500, detail=f"Could not read graphify-out/graph.json: {error}") from error
    if not isinstance(payload, dict):
        raise HTTPException(status_code=500, detail="graphify-out/graph.json is not a JSON object.")
    return payload


def graphify_safe_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")


def graphify_node_open_path(source_file: str) -> str | None:
    if not source_file:
        return None
    path = Path(source_file)
    if not path.is_absolute():
        path = REPO_ROOT / path
    try:
        resolved = path.resolve()
        resolved.relative_to(REPO_ROOT.resolve())
    except (OSError, ValueError):
        return None
    return str(resolved) if resolved.exists() else None


def graphify_explorer_data(payload: dict[str, Any]) -> dict[str, Any]:
    raw_nodes = [node for node in graphify_collection(payload, "nodes") if isinstance(node, dict)]
    raw_edges = [
        edge
        for edge in graphify_collection(payload, "edges", "links")
        if isinstance(edge, dict)
    ]

    known_ids: set[str] = set()
    degree_by_id: Counter[str] = Counter()
    edge_rows: list[dict[str, Any]] = []
    relation_counts: Counter[str] = Counter()

    for node in raw_nodes:
        node_id = graphify_node_id(node)
        if node_id:
            known_ids.add(node_id)

    for edge in raw_edges:
        source = graphify_edge_endpoint(edge, ("source", "from", "src"))
        target = graphify_edge_endpoint(edge, ("target", "to", "dst"))
        if not source or not target or source not in known_ids or target not in known_ids:
            continue
        relation = graphify_text(first_present_graphify_value(edge, ("relation", "type", "label")), "linked")
        source_file = graphify_text(edge.get("source_file") or edge.get("file"))
        source_location = graphify_text(edge.get("source_location") or edge.get("location"))
        confidence = graphify_text(edge.get("confidence") or edge.get("confidence_score"))
        degree_by_id[source] += 1
        degree_by_id[target] += 1
        relation_counts[relation] += 1
        edge_rows.append(
            {
                "from": source,
                "to": target,
                "relation": relation,
                "sourceFile": source_file,
                "sourceLocation": source_location,
                "confidence": confidence,
                "weight": edge.get("weight", 1),
            }
        )

    seen_nodes: set[str] = set()
    node_rows: list[dict[str, Any]] = []
    community_counts: Counter[str] = Counter()
    type_counts: Counter[str] = Counter()

    for node in raw_nodes:
        node_id = graphify_node_id(node)
        if not node_id or node_id in seen_nodes:
            continue
        seen_nodes.add(node_id)
        label = graphify_text(first_present_graphify_value(node, ("label", "name", "id")), node_id)
        community_value = first_present_graphify_value(node, ("community", "cluster", "community_id", "communityId"))
        community = graphify_text(community_value, "unclustered")
        file_type = graphify_text(first_present_graphify_value(node, ("file_type", "fileType", "kind", "type")), "node")
        source_file = graphify_text(node.get("source_file") or node.get("file") or node.get("path"))
        source_location = graphify_text(node.get("source_location") or node.get("location"))
        degree = int(degree_by_id.get(node_id, 0))
        community_counts[community] += 1
        type_counts[file_type] += 1
        node_rows.append(
            {
                "id": node_id,
                "label": label,
                "normLabel": graphify_text(node.get("norm_label"), label),
                "community": community,
                "fileType": file_type,
                "sourceFile": source_file,
                "sourceLocation": source_location,
                "openPath": graphify_node_open_path(source_file),
                "degree": degree,
                "value": max(5, min(46, 5 + degree)),
            }
        )

    node_rows.sort(key=lambda row: (-int(row["degree"]), str(row["label"]).lower()))
    edge_rows.sort(key=lambda row: (str(row["relation"]), str(row["from"]), str(row["to"])))
    community_rows = [
        {"id": community, "label": community, "count": count}
        for community, count in community_counts.most_common()
    ]
    relation_rows = [
        {"id": relation, "label": relation, "count": count}
        for relation, count in relation_counts.most_common(12)
    ]
    type_rows = [
        {"id": node_type, "label": node_type, "count": count}
        for node_type, count in type_counts.most_common(12)
    ]

    return {
        "nodes": node_rows,
        "edges": edge_rows,
        "stats": {
            "nodeCount": len(node_rows),
            "edgeCount": len(edge_rows),
            "communityCount": len(community_rows),
            "maxDegree": max((int(row["degree"]) for row in node_rows), default=0),
            "communities": community_rows,
            "relations": relation_rows,
            "nodeTypes": type_rows,
        },
    }


def graphify_explorer_html() -> str:
    data = graphify_explorer_data(graphify_load_graph_json())
    html = r"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Graphify Explorer</title>
  <script src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
  <style>
    :root {
      color-scheme: dark;
      --bg: #07080d;
      --panel: rgba(15, 18, 28, 0.92);
      --panel-strong: rgba(8, 10, 17, 0.96);
      --line: rgba(255, 255, 255, 0.11);
      --line-strong: rgba(125, 211, 252, 0.34);
      --text: #f8fafc;
      --muted: rgba(226, 232, 240, 0.62);
      --subtle: rgba(226, 232, 240, 0.38);
      --cyan: #67e8f9;
      --green: #86efac;
      --amber: #fde68a;
      --pink: #f0abfc;
      --shadow: 0 20px 70px rgba(0, 0, 0, 0.45);
    }

    * {
      box-sizing: border-box;
    }

    html,
    body {
      height: 100%;
      margin: 0;
      overflow: hidden;
      background: var(--bg);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
    }

    button,
    input,
    select {
      font: inherit;
    }

    .shell {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      height: 100%;
      min-height: 100vh;
      background:
        linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px),
        linear-gradient(135deg, #080910 0%, #0c1118 45%, #09070f 100%);
      background-size: 34px 34px, 34px 34px, auto;
    }

    .topbar {
      display: grid;
      grid-template-columns: minmax(15rem, 1fr) auto;
      gap: 1rem;
      align-items: center;
      padding: 0.85rem 1rem;
      border-bottom: 1px solid var(--line);
      background: rgba(5, 7, 12, 0.9);
      backdrop-filter: blur(18px);
      box-shadow: var(--shadow);
      z-index: 5;
    }

    .brand {
      min-width: 0;
    }

    .brand-title {
      display: flex;
      align-items: center;
      gap: 0.55rem;
      min-width: 0;
      font-size: 0.95rem;
      font-weight: 800;
      color: var(--text);
      white-space: nowrap;
    }

    .brand-mark {
      width: 0.72rem;
      height: 0.72rem;
      border-radius: 999px;
      background: var(--cyan);
      box-shadow: 0 0 0 5px rgba(103, 232, 249, 0.12), 0 0 28px rgba(103, 232, 249, 0.65);
      flex: 0 0 auto;
    }

    .brand-subtitle {
      margin-top: 0.25rem;
      color: var(--muted);
      font-size: 0.78rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .toolbar {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      align-items: center;
      gap: 0.55rem;
      min-width: 0;
    }

    .search {
      display: flex;
      min-width: min(30rem, 44vw);
      align-items: center;
      gap: 0.45rem;
      padding: 0.35rem 0.45rem;
      border: 1px solid rgba(103, 232, 249, 0.22);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.06);
    }

    .search input,
    select {
      min-width: 0;
      border: 0;
      outline: 0;
      color: var(--text);
      background: transparent;
    }

    .search input {
      width: 100%;
    }

    .search input::placeholder {
      color: var(--subtle);
    }

    select {
      min-height: 2.1rem;
      max-width: 12rem;
      padding: 0 0.55rem;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.06);
      color: var(--text);
    }

    select option {
      background: #0b1020;
      color: var(--text);
    }

    .range-control {
      display: inline-flex;
      min-height: 2.1rem;
      align-items: center;
      gap: 0.5rem;
      padding: 0 0.65rem;
      border: 1px solid var(--line);
      border-radius: 8px;
      color: var(--muted);
      background: rgba(255, 255, 255, 0.05);
      font-size: 0.78rem;
      white-space: nowrap;
    }

    .range-control input {
      width: 6rem;
      accent-color: var(--cyan);
    }

    .range-control strong {
      min-width: 2rem;
      color: var(--text);
      text-align: right;
    }

    .button {
      display: inline-flex;
      min-height: 2.1rem;
      align-items: center;
      justify-content: center;
      gap: 0.35rem;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 0 0.72rem;
      color: var(--text);
      background: rgba(255, 255, 255, 0.06);
      cursor: pointer;
      transition: transform 140ms ease, border-color 140ms ease, background 140ms ease;
    }

    .button:hover {
      transform: translateY(-1px);
      border-color: var(--line-strong);
      background: rgba(103, 232, 249, 0.12);
    }

    .button.primary {
      border-color: rgba(103, 232, 249, 0.35);
      background: rgba(103, 232, 249, 0.14);
      color: #ecfeff;
    }

    .workspace {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(19rem, 22rem);
      min-height: 0;
    }

    .graph-stage {
      position: relative;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
    }

    .ambient-flow {
      position: absolute;
      inset: 0;
      z-index: 1;
      pointer-events: none;
      opacity: 0.22;
      transition: opacity 420ms ease;
    }

    .graph-stage[data-flow="settling"] .ambient-flow {
      opacity: 0.36;
    }

    .graph-stage[data-flow="flowing"] .ambient-flow {
      opacity: 0.28;
    }

    .ambient-flow::before,
    .ambient-flow::after {
      content: "";
      position: absolute;
      left: 50%;
      top: 50%;
      width: min(88vw, 88vh);
      aspect-ratio: 1;
      border: 1px solid rgba(103, 232, 249, 0.12);
      border-radius: 50%;
      box-shadow: 0 0 70px rgba(103, 232, 249, 0.09), inset 0 0 54px rgba(134, 239, 172, 0.045);
      transform: translate(-50%, -50%) rotate(0deg);
      animation: graphOrbitFlow 34s linear infinite;
    }

    .ambient-flow::after {
      width: min(62vw, 62vh);
      border-color: rgba(240, 171, 252, 0.11);
      box-shadow: 0 0 58px rgba(240, 171, 252, 0.075), inset 0 0 42px rgba(103, 232, 249, 0.04);
      animation-duration: 48s;
      animation-direction: reverse;
    }

    @keyframes graphOrbitFlow {
      from {
        transform: translate(-50%, -50%) rotate(0deg) scale(0.98);
      }
      50% {
        transform: translate(-50%, -50%) rotate(180deg) scale(1.02);
      }
      to {
        transform: translate(-50%, -50%) rotate(360deg) scale(0.98);
      }
    }

    #network {
      position: absolute;
      inset: 0;
      z-index: 2;
      min-width: 0;
      min-height: 0;
    }

    #network .vis-network {
      outline: 0;
    }

    .hud {
      position: absolute;
      left: 1rem;
      bottom: 1rem;
      display: flex;
      flex-wrap: wrap;
      max-width: calc(100% - 2rem);
      gap: 0.5rem;
      z-index: 3;
      pointer-events: none;
    }

    .metric {
      min-width: 6.6rem;
      padding: 0.58rem 0.7rem;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(5, 7, 12, 0.74);
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
      backdrop-filter: blur(14px);
    }

    .metric span {
      display: block;
      color: var(--subtle);
      font-size: 0.66rem;
      font-weight: 700;
      text-transform: uppercase;
    }

    .metric strong {
      display: block;
      margin-top: 0.12rem;
      font-size: 1rem;
      color: var(--text);
    }

    .vis-tooltip {
      overflow: hidden !important;
      max-width: min(24rem, calc(100vw - 2rem)) !important;
      border: 1px solid rgba(103, 232, 249, 0.28) !important;
      border-radius: 8px !important;
      background: rgba(6, 8, 13, 0.96) !important;
      color: var(--text) !important;
      padding: 0 !important;
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.42) !important;
      backdrop-filter: blur(14px);
    }

    .graph-tooltip {
      max-width: 23rem;
      padding: 0.72rem 0.78rem;
      color: var(--text);
      font-size: 0.78rem;
      line-height: 1.35;
      white-space: normal;
    }

    .tooltip-title {
      margin-bottom: 0.55rem;
      color: #f8fafc;
      font-size: 0.88rem;
      font-weight: 800;
      overflow-wrap: anywhere;
    }

    .tooltip-row {
      display: grid;
      grid-template-columns: 5.8rem minmax(0, 1fr);
      gap: 0.65rem;
      margin-top: 0.34rem;
    }

    .tooltip-key {
      color: var(--muted);
      font-size: 0.68rem;
      font-weight: 750;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }

    .tooltip-value {
      color: #dff8ff;
      overflow-wrap: anywhere;
    }

    .tooltip-footer {
      margin-top: 0.65rem;
      padding-top: 0.58rem;
      border-top: 1px solid var(--line);
      color: var(--muted);
      font-size: 0.72rem;
    }

    .inspector {
      min-height: 0;
      overflow: auto;
      border-left: 1px solid var(--line);
      background: var(--panel);
      backdrop-filter: blur(18px);
    }

    .inspector-inner {
      padding: 1rem;
    }

    .panel-title {
      margin: 0;
      color: var(--text);
      font-size: 0.94rem;
      font-weight: 800;
      overflow-wrap: anywhere;
    }

    .panel-subtitle {
      margin-top: 0.28rem;
      color: var(--muted);
      font-size: 0.78rem;
      overflow-wrap: anywhere;
    }

    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem;
      margin-top: 0.8rem;
    }

    .chip {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      min-height: 1.65rem;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 0 0.62rem;
      color: var(--muted);
      background: rgba(255, 255, 255, 0.045);
      font-size: 0.72rem;
      font-weight: 700;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-top: 0.8rem;
    }

    .button.inspector-action {
      min-height: 2rem;
      padding: 0 0.68rem;
      font-size: 0.76rem;
      font-weight: 750;
    }

    .section {
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 1px solid var(--line);
    }

    .section h2 {
      margin: 0 0 0.62rem;
      color: var(--text);
      font-size: 0.78rem;
      font-weight: 800;
      text-transform: uppercase;
    }

    .kv {
      display: grid;
      gap: 0.45rem;
      margin: 0;
    }

    .kv div {
      display: grid;
      grid-template-columns: 5.4rem minmax(0, 1fr);
      gap: 0.6rem;
      align-items: start;
      font-size: 0.78rem;
    }

    .kv dt {
      color: var(--subtle);
    }

    .kv dd {
      margin: 0;
      color: var(--text);
      overflow-wrap: anywhere;
    }

    .list {
      display: grid;
      gap: 0.42rem;
    }

    .node-link {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 0.55rem 0.62rem;
      color: var(--text);
      background: rgba(255, 255, 255, 0.045);
      text-align: left;
      cursor: pointer;
      overflow-wrap: anywhere;
    }

    .node-link:hover {
      border-color: rgba(134, 239, 172, 0.38);
      background: rgba(134, 239, 172, 0.1);
    }

    .node-link span {
      display: block;
      margin-top: 0.18rem;
      color: var(--subtle);
      font-size: 0.7rem;
    }

    .empty-state {
      display: grid;
      place-items: center;
      height: 100%;
      min-height: 18rem;
      padding: 2rem;
      color: var(--muted);
      text-align: center;
    }

    @media (max-width: 1040px) {
      .topbar {
        grid-template-columns: 1fr;
      }

      .toolbar {
        justify-content: flex-start;
      }

      .search {
        min-width: min(100%, 30rem);
      }

      .workspace {
        grid-template-columns: 1fr;
        grid-template-rows: minmax(24rem, 1fr) minmax(18rem, 36vh);
      }

      .inspector {
        border-left: 0;
        border-top: 1px solid var(--line);
      }
    }
  </style>
</head>
<body>
  <main class="shell">
    <header class="topbar">
      <div class="brand">
        <div class="brand-title"><span class="brand-mark" aria-hidden="true"></span><span>Graphify Explorer</span></div>
        <div class="brand-subtitle" id="subtitle">Repo map loaded from graphify-out/graph.json</div>
      </div>
      <div class="toolbar">
        <label class="search" aria-label="Search nodes">
          <input id="searchInput" list="nodeList" type="search" placeholder="Search files, classes, docs, tasks" autocomplete="off" />
          <datalist id="nodeList"></datalist>
        </label>
        <select id="communitySelect" aria-label="Community filter"></select>
        <label class="range-control">
          <span>Degree</span>
          <input id="degreeRange" type="range" min="0" max="40" step="1" value="0" />
          <strong id="degreeValue">0+</strong>
        </label>
        <button class="button primary" id="focusButton" type="button">Focus</button>
        <button class="button" id="neighborhoodButton" type="button">Neighborhood</button>
        <button class="button" id="labelsButton" type="button">Labels</button>
        <button class="button" id="physicsButton" type="button">Reflow</button>
        <button class="button" id="fitButton" type="button">Fit</button>
        <button class="button" id="resetButton" type="button">Reset</button>
      </div>
    </header>
    <section class="workspace">
      <div class="graph-stage">
        <div class="ambient-flow" aria-hidden="true"></div>
        <div id="network"></div>
        <div class="hud" role="group" aria-label="Graph performance metrics">
          <div class="metric"><span>Visible Nodes</span><strong id="visibleNodes">0</strong></div>
          <div class="metric"><span>Visible Edges</span><strong id="visibleEdges">0</strong></div>
          <div class="metric"><span>Total Nodes</span><strong id="totalNodes">0</strong></div>
          <div class="metric"><span>Communities</span><strong id="totalCommunities">0</strong></div>
          <div class="metric"><span>Profile</span><strong id="profileMetric">loading</strong></div>
          <div class="metric"><span>Render</span><strong id="renderMetric">0ms</strong></div>
          <div class="metric"><span>Motion</span><strong id="physicsMetric">settling</strong></div>
        </div>
      </div>
      <aside class="inspector" aria-label="Selected node">
        <div class="inspector-inner" id="inspector"></div>
      </aside>
    </section>
  </main>

  <script>
    const RAW_NODES = __GRAPHIFY_NODES__;
    const RAW_EDGES = __GRAPHIFY_EDGES__;
    const STATS = __GRAPHIFY_STATS__;

    const palette = [
      ["#67e8f9", "rgba(103, 232, 249, 0.2)"],
      ["#86efac", "rgba(134, 239, 172, 0.18)"],
      ["#f0abfc", "rgba(240, 171, 252, 0.18)"],
      ["#fde68a", "rgba(253, 230, 138, 0.18)"],
      ["#93c5fd", "rgba(147, 197, 253, 0.18)"],
      ["#fca5a5", "rgba(252, 165, 165, 0.17)"],
      ["#c4b5fd", "rgba(196, 181, 253, 0.18)"],
      ["#5eead4", "rgba(94, 234, 212, 0.17)"]
    ];

    const relationPalette = [
      "rgba(103, 232, 249, 0.24)",
      "rgba(134, 239, 172, 0.2)",
      "rgba(240, 171, 252, 0.22)",
      "rgba(253, 230, 138, 0.22)",
      "rgba(147, 197, 253, 0.22)"
    ];

    const byId = new Map(RAW_NODES.map((node) => [node.id, node]));
    const neighbors = new Map(RAW_NODES.map((node) => [node.id, new Set()]));
    const edgeLookup = new Map();
    RAW_EDGES.forEach((edge, index) => {
      edge.id = edge.id || `edge-${index}`;
    });

    const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
    const communityRank = new Map((STATS.communities || []).map((community, index) => [String(community.id), index]));
    const communitySize = new Map((STATS.communities || []).map((community) => [String(community.id), Number(community.count || 1)]));
    const nodeCommunityIndex = new Map();
    const seenInCommunity = new Map();
    for (const node of RAW_NODES) {
      const communityKey = String(node.community || "unclustered");
      const index = seenInCommunity.get(communityKey) || 0;
      seenInCommunity.set(communityKey, index + 1);
      nodeCommunityIndex.set(node.id, index);
    }

    for (const edge of RAW_EDGES) {
      if (!neighbors.has(edge.from)) neighbors.set(edge.from, new Set());
      if (!neighbors.has(edge.to)) neighbors.set(edge.to, new Set());
      neighbors.get(edge.from).add(edge.to);
      neighbors.get(edge.to).add(edge.from);
      const fromKey = `${edge.from}->${edge.to}`;
      const toKey = `${edge.to}->${edge.from}`;
      if (!edgeLookup.has(fromKey)) edgeLookup.set(fromKey, []);
      if (!edgeLookup.has(toKey)) edgeLookup.set(toKey, []);
      edgeLookup.get(fromKey).push(edge);
      edgeLookup.get(toKey).push(edge);
    }

    const elements = {
      stage: document.querySelector(".graph-stage"),
      network: document.getElementById("network"),
      inspector: document.getElementById("inspector"),
      search: document.getElementById("searchInput"),
      nodeList: document.getElementById("nodeList"),
      community: document.getElementById("communitySelect"),
      degree: document.getElementById("degreeRange"),
      degreeValue: document.getElementById("degreeValue"),
      focus: document.getElementById("focusButton"),
      neighborhood: document.getElementById("neighborhoodButton"),
      labels: document.getElementById("labelsButton"),
      physics: document.getElementById("physicsButton"),
      fit: document.getElementById("fitButton"),
      reset: document.getElementById("resetButton"),
      visibleNodes: document.getElementById("visibleNodes"),
      visibleEdges: document.getElementById("visibleEdges"),
      totalNodes: document.getElementById("totalNodes"),
      totalCommunities: document.getElementById("totalCommunities"),
      profileMetric: document.getElementById("profileMetric"),
      renderMetric: document.getElementById("renderMetric"),
      physicsMetric: document.getElementById("physicsMetric"),
      subtitle: document.getElementById("subtitle")
    };

    const PERFORMANCE_PROFILES = {
      "world-orbit": {
        label: "world-orbit",
        nodeShadow: true,
        settlingNodeShadow: false,
        edgeSmooth: { type: "continuous", roundness: 0.22 },
        settlingEdgeSmooth: false,
        hover: true,
        settlingHover: false,
        disableTooltipsWhileSettling: true,
        edgeWidthMax: 1.8,
        nodeValueMax: 34,
        massScale: 30,
        tooltipDelay: 90,
        autoFreezeMs: null,
        settleSafetyMs: null,
        stabilizeAfterMs: 11500,
        gravityWarmupMs: 11500,
        freezeOnStabilized: true,
        seedLayout: true,
        seedShellScale: 1.34,
        settledScale: 0.9,
        layout: { improvedLayout: false },
        physics: {
          enabled: true,
          solver: "forceAtlas2Based",
          stabilization: { enabled: false, iterations: 260, fit: true, updateInterval: 20 },
          forceAtlas2Based: {
            gravitationalConstant: -58,
            centralGravity: 0.016,
            springLength: 118,
            springConstant: 0.054,
            damping: 0.43,
            avoidOverlap: 0.42
          },
          maxVelocity: 38,
          minVelocity: 0.55,
          timestep: 0.52
        }
      },
      focused: {
        label: "focused",
        nodeShadow: false,
        edgeSmooth: false,
        hover: true,
        edgeWidthMax: 1.7,
        nodeValueMax: 36,
        massScale: 26,
        tooltipDelay: 120,
        autoFreezeMs: 5200,
        freezeOnStabilized: true,
        physics: {
          enabled: true,
          solver: "barnesHut",
          stabilization: { enabled: true, iterations: 46, fit: true },
          barnesHut: {
            gravitationalConstant: -3100,
            centralGravity: 0.18,
            springLength: 102,
            springConstant: 0.024,
            damping: 0.7,
            avoidOverlap: 0.12
          },
          maxVelocity: 26,
          minVelocity: 0.85,
          timestep: 0.5
        }
      },
      neighborhood: {
        label: "neighborhood",
        nodeShadow: true,
        edgeSmooth: { type: "dynamic" },
        hover: true,
        edgeWidthMax: 2.4,
        nodeValueMax: 44,
        massScale: 18,
        tooltipDelay: 90,
        autoFreezeMs: 6200,
        freezeOnStabilized: true,
        physics: {
          enabled: true,
          solver: "forceAtlas2Based",
          stabilization: { enabled: true, iterations: 82, fit: true },
          forceAtlas2Based: {
            gravitationalConstant: -58,
            centralGravity: 0.016,
            springLength: 92,
            springConstant: 0.054,
            damping: 0.43,
            avoidOverlap: 0.34
          },
          maxVelocity: 38,
          minVelocity: 0.55
        }
      }
    };

    let labelsEnabled = false;
    let physicsRunning = true;
    let physicsState = "settling";
    let activeProfileId = "world-orbit";
    let lastRenderMs = 0;
    let lastFrameMs = 0;
    let lastFrameAt = 0;
    let lastHudPaintAt = 0;
    let refreshTimer = null;
    let autoFreezeTimer = null;
    let settleWatchTimer = null;
    let settleStartedAt = 0;
    let lastSettleSample = null;
    let stableSettleSamples = 0;
    let fullGraphStabilizeRequested = false;
    let selectedId = null;
    let neighborhoodRoot = null;
    let currentVisibleIds = new Set();

    function formatNumber(value) {
      return Number(value || 0).toLocaleString();
    }

    function normalize(value) {
      return String(value || "").trim().toLowerCase();
    }

    function hash(value) {
      let output = 0;
      const text = String(value || "");
      for (let index = 0; index < text.length; index += 1) {
        output = (output * 31 + text.charCodeAt(index)) >>> 0;
      }
      return output;
    }

    function escapeHtml(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    function truncate(value, maxLength) {
      const text = String(value || "");
      if (text.length <= maxLength) return text;
      return `${text.slice(0, Math.max(1, maxLength - 1))}...`;
    }

    function fileName(value) {
      const text = String(value || "").trim();
      if (!text) return "";
      const parts = text.split(/[\\/]/).filter(Boolean);
      return parts[parts.length - 1] || text;
    }

    function readableType(value) {
      const text = String(value || "node").trim();
      if (!text) return "Node";
      return text
        .replaceAll("_", " ")
        .replaceAll("-", " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
    }

    function nodeDisplayLabel(node) {
      const preferred = String(node.label || "").trim();
      if (preferred && preferred.length <= 34) return preferred;
      const sourceName = fileName(node.sourceFile);
      if (sourceName && sourceName.length <= 34) return sourceName;
      return truncate(preferred || sourceName || node.id, 34);
    }

    function tooltipBlock(title, rows, footer) {
      const root = document.createElement("div");
      root.className = "graph-tooltip";

      const titleNode = document.createElement("div");
      titleNode.className = "tooltip-title";
      titleNode.textContent = title || "Graphify item";
      root.appendChild(titleNode);

      for (const [key, value] of rows) {
        if (value === null || value === undefined || value === "") continue;
        const row = document.createElement("div");
        row.className = "tooltip-row";

        const keyNode = document.createElement("div");
        keyNode.className = "tooltip-key";
        keyNode.textContent = key;

        const valueNode = document.createElement("div");
        valueNode.className = "tooltip-value";
        valueNode.textContent = String(value);

        row.appendChild(keyNode);
        row.appendChild(valueNode);
        root.appendChild(row);
      }

      if (footer) {
        const footerNode = document.createElement("div");
        footerNode.className = "tooltip-footer";
        footerNode.textContent = footer;
        root.appendChild(footerNode);
      }

      return root;
    }

    function nodeTooltip(node) {
      return tooltipBlock(nodeDisplayLabel(node), [
        ["Kind", readableType(node.fileType)],
        ["File", node.sourceFile || node.id],
        ["Location", node.sourceLocation || ""],
        ["Community", `community ${node.community}`],
        ["Links", `${formatNumber(node.degree)} graph links`],
        ["Source", node.openPath ? "Open Source available" : ""]
      ], "Click to inspect. Double-click for neighborhood.");
    }

    function edgeTooltip(edge) {
      const fromNode = byId.get(edge.from);
      const toNode = byId.get(edge.to);
      return tooltipBlock(edge.relation || "Graph relation", [
        ["From", fromNode ? nodeDisplayLabel(fromNode) : edge.from],
        ["To", toNode ? nodeDisplayLabel(toNode) : edge.to],
        ["File", edge.sourceFile || ""],
        ["Location", edge.sourceLocation || ""],
        ["Confidence", edge.confidence || ""]
      ], "Relation discovered by Graphify.");
    }

    function colorFor(value) {
      const [border, background] = palette[hash(value) % palette.length];
      return {
        border,
        background,
        highlight: { border: "#f8fafc", background },
        hover: { border, background }
      };
    }

    function edgeColor(edge) {
      return relationPalette[hash(edge.relation) % relationPalette.length];
    }

    function activeProfile() {
      return PERFORMANCE_PROFILES[activeProfileId] || PERFORMANCE_PROFILES["world-orbit"];
    }

    function isFullGraphProfile(profile = activeProfile()) {
      return profile.label === "world-orbit";
    }

    function isSettlingFullGraph() {
      return isFullGraphProfile() && physicsRunning && physicsState === "settling";
    }

    function profileForVisible(visibleCount) {
      if (neighborhoodRoot || visibleCount <= 120) return "neighborhood";
      if (visibleCount > 1500) return "world-orbit";
      return "focused";
    }

    function updatePerformanceHud() {
      const profile = activeProfile();
      elements.profileMetric.textContent = profile.label;
      const frameMetric = physicsRunning ? `${Math.round(lastFrameMs)}ms` : "idle";
      elements.renderMetric.textContent = `${Math.round(lastRenderMs)}ms / ${frameMetric}`;
      elements.physicsMetric.textContent = physicsState;
      elements.physics.textContent = "Reflow";
      if (elements.stage) {
        elements.stage.dataset.flow = physicsRunning ? "settling" : physicsState;
      }
    }

    function profileOptions() {
      const profile = activeProfile();
      const settling = isSettlingFullGraph();
      const hover = settling && profile.settlingHover !== undefined ? profile.settlingHover : profile.hover;
      const edgeSmooth = settling && profile.settlingEdgeSmooth !== undefined ? profile.settlingEdgeSmooth : profile.edgeSmooth;
      const nodeShadow = settling && profile.settlingNodeShadow !== undefined ? profile.settlingNodeShadow : profile.nodeShadow;
      return {
        nodes: {
          shape: "dot",
          scaling: { min: 5, max: profile.nodeValueMax },
          shadow: nodeShadow
            ? { enabled: true, color: "rgba(0, 0, 0, 0.34)", size: 9, x: 0, y: 3 }
            : false
        },
        edges: {
          arrows: { to: { enabled: false } },
          selectionWidth: 1.15,
          hoverWidth: hover ? 1.2 : 0,
          chosen: {
            edge(values) {
              values.width = Math.min(Number(values.width) || 1, 1.1);
              values.color = "rgba(103, 232, 249, 0.72)";
            }
          },
          smooth: edgeSmooth
        },
        interaction: {
          hover,
          tooltipDelay: profile.tooltipDelay,
          hideEdgesOnDrag: true,
          multiselect: false,
          keyboard: true
        },
        physics: {
          ...profile.physics,
          enabled: physicsRunning
        },
        layout: profile.layout || {}
      };
    }

    function nodeMatchesSearch(node, query) {
      if (!query) return true;
      return [node.label, node.normLabel, node.id, node.sourceFile, node.fileType, node.community]
        .some((value) => normalize(value).includes(query));
    }

    function communityAnchor(communityKey) {
      const rank = communityRank.has(communityKey)
        ? communityRank.get(communityKey)
        : hash(communityKey) % Math.max(1, Number(STATS.communityCount || 1));
      const total = Math.max(1, Number(STATS.communityCount || communityRank.size || 1));
      const normalized = total === 1 ? 0.5 : (rank + 0.5) / total;
      const y = 1 - 2 * normalized;
      const radius = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = rank * GOLDEN_ANGLE + (hash(communityKey) % 360) * (Math.PI / 1800);
      const z = Math.sin(theta) * radius;
      const x = Math.cos(theta) * radius;
      const worldRadius = 5400 + Math.sqrt(Number(STATS.nodeCount || RAW_NODES.length || 1)) * 20;
      return {
        x: x * worldRadius * (1 + z * 0.08),
        y: y * worldRadius * 0.76 + z * worldRadius * 0.12,
        z
      };
    }

    function seedPosition(node) {
      const communityKey = String(node.community || "unclustered");
      const clusterCount = Math.max(1, Number(communitySize.get(communityKey) || 1));
      const localIndex = Number(nodeCommunityIndex.get(node.id) || 0);
      const anchor = communityAnchor(communityKey);
      const spiralAngle = localIndex * GOLDEN_ANGLE + (hash(node.id) % 360) * (Math.PI / 1800);
      const localRadius = (24 + Math.sqrt(localIndex + 0.5) * 31) * (0.9 + Math.min(0.38, Math.sqrt(clusterCount) / 72));
      const depthScale = 1 + anchor.z * 0.08;
      const seedScale = Number(activeProfile().seedShellScale || 1);
      return {
        x: anchor.x * seedScale + Math.cos(spiralAngle) * localRadius * depthScale * seedScale,
        y: anchor.y * seedScale + Math.sin(spiralAngle) * localRadius * 0.82 * seedScale
      };
    }

    function shouldSeedLayout() {
      return Boolean(activeProfile().seedLayout && currentVisibleIds.size > 1500);
    }

    function decorateNode(node, { seed = false } = {}) {
      const profile = activeProfile();
      const label = labelsEnabled ? nodeDisplayLabel(node) : "";
      const tooltipEnabled = !(isSettlingFullGraph() && profile.disableTooltipsWhileSettling);
      const decoration = {
        id: node.id,
        label,
        title: tooltipEnabled ? nodeTooltip(node) : "",
        group: node.community,
        value: Math.max(5, Math.min(profile.nodeValueMax, node.value || 5)),
        mass: Math.max(1, Math.min(4.5, 1 + (node.degree || 0) / profile.massScale)),
        shape: "dot",
        borderWidth: selectedId === node.id ? 3 : 1.4,
        color: colorFor(node.community || node.fileType),
        font: {
          size: labelsEnabled ? 13 : 0,
          color: "#e5f7ff",
          face: "Inter, ui-sans-serif, system-ui",
          strokeWidth: labelsEnabled ? 3 : 0,
          strokeColor: "#06070b"
        }
      };
      if (seed) {
        const seeded = seedPosition(node);
        decoration.x = seeded.x;
        decoration.y = seeded.y;
      }
      return decoration;
    }

    function decorateEdge(edge) {
      const profile = activeProfile();
      const tooltipEnabled = !(isSettlingFullGraph() && profile.disableTooltipsWhileSettling);
      const edgeSmooth = isSettlingFullGraph() && profile.settlingEdgeSmooth !== undefined ? profile.settlingEdgeSmooth : profile.edgeSmooth;
      return {
        id: edge.id,
        from: edge.from,
        to: edge.to,
        title: tooltipEnabled ? edgeTooltip(edge) : "",
        width: Math.max(0.4, Math.min(profile.edgeWidthMax, Number(edge.weight) || 1)),
        color: {
          color: edgeColor(edge),
          highlight: "#67e8f9",
          hover: "#86efac"
        },
        smooth: edgeSmooth
      };
    }

    function visibleNodeSet() {
      const query = normalize(elements.search.value);
      const community = elements.community.value;
      const minDegree = Number(elements.degree.value || 0);
      let allowedByNeighborhood = null;
      if (neighborhoodRoot && neighbors.has(neighborhoodRoot)) {
        allowedByNeighborhood = new Set([neighborhoodRoot, ...neighbors.get(neighborhoodRoot)]);
      }
      const visible = new Set();
      for (const node of RAW_NODES) {
        if (allowedByNeighborhood) {
          if (allowedByNeighborhood.has(node.id)) visible.add(node.id);
          continue;
        }
        if (community !== "all" && node.community !== community) continue;
        if ((node.degree || 0) < minDegree) continue;
        if (!nodeMatchesSearch(node, query)) continue;
        visible.add(node.id);
      }
      return visible;
    }

    const nodes = new vis.DataSet();
    const edges = new vis.DataSet();
    const options = {
      autoResize: true,
      ...profileOptions()
    };

    let network = null;

    function runningPhysicsState() {
      return activeProfile().freezeOnStabilized ? "settling" : "running";
    }

    function clearPhysicsTimers() {
      if (autoFreezeTimer) {
        window.clearTimeout(autoFreezeTimer);
        autoFreezeTimer = null;
      }
      if (settleWatchTimer) {
        window.clearTimeout(settleWatchTimer);
        settleWatchTimer = null;
      }
    }

    function applyProfileOptions() {
      if (network) network.setOptions(profileOptions());
      updatePerformanceHud();
    }

    function updateVisibleNodeDecorations() {
      const updates = [];
      for (const nodeId of currentVisibleIds) {
        if (!nodes.get(nodeId)) continue;
        const node = byId.get(nodeId);
        if (node) updates.push(decorateNode(node));
      }
      if (updates.length) nodes.update(updates);
    }

    function updateVisibleEdgeDecorations() {
      const updates = RAW_EDGES
        .filter((edge) => currentVisibleIds.has(edge.from) && currentVisibleIds.has(edge.to) && edges.get(edge.id))
        .map(decorateEdge);
      if (updates.length) edges.update(updates);
    }

    function restorePolishedVisibleGraph() {
      applyProfileOptions();
      updateVisibleNodeDecorations();
      updateVisibleEdgeDecorations();
      updatePerformanceHud();
    }

    function frameFullGraphAfterSettle() {
      if (!network || !isFullGraphProfile()) return;
      window.setTimeout(() => {
        if (!network || physicsRunning || !isFullGraphProfile()) return;
        network.fit({ animation: { duration: 760, easingFunction: "easeInOutQuad" } });
        window.setTimeout(() => {
          if (!network || physicsRunning || !isFullGraphProfile() || typeof network.getScale !== "function" || typeof network.moveTo !== "function") return;
          const nextScale = network.getScale() * Number(activeProfile().settledScale || 1);
          network.moveTo({ scale: nextScale, animation: { duration: 420, easingFunction: "easeInOutQuad" } });
        }, 820);
      }, 80);
    }

    function settleSampleIds() {
      return RAW_NODES
        .filter((node) => currentVisibleIds.has(node.id))
        .slice(0, 640)
        .map((node) => node.id);
    }

    function readSettleMotion() {
      if (!network) return null;
      const ids = settleSampleIds();
      if (ids.length === 0) return null;
      const positions = network.getPositions(ids);
      if (!lastSettleSample) {
        lastSettleSample = positions;
        return null;
      }
      const distances = [];
      for (const id of ids) {
        const previous = lastSettleSample[id];
        const current = positions[id];
        if (!previous || !current) continue;
        const dx = current.x - previous.x;
        const dy = current.y - previous.y;
        distances.push(Math.sqrt(dx * dx + dy * dy));
      }
      lastSettleSample = positions;
      if (distances.length === 0) return null;
      distances.sort((a, b) => a - b);
      const total = distances.reduce((sum, value) => sum + value, 0);
      const p90 = distances[Math.min(distances.length - 1, Math.floor(distances.length * 0.9))];
      return {
        average: total / distances.length,
        p90
      };
    }

    function startSettleMonitor() {
      if (!network || !isFullGraphProfile()) return;
      settleStartedAt = performance.now();
      lastSettleSample = null;
      stableSettleSamples = 0;
      const tick = () => {
        if (!physicsRunning || !isFullGraphProfile()) return;
        const elapsed = performance.now() - settleStartedAt;
        const motion = readSettleMotion();
        if (motion && elapsed > 6500 && motion.average < 1.05 && motion.p90 < 3.8) {
          stableSettleSamples += 1;
        } else if (motion) {
          stableSettleSamples = 0;
        }
        if (stableSettleSamples >= 3) {
          completePhysics("flowing");
          return;
        }
        settleWatchTimer = window.setTimeout(tick, 900);
      };
      settleWatchTimer = window.setTimeout(tick, 900);
    }

    function completePhysics(state = "flowing") {
      if (!network) return;
      if (!physicsRunning && physicsState === state) return;
      clearPhysicsTimers();
      physicsRunning = false;
      physicsState = state;
      restorePolishedVisibleGraph();
      frameFullGraphAfterSettle();
      updatePerformanceHud();
    }

    function startPhysics() {
      if (!network) return;
      clearPhysicsTimers();
      physicsRunning = true;
      physicsState = runningPhysicsState();
      lastFrameAt = performance.now();
      settleStartedAt = performance.now();
      lastSettleSample = null;
      stableSettleSamples = 0;
      fullGraphStabilizeRequested = false;
      applyProfileOptions();
      if (typeof network.startSimulation === "function") {
        network.startSimulation();
      }
      const profile = activeProfile();
      if (isFullGraphProfile() && typeof network.stabilize === "function") {
        const warmupMs = profile.gravityWarmupMs || profile.stabilizeAfterMs || 0;
        autoFreezeTimer = window.setTimeout(() => {
          if (!physicsRunning || !isFullGraphProfile()) return;
          fullGraphStabilizeRequested = true;
          network.stabilize(profile.physics.stabilization.iterations || 220);
        }, warmupMs);
      } else if (profile.autoFreezeMs) {
        const freezeMs = profile.autoFreezeMs;
        autoFreezeTimer = window.setTimeout(() => completePhysics("settled"), freezeMs);
      } else if (profile.settleSafetyMs) {
        autoFreezeTimer = window.setTimeout(() => completePhysics("settled"), profile.settleSafetyMs);
      } else if (isFullGraphProfile()) {
        startSettleMonitor();
      }
      updatePerformanceHud();
    }

    function handlePhysicsStabilized() {
      if (!physicsRunning) return;
      if (isFullGraphProfile()) {
        if (!fullGraphStabilizeRequested) {
          physicsState = "settling";
          updatePerformanceHud();
          window.setTimeout(() => {
            if (network && physicsRunning && isFullGraphProfile() && !fullGraphStabilizeRequested && typeof network.startSimulation === "function") {
              network.startSimulation();
            }
          }, 120);
          return;
        }
      }
      if (activeProfile().freezeOnStabilized === false) {
        physicsState = "stabilized";
        updatePerformanceHud();
        return;
      }
      completePhysics(isFullGraphProfile() ? "flowing" : "settled");
    }

    function scheduleRefresh(options = {}, delay = 90) {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        refreshGraph(options);
      }, delay);
    }

    function updateNodeDecoration(nodeId) {
      if (!nodeId || !currentVisibleIds.has(nodeId) || !nodes.get(nodeId)) return;
      const node = byId.get(nodeId);
      if (node) nodes.update(decorateNode(node));
    }

    function selectNode(nodeId, { syncNetwork = false } = {}) {
      const nextId = nodeId && byId.has(nodeId) && currentVisibleIds.has(nodeId) ? nodeId : null;
      const previousId = selectedId;
      selectedId = nextId;
      if (previousId !== selectedId) {
        updateNodeDecoration(previousId);
        updateNodeDecoration(selectedId);
      }
      renderInspector(selectedId ? byId.get(selectedId) : null);
      if (syncNetwork && network) {
        if (selectedId) network.selectNodes([selectedId], false);
        else network.unselectAll();
      }
    }

    function clearSelection({ syncNetwork = false } = {}) {
      selectNode(null, { syncNetwork });
    }

    function refreshGraph({ fit = false } = {}) {
      const renderStart = performance.now();
      currentVisibleIds = visibleNodeSet();
      const visibleNodes = RAW_NODES.filter((node) => currentVisibleIds.has(node.id));
      const visibleEdges = RAW_EDGES.filter((edge) => currentVisibleIds.has(edge.from) && currentVisibleIds.has(edge.to));
      activeProfileId = profileForVisible(visibleNodes.length);
      physicsRunning = true;
      physicsState = runningPhysicsState();
      applyProfileOptions();

      nodes.clear();
      edges.clear();
      const seedLayout = shouldSeedLayout();
      nodes.add(visibleNodes.map((node) => decorateNode(node, { seed: seedLayout })));
      edges.add(visibleEdges.map(decorateEdge));

      elements.visibleNodes.textContent = formatNumber(visibleNodes.length);
      elements.visibleEdges.textContent = formatNumber(visibleEdges.length);
      elements.totalNodes.textContent = formatNumber(STATS.nodeCount);
      elements.totalCommunities.textContent = formatNumber(STATS.communityCount);
      elements.subtitle.textContent = `${formatNumber(visibleNodes.length)} of ${formatNumber(STATS.nodeCount)} nodes visible`;
      lastRenderMs = performance.now() - renderStart;

      if (selectedId && !currentVisibleIds.has(selectedId)) {
        selectedId = null;
        if (network) network.unselectAll();
      }
      renderInspector(selectedId ? byId.get(selectedId) : null);
      if (network && selectedId) {
        network.selectNodes([selectedId], false);
      }

      if (network && fit) {
        network.fit({ animation: { duration: 620, easingFunction: "easeInOutQuad" } });
      }
      if (network) {
        startPhysics();
      }
      updatePerformanceHud();
    }

    function updateFrameTiming() {
      const now = performance.now();
      if (lastFrameAt > 0) {
        lastFrameMs = now - lastFrameAt;
      }
      lastFrameAt = now;
      if (now - lastHudPaintAt > 600) {
        lastHudPaintAt = now;
        updatePerformanceHud();
      }
    }

    function sortedNeighbors(nodeId) {
      return [...(neighbors.get(nodeId) || [])]
        .map((id) => byId.get(id))
        .filter(Boolean)
        .sort((a, b) => (b.degree || 0) - (a.degree || 0) || String(a.label).localeCompare(String(b.label)));
    }

    function renderInspector(node) {
      if (!node) {
        elements.inspector.innerHTML = `
          <div class="empty-state">
            <div>
              <h1 class="panel-title">Select a node</h1>
              <div class="panel-subtitle">Drag, zoom, search, focus a community, or open a neighborhood from the toolbar.</div>
            </div>
          </div>`;
        return;
      }

      const neighborRows = sortedNeighbors(node.id).slice(0, 16).map((neighbor) => {
        const relations = (edgeLookup.get(`${node.id}->${neighbor.id}`) || [])
          .slice(0, 3)
          .map((edge) => edge.relation)
          .join(", ");
        return `
          <button class="node-link" type="button" data-node-id="${escapeHtml(neighbor.id)}">
            ${escapeHtml(neighbor.label)}
            <span>${escapeHtml(relations || neighbor.fileType || neighbor.community)}</span>
          </button>`;
      }).join("");
      const sourceAction = node.openPath ? `
        <div class="actions">
          <button class="button inspector-action primary" type="button" data-open-source-path="${escapeHtml(node.openPath)}" data-open-source-label="${escapeHtml(node.label)}">
            Open Source
          </button>
        </div>` : "";

      elements.inspector.innerHTML = `
        <h1 class="panel-title">${escapeHtml(node.label)}</h1>
        <div class="panel-subtitle">${escapeHtml(node.sourceFile || node.id)}${node.sourceLocation ? ` - ${escapeHtml(node.sourceLocation)}` : ""}</div>
        <div class="chips">
          <span class="chip">${escapeHtml(node.fileType)}</span>
          <span class="chip">community ${escapeHtml(node.community)}</span>
          <span class="chip">${formatNumber(node.degree)} links</span>
        </div>
        ${sourceAction}
        <div class="section">
          <h2>Node</h2>
          <dl class="kv">
            <div><dt>ID</dt><dd>${escapeHtml(node.id)}</dd></div>
            <div><dt>File</dt><dd>${escapeHtml(node.sourceFile || "n/a")}</dd></div>
            <div><dt>Location</dt><dd>${escapeHtml(node.sourceLocation || "n/a")}</dd></div>
            <div><dt>Type</dt><dd>${escapeHtml(node.fileType)}</dd></div>
          </dl>
        </div>
        <div class="section">
          <h2>Neighbors</h2>
          <div class="list">${neighborRows || '<div class="panel-subtitle">No visible neighbors.</div>'}</div>
        </div>
        <div class="section">
          <h2>Top Relations</h2>
          <div class="chips">
            ${STATS.relations.slice(0, 8).map((item) => `<span class="chip">${escapeHtml(item.label)} ${formatNumber(item.count)}</span>`).join("")}
          </div>
        </div>`;
    }

    function focusNode(nodeId, { neighborhood = false } = {}) {
      if (!nodeId || !byId.has(nodeId)) return;
      const hiddenByFilters = !currentVisibleIds.has(nodeId);
      if (hiddenByFilters && !neighborhood) {
        elements.search.value = "";
        elements.community.value = "all";
        elements.degree.value = "0";
        elements.degreeValue.textContent = "0+";
        neighborhoodRoot = null;
      }
      if (neighborhood) {
        neighborhoodRoot = nodeId;
      }
      const needsRefresh = neighborhood || hiddenByFilters;
      if (needsRefresh) {
        selectedId = nodeId;
        refreshGraph({ fit: neighborhood });
      }
      selectNode(nodeId, { syncNetwork: true });
      if (network) network.focus(nodeId, {
        scale: 1.25,
        animation: { duration: 700, easingFunction: "easeInOutQuad" }
      });
    }

    function bestSearchMatch() {
      const query = normalize(elements.search.value);
      if (!query) return null;
      const candidates = RAW_NODES
        .filter((node) => nodeMatchesSearch(node, query))
        .sort((a, b) => {
          const exactA = normalize(a.label) === query || normalize(a.id) === query ? 1 : 0;
          const exactB = normalize(b.label) === query || normalize(b.id) === query ? 1 : 0;
          return exactB - exactA || (b.degree || 0) - (a.degree || 0);
        });
      return candidates[0] || null;
    }

    function resetView() {
      elements.search.value = "";
      elements.community.value = "all";
      elements.degree.value = "0";
      elements.degreeValue.textContent = "0+";
      neighborhoodRoot = null;
      clearSelection({ syncNetwork: true });
      refreshGraph({ fit: true });
    }

    function populateControls() {
      const degreeMax = Math.max(0, Math.min(40, Number(STATS.maxDegree || 0)));
      elements.degree.max = String(degreeMax);
      elements.degree.disabled = degreeMax === 0;

      const communityOptions = [
        `<option value="all">All communities</option>`,
        ...STATS.communities.map((community) => (
          `<option value="${escapeHtml(community.id)}">${escapeHtml(community.label)} (${formatNumber(community.count)})</option>`
        ))
      ];
      elements.community.innerHTML = communityOptions.join("");

      elements.nodeList.innerHTML = RAW_NODES
        .slice()
        .sort((a, b) => (b.degree || 0) - (a.degree || 0))
        .slice(0, 500)
        .map((node) => `<option value="${escapeHtml(node.label)}"></option>`)
        .join("");
    }

    function boot() {
      if (!window.vis) {
        elements.network.innerHTML = '<div class="empty-state"><div><h1 class="panel-title">Graph renderer unavailable</h1><div class="panel-subtitle">vis-network could not load in this session.</div></div></div>';
        return;
      }

      populateControls();
      network = new vis.Network(elements.network, { nodes, edges }, options);
      network.on("selectNode", (event) => {
        selectNode(event.nodes[0] || null);
      });
      network.on("deselectNode", () => {
        clearSelection();
      });
      network.on("doubleClick", (event) => {
        const nodeId = event.nodes && event.nodes[0];
        if (nodeId) focusNode(nodeId, { neighborhood: true });
      });
      network.on("afterDrawing", updateFrameTiming);
      network.on("stabilizationIterationsDone", handlePhysicsStabilized);
      network.on("stabilized", handlePhysicsStabilized);
      refreshGraph({ fit: true });

      elements.search.addEventListener("input", () => {
        neighborhoodRoot = null;
        scheduleRefresh({ fit: false }, 120);
      });
      elements.search.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          if (refreshTimer) {
            window.clearTimeout(refreshTimer);
            refreshTimer = null;
            refreshGraph({ fit: false });
          }
          const match = bestSearchMatch();
          if (match) focusNode(match.id);
        }
      });
      elements.community.addEventListener("change", () => {
        neighborhoodRoot = null;
        refreshGraph({ fit: true });
      });
      elements.degree.addEventListener("input", () => {
        elements.degreeValue.textContent = `${elements.degree.value}+`;
        scheduleRefresh({ fit: false }, 90);
      });
      elements.focus.addEventListener("click", () => {
        const match = bestSearchMatch();
        if (match) focusNode(match.id);
      });
      elements.neighborhood.addEventListener("click", () => {
        if (selectedId) {
          focusNode(selectedId, { neighborhood: true });
          return;
        }
        const match = bestSearchMatch();
        if (match) focusNode(match.id, { neighborhood: true });
      });
      elements.labels.addEventListener("click", () => {
        labelsEnabled = !labelsEnabled;
        elements.labels.textContent = labelsEnabled ? "Hide Labels" : "Labels";
        updateVisibleNodeDecorations();
        updatePerformanceHud();
      });
      elements.physics.addEventListener("click", () => {
        startPhysics();
      });
      elements.fit.addEventListener("click", () => network.fit({ animation: { duration: 620, easingFunction: "easeInOutQuad" } }));
      elements.reset.addEventListener("click", resetView);
      elements.inspector.addEventListener("click", (event) => {
        const button = event.target instanceof Element ? event.target.closest("[data-node-id]") : null;
        if (button) {
          focusNode(button.getAttribute("data-node-id"));
          return;
        }
        const sourceButton = event.target instanceof Element ? event.target.closest("[data-open-source-path]") : null;
        if (sourceButton) {
          window.parent.postMessage({
            type: "graphify:open-path",
            path: sourceButton.getAttribute("data-open-source-path"),
            label: sourceButton.getAttribute("data-open-source-label") || "Graphify source"
          }, "*");
        }
      });
    }

    boot();
  </script>
</body>
</html>
"""
    return (
        html.replace("__GRAPHIFY_NODES__", graphify_safe_json(data["nodes"]))
        .replace("__GRAPHIFY_EDGES__", graphify_safe_json(data["edges"]))
        .replace("__GRAPHIFY_STATS__", graphify_safe_json(data["stats"]))
    )


def graphify_status_payload() -> dict[str, Any]:
    required_paths = graphify_required_paths()
    output_dir = GRAPHIFY_OUT_ROOT
    warnings: list[str] = []
    available = True

    for path in required_paths.values():
        if not path.exists():
            available = False
            warnings.append(f"Missing {graphify_display_path(path)}. Run `npm run graph:build`.")

    node_count: int | None = None
    edge_count: int | None = None
    community_count: int | None = None
    graph_path = required_paths["graphJsonPath"]
    if graph_path.exists():
        try:
            payload = json.loads(graph_path.read_text(encoding="utf-8"))
            if isinstance(payload, dict):
                nodes = graphify_collection(payload, "nodes")
                edges = graphify_collection(payload, "edges", "links")
                node_count = len(nodes)
                edge_count = len(edges)
                community_count = graphify_community_count(payload, nodes)
            else:
                warnings.append("graphify-out/graph.json is not a JSON object.")
        except (OSError, json.JSONDecodeError) as error:
            warnings.append(f"Could not read graphify-out/graph.json: {error}")

    built_commit = graphify_built_commit(required_paths["reportPath"])
    current_commit = graphify_git_value(["rev-parse", "--short=8", "HEAD"])
    has_uncommitted_changes = graphify_has_uncommitted_changes()
    changed_paths_since_built = graphify_changed_paths_since_built(built_commit, current_commit)
    freshness = graphify_freshness(
        available,
        built_commit,
        current_commit,
        has_uncommitted_changes,
        changed_paths_since_built,
    )
    recommended_command = "npm run graph:build" if freshness in {"missing", "stale", "dirty"} else "npm run graph:check"

    return {
        "available": available,
        "updatedAt": graphify_mtime_ms(list(required_paths.values())),
        "outputDir": str(output_dir),
        "reportPath": str(required_paths["reportPath"]),
        "graphJsonPath": str(required_paths["graphJsonPath"]),
        "htmlPath": str(required_paths["htmlPath"]),
        "explorerUrl": "/api/hyperliquid/memory/graphify-explorer",
        "htmlUrl": "/api/hyperliquid/memory/graphify-html",
        "nodeCount": node_count,
        "edgeCount": edge_count,
        "communityCount": community_count,
        "builtCommit": built_commit,
        "currentCommit": current_commit,
        "freshness": freshness,
        "hasUncommittedChanges": has_uncommitted_changes,
        "recommendedCommand": recommended_command,
        "warnings": warnings,
    }


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
                validation_path = latest_strategy_validation_path(
                    strategy_id=strategy_id,
                    report_path=path,
                    report_artifact_id=payload.get("artifact_id"),
                )
                validation_payload = safe_load_json(validation_path) if validation_path else None
                row["checklist"]["backtestExists"] = True
                row["latestBacktestSummary"] = summary
                row["latestBacktestConfig"] = payload.get("config") or {}
                row["robustAssessment"] = payload.get("robust_assessment")
                row["doublingEstimate"] = build_doubling_estimate(
                    payload,
                    report_path=path,
                    validation_payload=validation_payload,
                )
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

    for strategy_id, (path, payload) in latest_artifacts_by_type(AUDITS_ROOT, "doubling_stability_audit").items():
        audit = payload.get("audit") if isinstance(payload.get("audit"), dict) else payload
        row = get_row(strategy_id)
        add_source(row, "doubling_stability_audit")
        row["latestArtifactPaths"]["doublingStability"] = str(path)
        generated_at = parse_time_ms(payload.get("generated_at")) or int(path.stat().st_mtime * 1000)
        row["doublingStability"] = {
            "status": audit.get("status"),
            "artifactId": payload.get("artifact_id"),
            "reportArtifactId": payload.get("report_artifact_id"),
            "validationArtifactId": payload.get("validation_artifact_id"),
            "positiveSliceRatioPct": audit.get("positiveSliceRatioPct"),
            "largestPositiveSlicePnlSharePct": audit.get("largestPositiveSlicePnlSharePct"),
            "activeSliceCount": audit.get("activeSliceCount"),
            "sliceCount": audit.get("sliceCount"),
            "blockers": audit.get("blockers") or [],
        }
        add_timeline(
            row,
            {
                "id": f"doubling-stability:{strategy_id}:{generated_at}",
                "type": "doubling_stability_audit",
                "source": "json_artifact",
                "timestampMs": generated_at,
                "title": f"Doubling stability {audit.get('status') or 'unknown'}",
                "subtitle": ", ".join(audit.get("blockers") or []) or audit.get("interpretation") or "stability audit recorded",
                "status": audit.get("status") or "unknown",
                "path": str(path),
            },
        )

    for strategy_id, (path, payload) in latest_artifacts_by_type(AUDITS_ROOT, "btc_failed_impulse_variant_optimizer").items():
        top = payload.get("topVariant") if isinstance(payload.get("topVariant"), dict) else {}
        row = get_row(strategy_id)
        add_source(row, "btc_variant_optimizer")
        row["latestArtifactPaths"]["btcOptimization"] = str(path)
        generated_at = parse_time_ms(payload.get("generated_at")) or int(path.stat().st_mtime * 1000)
        row["btcOptimization"] = {
            "status": payload.get("status"),
            "artifactId": payload.get("artifact_id"),
            "variantCount": payload.get("variantCount"),
            "stableCandidateCount": payload.get("stableCandidateCount"),
            "fragileCandidateCount": payload.get("fragileCandidateCount"),
            "topVariantId": top.get("variantId"),
            "topReviewStatus": top.get("reviewStatus"),
            "topProjectedDaysToDouble": top.get("projectedDaysToDouble"),
            "topReturnPct": top.get("returnPct"),
            "topTotalTrades": top.get("totalTrades"),
            "topStabilityStatus": top.get("stabilityStatus"),
            "topStabilityBlockers": top.get("stabilityBlockers") or [],
            "topLargestPositiveSlicePnlSharePct": top.get("largestPositiveSlicePnlSharePct"),
        }
        add_timeline(
            row,
            {
                "id": f"btc-optimizer:{strategy_id}:{generated_at}",
                "type": "btc_variant_optimizer",
                "source": "json_artifact",
                "timestampMs": generated_at,
                "title": f"BTC optimizer {payload.get('status') or 'unknown'}",
                "subtitle": top.get("variantId") or "variant optimizer recorded",
                "status": payload.get("status") or "unknown",
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
        "doublingEstimate": row.get("doublingEstimate"),
        "doublingStability": row.get("doublingStability"),
        "btcOptimization": row.get("btcOptimization"),
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


def resolve_existing_data_path(path_value: str | None) -> Path | None:
    if not path_value:
        return None
    path = Path(path_value).expanduser()
    candidates = [path] if path.is_absolute() else [path, REPO_ROOT / path, BACKEND_ROOT / path]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def lab_chart_unavailable(reason: str, *, dataset: dict[str, Any] | None = None, interval: str = "1d") -> dict[str, Any]:
    return {
        "available": False,
        "reason": reason,
        "interval": interval,
        "source": (dataset or {}).get("source") or (dataset or {}).get("type"),
        "datasetPath": (dataset or {}).get("path"),
        "candles": [],
        "markers": [],
    }


def bounded_lab_candles(candles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if len(candles) <= MAX_STRATEGY_LAB_CANDLES:
        return candles
    return candles[-MAX_STRATEGY_LAB_CANDLES:]


def normalize_lab_candle(
    *,
    timestamp: Any,
    open_value: Any,
    high_value: Any,
    low_value: Any,
    close_value: Any,
    volume_value: Any = None,
) -> dict[str, Any] | None:
    time_ms = parse_time_ms(timestamp)
    open_price = to_float(open_value)
    high_price = to_float(high_value)
    low_price = to_float(low_value)
    close_price = to_float(close_value)
    if time_ms is None or open_price is None or high_price is None or low_price is None or close_price is None:
        return None
    return {
        "time": time_ms,
        "open": open_price,
        "high": high_price,
        "low": low_price,
        "close": close_price,
        "volume": to_float(volume_value),
    }


def lab_candles_from_btc_daily(path: Path) -> list[dict[str, Any]]:
    rows, _metadata = load_btc_daily_history(path, BacktestConfig())
    candles: list[dict[str, Any]] = []
    for row in rows:
        close = row.get("close")
        candle = normalize_lab_candle(
            timestamp=row.get("date") or row.get("timestamp") or row.get("time"),
            open_value=row.get("open", close),
            high_value=row.get("high", close),
            low_value=row.get("low", close),
            close_value=close,
            volume_value=row.get("volume"),
        )
        if candle:
            candles.append(candle)
    return candles


def lab_candles_from_csv(path: Path) -> list[dict[str, Any]]:
    return [
        {
            "time": candle.epoch_ms,
            "open": candle.open,
            "high": candle.high,
            "low": candle.low,
            "close": candle.close,
            "volume": candle.volume,
        }
        for candle in canonicalize_ohlcv_csv(path)
    ]


def build_strategy_lab_chart(report_payload: dict[str, Any] | None, *, interval: str) -> dict[str, Any]:
    if not report_payload:
        return lab_chart_unavailable("No backtest artifact is available for chart review.", interval=interval)

    dataset = report_payload.get("dataset") if isinstance(report_payload.get("dataset"), dict) else {}
    dataset_path_value = str(dataset.get("path") or "").strip()
    if not dataset_path_value:
        return lab_chart_unavailable("Backtest artifact does not include a dataset path.", dataset=dataset, interval=interval)

    dataset_path = resolve_existing_data_path(dataset_path_value)
    if dataset_path is None:
        return lab_chart_unavailable(f"Dataset file not found: {dataset_path_value}", dataset=dataset, interval=interval)

    try:
        if dataset_path.suffix.lower() == ".csv":
            candles = lab_candles_from_csv(dataset_path)
            chart_interval = str(dataset.get("interval") or interval)
        elif dataset_path.suffix.lower() == ".json" and (
            dataset.get("type") == "btc_usd_daily" or dataset.get("source_symbol") in {"BTC-USD", "BTCUSDT"}
        ):
            candles = lab_candles_from_btc_daily(dataset_path)
            chart_interval = "1d"
        else:
            return lab_chart_unavailable(
                f"Unsupported strategy lab dataset format: {dataset_path.suffix or dataset.get('type') or 'unknown'}",
                dataset=dataset,
                interval=interval,
            )
    except Exception as exc:
        return lab_chart_unavailable(f"Could not load chart candles: {exc}", dataset=dataset, interval=interval)

    if not candles:
        return lab_chart_unavailable("Dataset loaded but produced no chart candles.", dataset=dataset, interval=interval)

    return {
        "available": True,
        "reason": None,
        "interval": chart_interval,
        "source": dataset.get("source") or dataset.get("type") or dataset_path.suffix.lower().lstrip("."),
        "datasetPath": str(dataset_path),
        "candles": bounded_lab_candles(candles),
        "markers": [],
    }


def build_strategy_lab_trade_markers(trades: list[dict[str, Any]]) -> list[dict[str, Any]]:
    markers: list[dict[str, Any]] = []
    for index, trade in enumerate(trades):
        side = str(trade.get("side") or "").lower()
        is_short = side == "short"
        entry_time = parse_time_ms(trade.get("entry_timestamp") or trade.get("entry_time"))
        exit_time = parse_time_ms(trade.get("exit_timestamp") or trade.get("exit_time"))
        entry_price = to_float(trade.get("entry_price"))
        exit_price = to_float(trade.get("exit_price"))
        pnl = to_float(trade.get("net_pnl") or trade.get("realizedPnlUsd") or trade.get("netPnlUsd"))
        trade_id = str(trade.get("id") or f"trade-{index + 1}")
        if entry_time is not None:
            markers.append(
                {
                    "id": f"{trade_id}:entry",
                    "tradeId": trade_id,
                    "kind": "entry",
                    "time": entry_time,
                    "price": entry_price,
                    "side": side or "n/a",
                    "pnlUsd": pnl,
                    "text": f"{'Short' if is_short else 'Long'} entry",
                    "color": "#f97316" if is_short else "#22c55e",
                    "shape": "arrowDown" if is_short else "arrowUp",
                    "position": "aboveBar" if is_short else "belowBar",
                }
            )
        if exit_time is not None:
            markers.append(
                {
                    "id": f"{trade_id}:exit",
                    "tradeId": trade_id,
                    "kind": "exit",
                    "time": exit_time,
                    "price": exit_price,
                    "side": side or "n/a",
                    "pnlUsd": pnl,
                    "text": f"Exit {trade.get('exit_reason') or ''}".strip(),
                    "color": "#22c55e" if (pnl or 0.0) >= 0 else "#ef4444",
                    "shape": "circle",
                    "position": "aboveBar" if (pnl or 0.0) >= 0 else "belowBar",
                }
            )
    markers.sort(key=lambda item: int(item.get("time") or 0))
    return markers


def selected_lab_backtest_payload(normalized_strategy_id: str, artifact_id: str) -> dict[str, Any] | None:
    requested = artifact_id.strip() or "latest"
    if requested != "latest":
        return backtest_artifact_payload(normalized_strategy_id, requested)
    try:
        return latest_backtest_payload(normalized_strategy_id)
    except HTTPException as exc:
        if exc.status_code == 404:
            return None
        raise


async def strategy_lab_payload(
    strategy_id: str,
    *,
    artifact_id: str = "latest",
    interval: str = "1d",
) -> dict[str, Any]:
    normalized = normalize_strategy_id(strategy_id)
    evidence = await build_strategy_evidence(
        limit=500,
        runtime_limit=0,
        include_database=False,
        mark_paper_trades=False,
    )
    row = next(
        (
            item for item in evidence.get("strategies") or []
            if normalize_strategy_id(str(item.get("strategyId") or "")) == normalized
        ),
        None,
    )
    if row is None:
        raise HTTPException(status_code=404, detail=f"Strategy {normalized} was not found.")

    selected_artifact = selected_lab_backtest_payload(normalized, artifact_id)
    report = selected_artifact.get("report") if selected_artifact else None
    report_payload = report if isinstance(report, dict) else None
    backtest_trades = report_payload.get("trades") if report_payload else []
    if not isinstance(backtest_trades, list):
        backtest_trades = []
    chart = build_strategy_lab_chart(report_payload, interval=interval)
    chart["markers"] = build_strategy_lab_trade_markers(backtest_trades) if chart.get("available") else []
    learning = list_strategy_learning_events(strategy_id=normalized, limit=30)
    learning_events = learning.get("events") if isinstance(learning, dict) else learning
    if not isinstance(learning_events, list):
        learning_events = []
    agent_runs = list_agent_runs(strategy_id=normalized, limit=12)
    artifacts = backtest_artifact_summaries(normalized, limit=20)

    return {
        "updatedAt": int(time.time() * 1000),
        "strategyId": normalized,
        "catalogRow": strategy_catalog_card(row),
        "nextAction": row.get("nextAction") or {},
        "latestArtifactPaths": row.get("latestArtifactPaths") or {},
        "artifact": {
            "requestedArtifactId": artifact_id,
            "selectedArtifactId": (report_payload or {}).get("artifact_id"),
            "reportPath": selected_artifact.get("reportPath") if selected_artifact else None,
            "validationPath": selected_artifact.get("validationPath") if selected_artifact else None,
            "paperPath": selected_artifact.get("paperPath") if selected_artifact else None,
        },
        "artifacts": artifacts,
        "summary": (report_payload or {}).get("summary") or row.get("latestBacktestSummary") or {},
        "dataset": (report_payload or {}).get("dataset") or {},
        "config": (report_payload or {}).get("config") or {},
        "robustAssessment": (report_payload or {}).get("robust_assessment") or row.get("robustAssessment"),
        "validation": selected_artifact.get("validation") if selected_artifact else None,
        "paper": selected_artifact.get("paper") if selected_artifact else None,
        "equityCurve": (report_payload or {}).get("equity_curve") or [],
        "trades": {
            "backtest": backtest_trades,
            "paper": row.get("trades") or [],
        },
        "chart": chart,
        "timeline": row.get("timeline") or [],
        "learning": learning_events,
        "agentRuns": agent_runs,
        "errors": [] if selected_artifact else ["No backtest artifact is available yet."],
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
async def paper_trades(
    status: str = Query(default="all"),
    limit: int = Query(default=100, ge=1, le=500),
) -> dict[str, Any]:
    return {"trades": await paper_trade_payloads(limit=limit, status=status)}


@app.get("/api/hyperliquid/paper/readiness/{strategy_id}")
async def paper_readiness(
    strategy_id: str,
    limit: int = Query(default=500, ge=20, le=1000),
) -> dict[str, Any]:
    normalized = normalize_strategy_id(strategy_id)
    paper_path = latest_json(PAPER_ROOT, f"{normalized}-")
    if paper_path is None:
        raise HTTPException(status_code=404, detail=f"No paper candidate artifact found for {normalized}.")
    paper_payload = safe_load_json(paper_path)
    if not paper_payload:
        raise HTTPException(status_code=404, detail=f"Paper candidate artifact for {normalized} could not be loaded.")
    baseline = paper_payload.get("paper_baseline")
    if not isinstance(baseline, dict):
        raise HTTPException(status_code=404, detail=f"Paper candidate artifact for {normalized} does not include paper_baseline.")

    trades = paper_trade_payloads_without_mark_to_market(limit=limit)
    matching_trades = [trade for trade in trades if paper_trade_matches_baseline(trade, baseline)]
    return {
        "strategyId": normalized,
        "paperPath": str(paper_path),
        "paperArtifactId": paper_payload.get("artifact_id"),
        "paperGeneratedAt": paper_payload.get("generated_at"),
        "paperBaseline": baseline,
        "tradeMatch": baseline.get("paperTradeMatch") or {},
        "readiness": build_paper_readiness(baseline=baseline, trades=matching_trades),
    }


@app.get("/api/hyperliquid/paper/runtime/{strategy_id}/supervisor")
async def paper_runtime_supervisor_status(
    strategy_id: str,
    tail_lines: int = Query(default=20, ge=0, le=200),
) -> dict[str, Any]:
    normalized = normalize_strategy_id(strategy_id)
    return build_paper_runtime_supervisor_status(strategy_id=normalized, tail_lines=tail_lines)


@app.post("/api/hyperliquid/paper/runtime/{strategy_id}/tick")
async def paper_runtime_tick(
    strategy_id: str,
    dry_run: bool = Query(default=False),
    portfolio_value: float = Query(default=100_000.0, gt=0),
) -> dict[str, Any]:
    normalized = normalize_strategy_id(strategy_id)
    if normalized not in {"btc_failed_impulse_reversal", "btc_guarded_cycle_trend", "btc_adaptive_cycle_trend"}:
        raise HTTPException(status_code=400, detail=f"Paper runtime tick is not implemented for {normalized}.")

    await ensure_overview_data()
    open_trades = paper_trade_payloads_without_mark_to_market(limit=100, status="open")
    if normalized in {"btc_guarded_cycle_trend", "btc_adaptive_cycle_trend"}:
        definition = get_strategy_definition(normalized)
        if not definition.default_dataset:
            raise HTTPException(status_code=400, detail=f"No default dataset configured for {normalized}.")
        daily_rows, _ = load_btc_daily_history(Path(definition.default_dataset), BacktestConfig())
        if normalized == "btc_adaptive_cycle_trend":
            plan = build_btc_adaptive_cycle_trend_paper_runtime_plan(
                daily_rows=daily_rows,
                open_trades=open_trades,
                portfolio_value=portfolio_value,
            )
            setup_tags = BTC_ADAPTIVE_CYCLE_TREND_SETUP_TAGS
        else:
            plan = build_btc_guarded_cycle_trend_paper_runtime_plan(
                daily_rows=daily_rows,
                open_trades=open_trades,
                portfolio_value=portfolio_value,
            )
            setup_tags = BTC_GUARDED_CYCLE_TREND_SETUP_TAGS
    else:
        history_entries = paper_runtime_history_entries("BTC")
        plan = build_btc_failed_impulse_paper_runtime_plan(
            history_entries=history_entries,
            open_trades=open_trades,
            portfolio_value=portfolio_value,
        )
        setup_tags = BTC_FAILED_IMPULSE_SETUP_TAGS
    applied = {
        "closedTradeIds": [],
        "openedTradeId": None,
        "createdSignalId": None,
        "skippedEntryReason": "dry_run" if dry_run else None,
    }
    if not dry_run:
        applied = apply_paper_runtime_plan(plan, setup_tags=setup_tags)

    return {
        "success": True,
        "strategyId": normalized,
        "dryRun": dry_run,
        "status": plan.get("status"),
        "closedTradeIds": applied.get("closedTradeIds") or [],
        "openedTradeId": applied.get("openedTradeId"),
        "createdSignalId": applied.get("createdSignalId"),
        "skippedEntryReason": applied.get("skippedEntryReason"),
        "plan": plan,
    }


@app.get("/api/hyperliquid/strategy-audit")
async def strategy_audit(
    limit: int = 200,
    exact_db_counts: bool = False,
) -> dict[str, Any]:
    return await build_strategy_evidence(limit=limit, exact_db_counts=exact_db_counts)


def station_error(label: str, error: BaseException) -> str:
    if isinstance(error, HTTPException):
        return f"{label}: {error.detail}"
    return f"{label}: {str(error) or type(error).__name__}"


def readiness_check(
    check_id: str,
    label: str,
    status: str,
    detail: str,
    *,
    action_label: str | None = None,
    command: str | None = None,
    route: str | None = None,
    evidence_path: str | None = None,
) -> dict[str, Any]:
    return {
        "id": check_id,
        "label": label,
        "status": status,
        "detail": detail,
        "actionLabel": action_label,
        "command": command,
        "route": route,
        "evidencePath": evidence_path,
    }


def path_modified_ms(path_value: str | None) -> int | None:
    if not path_value:
        return None
    try:
        return int(Path(path_value).stat().st_mtime * 1000)
    except OSError:
        return None


def latest_global_artifact(root: Path) -> dict[str, Any] | None:
    if not root.exists():
        return None
    paths = sorted(
        (path for path in root.glob("*.json") if path.is_file()),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    if not paths:
        return None
    path = paths[0]
    payload = safe_load_json(path) or {}
    generated_ms = parse_time_ms(payload.get("generated_at")) or int(path.stat().st_mtime * 1000)
    return {
        "path": str(path),
        "generatedAt": generated_ms,
        "artifactId": payload.get("artifact_id") or path.stem,
        "strategyId": normalize_strategy_id(str(payload.get("strategy_id") or path.stem.split("-")[0])),
        "artifactType": payload.get("artifact_type"),
    }


def summarize_strategy_blockers(strategies: list[dict[str, Any]], limit: int = 5) -> list[dict[str, Any]]:
    blocked = [
        strategy for strategy in strategies
        if strategy.get("gateReasons") or strategy.get("missingAuditItems")
    ]
    blocked.sort(
        key=lambda strategy: (
            len(strategy.get("gateReasons") or []) + len(strategy.get("missingAuditItems") or []),
            strategy.get("lastActivityAt") or 0,
        ),
        reverse=True,
    )
    return [
        {
            "strategyId": strategy.get("strategyId"),
            "displayName": strategy.get("displayName"),
            "pipelineStage": strategy.get("pipelineStage"),
            "gateStatus": strategy.get("gateStatus"),
            "reasons": (strategy.get("gateReasons") or strategy.get("missingAuditItems") or [])[:4],
            "latestArtifactPaths": strategy.get("latestArtifactPaths") or {},
        }
        for strategy in blocked[:limit]
    ]


def app_readiness_payload(
    *,
    health_result: Any,
    audit_result: Any,
    supervisor_result: Any,
    learning_result: Any,
) -> dict[str, Any]:
    now_ms = int(time.time() * 1000)
    errors = [
        station_error(label, result)
        for label, result in [
            ("Gateway", health_result),
            ("Strategy audit", audit_result),
            ("Paper runtime", supervisor_result),
            ("Strategy memory", learning_result),
        ]
        if isinstance(result, BaseException)
    ]
    health_payload = None if isinstance(health_result, BaseException) else health_result
    audit_payload = None if isinstance(audit_result, BaseException) else audit_result
    supervisor_payload = None if isinstance(supervisor_result, BaseException) else supervisor_result
    learning_payload = None if isinstance(learning_result, BaseException) else learning_result
    strategies = audit_payload.get("strategies", []) if isinstance(audit_payload, dict) else []
    real_strategies = [
        strategy for strategy in strategies
        if not str(strategy.get("strategyId") or "").startswith("runtime:")
    ]
    summary = audit_payload.get("summary", {}) if isinstance(audit_payload, dict) else {}
    cache_age_ms = health_payload.get("cacheAgeMs") if isinstance(health_payload, dict) else None
    cache_fresh = bool(
        isinstance(health_payload, dict)
        and health_payload.get("ok")
        and health_payload.get("cacheWarm")
        and cache_age_ms is not None
        and cache_age_ms < 90_000
    )
    paper_health = supervisor_payload.get("healthStatus") if isinstance(supervisor_payload, dict) else "unknown"
    reviewable = int(summary.get("reviewableClosedTrades") or 0)
    review_coverage = float(summary.get("reviewCoverage") or 0.0)
    blocked_strategies = [
        strategy for strategy in real_strategies
        if strategy.get("pipelineStage") == "blocked" or strategy.get("gateReasons")
    ]
    latest_evidence = {
        "backtest": latest_global_artifact(REPORTS_ROOT),
        "validation": latest_global_artifact(VALIDATIONS_ROOT),
        "paper": latest_global_artifact(PAPER_ROOT),
        "audit": latest_global_artifact(AUDITS_ROOT),
    }
    checks = [
        readiness_check(
            "gateway_cache",
            "Gateway cache",
            "ready" if cache_fresh else "attention",
            (
                f"Cache fresh at {cache_age_ms}ms."
                if cache_fresh
                else "Gateway is reachable but the market cache is cold or stale."
            ),
            action_label="Probe gateway",
            command="npm run gateway:probe",
            route="/diagnostics",
        ),
        readiness_check(
            "strategy_evidence",
            "Strategy evidence",
            "ready" if real_strategies and summary.get("backtestTrades") else "attention",
            f"{len(real_strategies)} strategies, {summary.get('backtestTrades', 0)} backtest trades, {summary.get('paperTrades', 0)} paper trades.",
            action_label="Open pipeline",
            route="/strategies",
            evidence_path=(latest_evidence["backtest"] or {}).get("path") if latest_evidence["backtest"] else None,
        ),
        readiness_check(
            "validation_blockers",
            "Validation blockers",
            "attention" if blocked_strategies else "ready",
            f"{len(blocked_strategies)} strategies need validation or review before promotion.",
            action_label="Open audit focus",
            route="/strategy-audit",
        ),
        readiness_check(
            "paper_runtime",
            "Paper runtime",
            "ready" if paper_health == "healthy" else "attention",
            f"BTC paper supervisor is {paper_health}.",
            action_label="Open Paper Lab",
            command="npm run hf:paper:supervisor",
            route="/paper",
        ),
        readiness_check(
            "paper_review",
            "Paper review",
            "ready" if reviewable == 0 or review_coverage >= 80 else "attention",
            f"{round(review_coverage)}% review coverage across {reviewable} reviewable closed trades.",
            action_label="Review paper trades",
            route="/paper",
        ),
        readiness_check(
            "strategy_memory",
            "Strategy memory",
            "ready" if isinstance(learning_payload, dict) else "attention",
            f"{len(learning_payload.get('events', [])) if isinstance(learning_payload, dict) else 0} recent learning events available.",
            action_label="Open Memory",
            route="/memory",
        ),
        readiness_check(
            "live_execution_lock",
            "Live execution lock",
            "ready",
            "Live Trading remains monitor-only; production routing is blocked behind future risk gates and human sign-off.",
            action_label="Open Live station",
            route="/station/live",
        ),
    ]
    ready_count = sum(1 for check in checks if check["status"] == "ready")
    attention_count = sum(1 for check in checks if check["status"] == "attention")
    blocked_count = sum(1 for check in checks if check["status"] == "blocked")
    overall_status = "blocked" if blocked_count else "attention" if attention_count else "ready"
    return {
        "updatedAt": now_ms,
        "overallStatus": overall_status,
        "summary": {
            "readyChecks": ready_count,
            "attentionChecks": attention_count,
            "blockedChecks": blocked_count,
            "strategyCount": len(real_strategies),
            "blockedStrategies": len(blocked_strategies),
            "paperTrades": summary.get("paperTrades", 0),
            "openPaperTrades": summary.get("openTrades", 0),
            "reviewCoverage": review_coverage,
            "cacheFresh": cache_fresh,
            "paperRuntimeStatus": paper_health,
            "liveExecutionLocked": True,
        },
        "gateway": health_payload,
        "paperRuntime": supervisor_payload,
        "strategyBlockers": summarize_strategy_blockers(real_strategies),
        "latestEvidence": latest_evidence,
        "dailyCommands": [
            {"label": "Harness check", "command": "npm run agent:check"},
            {"label": "HF doctor", "command": "npm run hf:doctor"},
            {"label": "HF status", "command": "npm run hf:status"},
            {"label": "Gateway probe", "command": "npm run gateway:probe"},
            {"label": "Terminal doctor", "command": "npm run terminal:doctor"},
        ],
        "checks": checks,
        "errors": errors,
        "fetchedAt": now_ms,
    }


@app.get("/api/hyperliquid/app-readiness")
async def app_readiness(
    audit_limit: int = Query(default=500, ge=20, le=1000),
) -> dict[str, Any]:
    health_result, audit_result, supervisor_result, learning_result = await asyncio.gather(
        health(),
        build_strategy_evidence(
            limit=audit_limit,
            runtime_limit=30,
            include_database=False,
            mark_paper_trades=False,
        ),
        asyncio.to_thread(build_paper_runtime_supervisor_status, "btc_failed_impulse_reversal", 12),
        asyncio.to_thread(list_strategy_learning_events, None, 10),
        return_exceptions=True,
    )
    return app_readiness_payload(
        health_result=health_result,
        audit_result=audit_result,
        supervisor_result=supervisor_result,
        learning_result=learning_result,
    )


@app.get("/api/hyperliquid/stations/hedge-fund")
async def hedge_fund_station(
    limit: int = Query(default=500, ge=20, le=1000),
) -> dict[str, Any]:
    health_result, audit_result = await asyncio.gather(
        health(),
        build_strategy_evidence(limit=limit),
        return_exceptions=True,
    )
    errors = [
        station_error(label, result)
        for label, result in [
            ("Gateway", health_result),
            ("Audit", audit_result),
        ]
        if isinstance(result, BaseException)
    ]
    return {
        "health": None if isinstance(health_result, BaseException) else health_result,
        "audit": None if isinstance(audit_result, BaseException) else audit_result,
        "errors": errors,
        "fetchedAt": int(time.time() * 1000),
    }


@app.get("/api/hyperliquid/stations/live")
async def live_station(
    market_limit: int = Query(default=28, ge=5, le=150),
    watchlist_limit: int = Query(default=12, ge=6, le=60),
    trade_limit: int = Query(default=100, ge=1, le=500),
    audit_limit: int = Query(default=500, ge=20, le=1000),
) -> dict[str, Any]:
    health_result, overview_result, watchlist_result, trades_result, audit_result = await asyncio.gather(
        health(),
        overview(limit=market_limit),
        watchlist(limit=watchlist_limit),
        paper_trade_payloads(limit=trade_limit, status="all"),
        build_strategy_evidence(limit=audit_limit),
        return_exceptions=True,
    )
    errors = [
        station_error(label, result)
        for label, result in [
            ("Gateway", health_result),
            ("Overview", overview_result),
            ("Watchlist", watchlist_result),
            ("Paper trades", trades_result),
            ("Audit", audit_result),
        ]
        if isinstance(result, BaseException)
    ]
    return {
        "health": None if isinstance(health_result, BaseException) else health_result,
        "overview": None if isinstance(overview_result, BaseException) else overview_result,
        "watchlist": None if isinstance(watchlist_result, BaseException) else watchlist_result,
        "trades": [] if isinstance(trades_result, BaseException) else trades_result,
        "audit": None if isinstance(audit_result, BaseException) else audit_result,
        "errors": errors,
        "fetchedAt": int(time.time() * 1000),
    }


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


@app.post("/api/hyperliquid/strategies/scaffold/preview")
async def strategy_scaffold_preview(payload: StrategyScaffoldPreviewCreate) -> dict[str, Any]:
    try:
        return await asyncio.to_thread(
            preview_strategy_scaffold,
            title=payload.title,
            strategy_id=payload.strategy_id,
            strategies_root=STRATEGIES_ROOT,
            docs_root=DOCS_STRATEGIES_ROOT,
        )
    except StrategyScaffoldError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/hyperliquid/strategies/scaffold")
async def strategy_scaffold(payload: StrategyScaffoldCreate) -> dict[str, Any]:
    try:
        return await asyncio.to_thread(
            write_strategy_scaffold,
            title=payload.title,
            strategy_id=payload.strategy_id,
            strategies_root=STRATEGIES_ROOT,
            docs_root=DOCS_STRATEGIES_ROOT,
        )
    except StrategyScaffoldError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/hyperliquid/strategies/{strategy_id}/lab")
async def strategy_lab(
    strategy_id: str,
    artifact_id: str = "latest",
    interval: str = "1d",
) -> dict[str, Any]:
    return await strategy_lab_payload(strategy_id, artifact_id=artifact_id, interval=interval)


@app.get("/api/hyperliquid/strategies/learning")
async def strategy_learning(
    strategy_id: Optional[str] = None,
    limit: int = Query(default=100, ge=1, le=500),
) -> dict[str, Any]:
    return list_strategy_learning_events(strategy_id=strategy_id, limit=limit)


@app.post("/api/hyperliquid/strategies/learning")
async def create_strategy_learning(payload: StrategyLearningEventCreate) -> dict[str, Any]:
    event = write_strategy_learning_event(payload)
    return {
        "created": True,
        "event": event,
    }


@app.get("/api/hyperliquid/memory/strategy/status")
async def memory_strategy_status() -> dict[str, Any]:
    return await asyncio.to_thread(strategy_memory_status, STRATEGY_MEMORY_ROOT)


@app.post("/api/hyperliquid/memory/strategy/sync")
async def memory_strategy_sync(
    dry_run: bool = False,
    process_jobs: bool = True,
) -> dict[str, Any]:
    return await asyncio.to_thread(
        sync_strategy_memory,
        memory_root=STRATEGY_MEMORY_ROOT,
        dry_run=dry_run,
        process_jobs=process_jobs,
    )


@app.get("/api/hyperliquid/memory/strategy/query")
async def memory_strategy_query(
    query: str = Query(..., min_length=1),
    strategy_id: Optional[str] = None,
    limit: int = Query(default=8, ge=1, le=40),
) -> dict[str, Any]:
    return await asyncio.to_thread(
        query_strategy_memory,
        query,
        strategy_id=strategy_id,
        limit=limit,
        memory_root=STRATEGY_MEMORY_ROOT,
    )


@app.get("/api/hyperliquid/memory/graphify-status")
async def memory_graphify_status() -> dict[str, Any]:
    return graphify_status_payload()


@app.get("/api/hyperliquid/memory/graphify-explorer")
async def memory_graphify_explorer() -> HTMLResponse:
    return HTMLResponse(
        graphify_explorer_html(),
        media_type="text/html; charset=utf-8",
    )


@app.get("/api/hyperliquid/memory/graphify-html")
async def memory_graphify_html() -> FileResponse:
    html_path = graphify_required_paths()["htmlPath"]
    if not html_path.exists():
        raise HTTPException(status_code=404, detail="Graphify HTML not found. Run npm run graph:build.")
    return FileResponse(
        html_path,
        media_type="text/html; charset=utf-8",
    )


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


def liquidations_snapshot_payload(limit: int) -> list[dict[str, Any]]:
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
    return snapshots


def liquidations_alerts_payload(limit: int) -> list[dict[str, Any]]:
    return [
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
    return {"success": True, "data": liquidations_snapshot_payload(limit)}


@app.get("/api/liquidations/alerts")
async def liquidations_alerts(limit: int = Query(default=20, ge=5, le=100)) -> dict[str, Any]:
    if not market_alerts and not aggregate_history:
        await ensure_overview_data()
    return {"success": True, "data": liquidations_alerts_payload(limit)}


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


@app.get("/api/liquidations/summary")
async def liquidations_summary(
    hours: int = Query(default=24, ge=1, le=72),
    snapshots_limit: int = Query(default=20, ge=5, le=120),
    alerts_limit: int = Query(default=10, ge=5, le=100),
) -> dict[str, Any]:
    if not aggregate_history:
        await ensure_overview_data()
    if not market_alerts and not aggregate_history:
        await ensure_overview_data()
    snapshot = aggregate_history[-1] if aggregate_history else build_aggregate_snapshot([], int(time.time() * 1000))
    return {
        "success": True,
        "data": {
            "status": build_liquidations_stats(snapshot),
            "insights": build_liquidations_insights(snapshot),
            "snapshots": liquidations_snapshot_payload(snapshots_limit),
            "alerts": liquidations_alerts_payload(alerts_limit),
            "chart": aggregate_chart_payload(hours),
            "fetchedAt": int(time.time() * 1000),
        },
    }
