"""Skeleton for short squeeze continuation signal logic."""


def evaluate_signal(payload: dict) -> dict:
    """Return a deterministic signal payload for inspection and testing."""
    return {
        "strategy_id": "short_squeeze_continuation",
        "status": "not_implemented",
        "input_keys": sorted(payload.keys()),
    }
