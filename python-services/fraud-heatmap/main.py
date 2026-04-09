"""
PayGate Real-Time Fraud Heatmap Service
Streams fraud events via Fluvio, clusters geospatial fraud data,
and provides ML-based fraud pattern detection.
"""
import asyncio
import json
import logging
import os
import uuid
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Tuple

import asyncpg
from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("fraud-heatmap")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/paygate")
FLUVIO_ENDPOINT = os.getenv("FLUVIO_ENDPOINT", "localhost:9003")
KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
PORT = int(os.getenv("PORT", "8099"))

# ─── Models ────────────────────────────────────────────────────────────────────

class FraudHeatmapPoint(BaseModel):
    lat: float
    lng: float
    weight: float
    fraud_type: str
    count: int
    total_amount_kobo: int
    last_seen: str


class FraudCluster(BaseModel):
    cluster_id: str
    center_lat: float
    center_lng: float
    radius_km: float
    fraud_count: int
    total_amount_kobo: int
    dominant_fraud_type: str
    risk_score: float
    first_seen: str
    last_seen: str


# ─── Database helpers ──────────────────────────────────────────────────────────

_pool: Optional[asyncpg.Pool] = None


async def db_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
    return _pool


async def get_fraud_events(hours: int = 24, merchant_id: Optional[str] = None) -> List[Dict]:
    """Fetch fraud events with geolocation data."""
    db = await db_pool()
    conditions = ["created_at > NOW() - ($1 || ' hours')::INTERVAL"]
    params = [str(hours)]
    i = 2

    if merchant_id:
        conditions.append(f"merchant_id = ${i}")
        params.append(merchant_id)
        i += 1

    where = " AND ".join(conditions)
    rows = await db.fetch(
        f"""
        SELECT
            id, merchant_id, transaction_id, fraud_type,
            amount_kobo, latitude, longitude, city, state,
            risk_score, status, created_at
        FROM fraud_events
        WHERE {where} AND latitude IS NOT NULL AND longitude IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 5000
        """,
        *params,
    )
    return [dict(r) for r in rows]


async def get_fraud_velocity_by_region(hours: int = 24) -> List[Dict]:
    """Get fraud velocity grouped by geographic region."""
    db = await db_pool()
    rows = await db.fetch(
        """
        SELECT
            state,
            city,
            fraud_type,
            COUNT(*) AS fraud_count,
            SUM(amount_kobo) AS total_amount_kobo,
            AVG(risk_score) AS avg_risk_score,
            MAX(created_at) AS last_seen,
            MIN(created_at) AS first_seen
        FROM fraud_events
        WHERE created_at > NOW() - ($1 || ' hours')::INTERVAL
          AND status IN ('confirmed', 'suspected')
        GROUP BY state, city, fraud_type
        ORDER BY fraud_count DESC
        LIMIT 200
        """,
        str(hours),
    )
    return [dict(r) for r in rows]


# ─── Geospatial clustering ─────────────────────────────────────────────────────

def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate distance between two coordinates in km."""
    import math
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng/2)**2
    return R * 2 * math.asin(math.sqrt(a))


def cluster_fraud_events(events: List[Dict], radius_km: float = 5.0) -> List[FraudCluster]:
    """Simple DBSCAN-like clustering of fraud events by geolocation."""
    if not events:
        return []

    clusters: List[FraudCluster] = []
    assigned = set()

    for i, event in enumerate(events):
        if i in assigned:
            continue
        if not event.get("latitude") or not event.get("longitude"):
            continue

        # Find all events within radius
        cluster_events = [event]
        assigned.add(i)

        for j, other in enumerate(events):
            if j in assigned or j == i:
                continue
            if not other.get("latitude") or not other.get("longitude"):
                continue
            dist = haversine_km(
                float(event["latitude"]), float(event["longitude"]),
                float(other["latitude"]), float(other["longitude"])
            )
            if dist <= radius_km:
                cluster_events.append(other)
                assigned.add(j)

        if len(cluster_events) < 2:
            continue  # Skip noise points

        # Compute cluster centroid
        center_lat = sum(float(e["latitude"]) for e in cluster_events) / len(cluster_events)
        center_lng = sum(float(e["longitude"]) for e in cluster_events) / len(cluster_events)
        total_amount = sum(int(e.get("amount_kobo", 0)) for e in cluster_events)
        avg_risk = sum(float(e.get("risk_score", 50)) for e in cluster_events) / len(cluster_events)

        # Dominant fraud type
        type_counts: Dict[str, int] = defaultdict(int)
        for e in cluster_events:
            type_counts[e.get("fraud_type", "unknown")] += 1
        dominant_type = max(type_counts, key=type_counts.get)

        # Time range
        times = [e["created_at"] for e in cluster_events if e.get("created_at")]
        first_seen = min(times).isoformat() if times else datetime.now(timezone.utc).isoformat()
        last_seen = max(times).isoformat() if times else datetime.now(timezone.utc).isoformat()

        clusters.append(FraudCluster(
            cluster_id=str(uuid.uuid4()),
            center_lat=round(center_lat, 6),
            center_lng=round(center_lng, 6),
            radius_km=radius_km,
            fraud_count=len(cluster_events),
            total_amount_kobo=total_amount,
            dominant_fraud_type=dominant_type,
            risk_score=round(avg_risk, 2),
            first_seen=first_seen,
            last_seen=last_seen,
        ))

    # Sort by fraud count descending
    clusters.sort(key=lambda c: c.fraud_count, reverse=True)
    return clusters


def events_to_heatmap_points(events: List[Dict]) -> List[FraudHeatmapPoint]:
    """Convert raw fraud events to heatmap weight points."""
    # Group by ~0.01 degree grid cells
    grid: Dict[Tuple, Dict] = defaultdict(lambda: {
        "count": 0, "total_amount": 0, "types": defaultdict(int), "last_seen": None
    })

    for event in events:
        if not event.get("latitude") or not event.get("longitude"):
            continue
        lat_cell = round(float(event["latitude"]) / 0.01) * 0.01
        lng_cell = round(float(event["longitude"]) / 0.01) * 0.01
        key = (lat_cell, lng_cell)
        grid[key]["count"] += 1
        grid[key]["total_amount"] += int(event.get("amount_kobo", 0))
        grid[key]["types"][event.get("fraud_type", "unknown")] += 1
        ts = event.get("created_at")
        if ts and (grid[key]["last_seen"] is None or ts > grid[key]["last_seen"]):
            grid[key]["last_seen"] = ts

    max_count = max((v["count"] for v in grid.values()), default=1)
    points = []
    for (lat, lng), data in grid.items():
        dominant_type = max(data["types"], key=data["types"].get) if data["types"] else "unknown"
        points.append(FraudHeatmapPoint(
            lat=lat,
            lng=lng,
            weight=data["count"] / max_count,
            fraud_type=dominant_type,
            count=data["count"],
            total_amount_kobo=data["total_amount"],
            last_seen=data["last_seen"].isoformat() if data["last_seen"] else datetime.now(timezone.utc).isoformat(),
        ))
    return points


# ─── WebSocket manager for real-time streaming ────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.active: List[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        self.active.remove(ws)

    async def broadcast(self, data: dict):
        dead = []
        for ws in self.active:
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.active.remove(ws)


manager = ConnectionManager()


# ─── FastAPI app ───────────────────────────────────────────────────────────────

app = FastAPI(title="PayGate Fraud Heatmap", version="1.0.0")


@app.get("/heatmap")
async def get_heatmap(
    hours: int = Query(24, ge=1, le=168),
    merchant_id: Optional[str] = Query(None),
):
    """Get fraud heatmap data points for map visualization."""
    events = await get_fraud_events(hours, merchant_id)
    points = events_to_heatmap_points(events)
    return {
        "points": [p.dict() for p in points],
        "total_events": len(events),
        "hours": hours,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/clusters")
async def get_clusters(
    hours: int = Query(24, ge=1, le=168),
    radius_km: float = Query(5.0, ge=0.5, le=50.0),
    merchant_id: Optional[str] = Query(None),
):
    """Get geospatial fraud clusters."""
    events = await get_fraud_events(hours, merchant_id)
    clusters = cluster_fraud_events(events, radius_km)
    return {
        "clusters": [c.dict() for c in clusters],
        "total_events": len(events),
        "cluster_count": len(clusters),
        "hours": hours,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/velocity")
async def get_velocity(hours: int = Query(24, ge=1, le=168)):
    """Get fraud velocity by region."""
    data = await get_fraud_velocity_by_region(hours)
    return {"regions": data, "hours": hours, "generated_at": datetime.now(timezone.utc).isoformat()}


@app.websocket("/ws/live")
async def websocket_fraud_stream(websocket: WebSocket):
    """WebSocket endpoint for real-time fraud event streaming."""
    await manager.connect(websocket)
    try:
        while True:
            # Send heartbeat every 30s
            await asyncio.sleep(30)
            await websocket.send_json({"type": "heartbeat", "timestamp": datetime.now(timezone.utc).isoformat()})
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "fraud-heatmap", "timestamp": datetime.now(timezone.utc).isoformat()}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")
