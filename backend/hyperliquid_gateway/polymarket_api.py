from __future__ import annotations

import asyncio
import json
import importlib.util
import os
import sqlite3
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

try:
    from .strategies.polymarket_btc_updown_5m_oracle_lag import (
        apply_signal_confirmation,
        calculate_position_size,
        calculate_realized_pnl,
        check_session_killswitch,
        entry_allowed,
        estimate_fee_pct,
        evaluate_signal,
        session_roi,
        side_entry_price,
    )
    from .logger import logger, log_trade_event, log_signal_evaluation, log_risk_event
    from .retry import retry_async
    from .circuit_breaker import clob_circuit, CircuitState
except ImportError:
    from strategies.polymarket_btc_updown_5m_oracle_lag import (
        apply_signal_confirmation,
        calculate_position_size,
        calculate_realized_pnl,
        check_session_killswitch,
        entry_allowed,
        estimate_fee_pct,
        evaluate_signal,
        session_roi,
        side_entry_price,
    )
    from logger import logger, log_trade_event, log_signal_evaluation, log_risk_event
    from retry import retry_async
    from circuit_breaker import clob_circuit, CircuitState


TIMEOUT_SECONDS = float(os.getenv("HYPERLIQUID_TIMEOUT", "12"))
DB_PATH = os.getenv("HYPERLIQUID_DB_PATH", "/data/hyperliquid.db")
POLYMARKET_GAMMA_API = os.getenv("POLYMARKET_GAMMA_API", "https://gamma-api.polymarket.com")
POLYMARKET_DATA_API = os.getenv("POLYMARKET_DATA_API", "https://data-api.polymarket.com")
POLYMARKET_CLOB_HOST = os.getenv("POLYMARKET_CLOB_HOST", "https://clob.polymarket.com")
POLYMARKET_CHAIN_ID = int(os.getenv("POLYMARKET_CHAIN_ID", "137"))
POLYMARKET_REFERENCE_API = os.getenv("POLYMARKET_REFERENCE_API", "https://api.coinbase.com/v2/prices/BTC-USD/spot")
POLYMARKET_FUNDER_ADDRESS = os.getenv("POLYMARKET_FUNDER_ADDRESS", "")
POLYMARKET_PRIVATE_KEY = os.getenv("POLYMARKET_PRIVATE_KEY", "")
POLYMARKET_API_KEY = os.getenv("POLYMARKET_API_KEY", "")
POLYMARKET_API_SECRET = os.getenv("POLYMARKET_API_SECRET", "")
POLYMARKET_API_PASSPHRASE = os.getenv("POLYMARKET_API_PASSPHRASE", "")
POLYMARKET_SIGNATURE_TYPE = os.getenv("POLYMARKET_SIGNATURE_TYPE", "")
POLYMARKET_LIVE_ENABLED = os.getenv("POLYMARKET_LIVE_ENABLED", "").strip().lower() in {"1", "true", "yes", "on"}
DEFAULT_POLYMARKET_MARKET_SLUG = os.getenv("POLYMARKET_MARKET_SLUG", "btc-updown-5m-1773548700")
USDC_DECIMALS = 1_000_000
WALLET_OVERVIEW_CACHE_MS = int(os.getenv("POLYMARKET_WALLET_CACHE_MS", "15000"))

router = APIRouter()
auto_runner_task: asyncio.Task | None = None
wallet_overview_cache: dict[str, Any] | None = None
wallet_overview_cache_at = 0
wallet_overview_lock = asyncio.Lock()
auto_runner_state: dict[str, Any] = {
    "running": False,
    "mode": "dry-run",
    "intervalSeconds": 5,
    "balanceUsd": 0.0,
    "maxNotionalUsd": 1.0,
    "lastRunAt": None,
    "lastError": None,
    "lastResult": None,
}

BTC_5M_DRY_RUN_CONFIG: dict[str, Any] = {
    "max_spread_pct": 1.2,
    "min_seconds_to_expiry": 40,
    "max_seconds_to_expiry": 250,
    "safety_margin_pct": 0.10,
}

BTC_5M_LIVE_PILOT_CONFIG: dict[str, Any] = {
    **BTC_5M_DRY_RUN_CONFIG,
    "max_spread_pct": 1.0,
    "min_seconds_to_expiry": 55,
    "max_seconds_to_expiry": 140,
    "min_confidence": 94,
    "min_net_edge_pct": 6.0,
    "max_entry_price": 0.35,
    "require_price_to_beat": True,
    "require_accepting_orders": True,
    "allowed_entry_buckets": ["cheap-tail", "discount"],
    "required_signal_persistence_count": 3,
    "min_confirmed_basis_bps": 6.0,
}


class PolymarketBtc5mRunRequest(BaseModel):
    slug: str = "btc-updown-5m-1773548700"
    mode: str = Field(default="dry-run", pattern="^(dry-run|live)$")
    basis_bps: Optional[float] = None
    balance_usd: Optional[float] = Field(default=None)
    stake_pct: float = Field(default=100.0, gt=0, le=100)
    max_notional_usd: float = Field(default=12.0, gt=0)
    safety_margin_pct: float = Field(default=0.10, ge=0)
    max_spread_pct: float = Field(default=1.2, ge=0)
    min_seconds_to_expiry: int = Field(default=40, ge=0)
    max_seconds_to_expiry: int = Field(default=250, ge=1)
    require_full_fill: bool = True


class PolymarketBtc5mAutoRequest(BaseModel):
    mode: str = Field(default="dry-run", pattern="^(dry-run|live)$")
    balance_usd: Optional[float] = Field(default=None)
    stake_pct: float = Field(default=100.0, gt=0, le=100)
    max_notional_usd: float = Field(default=1.0, gt=0)
    safety_margin_pct: float = Field(default=0.10, ge=0)
    max_spread_pct: float = Field(default=1.2, ge=0)
    min_seconds_to_expiry: int = Field(default=40, ge=0)
    max_seconds_to_expiry: int = Field(default=250, ge=1)
    interval_seconds: int = Field(default=5, ge=2, le=60)
    require_full_fill: bool = True


class PolymarketBtc5mCloseRequest(BaseModel):
    settlement_price: Optional[float] = Field(default=None, ge=0, le=1)


def db_connection() -> sqlite3.Connection:
    db_file = Path(DB_PATH)
    db_file.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_file, timeout=30)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA busy_timeout = 30000")
    connection.execute("PRAGMA journal_mode = WAL")
    connection.execute("PRAGMA synchronous = NORMAL")
    return connection


def init_polymarket_db() -> None:
    with db_connection() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS polymarket_btc_5m_snapshots (
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
                payload_json TEXT
            );

            CREATE TABLE IF NOT EXISTS polymarket_btc_5m_trades (
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

            CREATE TABLE IF NOT EXISTS polymarket_system_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp_ms INTEGER NOT NULL,
                metric_type TEXT NOT NULL,
                metric_value REAL,
                metadata TEXT
            );

            CREATE TABLE IF NOT EXISTS polymarket_btc_5m_reference_prices (
                slug TEXT PRIMARY KEY,
                created_at_ms INTEGER NOT NULL,
                reference_price REAL NOT NULL,
                reference_source TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_polymarket_btc_5m_snapshots_time ON polymarket_btc_5m_snapshots(created_at_ms DESC);
            CREATE INDEX IF NOT EXISTS idx_polymarket_btc_5m_trades_time ON polymarket_btc_5m_trades(created_at_ms DESC);
            CREATE INDEX IF NOT EXISTS idx_polymarket_system_metrics_time ON polymarket_system_metrics(timestamp_ms DESC);
            CREATE INDEX IF NOT EXISTS idx_polymarket_system_metrics_type ON polymarket_system_metrics(metric_type);
            """
        )
        connection.commit()


def log_metric(metric_type: str, metric_value: float | None = None, metadata: dict[str, Any] | None = None) -> None:
    """
    Log a system metric to the database for monitoring and analysis.

    Args:
        metric_type: Type of metric (e.g., 'order_latency', 'api_error', 'health_check')
        metric_value: Numeric value of the metric (optional)
        metadata: Additional context as dictionary (optional)
    """
    try:
        with db_connection() as connection:
            connection.execute(
                """
                INSERT INTO polymarket_system_metrics (timestamp_ms, metric_type, metric_value, metadata)
                VALUES (?, ?, ?, ?)
                """,
                (
                    int(time.time() * 1000),
                    metric_type,
                    metric_value,
                    json.dumps(metadata) if metadata else None,
                ),
            )
            connection.commit()
    except Exception as exc:
        logger.warning(f"Failed to log metric {metric_type}: {exc}")


def iso_timestamp(timestamp_ms: int) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(timestamp_ms / 1000))


def live_readiness_snapshot() -> dict[str, Any]:
    clob_client_installed = importlib.util.find_spec("py_clob_client") is not None
    has_explicit_api_creds = bool(POLYMARKET_API_KEY and POLYMARKET_API_SECRET and POLYMARKET_API_PASSPHRASE)
    can_derive_api_creds = bool(POLYMARKET_PRIVATE_KEY and POLYMARKET_FUNDER_ADDRESS and POLYMARKET_SIGNATURE_TYPE)

    checks = {
        "clobClientInstalled": clob_client_installed,
        "liveFlagConfigured": POLYMARKET_LIVE_ENABLED,
        "privateKeyConfigured": bool(POLYMARKET_PRIVATE_KEY),
        "apiKeyConfigured": bool(POLYMARKET_API_KEY),
        "apiSecretConfigured": bool(POLYMARKET_API_SECRET),
        "apiPassphraseConfigured": bool(POLYMARKET_API_PASSPHRASE),
        "apiCredsReady": has_explicit_api_creds or can_derive_api_creds,
        "funderAddressConfigured": bool(POLYMARKET_FUNDER_ADDRESS),
        "signatureTypeConfigured": bool(POLYMARKET_SIGNATURE_TYPE),
    }

    blockers: list[str] = []
    if not checks["clobClientInstalled"]:
        blockers.append("py-clob-client is not installed in the backend runtime.")
    if not checks["liveFlagConfigured"]:
        blockers.append("POLYMARKET_LIVE_ENABLED is not set to true.")
    if not checks["privateKeyConfigured"]:
        blockers.append("POLYMARKET_PRIVATE_KEY is missing.")
    if not checks["funderAddressConfigured"]:
        blockers.append("POLYMARKET_FUNDER_ADDRESS is missing.")
    if not checks["signatureTypeConfigured"]:
        blockers.append("POLYMARKET_SIGNATURE_TYPE is missing.")
    if not checks["apiCredsReady"]:
        blockers.append("API credentials cannot be derived because private key, funder address, or signature type is incomplete.")

    # Get circuit breaker status
    circuit_status = clob_circuit.get_status()

    # Add circuit breaker warning if open
    warnings = [
        "Wallet allowances are not auto-checked by this backend. The first live order can still fail if USDC or conditional token approvals are missing.",
        "This route sends a live market buy for the selected YES/NO token. Keep the first test notional as small as possible.",
    ]
    if circuit_status["is_open"]:
        warnings.insert(0, f"Circuit breaker is OPEN due to {circuit_status['failure_count']} consecutive CLOB failures. Retrying in {circuit_status.get('timeout', 120) - (circuit_status.get('time_since_last_failure', 0))}s.")

    return {
        "liveEnabled": len(blockers) == 0,
        "checks": checks,
        "blockers": blockers,
        "warnings": warnings,
        "circuitBreaker": circuit_status,
    }


def safe_json_loads(value: Any) -> Any:
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value
    return value


def parse_float(value: Any, default: float = 0.0) -> float:
    try:
        if value in (None, ""):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def parse_data_api_balances(value_data: dict[str, Any]) -> tuple[float, float]:
    portfolio_value = parse_float(value_data.get("portfolioValue") or value_data.get("value"))
    cash_balance = parse_float(value_data.get("cash") or value_data.get("cashBalance"))
    return portfolio_value, cash_balance


def normalize_usdc_units(value: Any) -> float:
    return round(parse_float(value) / USDC_DECIMALS, 6)


def parse_market_list_field(value: Any) -> list[Any]:
    parsed = safe_json_loads(value)
    if isinstance(parsed, list):
        return parsed
    if parsed is None:
        return []
    return [parsed]


def resolve_outcome_token(market: dict[str, Any], side: str) -> tuple[str, str]:
    outcomes = [str(item).strip() for item in parse_market_list_field(market.get("outcomes"))]
    token_ids = [str(item).strip() for item in parse_market_list_field(market.get("clobTokenIds"))]
    if len(token_ids) < 2:
        raise HTTPException(status_code=400, detail="Gamma market metadata does not include both CLOB token ids.")

    normalized_outcomes = [item.lower() for item in outcomes]
    yes_index = normalized_outcomes.index("yes") if "yes" in normalized_outcomes else 0
    no_index = normalized_outcomes.index("no") if "no" in normalized_outcomes else 1

    if side == "BUY_YES":
        return token_ids[yes_index], outcomes[yes_index] if outcomes else "Yes"
    if side == "BUY_NO":
        return token_ids[no_index], outcomes[no_index] if outcomes else "No"

    raise HTTPException(status_code=400, detail=f"Unsupported Polymarket side: {side}")


def infer_market_settlement_price(market: dict[str, Any], outcome_name: str) -> float | None:
    outcomes = [str(item).strip() for item in parse_market_list_field(market.get("outcomes"))]
    outcome_prices = [parse_float(item, default=-1.0) for item in parse_market_list_field(market.get("outcomePrices"))]
    if not outcomes or len(outcomes) != len(outcome_prices):
        return None

    normalized_target = str(outcome_name or "").strip().lower()
    for index, outcome in enumerate(outcomes):
        if outcome.strip().lower() != normalized_target:
            continue
        price = outcome_prices[index]
        if 0.0 <= price <= 1.0:
            return round(price, 6)
    return None


def build_live_clob_client() -> Any:
    readiness = live_readiness_snapshot()
    if not readiness["liveEnabled"]:
        raise HTTPException(status_code=400, detail="; ".join(readiness["blockers"]))

    try:
        from py_clob_client.client import ClobClient
    except ImportError as exc:
        raise HTTPException(status_code=500, detail="py-clob-client is not available in the backend runtime.") from exc

    try:
        signature_type = int(POLYMARKET_SIGNATURE_TYPE)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="POLYMARKET_SIGNATURE_TYPE must be an integer.") from exc

    client = ClobClient(
        POLYMARKET_CLOB_HOST,
        key=POLYMARKET_PRIVATE_KEY,
        chain_id=POLYMARKET_CHAIN_ID,
        signature_type=signature_type,
        funder=POLYMARKET_FUNDER_ADDRESS,
    )
    client.set_api_creds(client.create_or_derive_api_creds())
    return client


def execute_live_market_order(
    market: dict[str, Any],
    snapshot: dict[str, Any],
    side: str,
    size_usd: float,
    require_full_fill: bool,
) -> dict[str, Any]:
    try:
        from py_clob_client.clob_types import MarketOrderArgs, OrderType
        from py_clob_client.order_builder.constants import BUY
    except ImportError as exc:
        raise HTTPException(status_code=500, detail="py-clob-client order classes are unavailable.") from exc

    token_id, outcome = resolve_outcome_token(market, side)
    client = build_live_clob_client()
    order_type = OrderType.FOK if require_full_fill else OrderType.FAK
    order_type_label = getattr(order_type, "name", str(order_type))
    market_order = MarketOrderArgs(
        token_id=token_id,
        amount=round(float(size_usd), 4),
        side=BUY,
        order_type=order_type,
    )

    slug = market.get("slug", "unknown")

    # Log before submitting live order
    log_trade_event(
        event_type="ORDER_SUBMITTED",
        slug=slug,
        side=side,
        size_usd=size_usd,
        metadata={"token_id": token_id, "outcome": outcome, "order_type": order_type_label}
    )

    order_start_time = time.time()
    try:
        signed_order = client.create_market_order(market_order)

        # Execute order through circuit breaker
        def post_order_protected():
            return client.post_order(signed_order, order_type)

        response = clob_circuit.call(post_order_protected)
        order_latency_ms = (time.time() - order_start_time) * 1000

        # Log order latency metric
        log_metric("order_latency", order_latency_ms, {"slug": slug, "side": side, "size_usd": size_usd})

    except Exception as exc:
        order_latency_ms = (time.time() - order_start_time) * 1000
        log_metric("api_error", order_latency_ms, {"endpoint": "post_order", "error": str(exc), "slug": slug})
        log_trade_event(
            event_type="ORDER_FAILED",
            slug=slug,
            side=side,
            size_usd=size_usd,
            metadata={"error": str(exc)}
        )
        logger.error(f"Polymarket live order failed: {exc}")
        raise HTTPException(status_code=502, detail=f"Polymarket live order failed: {exc}") from exc

    if not isinstance(response, dict) or not response.get("success"):
        log_trade_event(
            event_type="ORDER_REJECTED",
            slug=slug,
            side=side,
            size_usd=size_usd,
            metadata={"response": response}
        )
        logger.warning(f"Polymarket live order was rejected: {response}")
        raise HTTPException(status_code=502, detail=f"Polymarket live order was rejected: {response}")

    spent_usd = float(response.get("makingAmount") or size_usd)
    shares = float(response.get("takingAmount") or 0.0)
    avg_price = round(spent_usd / shares, 6) if shares > 0 else float(snapshot["best_ask"])
    order_id = response.get("orderID") or response.get("id")

    # Log successful fill
    log_trade_event(
        event_type="ORDER_FILLED",
        slug=slug,
        side=side,
        size_usd=spent_usd,
        price=avg_price,
        order_id=order_id,
        shares=shares,
        metadata={"status": response.get("status")}
    )

    return {
        "tokenId": token_id,
        "outcome": outcome,
        "orderType": order_type_label,
        "response": response,
        "spentUsd": round(spent_usd, 6),
        "shares": round(shares, 8),
        "avgPrice": avg_price,
        "orderId": response.get("orderID") or response.get("id"),
        "exchangeStatus": response.get("status") or "submitted",
        "transactionsHashes": response.get("transactionsHashes") or [],
    }


def execute_live_market_exit(token_id: str, shares: float, require_full_fill: bool) -> dict[str, Any]:
    try:
        from py_clob_client.clob_types import MarketOrderArgs, OrderType
        from py_clob_client.order_builder.constants import SELL
    except ImportError as exc:
        raise HTTPException(status_code=500, detail="py-clob-client order classes are unavailable.") from exc

    if shares <= 0:
        raise HTTPException(status_code=400, detail="Live exit requires a positive share balance.")

    client = build_live_clob_client()
    order_type = OrderType.FOK if require_full_fill else OrderType.FAK
    order_type_label = getattr(order_type, "name", str(order_type))
    market_order = MarketOrderArgs(
        token_id=token_id,
        amount=round(float(shares), 8),
        side=SELL,
        order_type=order_type,
    )

    # Log exit order submission
    log_trade_event(
        event_type="EXIT_SUBMITTED",
        slug="exit",
        side="SELL",
        shares=shares,
        metadata={"token_id": token_id, "order_type": order_type_label}
    )

    try:
        signed_order = client.create_market_order(market_order)

        # Execute order through circuit breaker
        def post_order_protected():
            return client.post_order(signed_order, order_type)

        response = clob_circuit.call(post_order_protected)

    except Exception as exc:
        log_trade_event(
            event_type="EXIT_FAILED",
            slug="exit",
            side="SELL",
            shares=shares,
            metadata={"token_id": token_id, "error": str(exc)}
        )
        logger.error(f"Polymarket live exit failed: {exc}")
        raise HTTPException(status_code=502, detail=f"Polymarket live exit failed: {exc}") from exc

    if not isinstance(response, dict) or not response.get("success"):
        log_trade_event(
            event_type="EXIT_REJECTED",
            slug="exit",
            side="SELL",
            shares=shares,
            metadata={"token_id": token_id, "response": response}
        )
        logger.warning(f"Polymarket live exit was rejected: {response}")
        raise HTTPException(status_code=502, detail=f"Polymarket live exit was rejected: {response}")

    sold_shares = float(response.get("makingAmount") or shares)
    proceeds_usd = float(response.get("takingAmount") or 0.0)
    avg_price = round(proceeds_usd / sold_shares, 6) if sold_shares > 0 else 0.0
    order_id = response.get("orderID") or response.get("id")

    # Log successful exit
    log_trade_event(
        event_type="EXIT_FILLED",
        slug="exit",
        side="SELL",
        size_usd=proceeds_usd,
        price=avg_price,
        order_id=order_id,
        shares=sold_shares,
        metadata={"token_id": token_id, "status": response.get("status")}
    )

    return {
        "tokenId": token_id,
        "orderType": order_type_label,
        "response": response,
        "proceedsUsd": round(proceeds_usd, 6),
        "sharesSold": round(sold_shares, 8),
        "avgPrice": avg_price,
        "orderId": response.get("orderID") or response.get("id"),
        "exchangeStatus": response.get("status") or "submitted",
        "transactionsHashes": response.get("transactionsHashes") or [],
    }


@retry_async(max_attempts=3, base_delay=1.0, exceptions=(httpx.TimeoutException, httpx.ConnectError))
async def fetch_polymarket_market(slug: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
        response = await client.get(f"{POLYMARKET_GAMMA_API}/markets", params={"slug": slug, "limit": 1})
        response.raise_for_status()
        data = response.json()
    if isinstance(data, list) and data:
        market = data[0]
        if not market_has_price_to_beat(market):
            market = await enrich_market_with_event_metadata(market)
        return market
    raise HTTPException(status_code=404, detail=f"Polymarket slug not found: {slug}")


async def enrich_market_with_event_metadata(market: dict[str, Any]) -> dict[str, Any]:
    if market_has_price_to_beat(market):
        return market

    market_slug = str(market.get("slug") or "")
    if not market_slug:
        return market

    candidate_param_sets = (
        {"active": "true", "closed": "false", "limit": 200},
        {"closed": "true", "limit": 200},
    )

    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
        for params in candidate_param_sets:
            try:
                response = await client.get(f"{POLYMARKET_GAMMA_API}/events", params=params)
                response.raise_for_status()
                data = response.json()
            except Exception:
                continue

            if not isinstance(data, list):
                continue

            for event in data:
                if not isinstance(event, dict):
                    continue
                markets = event.get("markets")
                if not isinstance(markets, list):
                    continue
                for event_market in markets:
                    if not isinstance(event_market, dict):
                        continue
                    if str(event_market.get("slug") or "") != market_slug:
                        continue

                    enriched_market = dict(market)
                    if enriched_market.get("eventMetadata") is None and isinstance(event.get("eventMetadata"), dict):
                        enriched_market["eventMetadata"] = event.get("eventMetadata")

                    existing_events = enriched_market.get("events")
                    if not isinstance(existing_events, list) or not existing_events:
                        enriched_market["events"] = [
                            {
                                "slug": event.get("slug"),
                                "title": event.get("title"),
                                "eventMetadata": event.get("eventMetadata"),
                            }
                        ]
                    elif isinstance(existing_events[0], dict) and existing_events[0].get("eventMetadata") is None:
                        first_event = dict(existing_events[0])
                        first_event["eventMetadata"] = event.get("eventMetadata")
                        enriched_market["events"] = [first_event, *existing_events[1:]]

                    return enriched_market

    return market


def btc_5m_slug_candidates(now_ts: int | None = None, radius_intervals: int = 2) -> list[str]:
    current_ts = int(now_ts or time.time())
    base_ts = current_ts - (current_ts % 300)
    candidates: list[str] = []
    for offset in range(-radius_intervals, radius_intervals + 1):
        start_ts = base_ts + (offset * 300)
        if start_ts <= 0:
            continue
        candidates.append(f"btc-updown-5m-{start_ts}")
    return candidates


async def fetch_deterministic_btc_5m_market(require_price_to_beat: bool = False) -> dict[str, Any] | None:
    for slug in btc_5m_slug_candidates():
        try:
            market = await fetch_polymarket_market(slug)
        except Exception:
            continue
        if bool(market.get("closed")):
            continue
        if market.get("enableOrderBook") is False:
            continue
        end_ts_ms = parse_iso_to_ms(market.get("endDate") or market.get("end_date_iso"))
        now_ms = int(time.time() * 1000)
        if end_ts_ms is not None and end_ts_ms <= now_ms:
            continue
        if market.get("acceptingOrders") is False:
            continue
        if require_price_to_beat and not market_has_price_to_beat(market):
            continue
        return market
    return None


async def fetch_active_btc_5m_market() -> dict[str, Any] | None:
    params = {"active": "true", "closed": "false", "limit": 200}
    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
        response = await client.get(f"{POLYMARKET_GAMMA_API}/events", params=params)
        response.raise_for_status()
        data = response.json()

    if not isinstance(data, list):
        return None

    candidates: list[tuple[int, dict[str, Any]]] = []
    now_ms = int(time.time() * 1000)
    for event in data:
        if not isinstance(event, dict):
            continue
        event_markets = event.get("markets")
        if not isinstance(event_markets, list):
            continue

        for market in event_markets:
            if not isinstance(market, dict):
                continue
            if bool(market.get("closed")):
                continue
            if market.get("enableOrderBook") is False:
                continue

            slug = str(market.get("slug") or "")
            question = str(market.get("question") or market.get("title") or "").lower()
            market_series_slug = str(market.get("seriesSlug") or event.get("seriesSlug") or "").lower()

            market_matches = (
                "btc-updown-5m" in slug
                or market_series_slug == "btc-up-or-down-5m"
                or "bitcoin up or down" in question
            )
            if not market_matches:
                continue

            enriched_market = dict(market)
            if enriched_market.get("eventMetadata") is None and isinstance(event.get("eventMetadata"), dict):
                enriched_market["eventMetadata"] = event.get("eventMetadata")
            if not isinstance(enriched_market.get("events"), list):
                enriched_market["events"] = [
                    {
                        "slug": event.get("slug"),
                        "title": event.get("title"),
                        "eventMetadata": event.get("eventMetadata"),
                    }
                ]

            end_ts_ms = parse_iso_to_ms(market.get("endDate") or market.get("end_date_iso"))
            if end_ts_ms is None:
                continue
            seconds_to_expiry = int((end_ts_ms - now_ms) / 1000)
            if seconds_to_expiry <= 0:
                continue
            if not market_has_price_to_beat(enriched_market):
                continue

            candidates.append((seconds_to_expiry, enriched_market))

    if not candidates:
        return None

    candidates.sort(key=lambda item: item[0])
    return candidates[0][1]


async def collect_btc_5m_discovery() -> dict[str, Any]:
    params = {"active": "true", "closed": "false", "limit": 200}
    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
        response = await client.get(f"{POLYMARKET_GAMMA_API}/events", params=params)
        response.raise_for_status()
        data = response.json()

    if not isinstance(data, list):
        return {"events": 0, "matches": []}

    now_ms = int(time.time() * 1000)
    matches: list[dict[str, Any]] = []
    for event in data:
        if not isinstance(event, dict):
            continue
        markets = event.get("markets")
        if not isinstance(markets, list):
            continue
        for market in markets:
            if not isinstance(market, dict):
                continue
            slug = str(market.get("slug") or "").lower()
            question = str(market.get("question") or market.get("title") or "").lower()
            market_series_slug = str(market.get("seriesSlug") or event.get("seriesSlug") or "").lower()
            market_matches = (
                "btc-updown-5m" in slug
                or market_series_slug == "btc-up-or-down-5m"
                or "bitcoin up or down" in question
            )
            if not market_matches:
                continue

            enriched_market = dict(market)
            if enriched_market.get("eventMetadata") is None and isinstance(event.get("eventMetadata"), dict):
                enriched_market["eventMetadata"] = event.get("eventMetadata")
            if not isinstance(enriched_market.get("events"), list):
                enriched_market["events"] = [
                    {
                        "slug": event.get("slug"),
                        "title": event.get("title"),
                        "eventMetadata": event.get("eventMetadata"),
                    }
                ]
            end_ts_ms = parse_iso_to_ms(market.get("endDate") or market.get("end_date_iso"))
            seconds_to_expiry = None if end_ts_ms is None else int((end_ts_ms - now_ms) / 1000)
            matches.append(
                {
                    "eventSlug": event.get("slug"),
                    "eventTitle": event.get("title"),
                    "marketSlug": market.get("slug"),
                    "closed": market.get("closed"),
                    "enableOrderBook": market.get("enableOrderBook"),
                    "secondsToExpiry": seconds_to_expiry,
                    "seriesSlug": market.get("seriesSlug") or event.get("seriesSlug"),
                    "priceToBeat": extract_price_to_beat(enriched_market),
                }
            )

    matches.sort(key=lambda item: (item.get("secondsToExpiry") is None, item.get("secondsToExpiry") or 10**9))
    return {"events": len(data), "matches": matches[:20]}


async def resolve_btc_5m_market(requested_slug: str | None = None) -> dict[str, Any]:
    requested_slug = requested_slug or DEFAULT_POLYMARKET_MARKET_SLUG

    if requested_slug and requested_slug != DEFAULT_POLYMARKET_MARKET_SLUG:
        return await fetch_polymarket_market(requested_slug)

    try:
        active_market = await fetch_active_btc_5m_market()
        if active_market:
            active_slug = str(active_market.get("slug") or "")
            if not requested_slug or requested_slug == DEFAULT_POLYMARKET_MARKET_SLUG or requested_slug != active_slug:
                return active_market
    except Exception:
        pass

    try:
        deterministic_market = await fetch_deterministic_btc_5m_market(require_price_to_beat=False)
        if deterministic_market:
            deterministic_slug = str(deterministic_market.get("slug") or "")
            if not requested_slug or requested_slug == DEFAULT_POLYMARKET_MARKET_SLUG or requested_slug != deterministic_slug:
                return deterministic_market
    except Exception:
        pass

    return await fetch_polymarket_market(requested_slug)


def parse_iso_to_ms(value: Any) -> int | None:
    if not value:
        return None
    raw = str(value).replace("Z", "+00:00")
    try:
        return int(datetime.fromisoformat(raw).timestamp() * 1000)
    except ValueError:
        return None


def build_snapshot(market: dict[str, Any], basis_bps: float) -> dict[str, Any]:
    yes_price = float(market.get("lastTradePrice") or market.get("bestAsk") or 0.5)
    best_bid = float(market.get("bestBid") or yes_price)
    best_ask = float(market.get("bestAsk") or yes_price)
    end_ts_ms = parse_iso_to_ms(market.get("endDate") or market.get("end_date_iso"))
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
        "basis_bps": round(float(basis_bps), 4),
        "seconds_to_expiry": seconds_to_expiry,
        "yes_fee_pct": round(estimate_fee_pct(best_ask), 4),
        "no_fee_pct": round(estimate_fee_pct(1.0 - best_bid), 4),
        "fee_pct": round(max(estimate_fee_pct(best_ask), estimate_fee_pct(1.0 - best_bid)) * 2, 4),
        "slippage_pct": 0.12,
        "fees_enabled": bool(market.get("feesEnabled", True)),
        "accepting_orders": bool(market.get("acceptingOrders", True)),
        "order_min_size": parse_float(market.get("orderMinSize")),
        "rewards_max_spread": parse_float(market.get("rewardsMaxSpread")),
        "price_to_beat": extract_price_to_beat(market),
        "external_spot_price": None,
        "reference_source": None,
        "anchor_mode": None,
        "raw_market": market,
    }


def build_strategy_assessment(
    snapshot: dict[str, Any],
    signal_eval: dict[str, Any],
    session_guard: dict[str, Any],
) -> dict[str, Any]:
    dry_run_allowed = entry_allowed(snapshot, signal_eval, session_guard, BTC_5M_DRY_RUN_CONFIG)
    live_pilot_allowed = entry_allowed(snapshot, signal_eval, session_guard, BTC_5M_LIVE_PILOT_CONFIG)
    entry_price = float(signal_eval.get("entry_price", 0.0) or 0.0)
    net_edge_pct = float(signal_eval.get("net_edge_pct", 0.0) or 0.0)

    recommended_strategy = "maker_basis_skew_research"
    if live_pilot_allowed["allowed"]:
        recommended_strategy = "extreme_tail_confirmed_live"
    elif dry_run_allowed["allowed"] and entry_price <= 0.35 and net_edge_pct > 0.5:
        recommended_strategy = "cheap_tail_taker_paper"

    return {
        "recommendedStrategy": recommended_strategy,
        "dryRun": dry_run_allowed,
        "livePilot": {
            **live_pilot_allowed,
            "maxEntryPrice": BTC_5M_LIVE_PILOT_CONFIG["max_entry_price"],
            "minNetEdgePct": BTC_5M_LIVE_PILOT_CONFIG["min_net_edge_pct"],
            "minConfidence": BTC_5M_LIVE_PILOT_CONFIG["min_confidence"],
            "allowedEntryBuckets": BTC_5M_LIVE_PILOT_CONFIG["allowed_entry_buckets"],
            "requiredSignalPersistenceCount": BTC_5M_LIVE_PILOT_CONFIG["required_signal_persistence_count"],
            "minConfirmedBasisBps": BTC_5M_LIVE_PILOT_CONFIG["min_confirmed_basis_bps"],
        },
        "entryProfile": {
            "entryPrice": round(entry_price, 4),
            "entryPriceBucket": signal_eval.get("entry_price_bucket"),
            "netEdgePct": round(net_edge_pct, 4),
            "spreadPct": round(float(snapshot.get("spread_pct", 0.0) or 0.0), 4),
            "feesEnabled": bool(snapshot.get("fees_enabled", True)),
        },
        "researchNotes": [
            "This live gate is intentionally extreme and only allows confirmed cheap-tail or discount entries.",
            "Maker-biased basis skew remains the preferred next serious strategy for scalable edge.",
        ],
    }


def live_order_minimum_check(snapshot: dict[str, Any], signal_eval: dict[str, Any], size_usd: float) -> dict[str, Any]:
    entry_price = float(signal_eval.get("entry_price", 0.0) or 0.0)
    order_min_size = float(snapshot.get("order_min_size", 0.0) or 0.0)

    if entry_price <= 0 or order_min_size <= 0:
        return {
            "allowed": True,
            "requiredMinNotionalUsd": None,
            "requiredMinShares": order_min_size if order_min_size > 0 else None,
            "estimatedShares": None,
            "reason": "No explicit venue minimum detected",
        }

    estimated_shares = size_usd / entry_price
    required_min_notional_usd = order_min_size * entry_price
    if estimated_shares + 1e-9 < order_min_size:
        return {
            "allowed": False,
            "requiredMinNotionalUsd": round(required_min_notional_usd, 4),
            "requiredMinShares": round(order_min_size, 4),
            "estimatedShares": round(estimated_shares, 4),
            "reason": (
                f"Order size below venue minimum: needs about ${required_min_notional_usd:.2f} "
                f"to buy {order_min_size:.2f} shares at {entry_price:.3f}"
            ),
        }

    return {
        "allowed": True,
        "requiredMinNotionalUsd": round(required_min_notional_usd, 4),
        "requiredMinShares": round(order_min_size, 4),
        "estimatedShares": round(estimated_shares, 4),
        "reason": "Order size meets venue minimum",
    }


def response_snapshot(snapshot: dict[str, Any]) -> dict[str, Any]:
    return {
        "slug": snapshot.get("slug"),
        "event_id": snapshot.get("event_id"),
        "yes_price": snapshot.get("yes_price"),
        "best_bid": snapshot.get("best_bid"),
        "best_ask": snapshot.get("best_ask"),
        "spread_pct": snapshot.get("spread_pct"),
        "basis_bps": snapshot.get("basis_bps"),
        "seconds_to_expiry": snapshot.get("seconds_to_expiry"),
        "yes_fee_pct": snapshot.get("yes_fee_pct"),
        "no_fee_pct": snapshot.get("no_fee_pct"),
        "fee_pct": snapshot.get("fee_pct"),
        "slippage_pct": snapshot.get("slippage_pct"),
        "fees_enabled": snapshot.get("fees_enabled"),
        "accepting_orders": snapshot.get("accepting_orders"),
        "order_min_size": snapshot.get("order_min_size"),
        "rewards_max_spread": snapshot.get("rewards_max_spread"),
        "price_to_beat": snapshot.get("price_to_beat"),
        "external_spot_price": snapshot.get("external_spot_price"),
        "reference_source": snapshot.get("reference_source"),
    }


def extract_price_to_beat(market: dict[str, Any]) -> float | None:
    event_metadata = market.get("eventMetadata")
    if isinstance(event_metadata, dict):
        price_to_beat = event_metadata.get("priceToBeat")
        if price_to_beat is not None:
            try:
                return float(price_to_beat)
            except (TypeError, ValueError):
                return None
    events = market.get("events")
    if isinstance(events, list) and events:
        first_event = events[0]
        if isinstance(first_event, dict):
            metadata = first_event.get("eventMetadata")
            if isinstance(metadata, dict):
                price_to_beat = metadata.get("priceToBeat")
                if price_to_beat is not None:
                    try:
                        return float(price_to_beat)
                    except (TypeError, ValueError):
                        return None
    return None


def market_has_price_to_beat(market: dict[str, Any]) -> bool:
    return extract_price_to_beat(market) is not None


def get_cached_reference_price(slug: str) -> dict[str, Any] | None:
    with db_connection() as connection:
        row = connection.execute(
            """
            SELECT slug, created_at_ms, reference_price, reference_source
            FROM polymarket_btc_5m_reference_prices
            WHERE slug = ?
            """,
            (slug,),
        ).fetchone()
    if not row:
        return None
    return {
        "slug": row["slug"],
        "created_at_ms": int(row["created_at_ms"]),
        "reference_price": float(row["reference_price"]),
        "reference_source": str(row["reference_source"]),
    }


def cache_reference_price(slug: str, reference_price: float, reference_source: str) -> dict[str, Any]:
    payload = {
        "slug": slug,
        "created_at_ms": int(time.time() * 1000),
        "reference_price": round(float(reference_price), 6),
        "reference_source": reference_source,
    }
    with db_connection() as connection:
        connection.execute(
            """
            INSERT INTO polymarket_btc_5m_reference_prices (slug, created_at_ms, reference_price, reference_source)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(slug) DO NOTHING
            """,
            (
                payload["slug"],
                payload["created_at_ms"],
                payload["reference_price"],
                payload["reference_source"],
            ),
        )
        connection.commit()
    return get_cached_reference_price(slug) or payload


@retry_async(max_attempts=3, base_delay=1.0, exceptions=(httpx.TimeoutException, httpx.ConnectError))
async def fetch_external_btc_spot_price() -> tuple[float, str]:
    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
        response = await client.get(POLYMARKET_REFERENCE_API)
        response.raise_for_status()
        payload = response.json()

    if isinstance(payload, dict):
        data = payload.get("data")
        if isinstance(data, dict) and data.get("amount") is not None:
            return float(data["amount"]), "coinbase_spot"
        if payload.get("amount") is not None:
            return float(payload["amount"]), "reference_api"

    raise HTTPException(status_code=502, detail="Unable to parse external BTC reference price.")


@retry_async(max_attempts=2, base_delay=0.5)
async def derive_auto_basis_bps(market: dict[str, Any]) -> tuple[float, dict[str, Any]]:
    price_to_beat = extract_price_to_beat(market)
    external_spot_price, reference_source = await fetch_external_btc_spot_price()
    if price_to_beat is not None and price_to_beat > 0:
        basis_bps = ((external_spot_price - price_to_beat) / price_to_beat) * 10_000
        return basis_bps, {
            "price_to_beat": round(price_to_beat, 6),
            "external_spot_price": round(external_spot_price, 6),
            "reference_source": reference_source,
            "anchor_mode": "official_event_metadata",
        }

    slug = str(market.get("slug") or "")
    if not slug:
        raise HTTPException(status_code=400, detail="Market metadata is missing slug for fallback basis calculation.")

    cached_reference = get_cached_reference_price(slug)
    if cached_reference is None:
        cached_reference = cache_reference_price(
            slug=slug,
            reference_price=external_spot_price,
            reference_source=f"synthetic_anchor:{reference_source}",
        )

    cached_price = float(cached_reference["reference_price"])
    if cached_price <= 0:
        raise HTTPException(status_code=400, detail="Synthetic anchor price is invalid for basis calculation.")

    basis_bps = ((external_spot_price - cached_price) / cached_price) * 10_000
    return basis_bps, {
        "price_to_beat": round(cached_price, 6),
        "external_spot_price": round(external_spot_price, 6),
        "reference_source": reference_source,
        "anchor_mode": "synthetic_slug_anchor",
        "anchor_created_at": iso_timestamp(int(cached_reference["created_at_ms"])),
        "anchor_source": cached_reference["reference_source"],
    }


def persist_snapshot(snapshot: dict[str, Any]) -> None:
    with db_connection() as connection:
        connection.execute(
            """
            INSERT INTO polymarket_btc_5m_snapshots (
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


def recent_snapshots_for_slug(slug: str, limit: int = 5) -> list[dict[str, Any]]:
    with db_connection() as connection:
        rows = connection.execute(
            """
            SELECT created_at_ms, slug, event_id, yes_price, best_bid, best_ask, spread_pct, basis_bps, seconds_to_expiry
            FROM polymarket_btc_5m_snapshots
            WHERE slug = ?
            ORDER BY created_at_ms DESC
            LIMIT ?
            """,
            (slug, limit),
        ).fetchall()

    snapshots = []
    for row in reversed(rows):
        snapshots.append(
            {
                "created_at_ms": int(row["created_at_ms"]),
                "slug": row["slug"],
                "event_id": row["event_id"],
                "yes_price": float(row["yes_price"] or 0.0),
                "best_bid": float(row["best_bid"] or 0.0),
                "best_ask": float(row["best_ask"] or 0.0),
                "spread_pct": float(row["spread_pct"] or 0.0),
                "basis_bps": float(row["basis_bps"] or 0.0),
                "seconds_to_expiry": int(row["seconds_to_expiry"] or 0),
            }
        )
    return snapshots


def open_positions() -> list[dict[str, Any]]:
    with db_connection() as connection:
        rows = connection.execute(
            "SELECT * FROM polymarket_btc_5m_trades WHERE status = 'OPEN' ORDER BY created_at_ms DESC"
        ).fetchall()
    return [dict(row) for row in rows]


def session_stats(balance_usd: float) -> dict[str, Any]:
    with db_connection() as connection:
        rows = connection.execute(
            """
            SELECT net_pnl_usd
            FROM polymarket_btc_5m_trades
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

    return {
        "consecutive_losses": consecutive_losses,
        "daily_drawdown_pct": (realized_pnl_usd / balance_usd) * 100 if balance_usd > 0 else 0.0,
    }


def trade_rows(limit: int = 100) -> list[sqlite3.Row]:
    with db_connection() as connection:
        return connection.execute(
            "SELECT * FROM polymarket_btc_5m_trades ORDER BY created_at_ms DESC LIMIT ?",
            (limit,),
        ).fetchall()


def trade_payload(row: sqlite3.Row) -> dict[str, Any]:
    payload = safe_json_loads(row["payload_json"])
    execution = payload.get("execution") if isinstance(payload, dict) else None
    close_execution = payload.get("closeExecution") if isinstance(payload, dict) else None
    return {
        "id": row["id"],
        "createdAt": row["created_at_ms"],
        "mode": row["mode"],
        "slug": row["slug"],
        "eventId": row["event_id"],
        "side": row["side"],
        "status": row["status"],
        "signalConfidence": row["signal_confidence"],
        "entryPrice": row["entry_price"],
        "exitPrice": row["exit_price"],
        "sizeUsd": row["size_usd"],
        "shares": row["shares"],
        "entryFeeUsd": row["entry_fee_usd"],
        "exitFeeUsd": row["exit_fee_usd"],
        "grossPnlUsd": row["gross_pnl_usd"],
        "netPnlUsd": row["net_pnl_usd"],
        "roiPct": row["roi_pct"],
        "notes": row["notes"],
        "exchangeOrderId": execution.get("orderId") if isinstance(execution, dict) else None,
        "exchangeStatus": execution.get("exchangeStatus") if isinstance(execution, dict) else None,
        "outcome": execution.get("outcome") if isinstance(execution, dict) else None,
        "tokenId": execution.get("tokenId") if isinstance(execution, dict) else None,
        "transactionsHashes": execution.get("transactionsHashes") if isinstance(execution, dict) else [],
        "closeExchangeOrderId": close_execution.get("orderId") if isinstance(close_execution, dict) else None,
        "closeExchangeStatus": close_execution.get("exchangeStatus") if isinstance(close_execution, dict) else None,
        "closeTransactionsHashes": close_execution.get("transactionsHashes") if isinstance(close_execution, dict) else [],
    }


def equity_curve(starting_balance: float) -> list[dict[str, Any]]:
    rows = list(reversed(trade_rows(limit=200)))
    balance = starting_balance
    curve: list[dict[str, Any]] = []
    for row in rows:
        pnl = float(row["net_pnl_usd"] or 0.0) if row["status"] == "CLOSED" else 0.0
        balance += pnl
        curve.append(
            {
                "timestamp": iso_timestamp(int(row["created_at_ms"])),
                "balance": round(balance, 4),
                "pnl_delta_usd": round(pnl, 4),
                "event": row["status"],
                "opportunity_id": row["id"],
                "total_pnl_usd": round(balance - starting_balance, 4),
            }
        )
    return curve


async def run_btc_5m_cycle(payload: PolymarketBtc5mRunRequest) -> dict[str, Any]:
    effective_balance_usd = await resolve_effective_balance_usd(payload.balance_usd)
    market = await resolve_btc_5m_market(payload.slug)
    basis_details: dict[str, Any] = {}
    computed_basis_bps = payload.basis_bps
    if computed_basis_bps is None:
        if extract_price_to_beat(market) is None:
            fallback_market = await fetch_deterministic_btc_5m_market(require_price_to_beat=True)
            if fallback_market:
                market = fallback_market
        computed_basis_bps, basis_details = await derive_auto_basis_bps(market)

    snapshot = build_snapshot(market, computed_basis_bps)
    if basis_details:
        snapshot["price_to_beat"] = basis_details["price_to_beat"]
        snapshot["external_spot_price"] = basis_details["external_spot_price"]
        snapshot["reference_source"] = basis_details["reference_source"]
        snapshot["anchor_mode"] = basis_details.get("anchor_mode")
    persist_snapshot(snapshot)
    recent_snapshots = recent_snapshots_for_slug(str(snapshot["slug"]), limit=max(
        int(BTC_5M_LIVE_PILOT_CONFIG.get("required_signal_persistence_count", 1) or 1),
        5,
    ))

    session_guard = check_session_killswitch(session_stats(effective_balance_usd), {"max_consecutive_losses": 3, "max_daily_drawdown_pct": 8.0})
    signal_eval = evaluate_signal(
        snapshot,
        {
            **BTC_5M_DRY_RUN_CONFIG,
            "safety_margin_pct": payload.safety_margin_pct,
            "max_spread_pct": payload.max_spread_pct,
            "min_seconds_to_expiry": payload.min_seconds_to_expiry,
            "max_seconds_to_expiry": payload.max_seconds_to_expiry,
        },
    )
    signal_eval = apply_signal_confirmation(signal_eval, recent_snapshots, BTC_5M_LIVE_PILOT_CONFIG if payload.mode == "live" else BTC_5M_DRY_RUN_CONFIG)
    strategy_assessment = build_strategy_assessment(snapshot, signal_eval, session_guard)

    # Log signal evaluation
    log_signal_evaluation(
        slug=snapshot.get("slug", "unknown"),
        signal=signal_eval.get("signal", "UNKNOWN"),
        side=signal_eval.get("side"),
        net_edge_pct=signal_eval.get("net_edge_pct"),
        filters_failed=signal_eval.get("filters_failed"),
        basis_bps=snapshot.get("basis_bps"),
        spread_bps=snapshot.get("spread_bps")
    )

    position_sizing = calculate_position_size(
        balance_usd=effective_balance_usd,
        config={"stake_pct": payload.stake_pct, "max_notional_usd": payload.max_notional_usd, "max_open_positions": 1},
        open_positions=open_positions(),
    )
    allowed = strategy_assessment["livePilot"] if payload.mode == "live" else strategy_assessment["dryRun"]
    live_order_check = None

    if payload.mode == "live" and allowed["allowed"] and position_sizing["can_enter"]:
        live_order_check = live_order_minimum_check(snapshot, signal_eval, float(position_sizing["size_usd"] or 0.0))
        if not live_order_check["allowed"]:
            allowed = {**allowed, "allowed": False, "reason": live_order_check["reason"]}
            strategy_assessment["livePilot"] = {
                **strategy_assessment["livePilot"],
                "allowed": False,
                "reason": live_order_check["reason"],
                "requiredMinNotionalUsd": live_order_check["requiredMinNotionalUsd"],
                "requiredMinShares": live_order_check["requiredMinShares"],
                "estimatedShares": live_order_check["estimatedShares"],
            }

    # Log if kill-switch is active
    if session_guard.get("should_pause"):
        log_risk_event(
            event_type="KILL_SWITCH_ACTIVATED",
            reason=session_guard.get("pause_reason", "Unknown"),
            pause_minutes=session_guard.get("pause_minutes"),
            metadata={"consecutive_losses": session_guard.get("consecutive_losses"), "drawdown_pct": session_guard.get("drawdown_pct")}
        )

    trade_id = None
    execution_result = None
    if allowed["allowed"] and position_sizing["can_enter"]:
        entry_price = side_entry_price(signal_eval["side"], float(snapshot["best_bid"]), float(snapshot["best_ask"]))
        size_usd = float(position_sizing["size_usd"])
        shares = size_usd / entry_price if entry_price > 0 else 0.0
        entry_fee_usd = size_usd * (estimate_fee_pct(entry_price) / 100)
        notes = "Dry-run entry recorded from UI"
        payload_json = {"snapshot": snapshot, "signal": signal_eval, "basisDetails": basis_details}

        if payload.mode == "live":
            execution_result = execute_live_market_order(
                market=market,
                snapshot=snapshot,
                side=signal_eval["side"],
                size_usd=size_usd,
                require_full_fill=payload.require_full_fill,
            )
            entry_price = float(execution_result["avgPrice"])
            size_usd = float(execution_result["spentUsd"])
            shares = float(execution_result["shares"])
            entry_fee_usd = max(0.0, size_usd * (estimate_fee_pct(entry_price) / 100))
            notes = f"Live CLOB order submitted: {execution_result['exchangeStatus']}"
            payload_json = {"snapshot": snapshot, "signal": signal_eval, "execution": execution_result, "basisDetails": basis_details}

        with db_connection() as connection:
            cursor = connection.execute(
                """
                INSERT INTO polymarket_btc_5m_trades (
                    created_at_ms, mode, slug, event_id, side, status, signal_confidence,
                    entry_price, size_usd, shares, entry_fee_usd, notes, payload_json
                ) VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    int(time.time() * 1000),
                    payload.mode,
                    snapshot["slug"],
                    snapshot["event_id"],
                    signal_eval["side"],
                    signal_eval["confidence"],
                    entry_price,
                    round(size_usd, 4),
                    round(shares, 8),
                    round(entry_fee_usd, 6),
                    notes,
                    json.dumps(payload_json),
                ),
            )
            trade_id = cursor.lastrowid
            connection.commit()

    return {
        "success": True,
        "data": {
            "tradeId": trade_id,
            "snapshot": response_snapshot(snapshot),
            "signal": signal_eval,
            "positionSizing": position_sizing,
            "sessionGuard": session_guard,
            "allowed": allowed,
            "strategyAssessment": strategy_assessment,
            "execution": execution_result,
            "liveOrderCheck": live_order_check,
            "basisDetails": basis_details,
            "effectiveBalanceUsd": effective_balance_usd,
        },
    }


async def fetch_wallet_overview() -> dict[str, Any]:
    global wallet_overview_cache, wallet_overview_cache_at

    if not POLYMARKET_FUNDER_ADDRESS:
        raise HTTPException(status_code=400, detail="POLYMARKET_FUNDER_ADDRESS is not configured.")

    now_ms = int(time.time() * 1000)
    if wallet_overview_cache and now_ms - wallet_overview_cache_at < WALLET_OVERVIEW_CACHE_MS:
        return wallet_overview_cache

    async with wallet_overview_lock:
        now_ms = int(time.time() * 1000)
        if wallet_overview_cache and now_ms - wallet_overview_cache_at < WALLET_OVERVIEW_CACHE_MS:
            return wallet_overview_cache

        value_data: dict[str, Any] = {}
        positions_data: list[Any] = []
        activity_data: list[Any] = []
        value_api_reachable = False
        positions_api_reachable = False
        activity_api_reachable = False
        data_api_errors: list[str] = []

        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
            try:
                value_response = await client.get(f"{POLYMARKET_DATA_API}/value", params={"user": POLYMARKET_FUNDER_ADDRESS})
                value_response.raise_for_status()
                value_payload = value_response.json()
                value_data = value_payload if isinstance(value_payload, dict) else {}
                value_api_reachable = True
            except Exception as exc:
                data_api_errors.append(f"value: {exc}")

            try:
                positions_response = await client.get(
                    f"{POLYMARKET_DATA_API}/positions",
                    params={"user": POLYMARKET_FUNDER_ADDRESS, "sizeThreshold": 0.1},
                )
                positions_response.raise_for_status()
                positions_payload = positions_response.json()
                positions_data = positions_payload if isinstance(positions_payload, list) else []
                positions_api_reachable = True
            except Exception as exc:
                data_api_errors.append(f"positions: {exc}")

            try:
                activity_response = await client.get(
                    f"{POLYMARKET_DATA_API}/activity",
                    params={"user": POLYMARKET_FUNDER_ADDRESS, "limit": 200},
                )
                activity_response.raise_for_status()
                activity_payload = activity_response.json()
                activity_data = activity_payload if isinstance(activity_payload, list) else []
                activity_api_reachable = True
            except Exception as exc:
                data_api_errors.append(f"activity: {exc}")

        clob_data = await fetch_clob_wallet_diagnostics()

        wallet_overview_cache = {
            "address": POLYMARKET_FUNDER_ADDRESS,
            "value": value_data,
            "positions": positions_data,
            "activity": activity_data,
            "valueApiReachable": value_api_reachable,
            "positionsApiReachable": positions_api_reachable,
            "activityApiReachable": activity_api_reachable,
            "dataApiErrors": data_api_errors,
            "clob": clob_data,
        }
        wallet_overview_cache_at = int(time.time() * 1000)
        return wallet_overview_cache


async def fetch_clob_wallet_diagnostics() -> dict[str, Any]:
    diagnostics = {
        "reachable": False,
        "collateralBalanceUsd": 0.0,
        "allowances": {},
        "apiKeyCount": 0,
        "apiKeys": [],
        "error": None,
    }

    try:
        from py_clob_client.clob_types import AssetType, BalanceAllowanceParams
    except ImportError:
        diagnostics["error"] = "py-clob-client is not available in the backend runtime."
        return diagnostics

    try:
        signature_type = int(POLYMARKET_SIGNATURE_TYPE)
    except ValueError:
        diagnostics["error"] = "POLYMARKET_SIGNATURE_TYPE must be an integer."
        return diagnostics

    try:
        client = build_live_clob_client()
        api_keys_response = client.get_api_keys()
        api_keys = api_keys_response.get("apiKeys") if isinstance(api_keys_response, dict) else []
        balance_response = client.get_balance_allowance(
            BalanceAllowanceParams(
                asset_type=AssetType.COLLATERAL,
                token_id="",
                signature_type=signature_type,
            )
        )
        allowances = balance_response.get("allowances") if isinstance(balance_response, dict) else {}
        diagnostics.update(
            {
                "reachable": True,
                "collateralBalanceUsd": normalize_usdc_units(balance_response.get("balance") if isinstance(balance_response, dict) else 0),
                "allowances": allowances if isinstance(allowances, dict) else {},
                "apiKeys": api_keys if isinstance(api_keys, list) else [],
                "apiKeyCount": len(api_keys) if isinstance(api_keys, list) else 0,
            }
        )
    except Exception as exc:
        diagnostics["error"] = str(exc)

    return diagnostics


async def resolve_effective_balance_usd(balance_usd: float | None, allow_zero: bool = False) -> float:
    if balance_usd is not None and balance_usd > 0:
        return float(balance_usd)

    wallet = await fetch_wallet_overview()
    value_data = wallet["value"] if isinstance(wallet["value"], dict) else {}
    clob_data = wallet.get("clob") if isinstance(wallet.get("clob"), dict) else {}
    portfolio_value, cash_balance = parse_data_api_balances(value_data)
    clob_cash_balance = parse_float(clob_data.get("collateralBalanceUsd"))
    resolved_balance = cash_balance if cash_balance > 0 else portfolio_value
    if resolved_balance <= 0 and clob_cash_balance > 0:
        resolved_balance = clob_cash_balance
    if allow_zero:
        return max(0.0, resolved_balance)
    if resolved_balance <= 0:
        raise HTTPException(status_code=400, detail="Unable to resolve a positive Polymarket wallet balance.")
    return resolved_balance


@router.get("/api/polymarket/btc-5m/status")
async def polymarket_btc_5m_status(balance_usd: Optional[float] = Query(default=None)) -> dict[str, Any]:
    effective_balance_usd = await resolve_effective_balance_usd(balance_usd, allow_zero=True)
    resolved_market_slug = DEFAULT_POLYMARKET_MARKET_SLUG
    resolved_market_snapshot = None
    strategy_assessment = None
    try:
        resolved_market = await resolve_btc_5m_market(None)
        resolved_market_slug = str(resolved_market.get("slug") or resolved_market_slug)
        resolved_market_snapshot = build_snapshot(resolved_market, 0.0)
        signal_eval = evaluate_signal(resolved_market_snapshot, BTC_5M_DRY_RUN_CONFIG)
        strategy_assessment = build_strategy_assessment(
            resolved_market_snapshot,
            signal_eval,
            {"should_pause": False, "reason": "", "pause_minutes": 0},
        )
    except Exception:
        pass

    rows = trade_rows(limit=200)
    total_closed = 0
    wins = 0
    total_pnl_usd = 0.0
    open_count = 0
    for row in rows:
        if row["status"] == "OPEN":
            open_count += 1
            continue
        total_closed += 1
        pnl = float(row["net_pnl_usd"] or 0.0)
        total_pnl_usd += pnl
        if pnl > 0:
            wins += 1

    latest_snapshot = None
    with db_connection() as connection:
        snapshot_row = connection.execute(
            """
            SELECT created_at_ms, slug, event_id, yes_price, best_bid, best_ask, spread_pct, basis_bps, seconds_to_expiry
            FROM polymarket_btc_5m_snapshots
            ORDER BY created_at_ms DESC
            LIMIT 1
            """
        ).fetchone()
    if snapshot_row:
        latest_snapshot = {
            "timestamp": iso_timestamp(int(snapshot_row["created_at_ms"])),
            "slug": snapshot_row["slug"],
            "eventId": snapshot_row["event_id"],
            "yesPrice": snapshot_row["yes_price"],
            "bestBid": snapshot_row["best_bid"],
            "bestAsk": snapshot_row["best_ask"],
            "spreadPct": snapshot_row["spread_pct"],
            "basisBps": snapshot_row["basis_bps"],
            "secondsToExpiry": snapshot_row["seconds_to_expiry"],
        }

    should_replace_with_active = (
        resolved_market_snapshot is not None
        and (
            latest_snapshot is None
            or int(latest_snapshot.get("secondsToExpiry") or 0) <= 0
            or str(latest_snapshot.get("slug") or "") != resolved_market_slug
        )
    )
    if should_replace_with_active:
        latest_snapshot = {
            "timestamp": iso_timestamp(int(time.time() * 1000)),
            "slug": resolved_market_snapshot["slug"],
            "eventId": resolved_market_snapshot["event_id"],
            "yesPrice": resolved_market_snapshot["yes_price"],
            "bestBid": resolved_market_snapshot["best_bid"],
            "bestAsk": resolved_market_snapshot["best_ask"],
            "spreadPct": resolved_market_snapshot["spread_pct"],
            "basisBps": resolved_market_snapshot["basis_bps"],
            "secondsToExpiry": resolved_market_snapshot["seconds_to_expiry"],
        }

    current_balance = effective_balance_usd + total_pnl_usd
    return {
        "success": True,
        "data": {
            "strategyId": "polymarket_btc_updown_5m_oracle_lag",
            "marketSlug": resolved_market_slug,
            "latestSnapshot": latest_snapshot,
            "liveReadiness": live_readiness_snapshot(),
            "strategyAssessment": strategy_assessment,
            "performance": {
                "startingBalance": effective_balance_usd,
                "currentBalance": round(current_balance, 4),
                "totalPnlUsd": round(total_pnl_usd, 4),
                "roiPct": session_roi(effective_balance_usd, current_balance),
                "closedTrades": total_closed,
                "openTrades": open_count,
                "winRatePct": round((wins / total_closed) * 100, 2) if total_closed else 0.0,
            },
            "sessionGuard": check_session_killswitch(session_stats(effective_balance_usd), {"max_consecutive_losses": 3, "max_daily_drawdown_pct": 8.0}),
        },
    }


@router.get("/api/polymarket/btc-5m/discovery")
async def polymarket_btc_5m_discovery() -> dict[str, Any]:
    return {"success": True, "data": await collect_btc_5m_discovery()}


@router.get("/api/polymarket/btc-5m/trades")
async def polymarket_btc_5m_trades(limit: int = Query(default=100, ge=1, le=300)) -> dict[str, Any]:
    return {"success": True, "data": [trade_payload(row) for row in trade_rows(limit=limit)]}


@router.get("/api/polymarket/btc-5m/equity-curve")
async def polymarket_btc_5m_equity_curve(balance_usd: float = Query(default=12.0, gt=0)) -> dict[str, Any]:
    return {"success": True, "data": equity_curve(balance_usd)}


async def auto_runner_loop(payload: PolymarketBtc5mAutoRequest) -> None:
    global auto_runner_state
    auto_runner_state["running"] = True
    auto_runner_state["lastError"] = None

    logger.info(f"[AUTO-RUNNER] Started in {payload.mode} mode with {payload.interval_seconds}s interval, max_notional=${payload.max_notional_usd}")

    while auto_runner_state["running"]:
        auto_runner_state["lastRunAt"] = iso_timestamp(int(time.time() * 1000))
        try:
            result = await run_btc_5m_cycle(
                PolymarketBtc5mRunRequest(
                    slug=DEFAULT_POLYMARKET_MARKET_SLUG,
                    mode=payload.mode,
                    basis_bps=None,
                    balance_usd=float(auto_runner_state["balanceUsd"]),
                    stake_pct=payload.stake_pct,
                    max_notional_usd=payload.max_notional_usd,
                    safety_margin_pct=payload.safety_margin_pct,
                    max_spread_pct=payload.max_spread_pct,
                    min_seconds_to_expiry=payload.min_seconds_to_expiry,
                    max_seconds_to_expiry=payload.max_seconds_to_expiry,
                    require_full_fill=payload.require_full_fill,
                )
            )
            auto_runner_state["lastResult"] = result["data"]
            auto_runner_state["lastError"] = None
        except asyncio.CancelledError:
            logger.info("[AUTO-RUNNER] Stopped by cancellation")
            raise
        except Exception as exc:
            auto_runner_state["lastError"] = str(exc)
            logger.error(f"[AUTO-RUNNER] Cycle error: {exc}")
        await asyncio.sleep(payload.interval_seconds)

    logger.info("[AUTO-RUNNER] Stopped gracefully")


@router.get("/api/polymarket/btc-5m/auto/status")
async def polymarket_btc_5m_auto_status() -> dict[str, Any]:
    return {"success": True, "data": auto_runner_state}


@router.get("/api/polymarket/system/health")
async def polymarket_system_health() -> dict[str, Any]:
    """
    Get system health metrics including circuit breaker status and recent metrics.
    """
    circuit_status = clob_circuit.get_status()

    # Get recent metrics from DB
    recent_metrics: dict[str, Any] = {
        "order_latency_avg_ms": None,
        "recent_errors": [],
    }

    try:
        with db_connection() as connection:
            # Average order latency (last 10 orders)
            latency_row = connection.execute(
                """
                SELECT AVG(metric_value) as avg_latency
                FROM polymarket_system_metrics
                WHERE metric_type = 'order_latency'
                ORDER BY timestamp_ms DESC
                LIMIT 10
                """
            ).fetchone()
            if latency_row and latency_row[0]:
                recent_metrics["order_latency_avg_ms"] = round(latency_row[0], 2)

            # Recent errors (last 5)
            error_rows = connection.execute(
                """
                SELECT timestamp_ms, metadata
                FROM polymarket_system_metrics
                WHERE metric_type = 'api_error'
                ORDER BY timestamp_ms DESC
                LIMIT 5
                """
            ).fetchall()
            recent_metrics["recent_errors"] = [
                {
                    "timestamp": iso_timestamp(row[0]),
                    "details": safe_json_loads(row[1])
                }
                for row in error_rows
            ]
    except Exception as exc:
        logger.warning(f"Failed to fetch system metrics: {exc}")

    return {
        "success": True,
        "data": {
            "circuitBreaker": circuit_status,
            "metrics": recent_metrics,
            "timestamp": iso_timestamp(int(time.time() * 1000))
        }
    }


@router.post("/api/polymarket/btc-5m/auto/start")
async def polymarket_btc_5m_auto_start(payload: PolymarketBtc5mAutoRequest) -> dict[str, Any]:
    global auto_runner_task, auto_runner_state
    if auto_runner_task and not auto_runner_task.done():
        raise HTTPException(status_code=400, detail="Polymarket BTC 5m auto runner is already running.")

    effective_balance_usd = await resolve_effective_balance_usd(payload.balance_usd)
    auto_runner_state = {
        "running": True,
        "mode": payload.mode,
        "intervalSeconds": payload.interval_seconds,
        "balanceUsd": effective_balance_usd,
        "maxNotionalUsd": payload.max_notional_usd,
        "lastRunAt": None,
        "lastError": None,
        "lastResult": None,
    }
    auto_runner_task = asyncio.create_task(auto_runner_loop(payload))
    return {"success": True, "data": auto_runner_state}


@router.post("/api/polymarket/btc-5m/auto/stop")
async def polymarket_btc_5m_auto_stop() -> dict[str, Any]:
    global auto_runner_task, auto_runner_state
    auto_runner_state["running"] = False
    if auto_runner_task and not auto_runner_task.done():
        auto_runner_task.cancel()
    auto_runner_task = None
    return {"success": True, "data": auto_runner_state}


@router.post("/api/polymarket/btc-5m/run-once")
async def polymarket_btc_5m_run_once(payload: PolymarketBtc5mRunRequest) -> dict[str, Any]:
    return await run_btc_5m_cycle(payload)


@router.post("/api/polymarket/btc-5m/trades/{trade_id}/close")
async def polymarket_btc_5m_close_trade(trade_id: int, payload: PolymarketBtc5mCloseRequest) -> dict[str, Any]:
    with db_connection() as connection:
        row = connection.execute("SELECT * FROM polymarket_btc_5m_trades WHERE id = ?", (trade_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Polymarket BTC 5m trade not found.")
        if row["status"] == "CLOSED":
            return {"success": True, "id": trade_id}

        entry_fee_usd = float(row["entry_fee_usd"] or 0.0)
        exit_price = payload.settlement_price
        exit_fee_usd = float(row["size_usd"] or 0.0) * (estimate_fee_pct(float(exit_price)) / 100) if exit_price is not None else 0.0
        payload_json = safe_json_loads(row["payload_json"])
        if not isinstance(payload_json, dict):
            payload_json = {}

        if row["mode"] == "live":
            execution = payload_json.get("execution") if isinstance(payload_json, dict) else None
            token_id = execution.get("tokenId") if isinstance(execution, dict) else None
            outcome_name = execution.get("outcome") if isinstance(execution, dict) else None
            shares = float(row["shares"] or 0.0)
            if not token_id:
                raise HTTPException(status_code=400, detail="Live trade is missing tokenId in journal payload.")
            if exit_price is None:
                market = await fetch_polymarket_market(str(row["slug"]))
                market_closed = bool(market.get("closed")) or bool(str(market.get("umaResolutionStatus") or "").lower() == "resolved")
                if market_closed and outcome_name:
                    exit_price = infer_market_settlement_price(market, outcome_name)
                    exit_fee_usd = 0.0
                    payload_json["resolution"] = {
                        "marketClosed": True,
                        "umaResolutionStatus": market.get("umaResolutionStatus"),
                        "settlementPrice": exit_price,
                        "settlementSource": "gamma_outcome_prices",
                    }
                else:
                    close_execution = execute_live_market_exit(token_id=token_id, shares=shares, require_full_fill=True)
                    exit_price = float(close_execution["avgPrice"])
                    exit_fee_usd = max(0.0, float(row["size_usd"] or 0.0) * (estimate_fee_pct(float(exit_price)) / 100))
                    payload_json["closeExecution"] = close_execution
            elif exit_price is not None:
                exit_fee_usd = 0.0
                payload_json["resolution"] = {
                    "marketClosed": True,
                    "settlementPrice": exit_price,
                    "settlementSource": "manual_override",
                }
            if exit_price is None:
                raise HTTPException(status_code=400, detail="Could not infer live trade settlement price.")
        elif exit_price is None:
            raise HTTPException(status_code=400, detail="settlement_price is required to close a dry-run trade.")

        pnl = calculate_realized_pnl(
            side=row["side"],
            entry_price=float(row["entry_price"]),
            exit_price=float(exit_price),
            size_usd=float(row["size_usd"]),
            entry_fee_usd=entry_fee_usd,
            exit_fee_usd=exit_fee_usd,
        )
        connection.execute(
            """
            UPDATE polymarket_btc_5m_trades
            SET status = 'CLOSED',
                exit_price = ?,
                exit_fee_usd = ?,
                gross_pnl_usd = ?,
                net_pnl_usd = ?,
                roi_pct = ?,
                payload_json = ?
            WHERE id = ?
            """,
            (
                float(exit_price),
                round(exit_fee_usd, 6),
                pnl["gross_pnl_usd"],
                pnl["net_pnl_usd"],
                pnl["roi_pct"],
                json.dumps(payload_json),
                trade_id,
            ),
        )
        connection.commit()

    return {"success": True, "id": trade_id}


@router.get("/api/polymarket/wallet/overview")
async def polymarket_wallet_overview() -> dict[str, Any]:
    wallet = await fetch_wallet_overview()
    value_data = wallet["value"] if isinstance(wallet["value"], dict) else {}
    positions = wallet["positions"]
    clob_data = wallet.get("clob") if isinstance(wallet.get("clob"), dict) else {}

    open_positions_payload = []
    total_unrealized = 0.0
    for position in positions:
        size = float(position.get("size") or 0.0)
        if size <= 0:
            continue
        cash_pnl = float(position.get("cashPnl") or position.get("curPnl") or 0.0)
        total_unrealized += cash_pnl
        open_positions_payload.append(
            {
                "market": position.get("title") or position.get("question") or position.get("market"),
                "slug": position.get("slug"),
                "outcome": position.get("outcome"),
                "size": size,
                "avgPrice": position.get("avgPrice"),
                "curPrice": position.get("curPrice"),
                "cashPnl": cash_pnl,
                "percentPnl": position.get("percentPnl"),
                "redeemable": position.get("redeemable"),
            }
        )

    portfolio_value, cash_balance = parse_data_api_balances(value_data)
    clob_cash_balance = parse_float(clob_data.get("collateralBalanceUsd"))
    effective_cash_balance = cash_balance if cash_balance > 0 else clob_cash_balance
    cash_balance_source = "data-api" if cash_balance > 0 else "clob" if clob_cash_balance > 0 else "none"
    return {
        "success": True,
        "data": {
            "address": wallet["address"],
            "portfolioValue": portfolio_value,
            "cashBalance": effective_cash_balance,
            "cashBalanceSource": cash_balance_source,
            "clobCashBalance": clob_cash_balance,
            "unrealizedPnlUsd": round(total_unrealized, 4),
            "openPositions": open_positions_payload[:25],
        },
    }


@router.get("/api/polymarket/wallet/diagnostics")
async def polymarket_wallet_diagnostics() -> dict[str, Any]:
    wallet = await fetch_wallet_overview()
    value_data = wallet["value"] if isinstance(wallet["value"], dict) else {}
    positions = wallet["positions"] if isinstance(wallet["positions"], list) else []
    activity = wallet["activity"] if isinstance(wallet["activity"], list) else []
    clob_data = wallet.get("clob") if isinstance(wallet.get("clob"), dict) else {}

    portfolio_value, cash_balance = parse_data_api_balances(value_data)
    clob_cash_balance = parse_float(clob_data.get("collateralBalanceUsd"))
    effective_cash_balance = cash_balance if cash_balance > 0 else clob_cash_balance
    connected = bool(wallet["address"]) and bool(
        wallet.get("valueApiReachable") or wallet.get("positionsApiReachable") or wallet.get("activityApiReachable") or clob_data.get("reachable")
    )
    has_funds = portfolio_value > 0 or effective_cash_balance > 0

    hints: list[str] = []
    if not POLYMARKET_FUNDER_ADDRESS:
        hints.append("POLYMARKET_FUNDER_ADDRESS is missing.")
    if clob_data.get("reachable") and clob_cash_balance > 0 and cash_balance <= 0:
        hints.append("CLOB auth is working and reports collateral, but the public Data API still reports zero cash for this address.")
        hints.append("For execution sizing, the backend will use the CLOB collateral balance as fallback.")
    if connected and not has_funds:
        hints.append("The configured Polymarket address is reachable, but neither Data API nor CLOB currently report usable funds.")
    if connected and has_funds and not positions:
        hints.append("Wallet is connected and funded, but there are no open positions right now.")
    if clob_data.get("error"):
        hints.append(f"CLOB diagnostic error: {clob_data['error']}")

    return {
        "success": True,
        "data": {
            "connected": connected,
            "address": wallet["address"],
            "cashBalance": effective_cash_balance,
            "portfolioValue": portfolio_value,
            "clobCashBalance": clob_cash_balance,
            "cashBalanceSource": "data-api" if cash_balance > 0 else "clob" if clob_cash_balance > 0 else "none",
            "positionsCount": len(positions),
            "activityCount": len(activity),
            "hasFunds": has_funds,
            "apiReachable": bool(wallet.get("valueApiReachable") or wallet.get("positionsApiReachable") or wallet.get("activityApiReachable") or clob_data.get("reachable")),
            "dataApiReachable": bool(wallet.get("valueApiReachable") or wallet.get("positionsApiReachable") or wallet.get("activityApiReachable")),
            "clobApiReachable": bool(clob_data.get("reachable")),
            "apiKeyCount": int(clob_data.get("apiKeyCount") or 0),
            "dataApiErrors": wallet.get("dataApiErrors") or [],
            "hints": hints,
            "rawValue": value_data,
        },
    }


@router.get("/api/polymarket/wallet/equity-curve")
async def polymarket_wallet_equity_curve() -> dict[str, Any]:
    wallet = await fetch_wallet_overview()
    activity = wallet["activity"]
    realized_total = 0.0
    points: list[dict[str, Any]] = []
    for item in reversed(activity):
        timestamp = item.get("timestamp") or item.get("createdAt") or item.get("time")
        ts_ms = int(timestamp) if isinstance(timestamp, (int, float)) else int(time.time() * 1000)
        realized = float(item.get("usdcSize") or item.get("amount") or 0.0)
        side = str(item.get("side") or "").lower()
        activity_type = str(item.get("type") or item.get("activityType") or "activity")
        if side in {"sell", "redeem"}:
            realized_total += realized
        elif side in {"buy"}:
            realized_total -= realized

        points.append(
            {
                "timestamp": iso_timestamp(ts_ms),
                "balance": round(realized_total, 4),
                "pnl_delta_usd": round(realized, 4),
                "event": activity_type,
                "opportunity_id": None,
                "total_pnl_usd": round(realized_total, 4),
            }
        )

    return {"success": True, "data": points[-200:]}
