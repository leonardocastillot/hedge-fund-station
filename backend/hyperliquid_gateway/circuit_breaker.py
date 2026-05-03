"""
Circuit breaker pattern for protecting against cascading failures.

Monitors failures to external services and temporarily blocks calls when threshold is exceeded.
"""

import time
from enum import Enum
from typing import Any, Callable, TypeVar

try:
    from .logger import logger
except ImportError:
    from logger import logger

T = TypeVar('T')


class CircuitState(Enum):
    """Circuit breaker states."""
    CLOSED = "closed"        # Normal operation, requests allowed
    OPEN = "open"           # Failure threshold exceeded, blocking requests
    HALF_OPEN = "half_open"  # Testing if service recovered


class CircuitBreaker:
    """
    Circuit breaker for protecting against cascading failures.

    The circuit starts CLOSED (normal operation). After failure_threshold consecutive
    failures, it opens and blocks all calls for timeout seconds. After timeout,
    it enters HALF_OPEN state to test if the service recovered.

    Args:
        failure_threshold: Number of failures before opening circuit (default: 3)
        timeout: Seconds to wait in OPEN state before testing recovery (default: 120)
        name: Name for logging purposes (default: "CircuitBreaker")
    """

    def __init__(self, failure_threshold: int = 3, timeout: int = 120, name: str = "CircuitBreaker"):
        self.failure_threshold = failure_threshold
        self.timeout = timeout
        self.name = name
        self.failure_count = 0
        self.last_failure_time: float | None = None
        self.state = CircuitState.CLOSED

    def call(self, func: Callable[..., T], *args: Any, **kwargs: Any) -> T:
        """
        Execute a function through the circuit breaker.

        Args:
            func: Function to execute
            *args: Positional arguments for func
            **kwargs: Keyword arguments for func

        Returns:
            Result of func execution

        Raises:
            Exception: If circuit is OPEN or if func raises an exception
        """
        # Check if circuit should transition from OPEN to HALF_OPEN
        if self.state == CircuitState.OPEN:
            if self.last_failure_time and time.time() - self.last_failure_time > self.timeout:
                logger.info(f"[CIRCUIT BREAKER] {self.name}: Transitioning OPEN -> HALF_OPEN (testing recovery)")
                self.state = CircuitState.HALF_OPEN
            else:
                elapsed = int(time.time() - self.last_failure_time) if self.last_failure_time else 0
                remaining = self.timeout - elapsed
                raise Exception(
                    f"Circuit breaker '{self.name}' is OPEN (failures: {self.failure_count}). "
                    f"Retrying in {remaining}s."
                )

        try:
            result = func(*args, **kwargs)

            # Success - reset if in HALF_OPEN, stay CLOSED if already CLOSED
            if self.state == CircuitState.HALF_OPEN:
                logger.info(f"[CIRCUIT BREAKER] {self.name}: Service recovered, transitioning HALF_OPEN -> CLOSED")
                self.reset()

            return result

        except Exception as exc:
            self.record_failure()
            raise

    async def call_async(self, func: Callable[..., T], *args: Any, **kwargs: Any) -> T:
        """
        Execute an async function through the circuit breaker.

        Args:
            func: Async function to execute
            *args: Positional arguments for func
            **kwargs: Keyword arguments for func

        Returns:
            Result of func execution

        Raises:
            Exception: If circuit is OPEN or if func raises an exception
        """
        # Check if circuit should transition from OPEN to HALF_OPEN
        if self.state == CircuitState.OPEN:
            if self.last_failure_time and time.time() - self.last_failure_time > self.timeout:
                logger.info(f"[CIRCUIT BREAKER] {self.name}: Transitioning OPEN -> HALF_OPEN (testing recovery)")
                self.state = CircuitState.HALF_OPEN
            else:
                elapsed = int(time.time() - self.last_failure_time) if self.last_failure_time else 0
                remaining = self.timeout - elapsed
                raise Exception(
                    f"Circuit breaker '{self.name}' is OPEN (failures: {self.failure_count}). "
                    f"Retrying in {remaining}s."
                )

        try:
            result = await func(*args, **kwargs)

            # Success - reset if in HALF_OPEN, stay CLOSED if already CLOSED
            if self.state == CircuitState.HALF_OPEN:
                logger.info(f"[CIRCUIT BREAKER] {self.name}: Service recovered, transitioning HALF_OPEN -> CLOSED")
                self.reset()

            return result

        except Exception as exc:
            self.record_failure()
            raise

    def record_failure(self) -> None:
        """Record a failure and potentially open the circuit."""
        self.failure_count += 1
        self.last_failure_time = time.time()

        if self.failure_count >= self.failure_threshold and self.state != CircuitState.OPEN:
            logger.error(
                f"[CIRCUIT BREAKER] {self.name}: Failure threshold reached ({self.failure_count} failures). "
                f"Transitioning to OPEN state for {self.timeout}s."
            )
            self.state = CircuitState.OPEN

    def reset(self) -> None:
        """Reset the circuit breaker to CLOSED state."""
        self.failure_count = 0
        self.last_failure_time = None
        self.state = CircuitState.CLOSED

    def get_status(self) -> dict[str, Any]:
        """
        Get current circuit breaker status.

        Returns:
            Dictionary with state, failure_count, and time info
        """
        time_since_failure = None
        if self.last_failure_time:
            time_since_failure = int(time.time() - self.last_failure_time)

        return {
            "name": self.name,
            "state": self.state.value,
            "failure_count": self.failure_count,
            "failure_threshold": self.failure_threshold,
            "timeout": self.timeout,
            "time_since_last_failure": time_since_failure,
            "is_open": self.state == CircuitState.OPEN,
        }


# Global circuit breaker instance for CLOB
clob_circuit = CircuitBreaker(failure_threshold=3, timeout=120, name="CLOB")
