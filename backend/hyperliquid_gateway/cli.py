from __future__ import annotations

import argparse
import json
import platform
import sys
from pathlib import Path
from typing import Any

from .backtesting.engine import BacktestConfig
from .backtesting.io import list_csv_files
from .backtesting.registry import available_strategies
from .backtesting.workflow import (
    AUDITS_ROOT,
    BACKEND_ROOT,
    PAPER_ROOT,
    REPORTS_ROOT,
    REPO_ROOT,
    VALIDATIONS_ROOT,
    build_paper_workflow,
    build_status_snapshot,
    run_backtest_workflow,
    timestamp_slug,
    validate_strategy_workflow,
    write_json,
)


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
    backtest_parser.add_argument("--fee-rate", type=float, default=0.00055)
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

    status_parser = subparsers.add_parser("status", help="Summarize research/backtest/validation/paper artifacts.")
    status_parser.set_defaults(func=command_status)
    return parser


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
        config=BacktestConfig(
            initial_equity=args.equity,
            fee_rate=args.fee_rate,
            risk_fraction=args.risk_fraction,
        ),
        output_path=Path(args.output) if args.output else None,
    )
    payload = result["payload"]
    print(json.dumps({"ok": True, "report_path": str(result["report_path"]), "summary": payload["summary"]}, indent=2))
    return 0


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


def command_status(_: argparse.Namespace) -> int:
    print(json.dumps(build_status_snapshot(), indent=2))
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
