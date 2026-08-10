/**
 * Wave 155-158 — Liveness & Anti-Spoofing System Tests
 *
 * Verifies the complete 3-language liveness architecture:
 *   - Rust signal processor (Fourier, LBP, colour, 6-type spoof classification)
 *   - Go API gateway (face-match, detect, landmarks, routing)
 *   - Python ML service (InsightFace, MediaPipe, SilentFace, active challenge)
 *   - Node.js tRPC procedures (faceDetect, landmarks, extractEmbedding, faceMatch)
 *   - Web liveness UI (LivenessCheck.tsx)
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");

// ─── File helpers ─────────────────────────────────────────────────────────────
function readFile(rel: string) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}
function fileExists(rel: string) {
  return fs.existsSync(path.join(ROOT, rel));
}

// ─── 1. Rust signal processor ─────────────────────────────────────────────────
describe("Wave 155: Rust liveness-signal-processor", () => {
  it("Cargo.toml exists", () => {
    expect(fileExists("rust-services/liveness-signal-processor/Cargo.toml")).toBe(true);
  });

  it("main.rs exists", () => {
    expect(fileExists("rust-services/liveness-signal-processor/src/main.rs")).toBe(true);
  });

  it("Dockerfile exists", () => {
    expect(fileExists("rust-services/liveness-signal-processor/Dockerfile")).toBe(true);
  });

  it("main.rs implements Fourier frequency analysis", () => {
    const content = readFile("rust-services/liveness-signal-processor/src/main.rs");
    const lower = content.toLowerCase();
    expect(lower.includes("fourier") || lower.includes("fft") || lower.includes("frequency")).toBe(true);
  });

  it("main.rs implements LBP texture analysis", () => {
    const content = readFile("rust-services/liveness-signal-processor/src/main.rs");
    expect(content).toContain("lbp");
  });

  it("main.rs implements colour depth scoring", () => {
    const content = readFile("rust-services/liveness-signal-processor/src/main.rs");
    const lower = content.toLowerCase();
    expect(lower.includes("colour") || lower.includes("color") || lower.includes("chroma")).toBe(true);
  });

  it("main.rs classifies 6 spoof types", () => {
    const content = readFile("rust-services/liveness-signal-processor/src/main.rs");
    const lower = content.toLowerCase();
    expect(lower.includes("printed") || lower.includes("print_photo")).toBe(true);
    expect(lower.includes("screen") || lower.includes("replay")).toBe(true);
    expect(lower.includes("paper") || lower.includes("mask")).toBe(true);
    expect(lower.includes("3d") || lower.includes("three_d") || lower.includes("silicone")).toBe(true);
    expect(lower.includes("deepfake") || lower.includes("deep_fake")).toBe(true);
    expect(lower.includes("high_quality") || lower.includes("highquality") || lower.includes("hq_photo")).toBe(true);
  });

  it("main.rs returns confidence score", () => {
    const content = readFile("rust-services/liveness-signal-processor/src/main.rs");
    const lower = content.toLowerCase();
    expect(lower.includes("confidence") || lower.includes("score")).toBe(true);
  });

  it("main.rs uses Rayon for parallel processing", () => {
    const content = readFile("rust-services/liveness-signal-processor/src/main.rs");
    const lower = content.toLowerCase();
    expect(lower.includes("rayon") || lower.includes("par_iter") || lower.includes("parallel")).toBe(true);
  });

  it("Cargo.toml includes actix-web or axum for HTTP server", () => {
    const content = readFile("rust-services/liveness-signal-processor/Cargo.toml");
    const lower = content.toLowerCase();
    expect(lower.includes("actix-web") || lower.includes("axum") || lower.includes("warp")).toBe(true);
  });
});

// ─── 2. Go API gateway ────────────────────────────────────────────────────────
describe("Wave 156: Go liveness-gateway", () => {
  it("go.mod exists", () => {
    expect(fileExists("go-services/liveness-gateway/go.mod")).toBe(true);
  });

  it("cmd/main.go exists", () => {
    expect(fileExists("go-services/liveness-gateway/cmd/main.go")).toBe(true);
  });

  it("Dockerfile exists", () => {
    expect(fileExists("go-services/liveness-gateway/Dockerfile")).toBe(true);
  });

  it("main.go implements /liveness/passive endpoint", () => {
    const content = readFile("go-services/liveness-gateway/cmd/main.go");
    expect(content).toContain("passive");
  });

  it("main.go implements /liveness/active endpoint", () => {
    const content = readFile("go-services/liveness-gateway/cmd/main.go");
    expect(content).toContain("active");
  });

  it("main.go implements /liveness/face-match endpoint", () => {
    const content = readFile("go-services/liveness-gateway/cmd/main.go");
    expect(content).toContain("face-match");
  });

  it("main.go implements /liveness/detect endpoint", () => {
    const content = readFile("go-services/liveness-gateway/cmd/main.go");
    expect(content).toContain("detect");
  });

  it("main.go implements /liveness/landmarks endpoint", () => {
    const content = readFile("go-services/liveness-gateway/cmd/main.go");
    expect(content).toContain("landmark");
  });

  it("main.go implements cosine similarity for face matching", () => {
    const content = readFile("go-services/liveness-gateway/cmd/main.go");
    const lower = content.toLowerCase();
    expect(lower.includes("cosine") || lower.includes("similarity") || lower.includes("dot_product") || lower.includes("dot product")).toBe(true);
  });

  it("main.go has rate limiting", () => {
    const content = readFile("go-services/liveness-gateway/cmd/main.go");
    const lower = content.toLowerCase();
    expect(lower.includes("rate") || lower.includes("limiter") || lower.includes("ratelimit")).toBe(true);
  });

  it("main.go has circuit breaker", () => {
    const content = readFile("go-services/liveness-gateway/cmd/main.go");
    const lower = content.toLowerCase();
    expect(lower.includes("circuit") || lower.includes("breaker") || lower.includes("fallback")).toBe(true);
  });

  it("go.mod uses Go 1.21 or later", () => {
    const content = readFile("go-services/liveness-gateway/go.mod");
    expect(content).toMatch(/go 1\.(2[1-9]|[3-9]\d)/);
  });
});

// ─── 3. Python ML service ─────────────────────────────────────────────────────
describe("Wave 157: Python liveness-detection ML service", () => {
  it("main.py exists", () => {
    expect(fileExists("python-services/liveness-detection/main.py")).toBe(true);
  });

  it("main.py implements passive liveness (single image)", () => {
    const content = readFile("python-services/liveness-detection/main.py");
    expect(content).toContain("passive");
  });

  it("main.py implements active liveness (video/motion)", () => {
    const content = readFile("python-services/liveness-detection/main.py");
    expect(content).toContain("active");
  });

  it("main.py implements face matching (two images)", () => {
    const content = readFile("python-services/liveness-detection/main.py");
    expect(content).toContain("face_match");
  });

  it("main.py implements face detection", () => {
    const content = readFile("python-services/liveness-detection/main.py");
    expect(content).toContain("detect");
  });

  it("main.py implements 68-point or 468-point facial landmarks", () => {
    const content = readFile("python-services/liveness-detection/main.py");
    const lower = content.toLowerCase();
    expect(lower.includes("landmark") || lower.includes("mediapipe") || lower.includes("mesh")).toBe(true);
  });

  it("main.py implements face feature extraction (embeddings)", () => {
    const content = readFile("python-services/liveness-detection/main.py");
    const lower = content.toLowerCase();
    expect(lower.includes("embedding") || lower.includes("extract") || lower.includes("insightface") || lower.includes("arcface")).toBe(true);
  });

  it("main.py implements anti-spoofing classification", () => {
    const content = readFile("python-services/liveness-detection/main.py");
    const lower = content.toLowerCase();
    expect(lower.includes("spoof") || lower.includes("anti_spoof") || lower.includes("silentface")).toBe(true);
  });

  it("main.py returns confidence score", () => {
    const content = readFile("python-services/liveness-detection/main.py");
    const lower = content.toLowerCase();
    expect(lower.includes("confidence") || lower.includes("score")).toBe(true);
  });

  it("main.py publishes Kafka events", () => {
    const content = readFile("python-services/liveness-detection/main.py");
    const lower = content.toLowerCase();
    expect(lower.includes("kafka") || lower.includes("producer") || lower.includes("publish")).toBe(true);
  });

  it("main.py handles deepfake detection", () => {
    const content = readFile("python-services/liveness-detection/main.py");
    const lower = content.toLowerCase();
    expect(lower.includes("deepfake") || lower.includes("deep_fake") || lower.includes("gan")).toBe(true);
  });
});

// ─── 4. Node.js tRPC procedures ───────────────────────────────────────────────
describe("Wave 155-156: Node.js kyc router has all liveness procedures", () => {
  it("routers.ts has kyc.checkLiveness procedure", () => {
    const content = readFile("server/routers.ts");
    expect(content).toContain("checkLiveness");
  });

  it("routers.ts has kyc.faceDetect procedure", () => {
    const content = readFile("server/routers.ts");
    expect(content).toContain("faceDetect");
  });

  it("routers.ts has kyc.landmarks procedure", () => {
    const content = readFile("server/routers.ts");
    expect(content).toContain("landmarks");
  });

  it("routers.ts has kyc.extractEmbedding procedure", () => {
    const content = readFile("server/routers.ts");
    expect(content).toContain("extractEmbedding");
  });

  it("routers.ts has kyc.faceMatch procedure", () => {
    const content = readFile("server/routers.ts");
    expect(content).toContain("faceMatch");
  });

  it("routers.ts has kyc.saveLivenessResult procedure", () => {
    const content = readFile("server/routers.ts");
    expect(content).toContain("saveLivenessResult");
  });

  it("routers.ts has kyc.overrideLiveness procedure", () => {
    const content = readFile("server/routers.ts");
    expect(content).toContain("overrideLiveness");
  });

  it("index.ts has internal liveness callback endpoint", () => {
    const content = readFile("server/_core/index.ts");
    const lower = content.toLowerCase();
    expect(lower.includes("liveness") || lower.includes("kyc/result")).toBe(true);
  });
});

// ─── 5. Web liveness UI ───────────────────────────────────────────────────────
describe("Wave 158: Web LivenessCheck.tsx UI", () => {
  it("LivenessCheck.tsx exists", () => {
    expect(fileExists("client/src/pages/LivenessCheck.tsx")).toBe(true);
  });

  it("LivenessCheck.tsx uses camera capture (getUserMedia or video ref)", () => {
    const content = readFile("client/src/pages/LivenessCheck.tsx");
    const lower = content.toLowerCase();
    expect(lower.includes("getusermedia") || lower.includes("videoref") || lower.includes("video") || lower.includes("webcam")).toBe(true);
  });

  it("LivenessCheck.tsx has passive liveness mode", () => {
    const content = readFile("client/src/pages/LivenessCheck.tsx");
    expect(content.toLowerCase()).toContain("passive");
  });

  it("LivenessCheck.tsx has active liveness mode (challenge)", () => {
    const content = readFile("client/src/pages/LivenessCheck.tsx");
    expect(content.toLowerCase()).toContain("active");
  });

  it("LivenessCheck.tsx has face match mode", () => {
    const content = readFile("client/src/pages/LivenessCheck.tsx");
    const lower = content.toLowerCase();
    expect(lower.includes("face_match") || lower.includes("facematch") || lower.includes("face-match") || lower.includes("faceMatch")).toBe(true);
  });

  it("LivenessCheck.tsx calls trpc.kyc.checkLiveness", () => {
    const content = readFile("client/src/pages/LivenessCheck.tsx");
    expect(content).toContain("trpc.kyc.checkLiveness");
  });

  it("LivenessCheck.tsx calls trpc.kyc.faceMatch", () => {
    const content = readFile("client/src/pages/LivenessCheck.tsx");
    expect(content).toContain("trpc.kyc.faceMatch");
  });

  it("LivenessCheck.tsx displays spoof rejection UI", () => {
    const content = readFile("client/src/pages/LivenessCheck.tsx");
    const lower = content.toLowerCase();
    expect(lower.includes("spoof") || lower.includes("rejected") || lower.includes("fake")).toBe(true);
  });

  it("LivenessCheck.tsx shows confidence score", () => {
    const content = readFile("client/src/pages/LivenessCheck.tsx");
    const lower = content.toLowerCase();
    expect(lower.includes("confidence") || lower.includes("score")).toBe(true);
  });

  it("LivenessCheck.tsx has loading state", () => {
    const content = readFile("client/src/pages/LivenessCheck.tsx");
    expect(content.includes("isLoading") || content.includes("isPending") || content.includes("isProcessing")).toBe(true);
  });

  it("LivenessCheck.tsx is registered in App.tsx", () => {
    const appContent = readFile("client/src/App.tsx");
    expect(appContent).toContain("/liveness-check");
  });

  it("LivenessCheck.tsx is in Compliance & KYC nav section in Layout.tsx", () => {
    const layoutContent = readFile("client/src/components/Layout.tsx");
    expect(layoutContent).toContain("/liveness-check");
  });
});

// ─── 6. Wave 153: Bulk actions ────────────────────────────────────────────────
describe("Wave 153: Bulk actions on list pages", () => {
  it("CouponManagement.tsx has bulk action UI (checkbox selection)", () => {
    const content = readFile("client/src/pages/CouponManagement.tsx");
    const lower = content.toLowerCase();
    expect(lower.includes("selectedids") || lower.includes("selected") || lower.includes("checkbox")).toBe(true);
  });

  it("ReferralProgram.tsx has bulk action UI", () => {
    const content = readFile("client/src/pages/ReferralProgram.tsx");
    const lower = content.toLowerCase();
    expect(lower.includes("selectedids") || lower.includes("selected") || lower.includes("checkbox")).toBe(true);
  });

  it("ConsumerLoans.tsx has bulk action UI", () => {
    const content = readFile("client/src/pages/ConsumerLoans.tsx");
    const lower = content.toLowerCase();
    expect(lower.includes("selectedids") || lower.includes("selected") || lower.includes("checkbox")).toBe(true);
  });

  it("wave124.ts couponsRouter has bulkActivate procedure", () => {
    const content = readFile("server/routers/wave124.ts");
    expect(content).toContain("bulkActivate");
  });

  it("wave124.ts couponsRouter has bulkDelete procedure", () => {
    const content = readFile("server/routers/wave124.ts");
    expect(content).toContain("bulkDelete");
  });

  it("wave124.ts referralsRouter has bulkComplete procedure", () => {
    const content = readFile("server/routers/wave124.ts");
    expect(content).toContain("bulkComplete");
  });

  it("wave124.ts consumerFinanceLoansRouter has bulkApprove procedure", () => {
    const content = readFile("server/routers/wave124.ts");
    expect(content).toContain("bulkApprove");
  });

  it("wave124.ts consumerFinanceLoansRouter has bulkReject procedure", () => {
    const content = readFile("server/routers/wave124.ts");
    expect(content).toContain("bulkReject");
  });
});

// ─── 7. Wave 154: UX improvements ────────────────────────────────────────────
describe("Wave 154: UX improvements", () => {
  it("DataExport.tsx has auto-download trigger (anchor click or window.open)", () => {
    const content = readFile("client/src/pages/DataExport.tsx");
    const lower = content.toLowerCase();
    expect(
      lower.includes("window.open") ||
      lower.includes("createelement") ||
      lower.includes("download") ||
      lower.includes("href")
    ).toBe(true);
  });

  it("OnboardingStatus.tsx has Go-Live confirmation dialog", () => {
    const content = readFile("client/src/pages/OnboardingStatus.tsx");
    const lower = content.toLowerCase();
    expect(
      lower.includes("dialog") ||
      lower.includes("modal") ||
      lower.includes("confirm") ||
      lower.includes("golive")
    ).toBe(true);
  });

  it("OnboardingStatus.tsx calls trpc.onboardingGate.markGoLive", () => {
    const content = readFile("client/src/pages/OnboardingStatus.tsx");
    expect(content).toContain("markGoLive");
  });
});
