from __future__ import annotations

import json
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

from backend.hyperliquid_gateway.backtesting.engine import BacktestConfig
from backend.hyperliquid_gateway.backtesting.registry import available_strategies, get_strategy_definition
from backend.hyperliquid_gateway.strategies.btc_convex_cycle_trend.backtest import CHAMPION_RETURN_PCT, run_backtest
from backend.hyperliquid_gateway.strategies.btc_convex_cycle_trend.logic import evaluate_signal
from backend.hyperliquid_gateway.strategies.btc_convex_cycle_trend.paper import paper_candidate


class BtcConvexCycleTrendTest(unittest.TestCase):
    def test_entry_signal_marks_convex_regime_and_25_pct_target(self) -> None:
        rows = convex_trend_rows()

        signal = evaluate_signal(rows, len(rows) - 1)

        self.assertEqual(signal["signal"], "long")
        self.assertTrue(signal["convex_regime"])
        self.assertEqual(signal["target_exposure_fraction"], 0.25)
        self.assertTrue(signal["filters_passed"]["close_above_sma150"])
        self.assertTrue(signal["filters_passed"]["momentum_30d_clear"])

    def test_base_entry_uses_12_pct_when_rsi_is_overheated(self) -> None:
        rows = price_rows([100.0] * 120 + [101.0 + (index * 0.5) for index in range(80)])

        signal = evaluate_signal(rows, len(rows) - 1)

        self.assertEqual(signal["signal"], "long")
        self.assertFalse(signal["convex_regime"])
        self.assertEqual(signal["target_exposure_fraction"], 0.12)

    def test_backtest_records_champion_comparison_fields(self) -> None:
        prices = [100.0] * 120 + [101.0 + (index * 0.7) for index in range(70)] + [140.0, 132.0, 120.0, 112.0]
        with tempfile.TemporaryDirectory() as tmp:
            dataset_path = Path(tmp) / "btc_daily.json"
            dataset_path.write_text(json.dumps({"source": "unit_fixture", "prices": price_rows(prices)}), encoding="utf-8")

            result = run_backtest(dataset_path, BacktestConfig(fee_rate=0.0, risk_fraction=0.25, initial_equity=500.0))

        self.assertEqual(result["summary"]["strategy_id"], "btc_convex_cycle_trend")
        self.assertEqual(result["summary"]["champion_strategy"], "btc_adaptive_cycle_trend")
        self.assertEqual(result["summary"]["champion_return_pct"], CHAMPION_RETURN_PCT)
        self.assertIn("beats_champion", result["summary"])
        self.assertGreaterEqual(result["summary"]["total_trades"], 1)

    def test_validation_policy_and_registration(self) -> None:
        definition = get_strategy_definition("btc_convex_cycle_trend")

        self.assertIn("btc_convex_cycle_trend", available_strategies())
        self.assertEqual(definition.validation_policy.min_return_pct, 95.0)
        self.assertEqual(definition.validation_policy.max_drawdown_pct, 20.0)
        self.assertEqual(definition.dataset_label, "btc_usd_daily")

    def test_paper_candidate_uses_validation_gate(self) -> None:
        blocked = paper_candidate({"validation": {"status": "blocked", "blocking_reasons": ["min_return_pct"]}})
        ready = paper_candidate(
            {
                "validation": {"status": "ready-for-paper", "blocking_reasons": []},
                "report_summary": {"return_pct": 115.78, "beats_champion": True},
            }
        )

        self.assertEqual(blocked["status"], "blocked")
        self.assertEqual(blocked["promotion_gate"], "blocked-by-validation")
        self.assertEqual(ready["status"], "candidate")
        self.assertEqual(ready["promotion_gate"], "eligible-for-paper-review")
        self.assertIn("btc_convex_cycle_trend", ready["paperTradeMatch"]["setupTags"])


def convex_trend_rows() -> list[dict[str, float | str]]:
    prices: list[float] = [100.0] * 120
    price = 100.0
    for index in range(100):
        price += 1.3 if index % 4 in (0, 1) else -0.4
        prices.append(round(price, 4))
    return price_rows(prices)


def price_rows(prices: list[float]) -> list[dict[str, float | str]]:
    start = date(2020, 1, 1)
    return [
        {
            "date": (start + timedelta(days=index)).isoformat(),
            "open": price,
            "high": price,
            "low": price,
            "close": price,
            "volume": 1_000_000.0,
        }
        for index, price in enumerate(prices)
    ]


if __name__ == "__main__":
    unittest.main()
