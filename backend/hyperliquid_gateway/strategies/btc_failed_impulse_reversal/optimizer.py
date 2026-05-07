from __future__ import annotations

from dataclasses import replace
from pathlib import Path
from typing import Any

try:
    from ...backtesting.doubling import build_doubling_estimate, build_doubling_stability_audit
    from ...backtesting.engine import BacktestConfig
except ImportError:
    from backtesting.doubling import build_doubling_estimate, build_doubling_stability_audit
    from backtesting.engine import BacktestConfig

from .backtest import STRATEGY_ID, failed_impulse_variant_params, run_backtest_with_params


def default_variant_grid() -> list[dict[str, Any]]:
    signal_variants = [
        ("default_signal", {}),
        ("earlier_entry", {"min_impulse_1h_pct": 0.25, "long_min_failed_followthrough_15m_pct": -0.04, "short_max_failed_followthrough_15m_pct": -0.14}),
        ("loose_impulse", {"min_impulse_1h_pct": 0.25}),
        ("strict_impulse", {"min_impulse_1h_pct": 0.35, "long_min_failed_followthrough_15m_pct": -0.04, "short_max_failed_followthrough_15m_pct": -0.20}),
        ("deep_failure", {"min_impulse_1h_pct": 0.40, "long_min_failed_followthrough_15m_pct": -0.02, "short_max_failed_followthrough_15m_pct": -0.25}),
    ]
    risk_variants = [
        ("default_risk", {}),
        ("fast_target", {"stop_loss_pct": 0.55, "take_profit_pct": 1.20, "max_hold_minutes": 240}),
        ("balanced_fast", {"stop_loss_pct": 0.65, "take_profit_pct": 1.45, "max_hold_minutes": 360}),
        ("runner", {"stop_loss_pct": 0.75, "take_profit_pct": 2.10, "max_hold_minutes": 600}),
    ]

    variants: list[dict[str, Any]] = []
    for signal_id, signal_params in signal_variants:
        for risk_id, risk_params in risk_variants:
            variant_id = "default" if signal_id == "default_signal" and risk_id == "default_risk" else f"{signal_id}__{risk_id}"
            variants.append(
                {
                    "variantId": variant_id,
                    "params": failed_impulse_variant_params({**signal_params, **risk_params}),
                }
            )
    return variants


def build_variant_optimizer_report(
    *,
    dataset_path: Path,
    config: BacktestConfig,
    variants: list[dict[str, Any]] | None = None,
    max_variants: int | None = None,
) -> dict[str, Any]:
    replay_config = config
    if replay_config.universe.strip().lower() != "all" and not replay_config.effective_symbols():
        replay_config = replace(replay_config, symbols=("BTC",))

    variant_items = variants or default_variant_grid()
    if max_variants is not None and max_variants > 0:
        variant_items = variant_items[:max_variants]

    rows = []
    for item in variant_items:
        variant_id = str(item.get("variantId") or f"variant_{len(rows) + 1}")
        params = failed_impulse_variant_params(item.get("params") if isinstance(item.get("params"), dict) else {})
        result = run_backtest_with_params(dataset_path, replay_config, params=params, variant_id=variant_id)
        report_payload = _variant_report_payload(
            result=result,
            dataset_path=dataset_path,
            config=replay_config,
            variant_id=variant_id,
            params=params,
        )
        validation_payload = _optimizer_local_validation_payload(result)
        doubling = build_doubling_estimate(report_payload, validation_payload=validation_payload)
        stability = build_doubling_stability_audit(report_payload, validation_payload=validation_payload, slice_count=3)
        rows.append(_variant_row(variant_id, params, result, validation_payload, doubling, stability))

    rows.sort(key=_variant_sort_key)
    for index, row in enumerate(rows, start=1):
        row["rank"] = index

    top = rows[0] if rows else None
    stable_count = sum(1 for row in rows if row.get("reviewStatus") == "stable_candidate")
    fragile_count = sum(1 for row in rows if row.get("reviewStatus") == "fragile_candidate")
    status = "stable-candidate-found" if stable_count else "fragile-best-candidate" if fragile_count else "no-candidate"
    default_variant = next((row for row in rows if row["variantId"] == "default"), None)
    return {
        "strategyId": STRATEGY_ID,
        "status": status,
        "datasetPath": str(dataset_path),
        "config": {
            "initialEquity": replay_config.initial_equity,
            "feeModel": replay_config.fee_model,
            "takerFeeRate": replay_config.taker_fee_rate,
            "makerFeeRate": replay_config.maker_fee_rate,
            "riskFraction": replay_config.risk_fraction,
            "symbols": list(replay_config.effective_symbols()),
            "lookbackDays": replay_config.lookback_days,
            "start": replay_config.start,
            "end": replay_config.end,
        },
        "variantCount": len(rows),
        "stableCandidateCount": stable_count,
        "fragileCandidateCount": fragile_count,
        "topVariant": top,
        "defaultVariant": default_variant,
        "variants": rows,
        "rankingPolicy": [
            "Prefer variants that pass local validation, have stable subwindow distribution, and avoid return concentration.",
            "Then rank by projected days to double, lower concentration, higher return, and more trades.",
        ],
        "promotionBlockers": [
            "optimizer_research_only",
            "matched_validation_artifact",
            "paper_minimum_sample",
            "paper_drift_checks",
            "regime_review",
            "risk_review",
            "operator_sign_off",
        ],
        "notes": [
            "Optimizer variants do not change the registered strategy or the running paper loop.",
            "Any promising variant must be promoted through normal research, backtest, validation, paper, risk, and operator gates.",
        ],
    }


def _variant_report_payload(
    *,
    result: dict[str, Any],
    dataset_path: Path,
    config: BacktestConfig,
    variant_id: str,
    params: dict[str, Any],
) -> dict[str, Any]:
    return {
        "artifact_id": f"optimizer_backtest:{STRATEGY_ID}:{variant_id}",
        "artifact_type": "optimizer_backtest",
        "strategy_id": STRATEGY_ID,
        "dataset": result.get("dataset") or {"path": str(dataset_path)},
        "config": {
            "initial_equity": config.initial_equity,
            "fee_model": config.fee_model,
            "taker_fee_rate": config.taker_fee_rate,
            "maker_fee_rate": config.maker_fee_rate,
            "risk_fraction": config.risk_fraction,
            "symbols": list(config.effective_symbols()),
            "lookback_days": config.lookback_days,
            "variant_id": variant_id,
            "variant_params": params,
        },
        "summary": result.get("summary") or {},
        "trades": result.get("trades") or [],
        "equity_curve": result.get("equity_curve") or [],
        "robust_assessment": result.get("robust_assessment") or {},
        "variant": result.get("variant") or {"variant_id": variant_id, "params": params},
    }


def _optimizer_local_validation_payload(result: dict[str, Any]) -> dict[str, Any]:
    robust = result.get("robust_assessment") if isinstance(result.get("robust_assessment"), dict) else {}
    blockers = [f"robust:{item}" for item in (robust.get("blockers") or [])]
    if robust.get("status") != "passes" and "robust_gate" not in blockers:
        blockers.append("robust_gate")
    return {
        "status": "ready-for-paper" if not blockers else "blocked",
        "blocking_reasons": blockers,
        "mode": "optimizer_local_gate",
    }


def _variant_row(
    variant_id: str,
    params: dict[str, Any],
    result: dict[str, Any],
    validation: dict[str, Any],
    doubling: dict[str, Any],
    stability: dict[str, Any],
) -> dict[str, Any]:
    summary = result.get("summary") if isinstance(result.get("summary"), dict) else {}
    robust = result.get("robust_assessment") if isinstance(result.get("robust_assessment"), dict) else {}
    stability_status = str(stability.get("status") or "unknown")
    doubling_candidate = bool(doubling.get("candidate"))
    if doubling_candidate and stability_status == "stable":
        review_status = "stable_candidate"
    elif doubling_candidate:
        review_status = "fragile_candidate"
    elif float(summary.get("return_pct") or 0.0) > 0:
        review_status = "blocked_positive"
    else:
        review_status = "blocked"

    return {
        "rank": None,
        "variantId": variant_id,
        "reviewStatus": review_status,
        "params": params,
        "summary": summary,
        "robustStatus": robust.get("status"),
        "robustBlockers": robust.get("blockers") or [],
        "validationStatus": validation.get("status"),
        "validationBlockers": validation.get("blocking_reasons") or [],
        "doublingStatus": doubling.get("status"),
        "projectedDaysToDouble": doubling.get("projectedDaysToDouble"),
        "projectedTradesToDouble": doubling.get("projectedTradesToDouble"),
        "returnPct": summary.get("return_pct"),
        "totalTrades": summary.get("total_trades"),
        "profitFactor": summary.get("profit_factor"),
        "winRatePct": summary.get("win_rate_pct"),
        "maxDrawdownPct": summary.get("max_drawdown_pct"),
        "stabilityStatus": stability_status,
        "stabilityBlockers": stability.get("blockers") or [],
        "positiveSliceRatioPct": stability.get("positiveSliceRatioPct"),
        "largestPositiveSlicePnlSharePct": stability.get("largestPositiveSlicePnlSharePct"),
        "slices": stability.get("slices") or [],
    }


def _variant_sort_key(row: dict[str, Any]) -> tuple[float, float, float, float, float, float, float]:
    projected_days = row.get("projectedDaysToDouble")
    days = float(projected_days) if isinstance(projected_days, (int, float)) else 1_000_000.0
    concentration = row.get("largestPositiveSlicePnlSharePct")
    concentration_value = float(concentration) if isinstance(concentration, (int, float)) else 1_000_000.0
    review_status = row.get("reviewStatus")
    stable = 1.0 if review_status == "stable_candidate" else 0.0
    fragile = 1.0 if review_status == "fragile_candidate" else 0.0
    candidate = 1.0 if review_status in {"stable_candidate", "fragile_candidate"} else 0.0
    return_pct = float(row.get("returnPct") or 0.0)
    trades = float(row.get("totalTrades") or 0.0)
    return (-stable, -fragile, -candidate, days, concentration_value, -return_pct, -trades)
