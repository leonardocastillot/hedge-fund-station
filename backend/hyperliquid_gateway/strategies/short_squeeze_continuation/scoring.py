"""Skeleton for short squeeze continuation ranking logic."""


def score_setup(features: dict) -> dict:
    return {
        "strategy_id": "short_squeeze_continuation",
        "score": None,
        "status": "not_implemented",
        "features_seen": sorted(features.keys()),
    }
