from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from backend.hyperliquid_gateway.backtesting.engine import BacktestConfig
from backend.hyperliquid_gateway.backtesting.registry import available_strategies
from backend.hyperliquid_gateway.strategies.one_bitcoin.backtest import (
    execute_purchase,
    run_accumulation_variants,
    run_backtest,
    select_primary_variant,
)
from backend.hyperliquid_gateway.strategies.one_bitcoin.logic import evaluate_dip_signal, evaluate_sell_signal, strategy_config
from backend.hyperliquid_gateway.strategies.one_bitcoin.paper import paper_candidate
from backend.hyperliquid_gateway.strategies.one_bitcoin.risk import build_risk_plan


class OneBitcoinStrategyTest(unittest.TestCase):
    def test_purchase_accounts_for_fee_and_slippage(self) -> None:
        purchase = execute_purchase(
            variant_id="dca_monthly",
            day="2020-01-01",
            close=100.0,
            cash=300.0,
            requested_usd=300.0,
            reason="starting_cash",
            config=strategy_config(),
        )

        self.assertIsNotNone(purchase)
        assert purchase is not None
        self.assertEqual(purchase["fee_usd"], 0.3)
        self.assertAlmostEqual(float(purchase["fill_price"]), 100.05, places=6)
        self.assertAlmostEqual(float(purchase["btc_bought"]), 2.99550225, places=8)
        self.assertAlmostEqual(float(purchase["cash_after_usd"]), 0.0, places=8)

    def test_dip_trigger_thresholds(self) -> None:
        base = [80.0] * 166 + [87.0, 88.0, 89.0, 90.0, 91.0, 92.0, 93.0, 94.0, 95.0, 96.0, 97.0, 98.0, 99.0, 100.0]

        moderate = evaluate_dip_signal(price_rows(base + [90.0]), 180)
        deep = evaluate_dip_signal(price_rows(base + [80.0]), 180)
        crash = evaluate_dip_signal(price_rows(base + [70.0]), 180)

        self.assertEqual(moderate["severity"], "moderate")
        self.assertEqual(moderate["deploy_fraction"], 0.25)
        self.assertEqual(deep["severity"], "deep")
        self.assertEqual(deep["deploy_fraction"], 0.5)
        self.assertEqual(crash["severity"], "crash")
        self.assertEqual(crash["deploy_fraction"], 1.0)

    def test_reserve_cooldown_limits_back_to_back_dip_buys(self) -> None:
        rows = price_rows([100.0] * 180 + [90.0, 89.0, 88.0, 87.0, 86.0, 85.0, 84.0])
        variants = run_accumulation_variants(rows, config={"spot_buy_fee_rate": 0.0, "adverse_slippage_rate": 0.0})
        dip_trades = [
            trade
            for trade in variants["dip_reserve"]["trades"]
            if str(trade["reason"]).startswith("dip_")
        ]

        self.assertEqual(len(dip_trades), 1)
        self.assertEqual(dip_trades[0]["entry_timestamp"], "2020-06-29")

    def test_dca_reaches_one_btc_and_reports_goal_metrics(self) -> None:
        rows = [
            {"date": "2020-01-01", "close": 600.0},
            {"date": "2020-02-01", "close": 600.0},
            {"date": "2020-03-01", "close": 600.0},
        ]
        variants = run_accumulation_variants(rows, config={"spot_buy_fee_rate": 0.0, "adverse_slippage_rate": 0.0})
        metrics = variants["dca_monthly"]["metrics"]

        self.assertEqual(metrics["btc_balance"], 1.5)
        self.assertTrue(metrics["goal_reached"])
        self.assertEqual(metrics["goal_reached_date"], "2020-02-01")
        self.assertEqual(metrics["percent_to_one_btc"], 150.0)
        self.assertEqual(metrics["average_cost_basis"], 600.0)

    def test_synthetic_backtest_compares_all_variants(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            dataset_path = Path(tmp) / "btc_daily.json"
            dataset_path.write_text(
                json.dumps(
                    {
                        "source": "unit_fixture",
                        "prices": [
                            {"date": "2020-01-01", "close": 100.0},
                            {"date": "2020-02-01", "close": 120.0},
                            {"date": "2020-03-01", "close": 90.0},
                            {"date": "2020-04-01", "close": 80.0},
                            {"date": "2020-05-01", "close": 130.0},
                        ],
                    }
                ),
                encoding="utf-8",
            )

            result = run_backtest(dataset_path, BacktestConfig())

        self.assertEqual(result["summary"]["strategy_id"], "one_bitcoin")
        self.assertEqual(result["summary"]["primary_variant"], "dca_monthly")
        self.assertEqual(
            {row["variant_id"] for row in result["variant_results"]},
            {
                "dca_monthly",
                "dip_reserve",
                "hybrid_accumulator",
                "hybrid_trend_filtered",
                "aggressive_dip_accumulator",
                "drawdown_weighted_dca",
                "cycle_harvest_accumulator",
            },
        )
        self.assertEqual(result["robust_assessment"]["status"], "blocked")
        self.assertIn("accumulation_strategy_not_execution_route", result["robust_assessment"]["blockers"])
        self.assertIn("execution_promotion_disabled_by_design", result["robust_assessment"]["blockers"])

    def test_primary_variant_selects_highest_btc_balance(self) -> None:
        rows = [
            {"date": "2020-01-01", "close": 100.0},
            {"date": "2020-02-01", "close": 120.0},
            {"date": "2020-03-01", "close": 90.0},
            {"date": "2020-04-01", "close": 80.0},
            {"date": "2020-05-01", "close": 130.0},
        ]
        variants = run_accumulation_variants(rows, config={"spot_buy_fee_rate": 0.0, "adverse_slippage_rate": 0.0})

        primary = select_primary_variant(variants)

        self.assertEqual(primary["variant_id"], "dca_monthly")
        self.assertEqual(primary["metrics"]["btc_balance"], max(variant["metrics"]["btc_balance"] for variant in variants.values()))

    def test_cycle_harvest_variant_can_trim_overheated_btc_for_rebuy_research(self) -> None:
        rows = price_rows([100.0] * 365 + [300.0, 305.0, 302.0, 299.0])

        sell_signal = evaluate_sell_signal(rows, 368)
        variants = run_accumulation_variants(rows, config={"spot_buy_fee_rate": 0.0, "adverse_slippage_rate": 0.0})
        cycle = variants["cycle_harvest_accumulator"]

        self.assertEqual(sell_signal["signal"], "sell_cycle_trim")
        self.assertGreater(cycle["metrics"]["sell_count"], 0)
        self.assertTrue(any(trade["side"] == "sell" for trade in cycle["trades"]))

    def test_risk_and_paper_helpers_block_execution_promotion(self) -> None:
        risk = build_risk_plan()
        candidate = paper_candidate({"validation": {"status": "blocked"}, "report_summary": {"btc_balance": 0.1}})

        self.assertFalse(risk["paper_allowed"])
        self.assertFalse(risk["live_allowed"])
        self.assertEqual(candidate["status"], "blocked")
        self.assertEqual(candidate["promotion_gate"], "blocked-accumulation-research-only")

    def test_strategy_is_registered(self) -> None:
        self.assertIn("one_bitcoin", available_strategies())


def price_rows(prices: list[float]) -> list[dict[str, float | str]]:
    rows: list[dict[str, float | str]] = []
    start_ordinal = 737425
    for index, price in enumerate(prices):
        rows.append({"date": date_from_ordinal(start_ordinal + index), "close": price})
    return rows


def date_from_ordinal(value: int) -> str:
    from datetime import date

    return date.fromordinal(value).isoformat()


if __name__ == "__main__":
    unittest.main()
