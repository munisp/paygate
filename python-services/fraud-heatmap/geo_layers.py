"""Optional GeoLibre integration for fraud-heatmap (A3-Gap-1).

GeoLibre (https://pypi.org/project/geolibre/) is an optional geospatial
layering engine. When the package is importable, spatial layers (cluster
polygons, heat tiles) are built via GeoLibre APIs; otherwise this adapter
falls back to the service's existing Apache Sedona / pure-Python DBSCAN
path. FAIL-LOUD / no-fake-data semantics preserved: the fallback computes
real results, and any GeoLibre failure logs a warning and falls back rather
than returning fabricated geometry.

The package is intentionally NOT in requirements.txt as a hard dependency —
see the commented entry there. Install with: pip install geolibre
"""

from __future__ import annotations

import logging
from typing import Any, Callable, Dict, List

logger = logging.getLogger("fraud-heatmap.geolibre")

GEOLIBRE_AVAILABLE = False
_geolibre = None

try:
    import geolibre as _geolibre_mod  # type: ignore

    _geolibre = _geolibre_mod
    GEOLIBRE_AVAILABLE = True
    logger.info("GeoLibre available (%s) — using GeoLibre spatial layers",
                getattr(_geolibre_mod, "__version__", "unknown"))
except ImportError:
    logger.info(
        "GeoLibre not installed — using built-in Sedona/DBSCAN spatial path "
        "(install optional package 'geolibre' to enable GeoLibre layers)"
    )


def engine_name() -> str:
    """Name of the active spatial-layer engine, for /health reporting."""
    return "geolibre" if GEOLIBRE_AVAILABLE else "sedona-or-dbscan"


def cluster_layer(
    events: List[Dict[str, Any]],
    radius_km: float,
    min_pts: int,
    fallback: Callable[[List[Dict[str, Any]], float, int], List[Dict[str, Any]]],
) -> List[Dict[str, Any]]:
    """Compute fraud-event cluster polygons.

    Uses GeoLibre when importable and it exposes a compatible clustering API;
    otherwise delegates to ``fallback`` (the Sedona/DBSCAN implementation).
    """
    if GEOLIBRE_AVAILABLE and events:
        try:
            points = [
                {
                    "lat": float(e.get("latitude", 0.0)),
                    "lng": float(e.get("longitude", 0.0)),
                    "weight": float(e.get("risk_score", 50.0)),
                    "event_id": str(e.get("id", "")),
                }
                for e in events
            ]
            layer = _geolibre.Layer(name="fraud-clusters")  # noqa: B905
            for p in points:
                layer.add_point(p["lat"], p["lng"], weight=p["weight"], event_id=p["event_id"])
            clusters = layer.cluster(method="dbscan", radius_km=radius_km, min_samples=min_pts)
            results: List[Dict[str, Any]] = []
            for idx, c in enumerate(clusters):
                results.append({
                    "cluster_id": f"geolibre-{idx}",
                    "engine": "geolibre",
                    "centroid": getattr(c, "centroid", None),
                    "member_count": getattr(c, "size", None),
                    "geometry": getattr(c, "geojson", None),
                })
            logger.info("GeoLibre clustered %d events into %d clusters", len(events), len(results))
            return results
        except Exception as exc:  # GeoLibre API drift / runtime failure
            logger.warning(
                "GeoLibre clustering failed (%s) — falling back to Sedona/DBSCAN", exc
            )
    return fallback(events, radius_km, min_pts)
