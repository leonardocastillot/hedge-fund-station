from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


AgentMode = Literal["research", "audit"]
AgentRole = Literal[
    "market_structure_analyst",
    "strategy_researcher_bull",
    "strategy_researcher_bear",
    "validation_critic",
    "risk_manager",
    "portfolio_research_manager",
]
AgentRecommendation = Literal[
    "research_only",
    "backtest_next",
    "validation_next",
    "paper_candidate_review",
    "blocked",
]


class AgentReport(BaseModel):
    role: AgentRole
    title: str
    thesis: str
    evidence: list[str] = Field(default_factory=list)
    concerns: list[str] = Field(default_factory=list)
    recommended_actions: list[str] = Field(default_factory=list)


class ValidationGap(BaseModel):
    key: str
    severity: Literal["info", "warning", "blocker"]
    description: str
    recommended_command: Optional[str] = None


class AgentDecision(BaseModel):
    recommendation: AgentRecommendation
    confidence: int = Field(ge=0, le=100)
    promotion_allowed: bool
    executive_summary: str
    thesis: str
    blockers: list[str] = Field(default_factory=list)
    validation_gaps: list[ValidationGap] = Field(default_factory=list)
    recommended_commands: list[str] = Field(default_factory=list)
    next_human_review: str


class AgentRunArtifact(BaseModel):
    artifact_id: str
    artifact_type: Literal["agent_research_run"]
    generated_at: str
    run_id: str
    mode: AgentMode
    strategy_id: str
    graph_runtime: Literal["langgraph", "sequential"]
    source_inspiration: dict[str, str]
    research: dict[str, Any]
    evidence: dict[str, Any]
    reports: list[AgentReport]
    debate: list[dict[str, str]]
    decision: AgentDecision
    ai: dict[str, Any] = Field(default_factory=dict)
    checkpoints: dict[str, Any]
    lineage: dict[str, Any]


def model_to_dict(model: BaseModel) -> dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump(mode="json")
    return model.dict()
