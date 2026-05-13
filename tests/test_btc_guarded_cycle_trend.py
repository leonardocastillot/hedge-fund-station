from __future__ import annotations

import asyncio
import json
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

from backend.hyperliquid_gateway import app as gateway_app
from backend.hyperliquid_gateway.backtesting.engine import BacktestConfig
from backend.hyperliquid_gateway.backtesting.registry import available_strategies, get_strategy_definition
from backend.hyperliquid_gateway.strategies.btc_guarded_cycle_trend.backtest import run_backtest
from backend.hyperliquid_gateway.strategies.btc_guarded_cycle_trend.logic import evaluate_signal
from backend.hyperliquid_gateway.strategies.btc_guarded_cycle_trend.paper import build_paper_runtime_plan, paper_candidate


class BtcGuardedCycleTrendTest(unittest.TestCase):
    def test_entry_signal_requires_guarded_daily_uptrend(self) -> None:
        rows = price_rows([100.0] * 120 + [101.0 + (index * 0.5) for index in range(80)])

        signal = evaluate_signal(rows, len(rows) - 1)

        self.assertEqual(signal["signal"], "long")
        self.assertTrue(signal["filters_passed"]["close_above_sma150"])
        self.assertTrue(signal["filters_passed"]["sma50_above_sma150"])
        self.assertGreater(signal["rsi14"], 42.0)

    def test_exit_signal_uses_trade_peak_drawdown(self) -> None:
        rows = price_rows([100.0] * 180 + [120.0])

        signal = evaluate_signal(rows, len(rows) - 1, in_position=True, trade_peak_close=150.0)

        self.assertEqual(signal["signal"], "exit")
        self.assertEqual(signal["exit_reason"], "trailing_stop")

    def test_backtest_opens_and_closes_daily_trade(self) -> None:
        prices = [100.0] * 120 + [101.0 + (index * 0.5) for index in range(70)] + [130.0, 124.0, 116.0, 110.0]
        with tempfile.TemporaryDirectory() as tmp:
            dataset_path = Path(tmp) / "btc_daily.json"
            dataset_path.write_text(json.dumps({"source": "unit_fixture", "prices": price_rows(prices)}), encoding="utf-8")

            result = run_backtest(dataset_path, BacktestConfig(fee_rate=0.0, risk_fraction=0.10))

        self.assertEqual(result["summary"]["strategy_id"] if "strategy_id" in result["summary"] else "btc_guarded_cycle_trend", "btc_guarded_cycle_trend")
        self.assertGreaterEqual(result["summary"]["total_trades"], 1)
        self.assertTrue(any(trade["exit_reason"] in {"trailing_stop", "forced_close"} for trade in result["trades"]))
        self.assertEqual(result["dataset"]["symbol"], "BTC")

    def test_validation_policy_and_registration(self) -> None:
        definition = get_strategy_definition("btc_guarded_cycle_trend")

        self.assertIn("btc_guarded_cycle_trend", available_strategies())
        self.assertEqual(definition.validation_policy.min_return_pct, 50.0)
        self.assertEqual(definition.validation_policy.min_trades, 10)
        self.assertEqual(definition.dataset_label, "btc_usd_daily")

    def test_paper_candidate_blocks_when_validation_blocks(self) -> None:
        candidate = paper_candidate({"validation": {"status": "blocked", "blocking_reasons": ["min_return_pct"]}})

        self.assertEqual(candidate["status"], "blocked")
        self.assertEqual(candidate["promotion_gate"], "blocked-by-validation")
        self.assertIn("btc_guarded_cycle_trend", candidate["paperTradeMatch"]["setupTags"])

    def test_500_usd_paper_runtime_opens_50_usd_and_blocks_duplicate(self) -> None:
        rows = price_rows([100.0] * 120 + [101.0 + (index * 0.5) for index in range(80)])

        entry_plan = build_paper_runtime_plan(rows, [], portfolio_value=500.0)

        self.assertEqual(entry_plan["status"], "entry-ready")
        self.assertTrue(entry_plan["entry"]["shouldOpen"])
        self.assertEqual(entry_plan["entry"]["tradePayload"]["size_usd"], 50.0)

        duplicate_plan = build_paper_runtime_plan(
            rows,
            [
                {
                    "symbol": "BTC",
                    "setupTag": "btc_guarded_cycle_trend",
                    "status": "open",
                    "side": "long",
                    "entryPrice": 120.0,
                    "sizeUsd": 50.0,
                    "createdAt": 0,
                }
            ],
            portfolio_value=500.0,
        )

        self.assertEqual(duplicate_plan["status"], "managing-open-trade")
        self.assertFalse(duplicate_plan["entry"]["shouldOpen"])
        self.assertEqual(duplicate_plan["entry"]["blockReason"], "matching_open_trade")
        self.assertIsNone(duplicate_plan["entry"]["tradePayload"])

    def test_paper_runtime_tick_dry_run_does_not_apply_plan(self) -> None:
        rows = price_rows([100.0] * 120 + [101.0 + (index * 0.5) for index in range(80)])

        async def noop_overview() -> None:
            return None

        def fail_apply(*_args: object, **_kwargs: object) -> dict[str, object]:
            raise AssertionError("dry-run runtime tick must not write paper trades")

        original = {
            "ensure_overview_data": gateway_app.ensure_overview_data,
            "paper_trade_payloads_without_mark_to_market": gateway_app.paper_trade_payloads_without_mark_to_market,
            "load_btc_daily_history": gateway_app.load_btc_daily_history,
            "apply_paper_runtime_plan": gateway_app.apply_paper_runtime_plan,
        }
        try:
            gateway_app.ensure_overview_data = noop_overview  # type: ignore[assignment]
            gateway_app.paper_trade_payloads_without_mark_to_market = lambda **_kwargs: []  # type: ignore[assignment]
            gateway_app.load_btc_daily_history = lambda *_args, **_kwargs: (rows, {"source": "unit_fixture"})  # type: ignore[assignment]
            gateway_app.apply_paper_runtime_plan = fail_apply  # type: ignore[assignment]

            payload = asyncio.run(gateway_app.paper_runtime_tick("btc_guarded_cycle_trend", dry_run=True, portfolio_value=100_000.0))
        finally:
            for name, value in original.items():
                setattr(gateway_app, name, value)

        self.assertTrue(payload["success"])
        self.assertTrue(payload["dryRun"])
        self.assertEqual(payload["strategyId"], "btc_guarded_cycle_trend")
        self.assertIsNone(payload["openedTradeId"])
        self.assertIn(payload["status"], {"entry-ready", "flat-no-signal"})


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
