import json
import os
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path

from backend.hyperliquid_gateway.backtesting.engine import BacktestConfig
from backend.hyperliquid_gateway.strategies.btc_regime_adaptive_confluence.logic import (
    STRATEGY_ID,
    SYMBOL,
    evaluate_signal,
    row_close,
)
from backend.hyperliquid_gateway.strategies.btc_regime_adaptive_confluence.backtest import (
    run_backtest,
)
from backend.hyperliquid_gateway.strategies.btc_regime_adaptive_confluence.scoring import (
    score_setup,
)


def _make_row(day_offset: int) -> dict:
    dt = datetime(2024, 1, 1) + timedelta(days=day_offset)
    return {
        "date": dt.date().isoformat(),
        "close": 40000 + day_offset * 100,
        "high": 40500 + day_offset * 100,
        "low": 39800 + day_offset * 100,
    }


MINIMAL_ROWS = [_make_row(d) for d in range(260)]


class TestEvaluateSignal(unittest.TestCase):
    def test_requires_history(self):
        rows = [{"date": "2024-01-01", "close": 40000, "high": 40500, "low": 39800}]
        result = evaluate_signal(rows, 0)
        self.assertFalse(result["has_required_history"])
        self.assertEqual(result["signal"], "none")

    def test_sufficient_history_returns_context(self):
        result = evaluate_signal(MINIMAL_ROWS, len(MINIMAL_ROWS) - 1)
        self.assertTrue(result["has_required_history"])
        self.assertIn("close", result)
        self.assertIn("atr_percentile", result)
        self.assertIn("trail_phase", result)

    def test_strategy_id_and_symbol(self):
        result = evaluate_signal(MINIMAL_ROWS, 200)
        self.assertEqual(result["strategy_id"], STRATEGY_ID)
        self.assertEqual(result["symbol"], SYMBOL)

    def test_no_entry_in_early_history(self):
        result = evaluate_signal(MINIMAL_ROWS, 10)
        self.assertFalse(result["entry_trigger"])

    def test_trail_phase_tight_first_14_days(self):
        result = evaluate_signal(MINIMAL_ROWS, 200, in_position=True, trade_entry_idx=190)
        self.assertEqual(result["trail_phase"], "tight")


class TestScoreSetup(unittest.TestCase):
    def test_insufficient_history(self):
        score = score_setup({"has_required_history": False})
        self.assertEqual(score["rank_score"], 0)

    def test_sufficient_history_returns_score(self):
        signal = evaluate_signal(MINIMAL_ROWS, 200)
        score = score_setup(signal)
        self.assertIn("rank_score", score)
        self.assertIn("execution_quality", score)
        self.assertGreaterEqual(score["rank_score"], 0)
        self.assertLessEqual(score["rank_score"], 100)


class TestRunBacktest(unittest.TestCase):
    def setUp(self):
        self.data = [_make_row(d) for d in range(260)]
        self.tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False)
        json.dump(self.data, self.tmp)
        self.tmp.close()

    def tearDown(self):
        os.unlink(self.tmp.name)

    def test_backtest_runs(self):
        config = BacktestConfig(
            initial_equity=500.0,
            fee_model="taker",
            risk_fraction=0.20,
        )
        result = run_backtest(Path(self.tmp.name), config)
        self.assertEqual(result["summary"]["strategy_id"], STRATEGY_ID)
        self.assertIn("return_pct", result["summary"])
        self.assertIn("profit_factor", result["summary"])
        self.assertIn("total_trades", result["summary"])
        self.assertIn("beats_champion", result["summary"])

    def test_backtest_dataset_metadata(self):
        config = BacktestConfig(initial_equity=500.0)
        result = run_backtest(Path(self.tmp.name), config)
        self.assertEqual(result["dataset"]["symbol"], SYMBOL)
        self.assertGreater(result["dataset"]["rows"], 0)


if __name__ == "__main__":
    unittest.main()
