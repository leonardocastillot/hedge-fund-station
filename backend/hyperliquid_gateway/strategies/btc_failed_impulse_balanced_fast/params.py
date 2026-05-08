from __future__ import annotations

STRATEGY_ID = "btc_failed_impulse_balanced_fast"
PARENT_STRATEGY_ID = "btc_failed_impulse_reversal"

VARIANT_ID = "default_signal__balanced_fast"
VARIANT_PARAMS = {
    "min_volume_usd": 500_000_000.0,
    "min_open_interest_usd": 1_000_000_000.0,
    "min_impulse_1h_pct": 0.30,
    "long_min_failed_followthrough_15m_pct": -0.08,
    "short_max_failed_followthrough_15m_pct": -0.18,
    "max_abs_4h_extension_pct": 5.0,
    "base_size_pct": 10.0,
    "stop_loss_pct": 0.65,
    "take_profit_pct": 1.45,
    "max_hold_minutes": 360.0,
    "cooldown_minutes": 15.0,
    "post_loss_cooldown_minutes": 30.0,
    "max_concurrent_positions": 1.0,
}

THESIS = (
    "Fade a failed BTC one-hour impulse with the parent entry filters, but use "
    "a tighter 1.45% target and 6 hour time stop to reduce subwindow concentration."
)
TRIGGER_PLAN = "Enter the opposite side after a liquid BTC 1h impulse when 15m continuation fails."
INVALIDATION_PLAN = "Use 0.65% stop, 1.45% target, 6h time stop, one BTC position, and post-exit cooldown."
