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

    async def hset(self, key: str, field: Optional[str] = None, value: Any = None,
                   mapping: Optional[dict] = None) -> int:
        return 0

    async def hget(self, key: str, field: str) -> Optional[str]:
        return None

    async def hgetall(self, key: str) -> dict:
        return {}

    async def hdel(self, key: str, *fields: str) -> int:
        return 0

    async def keys(self, pattern: str = "*") -> list:
        return []

    async def rpush(self, key: str, *values: Any) -> int:
        return 0

    async def lpush(self, key: str, *values: Any) -> int:
        return 0

    async def ltrim(self, key: str, start: int, end: int) -> bool:
        return True

    async def lrange(self, key: str, start: int, end: int) -> list:
        return []

    async def llen(self, key: str) -> int:
        return 0

    async def zadd(self, key: str, mapping: dict) -> int:
        return 0

    async def zremrangebyscore(self, key: str, min: Any, max: Any) -> int:
        return 0

    async def zcard(self, key: str) -> int:
        return 0

    async def zrange(self, key: str, start: int, end: int, withscores: bool = False) -> list:
        return []

    async def setex(self, key: str, seconds: int, value: Any) -> bool:
        return True

    async def setnx(self, key: str, value: Any) -> bool:
        return True

    async def ttl(self, key: str) -> int:
        return -2

    async def scan(self, cursor: int = 0, match: Optional[str] = None, count: int = 100):
        return (0, [])
