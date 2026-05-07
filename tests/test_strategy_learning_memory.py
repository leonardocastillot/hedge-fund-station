from __future__ import annotations

import asyncio
import json
import tempfile
import unittest
from pathlib import Path

from backend.hyperliquid_gateway import app as gateway_app
from backend.hyperliquid_gateway.app import (
    StrategyLearningEventCreate,
    list_strategy_learning_events,
    write_strategy_learning_event,
)


class StrategyLearningMemoryTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.original_root = gateway_app.STRATEGY_MEMORY_ROOT
        gateway_app.STRATEGY_MEMORY_ROOT = Path(self.tempdir.name) / "strategy_memory"

    def tearDown(self) -> None:
        gateway_app.STRATEGY_MEMORY_ROOT = self.original_root
        self.tempdir.cleanup()

    def test_write_learning_event_normalizes_strategy_and_evidence(self) -> None:
        event = write_strategy_learning_event(
            StrategyLearningEventCreate(
                strategy_id="BTC-Failed Impulse Reversal",
                kind="lesson",
                outcome="loss",
                stage="paper",
                title="Do not trust the first reclaim",
                summary="The reclaim looked good but failed without OI confirmation.",
                evidence_paths=[
                    "docs/strategies/btc-failed-impulse-reversal.md",
                    "docs/strategies/btc-failed-impulse-reversal.md",
                    "backend/hyperliquid_gateway/data/backtests/sample.json",
                ],
                lesson="Require confirmation before treating the reclaim as tradable.",
                rule_change="Add OI confirmation to the trigger gate.",
                next_action="Backtest the stricter trigger.",
            )
        )

        self.assertEqual(event["strategy_id"], "btc_failed_impulse_reversal")
        self.assertEqual(event["kind"], "lesson")
        self.assertEqual(event["outcome"], "loss")
        self.assertEqual(
            event["evidence_paths"],
            [
                "docs/strategies/btc-failed-impulse-reversal.md",
                "backend/hyperliquid_gateway/data/backtests/sample.json",
            ],
        )
        event_path = Path(event["path"])
        self.assertTrue(event_path.exists())
        self.assertEqual(json.loads(event_path.read_text(encoding="utf-8"))["artifact_type"], "strategy_learning_event")

    def test_list_learning_events_filters_sorts_and_limits(self) -> None:
        first = write_strategy_learning_event(
            StrategyLearningEventCreate(
                strategy_id="bb_squeeze_adx",
                kind="hypothesis",
                outcome="unknown",
                title="Compression thesis",
                summary="Breakout should work only when ADX wakes up.",
            )
        )
        second = write_strategy_learning_event(
            StrategyLearningEventCreate(
                strategy_id="bb_squeeze_adx",
                kind="rule_change",
                outcome="mixed",
                title="Tighten no-trade chop filter",
                summary="Chop filter blocked some good setups but removed more bad ones.",
                rule_change="Require higher ADX slope before entry.",
            )
        )
        write_strategy_learning_event(
            StrategyLearningEventCreate(
                strategy_id="other_strategy",
                kind="lesson",
                outcome="win",
                title="Unrelated event",
                summary="Should not appear in filtered response.",
            )
        )

        response = list_strategy_learning_events("bb-squeeze-adx", limit=1)

        self.assertEqual(response["strategyId"], "bb_squeeze_adx")
        self.assertEqual(response["count"], 1)
        self.assertEqual(len(response["events"]), 1)
        self.assertIn(response["events"][0]["event_id"], {first["event_id"], second["event_id"]})

    def test_learning_endpoints_create_and_list_events(self) -> None:
        created = asyncio.run(
            gateway_app.create_strategy_learning(
                StrategyLearningEventCreate(
                    strategy_id="long_flush_continuation",
                    kind="postmortem",
                    outcome="win",
                    stage="backtesting",
                    title="Continuation worked after pressure stayed one-sided",
                    summary="Winning samples shared persistent liquidation pressure.",
                    lesson="Do not exit early while pressure remains one-sided.",
                    next_action="Add this to paper review criteria.",
                )
            )
        )
        listed = asyncio.run(gateway_app.strategy_learning(strategy_id="long_flush_continuation", limit=10))

        self.assertTrue(created["created"])
        self.assertEqual(listed["count"], 1)
        self.assertEqual(listed["events"][0]["event_id"], created["event"]["event_id"])
        self.assertEqual(listed["events"][0]["next_action"], "Add this to paper review criteria.")


if __name__ == "__main__":
    unittest.main()
