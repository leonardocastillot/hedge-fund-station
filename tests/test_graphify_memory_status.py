from __future__ import annotations

import asyncio
import json
import tempfile
import unittest
from pathlib import Path

from backend.hyperliquid_gateway import app as gateway_app


class GraphifyMemoryStatusTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.original_root = gateway_app.GRAPHIFY_OUT_ROOT
        gateway_app.GRAPHIFY_OUT_ROOT = Path(self.tempdir.name) / "graphify-out"

    def tearDown(self) -> None:
        gateway_app.GRAPHIFY_OUT_ROOT = self.original_root
        self.tempdir.cleanup()

    def write_required_files(self, graph_payload: object) -> None:
        gateway_app.GRAPHIFY_OUT_ROOT.mkdir(parents=True, exist_ok=True)
        (gateway_app.GRAPHIFY_OUT_ROOT / "GRAPH_REPORT.md").write_text("# Repo Graph\n", encoding="utf-8")
        (gateway_app.GRAPHIFY_OUT_ROOT / "graph.html").write_text("<!doctype html>\n", encoding="utf-8")
        (gateway_app.GRAPHIFY_OUT_ROOT / "graph.json").write_text(
            json.dumps(graph_payload) + "\n",
            encoding="utf-8",
        )

    def test_missing_graphify_artifacts_report_unavailable_with_paths(self) -> None:
        response = gateway_app.graphify_status_payload()

        self.assertFalse(response["available"])
        self.assertIsNone(response["updatedAt"])
        self.assertEqual(response["outputDir"], str(gateway_app.GRAPHIFY_OUT_ROOT))
        self.assertEqual(response["reportPath"], str(gateway_app.GRAPHIFY_OUT_ROOT / "GRAPH_REPORT.md"))
        self.assertEqual(response["graphJsonPath"], str(gateway_app.GRAPHIFY_OUT_ROOT / "graph.json"))
        self.assertEqual(response["htmlPath"], str(gateway_app.GRAPHIFY_OUT_ROOT / "graph.html"))
        self.assertEqual(response["explorerUrl"], "/api/hyperliquid/memory/graphify-explorer")
        self.assertEqual(response["htmlUrl"], "/api/hyperliquid/memory/graphify-html")
        self.assertIsNone(response["nodeCount"])
        self.assertIsNone(response["edgeCount"])
        self.assertIsNone(response["communityCount"])
        self.assertEqual(len(response["warnings"]), 3)
        self.assertIn("npm run graph:build", response["warnings"][0])

    def test_available_graphify_artifacts_include_best_effort_counts(self) -> None:
        self.write_required_files(
            {
                "nodes": [
                    {"id": "zero-community", "community": 0},
                    {"id": "strategy", "community": "memory"},
                    {"id": "harness", "community": "memory"},
                    {"id": "backend", "community": "backend"},
                ],
                "edges": [
                    {"source": "strategy", "target": "harness"},
                    {"source": "harness", "target": "backend"},
                ],
            }
        )

        response = gateway_app.graphify_status_payload()

        self.assertTrue(response["available"])
        self.assertIsInstance(response["updatedAt"], int)
        self.assertEqual(response["nodeCount"], 4)
        self.assertEqual(response["edgeCount"], 2)
        self.assertEqual(response["communityCount"], 3)
        self.assertEqual(response["warnings"], [])

    def test_status_endpoint_returns_graphify_payload(self) -> None:
        self.write_required_files({"nodes": [], "links": [], "communities": []})

        response = asyncio.run(gateway_app.memory_graphify_status())

        self.assertTrue(response["available"])
        self.assertEqual(response["nodeCount"], 0)
        self.assertEqual(response["edgeCount"], 0)
        self.assertEqual(response["communityCount"], 0)

    def test_explorer_endpoint_returns_interactive_graph_html(self) -> None:
        self.write_required_files(
            {
                "nodes": [
                    {"id": "strategy", "label": "Strategy", "community": 0, "source_file": "docs/strategies/README.md"},
                    {"id": "harness", "label": "Harness", "community": 0, "source_file": "docs/operations/agents/harness.md"},
                ],
                "edges": [
                    {"source": "strategy", "target": "harness", "relation": "documents"},
                ],
            }
        )

        response = asyncio.run(gateway_app.memory_graphify_explorer())
        body = response.body.decode("utf-8")

        self.assertEqual(response.media_type, "text/html; charset=utf-8")
        self.assertIn("Graphify Explorer", body)
        self.assertIn("vis-network", body)
        self.assertIn("\"nodeCount\":2", body)
        self.assertIn("Strategy", body)

    def test_html_endpoint_returns_graphify_html_file(self) -> None:
        self.write_required_files({"nodes": [], "edges": []})

        response = asyncio.run(gateway_app.memory_graphify_html())

        self.assertEqual(Path(response.path), gateway_app.GRAPHIFY_OUT_ROOT / "graph.html")
        self.assertEqual(response.media_type, "text/html; charset=utf-8")


if __name__ == "__main__":
    unittest.main()
