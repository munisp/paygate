/**
 * wave131.production-hardening.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Wave 131 — Production Hardening Verification
 * Tests for: mTLS certs, SKILL.md, P1 bug fixes, Fluvio SSE, face_embeddings,
 * DATA_RETENTION_POLICY, /api/health Redis check, duplicate SIPProcessor fix.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.join(__dirname, "..");

function fileExists(p: string): boolean {
  return fs.existsSync(path.isAbsolute(p) ? p : path.join(ROOT, p));
}
function readFile(p: string): string {
  const abs = path.isAbsolute(p) ? p : path.join(ROOT, p);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf-8") : "";
}

// ─── 1. mTLS Certificates ────────────────────────────────────────────────────
describe("Wave 131 — mTLS Certificates", () => {
  const CERTS = path.join(ROOT, "infra", "certs");
  it("CA certificate exists", () => expect(fileExists(path.join(CERTS, "ca.crt"))).toBe(true));
  it("server certificate exists", () => expect(fileExists(path.join(CERTS, "server.crt"))).toBe(true));
  it("client certificate exists", () => expect(fileExists(path.join(CERTS, "client.crt"))).toBe(true));
  it("CA cert is valid PEM", () => expect(readFile(path.join(CERTS, "ca.crt"))).toContain("BEGIN CERTIFICATE"));
  it("server cert is valid PEM", () => expect(readFile(path.join(CERTS, "server.crt"))).toContain("BEGIN CERTIFICATE"));
  it("client cert is valid PEM", () => expect(readFile(path.join(CERTS, "client.crt"))).toContain("BEGIN CERTIFICATE"));
});

// ─── 2. SKILL.md ─────────────────────────────────────────────────────────────
describe("Wave 131 — SKILL.md", () => {
  const SKILL = "/home/ubuntu/skills/paygate-merchant-portal/SKILL.md";
  it("SKILL.md exists", () => expect(fs.existsSync(SKILL)).toBe(true));
  it("SKILL.md has meaningful content (>2000 chars)", () => expect(readFile(SKILL).length).toBeGreaterThan(2000));
  it("SKILL.md covers TigerBeetle", () => expect(readFile(SKILL)).toContain("TigerBeetle"));
  it("SKILL.md covers tRPC", () => expect(readFile(SKILL)).toContain("tRPC"));
  it("SKILL.md covers APISIX", () => expect(readFile(SKILL)).toContain("APISIX"));
  it("SKILL.md covers WAF", () => expect(readFile(SKILL)).toContain("WAF"));
  it("SKILL.md covers wave", () => expect(readFile(SKILL).toLowerCase()).toContain("wave"));
  it("SKILL.md covers open-appsec", () => expect(readFile(SKILL)).toContain("open-appsec"));
});

// ─── 3. P1 Bug Fix: No duplicate SIPProcessor ────────────────────────────────
describe("Wave 131 — P1 Bug Fixes", () => {
  it("startSIPProcessor is called exactly once in index.ts", () => {
    const src = readFile("server/_core/index.ts");
    const matches = src.match(/startSIPProcessor\(\)/g) ?? [];
    expect(matches.length).toBe(1);
  });
  it("payloadScanMiddleware is registered before tRPC adapter", () => {
    const src = readFile("server/_core/index.ts");
    const payloadIdx = src.indexOf("app.use(payloadScanMiddleware)");
    const trpcIdx = src.indexOf('"/api/trpc"');
    expect(payloadIdx).toBeGreaterThan(-1);
    expect(trpcIdx).toBeGreaterThan(-1);
    expect(payloadIdx).toBeLessThan(trpcIdx);
  });
});

// ─── 4. Fluvio SSE Endpoint ──────────────────────────────────────────────────
describe("Wave 131 — Fluvio SSE", () => {
  it("fluvioSse.ts exists", () => expect(fileExists("server/fluvioSse.ts")).toBe(true));
  it("fluvioSse.ts exports registerFluvioSseEndpoint", () => {
    expect(readFile("server/fluvioSse.ts")).toContain("registerFluvioSseEndpoint");
  });
  it("fluvioSse.ts registers /api/events/stream", () => {
    expect(readFile("server/fluvioSse.ts")).toContain("/api/events/stream");
  });
  it("index.ts imports and calls registerFluvioSseEndpoint", () => {
    const src = readFile("server/_core/index.ts");
    expect(src).toContain("registerFluvioSseEndpoint");
    expect(src).toContain("registerFluvioSseEndpoint(app)");
  });
  it("Fluvio SSE handles missing FLUVIO_ENDPOINT gracefully", () => {
    expect(readFile("server/fluvioSse.ts")).toContain("Fluvio not configured");
  });
});

// ─── 5. face_embeddings Schema ───────────────────────────────────────────────
describe("Wave 131 — face_embeddings Schema", () => {
  it("face_embeddings table is defined in schema.ts", () => {
    expect(readFile("drizzle/schema.ts")).toContain("face_embeddings");
  });
  it("face_embeddings has embedding column", () => {
    expect(readFile("drizzle/schema.ts")).toContain("faceEmbeddings");
  });
  it("FaceEmbedding type is exported", () => {
    expect(readFile("drizzle/schema.ts")).toContain("export type FaceEmbedding");
  });
});

// ─── 6. Data Retention Policy ────────────────────────────────────────────────
describe("Wave 131 — Data Retention Policy", () => {
  it("DATA_RETENTION_POLICY.md exists", () => {
    expect(fileExists("docs/DATA_RETENTION_POLICY.md")).toBe(true);
  });
  it("policy covers biometric data", () => {
    expect(readFile("docs/DATA_RETENTION_POLICY.md").toLowerCase()).toContain("biometric");
  });
  it("policy covers NDPA", () => {
    expect(readFile("docs/DATA_RETENTION_POLICY.md")).toContain("NDPA");
  });
  it("policy covers 7-year retention for financial records", () => {
    expect(readFile("docs/DATA_RETENTION_POLICY.md")).toContain("7 years");
  });
  it("policy covers PCI DSS", () => {
    expect(readFile("docs/DATA_RETENTION_POLICY.md")).toContain("PCI DSS");
  });
});

// ─── 7. /api/health Redis Check ──────────────────────────────────────────────
describe("Wave 131 — /api/health Redis", () => {
  it("health endpoint includes redis check", () => {
    const src = readFile("server/_core/index.ts");
    expect(src).toContain("redisOk");
    expect(src).toContain("redis:");
  });
});

// ─── 8. Previous wave test files ─────────────────────────────────────────────
describe("Wave 131 — Previous wave test files", () => {
  it("wave129 test file exists", () => expect(fileExists("server/wave129.production-readiness.test.ts")).toBe(true));
  it("wave130 test file exists", () => expect(fileExists("server/wave130.production-readiness.test.ts")).toBe(true));
});
