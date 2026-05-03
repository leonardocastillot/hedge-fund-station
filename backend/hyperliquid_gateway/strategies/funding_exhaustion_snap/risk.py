"""
Funding Exhaustion Snap - Risk Management

Invalidation logic, position sizing, and kill-switch rules.
"""

from __future__ import annotations

from typing import Any
import time


def check_invalidation(
    position: dict[str, Any],
    current_market_data: dict[str, Any],
    entry_data: dict[str, Any]
) -> dict[str, Any]:
    """
    Check if position should be invalidated (exited immediately).

    Invalidation triggers:
    - Price moves against position >1.2% (hard stop)
    - Funding normalizes (percentile toward 40-60)
    - OI collapses (-8% from entry)
    - Volume dries up (<30% of entry volume)
    - Time-based: >4 hours
    - Signal flip (crowding bias reverses)
    - Momentum re-accelerates against position

    Returns:
        {
            "should_exit": bool,
            "reason": str,
            "urgency": "immediate" | "normal" | "none",
            "invalidations": [...],
            "time_held_minutes": int
        }
    """
    result = {
        "should_exit": False,
        "reason": "",
        "urgency": "none",
        "invalidations": [],
        "time_held_minutes": 0
    }

    side = position.get("side", "long")
    entry_price = position.get("entryPrice", 0.0)
    entry_time_ms = position.get("createdAt", int(time.time() * 1000))
    current_time_ms = int(time.time() * 1000)
    time_held_minutes = (current_time_ms - entry_time_ms) / 60000

    result["time_held_minutes"] = round(time_held_minutes, 1)

    current_price = current_market_data.get("price", entry_price)
    pnl_pct = 0.0
    if entry_price > 0:
        if side == "long":
            pnl_pct = ((current_price - entry_price) / entry_price) * 100
        else:  # short
            pnl_pct = ((entry_price - current_price) / entry_price) * 100

    # Invalidation 1: Hard stop loss (>1.2% against)
    if pnl_pct < -1.2:
        result["invalidations"].append(f"Hard stop hit: {pnl_pct:.2f}% loss")
        result["should_exit"] = True
        result["urgency"] = "immediate"
        result["reason"] = "stop_loss"

    # Invalidation 2: Funding normalization
    entry_funding_pct = entry_data.get("fundingPercentile", 50.0)
    current_funding_pct = current_market_data.get("fundingPercentile", 50.0)

    if side == "long":
        # Long position expects funding to normalize from high (85+) toward 50
        if entry_funding_pct >= 85 and current_funding_pct <= 60:
            result["invalidations"].append(f"Funding normalized: {current_funding_pct:.1f}th (from {entry_funding_pct:.1f}th)")
            result["should_exit"] = True
            result["urgency"] = "normal"
            result["reason"] = "funding_normalized"
    else:  # short
        # Short position expects funding to normalize from low (15-) toward 50
        if entry_funding_pct <= 15 and current_funding_pct >= 40:
            result["invalidations"].append(f"Funding normalized: {current_funding_pct:.1f}th (from {entry_funding_pct:.1f}th)")
            result["should_exit"] = True
            result["urgency"] = "normal"
            result["reason"] = "funding_normalized"

    # Invalidation 3: OI collapse
    entry_oi = entry_data.get("openInterestUsd", 0.0)
    current_oi = current_market_data.get("openInterestUsd", entry_oi)
    if entry_oi > 0:
        oi_change_pct = ((current_oi - entry_oi) / entry_oi) * 100
        if oi_change_pct < -8.0:
            result["invalidations"].append(f"OI collapsed: {oi_change_pct:.1f}%")
            result["should_exit"] = True
            result["urgency"] = "normal"
            result["reason"] = "oi_collapse"

    # Invalidation 4: Volume dried up
    entry_volume = entry_data.get("volume24h", 0.0)
    current_volume = current_market_data.get("volume24h", entry_volume)
    if entry_volume > 0:
        volume_ratio = current_volume / entry_volume
        if volume_ratio < 0.30:
            result["invalidations"].append(f"Volume dried up: {volume_ratio*100:.0f}% of entry")
            result["should_exit"] = True
            result["urgency"] = "normal"
            result["reason"] = "volume_dried"

    # Invalidation 5: Time-based (>4 hours)
    if time_held_minutes > 240:
        result["invalidations"].append(f"Max hold time exceeded: {time_held_minutes:.0f}min")
        result["should_exit"] = True
        result["urgency"] = "normal"
        result["reason"] = "time_limit"

    # Invalidation 6: Time-based no progress (45min with no movement)
    if time_held_minutes > 45 and abs(pnl_pct) < 0.3:
        result["invalidations"].append(f"No progress after {time_held_minutes:.0f}min: {pnl_pct:.2f}%")
        result["should_exit"] = True
        result["urgency"] = "normal"
        result["reason"] = "no_progress"

    # Invalidation 7: Crowding bias flip
    entry_bias = entry_data.get("crowdingBias", "balanced")
    current_bias = current_market_data.get("crowdingBias", "balanced")
    if side == "long" and entry_bias == "longs-at-risk" and current_bias == "shorts-at-risk":
        result["invalidations"].append(f"Crowding bias flipped: {entry_bias} -> {current_bias}")
        result["should_exit"] = True
        result["urgency"] = "normal"
        result["reason"] = "bias_flip"
    elif side == "short" and entry_bias == "shorts-at-risk" and current_bias == "longs-at-risk":
        result["invalidations"].append(f"Crowding bias flipped: {entry_bias} -> {current_bias}")
        result["should_exit"] = True
        result["urgency"] = "normal"
        result["reason"] = "bias_flip"

    # Invalidation 8: Momentum re-accelerates against position
    change_1h = current_market_data.get("change1h", 0.0)
    if side == "long" and change_1h > 2.5:
        # Long position but momentum accelerating up (we expected fade)
        result["invalidations"].append(f"Momentum re-accelerating: {change_1h:.2f}% (1hr)")
        result["should_exit"] = True
        result["urgency"] = "normal"
        result["reason"] = "momentum_reversal"
    elif side == "short" and change_1h < -2.5:
        # Short position but momentum accelerating down (we expected bounce)
        result["invalidations"].append(f"Momentum re-accelerating: {change_1h:.2f}% (1hr)")
        result["should_exit"] = True
        result["urgency"] = "normal"
        result["reason"] = "momentum_reversal"

    return result


def calculate_position_size(
    portfolio_value: float,
    market_data: dict[str, Any],
    current_positions: list[dict[str, Any]],
    signal_eval: dict[str, Any]
) -> dict[str, Any]:
    """
    Calculate position size based on risk rules.

    Base size: 1.5% of portfolio
    Adjustments:
    - Reduce to 1.0% if exec quality <60
    - Reduce to 0.8% if 2nd+ correlated position
    - Max 3 concurrent positions
    - Max 2 same direction

    Returns:
        {
            "size_usd": float,
            "size_pct": float,
            "adjustments": [...],
            "can_enter": bool,
            "block_reason": str | None
        }
    """
    result = {
        "size_usd": 0.0,
        "size_pct": 0.0,
        "adjustments": [],
        "can_enter": True,
        "block_reason": None
    }

    # Check position limits
    num_positions = len([p for p in current_positions if p.get("status") == "open"])
    if num_positions >= 3:
        result["can_enter"] = False
        result["block_reason"] = "Max 3 concurrent positions reached"
        return result

    # Check direction limits
    signal_dir = signal_eval.get("direction", "long")
    same_direction_count = len([
        p for p in current_positions
        if p.get("status") == "open" and p.get("side") == signal_dir
    ])
    if same_direction_count >= 2:
        result["can_enter"] = False
        result["block_reason"] = f"Max 2 {signal_dir} positions reached"
        return result

    # Check portfolio heat
    total_heat = sum(
        p.get("sizeUsd", 0) / portfolio_value * 100
        for p in current_positions
        if p.get("status") == "open"
    )
    if total_heat >= 4.5:
        result["can_enter"] = False
        result["block_reason"] = f"Max portfolio heat reached: {total_heat:.1f}%"
        return result

    # Base size: 1.5%
    base_size_pct = 1.5
    result["adjustments"].append(f"Base: {base_size_pct}%")

    # Adjustment 1: Execution quality
    exec_quality = market_data.get("executionQuality", 70)
    if exec_quality < 60:
        base_size_pct = 1.0
        result["adjustments"].append(f"Reduced to 1.0% (exec quality {exec_quality})")

    # Adjustment 2: Correlation (if 2nd position)
    if num_positions >= 1:
        base_size_pct = min(base_size_pct, 0.8)
        result["adjustments"].append(f"Reduced to 0.8% (2nd+ position)")

    # Final size
    size_usd = (portfolio_value * base_size_pct) / 100
    result["size_usd"] = round(size_usd, 2)
    result["size_pct"] = base_size_pct

    return result


def check_session_killswitch(
    session_stats: dict[str, Any]
) -> dict[str, Any]:
    """
    Check session-level kill-switches.

    Kill-switches:
    - 3 consecutive losses
    - Daily drawdown >2.5%
    - Consistent high slippage (>0.12%)

    Returns:
        {
            "should_pause": bool,
            "reason": str,
            "pause_duration_minutes": int
        }
    """
    result = {
        "should_pause": False,
        "reason": "",
        "pause_duration_minutes": 0
    }

    # Check consecutive losses
    consecutive_losses = session_stats.get("consecutiveLosses", 0)
    if consecutive_losses >= 3:
        result["should_pause"] = True
        result["reason"] = f"{consecutive_losses} consecutive losses"
        result["pause_duration_minutes"] = 120  # 2 hours

    # Check daily drawdown
    daily_pnl_pct = session_stats.get("dailyPnlPct", 0.0)
    if daily_pnl_pct < -2.5:
        result["should_pause"] = True
        result["reason"] = f"Daily drawdown {daily_pnl_pct:.2f}%"
        result["pause_duration_minutes"] = 240  # 4 hours

    # Check slippage
    avg_slippage = session_stats.get("avgSlippagePct", 0.0)
    if avg_slippage > 0.12:
        result["should_pause"] = True
        result["reason"] = f"High slippage {avg_slippage:.3f}%"
        result["pause_duration_minutes"] = 60  # 1 hour

    return result
