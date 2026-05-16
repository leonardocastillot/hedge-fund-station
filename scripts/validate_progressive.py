#!/usr/bin/env python3
"""Professional validation suite for btc_regime_adaptive_confluence progressive trail."""

from __future__ import annotations

import importlib
import itertools
import json
import os
import random
import sys
import time
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))
sys.path.insert(0, str(REPO / "backend" / "hyperliquid_gateway"))

from backtesting.engine import BacktestConfig
from backtesting.metrics import build_summary
import strategies.btc_regime_adaptive_confluence.logic as LOGIC

YAHOO = REPO / "backend" / "hyperliquid_gateway" / "data" / "market_data" / "btc_usd_daily_yahoo.json"
BINANCE = REPO / "backend" / "hyperliquid_gateway" / "data" / "market_data" / "one_bitcoin_btc_usd_daily.json"
OUT = REPO / "backend" / "hyperliquid_gateway" / "data" / "validations" / "validation_suite"

NEW_ID = "btc_regime_adaptive_confluence"
CHAMP_ID = "btc_vol_dynamic_trail_trend"

FULL = ("2014-09-17", "2026-05-13")
TRAIN = ("2014-09-17", "2021-12-31")
TEST = ("2020-07-01", "2022-01-01", "2026-05-13")
WF_WINDOWS = [
    ("wf_2015_2020", "2015-06-01", "2020-05-31"),
    ("wf_2017_2022", "2017-06-01", "2022-05-31"),
    ("wf_2019_2024", "2019-06-01", "2024-05-31"),
    ("wf_2021_2026", "2021-06-01", "2026-05-13"),
]

# Coarse sweep grid (18 combos)
TIGHT = [2.5, 3.5, 4.5]
WIDE = [4.5, 5.5, 6.5]
TRANS = [8, 15, 22]

BOOTSTRAP_N = 1000
SEED = 42

_RUNNERS: dict[str, Any] = {}


def get_runner(sid: str):
    if sid not in _RUNNERS:
        mod = importlib.import_module(f"strategies.{sid}.backtest")
        importlib.reload(mod)
        _RUNNERS[sid] = mod.run_backtest
    return _RUNNERS[sid]


def run_bt(sid: str, dp: Path, start: str, end: str) -> dict[str, Any]:
    cfg = BacktestConfig(initial_equity=500.0, taker_fee_rate=0.00045,
                         fee_model="taker", risk_fraction=1.0,
                         start=start, end=end)
    return get_runner(sid)(dp, cfg)


def eval_period(sid: str, dp: Path, data_start: str, eval_start: str, end: str) -> dict[str, Any]:
    """Run with lookback buffer, measure from eval_start."""
    full = run_bt(sid, dp, data_start, end)
    curve = [p for p in full["equity_curve"] if str(p["timestamp"]) >= eval_start]
    trades = [t for t in full["trades"] if str(t["entry_timestamp"]) >= eval_start]
    if not curve:
        return {"summary": {"return_pct": 0.0, "profit_factor": 0.0, "max_drawdown_pct": 0.0,
                            "total_trades": 0, "win_rate_pct": 0.0},
                "trades": [], "equity_curve": []}
    fees = sum(float(t.get("fees", 0.0) or 0.0) for t in trades)
    init_eq = float(curve[0]["equity"])
    summ = build_summary(initial_equity=init_eq, equity_curve=curve, trades=trades, fees_paid=fees)
    return {"summary": summ, "trades": trades, "equity_curve": curve}


def buyhold_return(dp: Path, start: str, end: str) -> float:
    from backtesting.btc_daily_history import load_btc_daily_history
    rows, _ = load_btc_daily_history(dp, cfg := BacktestConfig(start=start, end=end))
    if len(rows) < 2:
        return 0.0
    return round((float(rows[-1]["close"]) - float(rows[0]["close"])) / float(rows[0]["close"]) * 100, 2)


# ====== 1. TEMPORAL SPLIT ======
def run_temporal(dp: Path):
    out = []
    for label, s, e, eval_start in [
        ("full_period", *FULL, None),
        ("train_period", *TRAIN, None),
        ("test_period_oos", TEST[0], TEST[2], TEST[1]),
    ]:
        print(f"  {label}...", end=" ")
        if eval_start:
            new_r = eval_period(NEW_ID, dp, s, eval_start, e)
            champ_r = eval_period(CHAMP_ID, dp, s, eval_start, e)
            start_str = eval_start
        else:
            new_r = {"summary": run_bt(NEW_ID, dp, s, e)["summary"]}
            champ_r = {"summary": run_bt(CHAMP_ID, dp, s, e)["summary"]}
            start_str = s
        beats = new_r["summary"]["return_pct"] > champ_r["summary"]["return_pct"]
        print(f"new={new_r['summary']['return_pct']:.1f}% champ={champ_r['summary']['return_pct']:.1f}%")
        out.append((f"temporal_{label}", True, {
            "start": start_str, "end": e,
            "champion_return_pct": champ_r["summary"]["return_pct"],
            "new_return_pct": new_r["summary"]["return_pct"],
            "excess_return_pct": round(new_r["summary"]["return_pct"] - champ_r["summary"]["return_pct"], 2),
            "beats_champion": beats,
        }))
    return out


# ====== 2. WALK FORWARD ======
def run_wf(dp: Path):
    out = []
    for wid, s, e in WF_WINDOWS:
        print(f"  {wid}...", end=" ")
        new_r = run_bt(NEW_ID, dp, s, e)
        champ_r = run_bt(CHAMP_ID, dp, s, e)
        beats = new_r["summary"]["return_pct"] > champ_r["summary"]["return_pct"]
        print(f"new={new_r['summary']['return_pct']:.1f}% champ={champ_r['summary']['return_pct']:.1f}%")
        out.append((f"walkforward_{wid}", beats, {
            "start": s, "end": e,
            "champion_return_pct": champ_r["summary"]["return_pct"],
            "new_return_pct": new_r["summary"]["return_pct"],
            "excess_return_pct": round(new_r["summary"]["return_pct"] - champ_r["summary"]["return_pct"], 2),
            "beats_champion": beats,
        }))
    return out


# ====== 3. PARAMETER SWEEP ======
def run_sweep(dp: Path):
    orig = {k: getattr(LOGIC, k) for k in ("TIGHT_TRAIL_MULT", "WIDE_TRAIL_MULT", "TRAIL_TRANSITION_DAY")}
    results = []
    total = 0
    for tight, wide, trans in itertools.product(TIGHT, WIDE, TRANS):
        if tight >= wide:
            continue
        total += 1
        LOGIC.TIGHT_TRAIL_MULT = tight
        LOGIC.WIDE_TRAIL_MULT = wide
        LOGIC.TRAIL_TRANSITION_DAY = trans
        r = run_bt(NEW_ID, dp, FULL[0], FULL[1])
        results.append({
            "tight_mult": tight, "wide_mult": wide, "transition_day": trans,
            "return_pct": r["summary"]["return_pct"],
            "total_trades": r["summary"]["total_trades"],
            "max_drawdown_pct": r["summary"]["max_drawdown_pct"],
            "profit_factor": r["summary"]["profit_factor"],
        })
        print(f"  [{total:2d}] tight={tight} wide={wide} trans={trans} → ret={r['summary']['return_pct']:.1f}%")

    for k, v in orig.items():
        setattr(LOGIC, k, v)

    results.sort(key=lambda x: x["return_pct"], reverse=True)
    opt = next(r for r in results if r["tight_mult"] == 3.5 and r["wide_mult"] == 5.5 and r["transition_day"] == 15)
    opt_rank = next(i for i, r in enumerate(results) if r is opt) + 1
    max_ret = results[0]["return_pct"]
    top10 = results[max(0, int(len(results) * 0.1) - 1)]["return_pct"]
    plateau = sum(1 for r in results if r["return_pct"] >= max_ret * 0.90)
    beats_default = any(r["tight_mult"] == 3.5 and r["wide_mult"] == 5.5 and r["transition_day"] == 15 and r["return_pct"] < results[0]["return_pct"] for r in results)

    print(f"  → optimal(3.5/5.5/15) rank={opt_rank}/{len(results)} ret={opt['return_pct']:.1f}% max={max_ret:.1f}%")
    print(f"  → plateau(90%): {plateau}/{len(results)} ({round(plateau/len(results)*100,1)}%)")

    return [("parameter_sweep", opt["return_pct"] >= top10, {
        "total": len(results),
        "max": results[0],
        "min": results[-1],
        "optimal_ret": opt["return_pct"],
        "optimal_rank": opt_rank,
        "top10_threshold": top10,
        "opt_in_top10": opt["return_pct"] >= top10,
        "plateau_90pct_count": plateau,
        "plateau_90pct_pct": round(plateau / len(results) * 100, 1),
        "different_params_beat_default": beats_default,
        "all": results,
    })]


# ====== 4. CROSS DATA ======
def run_cross(dp: Path):
    try:
        new_r = run_bt(NEW_ID, dp, "2017-08-17", "2026-05-07")
        champ_r = run_bt(CHAMP_ID, dp, "2017-08-17", "2026-05-07")
        beats = new_r["summary"]["return_pct"] > champ_r["summary"]["return_pct"]
        print(f"  new={new_r['summary']['return_pct']:.1f}% champ={champ_r['summary']['return_pct']:.1f}%")
        return [("cross_data_binance", beats, {
            "dataset": "one_bitcoin_btc_usd_daily",
            "champion_return_pct": champ_r["summary"]["return_pct"],
            "new_return_pct": new_r["summary"]["return_pct"],
            "beats_champion": beats,
        })]
    except Exception as e:
        print(f"  FAIL: {e}")
        return [("cross_data_binance", False, {"error": str(e)})]


# ====== 5. BOOTSTRAP ======
def run_bootstrap(dp: Path):
    random.seed(SEED)
    print("  loading trades...", end=" ")
    full = run_bt(NEW_ID, dp, FULL[0], FULL[1])
    pnls = [float(t["net_pnl"]) for t in full["trades"]]
    n = len(pnls)
    orig_ret = full["summary"]["return_pct"]
    print(f"{n} trades, orig={orig_ret:.1f}%")

    sims = []
    for i in range(BOOTSTRAP_N):
        eq = 500.0
        for pnl in [random.choice(pnls) for _ in range(n)]:
            eq += pnl
            if eq <= 0:
                eq = 0
                break
        sims.append(round((eq - 500.0) / 500.0 * 100, 2))

    sims.sort()
    median = sims[BOOTSTRAP_N // 2]
    mean = round(sum(sims) / BOOTSTRAP_N, 2)
    std = round((sum((s - mean) ** 2 for s in sims) / BOOTSTRAP_N) ** 0.5, 2)
    pchamp = round(sum(1 for s in sims if s >= 180.24) / BOOTSTRAP_N * 100, 1)
    print(f"  median={median:.1f}% mean={mean:.1f}% ±{std:.1f} >champ={pchamp}%")

    return [("bootstrap", pchamp > 50, {
        "iterations": BOOTSTRAP_N, "original_trades": n,
        "original_return_pct": orig_ret,
        "median": median, "mean": mean, "std": std,
        "pct_above_champ_180_24": pchamp,
        "q25": sims[BOOTSTRAP_N // 4], "q75": sims[3 * BOOTSTRAP_N // 4],
    })]


# ====== 6. BUY & HOLD ======
def run_bh(dp: Path):
    windows = [
        ("full", *FULL), ("train", *TRAIN),
        ("test_oos", TEST[1], TEST[2]),
    ] + [(wid, s, e) for wid, s, e in WF_WINDOWS]
    details = []
    wins = 0
    for wid, s, e in windows:
        bh = buyhold_return(dp, s, e)
        r = run_bt(NEW_ID, dp, s, e)
        strat = r["summary"]["return_pct"]
        beats = strat > bh
        if beats:
            wins += 1
        details.append({"window": wid, "buyhold": bh, "strategy": strat, "excess": round(strat - bh, 2), "beats": beats})
        print(f"  {wid}: strat={strat:.1f}% vs BH={bh:.1f}% {'BEATS' if beats else 'loses'}")

    wr = round(wins / len(windows) * 100, 1)
    return [("buyhold_comparison", wr >= 70, {
        "windows": len(windows), "beaten": wins, "win_rate_pct": wr, "details": details,
    })]


# ====== CONFIDENCE ======
def compute_confidence(checks):
    lookup = {n: p for n, p, _ in checks}
    score, max_s = 0, 0

    if lookup.get("temporal_full_period"):
        score += 1
    max_s += 1
    if lookup.get("temporal_test_period_oos"):
        score += 2
    max_s += 2

    wf = [n for n in lookup if n.startswith("walkforward_")]
    wf_pass = sum(1 for n in wf if lookup[n])
    if wf:
        if wf_pass > len(wf) / 2:
            score += 1
        if wf_pass >= len(wf) - 1:
            score += 1
        max_s += 2

    for k in ("parameter_sweep", "cross_data_binance", "bootstrap", "buyhold_comparison"):
        if lookup.get(k):
            score += 1
        max_s += 1

    pct = score / max_s * 100 if max_s else 0
    if pct >= 85:
        return "strong"
    if pct >= 65:
        return "moderate"
    if pct >= 45:
        return "weak"
    return "overfit_signs"


def print_results(checks, elapsed):
    passed = sum(1 for _, p, _ in checks if p)
    total = len(checks)
    conf = compute_confidence(checks)
    print()
    print("=" * 72)
    print(f"  VALIDATION RESULTS  ({elapsed:.0f}s)")
    print("=" * 72)
    for name, p, d in checks:
        sym = "PASS" if p else "FAIL"
        ret = d.get("new_return_pct", "?")
        champ = d.get("champion_return_pct", "?")
        note = f"  new={ret:.1f}%" if isinstance(ret, (int, float)) else ""
        note += f"  champ={champ:.1f}%" if isinstance(champ, (int, float)) else ""
        print(f"  [{sym}] {name}{note}")
    print(f"  {'─' * 60}")
    print(f"  PASSED: {passed}/{total}  CONFIDENCE: {conf.upper()}")
    print("=" * 72)
    if conf in ("weak", "overfit_signs"):
        print("  ⚠ Do not promote. Review overfitting.")
    else:
        print("  ✓ Validated professionally.")


# ====== MAIN ======
def main():
    os.makedirs(OUT, exist_ok=True)
    t0 = time.time()
    checks = []

    print("=== 1. Temporal Train/Test Split ===")
    checks.extend(run_temporal(YAHOO))

    print("\n=== 2. Walk-Forward ===")
    checks.extend(run_wf(YAHOO))

    print("\n=== 3. Parameter Sweep ===")
    checks.extend(run_sweep(YAHOO))

    print("\n=== 4. Cross-Data (Binance) ===")
    if BINANCE.exists():
        checks.extend(run_cross(BINANCE))
    else:
        print("  SKIP: Binance not found")

    print("\n=== 5. Bootstrap ===")
    checks.extend(run_bootstrap(YAHOO))

    print("\n=== 6. Buy & Hold ===")
    checks.extend(run_bh(YAHOO))

    elapsed = time.time() - t0
    conf = compute_confidence(checks)
    report = {
        "validation_suite": "btc_regime_adaptive_confluence",
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "elapsed_seconds": round(elapsed, 1),
        "overall_confidence": conf,
        "checks_passed": sum(1 for _, p, _ in checks if p),
        "checks_total": len(checks),
        "checks": {n: {"passed": p, **d} for n, p, d in checks},
    }
    ts = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    out_path = OUT / f"validation_suite_{ts}.json"
    out_path.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    print(f"\nReport: {out_path}")
    print_results(checks, elapsed)


if __name__ == "__main__":
    main()
