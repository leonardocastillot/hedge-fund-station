"""
Centralized logging system for Polymarket trading bot.

Provides structured logging with consistent formatting and severity levels.
"""

import logging
import sys
from typing import Optional


def setup_logger(name: str = "polymarket", level: int = logging.INFO) -> logging.Logger:
    """
    Configure and return a logger with structured output.

    Args:
        name: Logger name (default: "polymarket")
        level: Logging level (default: INFO)

    Returns:
        Configured logger instance
    """
    logger = logging.getLogger(name)

    # Avoid duplicate handlers if logger already exists
    if logger.handlers:
        return logger

    logger.setLevel(level)

    # Console handler with structured formatting
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level)

    formatter = logging.Formatter(
        "%(asctime)s [%(levelname)s] %(name)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )
    handler.setFormatter(formatter)

    logger.addHandler(handler)

    return logger


# Global logger instance
logger = setup_logger()


def log_trade_event(
    event_type: str,
    slug: str,
    side: Optional[str] = None,
    size_usd: Optional[float] = None,
    price: Optional[float] = None,
    order_id: Optional[str] = None,
    shares: Optional[float] = None,
    metadata: Optional[dict] = None
):
    """
    Log structured trade events with consistent format.

    Args:
        event_type: Type of event (e.g., "ORDER_SUBMITTED", "ORDER_FILLED", "ORDER_REJECTED")
        slug: Market slug
        side: Order side (BUY_YES, BUY_NO, SELL_YES, SELL_NO)
        size_usd: Order size in USD
        price: Order price
        order_id: Polymarket order ID
        shares: Number of shares
        metadata: Additional context
    """
    parts = [f"[{event_type}]"]

    if side:
        parts.append(f"{side}")
    if size_usd is not None:
        parts.append(f"${size_usd:.2f}")
    if shares is not None:
        parts.append(f"{shares:.4f} shares")
    if price is not None:
        parts.append(f"@ ${price:.4f}")

    parts.append(f"on {slug}")

    if order_id:
        parts.append(f"(order_id: {order_id})")

    message = " ".join(parts)

    if metadata:
        message += f" | metadata: {metadata}"

    logger.info(message)


def log_signal_evaluation(
    slug: str,
    signal: str,
    side: Optional[str],
    net_edge_pct: Optional[float],
    filters_failed: Optional[list],
    basis_bps: Optional[float] = None,
    spread_bps: Optional[float] = None
):
    """
    Log signal evaluation results with key metrics.

    Args:
        slug: Market slug
        signal: Signal result (ENTER, EXIT, HOLD)
        side: Recommended side if signal is ENTER
        net_edge_pct: Net edge percentage after costs
        filters_failed: List of filters that failed
        basis_bps: Basis in basis points
        spread_bps: Spread in basis points
    """
    parts = [f"[SIGNAL] {signal}"]

    if side:
        parts.append(f"({side})")

    if net_edge_pct is not None:
        parts.append(f"edge={net_edge_pct:.3f}%")

    if basis_bps is not None:
        parts.append(f"basis={basis_bps:.1f}bps")

    if spread_bps is not None:
        parts.append(f"spread={spread_bps:.1f}bps")

    parts.append(f"on {slug}")

    if filters_failed:
        parts.append(f"| filters_failed: {', '.join(filters_failed)}")

    logger.info(" ".join(parts))


def log_risk_event(
    event_type: str,
    reason: str,
    pause_minutes: Optional[int] = None,
    metadata: Optional[dict] = None
):
    """
    Log risk management events (kill-switch, position sizing adjustments).

    Args:
        event_type: Event type (e.g., "KILL_SWITCH_ACTIVATED", "POSITION_SIZE_REDUCED")
        reason: Human-readable reason
        pause_minutes: Duration of pause if applicable
        metadata: Additional context
    """
    parts = [f"[RISK] {event_type}: {reason}"]

    if pause_minutes:
        parts.append(f"(paused for {pause_minutes} minutes)")

    message = " ".join(parts)

    if metadata:
        message += f" | {metadata}"

    logger.warning(message)


def log_health_check(
    service: str,
    status: str,
    latency_ms: Optional[float] = None,
    error: Optional[str] = None
):
    """
    Log health check results for external services.

    Args:
        service: Service name (e.g., "CLOB", "Coinbase", "Gamma")
        status: Status (OK, DEGRADED, DOWN)
        latency_ms: Response latency in milliseconds
        error: Error message if status is not OK
    """
    parts = [f"[HEALTH] {service}: {status}"]

    if latency_ms is not None:
        parts.append(f"({latency_ms:.0f}ms)")

    if error:
        parts.append(f"| error: {error}")

    level = logging.INFO if status == "OK" else logging.WARNING if status == "DEGRADED" else logging.ERROR
    logger.log(level, " ".join(parts))
