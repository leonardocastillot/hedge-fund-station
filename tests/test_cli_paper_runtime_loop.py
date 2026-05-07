from __future__ import annotations

import io
import json
import unittest
from contextlib import redirect_stdout

from backend.hyperliquid_gateway.cli import (
    PaperRuntimeRequestError,
    build_paper_runtime_tick_url,
    run_paper_runtime_loop,
)


class CliPaperRuntimeLoopTest(unittest.TestCase):
    def test_build_tick_url_normalizes_query(self) -> None:
        url = build_paper_runtime_tick_url(
            strategy_id="btc_failed_impulse_reversal",
            gateway_url="http://127.0.0.1:18001/",
            portfolio_value=100_000,
            dry_run=True,
        )

        self.assertEqual(
            url,
            "http://127.0.0.1:18001/api/hyperliquid/paper/runtime/btc_failed_impulse_reversal/tick?dry_run=true&portfolio_value=100000.0",
        )

    def test_loop_runs_bounded_ticks_and_summarizes_output(self) -> None:
        sleep_calls: list[float] = []

        def fake_request(_url: str) -> dict[str, object]:
            return {
                "success": True,
                "strategyId": "btc_failed_impulse_reversal",
                "dryRun": True,
                "status": "flat-no-signal",
                "openedTradeId": None,
                "closedTradeIds": [],
                "plan": {
                    "market": {"historyPoints": 120, "change1h": -0.1, "change15m": -0.02},
                    "signalEval": {"signal": "none"},
                    "entry": {"blockReason": "no_reversal_signal"},
                },
            }

        buffer = io.StringIO()
        with redirect_stdout(buffer):
            result = run_paper_runtime_loop(
                strategy_id="btc_failed_impulse_reversal",
                gateway_url="http://127.0.0.1:18001",
                portfolio_value=100_000,
                interval_seconds=1,
                max_ticks=2,
                dry_run=True,
                fail_fast=False,
                sleep_func=sleep_calls.append,
                request_func=fake_request,
            )

        lines = [json.loads(line) for line in buffer.getvalue().splitlines()]
        self.assertTrue(result["ok"])
        self.assertEqual(result["ticks"], 2)
        self.assertEqual(sleep_calls, [1])
        self.assertEqual(lines[0]["event"], "paper_runtime_loop_started")
        tick_lines = [line for line in lines if line["event"] == "paper_runtime_tick"]
        self.assertEqual(len(tick_lines), 2)
        self.assertEqual(tick_lines[0]["signal"], "none")
        self.assertEqual(tick_lines[0]["entryBlockReason"], "no_reversal_signal")
        self.assertEqual(lines[-1]["event"], "paper_runtime_loop_finished")

    def test_loop_fail_fast_stops_after_request_error(self) -> None:
        def failing_request(_url: str) -> dict[str, object]:
            raise PaperRuntimeRequestError({"status": 500, "error": "gateway failed", "url": "http://test"})

        buffer = io.StringIO()
        with redirect_stdout(buffer):
            result = run_paper_runtime_loop(
                strategy_id="btc_failed_impulse_reversal",
                gateway_url="http://127.0.0.1:18001",
                portfolio_value=100_000,
                interval_seconds=1,
                max_ticks=3,
                dry_run=True,
                fail_fast=True,
                sleep_func=lambda _seconds: None,
                request_func=failing_request,
            )

        lines = [json.loads(line) for line in buffer.getvalue().splitlines()]
        self.assertFalse(result["ok"])
        self.assertEqual(result["ticks"], 1)
        self.assertEqual(lines[1]["event"], "paper_runtime_tick_error")
        self.assertEqual(lines[-1]["errors"][0]["status"], 500)


if __name__ == "__main__":
    unittest.main()
