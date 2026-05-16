"""
Cross-Symbol Momentum Rotational - Risk Management

Portfolio-level and per-position risk rules for long-short basket.
"""

from __future__ import annotations

import time
from typing import Any


MAX_BASKET_SIZE = 3
MAX_POSITIONS = 6
MIN_VOLUME_KILL = 5_000_000
MAX_HOLD_MINUTES = 120
DRAWDOWN_KILL_PCT = -1.0
DRAWDOWN_PAUSE_MINUTES = 240
CONSECUTIVE_LOSS_KILL = 3
CONSECUTIVE_LOSS_PAUSE_MINUTES = 120
MARKET_CRASH_THRESHOLD = -5.0
FUNDING_ADVERSARY_THRESHOLD = 0.10


def check_invalidation(
    position: dict[str, Any],
    current_data: dict[str, Any],
    entry_data: dict[str, Any],
    current_ranked: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "should_exit": False,
        "reason": "",
        "urgency": "none",
        "invalidations": [],
        "time_held_minutes": 0,
    }

    symbol = position.get("symbol", "")
    side = position.get("side", "long")
    entry_time_ms = position.get("createdAt", int(time.time() * 1000))
    current_time_ms = int(time.time() * 1000)
    time_held_minutes = (current_time_ms - entry_time_ms) / 60000
    result["time_held_minutes"] = round(time_held_minutes, 1)

    # Invalidation 1: Rank drop (long fell out of top, short rose out of bottom)
    if current_ranked is not None and symbol:
        rank_pos = next(
            (i for i, s in enumerate(current_ranked) if s["symbol"] == symbol),
            None,
        )
        if rank_pos is not None:
            if side == "long" and rank_pos >= MAX_BASKET_SIZE + 2:
                result["invalidations"].append(f"{symbol} dropped to rank {rank_pos + 1}")
                result["should_exit"] = True
                result["urgency"] = "normal"
                result["reason"] = "rank_dropped"
            elif side == "short" and rank_pos < len(current_ranked) - MAX_BASKET_SIZE - 2:
                result["invalidations"].append(f"{symbol} rose to rank {rank_pos + 1}")
                result["should_exit"] = True
                result["urgency"] = "normal"
                result["reason"] = "rank_rose"

    # Invalidation 2: Volume dried up
    volume = current_data.get("volume24h", 0.0) or 0.0
    if volume < MIN_VOLUME_KILL:
        result["invalidations"].append(f"{symbol} volume dropped to ${volume:,.0f}")
        result["should_exit"] = True
        result["urgency"] = "normal"
        result["reason"] = "volume_dried"

    # Invalidation 3: Funding adverse
    funding = current_data.get("fundingRate")
    if funding is not None:
        funding_pct = funding * 100
        if side == "long" and funding_pct > FUNDING_ADVERSARY_THRESHOLD:
            result["invalidations"].append(f"{symbol} funding {funding_pct:.4f}% too high for long")
            result["should_exit"] = True
            result["urgency"] = "normal"
            result["reason"] = "funding_adverse"
        elif side == "short" and funding_pct < -FUNDING_ADVERSARY_THRESHOLD:
            result["invalidations"].append(f"{symbol} funding {funding_pct:.4f}% too low for short")
            result["should_exit"] = True
            result["urgency"] = "normal"
            result["reason"] = "funding_adverse"

    # Invalidation 4: Time stop
    if time_held_minutes > MAX_HOLD_MINUTES:
        result["invalidations"].append(f"{symbol} held {time_held_minutes:.0f}min")
        result["should_exit"] = True
        result["urgency"] = "normal"
        result["reason"] = "time_stop"

    return result


def check_market_wide_kill(
    all_market_data: list[dict[str, Any]],
) -> dict[str, Any]:
    if not all_market_data:
        return {"should_pause": False, "reason": "", "pause_minutes": 0}

    avg_change_1h = 0.0
    count = 0
    for data in all_market_data:
        chg = data.get("change1h", 0.0)
        if chg is not None:
            avg_change_1h += chg
            count += 1

    if count > 0:
        avg_change_1h /= count

    if avg_change_1h < MARKET_CRASH_THRESHOLD:
        return {
            "should_pause": True,
            "reason": f"Market-wide crash: avg 1h change {avg_change_1h:.2f}%",
            "pause_minutes": 60,
        }

    return {"should_pause": False, "reason": "", "pause_minutes": 0}


def check_session_killswitch(
    session_stats: dict[str, Any],
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "should_pause": False,
        "reason": "",
        "pause_duration_minutes": 0,
    }

    daily_pnl_pct = session_stats.get("dailyPnlPct", 0.0)
    if daily_pnl_pct < DRAWDOWN_KILL_PCT:
        result["should_pause"] = True
        result["reason"] = f"Daily drawdown {daily_pnl_pct:.2f}%"
        result["pause_duration_minutes"] = DRAWDOWN_PAUSE_MINUTES

    consecutive_losses = session_stats.get("consecutiveLosses", 0)
    if consecutive_losses >= CONSECUTIVE_LOSS_KILL:
        result["should_pause"] = True
        result["reason"] = f"{consecutive_losses} consecutive losses"
        result["pause_duration_minutes"] = CONSECUTIVE_LOSS_PAUSE_MINUTES

    return result


def calculate_position_size(
    portfolio_value: float,
    basket_info: dict[str, Any],
    current_positions: list[dict[str, Any]],
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "sizes": [],
        "can_enter": True,
        "block_reason": None,
    }

    long_basket = basket_info.get("long_basket", [])
    short_basket = basket_info.get("short_basket", [])
    basket_size = max(len(long_basket), len(short_basket))

    if basket_size == 0:
        result["can_enter"] = False
        result["block_reason"] = "Empty baskets"
        return result

    open_positions = [p for p in current_positions if p.get("status") == "open"]
    if len(open_positions) + basket_size * 2 > MAX_POSITIONS:
        result["can_enter"] = False
        result["block_reason"] = f"Would exceed max {MAX_POSITIONS} positions"
        return result

    side_allocation = portfolio_value * 0.33
    per_long = side_allocation / max(len(long_basket), 1)
    per_short = side_allocation / max(len(short_basket), 1)

    sizes = []
    for item in long_basket:
        sizes.append({
            "symbol": item["symbol"],
            "side": "long",
            "size_usd": round(per_long, 2),
            "price": item.get("price"),
        })
    for item in short_basket:
        sizes.append({
            "symbol": item["symbol"],
            "side": "short",
            "size_usd": round(per_short, 2),
            "price": item.get("price"),
        })

    result["sizes"] = sizes
    result["side_allocation"] = side_allocation
    result["per_long"] = round(per_long, 2)
    result["per_short"] = round(per_short, 2)

    return result
