from __future__ import annotations

import json
import os
import sqlite3
import asyncio
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator, TypedDict

try:
    from langgraph.graph import END, START, StateGraph
except ImportError:  # LangGraph is optional for smoke tests and first-run setup.
    END = START = None
    StateGraph = None

try:
    from ..backtesting.registry import available_strategies
    from ..backtesting.workflow import (
        DATA_ROOT,
        PAPER_ROOT,
        REPORTS_ROOT,
        VALIDATIONS_ROOT,
        build_research_snapshot,
        build_status_snapshot,
        latest_json,
        load_json_if_exists,
        now_iso,
        timestamp_slug,
        write_json,
    )
    from ..ai_provider import AIProviderError, complete_json, provider_status
except ImportError:
    from backtesting.registry import available_strategies
    from backtesting.workflow import (
        DATA_ROOT,
        PAPER_ROOT,
        REPORTS_ROOT,
        VALIDATIONS_ROOT,
        build_research_snapshot,
        build_status_snapshot,
        latest_json,
        load_json_if_exists,
        now_iso,
        timestamp_slug,
        write_json,
    )
    from ai_provider import AIProviderError, complete_json, provider_status
from .schemas import AgentDecision, AgentReport, AgentRunArtifact, ValidationGap, model_to_dict
from .runtime import agent_runtime_status, choose_runtime, run_codex_synthesis


AGENT_RUNS_ROOT = DATA_ROOT / "agent_runs"
AGENT_CHECKPOINTS_ROOT = AGENT_RUNS_ROOT / "checkpoints"
DEFAULT_DB_PATH = DATA_ROOT / "hyperliquid.db"
TRADINGAGENTS_URL = "https://github.com/TauricResearch/TradingAgents"


class ResearchState(TypedDict, total=False):
    mode: str
    strategy_id: str
    research: dict[str, Any]
    evidence: dict[str, Any]
    reports: list[AgentReport]
    debate: list[dict[str, str]]
    decision: AgentDecision
    ai: dict[str, Any]
    checkpoint_db: str
    checkpoints: list[dict[str, Any]]


def run_agent_research(
    strategy_id: str,
    *,
    use_ai: bool | None = None,
    provider_order: str | None = None,
    model: str | None = None,
    runtime: str = "auto",
    codex_profile: str | None = None,
) -> dict[str, Any]:
    return run_agent_mission(
        strategy_id=strategy_id,
        mode="research",
        use_ai=use_ai,
        provider_order=provider_order,
        model=model,
        runtime=runtime,
        codex_profile=codex_profile,
    )


def run_agent_audit(
    strategy_id: str,
    *,
    use_ai: bool | None = None,
    provider_order: str | None = None,
    model: str | None = None,
    runtime: str = "auto",
    codex_profile: str | None = None,
) -> dict[str, Any]:
    return run_agent_mission(
        strategy_id=strategy_id,
        mode="audit",
        use_ai=use_ai,
        provider_order=provider_order,
        model=model,
        runtime=runtime,
        codex_profile=codex_profile,
    )


def run_agent_mission(
    *,
    strategy_id: str,
    mode: str,
    use_ai: bool | None = None,
    provider_order: str | None = None,
    model: str | None = None,
    runtime: str = "auto",
    codex_profile: str | None = None,
) -> dict[str, Any]:
    normalized = normalize_strategy_id(strategy_id)
    if mode not in {"research", "audit"}:
        raise ValueError("mode must be research or audit")

    runtime_request = "api-provider" if use_ai and runtime == "auto" else runtime
    with agent_model_env(provider_order=provider_order, model=None):
        runtime_mode = choose_runtime(runtime_request)
        run_id = f"{normalized}-{mode}-{timestamp_slug()}"
        checkpoint_db = AGENT_CHECKPOINTS_ROOT / f"{run_id}.db"
        state: ResearchState = {
            "mode": mode,
            "strategy_id": normalized,
            "research": build_research_snapshot(normalized),
            "evidence": build_evidence_snapshot(normalized),
            "reports": [],
            "debate": [],
            "ai": build_ai_metadata(runtime_mode=runtime_mode, requested_runtime=runtime, use_ai=resolved_use_ai(use_ai)),
            "checkpoint_db": str(checkpoint_db),
            "checkpoints": [],
        }

        final_state, graph_runtime = execute_graph(state)
        if runtime_mode != "deterministic":
            final_state = apply_runtime_synthesis(final_state, runtime_mode=runtime_mode, model=model, codex_profile=codex_profile)
        artifact = build_agent_artifact(run_id=run_id, state=final_state, graph_runtime=graph_runtime)
        payload = model_to_dict(artifact)
        destination = AGENT_RUNS_ROOT / f"{run_id}.json"
        write_json(destination, payload)
        return {"run_path": destination, "payload": payload}


def execute_graph(state: ResearchState) -> tuple[ResearchState, str]:
    if StateGraph is None:
        return execute_sequential(state), "sequential"

    workflow = StateGraph(dict)
    workflow.add_node("market_structure_analyst", market_structure_node)
    workflow.add_node("strategy_researcher_bull", bull_researcher_node)
    workflow.add_node("strategy_researcher_bear", bear_researcher_node)
    workflow.add_node("validation_critic", validation_critic_node)
    workflow.add_node("risk_manager", risk_manager_node)
    workflow.add_node("portfolio_research_manager", portfolio_manager_node)
    workflow.add_edge(START, "market_structure_analyst")
    workflow.add_edge("market_structure_analyst", "strategy_researcher_bull")
    workflow.add_edge("strategy_researcher_bull", "strategy_researcher_bear")
    workflow.add_edge("strategy_researcher_bear", "validation_critic")
    workflow.add_edge("validation_critic", "risk_manager")
    workflow.add_edge("risk_manager", "portfolio_research_manager")
    workflow.add_edge("portfolio_research_manager", END)
    graph = workflow.compile()
    return graph.invoke(state), "langgraph"


def execute_sequential(state: ResearchState) -> ResearchState:
    for node in [
        market_structure_node,
        bull_researcher_node,
        bear_researcher_node,
        validation_critic_node,
        risk_manager_node,
        portfolio_manager_node,
    ]:
        state = node(state)
    return state


def market_structure_node(state: ResearchState) -> ResearchState:
    evidence = state["evidence"]
    runtime = evidence.get("runtime", {})
    top_markets = runtime.get("top_markets", [])
    latest_alerts = runtime.get("latest_alerts", [])
    report = AgentReport(
        role="market_structure_analyst",
        title="Market Structure Analyst",
        thesis=(
            "Use current gateway evidence as context, but require deterministic strategy artifacts "
            "before any promotion."
        ),
        evidence=[
            f"{len(top_markets)} recent market snapshots inspected.",
            f"{len(latest_alerts)} latest alerts inspected.",
            top_market_sentence(top_markets),
        ],
        concerns=[
            "Runtime market context is not a substitute for replay or backtest evidence.",
            runtime.get("error") or "No runtime DB read error detected.",
        ],
        recommended_actions=["Keep generated recommendations tied to hf:* artifacts."],
    )
    return append_report(state, report)


def bull_researcher_node(state: ResearchState) -> ResearchState:
    evidence = state["evidence"]
    research = state["research"]
    latest_backtest = evidence.get("latest_backtest") or {}
    summary = latest_backtest.get("summary") or {}
    positives = [
        "Strategy has a docs research package." if research.get("docs_exists") else "Docs package is missing.",
        "Backend logic package exists." if research.get("logic_exists") else "Backend logic is missing.",
    ]
    if summary:
        positives.append(
            f"Latest backtest: {summary.get('total_trades', 0)} trades, "
            f"{summary.get('return_pct', 0)}% return, profit factor {summary.get('profit_factor', 0)}."
        )
    report = AgentReport(
        role="strategy_researcher_bull",
        title="Strategy Researcher Bull",
        thesis="The constructive case is strongest when written strategy intent, backend logic, and artifact evidence line up.",
        evidence=positives,
        concerns=["Bull case remains provisional until validation and paper evidence are present."],
        recommended_actions=recommend_next_commands(state),
    )
    state = append_report(state, report)
    state["debate"].append({"speaker": "bull", "message": report.thesis})
    checkpoint(state, "bull_researcher")
    return state


def bear_researcher_node(state: ResearchState) -> ResearchState:
    gaps = package_gaps(state["research"])
    evidence = state["evidence"]
    blockers = list(gaps)
    if not evidence.get("latest_backtest"):
        blockers.append("No latest backtest artifact.")
    if not evidence.get("latest_validation"):
        blockers.append("No latest validation artifact.")
    latest_validation = evidence.get("latest_validation") or {}
    if latest_validation.get("status") == "blocked":
        blockers.extend(latest_validation.get("blocking_reasons") or [])
    report = AgentReport(
        role="strategy_researcher_bear",
        title="Strategy Researcher Bear",
        thesis="The skeptical case focuses on missing evidence, weak sample quality, and promotion risk.",
        evidence=blockers or ["No major packaging blocker detected."],
        concerns=[
            "Do not let LLM debate override failed validation gates.",
            "Treat sparse backtests as research notes, not edge proof.",
        ],
        recommended_actions=recommend_next_commands(state),
    )
    state = append_report(state, report)
    state["debate"].append({"speaker": "bear", "message": "; ".join(report.evidence[:4])})
    checkpoint(state, "bear_researcher")
    return state


def validation_critic_node(state: ResearchState) -> ResearchState:
    gaps = build_validation_gaps(state)
    report = AgentReport(
        role="validation_critic",
        title="Validation Critic",
        thesis="Promotion requires inspectable backtest, validation, replay/paper path, fees, slippage, and blocker closure.",
        evidence=[gap.description for gap in gaps if gap.severity != "info"] or ["Validation artifact coverage looks acceptable for the current stage."],
        concerns=[
            "Paper candidate generation is not paper execution evidence.",
            "Live automation remains out of scope.",
        ],
        recommended_actions=[gap.recommended_command for gap in gaps if gap.recommended_command],
    )
    state = append_report(state, report)
    checkpoint(state, "validation_critic")
    return state


def risk_manager_node(state: ResearchState) -> ResearchState:
    evidence = state["evidence"]
    latest_validation = evidence.get("latest_validation") or {}
    status = latest_validation.get("status") or "not_validated"
    report = AgentReport(
        role="risk_manager",
        title="Risk Manager",
        thesis=f"Risk stance is constrained by validation status: {status}.",
        evidence=[
            "Promotion allowed: false for all agentic research artifacts.",
            "Use backend risk.py, validation gates, and paper journal before operator sign-off.",
        ],
        concerns=[
            "No live execution from the Research OS.",
            "No auto-promotion from LLM recommendations.",
        ],
        recommended_actions=["Review sizing, stop, invalidation, and kill-switch text before paper review."],
    )
    state = append_report(state, report)
    checkpoint(state, "risk_manager")
    return state


def portfolio_manager_node(state: ResearchState) -> ResearchState:
    gaps = build_validation_gaps(state)
    blockers = [gap.description for gap in gaps if gap.severity == "blocker"]
    recommendation = infer_recommendation(state, gaps)
    confidence = infer_confidence(state, blockers)
    decision = AgentDecision(
        recommendation=recommendation,
        confidence=confidence,
        promotion_allowed=False,
        executive_summary=executive_summary_for(recommendation, blockers),
        thesis="Agentic research can prioritize the next validation step, but backend artifacts remain the source of truth.",
        blockers=blockers,
        validation_gaps=gaps,
        recommended_commands=recommend_next_commands(state),
        next_human_review=next_human_review_for(recommendation),
    )
    state["decision"] = decision
    state = append_report(
        state,
        AgentReport(
            role="portfolio_research_manager",
            title="Portfolio/Research Manager",
            thesis=decision.executive_summary,
            evidence=[f"Recommendation: {decision.recommendation}", f"Confidence: {decision.confidence}"],
            concerns=decision.blockers,
            recommended_actions=decision.recommended_commands,
        ),
    )
    checkpoint(state, "portfolio_research_manager")
    return state


def build_agent_artifact(*, run_id: str, state: ResearchState, graph_runtime: str) -> AgentRunArtifact:
    artifact_id = f"agent_research_run:{state['strategy_id']}:{timestamp_slug()}"
    decision = state.get("decision")
    if decision is None:
        raise ValueError("Agent graph completed without a decision.")
    return AgentRunArtifact(
        artifact_id=artifact_id,
        artifact_type="agent_research_run",
        generated_at=now_iso(),
        run_id=run_id,
        mode=state["mode"],  # type: ignore[arg-type]
        strategy_id=state["strategy_id"],
        graph_runtime=graph_runtime,  # type: ignore[arg-type]
        source_inspiration={
            "name": "TradingAgents",
            "url": TRADINGAGENTS_URL,
            "adaptation": "Role graph, debate, structured output, memory, and checkpoints adapted to local backend artifacts.",
        },
        research=state["research"],
        evidence=state["evidence"],
        reports=state["reports"],
        debate=state["debate"],
        decision=decision,
        ai=state.get("ai", {}),
        checkpoints={
            "sqlite_path": state.get("checkpoint_db"),
            "steps": state.get("checkpoints", []),
        },
        lineage={
            "stage": "agent_research",
            "parents": artifact_parent_paths(state["evidence"]),
            "children": ["backtest_report", "validation_report", "paper_candidate"],
        },
    )


def resolved_use_ai(use_ai: bool | None) -> bool:
    if use_ai is not None:
        return use_ai
    return os.getenv("HF_AGENT_USE_AI", "").strip().lower() in {"1", "true", "yes", "on"}


@contextmanager
def agent_model_env(*, provider_order: str | None, model: str | None) -> Iterator[None]:
    old_values = {
        "AI_PROVIDER_ORDER": os.environ.get("AI_PROVIDER_ORDER"),
        "DEEPSEEK_MODEL": os.environ.get("DEEPSEEK_MODEL"),
        "OPENAI_AGENT_MODEL": os.environ.get("OPENAI_AGENT_MODEL"),
    }
    try:
        if provider_order:
            os.environ["AI_PROVIDER_ORDER"] = provider_order
        if model:
            providers = [item.strip().lower() for item in (provider_order or os.getenv("AI_PROVIDER_ORDER", "deepseek")).split(",")]
            if "openai" in providers and "deepseek" not in providers:
                os.environ["OPENAI_AGENT_MODEL"] = model
            else:
                os.environ["DEEPSEEK_MODEL"] = model
        yield
    finally:
        for key, value in old_values.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


def build_ai_metadata(*, runtime_mode: str, requested_runtime: str, use_ai: bool) -> dict[str, Any]:
    status = provider_status()
    runtime_status = agent_runtime_status()
    return {
        "enabled": runtime_mode != "deterministic" or use_ai,
        "runtime_mode": runtime_mode,
        "requested_runtime": requested_runtime,
        "runtime_status": runtime_status,
        "provider_status": status,
        "provider": "deterministic",
        "model": None,
        "fallback_used": False,
        "errors": [],
    }


def apply_runtime_synthesis(
    state: ResearchState,
    *,
    runtime_mode: str,
    model: str | None,
    codex_profile: str | None,
) -> ResearchState:
    decision = state.get("decision")
    if decision is None:
        return state
    try:
        if runtime_mode == "codex-local":
            result, meta = request_codex_decision_synthesis(state, decision, model=model, codex_profile=codex_profile)
        elif runtime_mode == "api-provider":
            with agent_model_env(provider_order=None, model=model):
                result, meta = asyncio.run(request_ai_decision_synthesis(state, decision))
        else:
            return state
        merged = merge_ai_decision(decision, result)
        state["decision"] = merged
        state["ai"] = {
            **state.get("ai", {}),
            "enabled": True,
            "runtime_mode": runtime_mode,
            "provider": meta.get("provider"),
            "model": meta.get("model"),
            "profile": meta.get("profile"),
            "fallback_used": meta.get("fallbackUsed", False),
            "errors": meta.get("errors", []),
            "synthesis_applied": True,
        }
        checkpoint(state, f"{runtime_mode}_synthesis")
    except (AIProviderError, ValueError, TypeError, RuntimeError, TimeoutError) as exc:
        provider = getattr(exc, "provider", "ai")
        message = getattr(exc, "message", str(exc))
        state["ai"] = {
            **state.get("ai", {}),
            "enabled": True,
            "runtime_mode": "deterministic",
            "attempted_runtime": runtime_mode,
            "provider": "deterministic",
            "model": None,
            "fallback_used": True,
            "errors": [{"provider": provider, "message": message}],
            "synthesis_applied": False,
        }
        checkpoint(state, f"{runtime_mode}_synthesis_failed")
    return state


def request_codex_decision_synthesis(
    state: ResearchState,
    decision: AgentDecision,
    *,
    model: str | None,
    codex_profile: str | None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    prompt = codex_synthesis_prompt(state, decision)
    schema = synthesis_output_schema()
    output_dir = Path(state["checkpoint_db"]).parent / f"{state['strategy_id']}-{state['mode']}-codex"
    return run_codex_synthesis(
        prompt=prompt,
        schema=schema,
        output_dir=output_dir,
        model=model,
        codex_profile=codex_profile,
    )


def codex_synthesis_prompt(state: ResearchState, decision: AgentDecision) -> str:
    payload = {
        "strategy_id": state["strategy_id"],
        "mode": state["mode"],
        "research": state["research"],
        "evidence_paths": {
            "backtest": state["evidence"].get("latest_backtest_path"),
            "validation": state["evidence"].get("latest_validation_path"),
            "paper": state["evidence"].get("latest_paper_path"),
        },
        "reports": [model_to_dict(report) for report in state.get("reports", [])],
        "deterministic_decision": model_to_dict(decision),
    }
    return (
        "You are the Codex-local synthesis runtime for Hedge Fund Station's Agentic Research OS.\n"
        "Read the JSON payload below and return only a JSON object matching the provided schema.\n"
        "Improve the executive summary, thesis, blockers, recommended npm run hf:* commands, and next human review.\n"
        "Do not allow live trading. Do not say promotion is allowed. Do not change the deterministic recommendation.\n"
        "Stay grounded in the provided artifacts and explicit blockers.\n\n"
        f"PAYLOAD:\n{json.dumps(payload, indent=2)}"
    )


def synthesis_output_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "executive_summary": {"type": "string"},
            "thesis": {"type": "string"},
            "confidence": {"type": "integer", "minimum": 0, "maximum": 100},
            "blockers": {"type": "array", "items": {"type": "string"}},
            "recommended_commands": {"type": "array", "items": {"type": "string"}},
            "next_human_review": {"type": "string"},
        },
        "required": [
            "executive_summary",
            "thesis",
            "confidence",
            "blockers",
            "recommended_commands",
            "next_human_review",
        ],
    }


async def request_ai_decision_synthesis(state: ResearchState, decision: AgentDecision) -> tuple[dict[str, Any], dict[str, Any]]:
    system_prompt = """You are the Agentic Research OS portfolio manager for Hedge Fund Station.
Return strict JSON only. Improve the final research decision without changing safety rules.
Never allow live trading. Never set promotion_allowed to true. Keep recommended commands limited to npm run hf:* commands.
Prefer concrete validation blockers over hype."""
    payload = {
        "strategy_id": state["strategy_id"],
        "mode": state["mode"],
        "research": state["research"],
        "evidence_paths": {
            "backtest": state["evidence"].get("latest_backtest_path"),
            "validation": state["evidence"].get("latest_validation_path"),
            "paper": state["evidence"].get("latest_paper_path"),
        },
        "reports": [model_to_dict(report) for report in state.get("reports", [])],
        "deterministic_decision": model_to_dict(decision),
        "required_schema": {
            "executive_summary": "string",
            "thesis": "string",
            "confidence": "integer 0-100, do not exceed deterministic confidence by more than 10",
            "blockers": ["string"],
            "recommended_commands": ["npm run hf:*"],
            "next_human_review": "string",
        },
    }
    return await complete_json(system_prompt=system_prompt, user_payload=payload, max_tokens=1800)


def merge_ai_decision(decision: AgentDecision, ai_result: dict[str, Any]) -> AgentDecision:
    recommended_commands = [
        command
        for command in ai_result.get("recommended_commands", decision.recommended_commands)
        if isinstance(command, str) and command.startswith("npm run hf:")
    ] or decision.recommended_commands
    confidence = ai_result.get("confidence", decision.confidence)
    try:
        confidence_int = int(confidence)
    except (TypeError, ValueError):
        confidence_int = decision.confidence
    confidence_int = max(0, min(confidence_int, min(95, decision.confidence + 10)))
    return AgentDecision(
        recommendation=decision.recommendation,
        confidence=confidence_int,
        promotion_allowed=False,
        executive_summary=str(ai_result.get("executive_summary") or decision.executive_summary),
        thesis=str(ai_result.get("thesis") or decision.thesis),
        blockers=[str(item) for item in ai_result.get("blockers", decision.blockers) if str(item).strip()],
        validation_gaps=decision.validation_gaps,
        recommended_commands=recommended_commands,
        next_human_review=str(ai_result.get("next_human_review") or decision.next_human_review),
    )


def build_evidence_snapshot(strategy_id: str) -> dict[str, Any]:
    latest_backtest = latest_json(REPORTS_ROOT, f"{strategy_id}-")
    latest_validation = latest_json(VALIDATIONS_ROOT, f"{strategy_id}-")
    latest_paper = latest_json(PAPER_ROOT, f"{strategy_id}-")
    return {
        "registered_for_backtest": strategy_id in available_strategies(),
        "status_snapshot": strategy_status(strategy_id),
        "latest_backtest_path": str(latest_backtest) if latest_backtest else None,
        "latest_validation_path": str(latest_validation) if latest_validation else None,
        "latest_paper_path": str(latest_paper) if latest_paper else None,
        "latest_backtest": load_json_if_exists(latest_backtest) if latest_backtest else None,
        "latest_validation": load_json_if_exists(latest_validation) if latest_validation else None,
        "latest_paper": load_json_if_exists(latest_paper) if latest_paper else None,
        "runtime": runtime_snapshot(),
    }


def strategy_status(strategy_id: str) -> dict[str, Any] | None:
    snapshot = build_status_snapshot()
    for row in snapshot.get("strategy_status", []):
        if row.get("strategy_id") == strategy_id:
            return row
    return None


def runtime_snapshot(limit: int = 8) -> dict[str, Any]:
    db_path = Path(os.getenv("HYPERLIQUID_DB_PATH", str(DEFAULT_DB_PATH)))
    if not db_path.exists():
        return {"db_path": str(db_path), "top_markets": [], "latest_alerts": [], "error": "runtime database not found"}
    try:
        with sqlite3.connect(str(db_path)) as connection:
            connection.row_factory = sqlite3.Row
            markets = [
                dict(row)
                for row in connection.execute(
                    """
                    SELECT timestamp_ms, symbol, price, change24h_pct, open_interest_usd,
                           volume24h, funding_rate, opportunity_score, signal_label,
                           risk_label, primary_setup, setup_scores_json
                    FROM market_snapshots
                    ORDER BY timestamp_ms DESC
                    LIMIT ?
                    """,
                    (limit,),
                ).fetchall()
            ]
            alerts = [
                dict(row)
                for row in connection.execute(
                    """
                    SELECT created_at_ms, symbol, type, severity, message, value, delta
                    FROM alerts
                    ORDER BY created_at_ms DESC
                    LIMIT ?
                    """,
                    (limit,),
                ).fetchall()
            ]
        return {"db_path": str(db_path), "top_markets": markets, "latest_alerts": alerts, "error": None}
    except sqlite3.Error as exc:
        return {"db_path": str(db_path), "top_markets": [], "latest_alerts": [], "error": str(exc)}


def append_report(state: ResearchState, report: AgentReport) -> ResearchState:
    state.setdefault("reports", []).append(report)
    checkpoint(state, report.role)
    return state


def checkpoint(state: ResearchState, step: str) -> None:
    db_path = Path(state["checkpoint_db"])
    db_path.parent.mkdir(parents=True, exist_ok=True)
    generated_at = now_iso()
    state.setdefault("checkpoints", []).append({"step": step, "recorded_at": generated_at})
    with sqlite3.connect(str(db_path)) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS agent_checkpoints (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_key TEXT NOT NULL,
                step TEXT NOT NULL,
                recorded_at TEXT NOT NULL,
                payload_json TEXT NOT NULL
            )
            """
        )
        connection.execute(
            "INSERT INTO agent_checkpoints (run_key, step, recorded_at, payload_json) VALUES (?, ?, ?, ?)",
            (
                f"{state['strategy_id']}:{state['mode']}",
                step,
                generated_at,
                json.dumps(checkpoint_payload(state), indent=2),
            ),
        )
        connection.commit()


def checkpoint_payload(state: ResearchState) -> dict[str, Any]:
    return {
        "strategy_id": state["strategy_id"],
        "mode": state["mode"],
        "reports": [model_to_dict(report) for report in state.get("reports", [])],
        "debate": state.get("debate", []),
        "decision": model_to_dict(state["decision"]) if state.get("decision") else None,
    }


def build_validation_gaps(state: ResearchState) -> list[ValidationGap]:
    research = state["research"]
    evidence = state["evidence"]
    gaps: list[ValidationGap] = []
    for key, description in {
        "docs_exists": "Strategy docs are missing.",
        "spec_exists": "Backend strategy spec is missing.",
        "logic_exists": "Deterministic backend logic is missing.",
        "scoring_exists": "Scoring module is missing.",
        "risk_exists": "Risk module is missing.",
        "paper_exists": "Paper candidate module is missing.",
    }.items():
        if not research.get(key):
            gaps.append(ValidationGap(key=key, severity="blocker", description=description))
    if not evidence.get("registered_for_backtest"):
        gaps.append(
            ValidationGap(
                key="registered_for_backtest",
                severity="blocker",
                description="Strategy is not registered for deterministic backtests.",
            )
        )
    if not evidence.get("latest_backtest"):
        gaps.append(
            ValidationGap(
                key="latest_backtest",
                severity="blocker",
                description="No backtest artifact exists for this strategy.",
                recommended_command=f"npm run hf:backtest -- --strategy {state['strategy_id']}",
            )
        )
    if not evidence.get("latest_validation"):
        gaps.append(
            ValidationGap(
                key="latest_validation",
                severity="blocker",
                description="No validation artifact exists for this strategy.",
                recommended_command=f"npm run hf:validate -- --strategy {state['strategy_id']}",
            )
        )
    else:
        latest_validation = evidence.get("latest_validation") or {}
        if latest_validation.get("status") != "blocked":
            latest_validation = {}
        for reason in latest_validation.get("blocking_reasons") or []:
            gaps.append(
                ValidationGap(
                    key=f"validation_blocked:{reason}",
                    severity="blocker",
                    description=f"Validation blocker: {reason}.",
                    recommended_command=f"npm run hf:validate -- --strategy {state['strategy_id']}",
                )
            )
    latest_validation = evidence.get("latest_validation") or {}
    if latest_validation.get("status") == "ready-for-paper" and not evidence.get("latest_paper"):
        gaps.append(
            ValidationGap(
                key="latest_paper",
                severity="warning",
                description="Validation is ready, but no paper candidate artifact exists.",
                recommended_command=f"npm run hf:paper -- --strategy {state['strategy_id']}",
            )
        )
    gaps.append(
        ValidationGap(
            key="agentic_safety",
            severity="info",
            description="Agentic recommendations are auxiliary evidence and cannot promote live trading.",
        )
    )
    return gaps


def recommend_next_commands(state: ResearchState) -> list[str]:
    commands = []
    for gap in build_validation_gaps(state):
        if gap.recommended_command and gap.recommended_command not in commands:
            commands.append(gap.recommended_command)
    if not commands:
        commands.append("npm run hf:status")
    return commands


def infer_recommendation(state: ResearchState, gaps: list[ValidationGap]) -> str:
    blockers = [gap for gap in gaps if gap.severity == "blocker"]
    evidence = state["evidence"]
    if blockers:
        if not evidence.get("latest_backtest"):
            return "backtest_next"
        latest_validation = evidence.get("latest_validation") or {}
        if not latest_validation or latest_validation.get("status") == "blocked":
            return "validation_next"
        return "blocked"
    latest_validation = evidence.get("latest_validation") or {}
    if latest_validation.get("status") == "ready-for-paper":
        return "paper_candidate_review"
    return "research_only"


def infer_confidence(state: ResearchState, blockers: list[str]) -> int:
    evidence = state["evidence"]
    score = 35
    if evidence.get("latest_backtest"):
        score += 15
    if evidence.get("latest_validation"):
        score += 15
    if evidence.get("latest_paper"):
        score += 10
    score -= min(len(blockers) * 6, 30)
    return max(0, min(score, 85))


def executive_summary_for(recommendation: str, blockers: list[str]) -> str:
    if recommendation == "backtest_next":
        return "Run or repair the deterministic backtest before trusting the strategy thesis."
    if recommendation == "validation_next":
        return "Validation is the next decision gate; close blockers before paper review."
    if recommendation == "paper_candidate_review":
        return "Backtest and validation evidence support human review for a paper candidate, not live trading."
    if recommendation == "blocked":
        return f"Research package is blocked by {len(blockers)} unresolved issue(s)."
    return "Keep this in research mode and improve evidence quality."


def next_human_review_for(recommendation: str) -> str:
    return {
        "backtest_next": "Review latest backtest command output and inspect generated report JSON.",
        "validation_next": "Review validation blockers and decide whether to refine strategy logic or thresholds.",
        "paper_candidate_review": "Inspect paper candidate, risk plan, and operator sign-off checklist.",
        "blocked": "Resolve package blockers before spending more model cycles.",
        "research_only": "Review thesis quality and decide if this deserves backtest work.",
    }[recommendation]


def package_gaps(research: dict[str, Any]) -> list[str]:
    labels = {
        "docs_exists": "docs",
        "spec_exists": "backend spec",
        "logic_exists": "logic.py",
        "scoring_exists": "scoring.py",
        "risk_exists": "risk.py",
        "paper_exists": "paper.py",
    }
    return [f"Missing {label}." for key, label in labels.items() if not research.get(key)]


def top_market_sentence(markets: list[dict[str, Any]]) -> str:
    if not markets:
        return "No runtime market snapshots available."
    symbols = [str(row.get("symbol")) for row in markets[:5] if row.get("symbol")]
    return "Recent runtime symbols: " + ", ".join(symbols) + "."


def artifact_parent_paths(evidence: dict[str, Any]) -> list[str]:
    return [
        path
        for path in [
            evidence.get("latest_backtest_path"),
            evidence.get("latest_validation_path"),
            evidence.get("latest_paper_path"),
        ]
        if path
    ]


def list_agent_runs(*, strategy_id: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
    if not AGENT_RUNS_ROOT.exists():
        return []
    normalized = normalize_strategy_id(strategy_id) if strategy_id else None
    runs: list[dict[str, Any]] = []
    for path in sorted(AGENT_RUNS_ROOT.glob("*.json"), key=lambda item: item.stat().st_mtime, reverse=True):
        payload = load_json_if_exists(path)
        if not payload:
            continue
        if normalized and payload.get("strategy_id") != normalized:
            continue
        decision = payload.get("decision") or {}
        runs.append(
            {
                "run_id": payload.get("run_id"),
                "strategy_id": payload.get("strategy_id"),
                "mode": payload.get("mode"),
                "generated_at": payload.get("generated_at"),
                "path": str(path),
                "graph_runtime": payload.get("graph_runtime"),
                "recommendation": decision.get("recommendation"),
                "confidence": decision.get("confidence"),
                "promotion_allowed": decision.get("promotion_allowed", False),
                "runtime_mode": (payload.get("ai") or {}).get("runtime_mode", "unknown"),
                "runtime_provider": (payload.get("ai") or {}).get("provider", "deterministic"),
                "blocker_count": len(decision.get("blockers") or []),
                "recommended_commands": decision.get("recommended_commands") or [],
            }
        )
        if len(runs) >= limit:
            break
    return runs


def latest_agent_run_payload(strategy_id: str) -> dict[str, Any] | None:
    runs = list_agent_runs(strategy_id=strategy_id, limit=1)
    if not runs:
        return None
    return load_agent_run(str(runs[0]["run_id"]))


def load_agent_run(run_id: str) -> dict[str, Any] | None:
    safe_run_id = safe_path_component(run_id)
    path = AGENT_RUNS_ROOT / f"{safe_run_id}.json"
    if not path.exists():
        return None
    return load_json_if_exists(path)


def normalize_strategy_id(value: str) -> str:
    return value.strip().lower().replace("-", "_").replace(" ", "_")


def safe_path_component(value: str) -> str:
    cleaned = value.strip().replace("/", "_").replace("\\", "_")
    if cleaned in {"", ".", ".."} or ".." in cleaned:
        raise ValueError("invalid run id")
    return cleaned
