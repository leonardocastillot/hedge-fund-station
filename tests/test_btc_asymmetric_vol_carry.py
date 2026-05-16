from __future__ import annotations

import json
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

from backend.hyperliquid_gateway.backtesting.engine import BacktestConfig
from backend.hyperliquid_gateway.backtesting.registry import available_strategies, get_strategy_definition
from backend.hyperliquid_gateway.strategies.btc_asymmetric_vol_carry.backtest import (
    CHAMPION_RETURN_PCT, run_backtest,
)
from backend.hyperliquid_gateway.strategies.btc_asymmetric_vol_carry.logic import (
    evaluate_signal, STRATEGY_ID, COMPRESSION_LOOKBACK_DAYS, ATR_PERIOD,
)
from backend.hyperliquid_gateway.strategies.btc_asymmetric_vol_carry.paper import paper_candidate


class BtcAsymmetricVolCarryTest(unittest.TestCase):
    def test_panic_long_detected(self) -> None:
        rows = panic_rows()
        s = evaluate_signal(rows, len(rows) - 1)
        self.assertTrue(s["filters_passed"]["panic_long"])
        self.assertEqual(s["setup_type"], "panic_long")

    def test_compression_long_detected(self) -> None:
        rows = compression_rows()
        s = evaluate_signal(rows, len(rows) - 1)
        self.assertTrue(s["filters_passed"]["compression_long"])
        self.assertEqual(s["setup_type"], "compression_long")

    def test_long_exit_on_trend_failure(self) -> None:
        rows = panic_rows()
        entry_idx = len(rows) - 1
        entry = evaluate_signal(rows, entry_idx, in_position=False)
        self.assertEqual(entry["signal"], "long")

        ec = float(rows[-1]["close"])
        peak = ec
        for mult in [1.0]*10 + [0.97]*5 + [0.96]*5 + [0.94]*5:
            r = rows[-1].copy()
            ec = ec * mult
            r["close"] = round(ec, 8)
            rows.append(r)
            peak = max(peak, ec)

        exit_signal = evaluate_signal(
            rows, len(rows) - 1,
            in_position=True,
            trade_peak_close=peak,
            trade_entry_idx=entry_idx,
        )
        self.assertTrue(exit_signal["exit_trigger"])

    def test_backtest_runs_and_records_champion_comparison(self) -> None:
        prices = [100.0] * 210 + [150.0, 80.0, 70.0, 75.0, 90.0, 110.0, 130.0, 140.0, 145.0, 150.0]
        with tempfile.TemporaryDirectory() as tmp:
            dataset_path = Path(tmp) / "btc_daily.json"
            dataset_path.write_text(
                json.dumps({"source": "unit_fixture", "prices": price_rows(prices)}),
                encoding="utf-8",
            )
            result = run_backtest(dataset_path, BacktestConfig(fee_rate=0.0, risk_fraction=0.15, initial_equity=500.0))

        self.assertEqual(result["summary"]["strategy_id"], STRATEGY_ID)
        self.assertEqual(result["summary"]["champion_strategy"], "btc_convex_cycle_trend")
        self.assertEqual(result["summary"]["champion_return_pct"], CHAMPION_RETURN_PCT)
        self.assertIn("beats_champion", result["summary"])
        self.assertGreaterEqual(result["summary"]["total_trades"], 0)

    def test_registration_in_catalog(self) -> None:
        self.assertIn("btc_asymmetric_vol_carry", available_strategies())
        definition = get_strategy_definition("btc_asymmetric_vol_carry")
        self.assertEqual(definition.validation_policy.min_return_pct, 116.0)
        self.assertEqual(definition.validation_policy.max_drawdown_pct, 22.0)
        self.assertEqual(definition.dataset_label, "btc_usd_daily")

    def test_paper_candidate_gate(self) -> None:
        blocked = paper_candidate({"validation": {"status": "blocked", "blocking_reasons": ["min_return_pct"]}})
        ready = paper_candidate(
            {
                "validation": {"status": "ready-for-paper", "blocking_reasons": []},
                "report_summary": {"return_pct": 120.0, "beats_champion": True},
            }
        )
        self.assertEqual(blocked["status"], "blocked")
        self.assertEqual(blocked["promotion_gate"], "blocked-by-validation")
        self.assertEqual(ready["status"], "candidate")
        self.assertEqual(ready["promotion_gate"], "eligible-for-paper-review")
        self.assertIn("btc_asymmetric_vol_carry", ready["paperTradeMatch"]["setupTags"])


def panic_rows() -> list[dict[str, float | str]]:
    prices: list[float] = [100.0 + i * 0.3 for i in range(210)]
    for _ in range(20):
        prices.append(prices[-1] * 0.95)
    return price_rows(prices)


def compression_rows() -> list[dict[str, float | str]]:
    flat = [100.0] * 180
    tight = [100.0] * 40
    breakout = [101.0, 102.5, 104.0, 105.0, 106.0, 107.0]
    prices = flat + tight + breakout
    start = date(2020, 1, 1)
    rows: list[dict[str, float | str]] = []
    for idx, price in enumerate(prices):
        is_flat = idx < 180
        r = 0.012 if is_flat else 0.001
        rows.append({
            "date": (start + timedelta(days=idx)).isoformat(),
            "open": price,
            "high": price * (1 + r),
            "low": price * (1 - r),
            "close": price,
            "volume": 1_000_000.0,
        })
    return rows


def price_rows(prices: list[float], range_pct: float = 0.005) -> list[dict[str, float | str]]:
    start = date(2020, 1, 1)
    return [
        {
            "date": (start + timedelta(days=index)).isoformat(),
            "open": price,
            "high": price * (1 + range_pct),
            "low": price * (1 - range_pct),
            "close": price,
            "volume": 1_000_000.0,
        }
        for index, price in enumerate(prices)
    ]


if __name__ == "__main__":
    unittest.main()
