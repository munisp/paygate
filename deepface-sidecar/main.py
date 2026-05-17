"""
PayGate DeepFace Sidecar
========================
FastAPI microservice wrapping DeepFace for:
  POST /liveness       — anti-spoofing check on one or more base64 frames
  POST /verify-face    — ArcFace face verification (selfie vs. ID document)
  POST /search         — Facenet512 embedding search against pgvector store
  POST /register       — Register a face embedding into pgvector store
  POST /analyze        — Age / gender / emotion analysis
  GET  /health         — Liveness probe

Run:
  uvicorn main:app --host 0.0.0.0 --port 5050 --workers 2

Environment variables:
  DEEPFACE_SIDECAR_PORT   (default: 5050)
  DEEPFACE_DB_URL         PostgreSQL connection string with pgvector extension
  DEEPFACE_LOG_LEVEL      (default: INFO)
"""

import base64
import io
import logging
import os
import time
import uuid
from contextlib import asynccontextmanager
from typing import List, Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=os.getenv("DEEPFACE_LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("deepface-sidecar")

# ---------------------------------------------------------------------------
# Warm-up: import DeepFace and pre-load models at startup
# ---------------------------------------------------------------------------
_deepface_ready = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _deepface_ready
    logger.info("Warming up DeepFace models …")
    try:
        from deepface import DeepFace
        import cv2

        # Warm up ArcFace + RetinaFace with a 1×1 dummy image
        dummy = np.zeros((100, 100, 3), dtype=np.uint8)
        dummy[40:60, 40:60] = 200  # rough face region
        try:
            DeepFace.represent(
                img_path=dummy,
                model_name="ArcFace",
                detector_backend="opencv",
                enforce_detection=False,
            )
        except Exception:
            pass  # warm-up failure is non-fatal

        _deepface_ready = True
        logger.info("DeepFace models ready.")
    except ImportError:
        logger.warning(
            "deepface package not installed — running in MOCK mode. "
            "Install with: pip install deepface"
        )
    yield
    logger.info("DeepFace sidecar shutting down.")


app = FastAPI(
    title="PayGate DeepFace Sidecar",
    version="1.0.0",
    description="Neural face verification, anti-spoofing, and analysis for PayGate KYC/KYB",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _b64_to_numpy(b64: str) -> np.ndarray:
    """Decode a base64-encoded image string to a numpy array."""
    import cv2

    # Strip data URI prefix if present
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    img_bytes = base64.b64decode(b64)
    arr = np.frombuffer(img_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image from base64 string")
    return img


def _url_or_b64(value: str):
    """Return a URL as-is, or decode base64 to numpy array."""
    if value.startswith("http://") or value.startswith("https://"):
        return value
    return _b64_to_numpy(value)


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class LivenessRequest(BaseModel):
    frames: List[str] = Field(
        ...,
        description="One or more base64-encoded JPEG/PNG frames from the camera",
    )
    quality_hint: Optional[dict] = Field(
        default=None,
        description="Optional quality metadata: { noiseLevel: 'low'|'medium'|'high' }",
    )


class LivenessResponse(BaseModel):
    is_real: bool
    confidence: float
    antispoof_scores: List[float]
    ensemble_score: float
    noise_level: str
    model: str
    latency_ms: float


class VerifyFaceRequest(BaseModel):
    img1: str = Field(..., description="Base64 or URL — first image (e.g. selfie)")
    img2: str = Field(..., description="Base64 or URL — second image (e.g. ID document face)")
    model_name: str = Field(default="ArcFace")
    detector_backend: str = Field(default="retinaface")
    distance_metric: str = Field(default="cosine")
    anti_spoofing: bool = Field(default=False)


class VerifyFaceResponse(BaseModel):
    verified: bool
    distance: float
    threshold: float
    model: str
    detector_backend: str
    similarity_metric: str
    confidence: float
    latency_ms: float


class RegisterRequest(BaseModel):
    subject_id: str = Field(..., description="Unique identifier for this person (e.g. kyc_submission_id)")
    img: str = Field(..., description="Base64 or URL of the face image to register")
    model_name: str = Field(default="Facenet512")
    detector_backend: str = Field(default="retinaface")


class RegisterResponse(BaseModel):
    subject_id: str
    embedding_id: str
    embedding_dim: int
    model: str
    latency_ms: float


class SearchRequest(BaseModel):
    img: str = Field(..., description="Base64 or URL of the query face image")
    model_name: str = Field(default="Facenet512")
    detector_backend: str = Field(default="retinaface")
    top_k: int = Field(default=5)
    threshold: Optional[float] = Field(default=None)


class SearchMatch(BaseModel):
    subject_id: str
    embedding_id: str
    distance: float
    is_duplicate: bool


class SearchResponse(BaseModel):
    matches: List[SearchMatch]
    query_embedding_dim: int
    model: str
    latency_ms: float


class AnalyzeRequest(BaseModel):
    img: str = Field(..., description="Base64 or URL of the face image")
    actions: List[str] = Field(
        default=["age", "gender", "emotion"],
        description="Subset of: age, gender, emotion, race",
    )
    detector_backend: str = Field(default="opencv")


class AnalyzeResponse(BaseModel):
    age: Optional[float] = None
    gender: Optional[str] = None
    dominant_emotion: Optional[str] = None
    dominant_race: Optional[str] = None
    is_minor: bool = False
    latency_ms: float


# ---------------------------------------------------------------------------
# In-memory embedding store (replace with pgvector in production)
# ---------------------------------------------------------------------------
# Structure: { subject_id: { embedding_id: np.ndarray } }
_embedding_store: dict = {}

# Default thresholds per model (cosine distance)
_DEFAULT_THRESHOLDS = {
    "ArcFace": 0.68,
    "Facenet": 0.40,
    "Facenet512": 0.30,
    "VGG-Face": 0.40,
    "OpenFace": 0.10,
    "DeepFace": 0.23,
    "DeepID": 0.015,
    "Dlib": 0.07,
    "SFace": 0.593,
    "GhostFaceNet": 0.65,
    "Buffalo_L": 0.60,
}

DUPLICATE_THRESHOLD = 0.25  # Facenet512 cosine — conservative for fraud prevention


# ---------------------------------------------------------------------------
# Mock responses (used when deepface is not installed)
# ---------------------------------------------------------------------------

def _mock_liveness(frames, quality_hint) -> LivenessResponse:
    noise = (quality_hint or {}).get("noiseLevel", "low")
    score = 0.82 if noise == "high" else 0.91
    return LivenessResponse(
        is_real=score > 0.5,
        confidence=score,
        antispoof_scores=[score] * len(frames),
        ensemble_score=score,
        noise_level=noise,
        model="mock",
        latency_ms=1.0,
    )


def _mock_verify() -> VerifyFaceResponse:
    return VerifyFaceResponse(
        verified=True,
        distance=0.21,
        threshold=0.68,
        model="ArcFace-mock",
        detector_backend="mock",
        similarity_metric="cosine",
        confidence=0.87,
        latency_ms=1.0,
    )


def _mock_analyze() -> AnalyzeResponse:
    return AnalyzeResponse(
        age=28.0,
        gender="Man",
        dominant_emotion="neutral",
        dominant_race=None,
        is_minor=False,
        latency_ms=1.0,
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {
        "status": "ok",
        "deepface_ready": _deepface_ready,
        "embedding_store_size": sum(len(v) for v in _embedding_store.values()),
    }


@app.post("/liveness", response_model=LivenessResponse)
def liveness(req: LivenessRequest):
    """
    Anti-spoofing liveness check.
    Accepts 1–5 base64 frames, runs DeepFace anti-spoofing on each,
    and returns an ensemble score with noise-adaptive thresholding.
    """
    t0 = time.perf_counter()
    noise_level = (req.quality_hint or {}).get("noiseLevel", "low")

    if not _deepface_ready:
        return _mock_liveness(req.frames, req.quality_hint)

    try:
        from deepface import DeepFace

        scores = []
        for frame_b64 in req.frames:
            try:
                img = _b64_to_numpy(frame_b64)
                face_objs = DeepFace.extract_faces(
                    img_path=img,
                    anti_spoofing=True,
                    enforce_detection=False,
                )
                if face_objs:
                    # antispoof_score: 1.0 = definitely real, 0.0 = definitely fake
                    face = face_objs[0]
                    score = float(face.get("antispoof_score", 0.5))
                    scores.append(score)
            except Exception as e:
                logger.warning(f"Frame analysis failed: {e}")
                scores.append(0.5)  # neutral on error

        if not scores:
            scores = [0.5]

        # Ensemble: drop lowest outlier if ≥3 frames
        if len(scores) >= 3:
            working = sorted(scores)[1:]  # drop lowest
        else:
            working = scores

        ensemble = float(np.mean(working))

        # Noise-adaptive threshold adjustment
        threshold = 0.5
        if noise_level == "high":
            threshold = 0.38  # more lenient for noisy cameras
        elif noise_level == "medium":
            threshold = 0.44

        is_real = ensemble >= threshold
        confidence = min(1.0, ensemble / max(threshold, 0.01))

        return LivenessResponse(
            is_real=is_real,
            confidence=round(confidence, 4),
            antispoof_scores=[round(s, 4) for s in scores],
            ensemble_score=round(ensemble, 4),
            noise_level=noise_level,
            model="DeepFace-AntiSpoof",
            latency_ms=round((time.perf_counter() - t0) * 1000, 1),
        )

    except Exception as e:
        logger.error(f"/liveness error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/verify-face", response_model=VerifyFaceResponse)
def verify_face(req: VerifyFaceRequest):
    """
    ArcFace face verification: confirms two images are the same person.
    Used for KYC selfie-vs-ID-document and KYB director verification.
    """
    t0 = time.perf_counter()

    if not _deepface_ready:
        return _mock_verify()

    try:
        from deepface import DeepFace

        img1 = _url_or_b64(req.img1)
        img2 = _url_or_b64(req.img2)

        result = DeepFace.verify(
            img1_path=img1,
            img2_path=img2,
            model_name=req.model_name,
            detector_backend=req.detector_backend,
            distance_metric=req.distance_metric,
            anti_spoofing=req.anti_spoofing,
            enforce_detection=False,
        )

        distance = float(result.get("distance", 1.0))
        threshold = float(result.get("threshold", _DEFAULT_THRESHOLDS.get(req.model_name, 0.68)))
        verified = bool(result.get("verified", False))

        # Confidence: how far below threshold (1.0 = exactly at threshold, >1.0 = more confident)
        confidence = round(max(0.0, 1.0 - distance / max(threshold, 0.001)), 4)

        return VerifyFaceResponse(
            verified=verified,
            distance=round(distance, 6),
            threshold=round(threshold, 6),
            model=req.model_name,
            detector_backend=req.detector_backend,
            similarity_metric=req.distance_metric,
            confidence=confidence,
            latency_ms=round((time.perf_counter() - t0) * 1000, 1),
        )

    except Exception as e:
        logger.error(f"/verify-face error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/register", response_model=RegisterResponse)
def register(req: RegisterRequest):
    """
    Extract a face embedding and store it in the in-memory store (or pgvector).
    Called on KYC approval to register the verified identity.
    """
    t0 = time.perf_counter()

    if not _deepface_ready:
        emb_id = str(uuid.uuid4())
        _embedding_store.setdefault(req.subject_id, {})[emb_id] = np.zeros(512)
        return RegisterResponse(
            subject_id=req.subject_id,
            embedding_id=emb_id,
            embedding_dim=512,
            model=req.model_name + "-mock",
            latency_ms=1.0,
        )

    try:
        from deepface import DeepFace

        img = _url_or_b64(req.img)
        embedding_objs = DeepFace.represent(
            img_path=img,
            model_name=req.model_name,
            detector_backend=req.detector_backend,
            enforce_detection=False,
        )

        if not embedding_objs:
            raise HTTPException(status_code=422, detail="No face detected in image")

        embedding = np.array(embedding_objs[0]["embedding"], dtype=np.float32)
        emb_id = str(uuid.uuid4())
        _embedding_store.setdefault(req.subject_id, {})[emb_id] = embedding

        return RegisterResponse(
            subject_id=req.subject_id,
            embedding_id=emb_id,
            embedding_dim=len(embedding),
            model=req.model_name,
            latency_ms=round((time.perf_counter() - t0) * 1000, 1),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"/register error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/search", response_model=SearchResponse)
def search(req: SearchRequest):
    """
    Search the embedding store for faces similar to the query image.
    Used for duplicate identity detection on new KYC submissions.
    """
    t0 = time.perf_counter()
    threshold = req.threshold or DUPLICATE_THRESHOLD

    if not _deepface_ready:
        return SearchResponse(
            matches=[],
            query_embedding_dim=512,
            model=req.model_name + "-mock",
            latency_ms=1.0,
        )

    try:
        from deepface import DeepFace
        from scipy.spatial.distance import cosine as cosine_dist

        img = _url_or_b64(req.img)
        embedding_objs = DeepFace.represent(
            img_path=img,
            model_name=req.model_name,
            detector_backend=req.detector_backend,
            enforce_detection=False,
        )

        if not embedding_objs:
            raise HTTPException(status_code=422, detail="No face detected in query image")

        query_emb = np.array(embedding_objs[0]["embedding"], dtype=np.float32)

        # Brute-force cosine search over in-memory store
        candidates = []
        for subject_id, embeddings in _embedding_store.items():
            for emb_id, emb in embeddings.items():
                dist = float(cosine_dist(query_emb, emb))
                candidates.append((dist, subject_id, emb_id))

        candidates.sort(key=lambda x: x[0])
        top = candidates[: req.top_k]

        matches = [
            SearchMatch(
                subject_id=s,
                embedding_id=e,
                distance=round(d, 6),
                is_duplicate=d < threshold,
            )
            for d, s, e in top
        ]

        return SearchResponse(
            matches=matches,
            query_embedding_dim=len(query_emb),
            model=req.model_name,
            latency_ms=round((time.perf_counter() - t0) * 1000, 1),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"/search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest):
    """
    Facial attribute analysis: age, gender, emotion, race.
    Age < 18 sets is_minor = True for CBN AML/CFT enhanced due diligence.
    """
    t0 = time.perf_counter()

    if not _deepface_ready:
        return _mock_analyze()

    try:
        from deepface import DeepFace

        img = _url_or_b64(req.img)
        results = DeepFace.analyze(
            img_path=img,
            actions=req.actions,
            detector_backend=req.detector_backend,
            enforce_detection=False,
        )

        if not results:
            raise HTTPException(status_code=422, detail="No face detected in image")

        r = results[0]
        age = float(r.get("age", 0)) if "age" in req.actions else None
        gender = r.get("dominant_gender") if "gender" in req.actions else None
        emotion = r.get("dominant_emotion") if "emotion" in req.actions else None
        race = r.get("dominant_race") if "race" in req.actions else None

        return AnalyzeResponse(
            age=round(age, 1) if age is not None else None,
            gender=gender,
            dominant_emotion=emotion,
            dominant_race=race,
            is_minor=age is not None and age < 18,
            latency_ms=round((time.perf_counter() - t0) * 1000, 1),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"/analyze error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# /embedding — extract raw embedding vector (Wave 178)
# ---------------------------------------------------------------------------

class EmbeddingRequest(BaseModel):
    img: str
    model_name: str = "Facenet512"
    detector_backend: str = "retinaface"


@app.post("/embedding")
def get_embedding(req: EmbeddingRequest):
    """Extract a raw face embedding vector from an image (Wave 178 duplicate detection)."""
    t0 = time.perf_counter()
    if not _deepface_ready:
        return {
            "embedding": [0.0] * 512,
            "embedding_dim": 512,
            "model": req.model_name + "-mock",
            "latency_ms": 1.0,
        }
    try:
        from deepface import DeepFace
        img = _url_or_b64(req.img)
        embedding_objs = DeepFace.represent(
            img_path=img,
            model_name=req.model_name,
            detector_backend=req.detector_backend,
            enforce_detection=False,
        )
        embedding = embedding_objs[0]["embedding"] if embedding_objs else None
        return {
            "embedding": embedding,
            "embedding_dim": len(embedding) if embedding else 0,
            "model": req.model_name,
            "latency_ms": round((time.perf_counter() - t0) * 1000, 1),
        }
    except Exception as e:
        logger.error(f"/embedding error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# /search-embedding — cosine-search an embedding vector (Wave 178)
# ---------------------------------------------------------------------------

class SearchEmbeddingRequest(BaseModel):
    embedding: list
    threshold: float = 0.4
    exclude_subject_id: Optional[str] = None


@app.post("/search-embedding")
def search_embedding(req: SearchEmbeddingRequest):
    """Cosine-search a query embedding against the in-memory store (Wave 178)."""
    t0 = time.perf_counter()
    query = np.array(req.embedding, dtype=np.float32)
    query_norm = query / (np.linalg.norm(query) + 1e-8)

    best_dist = float("inf")
    best_id = None

    for subj_id, embeddings in _embedding_store.items():
        if req.exclude_subject_id and subj_id == req.exclude_subject_id:
            continue
        for emb_id, stored_emb in embeddings.items():
            stored = np.array(stored_emb, dtype=np.float32)
            stored_norm = stored / (np.linalg.norm(stored) + 1e-8)
            dist = float(1.0 - float(np.dot(query_norm, stored_norm)))
            if dist < best_dist:
                best_dist = dist
                best_id = subj_id

    match_found = best_id is not None and best_dist <= req.threshold
    return {
        "match_found": match_found,
        "closest_match_id": best_id if match_found else None,
        "distance": round(best_dist, 4) if best_id else None,
        "model": "Facenet512",
        "latency_ms": round((time.perf_counter() - t0) * 1000, 1),
    }
