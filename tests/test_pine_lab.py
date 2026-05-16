from __future__ import annotations

import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.hyperliquid_gateway import app as gateway_app
from backend.hyperliquid_gateway.app import app
from backend.hyperliquid_gateway.pine_lab import build_preview, deterministic_pine_indicator, ema, rsi, sma


def fixture_candles(count: int = 40) -> list[dict[str, float | int]]:
    rows: list[dict[str, float | int]] = []
    for index in range(count):
        close = 100 + index
        rows.append(
            {
                "time": 1_700_000_000_000 + index * 3_600_000,
                "open": close - 0.5,
                "high": close + 1,
                "low": close - 1,
                "close": close,
                "volume": 1000 + index * 25,
            }
        )
    return rows


class PineLabTest(unittest.TestCase):
    def test_basic_indicator_calculations(self) -> None:
        values = [1, 2, 3, 4, 5, 6]

        self.assertEqual(sma(values, 3), [None, None, 2, 3, 4, 5])
        self.assertIsNone(ema(values, 3)[1])
        self.assertAlmostEqual(ema(values, 3)[2] or 0, 2.25)
        self.assertIsNone(rsi(values, 3)[2])
        self.assertEqual(rsi(values, 3)[3], 100)

    def test_preview_builds_supported_overlays_and_markers(self) -> None:
        preview = build_preview(fixture_candles(), {"kind": "crossover", "fastPeriod": 3, "slowPeriod": 5})

        self.assertTrue(preview["supported"])
        self.assertEqual(len(preview["overlays"]), 2)
        self.assertIn("markers", preview)

    def test_unsupported_preview_is_explicit(self) -> None:
        preview = build_preview(fixture_candles(), {"kind": "unsupported", "reason": "too complex"})

        self.assertFalse(preview["supported"])
        self.assertEqual(preview["reason"], "too complex")

    def test_generate_endpoint_smoke(self) -> None:
        async def fake_generate(payload: dict[str, object]) -> dict[str, object]:
            return deterministic_pine_indicator(str(payload["request"]))

        async def fake_post_info(payload: dict[str, object]) -> list[dict[str, float | int | str]]:
            self.assertEqual(payload["type"], "candleSnapshot")
            return [
                {
                    "t": candle["time"],
                    "o": str(candle["open"]),
                    "h": str(candle["high"]),
                    "l": str(candle["low"]),
                    "c": str(candle["close"]),
                    "v": str(candle["volume"]),
                }
                for candle in fixture_candles()
            ]

        client = TestClient(app)
        with patch.object(gateway_app, "generate_pine_indicator", fake_generate), patch.object(gateway_app, "post_info", fake_post_info):
            response = client.post(
                "/api/hyperliquid/pine/indicators/generate",
                json={
                    "request": "hazme un indicador que marque rompimientos con RSI y volumen",
                    "symbol": "BTC",
                    "interval": "1h",
                    "lookback_hours": 48,
                    "indicator_type": "indicator",
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["pineCode"].startswith("//@version=6"))
        self.assertTrue(payload["preview"]["supported"])
        self.assertGreater(len(payload["candles"]["candles"]), 0)

    def test_generate_endpoint_allows_daily_preview_lookback(self) -> None:
        async def fake_generate(payload: dict[str, object]) -> dict[str, object]:
            self.assertEqual(payload["interval"], "1d")
            self.assertEqual(payload["lookback_hours"], 4320)
            return deterministic_pine_indicator("bollinger bands")

        async def fake_post_info(payload: dict[str, object]) -> list[dict[str, float | int | str]]:
            request = payload["req"]  # type: ignore[index]
            self.assertEqual(request["interval"], "1d")  # type: ignore[index]
            self.assertGreater(request["endTime"], request["startTime"])  # type: ignore[index]
            return [
                {
                    "t": candle["time"],
                    "o": str(candle["open"]),
                    "h": str(candle["high"]),
                    "l": str(candle["low"]),
                    "c": str(candle["close"]),
                    "v": str(candle["volume"]),
                }
                for candle in fixture_candles(80)
            ]

        client = TestClient(app)
        with patch.object(gateway_app, "generate_pine_indicator", fake_generate), patch.object(gateway_app, "post_info", fake_post_info):
            response = client.post(
                "/api/hyperliquid/pine/indicators/generate",
                json={
                    "request": "hazme un indicador de bandas de Bollinger para ver el diario",
                    "symbol": "BTC",
                    "interval": "1d",
                    "lookback_hours": 4320,
                    "indicator_type": "indicator",
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["lookbackHours"], 4320)
        self.assertEqual(payload["interval"], "1d")
        self.assertTrue(payload["preview"]["supported"])


if __name__ == "__main__":
    unittest.main()
