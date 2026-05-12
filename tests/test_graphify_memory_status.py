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
        self.original_git_value = gateway_app.graphify_git_value
        self.original_has_uncommitted_changes = gateway_app.graphify_has_uncommitted_changes
        self.original_changed_paths_since_built = gateway_app.graphify_changed_paths_since_built
        gateway_app.GRAPHIFY_OUT_ROOT = Path(self.tempdir.name) / "graphify-out"
        gateway_app.graphify_git_value = lambda _args: "abc12345"
        gateway_app.graphify_has_uncommitted_changes = lambda: False
        gateway_app.graphify_changed_paths_since_built = (
            lambda built, current: [] if built == current else ["src/features/memory/pages/MemoryGraphPage.tsx"]
        )

    def tearDown(self) -> None:
        gateway_app.GRAPHIFY_OUT_ROOT = self.original_root
        gateway_app.graphify_git_value = self.original_git_value
        gateway_app.graphify_has_uncommitted_changes = self.original_has_uncommitted_changes
        gateway_app.graphify_changed_paths_since_built = self.original_changed_paths_since_built
        self.tempdir.cleanup()

    def write_required_files(self, graph_payload: object, built_commit: str = "abc12345") -> None:
        gateway_app.GRAPHIFY_OUT_ROOT.mkdir(parents=True, exist_ok=True)
        (gateway_app.GRAPHIFY_OUT_ROOT / "GRAPH_REPORT.md").write_text(
            f"# Repo Graph\n\n## Graph Freshness\n- Built from commit: `{built_commit}`\n",
            encoding="utf-8",
        )
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
        self.assertIsNone(response["builtCommit"])
        self.assertEqual(response["currentCommit"], "abc12345")
        self.assertEqual(response["freshness"], "missing")
        self.assertFalse(response["hasUncommittedChanges"])
        self.assertEqual(response["recommendedCommand"], "npm run graph:build")
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
        self.assertEqual(response["builtCommit"], "abc12345")
        self.assertEqual(response["currentCommit"], "abc12345")
        self.assertEqual(response["freshness"], "fresh")
        self.assertFalse(response["hasUncommittedChanges"])
        self.assertEqual(response["recommendedCommand"], "npm run graph:check")
        self.assertEqual(response["warnings"], [])

    def test_available_graphify_artifacts_report_stale_commit(self) -> None:
        self.write_required_files({"nodes": [], "edges": []}, built_commit="old12345")

        response = gateway_app.graphify_status_payload()

        self.assertTrue(response["available"])
        self.assertEqual(response["builtCommit"], "old12345")
        self.assertEqual(response["currentCommit"], "abc12345")
        self.assertEqual(response["freshness"], "stale")
        self.assertEqual(response["recommendedCommand"], "npm run graph:build")

    def test_available_graphify_artifacts_allow_generated_graph_delta(self) -> None:
        gateway_app.graphify_changed_paths_since_built = lambda _built, _current: [
            "graphify-out/GRAPH_REPORT.md",
            "graphify-out/graph.json",
        ]
        self.write_required_files({"nodes": [], "edges": []}, built_commit="old12345")

        response = gateway_app.graphify_status_payload()

        self.assertTrue(response["available"])
        self.assertEqual(response["freshness"], "fresh")
        self.assertEqual(response["recommendedCommand"], "npm run graph:check")

    def test_available_graphify_artifacts_report_dirty_worktree(self) -> None:
        gateway_app.graphify_has_uncommitted_changes = lambda: True
        self.write_required_files({"nodes": [], "edges": []})

        response = gateway_app.graphify_status_payload()

        self.assertTrue(response["available"])
        self.assertEqual(response["freshness"], "dirty")
        self.assertTrue(response["hasUncommittedChanges"])
        self.assertEqual(response["recommendedCommand"], "npm run graph:build")

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
        self.assertIn("PERFORMANCE_PROFILES", body)
        self.assertIn("world-orbit", body)
        self.assertNotIn("all-orbit", body)
        self.assertNotIn("all-fluid-orbit", body)
        self.assertIn("forceAtlas2Based", body)
        self.assertIn("GOLDEN_ANGLE", body)
        self.assertIn("communityAnchor", body)
        self.assertIn("nodeCommunityIndex", body)
        self.assertIn("seedPosition", body)
        self.assertIn("shouldSeedLayout", body)
        self.assertIn("autoFreezeMs: null", body)
        self.assertIn("settleSafetyMs: null", body)
        self.assertIn("stabilizeAfterMs: 11500", body)
        self.assertIn("gravityWarmupMs: 11500", body)
        self.assertIn("seedShellScale: 1.34", body)
        self.assertIn("settledScale: 0.9", body)
        self.assertIn("stabilization: { enabled: false, iterations: 260", body)
        self.assertIn("centralGravity: 0.016", body)
        self.assertIn("springLength: 118", body)
        self.assertIn("springConstant: 0.054", body)
        self.assertIn("damping: 0.43", body)
        self.assertIn("avoidOverlap: 0.42", body)
        self.assertIn("fullGraphStabilizeRequested", body)
        self.assertIn("improvedLayout: false", body)
        self.assertIn("network.stabilize", body)
        self.assertIn("startSettleMonitor", body)
        self.assertIn("readSettleMotion", body)
        self.assertIn("frameFullGraphAfterSettle", body)
        self.assertIn("network.moveTo", body)
        self.assertIn("ambient-flow", body)
        self.assertIn("graphOrbitFlow", body)
        self.assertIn("settling", body)
        self.assertIn("flowing", body)
        self.assertIn("settled", body)
        self.assertIn("updateFrameTiming", body)
        self.assertIn("updateVisibleNodeDecorations", body)
        self.assertIn("scheduleRefresh", body)
        self.assertIn("stabilizationIterationsDone", body)
        self.assertIn("Graph performance metrics", body)
        self.assertIn("Profile", body)
        self.assertIn("Render", body)
        self.assertIn("Motion", body)
        self.assertIn("freezeOnStabilized", body)
        self.assertIn("stabilized", body)
        self.assertIn("Reflow", body)
        self.assertNotIn(">Physics<", body)
        self.assertNotIn("Resume", body)
        self.assertNotIn("Frozen", body)
        self.assertNotIn("frozen", body)
        self.assertIn("graph-tooltip", body)
        self.assertIn("tooltipBlock", body)
        self.assertIn("nodeTooltip", body)
        self.assertIn("edgeTooltip", body)
        self.assertIn("nodeDisplayLabel", body)
        self.assertIn("Click to inspect. Double-click for neighborhood.", body)
        self.assertNotIn("title: `<strong>", body)
        self.assertNotIn(".join(\"<br>\")", body)
        self.assertIn("\"openPath\":\"", body)
        self.assertIn("graphify:open-path", body)
        self.assertIn("Open Source", body)
        self.assertIn("Strategy", body)

    def test_html_endpoint_returns_graphify_html_file(self) -> None:
        self.write_required_files({"nodes": [], "edges": []})

        response = asyncio.run(gateway_app.memory_graphify_html())

        self.assertEqual(Path(response.path), gateway_app.GRAPHIFY_OUT_ROOT / "graph.html")
        self.assertEqual(response.media_type, "text/html; charset=utf-8")


if __name__ == "__main__":
    unittest.main()
