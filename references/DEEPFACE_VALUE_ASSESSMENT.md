# DeepFace Integration Value Assessment for PayGate Merchant Portal

**Prepared by:** Manus AI  
**Date:** May 17, 2026  
**Library:** [serengil/deepface](https://github.com/serengil/deepface) — MIT License, 22.8k GitHub stars, 3.1k forks  
**Version assessed:** v0.0.100 (latest)

---

## Executive Summary

DeepFace is a lightweight, MIT-licensed Python framework that wraps ten state-of-the-art face recognition models (VGG-Face, FaceNet, ArcFace, GhostFaceNet, Buffalo_L, and others) behind a single unified API. For the PayGate Merchant Portal, it represents a **high-value, low-cost upgrade path** for the KYC, KYB, and Liveness subsystems — replacing the current heuristic-based liveness scoring with production-grade neural face verification, anti-spoofing, and facial attribute analysis. Deployed as a sidecar Python microservice, it can be called from the existing Node.js tRPC procedures with no changes to the frontend or database schema.

---

## 1. What DeepFace Does

DeepFace exposes five core capabilities through a single Python package (`pip install deepface`):

| Capability | Function | Accuracy |
|---|---|---|
| **Face Verification** | Confirms two images are the same person | 97.53%+ (surpasses human baseline) |
| **Face Recognition** | Searches a face against a database of known identities | Depends on model; ArcFace reaches 99.4% on LFW |
| **Facial Attribute Analysis** | Predicts age (±4.65 MAE), gender (97.44%), emotion, and race/ethnicity | — |
| **Anti-Spoofing / Liveness** | Detects printed photos, screen replays, and 3D masks | Binary `is_real` flag per detected face |
| **Face Embedding Extraction** | Returns a 128d–512d vector for downstream similarity search | Supports pgvector, Pinecone, Weaviate |

The library handles the full five-stage pipeline internally — detect, align, normalise, represent, verify — so callers only need to pass image paths, URLs, or base64 strings.

---

## 2. Direct Value to PayGate's KYC/KYB/Liveness Features

### 2.1 Liveness & Anti-Spoofing (Highest Impact)

The current `checkLiveness` procedure uses a heuristic ensemble of frame-difference scores with noise-adaptive thresholds. While the Wave 167 multi-frame fix improved consistency on noisy cameras, it remains a **statistical approximation** rather than a trained neural classifier.

DeepFace's `anti_spoofing=True` flag activates a dedicated CNN-based spoof detector that classifies each detected face as `is_real: true/false`. This directly addresses the user-reported camera noise issue because the model learns to distinguish real skin texture from printed/screen artefacts — a distinction that pixel-difference heuristics cannot reliably make.

**Proposed integration:** The existing `checkLiveness` tRPC procedure can forward the base64 frame to a DeepFace sidecar via HTTP POST. The sidecar returns `{ is_real, confidence, antispoof_score }`. The existing multi-frame ensemble logic is preserved as a fallback when the sidecar is unavailable.

### 2.2 KYC Document Face Match (High Impact)

The current KYC flow captures a selfie and a government-issued ID document but does **not** perform a programmatic face match between them — the comparison is deferred to a human reviewer. DeepFace's `verify()` function can perform this match automatically:

```python
result = DeepFace.verify(
    img1_path = selfie_url,   # live capture
    img2_path = doc_face_url, # extracted from NIN/BVN/passport
    model_name = "ArcFace",
    detector_backend = "retinaface",
    anti_spoofing = True
)
# result["verified"] → True/False
# result["distance"] → cosine distance (lower = more similar)
# result["threshold"] → model-specific threshold
```

This closes a critical compliance gap: CBN KYC Manual Section 4.3 requires that the photograph on a presented document matches the applicant. Automating this check reduces manual review time and eliminates human error.

### 2.3 KYB Director Identity Verification (High Impact)

KYB director sub-flow currently collects director selfies and ID documents but relies on the same manual review path. DeepFace can verify each director's selfie against their submitted ID document, producing a `verified` boolean and a confidence score that can be stored in the `kyb_steps` table and surfaced in the admin review UI.

### 2.4 Duplicate Identity Detection (Medium Impact)

DeepFace's `register()` and `search()` functions, backed by pgvector (which is already available in the project's PostgreSQL instance), enable **duplicate KYC detection**: when a new applicant submits a selfie, it is compared against all previously registered embeddings. A cosine distance below the model threshold flags a potential duplicate identity — a key fraud prevention control required under FATF Recommendation 10.

### 2.5 Facial Attribute Analysis for Risk Scoring (Medium Impact)

The `analyze()` function returns age, gender, and emotion predictions. While race/ethnicity data must be handled with extreme care under NDPR, **age estimation** has a direct compliance use case: the CBN KYC Manual requires that minors (under 18) be flagged for enhanced due diligence. An automated age check on the submitted selfie provides a first-pass signal before BVN cross-validation confirms the date of birth.

---

## 3. Architecture: Recommended Integration Pattern

DeepFace is a Python library. The PayGate portal runs on Node.js. The recommended pattern is a **Python FastAPI sidecar** deployed alongside the Node.js server:

```
┌─────────────────────────────────────────────────────┐
│  PayGate Node.js Server (tRPC)                      │
│                                                     │
│  checkLiveness procedure                            │
│    → POST http://localhost:5050/liveness            │
│      { frames: [base64, ...], qualityHint }         │
│                                                     │
│  submitKyc procedure                               │
│    → POST http://localhost:5050/verify-face         │
│      { selfieUrl, docFaceUrl }                      │
│                                                     │
│  kybDirectorVerify procedure                        │
│    → POST http://localhost:5050/verify-face         │
│                                                     │
│  duplicateCheck procedure                           │
│    → POST http://localhost:5050/search              │
│      { selfieUrl }                                  │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP (localhost)
┌──────────────────────▼──────────────────────────────┐
│  DeepFace FastAPI Sidecar (Python)                  │
│  POST /liveness  → anti_spoofing check              │
│  POST /verify-face → ArcFace + RetinaFace verify    │
│  POST /search    → pgvector ANN search              │
│  POST /analyze   → age/gender/emotion               │
└─────────────────────────────────────────────────────┘
```

This pattern keeps the Node.js codebase unchanged and allows the DeepFace sidecar to be scaled, updated, or replaced independently. On the Manus platform, the sidecar can be deployed as a persistent VM service (see `references/persistent-computing.md`).

---

## 4. Model Selection Recommendation

For PayGate's use case (Nigerian market, diverse skin tones, mobile camera quality), the following model configuration is recommended:

| Task | Recommended Model | Detector Backend | Rationale |
|---|---|---|---|
| KYC selfie vs. ID doc | ArcFace | RetinaFace | Highest accuracy on diverse datasets; RetinaFace +42% detection accuracy |
| KYB director verification | ArcFace | RetinaFace | Same rationale |
| Liveness / anti-spoofing | Built-in anti-spoof CNN | YOLOv8n | Fast, accurate on mobile frames |
| Duplicate detection | Facenet512 | RetinaFace | 512d embeddings give finer cosine separation |
| Age estimation | Default (VGG-Face backbone) | OpenCV | ±4.65 MAE sufficient for 18+ check |

---

## 5. Compliance Alignment

| Regulation | Requirement | DeepFace Capability |
|---|---|---|
| CBN KYC Manual §4.3 | Photo on ID must match applicant | `verify()` automates this check |
| FATF Recommendation 10 | Detect duplicate identities | `search()` + pgvector ANN |
| CBN AML/CFT §6.2 | Enhanced due diligence for minors | `analyze()` age estimation |
| NDPR Art. 2.1 | Biometric data minimisation | Embeddings stored, raw frames purged by NDPR heartbeat |
| CBN Risk-Based KYC | Risk score must reflect identity confidence | `distance` score feeds `kybRiskScore` table |

---

## 6. Implementation Effort Estimate

| Phase | Work | Estimated Effort |
|---|---|---|
| Wave 176 | DeepFace FastAPI sidecar scaffold + `/liveness` endpoint | 1 day |
| Wave 177 | `/verify-face` endpoint + KYC selfie-vs-doc integration | 1 day |
| Wave 178 | `/search` endpoint + pgvector duplicate detection | 1 day |
| Wave 179 | `/analyze` age check + KYB director verification | 0.5 day |
| Wave 180 | Load testing, NDPR embedding purge, admin review UI | 1 day |

Total: approximately **4.5 development days** to full production integration.

---

## 7. Risks and Mitigations

**Model cold-start latency.** DeepFace loads model weights on first call (~2–5 seconds). Mitigation: warm the sidecar at startup with a dummy image; use connection pooling from the Node.js side.

**GPU dependency.** DeepFace runs on CPU by default but benefits significantly from a GPU. Mitigation: ArcFace on CPU processes a single verification in ~300ms, acceptable for KYC flows. GPU can be added later via the persistent VM.

**NDPR biometric data.** Face embeddings are biometric data under NDPR. Mitigation: the NDPR purge heartbeat (Wave 173) already deletes raw frames after 90 days; embeddings stored in pgvector should be added to the same purge job.

**False rejection rate.** ArcFace has a ~0.1% false rejection rate on LFW. For a payment platform, a false rejection (legitimate user blocked) is preferable to a false acceptance (fraudster approved). Mitigation: set the threshold conservatively and route borderline cases (distance 0.3–0.4) to manual review rather than auto-reject.

---

## 8. Conclusion

DeepFace is **directly applicable** to four of PayGate's five KYC/KYB/Liveness subsystems. Its MIT licence, REST API mode, and pgvector backend support make it straightforward to integrate without replacing any existing infrastructure. The highest-priority integration is the **anti-spoofing liveness check** (addresses the reported camera noise issue with a neural classifier) and the **KYC selfie-vs-ID face match** (closes a CBN compliance gap). Both can be delivered in Wave 176–177.

---

## References

[1] DeepFace GitHub Repository — https://github.com/serengil/deepface  
[2] DeepFace Cloud API — https://deepface.dev  
[3] ArcFace: Additive Angular Margin Loss for Deep Face Recognition — https://arxiv.org/abs/1801.07698  
[4] RetinaFace: Single-stage Dense Face Localisation — https://arxiv.org/abs/1905.00641  
[5] CBN KYC Manual (2023 Revision) — https://www.cbn.gov.ng  
[6] FATF Recommendation 10 — https://www.fatf-gafi.org/recommendations.html  
[7] NDPR Implementation Framework — https://nitda.gov.ng/ndpr  
