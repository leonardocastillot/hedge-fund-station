from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.hyperliquid_gateway.backtesting.btc_daily_history import (
    fetch_and_cache_btc_daily_history,
    fetch_btc_daily_history,
    load_btc_daily_history,
    rows_from_yahoo_chart,
)
from backend.hyperliquid_gateway.backtesting.engine import BacktestConfig


class BtcDailyHistoryTest(unittest.TestCase):
    def test_rows_from_yahoo_chart_normalizes_ohlcv(self) -> None:
        rows = rows_from_yahoo_chart(yahoo_payload())

        self.assertEqual(rows[0]["date"], "2020-01-01")
        self.assertEqual(rows[0]["close"], 7250.0)
        self.assertEqual(rows[0]["volume"], 100.0)
        self.assertEqual(rows[1]["date"], "2020-01-02")

    def test_fetch_and_cache_yahoo_history(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "btc_daily.json"
            with patch(
                "backend.hyperliquid_gateway.backtesting.btc_daily_history._urlopen_json",
                return_value=yahoo_payload(),
            ):
                rows, metadata = fetch_and_cache_btc_daily_history(
                    output,
                    source="yahoo",
                    start_date="2020-01-01",
                    end_date="2020-01-02",
                )

            payload = json.loads(output.read_text(encoding="utf-8"))

        self.assertEqual(metadata["source"], "yahoo_finance_chart")
        self.assertEqual(len(rows), 2)
        self.assertEqual(payload["source_symbol"], "BTC-USD")
        self.assertEqual(payload["prices"][1]["close"], 7350.0)

    def test_auto_source_falls_back_to_binance(self) -> None:
        def fake_urlopen_json(url: str) -> object:
            if "finance.yahoo.com" in url:
                raise RuntimeError("yahoo down")
            return [
                [
                    1577836800000,
                    "7200.0",
                    "7300.0",
                    "7100.0",
                    "7250.0",
                    "123.4",
                    1577923199999,
                    "0",
                    1,
                    "0",
                    "0",
                    "0",
                ]
            ]

        with patch("backend.hyperliquid_gateway.backtesting.btc_daily_history._urlopen_json", side_effect=fake_urlopen_json):
            rows, metadata = fetch_btc_daily_history(source="auto", start_date="2020-01-01", end_date="2020-01-01")

        self.assertEqual(metadata["source"], "binance_public_klines")
        self.assertIn("yahoo", metadata["source_errors"])
        self.assertEqual(rows[0]["close"], 7250.0)

    def test_load_local_history_respects_backtest_lookback(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            dataset = Path(tmp) / "btc_daily.json"
            dataset.write_text(
                json.dumps(
                    {
                        "source": "fixture",
                        "prices": [
                            {"date": "2020-01-01", "close": 7000.0},
                            {"date": "2020-01-02", "close": 7100.0},
                            {"date": "2020-01-03", "close": 7200.0},
                        ],
                    }
                ),
                encoding="utf-8",
            )

            rows, metadata = load_btc_daily_history(dataset, BacktestConfig(lookback_days=1))

        self.assertEqual(metadata["source"], "fixture")
        self.assertEqual([row["date"] for row in rows], ["2020-01-02", "2020-01-03"])


def yahoo_payload() -> dict[str, object]:
    return {
        "chart": {
            "result": [
                {
                    "timestamp": [1577836800, 1577923200],
                    "indicators": {
                        "quote": [
                            {
                                "open": [7200.0, 7250.0],
                                "high": [7300.0, 7400.0],
                                "low": [7100.0, 7200.0],
                                "close": [7250.0, 7350.0],
                                "volume": [100.0, 110.0],
                            }
                        ]
                    },
                }
            ],
            "error": None,
        }
    }


if __name__ == "__main__":
    unittest.main()
