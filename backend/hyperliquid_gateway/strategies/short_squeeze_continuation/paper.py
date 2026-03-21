"""Skeleton for short squeeze continuation paper-trading helpers."""


def paper_payload(signal: dict) -> dict:
    return {
        "strategy_id": "short_squeeze_continuation",
        "status": "not_implemented",
        "signal_keys": sorted(signal.keys()),
    }
