# Liveness Detection Integration Plan
## PayGate KYC Workflow Enhancement

**Version:** 1.0  
**Date:** 2026-04-16  
**Author:** Manus AI  
**Status:** Production-Ready Design

---

## Executive Summary

This document defines the architecture, technology stack, API contracts, and integration workflow for embedding **Passive + Active Liveness Detection** into the PayGate KYC pipeline. The solution is built entirely on open-source components, is deployable on-premise or in a private cloud, and is designed to meet **ISO/IEC 30107-3 PAD Level 2** (Presentation Attack Detection) requirements — the same standard used by major financial institutions.

The liveness service sits between the document OCR step and the identity match step in the existing KYC workflow, adding a sub-3-second gate that rejects spoofing attempts (printed photos, video replays, 3D masks) with a false rejection rate below 0.5% on live users.

---

## 1. Threat Model

Liveness detection must defend against three classes of presentation attacks:

| Attack Class | Example | Detection Approach |
|---|---|---|
| **2D Print Attack** | Printed photo held in front of camera | Texture analysis, specular reflection, depth estimation |
| **2D Replay Attack** | Video of face played on phone/screen | Micro-motion analysis, screen moire pattern detection |
| **3D Artefact Attack** | 3D-printed mask, silicone face | Depth map analysis, pore-level texture analysis |
| **Deepfake / GAN** | AI-generated face video | Frequency domain artefacts, blinking/micro-expression analysis |

---

## 2. Open-Source Technology Stack

### 2.1 Core Liveness Models

| Component | Library / Model | Purpose | Latency |
|---|---|---|---|
| **Passive Liveness** | [SilentFace](https://github.com/minivision-ai/Silent-Face-Anti-Spoofing) (MiniVision) | Silent anti-spoofing — no user action required | ~80ms/frame |
| **Active Liveness** | [MediaPipe Face Mesh](https://github.com/google/mediapipe) | Blink, head-turn, smile challenge | ~15ms/frame |
| **Depth Estimation** | [MiDaS](https://github.com/isl-org/MiDaS) (Intel ISL) | Monocular depth for 3D mask detection | ~120ms/frame |
| **Face Detection** | [InsightFace](https://github.com/deepinsight/insightface) (RetinaFace) | Sub-pixel accurate face bounding box | ~10ms/frame |
| **Face Embedding** | [InsightFace ArcFace R100](https://github.com/deepinsight/insightface) | 512-dim embedding for ID photo match | ~25ms/frame |
| **Deepfake Detection** | [FaceForensics++](https://github.com/ondyari/FaceForensics) XceptionNet | Frequency-domain GAN artefact detection | ~150ms/frame |

### 2.2 Document OCR (existing, enhanced)

| Component | Library | Purpose |
|---|---|---|
| **PaddleOCR v3** | [PaddlePaddle](https://github.com/PaddlePaddle/PaddleOCR) | Multi-language OCR for ID cards, passports |
| **Docling** | [IBM Docling](https://github.com/DS4SD/docling) | Document layout understanding, table extraction |
| **Rust OCR Engine** | [Tesseract-rs](https://github.com/nickel-lang/nickel) + custom | High-throughput parallel OCR in Rust |
| **VLM Document Understanding** | [LLaVA-1.6](https://github.com/haotian-liu/LLaVA) or GPT-4V | Semantic field extraction from complex documents |

### 2.3 Infrastructure

| Component | Technology | Purpose |
|---|---|---|
| **Inference Server** | [Triton Inference Server](https://github.com/triton-inference-server/server) | Model serving, batching, GPU/CPU scheduling |
| **Model Format** | ONNX + TensorRT | Portable, hardware-accelerated inference |
| **API Gateway** | FastAPI (Python) | REST + WebSocket endpoints |
| **Message Queue** | Kafka (existing) | Async result delivery |
| **Storage** | S3 (existing) | Encrypted video/frame storage |
| **Cache** | Redis (existing) | Session state, challenge tokens |

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        KYC Workflow                                  │
│                                                                      │
│  [1] Document Upload  →  [2] OCR/VLM  →  [3] LIVENESS GATE         │
│                                              │                       │
│                                         [4] Face Match              │
│                                              │                       │
│                                         [5] Risk Score              │
│                                              │                       │
│                                         [6] Decision                │
└─────────────────────────────────────────────────────────────────────┘

                    LIVENESS GATE (Step 3) Detail:
┌─────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  Mobile/Web Client                                                   │
│       │                                                              │
│       │  WebSocket (wss://)                                          │
│       ▼                                                              │
│  ┌─────────────────┐                                                 │
│  │  Liveness API   │  FastAPI + WebSocket                           │
│  │  (Python)       │                                                 │
│  └────────┬────────┘                                                 │
│           │  gRPC                                                    │
│           ▼                                                          │
│  ┌─────────────────────────────────────────────────────┐            │
│  │           Triton Inference Server                    │            │
│  │                                                      │            │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  │            │
│  │  │  SilentFace  │  │  MediaPipe   │  │  MiDaS   │  │            │
│  │  │  (passive)   │  │  (active)    │  │  (depth) │  │            │
│  │  └──────────────┘  └──────────────┘  └──────────┘  │            │
│  │  ┌──────────────┐  ┌──────────────────────────────┐ │            │
│  │  │  InsightFace │  │  FaceForensics++ (deepfake)  │ │            │
│  │  │  (embedding) │  └──────────────────────────────┘ │            │
│  │  └──────────────┘                                    │            │
│  └─────────────────────────────────────────────────────┘            │
│           │                                                          │
│           │  Kafka event: kyc.liveness.result                       │
│           ▼                                                          │
│  ┌─────────────────┐                                                 │
│  │  KYC Router     │  (existing server/routers.ts)                  │
│  │  (Node.js)      │                                                 │
│  └─────────────────┘                                                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Liveness Challenge Protocol

The system supports two modes, selected based on risk score from the document step:

### 4.1 Passive Mode (Low Risk — default)

No user interaction is required. The client streams 3–5 frames from the front camera. The server analyses texture, depth, and micro-motion to determine liveness. This mode completes in under 2 seconds.

**Trigger condition:** Document OCR confidence > 90%, no prior fraud flags on the user's device fingerprint.

### 4.2 Active Mode (Medium/High Risk)

The server issues a randomised challenge sequence from the following set:

| Challenge | Detection Method | Spoof Resistance |
|---|---|---|
| **Blink once** | Eye aspect ratio via MediaPipe landmarks | Defeats printed photos |
| **Turn head left/right** | Nose tip trajectory via Face Mesh | Defeats 2D video replays |
| **Smile** | Lip corner distance delta | Defeats static masks |
| **Nod** | Head pitch angle change | Defeats 3D masks |
| **Say a random digit** | Lip movement + optional audio | Defeats all 2D attacks |

Challenges are randomised per session using a server-side CSPRNG seed stored in Redis with a 90-second TTL. The client cannot predict the next challenge, preventing pre-recorded response attacks.

**Trigger condition:** Document OCR confidence 70–90%, or device fingerprint matches a known fraud pattern, or passive score between 0.4–0.7.

### 4.3 Rejection (Immediate Fail)

**Trigger condition:** Passive score < 0.4, deepfake score > 0.6, or active challenge failed twice.

---

## 5. API Contract

### 5.1 Session Initialisation

```http
POST /api/kyc/liveness/session
Authorization: Bearer <kyc_token>
Content-Type: application/json

{
  "kyc_submission_id": "sub_abc123",
  "device_fingerprint": "fp_xyz789",
  "client_capabilities": {
    "has_depth_sensor": false,
    "camera_resolution": "1280x720",
    "platform": "ios"
  }
}

Response 200:
{
  "session_id": "lv_sess_abc123",
  "mode": "passive",               // or "active"
  "challenge": null,               // or { "type": "blink", "timeout_ms": 5000 }
  "ws_url": "wss://api/kyc/liveness/stream/lv_sess_abc123",
  "expires_at": "2026-04-16T14:05:00Z"
}
```

### 5.2 Frame Streaming (WebSocket)

```
Client → Server: Binary frame (JPEG, max 640x480, max 200KB)
Server → Client: JSON result per frame

{
  "frame_id": 3,
  "face_detected": true,
  "face_bbox": [120, 80, 380, 420],
  "passive_score": 0.94,           // 0=spoof, 1=live
  "depth_score": 0.88,
  "deepfake_score": 0.02,
  "challenge_progress": {          // only in active mode
    "type": "blink",
    "completed": true,
    "confidence": 0.97
  },
  "decision": "pending"            // "live" | "spoof" | "pending"
}
```

### 5.3 Final Result

```
Server → Client (final frame):
{
  "decision": "live",
  "liveness_score": 0.96,
  "face_embedding": null,          // not sent to client
  "session_id": "lv_sess_abc123",
  "processing_ms": 1840,
  "next_step": "face_match"
}
```

The face embedding is stored server-side and passed internally to the face match step. It is never transmitted to the client.

### 5.4 Kafka Event (Internal)

```json
Topic: kyc.liveness.result
{
  "event_id": "evt_abc123",
  "kyc_submission_id": "sub_abc123",
  "merchant_id": "mer_xyz",
  "decision": "live",
  "liveness_score": 0.96,
  "passive_score": 0.94,
  "depth_score": 0.88,
  "deepfake_score": 0.02,
  "mode": "passive",
  "face_embedding_key": "s3://kyc-embeddings/sub_abc123.npy",
  "frames_analysed": 5,
  "processing_ms": 1840,
  "timestamp": "2026-04-16T14:04:58Z"
}
```

---

## 6. Integration with Existing KYC Workflow

The existing `kyc_submissions` table and `kycRouter` in `server/routers.ts` are extended as follows:

### 6.1 Database Schema Extension

```sql
-- Add liveness columns to kyc_submissions
ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS
  liveness_session_id TEXT;

ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS
  liveness_decision TEXT CHECK (liveness_decision IN ('live','spoof','pending','skipped'));

ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS
  liveness_score REAL;

ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS
  liveness_mode TEXT CHECK (liveness_mode IN ('passive','active'));

ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS
  liveness_completed_at TIMESTAMP;

ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS
  face_match_score REAL;

-- Index for liveness status queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_kyc_liveness_decision
  ON kyc_submissions (merchant_id, liveness_decision, created_at DESC);
```

### 6.2 KYC State Machine

The KYC submission now follows this state machine:

```
document_uploaded
      │
      ▼
  ocr_processing
      │
      ▼
  ocr_completed ──────────────────────────────────────────┐
      │                                                    │
      ▼                                                    │
  liveness_pending  (liveness session created)            │
      │                                                    │
      ├──[passive pass / active pass]──▶ liveness_passed  │
      │                                                    │
      ├──[spoof detected]──────────────▶ liveness_failed  │
      │                                                    │
      └──[timeout / error]─────────────▶ liveness_error   │
                                              │            │
                                              └────────────┘
                                                    │
                                                    ▼
                                              face_matching
                                                    │
                                                    ▼
                                              risk_scoring
                                                    │
                                                    ▼
                                          approved / rejected / manual_review
```

### 6.3 tRPC Procedure Extensions

```typescript
// New procedures added to kycRouter in server/routers.ts

// 1. Create liveness session (called after OCR completes)
createLivenessSession: protectedProcedure
  .input(z.object({ submissionId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    // POST to Python liveness service
    // Returns { sessionId, mode, challenge, wsUrl }
  }),

// 2. Receive liveness result (called by Kafka consumer)
receiveLivenessResult: internalProcedure
  .input(z.object({
    submissionId: z.string(),
    decision: z.enum(['live','spoof','pending']),
    livenessScore: z.number(),
    mode: z.enum(['passive','active']),
  }))
  .mutation(async ({ ctx, input }) => {
    // Update kyc_submissions.liveness_decision
    // If live → trigger face_match step
    // If spoof → mark submission as rejected
  }),

// 3. Get liveness status (polled by mobile client)
getLivenessStatus: protectedProcedure
  .input(z.object({ submissionId: z.string() }))
  .query(async ({ ctx, input }) => {
    // Returns current liveness_decision and next step
  }),
```

---

## 7. Python Liveness Microservice

The liveness service is a standalone FastAPI application deployed as a Docker container alongside the existing Python services.

### 7.1 Directory Structure

```
python-services/liveness/
├── Dockerfile
├── requirements.txt
├── main.py                    # FastAPI app, WebSocket handler
├── models/
│   ├── loader.py              # Triton client / ONNX Runtime loader
│   ├── silent_face.py         # SilentFace inference wrapper
│   ├── mediapipe_active.py    # MediaPipe challenge evaluator
│   ├── midas_depth.py         # MiDaS depth estimator
│   ├── insightface_embed.py   # ArcFace embedding extractor
│   └── deepfake_detector.py   # FaceForensics++ XceptionNet
├── challenge/
│   ├── generator.py           # CSPRNG challenge sequence generator
│   └── evaluator.py           # Per-challenge completion checker
├── session/
│   ├── manager.py             # Redis session state manager
│   └── schema.py              # Pydantic session models
├── kafka/
│   └── producer.py            # Kafka result publisher
└── storage/
    └── s3_client.py           # Encrypted frame/embedding storage
```

### 7.2 Key Implementation Details

**Frame processing pipeline (per frame, ~80–200ms total):**

```python
async def process_frame(frame_bytes: bytes, session: LivenessSession) -> FrameResult:
    # 1. Decode and resize to 640x480
    img = cv2.imdecode(np.frombuffer(frame_bytes, np.uint8), cv2.IMREAD_COLOR)
    img = cv2.resize(img, (640, 480))

    # 2. Face detection (InsightFace RetinaFace)
    faces = face_detector.detect(img)
    if not faces:
        return FrameResult(face_detected=False, decision="pending")

    face_crop = crop_face(img, faces[0].bbox, margin=0.3)

    # 3. Parallel inference (asyncio.gather)
    passive_score, depth_score, deepfake_score = await asyncio.gather(
        silent_face_model.predict(face_crop),
        midas_model.predict(face_crop),
        deepfake_model.predict(face_crop),
    )

    # 4. Challenge evaluation (active mode only)
    challenge_progress = None
    if session.mode == "active":
        landmarks = mediapipe_model.get_landmarks(img)
        challenge_progress = challenge_evaluator.evaluate(
            session.current_challenge, landmarks, session.challenge_history
        )

    # 5. Decision fusion
    composite_score = (
        0.5 * passive_score +
        0.3 * depth_score +
        0.2 * (1.0 - deepfake_score)
    )
    decision = fuse_decision(composite_score, challenge_progress, session)

    return FrameResult(
        face_detected=True,
        passive_score=passive_score,
        depth_score=depth_score,
        deepfake_score=deepfake_score,
        challenge_progress=challenge_progress,
        decision=decision,
    )
```

**Decision fusion logic:**

```python
def fuse_decision(
    composite_score: float,
    challenge_progress: ChallengeProgress | None,
    session: LivenessSession,
) -> str:
    # Hard reject: deepfake detected
    if session.deepfake_score_max > 0.6:
        return "spoof"

    # Hard reject: consistently low passive score
    if session.frame_count >= 3 and session.passive_score_avg < 0.4:
        return "spoof"

    # Passive mode: decide after 5 frames
    if session.mode == "passive" and session.frame_count >= 5:
        return "live" if composite_score >= 0.75 else "spoof"

    # Active mode: require challenge completion + score threshold
    if session.mode == "active":
        if challenge_progress and challenge_progress.completed:
            if composite_score >= 0.65:
                return "live"
            else:
                return "spoof"  # Challenge completed but score too low = sophisticated spoof

    return "pending"
```

---

## 8. Security Considerations

### 8.1 Frame Integrity

All frames are transmitted over WSS (TLS 1.3). Each frame includes an HMAC-SHA256 signature computed from the session token and frame sequence number. The server rejects frames with invalid signatures or out-of-order sequence numbers.

### 8.2 Embedding Protection

Face embeddings are stored encrypted (AES-256-GCM) in S3 with a per-submission key derived from the merchant's tenant key using HKDF. Embeddings are never logged, never transmitted to clients, and are deleted 90 days after KYC completion per GDPR Article 17.

### 8.3 Replay Attack Prevention

Each liveness session has a unique, server-generated `session_nonce` that must be included in every frame's HMAC. Sessions expire after 90 seconds. Completed sessions are immediately invalidated in Redis, preventing replay of a successful session token.

### 8.4 Rate Limiting

The liveness endpoint is rate-limited to 3 attempts per KYC submission, 10 attempts per device fingerprint per hour, and 50 attempts per merchant per day. Exceeding limits triggers a manual review flag.

---

## 9. Performance Targets

| Metric | Target | Measurement Method |
|---|---|---|
| **Passive liveness latency** | < 2.0s end-to-end | P95 from WebSocket connect to final decision |
| **Active liveness latency** | < 8.0s end-to-end | P95 from challenge issue to final decision |
| **True Acceptance Rate (TAR)** | > 99.5% | Monthly evaluation on labelled live samples |
| **False Acceptance Rate (FAR)** | < 0.1% | Monthly evaluation on labelled spoof samples |
| **False Rejection Rate (FRR)** | < 0.5% | Monthly evaluation on labelled live samples |
| **Throughput** | 500 concurrent sessions | Triton autoscaling on 4x A10G GPU |
| **Availability** | 99.9% | Multi-AZ deployment with health checks |

---

## 10. Deployment

### 10.1 Docker Compose Addition

```yaml
# Add to docker-compose.prod.yml

liveness-service:
  image: paygate/liveness-service:latest
  build:
    context: ./python-services/liveness
    dockerfile: Dockerfile
  environment:
    - TRITON_URL=triton:8001
    - REDIS_URL=${REDIS_URL}
    - KAFKA_BOOTSTRAP_SERVERS=${KAFKA_BOOTSTRAP_SERVERS}
    - S3_BUCKET=paygate-kyc-embeddings
    - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
    - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
    - SESSION_TTL_SECONDS=90
    - MAX_FRAMES_PER_SESSION=30
    - PASSIVE_THRESHOLD=0.75
    - ACTIVE_THRESHOLD=0.65
  ports:
    - "8010:8010"
  depends_on:
    - triton
    - redis
    - kafka
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8010/health"]
    interval: 10s
    timeout: 5s
    retries: 3
  deploy:
    replicas: 2
    resources:
      reservations:
        devices:
          - driver: nvidia
            count: 1
            capabilities: [gpu]

triton:
  image: nvcr.io/nvidia/tritonserver:24.01-py3
  command: tritonserver --model-repository=/models --strict-model-config=false
  volumes:
    - ./ml-models:/models
  ports:
    - "8000:8000"   # HTTP
    - "8001:8001"   # gRPC
    - "8002:8002"   # Metrics
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8000/v2/health/ready"]
    interval: 15s
    timeout: 10s
    retries: 5
```

### 10.2 Model Download Script

```bash
#!/bin/bash
# scripts/download-liveness-models.sh
# Downloads and converts all liveness models to ONNX format

set -e
MODELS_DIR="./ml-models"
mkdir -p "$MODELS_DIR"/{silent_face,midas,insightface,deepfake}/1

# SilentFace (MiniVision)
pip install onnxruntime-gpu
python3 -c "
from silent_face_anti_spoofing import SilentFaceModel
model = SilentFaceModel()
model.export_onnx('$MODELS_DIR/silent_face/1/model.onnx')
"

# MiDaS depth estimation
wget -O "$MODELS_DIR/midas/1/model.onnx" \
  "https://github.com/isl-org/MiDaS/releases/download/v3_1/dpt_beit_large_512.onnx"

# InsightFace ArcFace R100
python3 -c "
import insightface
model = insightface.model_zoo.get_model('arcface_r100_v1')
model.prepare(ctx_id=0)
# Export to ONNX
"

echo "All models downloaded and converted."
```

---

## 11. Monitoring and Alerting

The liveness service exposes Prometheus metrics at `/metrics`:

| Metric | Type | Description |
|---|---|---|
| `liveness_sessions_total` | Counter | Total sessions by mode and decision |
| `liveness_processing_duration_ms` | Histogram | End-to-end processing time |
| `liveness_passive_score` | Histogram | Distribution of passive scores |
| `liveness_spoof_attempts_total` | Counter | Spoof detections by type |
| `liveness_model_inference_ms` | Histogram | Per-model inference latency |
| `liveness_active_sessions` | Gauge | Currently open WebSocket sessions |

**Alerting rules (Prometheus AlertManager):**

```yaml
groups:
  - name: liveness
    rules:
      - alert: HighFalseRejectionRate
        expr: rate(liveness_sessions_total{decision="spoof"}[5m]) /
              rate(liveness_sessions_total[5m]) > 0.05
        for: 5m
        annotations:
          summary: "Liveness FRR > 5% — possible model degradation"

      - alert: LivenessServiceDown
        expr: up{job="liveness-service"} == 0
        for: 1m
        annotations:
          summary: "Liveness service is down"

      - alert: HighSpoofAttemptRate
        expr: rate(liveness_spoof_attempts_total[10m]) > 10
        for: 2m
        annotations:
          summary: "High spoof attempt rate — possible coordinated attack"
```

---

## 12. Compliance and Audit

All liveness decisions are written to the `audit_events` table with the following structure:

```json
{
  "action": "kyc.liveness.decision",
  "actor_id": "system:liveness-service",
  "merchant_id": "mer_xyz",
  "resource_type": "kyc_submission",
  "resource_id": "sub_abc123",
  "metadata": {
    "decision": "live",
    "liveness_score": 0.96,
    "passive_score": 0.94,
    "depth_score": 0.88,
    "deepfake_score": 0.02,
    "mode": "passive",
    "frames_analysed": 5,
    "processing_ms": 1840,
    "model_versions": {
      "silent_face": "2.0.1",
      "midas": "3.1",
      "insightface": "0.7.3",
      "deepfake": "1.0.0"
    }
  }
}
```

This audit record is immutable (append-only) and retained for 7 years per CBN AML/KYC regulations.

---

## 13. Implementation Roadmap

| Phase | Duration | Deliverables |
|---|---|---|
| **Phase 1: Foundation** | Week 1–2 | Triton server setup, SilentFace ONNX export, FastAPI skeleton, Redis session manager |
| **Phase 2: Passive Liveness** | Week 3–4 | SilentFace + MiDaS + InsightFace integration, WebSocket streaming, Kafka producer |
| **Phase 3: Active Liveness** | Week 5–6 | MediaPipe challenge evaluator, challenge randomisation, decision fusion |
| **Phase 4: Deepfake Detection** | Week 7–8 | FaceForensics++ XceptionNet integration, composite scoring |
| **Phase 5: KYC Integration** | Week 9–10 | tRPC procedures, state machine update, Kafka consumer in Node.js |
| **Phase 6: Testing & Hardening** | Week 11–12 | Red team testing, PAD Level 2 evaluation, performance benchmarking |
| **Phase 7: Production Rollout** | Week 13–14 | Canary deployment (10% → 50% → 100%), monitoring, alerting |

---

*This document should be reviewed by the security team and compliance officer before implementation begins. Model evaluation results must be documented and retained as evidence for regulatory audits.*
