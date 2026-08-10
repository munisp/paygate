"""
PayGate Shared Redis Client
Async Redis helper for all Python microservices.
"""
from typing import Optional, Any
import json
from .config import REDIS_URL
from .logging import get_logger

logger = get_logger("redis")
_redis = None


async def get_redis():
    """Get or create the shared Redis connection."""
    global _redis
    if _redis is not None:
        return _redis
    try:
        import redis.asyncio as aioredis  # type: ignore
        _redis = aioredis.from_url(REDIS_URL, decode_responses=True)
        await _redis.ping()
        logger.info(f"Redis connected: {REDIS_URL}")
    except Exception as e:
        logger.warning(f"Redis unavailable: {e} — operating in no-op mode")
        _redis = _NoOpRedis()
    return _redis


class _NoOpRedis:
    """Fallback no-op Redis when the real instance is unavailable."""

    async def get(self, key: str) -> Optional[str]:
        return None

    async def set(self, key: str, value: Any, ex: Optional[int] = None) -> bool:
        return True

    async def delete(self, *keys: str) -> int:
        return 0

    async def exists(self, *keys: str) -> int:
        return 0

    async def incr(self, key: str) -> int:
        return 1

    async def expire(self, key: str, seconds: int) -> bool:
        return True

    async def ping(self) -> bool:
        return True
