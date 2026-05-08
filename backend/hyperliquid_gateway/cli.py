from __future__ import annotations

import argparse
import json
import os
import platform
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from .backtesting.engine import BacktestConfig, normalize_symbols
from .backtesting.io import list_csv_files
from .backtesting.registry import available_strategies
from .backtesting.workflow import (
    AUDITS_ROOT,
    BACKEND_ROOT,
    PAPER_ROOT,
    REPORTS_ROOT,
    REPO_ROOT,
    VALIDATIONS_ROOT,
    build_btc_variant_optimizer_workflow,
    build_doubling_stability_workflow,
    build_paper_workflow,
    build_status_snapshot,
    run_backtest_workflow,
    timestamp_slug,
    validate_strategy_workflow,
    write_json,
)
from .agents import agent_runtime_status, list_agent_runs, run_agent_audit, run_agent_research


DONOR_ROOT = Path(r"C:\Users\leonard\Documents\trading-harvard\Harvard-Algorithmic-Trading-with-AI")
DONOR_BACKTEST_ROOT = DONOR_ROOT / "backtest"


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="hf", description="Stable CLI for hedge-fund-station milestone 2.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    doctor_parser = subparsers.add_parser("doctor", help="Audit repo, donor assets and CLI prerequisites.")
    doctor_parser.set_defaults(func=command_doctor)

    strategy_parser = subparsers.add_parser("strategy", help="Strategy scaffolding helpers.")
    strategy_subparsers = strategy_parser.add_subparsers(dest="strategy_command", required=True)
    strategy_new = strategy_subparsers.add_parser("new", help="Create strategy doc + backend module skeleton.")
    strategy_new.add_argument("--strategy-id", required=True)
    strategy_new.add_argument("--title", default=None)
    strategy_new.set_defaults(func=command_strategy_new)

    backtest_parser = subparsers.add_parser("backtest", help="Run deterministic backend backtests.")
    backtest_parser.add_argument("--strategy", default="bb_squeeze_adx", choices=available_strategies())
    backtest_parser.add_argument("--dataset", default=None)
    backtest_parser.add_argument("--equity", type=float, default=100_000.0)
    backtest_parser.add_argument("--risk-fraction", type=float, default=0.10)
    backtest_parser.add_argument("--fee-rate", type=float, default=None, help="Legacy one-way fee alias; maps to taker fee if --taker-fee-rate is omitted.")
    backtest_parser.add_argument("--taker-fee-rate", type=float, default=None, help="One-way taker fee as a decimal. Hyperliquid Tier 0 default is 0.00045.")
    backtest_parser.add_argument("--maker-fee-rate", type=float, default=None, help="One-way maker fee as a decimal. Hyperliquid Tier 0 default is 0.00015.")
    backtest_parser.add_argument("--fee-model", choices=["taker", "maker", "mixed"], default="taker", help="Default liquidity role used when a trade does not declare one.")
    backtest_parser.add_argument("--maker-ratio", type=float, default=0.0, help="Maker fill ratio for --fee-model mixed, from 0.0 to 1.0.")
    backtest_parser.add_argument("--symbol", action="append", default=None, help="Limit Hyperliquid replay to one symbol. Can be repeated.")
    backtest_parser.add_argument("--symbols", default=None, help="Comma-separated Hyperliquid replay symbols, e.g. BTC,ETH,SOL.")
    backtest_parser.add_argument("--universe", default="default", help="Use 'all' to ignore symbol filters and replay the full universe.")
    backtest_parser.add_argument("--start", default=None, help="Optional inclusive replay start timestamp, ISO or epoch.")
    backtest_parser.add_argument("--end", default=None, help="Optional inclusive replay end timestamp, ISO or epoch.")
    backtest_parser.add_argument("--lookback-days", type=int, default=None, help="Replay only the trailing N days from --end or the dataset max timestamp.")
    backtest_parser.add_argument("--output", default=None)
    backtest_parser.set_defaults(func=command_backtest)

    validate_parser = subparsers.add_parser("validate", help="Validate research package and backtest gates.")
    validate_parser.add_argument("--strategy", default="bb_squeeze_adx")
    validate_parser.add_argument("--report", default=None)
    validate_parser.add_argument("--output", default=None)
    validate_parser.set_defaults(func=command_validate)

    paper_parser = subparsers.add_parser("paper", help="Create paper candidate payload from a validated report.")
    paper_parser.add_argument("--strategy", default="bb_squeeze_adx")
    paper_parser.add_argument("--report", default=None)
    paper_parser.add_argument("--validation", default=None)
    paper_parser.add_argument("--output", default=None)
    paper_parser.set_defaults(func=command_paper)

    paper_tick_parser = subparsers.add_parser("paper-runtime-tick", help="Run one backend paper runtime tick through the local gateway.")
    paper_tick_parser.add_argument("--strategy", default="btc_failed_impulse_reversal")
    paper_tick_parser.add_argument("--gateway-url", default=os.getenv("HYPERLIQUID_GATEWAY_HTTP_URL", "http://127.0.0.1:18001"))
    paper_tick_parser.add_argument("--portfolio-value", type=float, default=100_000.0)
    paper_tick_parser.add_argument("--dry-run", action="store_true")
    paper_tick_parser.set_defaults(func=command_paper_runtime_tick)

    paper_loop_parser = subparsers.add_parser("paper-runtime-loop", help="Run repeated paper runtime ticks through the local gateway.")
    paper_loop_parser.add_argument("--strategy", default="btc_failed_impulse_reversal")
    paper_loop_parser.add_argument("--gateway-url", default=os.getenv("HYPERLIQUID_GATEWAY_HTTP_URL", "http://127.0.0.1:18001"))
    paper_loop_parser.add_argument("--portfolio-value", type=float, default=100_000.0)
    paper_loop_parser.add_argument("--interval-seconds", type=float, default=300.0)
    paper_loop_parser.add_argument("--max-ticks", type=int, default=0, help="0 means run until interrupted.")
    paper_loop_parser.add_argument("--dry-run", action="store_true")
    paper_loop_parser.add_argument("--fail-fast", action="store_true")
    paper_loop_parser.set_defaults(func=command_paper_runtime_loop)

    doubling_stability_parser = subparsers.add_parser("doubling-stability", help="Audit whether a doubling estimate is distributed across subwindows.")
    doubling_stability_parser.add_argument("--strategy", default="btc_failed_impulse_reversal")
    doubling_stability_parser.add_argument("--report", default=None)
    doubling_stability_parser.add_argument("--validation", default=None)
    doubling_stability_parser.add_argument("--output", default=None)
    doubling_stability_parser.add_argument("--slice-count", type=int, default=3)
    doubling_stability_parser.set_defaults(func=command_doubling_stability)

    btc_optimize_parser = subparsers.add_parser("btc-optimize", help="Compare BTC Failed Impulse parameter variants for research-only doubling speed.")
    btc_optimize_parser.add_argument("--strategy", default="btc_failed_impulse_reversal")
    btc_optimize_parser.add_argument("--dataset", default=None)
    btc_optimize_parser.add_argument("--equity", type=float, default=100_000.0)
    btc_optimize_parser.add_argument("--risk-fraction", type=float, default=0.10)
    btc_optimize_parser.add_argument("--fee-rate", type=float, default=None)
    btc_optimize_parser.add_argument("--taker-fee-rate", type=float, default=None)
    btc_optimize_parser.add_argument("--maker-fee-rate", type=float, default=None)
    btc_optimize_parser.add_argument("--fee-model", choices=["taker", "maker", "mixed"], default="taker")
    btc_optimize_parser.add_argument("--maker-ratio", type=float, default=0.0)
    btc_optimize_parser.add_argument("--lookback-days", type=int, default=3)
    btc_optimize_parser.add_argument("--max-variants", type=int, default=0, help="0 means run the full built-in grid.")
    btc_optimize_parser.add_argument("--output", default=None)
    btc_optimize_parser.set_defaults(func=command_btc_optimize)

    status_parser = subparsers.add_parser("status", help="Summarize research/backtest/validation/paper artifacts.")
    status_parser.set_defaults(func=command_status)

    agent_parser = subparsers.add_parser("agent", help="Agentic Research OS helpers.")
    agent_subparsers = agent_parser.add_subparsers(dest="agent_command", required=True)

    agent_research = agent_subparsers.add_parser("research", help="Run agentic research debate for a strategy.")
    agent_research.add_argument("--strategy", required=True)
    add_agent_ai_args(agent_research)
    agent_research.set_defaults(func=command_agent_research)

    agent_audit = agent_subparsers.add_parser("audit", help="Run agentic validation audit for a strategy.")
    agent_audit.add_argument("--strategy", required=True)
    add_agent_ai_args(agent_audit)
    agent_audit.set_defaults(func=command_agent_audit)

    agent_status = agent_subparsers.add_parser("status", help="List recent agentic research runs.")
    agent_status.add_argument("--strategy", default=None)
    agent_status.add_argument("--limit", type=int, default=20)
    agent_status.set_defaults(func=command_agent_status)

    agent_runtime = agent_subparsers.add_parser("runtime", help="Show Agentic Research OS runtime status.")
    agent_runtime.set_defaults(func=command_agent_runtime)
    return parser


def add_agent_ai_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--runtime", default="auto", choices=["auto", "codex-local", "api-provider", "deterministic"])
    parser.add_argument("--ai", action="store_true", help="Legacy alias for --runtime api-provider when --runtime is auto.")
    parser.add_argument("--provider-order", default=None, help="Override AI_PROVIDER_ORDER, e.g. deepseek,openai.")
    parser.add_argument("--model", default=None, help="Override Codex/API model, e.g. gpt-5.5 or deepseek-v4-pro.")
    parser.add_argument("--codex-profile", default=None, help="Codex config profile to use with --runtime codex-local.")


def command_doctor(_: argparse.Namespace) -> int:
    REPORTS_ROOT.mkdir(parents=True, exist_ok=True)
    AUDITS_ROOT.mkdir(parents=True, exist_ok=True)
    VALIDATIONS_ROOT.mkdir(parents=True, exist_ok=True)
    PAPER_ROOT.mkdir(parents=True, exist_ok=True)

    donor_files = list_csv_files(DONOR_BACKTEST_ROOT / "data")
    audit_payload = {
        "generated_at": now_iso(),
        "repo_root": str(REPO_ROOT),
        "python": {
            "version": sys.version.split()[0],
            "executable": sys.executable,
            "platform": platform.platform(),
        },
        "checks": {
            "backend_root_exists": BACKEND_ROOT.exists(),
            "donor_root_exists": DONOR_ROOT.exists(),
            "reports_root_exists": REPORTS_ROOT.exists(),
            "validations_root_exists": VALIDATIONS_ROOT.exists(),
            "paper_root_exists": PAPER_ROOT.exists(),
            "strategy_count": len(available_strategies()),
            "donor_csv_count": len(donor_files),
        },
        "donor_csv_files": [str(path) for path in donor_files],
        "donor_scripts": _harvard_script_audit(),
    }
    audit_path = AUDITS_ROOT / f"doctor-{timestamp_slug()}.json"
    write_json(audit_path, audit_payload)
    print(json.dumps({"ok": True, "audit_path": str(audit_path), "summary": audit_payload["checks"]}, indent=2))
    return 0


def command_strategy_new(args: argparse.Namespace) -> int:
    strategy_id = args.strategy_id.strip().replace("-", "_")
    title = args.title or strategy_id.replace("_", " ").title()
    docs_id = strategy_id.replace("_", "-")

    strategy_dir = BACKEND_ROOT / "strategies" / strategy_id
    docs_path = REPO_ROOT / "docs" / "strategies" / f"{docs_id}.md"

    strategy_dir.mkdir(parents=True, exist_ok=True)
    docs_path.parent.mkdir(parents=True, exist_ok=True)

    files = {
        strategy_dir / "__init__.py": f'"""Strategy package for {strategy_id}."""\n',
        strategy_dir / "logic.py": _strategy_template_logic(strategy_id),
        strategy_dir / "scoring.py": _strategy_template_scoring(strategy_id),
        strategy_dir / "risk.py": _strategy_template_risk(strategy_id),
        strategy_dir / "paper.py": _strategy_template_paper(strategy_id),
        strategy_dir / "spec.md": _strategy_template_spec(title, docs_id),
        docs_path: _strategy_template_doc(title, strategy_id),
    }

    written_files: list[str] = []
    for path, content in files.items():
        if not path.exists():
            path.write_text(content, encoding="utf-8")
            written_files.append(str(path))

    print(json.dumps({"ok": True, "strategy_id": strategy_id, "written_files": written_files}, indent=2))
    return 0


def command_backtest(args: argparse.Namespace) -> int:
    result = run_backtest_workflow(
        strategy_id=args.strategy,
        dataset_path=Path(args.dataset) if args.dataset else None,
        config=build_backtest_config(args),
        output_path=Path(args.output) if args.output else None,
    )
    payload = result["payload"]
    print(
        json.dumps(
            {
                "ok": True,
                "report_path": str(result["report_path"]),
                "summary": payload["summary"],
                "robust_assessment": payload.get("robust_assessment"),
                "symbol_leaderboard": (payload.get("symbol_leaderboard") or [])[:10],
            },
            indent=2,
        )
    )
    return 0


def build_backtest_config(args: argparse.Namespace) -> BacktestConfig:
    symbol_items: list[str] = []
    if args.symbol:
        symbol_items.extend(args.symbol)
    if args.symbols:
        symbol_items.append(args.symbols)
    return BacktestConfig(
        initial_equity=args.equity,
        fee_rate=args.fee_rate,
        taker_fee_rate=args.taker_fee_rate,
        maker_fee_rate=args.maker_fee_rate,
        fee_model=args.fee_model,
        maker_ratio=args.maker_ratio,
        risk_fraction=args.risk_fraction,
        symbols=normalize_symbols(symbol_items),
        universe=args.universe,
        start=args.start,
        end=args.end,
        lookback_days=args.lookback_days,
    )


def command_validate(args: argparse.Namespace) -> int:
    result = validate_strategy_workflow(
        strategy_id=args.strategy,
        report_path=Path(args.report) if args.report else None,
        output_path=Path(args.output) if args.output else None,
    )
    payload = result["payload"]
    print(json.dumps({**payload, "validation_path": str(result["validation_path"])}, indent=2))
    return 0 if payload["status"] == "ready-for-paper" else 1


def command_paper(args: argparse.Namespace) -> int:
    try:
        result = build_paper_workflow(
            strategy_id=args.strategy,
            report_path=Path(args.report) if args.report else None,
            validation_path=Path(args.validation) if args.validation else None,
            output_path=Path(args.output) if args.output else None,
        )
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc

    payload = result["payload"]
    print(json.dumps({"ok": True, "paper_path": str(result["paper_path"]), "candidate": payload["paper_candidate"]}, indent=2))
    return 0


def command_doubling_stability(args: argparse.Namespace) -> int:
    try:
        result = build_doubling_stability_workflow(
            strategy_id=args.strategy.strip().replace("-", "_"),
            report_path=Path(args.report) if args.report else None,
            validation_path=Path(args.validation) if args.validation else None,
            output_path=Path(args.output) if args.output else None,
            slice_count=int(args.slice_count),
        )
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc

    payload = result["payload"]
    audit = payload.get("audit") if isinstance(payload.get("audit"), dict) else {}
    print(
        json.dumps(
            {
                "ok": True,
                "audit_path": str(result["audit_path"]),
                "status": audit.get("status"),
                "blockers": audit.get("blockers") or [],
                "positiveSliceRatioPct": audit.get("positiveSliceRatioPct"),
                "largestPositiveSlicePnlSharePct": audit.get("largestPositiveSlicePnlSharePct"),
                "slices": audit.get("slices") or [],
            },
            indent=2,
        )
    )
    return 0


def command_btc_optimize(args: argparse.Namespace) -> int:
    try:
        result = build_btc_variant_optimizer_workflow(
            strategy_id=args.strategy.strip().replace("-", "_"),
            dataset_path=Path(args.dataset) if args.dataset else None,
            config=BacktestConfig(
                initial_equity=float(args.equity),
                fee_rate=args.fee_rate,
                taker_fee_rate=args.taker_fee_rate,
                maker_fee_rate=args.maker_fee_rate,
                fee_model=args.fee_model,
                maker_ratio=args.maker_ratio,
                risk_fraction=float(args.risk_fraction),
                symbols=("BTC",),
                lookback_days=int(args.lookback_days) if args.lookback_days else None,
            ),
            output_path=Path(args.output) if args.output else None,
            max_variants=int(args.max_variants) if int(args.max_variants) > 0 else None,
        )
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc

    payload = result["payload"]
    top = payload.get("topVariant") if isinstance(payload.get("topVariant"), dict) else {}
    print(
        json.dumps(
            {
                "ok": True,
                "audit_path": str(result["audit_path"]),
                "status": payload.get("status"),
                "variantCount": payload.get("variantCount"),
                "stableCandidateCount": payload.get("stableCandidateCount"),
                "fragileCandidateCount": payload.get("fragileCandidateCount"),
                "topVariant": {
                    "rank": top.get("rank"),
                    "variantId": top.get("variantId"),
                    "reviewStatus": top.get("reviewStatus"),
                    "projectedDaysToDouble": top.get("projectedDaysToDouble"),
                    "returnPct": top.get("returnPct"),
                    "totalTrades": top.get("totalTrades"),
                    "stabilityStatus": top.get("stabilityStatus"),
                    "stabilityBlockers": top.get("stabilityBlockers") or [],
                    "largestPositiveSlicePnlSharePct": top.get("largestPositiveSlicePnlSharePct"),
                },
            },
            indent=2,
        )
    )
    return 0


def command_paper_runtime_tick(args: argparse.Namespace) -> int:
    strategy_id = args.strategy.strip().replace("-", "_")
    url = build_paper_runtime_tick_url(
        strategy_id=strategy_id,
        gateway_url=args.gateway_url,
        portfolio_value=float(args.portfolio_value),
        dry_run=bool(args.dry_run),
    )
    try:
        payload = request_paper_runtime_tick(url)
    except PaperRuntimeRequestError as exc:
        print(json.dumps({"ok": False, **exc.payload}, indent=2))
        return 1

    print(json.dumps(payload, indent=2))
    return 0 if payload.get("success") else 1


def command_paper_runtime_loop(args: argparse.Namespace) -> int:
    result = run_paper_runtime_loop(
        strategy_id=args.strategy.strip().replace("-", "_"),
        gateway_url=args.gateway_url,
        portfolio_value=float(args.portfolio_value),
        interval_seconds=float(args.interval_seconds),
        max_ticks=int(args.max_ticks),
        dry_run=bool(args.dry_run),
        fail_fast=bool(args.fail_fast),
    )
    return 0 if result["ok"] else 1


class PaperRuntimeRequestError(Exception):
    def __init__(self, payload: dict[str, Any]) -> None:
        super().__init__(str(payload.get("error") or payload.get("status") or "paper runtime request failed"))
        self.payload = payload


def build_paper_runtime_tick_url(
    *,
    strategy_id: str,
    gateway_url: str,
    portfolio_value: float,
    dry_run: bool,
) -> str:
    query = urllib.parse.urlencode(
        {
            "dry_run": "true" if dry_run else "false",
            "portfolio_value": str(float(portfolio_value)),
        }
    )
    return f"{gateway_url.rstrip('/')}/api/hyperliquid/paper/runtime/{urllib.parse.quote(strategy_id)}/tick?{query}"


def request_paper_runtime_tick(url: str, timeout: float = 30.0) -> dict[str, Any]:
    request = urllib.request.Request(url, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise PaperRuntimeRequestError({"status": exc.code, "error": detail, "url": url}) from exc
    except urllib.error.URLError as exc:
        raise PaperRuntimeRequestError({"error": str(exc.reason), "url": url}) from exc


def paper_runtime_loop_summary(payload: dict[str, Any], tick_index: int) -> dict[str, Any]:
    plan = payload.get("plan") if isinstance(payload.get("plan"), dict) else {}
    signal_eval = plan.get("signalEval") if isinstance(plan.get("signalEval"), dict) else {}
    entry = plan.get("entry") if isinstance(plan.get("entry"), dict) else {}
    market = plan.get("market") if isinstance(plan.get("market"), dict) else {}
    return {
        "tick": tick_index,
        "ok": bool(payload.get("success")),
        "strategyId": payload.get("strategyId"),
        "dryRun": bool(payload.get("dryRun")),
        "status": payload.get("status"),
        "signal": signal_eval.get("signal"),
        "openedTradeId": payload.get("openedTradeId"),
        "closedTradeIds": payload.get("closedTradeIds") or [],
        "entryBlockReason": entry.get("blockReason"),
        "historyPoints": market.get("historyPoints"),
        "change1h": market.get("change1h"),
        "change15m": market.get("change15m"),
    }


def run_paper_runtime_loop(
    *,
    strategy_id: str,
    gateway_url: str,
    portfolio_value: float,
    interval_seconds: float,
    max_ticks: int,
    dry_run: bool,
    fail_fast: bool,
    sleep_func: Any = time.sleep,
    request_func: Any = request_paper_runtime_tick,
) -> dict[str, Any]:
    if interval_seconds < 0:
        raise ValueError("interval_seconds must be >= 0")
    url = build_paper_runtime_tick_url(
        strategy_id=strategy_id,
        gateway_url=gateway_url,
        portfolio_value=portfolio_value,
        dry_run=dry_run,
    )
    tick_count = 0
    errors: list[dict[str, Any]] = []
    summaries: list[dict[str, Any]] = []
    print(
        json.dumps(
            {
                "event": "paper_runtime_loop_started",
                "strategyId": strategy_id,
                "gatewayUrl": gateway_url.rstrip("/"),
                "dryRun": dry_run,
                "intervalSeconds": interval_seconds,
                "maxTicks": max_ticks,
            }
        ),
        flush=True,
    )
    try:
        while max_ticks <= 0 or tick_count < max_ticks:
            tick_count += 1
            try:
                payload = request_func(url)
                summary = paper_runtime_loop_summary(payload, tick_count)
                summaries.append(summary)
                print(json.dumps({"event": "paper_runtime_tick", **summary}), flush=True)
            except PaperRuntimeRequestError as exc:
                error_payload = {"tick": tick_count, **exc.payload}
                errors.append(error_payload)
                print(json.dumps({"event": "paper_runtime_tick_error", **error_payload}), flush=True)
                if fail_fast:
                    break

            if max_ticks > 0 and tick_count >= max_ticks:
                break
            sleep_func(interval_seconds)
    except KeyboardInterrupt:
        print(json.dumps({"event": "paper_runtime_loop_interrupted", "ticks": tick_count}), flush=True)

    result = {
        "event": "paper_runtime_loop_finished",
        "ok": not errors or not fail_fast,
        "strategyId": strategy_id,
        "ticks": tick_count,
        "errors": errors,
        "lastTick": summaries[-1] if summaries else None,
    }
    print(json.dumps(result), flush=True)
    return result


def command_status(_: argparse.Namespace) -> int:
    print(json.dumps(build_status_snapshot(), indent=2))
    return 0


def command_agent_research(args: argparse.Namespace) -> int:
    result = run_agent_research(
        args.strategy,
        use_ai=args.ai,
        provider_order=args.provider_order,
        model=args.model,
        runtime=args.runtime,
        codex_profile=args.codex_profile,
    )
    payload = result["payload"]
    print(
        json.dumps(
            {
                "ok": True,
                "run_path": str(result["run_path"]),
                "run_id": payload["run_id"],
                "strategy_id": payload["strategy_id"],
                "recommendation": payload["decision"]["recommendation"],
                "promotion_allowed": payload["decision"]["promotion_allowed"],
                "runtime_mode": payload.get("ai", {}).get("runtime_mode"),
                "ai": payload.get("ai"),
                "recommended_commands": payload["decision"]["recommended_commands"],
            },
            indent=2,
        )
    )
    return 0


def command_agent_audit(args: argparse.Namespace) -> int:
    result = run_agent_audit(
        args.strategy,
        use_ai=args.ai,
        provider_order=args.provider_order,
        model=args.model,
        runtime=args.runtime,
        codex_profile=args.codex_profile,
    )
    payload = result["payload"]
    blocker_count = len(payload["decision"].get("blockers") or [])
    print(
        json.dumps(
            {
                "ok": True,
                "run_path": str(result["run_path"]),
                "run_id": payload["run_id"],
                "strategy_id": payload["strategy_id"],
                "recommendation": payload["decision"]["recommendation"],
                "blocker_count": blocker_count,
                "runtime_mode": payload.get("ai", {}).get("runtime_mode"),
                "ai": payload.get("ai"),
                "recommended_commands": payload["decision"]["recommended_commands"],
            },
            indent=2,
        )
    )
    return 0 if blocker_count == 0 else 1


def command_agent_status(args: argparse.Namespace) -> int:
    print(json.dumps({"ok": True, "runs": list_agent_runs(strategy_id=args.strategy, limit=args.limit)}, indent=2))
    return 0


def command_agent_runtime(_: argparse.Namespace) -> int:
    print(json.dumps({"ok": True, "runtime": agent_runtime_status()}, indent=2))
    return 0


def now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _harvard_script_audit() -> list[dict[str, Any]]:
    scripts = [
        DONOR_BACKTEST_ROOT / "bb_squeeze_adx.py",
        DONOR_BACKTEST_ROOT / "data.py",
        DONOR_BACKTEST_ROOT / "template.py",
    ]
    audit: list[dict[str, Any]] = []
    for script in scripts:
        exists = script.exists()
        text = script.read_text(encoding="utf-8", errors="ignore") if exists else ""
        audit.append(
            {
                "path": str(script),
                "exists": exists,
                "uses_talib": "talib" in text.lower(),
                "uses_backtesting_py": "from backtesting import" in text.lower(),
                "hardcoded_paths": "/users/" in text.lower() or "\\users\\" in text.lower(),
                "uses_live_network_fetch": "requests.post" in text.lower() or "yfinance" in text.lower(),
                "notes": _script_notes(text),
            }
        )
    return audit


def _script_notes(text: str) -> list[str]:
    notes: list[str] = []
    lowered = text.lower()
    if "talib" in lowered:
        notes.append("Requires TA-Lib; not portable enough for base CLI.")
    if "from backtesting import" in lowered:
        notes.append("Depends on backtesting.py; replaced with local deterministic engine.")
    if "/users/" in lowered or "\\users\\" in lowered:
        notes.append("Contains hardcoded absolute paths and should not be reused verbatim.")
    if "requests.post" in lowered or "yfinance" in lowered:
        notes.append("Touches external data acquisition. Milestone 1 keeps donor data as explicit input, not mock data.")
    return notes


def _strategy_template_doc(title: str, strategy_id: str) -> str:
    return f"""# {title}

## Name

{title}

## Hypothesis

State the edge in one sentence.

## Market Regime

Describe when this should work and when it should fail.

## Inputs

List required market data and derived features.

## Entry

Define deterministic entry conditions.

## Invalidation

Define what kills the setup.

## Exit

Describe time stop, stop loss, and profit-taking logic.

## Risk

Describe sizing, concurrency limits, and kill switches.

## Costs

State fee and slippage assumptions.

## Validation

Describe research, backtest, replay, and paper plan.

## Failure Modes

List expected failure cases.

## Backend Mapping

- `backend/hyperliquid_gateway/strategies/{strategy_id}/`
"""


def _strategy_template_spec(title: str, docs_id: str) -> str:
    return f"""# {title} - Backend Implementation

Full spec:
- `docs/strategies/{docs_id}.md`

Fill in implementation notes for logic, scoring, risk, paper, and review APIs.
"""


def _strategy_template_logic(strategy_id: str) -> str:
    return f'''"""Deterministic signal logic for {strategy_id}."""\n\n\ndef evaluate_signal(payload: dict) -> dict:\n    return {{"strategy_id": "{strategy_id}", "status": "draft", "input_keys": sorted(payload.keys())}}\n'''


def _strategy_template_scoring(strategy_id: str) -> str:
    return f'''"""Ranking helpers for {strategy_id}."""\n\n\ndef score_setup(payload: dict) -> dict:\n    return {{"strategy_id": "{strategy_id}", "rank_score": 0, "status": "draft"}}\n'''


def _strategy_template_risk(strategy_id: str) -> str:
    return f'''"""Risk helpers for {strategy_id}."""\n\n\ndef build_risk_plan(payload: dict) -> dict:\n    return {{"strategy_id": "{strategy_id}", "allowed": False, "status": "draft"}}\n'''


def _strategy_template_paper(strategy_id: str) -> str:
    return f'''"""Paper helpers for {strategy_id}."""\n\n\ndef paper_candidate(payload: dict) -> dict:\n    return {{"strategy_id": "{strategy_id}", "status": "draft"}}\n'''


if __name__ == "__main__":
    raise SystemExit(main())
