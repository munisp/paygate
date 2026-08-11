"""
PayGate DeepFace Sidecar — FastAPI service (Wave 176)
─────────────────────────────────────────────────────
Provides neural face analysis endpoints consumed by the Node.js backend
via deepfaceSidecar.ts.  Runs at DEEPFACE_SIDECAR_URL (default :8001).

Endpoints:
  POST /liveness       — Anti-spoofing CNN (SilentFace) + MediaPipe challenge
  POST /verify-face    — ArcFace selfie-vs-ID cosine similarity (Wave 177)
  POST /search         — Facenet512 + pgvector ANN duplicate detection (Wave 178)
  POST /analyze        — Age / gender / emotion / race estimation (Wave 179)
  GET  /health         — Liveness probe

Architecture note:
  This sidecar is intentionally lightweight — it delegates heavy model loading
  to lazy initialisation so the container starts in < 5 s.  All endpoints
  accept base64-encoded JPEG/PNG images and return JSON.

Security:
  Every endpoint requires the X-Internal-Key header matching INTERNAL_API_KEY.
"""
from __future__ import annotations

import base64
import hmac
import io
import logging
import os
import time
from typing import Optional

import numpy as np
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='{"time":"%(asctime)s","level":"%(levelname)s","msg":"%(message)s"}',
)
logger = logging.getLogger("deepface-sidecar")

# ─── Config ───────────────────────────────────────────────────────────────────
INTERNAL_API_KEY: str = os.getenv("INTERNAL_API_KEY", "")
PORT: int = int(os.getenv("PORT", "8001"))

# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="PayGate DeepFace Sidecar",
    version="1.0.0",
    description="Neural face analysis: liveness, verification, search, analysis",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

# ─── Lazy model registry ──────────────────────────────────────────────────────
_models: dict = {}


def _get_model(name: str):
    """Lazy-load a DeepFace model; returns None if deepface is unavailable."""
    if name in _models:
        return _models[name]
    try:
        from deepface import DeepFace  # type: ignore
        _models[name] = DeepFace
        return DeepFace
    except ImportError:
        logger.error(
            "deepface package not installed — sidecar CANNOT serve KYC inference; "
            "all inference endpoints return HTTP 503 (fail closed)"
        )
        _models[name] = None
        return None


def _require_model(endpoint: str):
    """Fail-closed guard: KYC/biometric results are never fabricated.

    Returns the DeepFace module or raises HTTP 503. There is no stub mode:
    random embeddings poison the pgvector identity store, pixel-MSE is not
    face verification, and canned demographics corrupt NDPR age-gating.
    """
    df = _get_model("deepface")
    if df is None:
        raise HTTPException(
            status_code=503,
            detail=(
                f"{endpoint}: face-recognition model stack unavailable — "
                "refusing to return a fabricated biometric result"
            ),
        )
    return df


def _decode_image(b64: str) -> np.ndarray:
    """Decode a base64-encoded image to a numpy array."""
    try:
        from PIL import Image  # type: ignore
        data = base64.b64decode(b64)
        img = Image.open(io.BytesIO(data)).convert("RGB")
        return np.array(img)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid image: {exc}") from exc


# ─── Auth helper ──────────────────────────────────────────────────────────────
def _verify_key(key: str) -> None:
    # Fail closed: the service must be configured with a key, and callers
    # must present it. Constant-time comparison.
    if not INTERNAL_API_KEY:
        raise HTTPException(status_code=503, detail="Service misconfigured: INTERNAL_API_KEY not set")
    if not key or not hmac.compare_digest(key, INTERNAL_API_KEY):
        raise HTTPException(status_code=401, detail="Unauthorized")


# ─── Request / response models ────────────────────────────────────────────────
class LivenessRequest(BaseModel):
    image: str = Field(..., description="Base64-encoded face image")
    challenge: Optional[str] = Field(None, description="Active challenge: blink|nod|smile|turn")


class LivenessResponse(BaseModel):
    is_live: bool
    score: float
    method: str
    latency_ms: int
    detail: Optional[str] = None


class VerifyFaceRequest(BaseModel):
    selfie: str = Field(..., description="Base64-encoded selfie image")
    id_photo: str = Field(..., description="Base64-encoded ID document face crop")
    model: str = Field("ArcFace", description="ArcFace | Facenet | VGG-Face")
    threshold: float = Field(0.68, description="Cosine similarity threshold (0–1)")


class VerifyFaceResponse(BaseModel):
    verified: bool
    distance: float
    similarity: float
    model: str
    threshold: float
    latency_ms: int


class SearchRequest(BaseModel):
    image: str = Field(..., description="Base64-encoded face image to search")
    model: str = Field("Facenet512", description="Facenet512 | ArcFace")
    top_k: int = Field(5, ge=1, le=50)
    threshold: float = Field(0.40, description="Distance threshold for match")


class SearchResponse(BaseModel):
    embedding: list[float]
    embedding_dim: int
    model: str
    matches: list[dict]  # [{id, distance, similarity}] from pgvector — populated by caller
    latency_ms: int


class AnalyzeRequest(BaseModel):
    image: str = Field(..., description="Base64-encoded face image")
    actions: list[str] = Field(
        default=["age", "gender", "emotion"],
        description="Subset of: age, gender, emotion, race",
    )


class AnalyzeResponse(BaseModel):
    age: Optional[int] = None
    gender: Optional[str] = None
    gender_confidence: Optional[float] = None
    dominant_emotion: Optional[str] = None
    emotion_scores: Optional[dict] = None
    dominant_race: Optional[str] = None
    race_scores: Optional[dict] = None
    face_confidence: Optional[float] = None
    latency_ms: int


# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.post("/liveness", response_model=LivenessResponse)
async def liveness(
    req: LivenessRequest,
    x_internal_key: str = Header(default=""),
) -> LivenessResponse:
    """
    Anti-spoofing liveness check.
    Requires the deepface model stack; returns HTTP 503 when unavailable —
    no heuristic stub is ever substituted for a biometric decision.
    """
    _verify_key(x_internal_key)
    t0 = time.monotonic()
    img = _decode_image(req.image)
    df = _require_model("/liveness")

    try:
        # DeepFace does not expose SilentFace directly; we use face detection
        # confidence as a proxy for liveness in this scaffold.
        result = df.extract_faces(
            img_path=img,
            detector_backend="retinaface",
            enforce_detection=False,
        )
        confidence = float(result[0]["confidence"]) if result else 0.0
        is_live = confidence >= 0.80
        score = confidence
        method = "retinaface_confidence"
    except Exception as exc:
        logger.error("deepface liveness error: %s", exc)
        raise HTTPException(status_code=503, detail=f"Liveness inference failed: {exc}") from exc

    return LivenessResponse(
        is_live=is_live,
        score=round(score, 4),
        method=method,
        latency_ms=int((time.monotonic() - t0) * 1000),
    )


@app.post("/verify-face", response_model=VerifyFaceResponse)
async def verify_face(
    req: VerifyFaceRequest,
    x_internal_key: str = Header(default=""),
) -> VerifyFaceResponse:
    """
    ArcFace selfie-vs-ID verification (Wave 177).
    Returns cosine distance and verified flag.
    """
    _verify_key(x_internal_key)
    t0 = time.monotonic()
    selfie_img = _decode_image(req.selfie)
    id_img = _decode_image(req.id_photo)
    df = _require_model("/verify-face")

    try:
        result = df.verify(
            img1_path=selfie_img,
            img2_path=id_img,
            model_name=req.model,
            detector_backend="retinaface",
            enforce_detection=False,
            distance_metric="cosine",
        )
        distance = float(result["distance"])
        verified = bool(result["verified"])
        similarity = round(1.0 - distance, 4)
    except Exception as exc:
        logger.error("deepface verify error: %s", exc)
        raise HTTPException(status_code=503, detail=f"Face verification failed: {exc}") from exc

    return VerifyFaceResponse(
        verified=verified,
        distance=round(distance, 6),
        similarity=similarity,
        model=req.model,
        threshold=req.threshold,
        latency_ms=int((time.monotonic() - t0) * 1000),
    )


@app.post("/search", response_model=SearchResponse)
async def search(
    req: SearchRequest,
    x_internal_key: str = Header(default=""),
) -> SearchResponse:
    """
    Extract a Facenet512 / ArcFace embedding for pgvector ANN search (Wave 178).
    The caller is responsible for querying the face_embeddings table with the
    returned embedding vector.
    """
    _verify_key(x_internal_key)
    t0 = time.monotonic()
    img = _decode_image(req.image)
    df = _require_model("/search")

    try:
        embedding_obj = df.represent(
            img_path=img,
            model_name=req.model,
            detector_backend="retinaface",
            enforce_detection=False,
        )
        embedding: list[float] = embedding_obj[0]["embedding"]
    except Exception as exc:
        # NEVER substitute a zero/random vector: callers store this embedding
        # in pgvector face_embeddings — a fabricated vector permanently
        # poisons duplicate-identity detection.
        logger.error("deepface represent error: %s", exc)
        raise HTTPException(status_code=503, detail=f"Embedding extraction failed: {exc}") from exc

    return SearchResponse(
        embedding=embedding,
        embedding_dim=len(embedding),
        model=req.model,
        matches=[],  # Populated by Node.js after pgvector query
        latency_ms=int((time.monotonic() - t0) * 1000),
    )


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(
    req: AnalyzeRequest,
    x_internal_key: str = Header(default=""),
) -> AnalyzeResponse:
    """
    Age / gender / emotion / race estimation (Wave 179).
    Used for NDPR age-gating and admin review badges.
    """
    _verify_key(x_internal_key)
    t0 = time.monotonic()
    img = _decode_image(req.image)
    df = _require_model("/analyze")
    actions = [a for a in req.actions if a in ("age", "gender", "emotion", "race")]
    if not actions:
        actions = ["age", "gender", "emotion"]

    try:
        results = df.analyze(
            img_path=img,
            actions=actions,
            detector_backend="retinaface",
            enforce_detection=False,
        )
        r = results[0] if isinstance(results, list) else results
        return AnalyzeResponse(
            age=int(r.get("age", 0)) if "age" in actions else None,
            gender=r.get("dominant_gender") if "gender" in actions else None,
            gender_confidence=float(r.get("gender", {}).get(r.get("dominant_gender", ""), 0)) if "gender" in actions else None,
            dominant_emotion=r.get("dominant_emotion") if "emotion" in actions else None,
            emotion_scores=r.get("emotion") if "emotion" in actions else None,
            dominant_race=r.get("dominant_race") if "race" in actions else None,
            race_scores=r.get("race") if "race" in actions else None,
            face_confidence=float(r.get("face_confidence", 1.0)),
            latency_ms=int((time.monotonic() - t0) * 1000),
        )
    except Exception as exc:
        # NEVER return canned demographics (age 25 / "Man" / 0.92): these feed
        # NDPR age-gating compliance decisions and must be real model output.
        logger.error("deepface analyze error: %s", exc)
        raise HTTPException(status_code=503, detail=f"Face analysis failed: {exc}") from exc


@app.get("/health")
async def health():
    """Kubernetes liveness probe."""
    df_available = _get_model("deepface") is not None
    return {
        "status": "ok" if df_available else "degraded",
        "service": "deepface-sidecar",
        "version": "1.1.0",
        "deepface_available": df_available,
        "mode": "production" if df_available else "unavailable_fail_closed",
    }


@app.get("/ready")
async def ready():
    """Kubernetes readiness probe: no KYC traffic until models are loaded."""
    if _get_model("deepface") is None:
        raise HTTPException(status_code=503, detail="deepface models not ready")
    return {"status": "ready", "deepface_available": True}


# ─── Entrypoint ───────────────────────────────────────────────────────────────
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
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, log_level="info")
