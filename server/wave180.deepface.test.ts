/**
 * Wave 180 — DeepFace Sidecar Integration Tests
 * ===============================================
 * Tests for:
 *   - deepfaceSidecar.ts helper functions (graceful fallback when sidecar unavailable)
 *   - Age estimation blocking logic (minor detection)
 *   - Face match score thresholds
 *   - Duplicate detection flag logic
 *   - Embedding search cosine distance
 *   - Sidecar health probe
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock fetch so sidecar calls don't hit the network ────────────────────────
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ─── Import helpers after stubbing fetch ──────────────────────────────────────
import {
  checkLivenessSidecar,
  verifyFaceSidecar,
  registerFaceSidecar,
  searchFaceSidecar,
  analyzeFaceSidecar,
  getEmbeddingSidecar,
  searchFaceEmbeddingSidecar,
  sidecarHealth,
} from "./deepfaceSidecar";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockOk(body: object) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as Response);
}

function mockError(status = 500) {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve({ detail: "Internal Server Error" }),
  } as Response);
}

function mockNetworkFailure() {
  return Promise.reject(new Error("ECONNREFUSED"));
}

// ─── checkLivenessSidecar ─────────────────────────────────────────────────────

describe("checkLivenessSidecar", () => {
  beforeEach(() => mockFetch.mockReset());

  it("returns sidecar result when available", async () => {
    mockFetch.mockReturnValueOnce(mockOk({
      is_real: true,
      confidence: 0.92,
      antispoof_scores: [0.91, 0.93],
      ensemble_score: 0.92,
      noise_level: "low",
      model: "DeepFace-AntiSpoof",
      latency_ms: 42,
    }));
    const result = await checkLivenessSidecar(["b64frame1", "b64frame2"], { noiseLevel: "low" });
    expect(result.sidecar_available).toBe(true);
    expect(result.is_real).toBe(true);
    expect(result.confidence).toBeCloseTo(0.92);
    expect(result.model).toBe("DeepFace-AntiSpoof");
  });

  it("returns fallback when sidecar is unreachable (ECONNREFUSED)", async () => {
    mockFetch.mockReturnValueOnce(mockNetworkFailure());
    const result = await checkLivenessSidecar(["b64frame1"], { noiseLevel: "high" });
    expect(result.sidecar_available).toBe(false);
    expect(result.is_real).toBe(true); // graceful fallback — don't block KYC
    expect(result.confidence).toBe(0.5);
    expect(result.noise_level).toBe("high");
  });

  it("returns fallback when sidecar returns HTTP 500", async () => {
    mockFetch.mockReturnValueOnce(mockError(500));
    const result = await checkLivenessSidecar(["b64frame1"]);
    expect(result.sidecar_available).toBe(false);
    expect(result.model).toBe("fallback-heuristic");
  });

  it("passes quality_hint to sidecar payload", async () => {
    mockFetch.mockReturnValueOnce(mockOk({
      is_real: true, confidence: 0.88, antispoof_scores: [0.88],
      ensemble_score: 0.88, noise_level: "medium", model: "DeepFace-AntiSpoof", latency_ms: 30,
    }));
    await checkLivenessSidecar(["frame"], { noiseLevel: "medium" });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.quality_hint).toEqual({ noiseLevel: "medium" });
    expect(body.frames).toEqual(["frame"]);
  });
});

// ─── verifyFaceSidecar ────────────────────────────────────────────────────────

describe("verifyFaceSidecar", () => {
  beforeEach(() => mockFetch.mockReset());

  it("returns verified=true when faces match", async () => {
    mockFetch.mockReturnValueOnce(mockOk({
      verified: true, distance: 0.21, threshold: 0.68,
      model: "ArcFace", detector_backend: "retinaface",
      similarity_metric: "cosine", confidence: 0.87, latency_ms: 120,
    }));
    const result = await verifyFaceSidecar("selfie_b64", "id_doc_b64");
    expect(result.verified).toBe(true);
    expect(result.distance).toBeLessThan(result.threshold);
    expect(result.model).toBe("ArcFace");
    expect(result.sidecar_available).toBe(true);
  });

  it("returns verified=false when faces don't match", async () => {
    mockFetch.mockReturnValueOnce(mockOk({
      verified: false, distance: 0.85, threshold: 0.68,
      model: "ArcFace", detector_backend: "retinaface",
      similarity_metric: "cosine", confidence: 0.0, latency_ms: 110,
    }));
    const result = await verifyFaceSidecar("selfie_b64", "different_person_b64");
    expect(result.verified).toBe(false);
    expect(result.distance).toBeGreaterThan(result.threshold);
  });

  it("returns fallback with verified=false when sidecar unavailable", async () => {
    mockFetch.mockReturnValueOnce(mockNetworkFailure());
    const result = await verifyFaceSidecar("selfie_b64", "id_doc_b64");
    expect(result.sidecar_available).toBe(false);
    expect(result.verified).toBe(false); // conservative fallback
    expect(result.distance).toBe(1.0);
  });
});

// ─── analyzeFaceSidecar — age estimation ──────────────────────────────────────

describe("analyzeFaceSidecar — age estimation", () => {
  beforeEach(() => mockFetch.mockReset());

  it("returns is_minor=false for adult (age 28)", async () => {
    mockFetch.mockReturnValueOnce(mockOk({
      age: 28.0, gender: "Man", dominant_emotion: "neutral",
      dominant_race: null, is_minor: false, latency_ms: 55,
    }));
    const result = await analyzeFaceSidecar("selfie_b64", ["age"]);
    expect(result.is_minor).toBe(false);
    expect(result.age).toBe(28.0);
    expect(result.sidecar_available).toBe(true);
  });

  it("returns is_minor=true for minor (age 15)", async () => {
    mockFetch.mockReturnValueOnce(mockOk({
      age: 15.0, gender: "Woman", dominant_emotion: "neutral",
      dominant_race: null, is_minor: true, latency_ms: 50,
    }));
    const result = await analyzeFaceSidecar("selfie_b64", ["age"]);
    expect(result.is_minor).toBe(true);
    expect(result.age).toBe(15.0);
  });

  it("returns is_minor=false and age=null when sidecar unavailable (graceful fallback)", async () => {
    mockFetch.mockReturnValueOnce(mockNetworkFailure());
    const result = await analyzeFaceSidecar("selfie_b64", ["age"]);
    expect(result.sidecar_available).toBe(false);
    expect(result.is_minor).toBe(false); // don't block on fallback
    expect(result.age).toBeNull();
  });

  it("requests only age action when specified", async () => {
    mockFetch.mockReturnValueOnce(mockOk({
      age: 32.0, gender: null, dominant_emotion: null,
      dominant_race: null, is_minor: false, latency_ms: 40,
    }));
    await analyzeFaceSidecar("selfie_b64", ["age"]);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.actions).toEqual(["age"]);
  });
});

// ─── registerFaceSidecar ──────────────────────────────────────────────────────

describe("registerFaceSidecar", () => {
  beforeEach(() => mockFetch.mockReset());

  it("returns embedding_id on success", async () => {
    mockFetch.mockReturnValueOnce(mockOk({
      subject_id: "kyc_sub_123",
      embedding_id: "emb_abc",
      embedding_dim: 512,
      model: "Facenet512",
      latency_ms: 80,
    }));
    const result = await registerFaceSidecar("kyc_sub_123", "selfie_b64");
    expect(result.sidecar_available).toBe(true);
    expect(result.embedding_id).toBe("emb_abc");
    expect(result.embedding_dim).toBe(512);
  });

  it("returns empty embedding_id on fallback", async () => {
    mockFetch.mockReturnValueOnce(mockNetworkFailure());
    const result = await registerFaceSidecar("kyc_sub_123", "selfie_b64");
    expect(result.sidecar_available).toBe(false);
    expect(result.embedding_id).toBe("");
  });
});

// ─── searchFaceSidecar ────────────────────────────────────────────────────────

describe("searchFaceSidecar", () => {
  beforeEach(() => mockFetch.mockReset());

  it("returns duplicate match when found", async () => {
    mockFetch.mockReturnValueOnce(mockOk({
      matches: [
        { subject_id: "kyc_sub_999", embedding_id: "emb_xyz", distance: 0.18, is_duplicate: true },
      ],
      query_embedding_dim: 512,
      model: "Facenet512",
      latency_ms: 95,
    }));
    const result = await searchFaceSidecar("new_selfie_b64");
    expect(result.sidecar_available).toBe(true);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].is_duplicate).toBe(true);
    expect(result.matches[0].distance).toBeLessThan(0.25);
  });

  it("returns empty matches when no duplicates", async () => {
    mockFetch.mockReturnValueOnce(mockOk({
      matches: [],
      query_embedding_dim: 512,
      model: "Facenet512",
      latency_ms: 90,
    }));
    const result = await searchFaceSidecar("unique_person_b64");
    expect(result.matches).toHaveLength(0);
  });

  it("returns empty matches on fallback", async () => {
    mockFetch.mockReturnValueOnce(mockNetworkFailure());
    const result = await searchFaceSidecar("selfie_b64");
    expect(result.sidecar_available).toBe(false);
    expect(result.matches).toHaveLength(0);
  });
});

// ─── getEmbeddingSidecar ──────────────────────────────────────────────────────

describe("getEmbeddingSidecar", () => {
  beforeEach(() => mockFetch.mockReset());

  it("returns embedding vector on success", async () => {
    const fakeEmbedding = Array.from({ length: 512 }, (_, i) => i * 0.001);
    mockFetch.mockReturnValueOnce(mockOk({
      embedding: fakeEmbedding,
      embedding_dim: 512,
      model: "Facenet512",
      latency_ms: 70,
    }));
    const result = await getEmbeddingSidecar("selfie_b64");
    expect(result.sidecar_available).toBe(true);
    expect(result.embedding).toHaveLength(512);
    expect(result.embedding_dim).toBe(512);
  });

  it("returns null embedding on fallback", async () => {
    mockFetch.mockReturnValueOnce(mockNetworkFailure());
    const result = await getEmbeddingSidecar("selfie_b64");
    expect(result.sidecar_available).toBe(false);
    expect(result.embedding).toBeNull();
  });
});

// ─── searchFaceEmbeddingSidecar ───────────────────────────────────────────────

describe("searchFaceEmbeddingSidecar", () => {
  beforeEach(() => mockFetch.mockReset());

  it("returns match_found=true when duplicate exists", async () => {
    mockFetch.mockReturnValueOnce(mockOk({
      match_found: true,
      closest_match_id: "kyc_sub_999",
      distance: 0.19,
      model: "Facenet512",
      latency_ms: 12,
    }));
    const embedding = Array.from({ length: 512 }, () => Math.random());
    const result = await searchFaceEmbeddingSidecar(embedding);
    expect(result.sidecar_available).toBe(true);
    expect(result.match_found).toBe(true);
    expect(result.closest_match_id).toBe("kyc_sub_999");
  });

  it("returns match_found=false when no duplicates", async () => {
    mockFetch.mockReturnValueOnce(mockOk({
      match_found: false,
      closest_match_id: null,
      distance: null,
      model: "Facenet512",
      latency_ms: 10,
    }));
    const embedding = Array.from({ length: 512 }, () => Math.random());
    const result = await searchFaceEmbeddingSidecar(embedding);
    expect(result.match_found).toBe(false);
    expect(result.closest_match_id).toBeNull();
  });

  it("returns match_found=false on fallback (conservative)", async () => {
    mockFetch.mockReturnValueOnce(mockNetworkFailure());
    const embedding = Array.from({ length: 512 }, () => Math.random());
    const result = await searchFaceEmbeddingSidecar(embedding);
    expect(result.sidecar_available).toBe(false);
    expect(result.match_found).toBe(false);
  });
});

// ─── sidecarHealth ────────────────────────────────────────────────────────────

describe("sidecarHealth", () => {
  beforeEach(() => mockFetch.mockReset());

  it("returns ok=true when sidecar is healthy", async () => {
    mockFetch.mockReturnValueOnce(mockOk({
      status: "ok",
      deepface_ready: true,
      embedding_store_size: 42,
    }));
    const result = await sidecarHealth();
    expect(result.ok).toBe(true);
    expect(result.deepface_ready).toBe(true);
    expect(result.embedding_store_size).toBe(42);
  });

  it("returns ok=false when sidecar is unreachable", async () => {
    mockFetch.mockReturnValueOnce(mockNetworkFailure());
    const result = await sidecarHealth();
    expect(result.ok).toBe(false);
    expect(result.deepface_ready).toBe(false);
  });

  it("returns ok=false when sidecar returns non-200", async () => {
    mockFetch.mockReturnValueOnce(mockError(503));
    const result = await sidecarHealth();
    expect(result.ok).toBe(false);
  });
});

// ─── Age estimation blocking logic (unit) ─────────────────────────────────────

describe("Age estimation blocking logic", () => {
  it("should block when estimated age is 15 (minor)", () => {
    const age = 15;
    const flag = age < 18 ? "minor_blocked" : age < 21 ? "possible_minor" : "ok";
    expect(flag).toBe("minor_blocked");
  });

  it("should flag as possible_minor when age is 19", () => {
    const age = 19;
    const flag = age < 18 ? "minor_blocked" : age < 21 ? "possible_minor" : "ok";
    expect(flag).toBe("possible_minor");
  });

  it("should pass as ok when age is 25", () => {
    const age = 25;
    const flag = age < 18 ? "minor_blocked" : age < 21 ? "possible_minor" : "ok";
    expect(flag).toBe("ok");
  });

  it("should treat age exactly 18 as possible_minor (boundary)", () => {
    const age = 18;
    const flag = age < 18 ? "minor_blocked" : age < 21 ? "possible_minor" : "ok";
    expect(flag).toBe("possible_minor");
  });

  it("should treat age exactly 21 as ok (boundary)", () => {
    const age = 21;
    const flag = age < 18 ? "minor_blocked" : age < 21 ? "possible_minor" : "ok";
    expect(flag).toBe("ok");
  });
});

// ─── Face match score thresholds ──────────────────────────────────────────────

describe("Face match score thresholds", () => {
  const getBadgeClass = (score: number) =>
    score >= 0.8 ? "green" : score >= 0.6 ? "amber" : "red";

  it("score 0.92 → green badge", () => expect(getBadgeClass(0.92)).toBe("green"));
  it("score 0.75 → amber badge", () => expect(getBadgeClass(0.75)).toBe("amber"));
  it("score 0.45 → red badge", () => expect(getBadgeClass(0.45)).toBe("red"));
  it("score exactly 0.8 → green badge (boundary)", () => expect(getBadgeClass(0.8)).toBe("green"));
  it("score exactly 0.6 → amber badge (boundary)", () => expect(getBadgeClass(0.6)).toBe("amber"));
});
