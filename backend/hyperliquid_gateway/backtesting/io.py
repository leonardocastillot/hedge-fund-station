from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


@dataclass(frozen=True)
class Candle:
    timestamp: str
    epoch_ms: int
    open: float
    high: float
    low: float
    close: float
    volume: float


def canonicalize_ohlcv_csv(csv_path: Path) -> list[Candle]:
    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames:
            raise ValueError(f"{csv_path} does not contain headers.")

        fields = {_normalize_name(name): name for name in reader.fieldnames}
        timestamp_key = _resolve_column(fields, ("datetime", "timestamp", "date", "time"))
        open_key = _resolve_column(fields, ("open",))
        high_key = _resolve_column(fields, ("high",))
        low_key = _resolve_column(fields, ("low",))
        close_key = _resolve_column(fields, ("close",))
        volume_key = _resolve_column(fields, ("volume", "vol"))

        candles: list[Candle] = []
        for row in reader:
            timestamp_value = row[timestamp_key]
            epoch_ms = _parse_timestamp(timestamp_value)
            candles.append(
                Candle(
                    timestamp=_iso_timestamp(epoch_ms),
                    epoch_ms=epoch_ms,
                    open=float(row[open_key]),
                    high=float(row[high_key]),
                    low=float(row[low_key]),
                    close=float(row[close_key]),
                    volume=float(row[volume_key]),
                )
            )

    candles.sort(key=lambda item: item.epoch_ms)
    if len(candles) < 50:
        raise ValueError(f"{csv_path} has only {len(candles)} candles. Need at least 50.")
    return candles


def list_csv_files(root: Path) -> list[Path]:
    if not root.exists():
        return []
    return sorted(path for path in root.rglob("*.csv") if path.is_file())


def dataset_metadata(candles: Iterable[Candle], csv_path: Path) -> dict[str, object]:
    candle_list = list(candles)
    if not candle_list:
        raise ValueError("Dataset is empty.")
    return {
        "path": str(csv_path),
        "rows": len(candle_list),
        "start": candle_list[0].timestamp,
        "end": candle_list[-1].timestamp,
    }


def _resolve_column(fields: dict[str, str], candidates: tuple[str, ...]) -> str:
    for candidate in candidates:
        if candidate in fields:
            return fields[candidate]
    raise ValueError(f"Missing required column. Expected one of: {', '.join(candidates)}")


def _normalize_name(value: str) -> str:
    return value.strip().lower().replace(" ", "").replace("_", "")


def _parse_timestamp(value: str) -> int:
    cleaned = value.strip()
    if cleaned.isdigit():
        numeric = int(cleaned)
        return numeric if numeric > 10_000_000_000 else numeric * 1000

    normalized = cleaned.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return int(parsed.timestamp() * 1000)


def _iso_timestamp(epoch_ms: int) -> str:
    return datetime.fromtimestamp(epoch_ms / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
