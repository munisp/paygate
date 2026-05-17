/**
 * deepfaceSidecar.ts
 * ==================
 * Node.js helper for calling the PayGate DeepFace Python sidecar.
 *
 * The sidecar runs at DEEPFACE_SIDECAR_URL (default: http://localhost:5050).
 * All functions degrade gracefully — if the sidecar is unavailable, they
 * return a fallback result so the KYC flow is never blocked.
 *
 * Endpoints proxied:
 *   POST /liveness      → checkLiveness (anti-spoofing)
 *   POST /verify-face   → verifyFace (ArcFace selfie-vs-ID)
 *   POST /register      → registerFace (embedding on KYC approval)
 *   POST /search        → searchFace (duplicate detection)
 *   POST /analyze       → analyzeFace (age/gender/emotion)
 *   GET  /health        → sidecarHealth
 */

const SIDECAR_URL =
  process.env.DEEPFACE_SIDECAR_URL ?? "http://localhost:5050";
const SIDECAR_TIMEOUT_MS = parseInt(
  process.env.DEEPFACE_SIDECAR_TIMEOUT_MS ?? "8000"
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LivenessResult {
  is_real: boolean;
  confidence: number;
  antispoof_scores: number[];
  ensemble_score: number;
  noise_level: string;
  model: string;
  latency_ms: number;
  sidecar_available: boolean;
}

export interface VerifyFaceResult {
  verified: boolean;
  distance: number;
  threshold: number;
  model: string;
  detector_backend: string;
  similarity_metric: string;
  confidence: number;
  latency_ms: number;
  sidecar_available: boolean;
}

export interface RegisterFaceResult {
  subject_id: string;
  embedding_id: string;
  embedding_dim: number;
  model: string;
  latency_ms: number;
  sidecar_available: boolean;
}

export interface SearchMatch {
  subject_id: string;
  embedding_id: string;
  distance: number;
  is_duplicate: boolean;
}

export interface SearchFaceResult {
  matches: SearchMatch[];
  query_embedding_dim: number;
  model: string;
  latency_ms: number;
  sidecar_available: boolean;
}

export interface AnalyzeFaceResult {
  age: number | null;
  gender: string | null;
  dominant_emotion: string | null;
  dominant_race: string | null;
  is_minor: boolean;
  latency_ms: number;
  sidecar_available: boolean;
}

// ---------------------------------------------------------------------------
// Internal fetch helper with timeout
// ---------------------------------------------------------------------------

async function sidecarFetch(
  path: string,
  body: object
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SIDECAR_TIMEOUT_MS);
  try {
    const res = await fetch(`${SIDECAR_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// checkLiveness — anti-spoofing via DeepFace CNN
// ---------------------------------------------------------------------------

export async function checkLivenessSidecar(
  frames: string[],
  qualityHint?: { noiseLevel?: "low" | "medium" | "high" }
): Promise<LivenessResult> {
  try {
    const res = await sidecarFetch("/liveness", {
      frames,
      quality_hint: qualityHint ?? null,
    });
    if (!res.ok) throw new Error(`Sidecar /liveness returned ${res.status}`);
    const data = await res.json();
    return { ...data, sidecar_available: true };
  } catch (err) {
    // Graceful fallback: return neutral result so KYC flow continues
    console.warn("[DeepFace Sidecar] /liveness unavailable, using fallback:", err);
    return {
      is_real: true,
      confidence: 0.5,
      antispoof_scores: frames.map(() => 0.5),
      ensemble_score: 0.5,
      noise_level: qualityHint?.noiseLevel ?? "unknown",
      model: "fallback-heuristic",
      latency_ms: 0,
      sidecar_available: false,
    };
  }
}

// ---------------------------------------------------------------------------
// verifyFace — ArcFace selfie-vs-ID document
// ---------------------------------------------------------------------------

export async function verifyFaceSidecar(
  img1: string,
  img2: string,
  options?: {
    model_name?: string;
    detector_backend?: string;
    anti_spoofing?: boolean;
  }
): Promise<VerifyFaceResult> {
  try {
    const res = await sidecarFetch("/verify-face", {
      img1,
      img2,
      model_name: options?.model_name ?? "ArcFace",
      detector_backend: options?.detector_backend ?? "retinaface",
      distance_metric: "cosine",
      anti_spoofing: options?.anti_spoofing ?? false,
    });
    if (!res.ok) throw new Error(`Sidecar /verify-face returned ${res.status}`);
    const data = await res.json();
    return { ...data, sidecar_available: true };
  } catch (err) {
    console.warn("[DeepFace Sidecar] /verify-face unavailable, using fallback:", err);
    return {
      verified: false,
      distance: 1.0,
      threshold: 0.68,
      model: "fallback",
      detector_backend: "fallback",
      similarity_metric: "cosine",
      confidence: 0,
      latency_ms: 0,
      sidecar_available: false,
    };
  }
}

// ---------------------------------------------------------------------------
// registerFace — store embedding on KYC approval
// ---------------------------------------------------------------------------

export async function registerFaceSidecar(
  subjectId: string,
  img: string,
  options?: { model_name?: string; detector_backend?: string }
): Promise<RegisterFaceResult> {
  try {
    const res = await sidecarFetch("/register", {
      subject_id: subjectId,
      img,
      model_name: options?.model_name ?? "Facenet512",
      detector_backend: options?.detector_backend ?? "retinaface",
    });
    if (!res.ok) throw new Error(`Sidecar /register returned ${res.status}`);
    const data = await res.json();
    return { ...data, sidecar_available: true };
  } catch (err) {
    console.warn("[DeepFace Sidecar] /register unavailable:", err);
    return {
      subject_id: subjectId,
      embedding_id: "",
      embedding_dim: 0,
      model: "fallback",
      latency_ms: 0,
      sidecar_available: false,
    };
  }
}

// ---------------------------------------------------------------------------
// searchFace — duplicate identity detection
// ---------------------------------------------------------------------------

export async function searchFaceSidecar(
  img: string,
  options?: { model_name?: string; detector_backend?: string; top_k?: number }
): Promise<SearchFaceResult> {
  try {
    const res = await sidecarFetch("/search", {
      img,
      model_name: options?.model_name ?? "Facenet512",
      detector_backend: options?.detector_backend ?? "retinaface",
      top_k: options?.top_k ?? 5,
    });
    if (!res.ok) throw new Error(`Sidecar /search returned ${res.status}`);
    const data = await res.json();
    return { ...data, sidecar_available: true };
  } catch (err) {
    console.warn("[DeepFace Sidecar] /search unavailable:", err);
    return {
      matches: [],
      query_embedding_dim: 0,
      model: "fallback",
      latency_ms: 0,
      sidecar_available: false,
    };
  }
}

// ---------------------------------------------------------------------------
// analyzeFace — age / gender / emotion
// ---------------------------------------------------------------------------

export async function analyzeFaceSidecar(
  img: string,
  actions?: string[]
): Promise<AnalyzeFaceResult> {
  try {
    const res = await sidecarFetch("/analyze", {
      img,
      actions: actions ?? ["age", "gender", "emotion"],
      detector_backend: "opencv",
    });
    if (!res.ok) throw new Error(`Sidecar /analyze returned ${res.status}`);
    const data = await res.json();
    return { ...data, sidecar_available: true };
  } catch (err) {
    console.warn("[DeepFace Sidecar] /analyze unavailable:", err);
    return {
      age: null,
      gender: null,
      dominant_emotion: null,
      dominant_race: null,
      is_minor: false,
      latency_ms: 0,
      sidecar_available: false,
    };
  }
}

// ---------------------------------------------------------------------------
// getEmbeddingSidecar — extract raw embedding vector for a face image
// Used by Wave 178 duplicate detection: store embedding on KYC approval
// ---------------------------------------------------------------------------

export interface GetEmbeddingResult {
  embedding: number[] | null;
  embedding_dim: number;
  model: string;
  latency_ms: number;
  sidecar_available: boolean;
}

export async function getEmbeddingSidecar(
  img: string,
  options?: { model_name?: string; detector_backend?: string }
): Promise<GetEmbeddingResult> {
  try {
    const res = await sidecarFetch("/embedding", {
      img,
      model_name: options?.model_name ?? "Facenet512",
      detector_backend: options?.detector_backend ?? "retinaface",
    });
    if (!res.ok) throw new Error(`Sidecar /embedding returned ${res.status}`);
    const data = await res.json();
    return { ...data, sidecar_available: true };
  } catch (err) {
    console.warn("[DeepFace Sidecar] /embedding unavailable:", err);
    return {
      embedding: null,
      embedding_dim: 0,
      model: "fallback",
      latency_ms: 0,
      sidecar_available: false,
    };
  }
}

// ---------------------------------------------------------------------------
// searchFaceEmbeddingSidecar — cosine-search an embedding vector against DB
// Used by Wave 178: find near-duplicate faces using stored embeddings
// ---------------------------------------------------------------------------

export interface EmbeddingSearchResult {
  match_found: boolean;
  closest_match_id: string | null;
  distance: number | null;
  model: string;
  latency_ms: number;
  sidecar_available: boolean;
}

export async function searchFaceEmbeddingSidecar(
  embedding: number[],
  options?: { threshold?: number; exclude_submission_id?: string }
): Promise<EmbeddingSearchResult> {
  try {
    const res = await sidecarFetch("/search-embedding", {
      embedding,
      threshold: options?.threshold ?? 0.4,
      exclude_subject_id: options?.exclude_submission_id ?? null,
    });
    if (!res.ok) throw new Error(`Sidecar /search-embedding returned ${res.status}`);
    const data = await res.json();
    return { ...data, sidecar_available: true };
  } catch (err) {
    console.warn("[DeepFace Sidecar] /search-embedding unavailable:", err);
    return {
      match_found: false,
      closest_match_id: null,
      distance: null,
      model: "fallback",
      latency_ms: 0,
      sidecar_available: false,
    };
  }
}

// ---------------------------------------------------------------------------
// sidecarHealth — liveness probe
// ---------------------------------------------------------------------------

export async function sidecarHealth(): Promise<{
  ok: boolean;
  deepface_ready: boolean;
  embedding_store_size: number;
}> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${SIDECAR_URL}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, deepface_ready: false, embedding_store_size: 0 };
    return { ok: true, ...(await res.json()) };
  } catch {
    return { ok: false, deepface_ready: false, embedding_store_size: 0 };
  }
}
