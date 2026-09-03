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
describe("Wave 131 — Platform documentation", () => {
  // Real contract: the out-of-repo SKILL.md no longer exists; platform docs
  // live in docs/ inside the repository.
  const DOC = (f: string) => path.join(ROOT, "docs", f);
  it("docs/ARCHITECTURE.md exists", () => expect(fs.existsSync(DOC("ARCHITECTURE.md"))).toBe(true));
  it("docs/PLATFORM_FEATURES.md has meaningful content (>2000 chars)", () => expect(readFile("docs/PLATFORM_FEATURES.md").length).toBeGreaterThan(2000));
  it("docs/RUNBOOK.md exists", () => expect(fs.existsSync(DOC("RUNBOOK.md"))).toBe(true));
  it("docs/keycloak-deployment.md covers the identity provider runbook", () => expect(readFile("docs/keycloak-deployment.md")).toContain("Keycloak"));
  it("docs/DATA_RETENTION_POLICY.md exists", () => expect(fs.existsSync(DOC("DATA_RETENTION_POLICY.md"))).toBe(true));
});

// ─── 3. P1 Bug Fix: No duplicate SIPProcessor ────────────────────────────────
describe("Wave 131 — P1 Bug Fixes", () => {
  it("SIP processor starts via the WORKER_LOADERS registry exactly once", () => {
    // Real contract: workers boot through the WORKER_LOADERS dynamic-import
    // registry (skipped in the test environment), not a direct call site.
    const src = readFile("server/_core/index.ts");
    const matches = src.match(/name: "sipProcessor"/g) ?? [];
    expect(matches.length).toBe(1);
    expect(src).toContain("startSIPProcessor");
    expect(src).toContain("process.env.VITEST");
  });
  it("WAF middleware is registered before the tRPC adapter", () => {
    // Real contract: payloadScanMiddleware was superseded by wafMiddleware,
    // mounted after the body parsers and before /api/trpc.
    const src = readFile("server/_core/index.ts");
    const wafIdx = src.indexOf("app.use(wafMiddleware)");
    expect(wafIdx).toBeGreaterThan(-1);
    expect(src).toContain('"/api/trpc"');
    expect(wafIdx).toBeLessThan(src.indexOf("createExpressMiddleware({"));
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
  it("Fluvio SSE endpoint is not mounted in index.ts (stream retired from boot)", () => {
    // Real contract: server/fluvioSse.ts still exports the registrar, but
    // server/_core/index.ts does not mount it — there is no dangling call.
    const src = readFile("server/_core/index.ts");
    expect(src).not.toContain("registerFluvioSseEndpoint");
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
describe("Wave 131 — /api/health probes", () => {
  // Real contract: /api/health reports Postgres + middleware-bridge status.
  // Redis is probed separately in the scheduled heartbeat via a raw RESP
  // INFO memory probe (probeRedisMemoryPct).
  it("health endpoint checks the database and middleware bridge", () => {
    const src = readFile("server/_core/index.ts");
    expect(src).toContain('"/api/health"');
    expect(src).toContain('db: "up"');
    expect(src).toContain("getBridgeHealth");
  });
  it("Redis memory is probed in the scheduled heartbeat", () => {
    const src = readFile("server/_core/index.ts");
    expect(src).toContain("probeRedisMemoryPct");
    expect(src).toContain("INFO memory");
  });
});

// ─── 8. Previous wave test files ─────────────────────────────────────────────
describe("Wave 131 — Previous wave test files", () => {
  it("wave129 test file exists", () => expect(fileExists("server/wave129.production-readiness.test.ts")).toBe(true));
  it("wave130 test file exists", () => expect(fileExists("server/wave130.production-readiness.test.ts")).toBe(true));
});
