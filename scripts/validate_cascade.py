#!/usr/bin/env python3
"""Validation suite for btc_trend_cascade vs btc_regime_adaptive_confluence."""

import importlib, json, os, random, sys, time
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "backend" / "hyperliquid_gateway"))
from backtesting.engine import BacktestConfig
from backtesting.metrics import build_summary

YAHOO = REPO / "backend/hyperliquid_gateway/data/market_data/btc_usd_daily_yahoo.json"
BINANCE = REPO / "backend/hyperliquid_gateway/data/market_data/one_bitcoin_btc_usd_daily.json"
OUT = REPO / "backend/hyperliquid_gateway/data/validations/validation_suite"

NEW_ID = "btc_trend_cascade"
CHAMP_ID = "btc_regime_adaptive_confluence"
CHAMP_RET = 263.78

FULL = ("2014-09-17", "2026-05-13")
TRAIN = ("2014-09-17", "2021-12-31")
TEST = ("2020-07-01", "2022-01-01", "2026-05-13")
WF = [
    ("wf_2015_2020", "2015-06-01", "2020-05-31"),
    ("wf_2017_2022", "2017-06-01", "2022-05-31"),
    ("wf_2019_2024", "2019-06-01", "2024-05-31"),
    ("wf_2021_2026", "2021-06-01", "2026-05-13"),
]
B_N = 1000
SEED = 42

_R = {}
def runner(sid):
    if sid not in _R:
        m = importlib.import_module(f"strategies.{sid}.backtest")
        importlib.reload(m)
        _R[sid] = m.run_backtest
    return _R[sid]

def bt(sid, dp, s, e):
    return runner(sid)(dp, BacktestConfig(initial_equity=500.0, taker_fee_rate=0.00045, fee_model="taker", risk_fraction=1.0, start=s, end=e))

def eval_bt(sid, dp, ds, es, e):
    full = bt(sid, dp, ds, e)
    curve = [p for p in full["equity_curve"] if str(p["timestamp"]) >= es]
    trades = [t for t in full["trades"] if str(t["entry_timestamp"]) >= es]
    if not curve:
        return {"summary": {"return_pct": 0.0, "profit_factor": 0.0, "max_drawdown_pct": 0.0, "total_trades": 0}}
    fees = sum(float(t.get("fees", 0.0) or 0.0) for t in trades)
    summ = build_summary(initial_equity=float(curve[0]["equity"]), equity_curve=curve, trades=trades, fees_paid=fees)
    return {"summary": summ, "trades": trades, "equity_curve": curve}

def buyhold(dp, s, e):
    from backtesting.btc_daily_history import load_btc_daily_history
    rows, _ = load_btc_daily_history(dp, BacktestConfig(start=s, end=e))
    if len(rows) < 2: return 0.0
    return round((float(rows[-1]["close"]) - float(rows[0]["close"])) / float(rows[0]["close"]) * 100, 2)

checks = []
def check(name, passed, detail):
    checks.append((name, passed, detail))

t0 = time.time()

# 1. TEMPORAL
print("=== 1. Temporal Split ===")
for label, s, e, es in [
    ("full_period", *FULL, None),
    ("train_period", *TRAIN, None),
    ("test_period_oos", TEST[0], TEST[2], TEST[1]),
]:
    if es:
        n = eval_bt(NEW_ID, YAHOO, s, es, e)
        c = eval_bt(CHAMP_ID, YAHOO, s, es, e)
    else:
        n = {"summary": bt(NEW_ID, YAHOO, s, e)["summary"]}
        c = {"summary": bt(CHAMP_ID, YAHOO, s, e)["summary"]}
    beats = n["summary"]["return_pct"] > c["summary"]["return_pct"]
    print(f"  {label}: new={n['summary']['return_pct']:.1f}% champ={c['summary']['return_pct']:.1f}% {'BEATS' if beats else 'loses'}")
    check(f"temporal_{label}", beats, {"start": s, "end": e, "new_return_pct": n["summary"]["return_pct"], "champion_return_pct": c["summary"]["return_pct"]})

# 2. WALK FORWARD
print("\n=== 2. Walk-Forward ===")
for wid, s, e in WF:
    n = bt(NEW_ID, YAHOO, s, e)
    c = bt(CHAMP_ID, YAHOO, s, e)
    beats = n["summary"]["return_pct"] > c["summary"]["return_pct"]
    print(f"  {wid}: new={n['summary']['return_pct']:.1f}% champ={c['summary']['return_pct']:.1f}%")
    check(f"walkforward_{wid}", beats, {"start": s, "end": e, "new_return_pct": n["summary"]["return_pct"], "champion_return_pct": c["summary"]["return_pct"]})

# 3. CROSS DATA
print("\n=== 3. Cross-Data ===")
if BINANCE.exists():
    try:
        n = bt(NEW_ID, BINANCE, "2017-08-17", "2026-05-07")
        c = bt(CHAMP_ID, BINANCE, "2017-08-17", "2026-05-07")
        beats = n["summary"]["return_pct"] > c["summary"]["return_pct"]
        print(f"  new={n['summary']['return_pct']:.1f}% champ={c['summary']['return_pct']:.1f}%")
        check("cross_data_binance", beats, {"new_return_pct": n["summary"]["return_pct"], "champion_return_pct": c["summary"]["return_pct"]})
    except Exception as ex:
        print(f"  FAIL: {ex}")
        check("cross_data_binance", False, {"error": str(ex)})
else:
    print("  SKIP")

# 4. BOOTSTRAP
print("\n=== 4. Bootstrap ===")
random.seed(SEED)
full = bt(NEW_ID, YAHOO, *FULL)
pnls = [float(t["net_pnl"]) for t in full["trades"]]
nt = len(pnls)
sims = []
for i in range(B_N):
    eq = 500.0
    for p in [random.choice(pnls) for _ in range(nt)]:
        eq += p
        if eq <= 0: eq = 0; break
    sims.append(round((eq - 500.0) / 500.0 * 100, 2))
sims.sort()
mid = sims[B_N // 2]
p_champ = round(sum(1 for s in sims if s >= CHAMP_RET) / B_N * 100, 1)
print(f"  median={mid:.1f}% >champ={p_champ}%  (orig={full['summary']['return_pct']:.1f}%)")
check("bootstrap", p_champ > 50, {"iterations": B_N, "original_return": full["summary"]["return_pct"], "median": mid, "pct_above_champ": p_champ})

# 5. BUY & HOLD
print("\n=== 5. Buy & Hold ===")
windows = [("full", *FULL), ("train", *TRAIN), ("test_oos", TEST[1], TEST[2])] + [(wid, s, e) for wid, s, e in WF]
wins = 0
for wid, s, e in windows:
    bh = buyhold(YAHOO, s, e)
    n = bt(NEW_ID, YAHOO, s, e)
    strat = n["summary"]["return_pct"]
    beats = strat > bh
    if beats: wins += 1
    print(f"  {wid}: strat={strat:.1f}% vs BH={bh:.1f}%")
wr = round(wins / len(windows) * 100, 1)
check("buyhold_comparison", wr >= 70, {"windows": len(windows), "beaten": wins, "win_rate_pct": wr})

elapsed = round(time.time() - t0, 1)

# CONFIDENCE
lookup = {n: p for n, p, _ in checks}
score, ms = 0, 0
if lookup.get("temporal_full_period"): score += 1
ms += 1
if lookup.get("temporal_test_period_oos"): score += 2
ms += 2
wf_names = [n for n in lookup if n.startswith("walkforward_")]
wf_pass = sum(1 for n in wf_names if lookup[n])
if wf_names:
    if wf_pass > len(wf_names) / 2: score += 1
    if wf_pass >= len(wf_names) - 1: score += 1
    ms += 2
for k in ("cross_data_binance", "bootstrap", "buyhold_comparison"):
    if lookup.get(k): score += 1
    ms += 1
pct = score / ms * 100 if ms else 0
conf = "strong" if pct >= 85 else "moderate" if pct >= 65 else "weak" if pct >= 45 else "overfit_signs"

passed = sum(1 for _, p, _ in checks if p)
total = len(checks)

print(f"\n{'=' * 72}")
print(f"  VALIDATION ({elapsed}s)")
print(f"{'=' * 72}")
for name, p, d in checks:
    r = d.get("new_return_pct", "?")
    rr = f" {r:.1f}%" if isinstance(r, (int, float)) else ""
    print(f"  [{'PASS' if p else 'FAIL'}] {name}{rr}")
print(f"  {'─' * 60}")
print(f"  {passed}/{total} passed  CONFIDENCE: {conf.upper()}")
print(f"  Return: {full['summary']['return_pct']:.1f}%  WR: {full['summary']['win_rate_pct']:.1f}%  PF: {full['summary']['profit_factor']:.2f}  DD: {full['summary']['max_drawdown_pct']:.1f}%")
print(f"{'=' * 72}")

# SAVE
report = {
    "validation_suite": "btc_trend_cascade_vs_regime_adaptive_confluence",
    "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "elapsed_seconds": elapsed,
    "overall_confidence": conf,
    "checks_passed": passed, "checks_total": total,
    "full_return_pct": full["summary"]["return_pct"],
    "checks": {n: {"passed": p, **d} for n, p, d in checks},
}
OUT.mkdir(parents=True, exist_ok=True)
p = OUT / f"cascade_validation_{time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())}.json"
p.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
print(f"\nReport: {p}")

if conf in ("weak", "overfit_signs"):
    print("\n  ⚠ Review before promotion.\n")
    sys.exit(1)
else:
    print("\n  ✓ VALIDATED.\n")
