"""Skeleton for short squeeze continuation risk rules."""


def build_risk_plan(context: dict) -> dict:
    return {
        "strategy_id": "short_squeeze_continuation",
        "status": "not_implemented",
        "context_keys": sorted(context.keys()),
    }
