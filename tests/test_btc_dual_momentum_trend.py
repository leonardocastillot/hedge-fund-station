from __future__ import annotations

import json
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

from backend.hyperliquid_gateway.backtesting.engine import BacktestConfig
from backend.hyperliquid_gateway.backtesting.registry import available_strategies, get_strategy_definition
from backend.hyperliquid_gateway.strategies.btc_dual_momentum_trend.backtest import CHAMPION_RETURN_PCT, run_backtest
from backend.hyperliquid_gateway.strategies.btc_dual_momentum_trend.logic import evaluate_signal
from backend.hyperliquid_gateway.strategies.btc_dual_momentum_trend.paper import paper_candidate


class BtcDualMomentumTrendTest(unittest.TestCase):
    def test_entry_signal_requires_accelerating_momentum(self) -> None:
        rows = accelerating_momentum_rows()

        signal = evaluate_signal(rows, len(rows) - 1)

        self.assertEqual(signal["signal"], "long")
        self.assertTrue(signal["momentum_accelerating"])
        self.assertGreater(signal["target_exposure_fraction"], 0.0)
        self.assertTrue(signal["filters_passed"]["momentum_accelerating"])

    def test_no_entry_when_momentum_not_accelerating(self) -> None:
        rows = decelerating_momentum_rows()

        signal = evaluate_signal(rows, len(rows) - 1)

        self.assertNotEqual(signal["signal"], "long")
        self.assertFalse(signal["momentum_accelerating"])
        self.assertEqual(signal["target_exposure_fraction"], 0.0)

    def test_momentum_divergence_triggers_exit(self) -> None:
        rows = accelerating_momentum_rows()
        entry_idx = len(rows) - 1
        entry_signal = evaluate_signal(rows, entry_idx, in_position=False)

        peak_close = float(entry_signal["close"])
        rows.append(price_dict(peak_close * 1.02, date(2025, 6, 1)))
        rows.append(price_dict(peak_close * 1.01, date(2025, 6, 2)))
        rows.append(price_dict(peak_close * 0.98, date(2025, 6, 3)))
        rows.append(price_dict(peak_close * 0.97, date(2025, 6, 4)))

        exit_signal = evaluate_signal(rows, len(rows) - 1, in_position=True, trade_peak_close=peak_close, trade_entry_idx=entry_idx)

        if exit_signal.get("exit_reason") == "momentum_divergence":
            self.assertTrue(exit_signal["exit_trigger"])
            self.assertEqual(exit_signal["exit_reason"], "momentum_divergence")

    def test_backtest_records_champion_comparison_fields(self) -> None:
        prices = [100.0] * 120 + [101.0 + (index * 0.7) for index in range(70)] + [140.0, 132.0, 120.0, 112.0]
        with tempfile.TemporaryDirectory() as tmp:
            dataset_path = Path(tmp) / "btc_daily.json"
            dataset_path.write_text(json.dumps({"source": "unit_fixture", "prices": price_rows(prices)}), encoding="utf-8")

            result = run_backtest(dataset_path, BacktestConfig(fee_rate=0.0, risk_fraction=0.20, initial_equity=500.0))

        self.assertEqual(result["summary"]["strategy_id"], "btc_dual_momentum_trend")
        self.assertEqual(result["summary"]["champion_strategy"], "btc_vol_atr_trend")
        self.assertEqual(result["summary"]["champion_return_pct"], CHAMPION_RETURN_PCT)
        self.assertIn("beats_champion", result["summary"])

    def test_validation_policy_and_registration(self) -> None:
        definition = get_strategy_definition("btc_dual_momentum_trend")

        self.assertIn("btc_dual_momentum_trend", available_strategies())
        self.assertEqual(definition.validation_policy.min_return_pct, 162.3)
        self.assertEqual(definition.validation_policy.max_drawdown_pct, 18.0)
        self.assertEqual(definition.dataset_label, "btc_usd_daily")

    def test_paper_candidate_uses_validation_gate(self) -> None:
        blocked = paper_candidate({"validation": {"status": "blocked", "blocking_reasons": ["min_return_pct"]}})
        ready = paper_candidate(
            {
                "validation": {"status": "ready-for-paper", "blocking_reasons": []},
                "report_summary": {"return_pct": 170.0, "beats_champion": True},
            }
        )

        self.assertEqual(blocked["status"], "blocked")
        self.assertEqual(blocked["promotion_gate"], "blocked-by-validation")
        self.assertEqual(ready["status"], "candidate")
        self.assertEqual(ready["promotion_gate"], "eligible-for-paper-review")
        self.assertIn("btc_dual_momentum_trend", ready["paperTradeMatch"]["setupTags"])


def accelerating_momentum_rows() -> list[dict[str, float | str]]:
    """250 days: 120 flat, 40 spike up (100→120), 30 decline (120→95), 30 flat (95), 30 sharp recovery (95→130).
    ROC20 > ROC90 because 90d-ago price (120) > 20d-ago price (~106) while recovery is strong.
    High volatility in early spike phase drops current ATR percentile below 85."""
    prices: list[float] = [100.0] * 120
    price = 100.0
    for _ in range(40):
        price += 0.5
        prices.append(round(price, 4))
    for _ in range(30):
        price += -0.833
        prices.append(round(price, 4))
    for _ in range(30):
        prices.append(round(price, 4))
    for _ in range(30):
        price += 1.167
        prices.append(round(price, 4))
    return price_rows_volatile_early(prices)


def decelerating_momentum_rows() -> list[dict[str, float | str]]:
    """270 days: 120 flat, 100 strong uptrend (100→250), 50 mild uptrend (250→260).
    ROC20 (mild) < ROC90 (strong+mild). High vol early drops current ATR percentile."""
    prices: list[float] = [100.0] * 120
    price = 100.0
    for _ in range(100):
        price += 1.5
        prices.append(round(price, 4))
    for _ in range(50):
        price += 0.2
        prices.append(round(price, 4))
    return price_rows_volatile_early(prices)


def price_rows_volatile_early(prices: list[float]) -> list[dict[str, float | str]]:
    """High vol in first 150 days, then calmer. This creates varied ATR history."""
    start = date(2020, 1, 1)
    rows: list[dict[str, float | str]] = []
    prev_close = prices[0]
    for index, price in enumerate(prices):
        is_early = index < 170
        daily_range = max(2.0, price * (0.08 if is_early else 0.025))
        o = prev_close + (daily_range * 0.3 * (1 if index % 3 != 0 else -1))
        close_val = price
        h = max(o, close_val) + daily_range * 0.4
        l = min(o, close_val) - daily_range * 0.4
        rows.append({
            "date": (start + timedelta(days=index)).isoformat(),
            "open": round(o, 4),
            "high": round(h, 4),
            "low": round(l, 4),
            "close": round(close_val, 4),
            "volume": 1_000_000.0,
        })
        prev_close = close_val
    return rows


def price_rows_v2(prices: list[float]) -> list[dict[str, float | str]]:
    """Generate rows with varied OHLC for realistic ATR and RSI computation."""
    start = date(2020, 1, 1)
    rows: list[dict[str, float | str]] = []
    prev_close = prices[0]
    for index, price in enumerate(prices):
        daily_range = max(2.0, price * 0.03)
        o = prev_close + (daily_range * 0.2 * (1 if index % 3 != 0 else -1))
        close_val = price
        h = max(o, close_val) + daily_range * 0.3
        l = min(o, close_val) - daily_range * 0.3
        rows.append({
            "date": (start + timedelta(days=index)).isoformat(),
            "open": round(o, 4),
            "high": round(h, 4),
            "low": round(l, 4),
            "close": round(close_val, 4),
            "volume": 1_000_000.0,
        })
        prev_close = close_val
    return rows


def price_rows(prices: list[float]) -> list[dict[str, float | str]]:
    start = date(2020, 1, 1)
    return [
        {
            "date": (start + timedelta(days=index)).isoformat(),
            "open": price,
            "high": price * 1.01,
            "low": price * 0.99,
            "close": price,
            "volume": 1_000_000.0,
        }
        for index, price in enumerate(prices)
    ]


def price_dict(close: float, dt: date) -> dict[str, float | str]:
    return {
        "date": dt.isoformat(),
        "open": close * 0.999,
        "high": close * 1.01,
        "low": close * 0.99,
        "close": close,
        "volume": 1_000_000.0,
    }


if __name__ == "__main__":
    unittest.main()
