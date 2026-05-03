from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi.testclient import TestClient

from backend.hyperliquid_gateway.app import app
from backend.hyperliquid_gateway.agents import research_os
from backend.hyperliquid_gateway.agents import list_agent_runs, load_agent_run, run_agent_research
from backend.hyperliquid_gateway.agents.schemas import AgentDecision


class AgentResearchOsTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = TemporaryDirectory()
        self._old_runs_root = research_os.AGENT_RUNS_ROOT
        self._old_checkpoints_root = research_os.AGENT_CHECKPOINTS_ROOT
        research_os.AGENT_RUNS_ROOT = Path(self._tmp.name) / "agent_runs"
        research_os.AGENT_CHECKPOINTS_ROOT = research_os.AGENT_RUNS_ROOT / "checkpoints"

    def tearDown(self) -> None:
        research_os.AGENT_RUNS_ROOT = self._old_runs_root
        research_os.AGENT_CHECKPOINTS_ROOT = self._old_checkpoints_root
        self._tmp.cleanup()

    def test_research_run_generates_structured_artifact(self) -> None:
        result = run_agent_research("funding_exhaustion_snap", runtime="deterministic")
        payload = result["payload"]

        self.assertTrue(result["run_path"].exists())
        self.assertEqual(payload["artifact_type"], "agent_research_run")
        self.assertEqual(payload["strategy_id"], "funding_exhaustion_snap")
        self.assertFalse(payload["decision"]["promotion_allowed"])
        self.assertGreaterEqual(len(payload["reports"]), 6)
        AgentDecision(**payload["decision"])

        loaded = load_agent_run(payload["run_id"])
        self.assertIsNotNone(loaded)
        self.assertEqual(loaded["run_id"], payload["run_id"])

    def test_missing_strategy_is_blocked_not_promoted(self) -> None:
        result = run_agent_research("agent_missing_smoke_strategy", runtime="deterministic")
        decision = result["payload"]["decision"]

        self.assertFalse(decision["promotion_allowed"])
        self.assertGreater(len(decision["blockers"]), 0)
        self.assertIn(decision["recommendation"], {"backtest_next", "validation_next", "blocked"})

    def test_agent_status_lists_runs(self) -> None:
        run_agent_research("funding_exhaustion_snap", runtime="deterministic")
        runs = list_agent_runs(strategy_id="funding_exhaustion_snap", limit=5)

        self.assertGreaterEqual(len(runs), 1)
        self.assertIn("recommended_commands", runs[0])

    def test_runtime_auto_can_be_forced_to_deterministic(self) -> None:
        result = run_agent_research("funding_exhaustion_snap", runtime="deterministic")
        self.assertEqual(result["payload"]["ai"]["runtime_mode"], "deterministic")

    def test_agent_run_api_smoke(self) -> None:
        client = TestClient(app)

        status = client.get("/api/hyperliquid/agent-runtime/status")
        self.assertEqual(status.status_code, 200)
        self.assertIn("runtimeMode", status.json())

        created = client.post(
            "/api/hyperliquid/agent-runs/research",
            json={"strategy_id": "agent_missing_smoke_strategy", "runtime": "deterministic"},
        )
        self.assertEqual(created.status_code, 200)
        payload = created.json()
        self.assertEqual(payload["runtimeMode"], "deterministic")
        self.assertFalse(payload["promotionAllowed"])

        listed = client.get("/api/hyperliquid/agent-runs?strategy=agent_missing_smoke_strategy&limit=5")
        self.assertEqual(listed.status_code, 200)
        self.assertGreaterEqual(listed.json()["count"], 1)


if __name__ == "__main__":
    unittest.main()
