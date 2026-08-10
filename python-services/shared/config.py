"""
PayGate Shared Configuration
Common environment variable helpers for all Python microservices.
"""
import os

def get_env(key: str, default: str = "") -> str:
    return os.environ.get(key, default)

# Core service config
INTERNAL_API_KEY = get_env("INTERNAL_API_KEY", "paygate-internal-dev-key-2026")
DATABASE_URL = get_env("PG_DATABASE_URL", "postgresql://paygate:paygate_dev_2026@postgres:5432/paygate_dev")
REDIS_URL = get_env("REDIS_URL", "redis://redis:6379/0")
KAFKA_BOOTSTRAP = get_env("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
MIDDLEWARE_BRIDGE_URL = get_env("MIDDLEWARE_BRIDGE_URL", "http://middleware-bridge:8080")
FRAUD_SCORING_URL = get_env("FRAUD_SCORING_URL", "http://fraud-scoring:8100")
QDRANT_URL = get_env("QDRANT_URL", "http://qdrant:6333")
FALKORDB_HOST = get_env("FALKORDB_HOST", "falkordb")
FALKORDB_PORT = int(get_env("FALKORDB_PORT", "6379"))
OLLAMA_URL = get_env("OLLAMA_URL", "http://ollama:11434")
LOG_LEVEL = get_env("LOG_LEVEL", "INFO")
