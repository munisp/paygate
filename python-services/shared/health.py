"""
PayGate Shared Health Router
Standard /health endpoint for all Python microservices.
"""
from fastapi import APIRouter
from datetime import datetime, timezone
import platform

health_router = APIRouter()

@health_router.get("/health")
async def health_check():
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "python": platform.python_version(),
    }

@health_router.get("/ready")
async def readiness_check():
    return {"ready": True}
