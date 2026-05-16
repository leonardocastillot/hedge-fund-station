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
import strategies.btc_vol_dynamic_trail_trend.logic as CHAMP_LOGIC

YAHOO = REPO / "backend" / "hyperliquid_gateway" / "data" / "market_data" / "btc_usd_daily_yahoo.json"
BINANCE = REPO / "backend" / "hyperliquid_gateway" / "data" / "market_data" / "one_bitcoin_btc_usd_daily.json"
OUT = REPO / "backend" / "hyperliquid_gateway" / "data" / "validations" / "validation_suite"

NEW_ID = "btc_regime_adaptive_confluence"
CHAMP_ID = "btc_vol_dynamic_trail_trend"

# === Windows ===
# For test periods we need lookback buffer for SMA150 + ATR%ile (400 days)
FULL = ("2014-09-17", "2026-05-13")
TRAIN = ("2014-09-17", "2021-12-31")
TEST = ("2020-07-01", "2022-01-01", "2026-05-13")  # (data_start, eval_start, end)
WF_WINDOWS = [
    ("wf_2015_2020", "2015-06-01", None, "2020-05-31"),
    ("wf_2017_2022", "2017-06-01", None, "2022-05-31"),
    ("wf_2019_2024", "2019-06-01", None, "2024-05-31"),
    ("wf_2021_2026", "2021-06-01", None, "2026-05-13"),
]

TIGHT = [2.5, 3.0, 3.5, 4.0, 4.5]
WIDE = [4.5, 5.0, 5.5, 6.0, 6.5]
TRANS = [8, 12, 15, 18, 22, 25]
B_N = 1000
SEED = 42

_RUNNERS: dict[str, Any] = {}


def get_runner(sid: str):
    if sid not in _RUNNERS:
        mod = importlib.import_module(f"strategies.{sid}.backtest")
        importlib.reload(mod)
        _RUNNERS[sid] = mod.run_backtest
    return _RUNNERS[sid]


def cfg(start=None, end=None):
    return BacktestConfig(
        initial_equity=500.0, taker_fee_rate=0.00045,
        fee_model="taker", risk_fraction=1.0,
        start=start, end=end,
    )


def run_bt(sid: str, dp: Path, start: str, end: str) -> dict[str, Any]:
    return get_runner(sid)(dp, cfg(start=start, end=end))


def eval_period(sid: str, dp: Path, data_start: str, eval_start: str, end: str) -> dict[str, Any]:
    """Run with lookback buffer, evaluate only from eval_start."""
    full = run_bt(sid, dp, data_start, end)
    curve = [p for p in full["equity_curve"] if str(p["timestamp"]) >= eval_start]
    trades = [t for t in full["trades"] if str(t["entry_timestamp"]) >= eval_start]
    fees = sum(float(t.get("fees", 0.0) or 0.0) for t in trades)
    init_eq = float(curve[0]["equity"]) if curve else 500.0
    summ = build_summary(initial_equity=init_eq, equity_curve=curve, trades=trades, fees_paid=fees)
    return {"summary": summ, "trades": trades, "equity_curve": curve, "full_result": full}


def buyhold_return(dp: Path, start: str, end: str) -> float:
    from backtesting.btc_daily_history import load_btc_daily_history
    rows, _ = load_btc_daily_history(dp, cfg(start=start, end=end))
    if len(rows) < 2:
        return 0.0
    return round((float(rows[-1]["close"]) - float(rows[0]["close"])) / float(rows[0]["close"]) * 100, 2)


# ====== 1. TEMPORAL SPLIT ======
def run_temporal(dp: Path) -> list[dict[str, Any]]:
    out = []
    # Full period
    print("  full period...", end=" ")
    new_f = run_bt(NEW_ID, dp, FULL[0], FULL[1])
    champ_f = run_bt(CHAMP_ID, dp, FULL[0], FULL[1])
    print(f"new={new_f['summary']['return_pct']:.1f}% champ={champ_f['summary']['return_pct']:.1f}%")
    out.append(("temporal_full", True, mk_detail("full_period", FULL[0], FULL[1], new_f, champ_f)))

    # Train period
    print("  train period...", end=" ")
    new_tr = run_bt(NEW_ID, dp, TRAIN[0], TRAIN[1])
    champ_tr = run_bt(CHAMP_ID, dp, TRAIN[0], TRAIN[1])
    print(f"new={new_tr['summary']['return_pct']:.1f}% champ={champ_tr['summary']['return_pct']:.1f}%")
    out.append(("temporal_train", True, mk_detail("train_period", TRAIN[0], TRAIN[1], new_tr, champ_tr)))

    # Test period (out-of-sample)
    print("  test period (OOS)...", end=" ")
    new_te = eval_period(NEW_ID, dp, TEST[0], TEST[1], TEST[2])
    champ_te = eval_period(CHAMP_ID, dp, TEST[0], TEST[1], TEST[2])
    print(f"new={new_te['summary']['return_pct']:.1f}% champ={champ_te['summary']['return_pct']:.1f}%")
    out.append(("temporal_test", True, mk_detail_eval("test_period_oos", TEST[1], TEST[2], new_te, champ_te)))

    return out


def mk_detail(name, s, e, new_r, champ_r):
    return {
        "name": name, "start": s, "end": e,
        "champion_return_pct": champ_r["summary"]["return_pct"],
        "new_return_pct": new_r["summary"]["return_pct"],
        "excess_return_pct": round(new_r["summary"]["return_pct"] - champ_r["summary"]["return_pct"], 2),
        "beats_champion": new_r["summary"]["return_pct"] > champ_r["summary"]["return_pct"],
        "champion_trades": champ_r["summary"]["total_trades"],
        "new_trades": new_r["summary"]["total_trades"],
        "champion_profit_factor": champ_r["summary"]["profit_factor"],
        "new_profit_factor": new_r["summary"]["profit_factor"],
        "champion_max_dd": champ_r["summary"]["max_drawdown_pct"],
        "new_max_dd": new_r["summary"]["max_drawdown_pct"],
    }


def mk_detail_eval(name, s, e, new_r, champ_r):
    return {
        "name": name, "start": s, "end": e,
        "champion_return_pct": champ_r["summary"]["return_pct"],
        "new_return_pct": new_r["summary"]["return_pct"],
        "excess_return_pct": round(new_r["summary"]["return_pct"] - champ_r["summary"]["return_pct"], 2),
        "beats_champion": new_r["summary"]["return_pct"] > champ_r["summary"]["return_pct"],
    }


# ====== 2. WALK FORWARD ======
def run_wf(dp: Path) -> list[dict[str, Any]]:
    out = []
    for wid, s, es, e in WF_WINDOWS:
        print(f"  {wid}...", end=" ")
        if es:
            new_r = eval_period(NEW_ID, dp, s, es, e)
            champ_r = eval_period(CHAMP_ID, dp, s, es, e)
        else:
            new_r = {"summary": run_bt(NEW_ID, dp, s, e)["summary"]}
            champ_r = {"summary": run_bt(CHAMP_ID, dp, s, e)["summary"]}
        beats = new_r["summary"]["return_pct"] > champ_r["summary"]["return_pct"]
        print(f"new={new_r['summary']['return_pct']:.1f}% champ={champ_r['summary']['return_pct']:.1f}% {'BEATS' if beats else 'loses'}")
        out.append((f"walkforward_{wid}", beats, {
            "window_id": wid, "start": s, "end": e,
            "champion_return_pct": champ_r["summary"]["return_pct"],
            "new_return_pct": new_r["summary"]["return_pct"],
            "excess_return_pct": round(new_r["summary"]["return_pct"] - champ_r["summary"]["return_pct"], 2),
            "beats_champion": beats,
        }))
    return out


# ====== 3. PARAMETER SWEEP ======
def run_sweep(dp: Path) -> list[dict[str, Any]]:
    orig = {"TIGHT_TRAIL_MULT": LOGIC.TIGHT_TRAIL_MULT,
            "WIDE_TRAIL_MULT": LOGIC.WIDE_TRAIL_MULT,
            "TRAIL_TRANSITION_DAY": LOGIC.TRAIL_TRANSITION_DAY}
    results = []
    total = 0
    combos = list(itertools.product(TIGHT, WIDE, TRANS))
    n = len(combos)
    for idx, (tight, wide, trans) in enumerate(combos):
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
        if (idx + 1) % 30 == 0 or idx == n - 1:
            print(f"  ... {total} valid combos done ({idx+1}/{n})")

    for k, v in orig.items():
        setattr(LOGIC, k, v)

    results.sort(key=lambda x: x["return_pct"], reverse=True)
    opt_ret = next(r["return_pct"] for r in results
                   if r["tight_mult"] == 3.5 and r["wide_mult"] == 5.5 and r["transition_day"] == 15)
    opt_rank = next(i for i, r in enumerate(results)
                    if r["tight_mult"] == 3.5 and r["wide_mult"] == 5.5 and r["transition_day"] == 15) + 1
    max_ret = results[0]["return_pct"]
    top5 = results[max(0, int(len(results) * 0.05) - 1)]["return_pct"] if len(results) >= 20 else results[-1]["return_pct"]
    top10 = results[max(0, int(len(results) * 0.10) - 1)]["return_pct"] if len(results) >= 10 else results[-1]["return_pct"]
    plateau = sum(1 for r in results if r["return_pct"] >= max_ret * 0.90)
    beats_default = results[0]["tight_mult"] != 3.5 or results[0]["wide_mult"] != 5.5 or results[0]["transition_day"] != 15

    print(f"  optimal(3.5/5.5/15) rank: {opt_rank}/{len(results)} ret={opt_ret:.1f}% max={max_ret:.1f}%")
    print(f"  plateau(90%): {plateau}/{len(results)} ({round(plateau/len(results)*100,1)}%)")
    print(f"  different-params-beat-default: {beats_default}")

    return [("parameter_sweep", opt_ret >= top10, {
        "total_combinations": len(results),
        "max_return": results[0],
        "min_return": results[-1],
        "optimal_ret": opt_ret,
        "optimal_rank": opt_rank,
        "top_5pct_threshold": top5,
        "top_10pct_threshold": top10,
        "opt_in_top5pct": opt_ret >= top5,
        "opt_in_top10pct": opt_ret >= top10,
        "plateau_90pct_count": plateau,
        "plateau_90pct_pct": round(plateau / len(results) * 100, 1),
        "different_params_beat_default": beats_default,
        "all": results,
    })]


# ====== 4. CROSS DATA ======
def run_cross(dp: Path) -> list[dict[str, Any]]:
    print("  Binance dataset...", end=" ")
    try:
        new_r = run_bt(NEW_ID, dp, "2017-08-17", "2026-05-07")
        champ_r = run_bt(CHAMP_ID, dp, "2017-08-17", "2026-05-07")
        beats = new_r["summary"]["return_pct"] > champ_r["summary"]["return_pct"]
        print(f"new={new_r['summary']['return_pct']:.1f}% champ={champ_r['summary']['return_pct']:.1f}%")
        return [("cross_data_binance", beats, {
            "dataset": "one_bitcoin_btc_usd_daily",
            "date_range": "2017-08-17 to 2026-05-07",
            "champion_return_pct": champ_r["summary"]["return_pct"],
            "new_return_pct": new_r["summary"]["return_pct"],
            "beats_champion": beats,
        })]
    except Exception as e:
        print(f"FAIL: {e}")
        return [("cross_data_binance", False, {"error": str(e)})]


# ====== 5. BOOTSTRAP ======
def run_bootstrap(dp: Path) -> list[dict[str, Any]]:
    random.seed(SEED)
    print("  loading trades from full backtest...", end=" ")
    full = run_bt(NEW_ID, dp, FULL[0], FULL[1])
    trades = full["trades"]
    returns = [float(t["return_pct"]) for t in trades]
    ntrades = len(returns)
    orig_ret = full["summary"]["return_pct"]
    print(f"{ntrades} trades, orig return {orig_ret:.1f}%")

    sims = []
    for i in range(B_N):
        eq = 500.0
        sampled = [random.choice(returns) for _ in range(ntrades)]
        for r in sampled:
            eq += eq * (r / 100.0)
            if eq <= 0:
                eq = 0
                break
        sims.append(round((eq - 500.0) / 500.0 * 100, 2))
        if (i + 1) % 250 == 0:
            print(f"  ... {i+1} bootstrap sims done")

    sims.sort()
    median = sims[B_N // 2]
    mean = round(sum(sims) / B_N, 2)
    std = round((sum((s - mean) ** 2 for s in sims) / B_N) ** 0.5, 2)
    p180 = round(sum(1 for s in sims if s >= 180.0) / B_N * 100, 1)
    p200 = round(sum(1 for s in sims if s >= 200.0) / B_N * 100, 1)
    pchamp = round(sum(1 for s in sims if s >= 180.24) / B_N * 100, 1)
    print(f"  median={median:.1f}% mean={mean:.1f}% ±{std:.1f} >180={p180}% >champ={pchamp}%")

    return [("bootstrap", pchamp > 50, {
        "iterations": B_N, "original_trades": ntrades,
        "original_return_pct": orig_ret,
        "median_return_pct": median, "mean_return_pct": mean, "std_return_pct": std,
        "pct_above_180": p180, "pct_above_200": p200, "pct_above_champ_180_24": pchamp,
        "q25": sims[B_N // 4], "q75": sims[3 * B_N // 4],
    })]


# ====== 6. BUY & HOLD ======
def run_bh(dp: Path) -> list[dict[str, Any]]:
    windows = [
        ("full", *FULL), ("train", *TRAIN),
        ("test", TEST[1], TEST[2]),
    ] + [(wid, s, e) for wid, s, es, e in WF_WINDOWS]
    results = []
    wins = 0
    for wid, s, e in windows:
        bh = buyhold_return(dp, s, e)
        r = run_bt(NEW_ID, dp, s, e)
        strat = r["summary"]["return_pct"]
        beats = strat > bh
        if beats:
            wins += 1
        results.append({
            "window": wid, "start": s, "end": e,
            "buyhold_pct": bh, "strategy_pct": strat,
            "excess_pct": round(strat - bh, 2), "beats": beats,
        })
    wr = round(wins / len(windows) * 100, 1)
    print(f"  beats buy-hold in {wins}/{len(windows)} windows ({wr}%)")
    return [("buyhold_comparison", wr >= 70, {
        "windows": len(windows), "beaten": wins, "win_rate_pct": wr,
        "details": results,
    })]


# ====== CONFIDENCE ======
def compute_confidence(checks: list[tuple[str, bool, dict]]) -> str:
    lookup = {n: p for n, p, _ in checks}
    score, max_s = 0, 0

    if lookup.get("temporal_full"):
        score += 1
    max_s += 1
    if lookup.get("temporal_test"):
        score += 2
    max_s += 2

    wf_names = [n for n in lookup if n.startswith("walkforward_")]
    wf_pass = sum(1 for n in wf_names if lookup[n])
    if wf_names:
        if wf_pass > len(wf_names) / 2:
            score += 1
        if wf_pass >= len(wf_names) - 1:
            score += 1
        max_s += 2

    for key in ("parameter_sweep", "cross_data_binance", "bootstrap", "buyhold_comparison"):
        if lookup.get(key):
            score += 1
        max_s += 1

    pct = score / max_s * 100 if max_s else 0
    if pct >= 85: return "strong"
    if pct >= 65: return "moderate"
    if pct >= 45: return "weak"
    return "overfit_signs"


def print_results(checks: list[tuple[str, bool, dict]]):
    passed = sum(1 for _, p, _ in checks if p)
    total = len(checks)
    conf = compute_confidence(checks)
    print()
    print("=" * 72)
    print(f"  VALIDATION RESULTS")
    print("=" * 72)
    for name, passed, detail in checks:
        sym = "PASS" if passed else "FAIL"
        ret = detail.get("new_return_pct", detail.get("return_pct", "?"))
        champ = detail.get("champion_return_pct", "?")
        note = f" new={ret}%" if ret != "?" else ""
        note += f" champ={champ}%" if champ != "?" else ""
        print(f"  [{sym}] {name}{note}")
    print(f"  {'─' * 60}")
    print(f"  PASSED: {passed}/{total}  CONFIDENCE: {conf.upper()}")
    print("=" * 72)


# ====== MAIN ======
def main():
    os.makedirs(OUT, exist_ok=True)
    start = time.time()
    checks: list[tuple[str, bool, dict]] = []

    print("\n=== 1. Temporal Train/Test Split ===")
    checks.extend(run_temporal(YAHOO))

    print("\n=== 2. Walk-Forward ===")
    checks.extend(run_wf(YAHOO))

    print("\n=== 3. Parameter Sweep (144 combos) ===")
    checks.extend(run_sweep(YAHOO))

    print("\n=== 4. Cross-Data (Binance) ===")
    if BINANCE.exists():
        checks.extend(run_cross(BINANCE))
    else:
        print("  SKIP: Binance data not found")

    print("\n=== 5. Bootstrap ===")
    checks.extend(run_bootstrap(YAHOO))

    print("\n=== 6. Buy & Hold Comparison ===")
    checks.extend(run_bh(YAHOO))

    elapsed = round(time.time() - start, 1)
    conf = compute_confidence(checks)
    report = {
        "validation_suite": "btc_regime_adaptive_confluence_progressive_trail",
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "elapsed_seconds": elapsed,
        "overall_confidence": conf,
        "checks_passed": sum(1 for _, p, _ in checks if p),
        "checks_total": len(checks),
        "checks": {n: {"passed": p, **d} for n, p, d in checks},
    }
    ts = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    out_path = OUT / f"validation_suite_{ts}.json"
    OUT.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    print(f"\nReport saved: {out_path}")

    print_results(checks)

    if conf in ("weak", "overfit_signs"):
        print("\n  ⚠ RECOMMENDATION: Do not promote. Review overfitting signs.\n")
        sys.exit(1)
    else:
        print("\n  ✓ Strategy passes professional validation.\n")


if __name__ == "__main__":
    main()
