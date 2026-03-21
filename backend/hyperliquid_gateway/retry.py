"""
Retry decorator with exponential backoff for network calls.

Provides resilient API calls with configurable retry logic.
"""

import asyncio
from functools import wraps
from typing import Any, Callable, Type, TypeVar
from logger import logger

T = TypeVar('T')


def retry_async(
    max_attempts: int = 3,
    base_delay: float = 1.0,
    backoff: float = 2.0,
    exceptions: tuple[Type[Exception], ...] = (Exception,)
) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """
    Decorator for async functions with exponential backoff retry logic.

    Args:
        max_attempts: Maximum number of retry attempts (default: 3)
        base_delay: Initial delay in seconds before first retry (default: 1.0)
        backoff: Multiplier for delay after each attempt (default: 2.0)
        exceptions: Tuple of exception types to retry (default: all exceptions)

    Returns:
        Decorated function with retry logic

    Example:
        @retry_async(max_attempts=3, base_delay=1.0, exceptions=(httpx.TimeoutException,))
        async def fetch_data():
            # Network call here
            pass
    """
    def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
        @wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            for attempt in range(max_attempts):
                try:
                    return await func(*args, **kwargs)
                except exceptions as exc:
                    if attempt == max_attempts - 1:
                        # Last attempt failed, re-raise
                        logger.error(f"[RETRY] {func.__name__} failed after {max_attempts} attempts: {exc}")
                        raise

                    delay = base_delay * (backoff ** attempt)
                    logger.warning(
                        f"[RETRY] {func.__name__} attempt {attempt + 1}/{max_attempts} failed: {exc}. "
                        f"Retrying in {delay:.1f}s..."
                    )
                    await asyncio.sleep(delay)

            # Should never reach here, but satisfy type checker
            return None

        return wrapper
    return decorator


def retry_sync(
    max_attempts: int = 3,
    base_delay: float = 1.0,
    backoff: float = 2.0,
    exceptions: tuple[Type[Exception], ...] = (Exception,)
) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """
    Decorator for synchronous functions with exponential backoff retry logic.

    Args:
        max_attempts: Maximum number of retry attempts (default: 3)
        base_delay: Initial delay in seconds before first retry (default: 1.0)
        backoff: Multiplier for delay after each attempt (default: 2.0)
        exceptions: Tuple of exception types to retry (default: all exceptions)

    Returns:
        Decorated function with retry logic
    """
    def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
        @wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            import time

            for attempt in range(max_attempts):
                try:
                    return func(*args, **kwargs)
                except exceptions as exc:
                    if attempt == max_attempts - 1:
                        logger.error(f"[RETRY] {func.__name__} failed after {max_attempts} attempts: {exc}")
                        raise

                    delay = base_delay * (backoff ** attempt)
                    logger.warning(
                        f"[RETRY] {func.__name__} attempt {attempt + 1}/{max_attempts} failed: {exc}. "
                        f"Retrying in {delay:.1f}s..."
                    )
                    time.sleep(delay)

            return None

        return wrapper
    return decorator
