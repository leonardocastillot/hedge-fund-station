"""BTC/USD daily history loading for backend backtests.

The loader keeps external market data in backend artifacts and gives daily
backtests a reusable source of multi-year BTC history. Yahoo Finance is the
primary public source; Binance daily klines are a fallback for environments
where Yahoo is unavailable.
"""

from __future__ import annotations

import csv
import json
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from .engine import BacktestConfig, parse_time_to_ms

YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/BTC-USD"
BINANCE_KLINES_URL = "https://api.binance.com/api/v3/klines"
YAHOO_BTC_EARLIEST_DAY = "2014-09-17"
DEFAULT_HISTORY_START = YAHOO_BTC_EARLIEST_DAY
DEFAULT_SOURCE = "auto"
VALID_SOURCES = {"auto", "yahoo", "binance"}
USER_AGENT = "Mozilla/5.0 hedge-fund-station/btc-daily-history"


def load_btc_daily_history(
    dataset_path: Path,
    config: BacktestConfig | None = None,
    *,
    refresh: bool = False,
    source: str = DEFAULT_SOURCE,
    start_date: str | None = None,
    end_date: str | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Load local BTC daily history, fetching and caching when needed."""

    path = Path(dataset_path).expanduser()
    if path.exists() and not refresh:
        rows, metadata = read_history_file(path)
    else:
        rows, metadata = fetch_and_cache_btc_daily_history(
            path,
            source=source,
            start_date=start_date,
            end_date=end_date,
        )

    filtered = filter_rows(rows, config)
    return filtered, {
        "path": str(path),
        "type": "btc_usd_daily",
        "source": metadata.get("source", "local"),
        "source_url": metadata.get("source_url"),
        "source_symbol": metadata.get("source_symbol", "BTC-USD"),
        "generated_at": metadata.get("generated_at"),
        "requested_start": metadata.get("requested_start"),
        "requested_end": metadata.get("requested_end"),
        "source_errors": metadata.get("source_errors"),
        "vs_currency": "usd",
    }


def fetch_and_cache_btc_daily_history(
    path: Path,
    *,
    source: str = DEFAULT_SOURCE,
    start_date: str | None = None,
    end_date: str | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Fetch BTC daily history and write the normalized cache payload."""

    rows, metadata = fetch_btc_daily_history(
        source=source,
        start_date=start_date,
        end_date=end_date,
    )
    cache_payload = {
        **metadata,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "coin_id": "bitcoin",
        "vs_currency": "usd",
        "prices": rows,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(cache_payload, indent=2), encoding="utf-8")
    return rows, cache_payload


def fetch_btc_daily_history(
    *,
    source: str = DEFAULT_SOURCE,
    start_date: str | None = None,
    end_date: str | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    resolved_source = normalize_source(source)
    start = normalize_fetch_day(start_date or DEFAULT_HISTORY_START)
    end = normalize_fetch_day(end_date or datetime.now(timezone.utc).date().isoformat())
    if date.fromisoformat(end) < date.fromisoformat(start):
        raise ValueError("BTC daily history end_date must be on or after start_date.")

    source_errors: dict[str, str] = {}
    source_order = ("yahoo", "binance") if resolved_source == "auto" else (resolved_source,)
    for candidate in source_order:
        try:
            if candidate == "yahoo":
                rows = fetch_yahoo_daily_history(start_date=start, end_date=end)
                return rows, {
                    "source": "yahoo_finance_chart",
                    "source_url": YAHOO_CHART_URL,
                    "source_symbol": "BTC-USD",
                    "requested_start": start,
                    "requested_end": end,
                    "source_errors": source_errors or None,
                }
            if candidate == "binance":
                rows = fetch_binance_daily_history(start_date=start, end_date=end)
                return rows, {
                    "source": "binance_public_klines",
                    "source_url": BINANCE_KLINES_URL,
                    "source_symbol": "BTCUSDT",
                    "requested_start": start,
                    "requested_end": end,
                    "source_errors": source_errors or None,
                }
        except Exception as exc:
            source_errors[candidate] = str(exc)

    raise ValueError(f"No BTC daily history source succeeded: {source_errors}")


def fetch_yahoo_daily_history(*, start_date: str, end_date: str) -> list[dict[str, Any]]:
    start = max(date.fromisoformat(normalize_fetch_day(start_date)), date.fromisoformat(YAHOO_BTC_EARLIEST_DAY))
    end = date.fromisoformat(normalize_fetch_day(end_date))
    query = {
        "period1": str(to_unix_seconds(start.isoformat())),
        "period2": str(to_unix_seconds(end.isoformat())),
        "interval": "1d",
        "events": "history",
        "includeAdjustedClose": "true",
    }
    url = f"{YAHOO_CHART_URL}?{urllib.parse.urlencode(query)}"
    payload = _urlopen_json(url)
    rows = normalize_history_rows(rows_from_yahoo_chart(payload))
    if not rows:
        raise ValueError("Yahoo Finance returned no BTC-USD daily rows.")
    return rows


def fetch_binance_daily_history(*, start_date: str, end_date: str) -> list[dict[str, Any]]:
    start_ms = to_unix_seconds(start_date) * 1000
    one_day_ms = 24 * 60 * 60 * 1000
    end_ms = (to_unix_seconds(end_date) * 1000) + one_day_ms - 1
    rows: list[dict[str, Any]] = []
    cursor = start_ms
    while cursor <= end_ms:
        query = {
            "symbol": "BTCUSDT",
            "interval": "1d",
            "startTime": str(cursor),
            "endTime": str(end_ms),
            "limit": "1000",
        }
        url = f"{BINANCE_KLINES_URL}?{urllib.parse.urlencode(query)}"
        payload = _urlopen_json(url)
        if not payload:
            break
        for item in payload:
            open_time_ms = int(item[0])
            rows.append(
                {
                    "date": datetime.fromtimestamp(open_time_ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d"),
                    "open": float(item[1]),
                    "high": float(item[2]),
                    "low": float(item[3]),
                    "close": float(item[4]),
                    "volume": float(item[5]),
                }
            )
        next_cursor = int(payload[-1][0]) + one_day_ms
        if next_cursor <= cursor:
            break
        cursor = next_cursor

    normalized = normalize_history_rows(rows)
    if not normalized:
        raise ValueError("Binance returned no BTCUSDT daily rows.")
    return normalized


def read_history_file(path: Path) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if path.suffix.lower() == ".csv":
        with path.open(newline="", encoding="utf-8-sig") as handle:
            rows = [normalize_price_row(item) for item in csv.DictReader(handle)]
        return normalize_history_rows(rows), {"source": "csv", "source_symbol": "BTC-USD"}

    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, dict) and isinstance(payload.get("prices"), list):
        prices = payload["prices"]
        if prices and isinstance(prices[0], list):
            rows = rows_from_coingecko_prices(prices)
        else:
            rows = [normalize_price_row(item) for item in prices]
        return normalize_history_rows(rows), {
            "source": payload.get("source", "json"),
            "generated_at": payload.get("generated_at"),
            "source_url": payload.get("source_url"),
            "source_symbol": payload.get("source_symbol", "BTC-USD"),
            "requested_start": payload.get("requested_start"),
            "requested_end": payload.get("requested_end"),
            "source_errors": payload.get("source_errors"),
        }
    if isinstance(payload, list):
        return normalize_history_rows([normalize_price_row(item) for item in payload]), {"source": "json"}
    raise ValueError(f"Unsupported BTC daily dataset format: {path}")


def rows_from_yahoo_chart(payload: dict[str, Any]) -> list[dict[str, Any]]:
    chart = payload.get("chart") if isinstance(payload, dict) else None
    result = (chart.get("result") or [None])[0] if isinstance(chart, dict) else None
    if not isinstance(result, dict):
        error = chart.get("error") if isinstance(chart, dict) else None
        raise ValueError(f"Unexpected Yahoo chart payload: {error or 'missing result'}")

    timestamps = result.get("timestamp") or []
    quote = ((result.get("indicators") or {}).get("quote") or [{}])[0]
    if not isinstance(quote, dict):
        raise ValueError("Unexpected Yahoo chart payload: missing quote data")

    rows: list[dict[str, Any]] = []
    for index, timestamp in enumerate(timestamps):
        close = value_at(quote.get("close"), index)
        if close is None or close <= 0:
            continue
        day = datetime.fromtimestamp(int(timestamp), tz=timezone.utc).strftime("%Y-%m-%d")
        rows.append(
            {
                "date": day,
                "open": value_at(quote.get("open"), index) or close,
                "high": value_at(quote.get("high"), index) or close,
                "low": value_at(quote.get("low"), index) or close,
                "close": close,
                "volume": value_at(quote.get("volume"), index) or 0.0,
            }
        )
    return rows


def rows_from_coingecko_prices(prices: list[Any]) -> list[dict[str, Any]]:
    by_day: dict[str, float] = {}
    for item in prices:
        if not isinstance(item, list) or len(item) < 2:
            continue
        timestamp_ms = int(float(item[0]))
        price = float(item[1])
        day = datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
        by_day[day] = price
    return [{"date": day, "close": close} for day, close in sorted(by_day.items())]


def normalize_price_row(row: dict[str, Any]) -> dict[str, Any]:
    day = normalize_day(row.get("date") or row.get("timestamp") or row.get("time"))
    close = number(row.get("close") or row.get("price"))
    if close is None or close <= 0:
        raise ValueError(f"BTC close must be positive for {day}")
    normalized: dict[str, Any] = {"date": day, "close": close}
    for key in ("open", "high", "low", "volume"):
        value = number(row.get(key))
        if value is not None:
            normalized[key] = value
    return normalized


def normalize_history_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped: dict[str, dict[str, Any]] = {}
    for row in rows:
        normalized = normalize_price_row(row)
        deduped[str(normalized["date"])] = normalized
    return [deduped[day] for day in sorted(deduped.keys())]


def normalize_day(value: Any) -> str:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, datetime):
        parsed = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc).date().isoformat()
    if isinstance(value, (int, float)):
        numeric = int(value)
        seconds = numeric / 1000 if numeric > 10_000_000_000 else numeric
        return datetime.fromtimestamp(seconds, tz=timezone.utc).date().isoformat()
    text = str(value or "").strip()
    if not text:
        raise ValueError("Missing BTC history date.")
    if text.isdigit():
        return normalize_day(int(text))
    normalized = text.replace("Z", "+00:00")
    return datetime.fromisoformat(normalized).date().isoformat()


def normalize_fetch_day(value: str) -> str:
    return normalize_day(value)


def to_unix_seconds(day: str) -> int:
    parsed = datetime.combine(date.fromisoformat(normalize_fetch_day(day)), datetime.min.time(), tzinfo=timezone.utc)
    return int(parsed.timestamp())


def filter_rows(rows: list[dict[str, Any]], config: BacktestConfig | None) -> list[dict[str, Any]]:
    if config is None:
        return rows
    start_ms = parse_time_to_ms(config.start)
    end_ms = parse_time_to_ms(config.end)
    if config.lookback_days and start_ms is None and rows:
        reference_end = end_ms or parse_time_to_ms(rows[-1]["date"])
        if reference_end is not None:
            end_ms = end_ms or reference_end
            start_ms = reference_end - (int(config.lookback_days) * 24 * 60 * 60 * 1000)

    filtered: list[dict[str, Any]] = []
    for row in rows:
        timestamp_ms = parse_time_to_ms(row["date"])
        if timestamp_ms is None:
            continue
        if start_ms is not None and timestamp_ms < start_ms:
            continue
        if end_ms is not None and timestamp_ms > end_ms:
            continue
        filtered.append(row)
    return filtered


def normalize_source(source: str) -> str:
    normalized = str(source or DEFAULT_SOURCE).strip().lower()
    if normalized not in VALID_SOURCES:
        raise ValueError(f"BTC daily source must be one of {sorted(VALID_SOURCES)}")
    return normalized


def value_at(values: Any, index: int) -> float | None:
    if not isinstance(values, list) or index >= len(values):
        return None
    return number(values[index])


def number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    return float(value)


def _urlopen_json(url: str) -> Any:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))
