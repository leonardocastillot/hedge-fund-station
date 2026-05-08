from __future__ import annotations

import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def parse_artifact_time(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        numeric = float(value)
        if numeric > 10_000_000_000:
            numeric = numeric / 1000.0
        try:
            return datetime.fromtimestamp(numeric, tz=timezone.utc)
        except (OverflowError, OSError, ValueError):
            return None
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    if cleaned.isdigit():
        return parse_artifact_time(int(cleaned))
    try:
        parsed = datetime.fromisoformat(cleaned.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _number(value: Any, default: float = 0.0) -> float:
    if isinstance(value, bool):
        return default
    if isinstance(value, (int, float)) and math.isfinite(float(value)):
        return float(value)
    return default


def _string(value: Any) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    cleaned: list[str] = []
    for item in value:
        text = str(item).strip()
        if text and text not in cleaned:
            cleaned.append(text)
    return cleaned


def _dataset_window_days(dataset: dict[str, Any]) -> tuple[str | None, str | None, float | None]:
    start_text = _string(dataset.get("start"))
    end_text = _string(dataset.get("end"))
    start = parse_artifact_time(start_text)
    end = parse_artifact_time(end_text)
    if start is None or end is None or end <= start:
        return start_text, end_text, None
    return start_text, end_text, round((end - start).total_seconds() / 86_400, 4)


def _trade_time(trade: dict[str, Any]) -> datetime | None:
    return (
        parse_artifact_time(trade.get("exit_timestamp"))
        or parse_artifact_time(trade.get("exit_time"))
        or parse_artifact_time(trade.get("entry_timestamp"))
        or parse_artifact_time(trade.get("entry_time"))
    )


def _profit_factor(trades: list[dict[str, Any]]) -> float:
    gross_profit = sum(_number(trade.get("net_pnl")) for trade in trades if _number(trade.get("net_pnl")) > 0)
    gross_loss = abs(sum(_number(trade.get("net_pnl")) for trade in trades if _number(trade.get("net_pnl")) < 0))
    if gross_loss:
        return gross_profit / gross_loss
    return 99.0 if gross_profit > 0 else 0.0


def _median(values: list[float]) -> float | None:
    if not values:
        return None
    sorted_values = sorted(values)
    midpoint = len(sorted_values) // 2
    if len(sorted_values) % 2:
        return sorted_values[midpoint]
    return (sorted_values[midpoint - 1] + sorted_values[midpoint]) / 2.0


def _slice_boundaries(start: datetime, end: datetime, slice_count: int) -> list[tuple[datetime, datetime]]:
    total_seconds = (end - start).total_seconds()
    if total_seconds <= 0 or slice_count <= 0:
        return []
    boundaries: list[tuple[datetime, datetime]] = []
    for index in range(slice_count):
        slice_start = start.timestamp() + (total_seconds * (index / slice_count))
        slice_end = start.timestamp() + (total_seconds * ((index + 1) / slice_count))
        boundaries.append(
            (
                datetime.fromtimestamp(slice_start, tz=timezone.utc),
                datetime.fromtimestamp(slice_end, tz=timezone.utc),
            )
        )
    return boundaries


def _slice_status(return_pct: float, trades: int, profit_factor: float) -> str:
    if trades <= 0:
        return "no-trades"
    if return_pct <= 0:
        return "negative"
    if profit_factor < 1.2:
        return "weak-positive"
    return "positive"


def _doubling_status(
    *,
    return_pct: float,
    sample_days: float | None,
    total_trades: int,
    robust_status: str | None,
    validation_status: str | None,
    blockers: list[str],
) -> str:
    if sample_days is None or sample_days <= 0:
        return "insufficient-window"
    if return_pct <= 0:
        return "no-positive-return"
    if total_trades <= 0:
        return "insufficient-trades"
    if robust_status != "passes":
        return "blocked"
    if validation_status and validation_status != "ready-for-paper":
        return "blocked"
    if blockers:
        return "blocked"
    if validation_status != "ready-for-paper":
        return "unvalidated"
    return "candidate"


def build_doubling_estimate(
    report_payload: dict[str, Any],
    *,
    report_path: Path | None = None,
    validation_payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    summary = report_payload.get("summary") if isinstance(report_payload.get("summary"), dict) else {}
    dataset = report_payload.get("dataset") if isinstance(report_payload.get("dataset"), dict) else {}
    config = report_payload.get("config") if isinstance(report_payload.get("config"), dict) else {}
    robust = report_payload.get("robust_assessment") if isinstance(report_payload.get("robust_assessment"), dict) else {}
    validation = validation_payload if isinstance(validation_payload, dict) else {}

    sample_start, sample_end, sample_days = _dataset_window_days(dataset)
    return_pct = _number(summary.get("return_pct"))
    return_decimal = return_pct / 100.0
    total_trades = int(_number(summary.get("total_trades")))
    robust_status = _string(robust.get("status"))
    validation_status = _string(validation.get("status"))

    blockers = [
        *_string_list(robust.get("blockers")),
        *_string_list(validation.get("blocking_reasons")),
    ]
    blockers = list(dict.fromkeys(blockers))

    projected_days: float | None = None
    projected_trades: int | None = None
    daily_return_pct: float | None = None
    periods_to_double: float | None = None
    if sample_days is not None and sample_days > 0 and return_decimal > 0:
        periods_to_double = math.log(2) / math.log1p(return_decimal)
        projected_days = round(sample_days * periods_to_double, 1)
        if total_trades > 0:
            projected_trades = int(math.ceil(total_trades * periods_to_double))
        daily_return_pct = round(((1.0 + return_decimal) ** (1.0 / sample_days) - 1.0) * 100.0, 4)

    status = _doubling_status(
        return_pct=return_pct,
        sample_days=sample_days,
        total_trades=total_trades,
        robust_status=robust_status,
        validation_status=validation_status,
        blockers=blockers,
    )
    if status == "no-positive-return" and "positive_net_return" not in blockers:
        blockers.append("positive_net_return")
    if status == "insufficient-window" and "sample_window" not in blockers:
        blockers.append("sample_window")
    if status == "insufficient-trades" and "total_trades" not in blockers:
        blockers.append("total_trades")
    if status == "blocked" and robust_status != "passes" and "robust_gate" not in blockers:
        blockers.append("robust_gate")
    if status == "blocked" and validation_status and validation_status != "ready-for-paper" and "validation_status" not in blockers:
        blockers.append("validation_status")

    return {
        "status": status,
        "candidate": status == "candidate",
        "strategyId": report_payload.get("strategy_id"),
        "artifactId": report_payload.get("artifact_id"),
        "reportPath": str(report_path) if report_path else None,
        "sampleStart": sample_start,
        "sampleEnd": sample_end,
        "sampleDays": sample_days,
        "returnPct": round(return_pct, 4),
        "geometricDailyReturnPct": daily_return_pct,
        "projectedDaysToDouble": projected_days,
        "projectedTradesToDouble": projected_trades,
        "periodsToDouble": round(periods_to_double, 2) if periods_to_double is not None else None,
        "totalTrades": total_trades,
        "feeModel": config.get("fee_model"),
        "riskFraction": config.get("risk_fraction"),
        "robustStatus": robust_status,
        "validationStatus": validation_status,
        "blockers": blockers,
    }


def build_doubling_stability_audit(
    report_payload: dict[str, Any],
    *,
    report_path: Path | None = None,
    validation_payload: dict[str, Any] | None = None,
    slice_count: int = 3,
) -> dict[str, Any]:
    dataset = report_payload.get("dataset") if isinstance(report_payload.get("dataset"), dict) else {}
    summary = report_payload.get("summary") if isinstance(report_payload.get("summary"), dict) else {}
    trades = report_payload.get("trades") if isinstance(report_payload.get("trades"), list) else []
    initial_equity = _number(summary.get("initial_equity"), 100_000.0) or 100_000.0
    sample_start_text, sample_end_text, sample_days = _dataset_window_days(dataset)
    sample_start = parse_artifact_time(sample_start_text)
    sample_end = parse_artifact_time(sample_end_text)
    doubling = build_doubling_estimate(
        report_payload,
        report_path=report_path,
        validation_payload=validation_payload,
    )

    if sample_start is None or sample_end is None or sample_end <= sample_start:
        return {
            "status": "insufficient-window",
            "strategyId": report_payload.get("strategy_id"),
            "artifactId": report_payload.get("artifact_id"),
            "reportPath": str(report_path) if report_path else None,
            "doublingEstimate": doubling,
            "sampleStart": sample_start_text,
            "sampleEnd": sample_end_text,
            "sampleDays": sample_days,
            "sliceCount": 0,
            "slices": [],
            "blockers": ["sample_window"],
        }

    boundaries = _slice_boundaries(sample_start, sample_end, max(1, slice_count))
    slices = []
    for index, (slice_start, slice_end) in enumerate(boundaries):
        slice_trades = []
        for trade in trades:
            trade_time = _trade_time(trade)
            if trade_time is None:
                continue
            if index == len(boundaries) - 1:
                in_window = slice_start <= trade_time <= slice_end
            else:
                in_window = slice_start <= trade_time < slice_end
            if in_window:
                slice_trades.append(trade)
        net_pnl = sum(_number(trade.get("net_pnl")) for trade in slice_trades)
        wins = sum(1 for trade in slice_trades if _number(trade.get("net_pnl")) > 0)
        losses = sum(1 for trade in slice_trades if _number(trade.get("net_pnl")) < 0)
        return_pct = (net_pnl / initial_equity) * 100.0 if initial_equity else 0.0
        profit_factor = _profit_factor(slice_trades)
        days = max(0.0, (slice_end - slice_start).total_seconds() / 86_400)
        projected_days = None
        if days > 0 and return_pct > 0:
            projected_days = round(days * (math.log(2) / math.log1p(return_pct / 100.0)), 1)
        slices.append(
            {
                "index": index + 1,
                "start": slice_start.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "end": slice_end.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "days": round(days, 4),
                "tradeCount": len(slice_trades),
                "wins": wins,
                "losses": losses,
                "winRatePct": round((wins / len(slice_trades)) * 100.0, 2) if slice_trades else 0.0,
                "netPnl": round(net_pnl, 2),
                "returnPct": round(return_pct, 4),
                "profitFactor": round(profit_factor, 2),
                "avgTradeReturnPct": round(sum(_number(trade.get("return_pct")) for trade in slice_trades) / len(slice_trades), 4) if slice_trades else 0.0,
                "projectedDaysToDouble": projected_days,
                "status": _slice_status(return_pct, len(slice_trades), profit_factor),
            }
        )

    active_slices = [item for item in slices if int(item["tradeCount"]) > 0]
    positive_slices = [item for item in active_slices if float(item["returnPct"]) > 0]
    negative_slices = [item for item in active_slices if float(item["returnPct"]) <= 0]
    total_net_profit = _number(summary.get("net_profit"))
    largest_positive_slice_pnl = max([float(item["netPnl"]) for item in slices if float(item["netPnl"]) > 0] or [0.0])
    concentration_pct = (largest_positive_slice_pnl / total_net_profit) * 100.0 if total_net_profit > 0 else 0.0
    return_values = [float(item["returnPct"]) for item in active_slices]
    blockers: list[str] = []
    if len(active_slices) < min(3, len(slices)):
        blockers.append("insufficient_active_slices")
    if negative_slices:
        blockers.append("negative_or_flat_slice")
    if concentration_pct > 55.0:
        blockers.append("return_concentration")
    if doubling.get("status") != "candidate":
        blockers.append("doubling_estimate_not_candidate")

    if not active_slices:
        status = "insufficient-sample"
    elif blockers:
        status = "fragile"
    else:
        status = "stable"

    return {
        "status": status,
        "strategyId": report_payload.get("strategy_id"),
        "artifactId": report_payload.get("artifact_id"),
        "reportPath": str(report_path) if report_path else None,
        "doublingEstimate": doubling,
        "sampleStart": sample_start_text,
        "sampleEnd": sample_end_text,
        "sampleDays": sample_days,
        "sliceCount": len(slices),
        "activeSliceCount": len(active_slices),
        "positiveSliceCount": len(positive_slices),
        "negativeSliceCount": len(negative_slices),
        "positiveSliceRatioPct": round((len(positive_slices) / len(active_slices)) * 100.0, 2) if active_slices else 0.0,
        "minSliceReturnPct": round(min(return_values), 4) if return_values else None,
        "medianSliceReturnPct": round(_median(return_values) or 0.0, 4) if return_values else None,
        "maxSliceReturnPct": round(max(return_values), 4) if return_values else None,
        "largestPositiveSlicePnlSharePct": round(concentration_pct, 2),
        "blockers": blockers,
        "slices": slices,
        "interpretation": (
            "Backtest return is distributed across active subwindows."
            if status == "stable"
            else "Backtest return needs paper evidence and more history before treating the doubling estimate as stable."
        ),
    }


def build_paper_baseline(
    report_payload: dict[str, Any],
    *,
    validation_payload: dict[str, Any] | None = None,
    paper_candidate: dict[str, Any] | None = None,
    report_path: Path | None = None,
) -> dict[str, Any]:
    summary = report_payload.get("summary") if isinstance(report_payload.get("summary"), dict) else {}
    robust = report_payload.get("robust_assessment") if isinstance(report_payload.get("robust_assessment"), dict) else {}
    candidate = paper_candidate if isinstance(paper_candidate, dict) else {}
    doubling = build_doubling_estimate(
        report_payload,
        report_path=report_path,
        validation_payload=validation_payload,
    )
    total_trades = int(_number(summary.get("total_trades")))
    strategy_id = str(report_payload.get("strategy_id") or "")
    return_pct = _number(summary.get("return_pct"))
    max_drawdown_pct = _number(summary.get("max_drawdown_pct"))
    fees_paid = _number(summary.get("fees_paid"))
    baseline_fee_per_trade = round(fees_paid / total_trades, 4) if total_trades > 0 else None
    baseline_return_per_trade_pct = round(return_pct / total_trades, 4) if total_trades > 0 else None

    return {
        "status": "collect-paper-evidence" if doubling.get("candidate") else "blocked",
        "strategyId": report_payload.get("strategy_id"),
        "artifactId": report_payload.get("artifact_id"),
        "matchedValidationStatus": doubling.get("validationStatus"),
        "candidateStatus": candidate.get("status"),
        "candidateSignal": candidate.get("signal"),
        "projection": {
            "use": "paper-drift-baseline-only",
            "projectedDaysToDouble": doubling.get("projectedDaysToDouble"),
            "projectedTradesToDouble": doubling.get("projectedTradesToDouble"),
            "geometricDailyReturnPct": doubling.get("geometricDailyReturnPct"),
            "sampleDays": doubling.get("sampleDays"),
            "sampleStart": doubling.get("sampleStart"),
            "sampleEnd": doubling.get("sampleEnd"),
        },
        "backtestBenchmark": {
            "returnPct": round(return_pct, 4),
            "baselineReturnPerTradePct": baseline_return_per_trade_pct,
            "profitFactor": summary.get("profit_factor"),
            "winRatePct": summary.get("win_rate_pct"),
            "maxDrawdownPct": summary.get("max_drawdown_pct"),
            "totalTrades": total_trades,
            "feeModel": doubling.get("feeModel"),
            "feesPaid": summary.get("fees_paid"),
            "baselineFeePerTrade": baseline_fee_per_trade,
            "robustStatus": doubling.get("robustStatus"),
            "robustMetrics": robust.get("metrics") if isinstance(robust.get("metrics"), dict) else {},
        },
        "paperTradeMatch": {
            "symbol": candidate.get("symbol") or "BTC",
            "setupTags": _paper_setup_tags(strategy_id),
        },
        "minimumPaperSample": {
            "calendarDays": 14,
            "closedTrades": max(30, total_trades * 3),
            "reviewCoveragePct": 90,
            "reason": "Short-window BTC edge must survive at least two weeks and a larger paper sample than the backtest.",
        },
        "driftChecks": [
            {
                "key": "paper_positive_after_fees",
                "operator": ">",
                "threshold": 0,
                "metric": "paper_net_return_pct",
            },
            {
                "key": "paper_profit_factor_floor",
                "operator": ">=",
                "threshold": 1.5,
                "metric": "paper_profit_factor",
            },
            {
                "key": "paper_avg_trade_retains_half_baseline",
                "operator": ">=",
                "threshold": round((baseline_return_per_trade_pct or 0.0) * 0.5, 4),
                "metric": "paper_avg_net_trade_return_pct",
            },
            {
                "key": "paper_drawdown_guard",
                "operator": "<=",
                "threshold": max(2.0, round(max_drawdown_pct * 3, 4)),
                "metric": "paper_max_drawdown_pct",
            },
            {
                "key": "paper_review_coverage",
                "operator": ">=",
                "threshold": 90,
                "metric": "review_coverage_pct",
            },
        ],
        "killSwitches": [
            "Stop paper promotion review if paper net return turns negative after the minimum sample.",
            "Stop paper promotion review if drawdown exceeds the paper_drawdown_guard threshold.",
            "Stop paper promotion review if two consecutive losses happen for the same failed-impulse side and regime.",
            "Stop paper promotion review if fee or slippage per trade materially exceeds the taker-fee backtest baseline.",
            "Stop paper promotion review if any paper trade lacks trigger, invalidation, exit reason, and human review notes.",
        ],
        "promotionBlockers": [
            "paper_minimum_sample",
            "paper_drift_checks",
            "paper_trade_reviews",
            "regime_review",
            "risk_review",
            "operator_sign_off",
        ],
    }


def _paper_setup_tags(strategy_id: str) -> list[str]:
    normalized = strategy_id.strip().lower()
    tags = [normalized, normalized.replace("_", "-")]
    if normalized == "btc_failed_impulse_reversal":
        tags.extend(["failed_impulse_reversal", "failed-impulse-reversal", "btc-failed-impulse-reversal"])
    return list(dict.fromkeys(tag for tag in tags if tag))


def _round_trip_fee_rate(fee_model: Any) -> float:
    if fee_model == "maker":
        return 0.00030
    if fee_model == "mixed":
        return 0.00060
    return 0.00090


def _paper_trade_fee(trade: dict[str, Any], baseline_fee_per_trade: float | None, fee_model: Any) -> float:
    size_usd = _number(trade.get("sizeUsd"))
    if size_usd > 0:
        return size_usd * _round_trip_fee_rate(fee_model)
    return baseline_fee_per_trade or 0.0


def _paper_trade_time(trade: dict[str, Any]) -> int:
    closed = _number(trade.get("closedAt"), 0.0)
    created = _number(trade.get("createdAt"), 0.0)
    return int(closed or created)


def _compare_metric(value: float | None, operator: str | None, threshold: float) -> bool:
    if value is None:
        return False
    if operator == ">":
        return value > threshold
    if operator == ">=":
        return value >= threshold
    if operator == "<":
        return value < threshold
    if operator == "<=":
        return value <= threshold
    if operator == "==":
        return value == threshold
    return False


def build_paper_readiness(
    *,
    baseline: dict[str, Any],
    trades: list[dict[str, Any]],
) -> dict[str, Any]:
    minimum = baseline.get("minimumPaperSample") if isinstance(baseline.get("minimumPaperSample"), dict) else {}
    benchmark = baseline.get("backtestBenchmark") if isinstance(baseline.get("backtestBenchmark"), dict) else {}
    drift_checks = baseline.get("driftChecks") if isinstance(baseline.get("driftChecks"), list) else []
    baseline_fee_per_trade = _number(benchmark.get("baselineFeePerTrade"), 0.0) or None
    fee_model = benchmark.get("feeModel")

    matching_trades = list(trades)
    closed_trades = [trade for trade in matching_trades if trade.get("status") == "closed"]
    open_trades = [trade for trade in matching_trades if trade.get("status") == "open"]
    closed_trades.sort(key=_paper_trade_time)

    enriched: list[dict[str, Any]] = []
    gross_profit = 0.0
    gross_loss = 0.0
    total_net_pnl = 0.0
    total_notional = 0.0
    reviewed = 0
    cumulative = 0.0
    peak = 0.0
    max_drawdown_usd = 0.0
    win_count = 0
    trade_return_pct_total = 0.0
    for trade in closed_trades:
        size_usd = _number(trade.get("sizeUsd"))
        realized = _number(trade.get("realizedPnlUsd"))
        estimated_fees = _paper_trade_fee(trade, baseline_fee_per_trade, fee_model)
        net_pnl = realized - estimated_fees
        total_net_pnl += net_pnl
        total_notional += size_usd
        net_return_pct = (net_pnl / size_usd) * 100.0 if size_usd > 0 else 0.0
        trade_return_pct_total += net_return_pct
        if net_pnl > 0:
            gross_profit += net_pnl
            win_count += 1
        elif net_pnl < 0:
            gross_loss += abs(net_pnl)
        if trade.get("review"):
            reviewed += 1
        cumulative += net_pnl
        peak = max(peak, cumulative)
        max_drawdown_usd = max(max_drawdown_usd, peak - cumulative)
        enriched.append(
            {
                "id": trade.get("id"),
                "createdAt": trade.get("createdAt"),
                "closedAt": trade.get("closedAt"),
                "sizeUsd": size_usd,
                "realizedPnlUsd": realized,
                "estimatedFeesUsd": round(estimated_fees, 4),
                "netPnlAfterFeesUsd": round(net_pnl, 4),
                "netReturnPct": round(net_return_pct, 4) if size_usd > 0 else None,
                "reviewed": bool(trade.get("review")),
            }
        )

    closed_count = len(closed_trades)
    calendar_days = 0.0
    if closed_count >= 2:
        start = _paper_trade_time(closed_trades[0])
        end = _paper_trade_time(closed_trades[-1])
        if end > start:
            calendar_days = round((end - start) / 86_400_000, 4)

    paper_net_return_pct = round((total_net_pnl / total_notional) * 100.0, 4) if total_notional > 0 else 0.0
    paper_avg_return_pct = round(trade_return_pct_total / closed_count, 4) if closed_count > 0 else 0.0
    paper_profit_factor = 0.0
    if gross_loss > 0:
        paper_profit_factor = round(gross_profit / gross_loss, 4)
    elif gross_profit > 0:
        paper_profit_factor = 999999.0
    paper_drawdown_pct = round((max_drawdown_usd / total_notional) * 100.0, 4) if total_notional > 0 else 0.0
    review_coverage_pct = round((reviewed / closed_count) * 100.0, 2) if closed_count else 0.0

    metric_values = {
        "paper_net_return_pct": paper_net_return_pct,
        "paper_profit_factor": paper_profit_factor,
        "paper_avg_net_trade_return_pct": paper_avg_return_pct,
        "paper_max_drawdown_pct": paper_drawdown_pct,
        "review_coverage_pct": review_coverage_pct,
    }

    evaluated_checks: list[dict[str, Any]] = []
    for check in drift_checks:
        if not isinstance(check, dict):
            continue
        metric_name = str(check.get("metric") or "")
        threshold = _number(check.get("threshold"))
        value = metric_values.get(metric_name)
        passed = _compare_metric(value, str(check.get("operator") or ""), threshold)
        evaluated_checks.append(
            {
                "key": check.get("key"),
                "metric": metric_name,
                "operator": check.get("operator"),
                "threshold": threshold,
                "value": value,
                "passed": passed,
            }
        )

    required_days = _number(minimum.get("calendarDays"))
    required_trades = int(_number(minimum.get("closedTrades")))
    required_review = _number(minimum.get("reviewCoveragePct"))
    sample_checks = {
        "calendar_days": calendar_days >= required_days if required_days > 0 else True,
        "closed_trades": closed_count >= required_trades if required_trades > 0 else True,
        "review_coverage": review_coverage_pct >= required_review if required_review > 0 else True,
    }

    blockers = [key for key, passed in sample_checks.items() if not passed]
    blockers.extend(str(check.get("key")) for check in evaluated_checks if not check.get("passed"))
    blockers.extend(str(item) for item in baseline.get("promotionBlockers", []) if item in {"regime_review", "risk_review", "operator_sign_off"})
    blockers = list(dict.fromkeys(blocker for blocker in blockers if blocker))

    if closed_count == 0:
        status = "collecting-paper-trades"
        next_action = "Wait for matching paper trades, then close and review every trade."
    elif blockers:
        status = "paper-blocked"
        next_action = "Keep collecting reviewed paper trades and resolve failed sample or drift checks."
    else:
        status = "paper-ready-for-human-review"
        next_action = "Run regime, risk, and operator review before any production gate."

    return {
        "status": status,
        "nextAction": next_action,
        "baselineStatus": baseline.get("status"),
        "sampleProgress": {
            "calendarDays": calendar_days,
            "requiredCalendarDays": required_days,
            "closedTrades": closed_count,
            "requiredClosedTrades": required_trades,
            "openTrades": len(open_trades),
            "reviewedTrades": reviewed,
            "reviewCoveragePct": review_coverage_pct,
            "requiredReviewCoveragePct": required_review,
            "checks": sample_checks,
        },
        "paperMetrics": {
            "grossProfitUsd": round(gross_profit, 4),
            "grossLossUsd": round(gross_loss, 4),
            "netPnlAfterFeesUsd": round(total_net_pnl, 4),
            "estimatedFeesUsd": round(sum(item["estimatedFeesUsd"] for item in enriched), 4),
            "totalNotionalUsd": round(total_notional, 4),
            "paperNetReturnPct": paper_net_return_pct,
            "paperProfitFactor": paper_profit_factor,
            "paperAvgNetTradeReturnPct": paper_avg_return_pct,
            "paperMaxDrawdownPct": paper_drawdown_pct,
            "winsAfterFees": win_count,
            "lossesAfterFees": closed_count - win_count,
        },
        "driftChecks": evaluated_checks,
        "blockers": blockers,
        "matchingTradeIds": [trade.get("id") for trade in matching_trades],
        "closedTradeSamples": enriched[:20],
    }
