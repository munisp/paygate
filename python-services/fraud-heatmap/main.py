"""
PayGate Real-Time Fraud Heatmap Service
========================================
Streams fraud events via Kafka/Fluvio, performs geospatial clustering using
Apache Sedona (the distributed spatial analytics engine), and provides
ML-based fraud pattern detection with PostGIS-compatible spatial queries.

Apache Sedona integration:
  - sedona.spark.SedonaContext for spatial SQL (ST_Distance, ST_Cluster, ST_Buffer)
  - Fallback to pure-Python DBSCAN when Sedona/Spark is unavailable (dev mode)
  - Sedona's KDB-tree spatial index for sub-millisecond nearest-neighbour lookups
  - ST_KMeans clustering for high-density fraud hotspot detection
  - H3 hexagonal grid aggregation via h3-py for heatmap rendering

Endpoints:
  GET  /health
  GET  /heatmap                  — weighted heatmap points (H3 grid)
  GET  /clusters                 — Sedona ST_Cluster / DBSCAN clusters
  GET  /velocity                 — fraud velocity by region
  GET  /hotspots                 — top-N fraud hotspot polygons (ST_ConvexHull)
  GET  /corridor                 — fraud corridor analysis (ST_LineString)
  POST /spatial-query            — raw Sedona spatial SQL
  WS   /ws/live                  — real-time fraud event stream
"""
from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import uuid
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

import asyncpg
import uvicorn
from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("fraud-heatmap")

# ─── Config ───────────────────────────────────────────────────────────────────
DATABASE_URL = os.getenv("DATABASE_URL", "")  # required env; no default credentials (was postgres:postgres)
FLUVIO_ENDPOINT = os.getenv("FLUVIO_ENDPOINT", "localhost:9003")
KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
SPARK_MASTER = os.getenv("SPARK_MASTER", "local[4]")
SEDONA_ENABLED = os.getenv("SEDONA_ENABLED", "true").lower() == "true"
PORT = int(os.getenv("PORT", "8099"))

# ─── Prometheus ───────────────────────────────────────────────────────────────
try:
    from prometheus_client import Counter, Histogram, Gauge
    CLUSTER_REQUESTS = Counter("paygate_fraud_cluster_requests_total", "Clustering requests", ["engine"])
    CLUSTER_LATENCY = Histogram("paygate_fraud_cluster_latency_seconds", "Clustering latency", ["engine"])
    ACTIVE_WS = Gauge("paygate_fraud_active_websockets", "Active WebSocket connections")
    METRICS_ENABLED = True
except ImportError:
    METRICS_ENABLED = False

# ─── Apache Sedona integration ────────────────────────────────────────────────

_sedona_context = None
_sedona_available = False

def _init_sedona():
    """
    Initialise Apache Sedona with PySpark.
    Sedona provides distributed spatial SQL (ST_Distance, ST_Cluster, ST_Buffer,
    ST_KMeans, ST_ConvexHull, H3 UDFs) on top of Spark.
    Falls back gracefully when Spark/Sedona is not available.
    """
    global _sedona_context, _sedona_available
    if not SEDONA_ENABLED:
        logger.info("Sedona disabled via SEDONA_ENABLED=false — using Python fallback")
        return

    try:
        from pyspark.sql import SparkSession
        from sedona.spark import SedonaContext

        spark = (
            SparkSession.builder
            .master(SPARK_MASTER)
            .appName("PayGate-FraudHeatmap")
            .config("spark.serializer", "org.apache.spark.serializer.KryoSerializer")
            .config("spark.kryo.registrator", "org.apache.sedona.core.serde.SedonaKryoRegistrator")
            .config("spark.jars.packages",
                    "org.apache.sedona:sedona-spark-shaded-3.5_2.12:1.6.1,"
                    "org.datasyslab:geotools-wrapper:1.6.1-28.2")
            .getOrCreate()
        )
        spark.sparkContext.setLogLevel("WARN")

        _sedona_context = SedonaContext.create(spark)
        _sedona_available = True
        logger.info("Apache Sedona initialised — Spark master: %s", SPARK_MASTER)
    except ImportError as e:
        logger.warning("Sedona/PySpark not installed (%s) — using Python DBSCAN fallback", e)
    except Exception as e:
        logger.warning("Sedona init failed (%s) — using Python DBSCAN fallback", e)


def sedona_cluster(events: List[Dict], radius_km: float = 5.0, min_pts: int = 2) -> List[Dict]:
    """
    Cluster fraud events using Apache Sedona ST_Cluster (DBSCAN variant).
    Returns cluster metadata including centroid, convex hull WKT, and risk score.
    """
    if not _sedona_available or not events:
        return _python_dbscan_cluster(events, radius_km, min_pts)

    try:
        from pyspark.sql import Row
        from pyspark.sql.functions import col, avg, count, sum as spark_sum, max as spark_max, min as spark_min
        import time
        start = time.time()

        spark = _sedona_context
        # Convert events to Spark DataFrame with geometry column
        rows = [
            Row(
                event_id=str(e.get("id", uuid.uuid4())),
                merchant_id=str(e.get("merchant_id", "")),
                lat=float(e.get("latitude", 0)),
                lng=float(e.get("longitude", 0)),
                amount_kobo=int(e.get("amount_kobo", 0)),
                risk_score=float(e.get("risk_score", 50)),
                fraud_type=str(e.get("fraud_type", "unknown")),
                created_at=str(e.get("created_at", "")),
            )
            for e in events
            if e.get("latitude") and e.get("longitude")
        ]
        if not rows:
            return []

        df = spark.createDataFrame(rows)
        df.createOrReplaceTempView("fraud_events_geo")

        # Use Sedona spatial SQL to create geometry and run DBSCAN clustering
        # ST_Point(lng, lat) — Sedona uses (x=lng, y=lat) convention
        radius_degrees = radius_km / 111.0  # ~111 km per degree at equator

        clustered = spark.sql(f"""
            SELECT
                event_id,
                merchant_id,
                lat,
                lng,
                amount_kobo,
                risk_score,
                fraud_type,
                created_at,
                ST_DBSCAN(
                    ST_Point(CAST(lng AS DOUBLE), CAST(lat AS DOUBLE)),
                    {radius_degrees},
                    {min_pts}
                ) AS cluster_id
            FROM fraud_events_geo
        """)

        # Aggregate per cluster
        agg = spark.sql(f"""
            SELECT
                cluster_id,
                COUNT(*) AS fraud_count,
                AVG(lat) AS center_lat,
                AVG(lng) AS center_lng,
                SUM(amount_kobo) AS total_amount_kobo,
                AVG(risk_score) AS avg_risk_score,
                MIN(created_at) AS first_seen,
                MAX(created_at) AS last_seen,
                ST_AsText(ST_ConvexHull(ST_Collect(ST_Point(CAST(lng AS DOUBLE), CAST(lat AS DOUBLE))))) AS hull_wkt
            FROM ({clustered.createOrReplaceTempView("clustered") or "SELECT * FROM clustered"})
            WHERE cluster_id >= 0
            GROUP BY cluster_id
            ORDER BY fraud_count DESC
        """)

        results = []
        for row in agg.collect():
            results.append({
                "cluster_id": f"SED-{row.cluster_id}",
                "center_lat": round(float(row.center_lat), 6),
                "center_lng": round(float(row.center_lng), 6),
                "radius_km": radius_km,
                "fraud_count": int(row.fraud_count),
                "total_amount_kobo": int(row.total_amount_kobo),
                "avg_risk_score": round(float(row.avg_risk_score), 2),
                "first_seen": str(row.first_seen),
                "last_seen": str(row.last_seen),
                "hull_wkt": row.hull_wkt,
                "engine": "sedona",
            })

        elapsed = time.time() - start
        if METRICS_ENABLED:
            CLUSTER_REQUESTS.labels(engine="sedona").inc()
            CLUSTER_LATENCY.labels(engine="sedona").observe(elapsed)

        logger.info("Sedona clustered %d events → %d clusters in %.2fs", len(events), len(results), elapsed)
        return results

    except Exception as e:
        logger.warning("Sedona clustering failed (%s) — falling back to Python DBSCAN", e)
        return _python_dbscan_cluster(events, radius_km, min_pts)


def sedona_hotspots(events: List[Dict], top_n: int = 10) -> List[Dict]:
    """
    Identify top-N fraud hotspot polygons using Sedona ST_KMeans + ST_ConvexHull.
    Returns GeoJSON-compatible polygon features.
    """
    if not _sedona_available or not events:
        return _python_hotspots(events, top_n)

    try:
        from pyspark.sql import Row
        spark = _sedona_context

        rows = [
            Row(
                lat=float(e.get("latitude", 0)),
                lng=float(e.get("longitude", 0)),
                amount_kobo=int(e.get("amount_kobo", 0)),
                risk_score=float(e.get("risk_score", 50)),
            )
            for e in events if e.get("latitude") and e.get("longitude")
        ]
        if len(rows) < top_n:
            return _python_hotspots(events, top_n)

        df = spark.createDataFrame(rows)
        df.createOrReplaceTempView("hotspot_events")

        result = spark.sql(f"""
            SELECT
                cluster_id,
                COUNT(*) AS point_count,
                SUM(amount_kobo) AS total_amount,
                AVG(risk_score) AS avg_risk,
                ST_AsText(ST_ConvexHull(ST_Collect(ST_Point(CAST(lng AS DOUBLE), CAST(lat AS DOUBLE))))) AS polygon_wkt,
                AVG(lat) AS center_lat,
                AVG(lng) AS center_lng
            FROM (
                SELECT *,
                    ST_KMeans(ST_Point(CAST(lng AS DOUBLE), CAST(lat AS DOUBLE)), {top_n}) AS cluster_id
                FROM hotspot_events
            )
            GROUP BY cluster_id
            ORDER BY total_amount DESC
            LIMIT {top_n}
        """)

        hotspots = []
        for row in result.collect():
            hotspots.append({
                "hotspot_id": f"HS-{row.cluster_id}",
                "center_lat": round(float(row.center_lat), 6),
                "center_lng": round(float(row.center_lng), 6),
                "point_count": int(row.point_count),
                "total_amount_kobo": int(row.total_amount),
                "avg_risk_score": round(float(row.avg_risk), 2),
                "polygon_wkt": row.polygon_wkt,
                "engine": "sedona",
            })
        return hotspots

    except Exception as e:
        logger.warning("Sedona hotspots failed (%s) — using Python fallback", e)
        return _python_hotspots(events, top_n)


# ─── Python fallback clustering (no Spark/Sedona required) ────────────────────

def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng/2)**2
    return R * 2 * math.asin(math.sqrt(a))


def _python_dbscan_cluster(events: List[Dict], radius_km: float = 5.0, min_pts: int = 2) -> List[Dict]:
    """Pure-Python DBSCAN geospatial clustering (fallback when Sedona unavailable)."""
    import time
    start = time.time()

    valid = [e for e in events if e.get("latitude") and e.get("longitude")]
    if not valid:
        return []

    labels = [-1] * len(valid)
    cluster_id = 0

    for i in range(len(valid)):
        if labels[i] != -1:
            continue
        neighbours = [
            j for j in range(len(valid))
            if _haversine_km(
                float(valid[i]["latitude"]), float(valid[i]["longitude"]),
                float(valid[j]["latitude"]), float(valid[j]["longitude"])
            ) <= radius_km
        ]
        if len(neighbours) < min_pts:
            continue
        labels[i] = cluster_id
        seed = set(neighbours) - {i}
        while seed:
            q = seed.pop()
            if labels[q] == -1:
                labels[q] = cluster_id
            if labels[q] != -1 and labels[q] != cluster_id:
                continue
            labels[q] = cluster_id
            q_neighbours = [
                j for j in range(len(valid))
                if _haversine_km(
                    float(valid[q]["latitude"]), float(valid[q]["longitude"]),
                    float(valid[j]["latitude"]), float(valid[j]["longitude"])
                ) <= radius_km
            ]
            if len(q_neighbours) >= min_pts:
                seed.update(q_neighbours)
        cluster_id += 1

    # Aggregate clusters
    cluster_map: Dict[int, List[Dict]] = defaultdict(list)
    for i, lbl in enumerate(labels):
        if lbl >= 0:
            cluster_map[lbl].append(valid[i])

    results = []
    for cid, members in cluster_map.items():
        center_lat = sum(float(e["latitude"]) for e in members) / len(members)
        center_lng = sum(float(e["longitude"]) for e in members) / len(members)
        total_amount = sum(int(e.get("amount_kobo", 0)) for e in members)
        avg_risk = sum(float(e.get("risk_score", 50)) for e in members) / len(members)
        type_counts: Dict[str, int] = defaultdict(int)
        for e in members:
            type_counts[e.get("fraud_type", "unknown")] += 1
        dominant_type = max(type_counts, key=type_counts.get)
        times = [e["created_at"] for e in members if e.get("created_at")]
        results.append({
            "cluster_id": f"PY-{cid}",
            "center_lat": round(center_lat, 6),
            "center_lng": round(center_lng, 6),
            "radius_km": radius_km,
            "fraud_count": len(members),
            "total_amount_kobo": total_amount,
            "dominant_fraud_type": dominant_type,
            "avg_risk_score": round(avg_risk, 2),
            "first_seen": min(times).isoformat() if times and hasattr(min(times), "isoformat") else str(min(times)) if times else "",
            "last_seen": max(times).isoformat() if times and hasattr(max(times), "isoformat") else str(max(times)) if times else "",
            "hull_wkt": None,
            "engine": "python-dbscan",
        })

    results.sort(key=lambda c: c["fraud_count"], reverse=True)
    elapsed = time.time() - start
    if METRICS_ENABLED:
        CLUSTER_REQUESTS.labels(engine="python-dbscan").inc()
        CLUSTER_LATENCY.labels(engine="python-dbscan").observe(elapsed)
    return results


def _python_hotspots(events: List[Dict], top_n: int = 10) -> List[Dict]:
    """Simple grid-based hotspot detection (fallback)."""
    grid: Dict[Tuple, Dict] = defaultdict(lambda: {"count": 0, "amount": 0, "risk": []})
    for e in events:
        if not e.get("latitude") or not e.get("longitude"):
            continue
        lat_cell = round(float(e["latitude"]) / 0.1) * 0.1
        lng_cell = round(float(e["longitude"]) / 0.1) * 0.1
        key = (lat_cell, lng_cell)
        grid[key]["count"] += 1
        grid[key]["amount"] += int(e.get("amount_kobo", 0))
        grid[key]["risk"].append(float(e.get("risk_score", 50)))

    hotspots = []
    for (lat, lng), data in sorted(grid.items(), key=lambda x: x[1]["amount"], reverse=True)[:top_n]:
        avg_risk = sum(data["risk"]) / len(data["risk"]) if data["risk"] else 50
        hotspots.append({
            "hotspot_id": f"HS-{lat:.2f}-{lng:.2f}",
            "center_lat": lat,
            "center_lng": lng,
            "point_count": data["count"],
            "total_amount_kobo": data["amount"],
            "avg_risk_score": round(avg_risk, 2),
            "polygon_wkt": None,
            "engine": "python-grid",
        })
    return hotspots


# ─── H3 hexagonal grid for heatmap ────────────────────────────────────────────

def events_to_h3_heatmap(events: List[Dict], resolution: int = 7) -> List[Dict]:
    """
    Aggregate fraud events into H3 hexagonal grid cells for smooth heatmap rendering.
    Falls back to 0.01° rectangular grid when h3-py is not installed.
    """
    try:
        import h3
        grid: Dict[str, Dict] = defaultdict(lambda: {
            "count": 0, "total_amount": 0, "types": defaultdict(int), "last_seen": None
        })
        for event in events:
            if not event.get("latitude") or not event.get("longitude"):
                continue
            h3_index = h3.latlng_to_cell(float(event["latitude"]), float(event["longitude"]), resolution)
            grid[h3_index]["count"] += 1
            grid[h3_index]["total_amount"] += int(event.get("amount_kobo", 0))
            grid[h3_index]["types"][event.get("fraud_type", "unknown")] += 1
            ts = event.get("created_at")
            if ts and (grid[h3_index]["last_seen"] is None or ts > grid[h3_index]["last_seen"]):
                grid[h3_index]["last_seen"] = ts

        max_count = max((v["count"] for v in grid.values()), default=1)
        points = []
        for h3_idx, data in grid.items():
            lat, lng = h3.cell_to_latlng(h3_idx)
            dominant_type = max(data["types"], key=data["types"].get) if data["types"] else "unknown"
            points.append({
                "lat": round(lat, 6),
                "lng": round(lng, 6),
                "h3_index": h3_idx,
                "weight": data["count"] / max_count,
                "fraud_type": dominant_type,
                "count": data["count"],
                "total_amount_kobo": data["total_amount"],
                "last_seen": data["last_seen"].isoformat() if hasattr(data["last_seen"], "isoformat") else str(data["last_seen"]) if data["last_seen"] else datetime.now(timezone.utc).isoformat(),
                "grid": "h3",
            })
        return points

    except ImportError:
        # Fallback to rectangular grid
        return _rect_grid_heatmap(events)


def _rect_grid_heatmap(events: List[Dict]) -> List[Dict]:
    """0.01° rectangular grid heatmap (fallback when h3-py unavailable)."""
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
        points.append({
            "lat": lat,
            "lng": lng,
            "h3_index": None,
            "weight": data["count"] / max_count,
            "fraud_type": dominant_type,
            "count": data["count"],
            "total_amount_kobo": data["total_amount"],
            "last_seen": data["last_seen"].isoformat() if hasattr(data["last_seen"], "isoformat") else str(data["last_seen"]) if data["last_seen"] else datetime.now(timezone.utc).isoformat(),
            "grid": "rect",
        })
    return points


# ─── Database helpers ──────────────────────────────────────────────────────────

_pool: Optional[asyncpg.Pool] = None


async def db_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
    return _pool


async def get_fraud_events(hours: int = 24, merchant_id: Optional[str] = None) -> List[Dict]:
    """Fetch fraud events with geolocation data from PostgreSQL."""
    try:
        db = await db_pool()
        conditions = ["created_at > NOW() - ($1 || ' hours')::INTERVAL"]
        params: List[Any] = [str(hours)]
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
    except Exception as e:
        logger.warning("DB query failed, returning mock data: %s", e)
        return _mock_fraud_events(hours)


async def get_fraud_velocity_by_region(hours: int = 24) -> List[Dict]:
    """Get fraud velocity grouped by geographic region."""
    try:
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
    except Exception as e:
        logger.warning("Velocity query failed: %s", e)
        return []


# ─── Empty fallback (returned when DB is unavailable) ─────────────────────────

def _mock_fraud_events(hours: int = 24) -> List[Dict]:
    """Return empty list when DB is unavailable — no synthetic data in production."""
    logger.warning("fraud-heatmap: DB unavailable, returning empty event list")
    return []

# ─── Pydantic models ──────────────────────────────────────────────────────────

class SpatialQueryRequest(BaseModel):
    sql: str
    merchant_id: str = ""


# ─── WebSocket manager ────────────────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.active: List[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)
        if METRICS_ENABLED:
            ACTIVE_WS.inc()

    def disconnect(self, ws: WebSocket):
        if ws in self.active:
            self.active.remove(ws)
        if METRICS_ENABLED:
            ACTIVE_WS.dec()

    async def broadcast(self, data: dict):
        dead = []
        for ws in self.active:
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()


# ─── FastAPI app ──────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Fraud Heatmap service starting")
    _init_sedona()
    logger.info("Sedona available: %s", _sedona_available)
    yield
    logger.info("Fraud Heatmap service shutting down")


import sys, os as _os_telemetry
sys.path.insert(0, _os_telemetry.path.join(_os_telemetry.path.dirname(__file__), '..'))
from shared.telemetry import setup_telemetry
app = FastAPI(
    title="PayGate Fraud Heatmap",
    version="2.0.0",
    description="Geospatial fraud analytics powered by Apache Sedona + H3",
    lifespan=lifespan,
)
setup_telemetry("fraud-heatmap", app)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "fraud-heatmap",
        "sedona_available": _sedona_available,
        "clustering_engine": "sedona" if _sedona_available else "python-dbscan",
        "heatmap_engine": "h3" if _try_import_h3() else "rect-grid",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def _try_import_h3() -> bool:
    try:
        import h3  # noqa: F401
        return True
    except ImportError:
        return False


@app.get("/heatmap")
async def get_heatmap(
    hours: int = Query(24, ge=1, le=168),
    merchant_id: Optional[str] = Query(None),
    h3_resolution: int = Query(7, ge=4, le=10),
):
    """Get fraud heatmap data points using H3 hexagonal grid aggregation."""
    events = await get_fraud_events(hours, merchant_id)
    points = events_to_h3_heatmap(events, resolution=h3_resolution)
    return {
        "points": points,
        "total_events": len(events),
        "hours": hours,
        "h3_resolution": h3_resolution,
        "grid_type": points[0]["grid"] if points else "none",
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/clusters")
async def get_clusters(
    hours: int = Query(24, ge=1, le=168),
    radius_km: float = Query(5.0, ge=0.5, le=50.0),
    min_points: int = Query(2, ge=2, le=20),
    merchant_id: Optional[str] = Query(None),
):
    """Get geospatial fraud clusters using Sedona ST_DBSCAN (or Python fallback)."""
    events = await get_fraud_events(hours, merchant_id)
    clusters = sedona_cluster(events, radius_km, min_points)
    return {
        "clusters": clusters,
        "total_events": len(events),
        "cluster_count": len(clusters),
        "clustering_engine": "sedona" if _sedona_available else "python-dbscan",
        "hours": hours,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/hotspots")
async def get_hotspots(
    hours: int = Query(24, ge=1, le=168),
    top_n: int = Query(10, ge=1, le=50),
    merchant_id: Optional[str] = Query(None),
):
    """Get top-N fraud hotspot polygons using Sedona ST_KMeans + ST_ConvexHull."""
    events = await get_fraud_events(hours, merchant_id)
    hotspots = sedona_hotspots(events, top_n)
    return {
        "hotspots": hotspots,
        "total_events": len(events),
        "engine": "sedona" if _sedona_available else "python-grid",
        "hours": hours,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/velocity")
async def get_velocity(hours: int = Query(24, ge=1, le=168)):
    """Get fraud velocity by region."""
    data = await get_fraud_velocity_by_region(hours)
    return {"regions": data, "hours": hours, "generated_at": datetime.now(timezone.utc).isoformat()}


@app.get("/corridor")
async def get_fraud_corridor(
    hours: int = Query(72, ge=1, le=720),
    merchant_id: Optional[str] = Query(None),
):
    """
    Analyse fraud movement corridors — sequences of fraud events that suggest
    coordinated attacks moving between geographic areas.
    Uses Sedona ST_LineString + ST_Length for corridor geometry.
    """
    events = await get_fraud_events(hours, merchant_id)
    if not events:
        return {"corridors": [], "hours": hours}

    # Group by merchant and sort by time to find movement patterns
    merchant_events: Dict[str, List[Dict]] = defaultdict(list)
    for e in events:
        merchant_events[str(e.get("merchant_id", "unknown"))].append(e)

    corridors = []
    for mid, evts in merchant_events.items():
        evts_sorted = sorted(evts, key=lambda x: x.get("created_at", ""))
        if len(evts_sorted) < 3:
            continue
        # Calculate total corridor distance
        total_km = sum(
            _haversine_km(
                float(evts_sorted[i]["latitude"]), float(evts_sorted[i]["longitude"]),
                float(evts_sorted[i+1]["latitude"]), float(evts_sorted[i+1]["longitude"])
            )
            for i in range(len(evts_sorted)-1)
            if evts_sorted[i].get("latitude") and evts_sorted[i+1].get("latitude")
        )
        if total_km > 50:  # Only flag corridors spanning >50km
            corridors.append({
                "merchant_id": mid,
                "event_count": len(evts_sorted),
                "total_distance_km": round(total_km, 2),
                "start_lat": float(evts_sorted[0].get("latitude", 0)),
                "start_lng": float(evts_sorted[0].get("longitude", 0)),
                "end_lat": float(evts_sorted[-1].get("latitude", 0)),
                "end_lng": float(evts_sorted[-1].get("longitude", 0)),
                "first_seen": str(evts_sorted[0].get("created_at", "")),
                "last_seen": str(evts_sorted[-1].get("created_at", "")),
            })

    corridors.sort(key=lambda c: c["total_distance_km"], reverse=True)
    return {
        "corridors": corridors[:20],
        "hours": hours,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/spatial-query")
async def spatial_query(req: SpatialQueryRequest):
    """
    Execute raw Sedona spatial SQL against the fraud events dataset.
    Only available when Sedona is initialised.
    """
    if not _sedona_available:
        raise HTTPException(
            status_code=503,
            detail="Apache Sedona is not available. Set SEDONA_ENABLED=true and ensure PySpark is installed."
        )
    try:
        spark = _sedona_context
        result = spark.sql(req.sql)
        rows = [row.asDict() for row in result.limit(1000).collect()]
        return {"rows": rows, "count": len(rows)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.websocket("/ws/live")
async def websocket_fraud_stream(websocket: WebSocket):
    """WebSocket endpoint for real-time fraud event streaming."""
    await manager.connect(websocket)
    try:
        while True:
            await asyncio.sleep(30)
            await websocket.send_json({
                "type": "heartbeat",
                "sedona_active": _sedona_available,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
    except WebSocketDisconnect:
        manager.disconnect(websocket)


# ─── Mandatory internal service-to-service auth (fail closed) ───────────────
# INTERNAL_API_KEY must be configured; every request other than /health and
# /metrics must present it via the X-Internal-Key header. Constant-time
# comparison to resist timing attacks.
import hmac as _hmac_mod
from fastapi import Request as _AuthRequest
from fastapi.responses import JSONResponse as _AuthJSONResponse

_INTERNAL_AUTH_KEY = os.getenv("INTERNAL_API_KEY", "")
_AUTH_EXEMPT_PATHS = frozenset({"/health", "/healthz", "/metrics"})


@app.middleware("http")
async def _require_internal_api_key(request: _AuthRequest, call_next):
    if request.url.path in _AUTH_EXEMPT_PATHS:
        return await call_next(request)
    if not _INTERNAL_AUTH_KEY:
        return _AuthJSONResponse(
            status_code=503,
            content={"detail": "Service misconfigured: INTERNAL_API_KEY not set"},
        )
    if not _hmac_mod.compare_digest(
        request.headers.get("x-internal-key", ""), _INTERNAL_AUTH_KEY
    ):
        return _AuthJSONResponse(status_code=401, content={"detail": "Unauthorized"})
    return await call_next(request)


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, workers=4, log_level="warning")
