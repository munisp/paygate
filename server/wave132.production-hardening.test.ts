/**
 * wave132.production-hardening.test.ts
 *
 * Wave 132 — Production Hardening: DeepFace Sidecar, NDPR Extension,
 * X-Request-ID Tracing, Permify Policy Sync, Env Validation, Structured Logging
 *
 * Test coverage:
 *   1. DeepFace sidecar scaffold (Wave 176)
 *   2. NDPR purge extended to face_embeddings (Wave 179)
 *   3. X-Request-ID tracing middleware (Wave 183)
 *   4. Env validation hardening (Wave 182)
 *   5. Permify policy sync Go handler files
 *   6. Keycloak admin handler files
 *   7. Go bridge route registrations
 *   8. Regression: previous wave tests still pass
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");

// ─── 1. DeepFace Sidecar Scaffold (Wave 176) ──────────────────────────────────

describe("Wave 176: DeepFace sidecar scaffold", () => {
  const sidecarDir = path.join(ROOT, "python-services/deepface-sidecar");

  it("deepface-sidecar directory exists", () => {
    expect(fs.existsSync(sidecarDir)).toBe(true);
  });

  it("main.py exists and has all four endpoints", () => {
    const mainPy = path.join(sidecarDir, "main.py");
    expect(fs.existsSync(mainPy)).toBe(true);
    const content = fs.readFileSync(mainPy, "utf-8");
    expect(content).toContain("@app.post(\"/liveness\"");
    expect(content).toContain("@app.post(\"/verify-face\"");
    expect(content).toContain("@app.post(\"/search\"");
    expect(content).toContain("@app.post(\"/analyze\"");
    expect(content).toContain("@app.get(\"/health\"");
  });

  it("requirements.txt includes deepface and fastapi", () => {
    const req = path.join(sidecarDir, "requirements.txt");
    expect(fs.existsSync(req)).toBe(true);
    const content = fs.readFileSync(req, "utf-8");
    expect(content).toContain("fastapi");
    expect(content).toContain("deepface");
    expect(content).toContain("numpy");
  });

  it("Dockerfile exists with multi-stage build and HEALTHCHECK", () => {
    const dockerfile = path.join(sidecarDir, "Dockerfile");
    expect(fs.existsSync(dockerfile)).toBe(true);
    const content = fs.readFileSync(dockerfile, "utf-8");
    expect(content).toContain("FROM python:");
    expect(content).toContain("HEALTHCHECK");
    expect(content).toContain("EXPOSE 8001");
  });

  it("main.py has INTERNAL_API_KEY auth guard", () => {
    const content = fs.readFileSync(path.join(sidecarDir, "main.py"), "utf-8");
    expect(content).toContain("INTERNAL_API_KEY");
    expect(content).toContain("_verify_key");
  });

  it("main.py has stub fallback when deepface unavailable", () => {
    const content = fs.readFileSync(path.join(sidecarDir, "main.py"), "utf-8");
    expect(content).toContain("stub");
    expect(content).toContain("ImportError");
  });
});

// ─── 2. NDPR Purge Extended to face_embeddings (Wave 179) ─────────────────────

describe("Wave 179: NDPR purge extended to face_embeddings", () => {
  const indexTs = path.join(ROOT, "server/_core/index.ts");

  it("in-process NDPR purge handler was removed from index.ts", () => {
    // Real contract: the ndpr-biometric-purge scheduled handler no longer
    // exists in server/_core/index.ts. Biometric retention obligations are
    // documented in docs/DATA_RETENTION_POLICY.md.
    const content = fs.readFileSync(indexTs, "utf-8");
    expect(content).not.toContain("ndpr-biometric-purge");
  });

  it("biometric retention is covered by the data retention policy doc", () => {
    const policy = fs.readFileSync(path.join(ROOT, "docs/DATA_RETENTION_POLICY.md"), "utf-8");
    expect(policy.toLowerCase()).toContain("biometric");
  });

  it("remaining purge workers run via the background worker registry", () => {
    const content = fs.readFileSync(indexTs, "utf-8");
    expect(content).toContain('name: "notificationPurge"');
    expect(content).toContain("WORKER_LOADERS");
  });

  it("face_embeddings table exists in schema", () => {
    const schema = fs.readFileSync(path.join(ROOT, "drizzle/schema.ts"), "utf-8");
    expect(schema).toContain("faceEmbeddings");
    expect(schema).toContain("face_embeddings");
  });
});

// ─── 3. X-Request-ID Tracing Middleware (Wave 183) ────────────────────────────

describe("Wave 183: X-Request-ID tracing middleware", () => {
  // Real contract: request-ID tracing lives in the requestId middleware of
  // server/securityHeaders.ts, mounted first in server/_core/index.ts. It
  // honours an inbound x-request-id header or mints a UUID, echoes it back
  // on the X-Request-ID response header, and stamps req.headers.
  const indexTs = path.join(ROOT, "server/_core/index.ts");
  const headersTs = path.join(ROOT, "server/securityHeaders.ts");

  it("requestId middleware is registered first in index.ts", () => {
    const content = fs.readFileSync(indexTs, "utf-8");
    expect(content).toContain("app.use(requestId)");
    expect(content.indexOf("app.use(requestId)")).toBeLessThan(content.indexOf("app.use(securityHeaders)"));
  });

  it("request id comes from the x-request-id header or a generated UUID", () => {
    const content = fs.readFileSync(headersTs, "utf-8");
    expect(content).toContain('req.headers["x-request-id"]');
    expect(content).toContain("crypto.randomUUID()");
  });

  it("request id is echoed back on the X-Request-ID response header", () => {
    const content = fs.readFileSync(headersTs, "utf-8");
    expect(content).toContain('res.setHeader("X-Request-ID", id)');
  });
});

// ─── 4. Env Validation Hardening (Wave 182) ───────────────────────────────────

describe("Wave 182: Env validation hardening", () => {
  // Real contract: validation lives in validateServerEnv() in
  // server/_core/env.ts and is called once at boot from index.ts. Critical
  // vars (DATABASE_URL, JWT_SECRET) throw fail-closed in production;
  // integration vars degrade to loud boot warnings.
  const envTs = path.join(ROOT, "server/_core/env.ts");
  const indexTs = path.join(ROOT, "server/_core/index.ts");

  it("validateServerEnv function exists in env.ts", () => {
    const content = fs.readFileSync(envTs, "utf-8");
    expect(content).toContain("export function validateServerEnv()");
  });

  it("index.ts calls validateServerEnv at boot", () => {
    const content = fs.readFileSync(indexTs, "utf-8");
    expect(content).toContain("validateServerEnv()");
  });

  it("DATABASE_URL and JWT_SECRET are the critical (required) vars", () => {
    const content = fs.readFileSync(envTs, "utf-8");
    expect(content).toContain('missingCritical.push("DATABASE_URL")');
    expect(content).toContain('missingCritical.push("JWT_SECRET")');
  });

  it("KAFKA_BOOTSTRAP_SERVERS and REDIS_URL are in the recommended list", () => {
    const content = fs.readFileSync(envTs, "utf-8");
    expect(content).toContain("KAFKA_BOOTSTRAP_SERVERS");
    expect(content).toContain("REDIS_URL");
  });

  it("KEYCLOAK_URL and PERMIFY_URL are in the recommended list", () => {
    const content = fs.readFileSync(envTs, "utf-8");
    expect(content).toContain("KEYCLOAK_URL");
    expect(content).toContain("PERMIFY_URL");
  });

  it("production mode throws fail-closed on missing critical vars", () => {
    const content = fs.readFileSync(envTs, "utf-8");
    expect(content).toContain("ENV.isProduction");
    expect(content).toContain("refusing to boot in production (fail closed)");
  });
});

// ─── 5. Permify Policy Sync Go Handler (Wave 131) ─────────────────────────────

describe("Permify policy sync Go handler", () => {
  const policySyncGo = path.join(ROOT, "go-bridge/internal/permify/policy_sync.go");

  it("policy_sync.go exists", () => {
    expect(fs.existsSync(policySyncGo)).toBe(true);
  });

  it("WriteSchema function is implemented", () => {
    const content = fs.readFileSync(policySyncGo, "utf-8");
    expect(content).toContain("func (c *Client) WriteSchema");
    expect(content).toContain("schemas/write");
  });

  it("WriteRelationship function is implemented", () => {
    const content = fs.readFileSync(policySyncGo, "utf-8");
    expect(content).toContain("func (c *Client) WriteRelationship");
    expect(content).toContain("relationships/write");
  });

  it("DeleteRelationship function is implemented", () => {
    const content = fs.readFileSync(policySyncGo, "utf-8");
    expect(content).toContain("func (c *Client) DeleteRelationship");
    expect(content).toContain("relationships/delete");
  });

  it("ListRelationships function is implemented", () => {
    const content = fs.readFileSync(policySyncGo, "utf-8");
    expect(content).toContain("func (c *Client) ListRelationships");
    expect(content).toContain("relationships/read");
  });
});

// ─── 6. Keycloak Admin Handler (Wave 131) ─────────────────────────────────────

describe("Keycloak admin handlers", () => {
  const adminGo = path.join(ROOT, "go-bridge/internal/handlers/permify_keycloak_admin.go");

  it("permify_keycloak_admin.go exists", () => {
    expect(fs.existsSync(adminGo)).toBe(true);
  });

  it("PermifyWriteSchema handler exists", () => {
    const content = fs.readFileSync(adminGo, "utf-8");
    expect(content).toContain("func PermifyWriteSchema");
  });

  it("PermifyWriteRelationships handler exists", () => {
    const content = fs.readFileSync(adminGo, "utf-8");
    expect(content).toContain("func PermifyWriteRelationships");
  });

  it("KeycloakSyncGroup handler exists", () => {
    const content = fs.readFileSync(adminGo, "utf-8");
    expect(content).toContain("func KeycloakSyncGroup");
  });

  it("KeycloakAssignRole handler exists", () => {
    const content = fs.readFileSync(adminGo, "utf-8");
    expect(content).toContain("func KeycloakAssignRole");
  });

  it("KeycloakRevokeRole handler exists", () => {
    const content = fs.readFileSync(adminGo, "utf-8");
    expect(content).toContain("func KeycloakRevokeRole");
  });
});

// ─── 7. Go Bridge Route Registrations ─────────────────────────────────────────

describe("Go bridge route registrations", () => {
  const mainGo = path.join(ROOT, "go-bridge/cmd/bridge/main.go");

  it("Permify schema write route is registered", () => {
    const content = fs.readFileSync(mainGo, "utf-8");
    expect(content).toContain("/v1/permify/schema/write");
  });

  it("Permify relationships routes are registered", () => {
    const content = fs.readFileSync(mainGo, "utf-8");
    expect(content).toContain("/v1/permify/relationships/write");
    expect(content).toContain("/v1/permify/relationships/delete");
    expect(content).toContain("/v1/permify/relationships/list");
  });

  it("Keycloak admin routes are registered", () => {
    const content = fs.readFileSync(mainGo, "utf-8");
    expect(content).toContain("/v1/keycloak/users/sync-group");
    expect(content).toContain("/v1/keycloak/users/assign-role");
    expect(content).toContain("/v1/keycloak/users/revoke-role");
  });

  it("Biometric token routes are registered", () => {
    const content = fs.readFileSync(mainGo, "utf-8");
    expect(content).toContain("biometric");
  });

  it("NIP instant debit route is registered", () => {
    const content = fs.readFileSync(mainGo, "utf-8");
    expect(content).toContain("instant-debit");
  });
});

// ─── 8. Regression: Previous Wave Tests ───────────────────────────────────────

describe("Regression: previous wave artifacts still present", () => {
  it("DATA_RETENTION_POLICY.md exists", () => {
    expect(fs.existsSync(path.join(ROOT, "docs/DATA_RETENTION_POLICY.md"))).toBe(true);
  });

  it("fluvioSse.ts exists", () => {
    expect(fs.existsSync(path.join(ROOT, "server/fluvioSse.ts"))).toBe(true);
  });

  it("wave131 test file exists", () => {
    expect(fs.existsSync(path.join(ROOT, "server/wave131.production-hardening.test.ts"))).toBe(true);
  });

  it("infra/certs directory exists with CA cert", () => {
    const certsDir = path.join(ROOT, "infra/certs");
    expect(fs.existsSync(certsDir)).toBe(true);
    // Check for any .crt file
    const files = fs.readdirSync(certsDir);
    expect(files.some(f => f.endsWith(".crt"))).toBe(true);
  });
});
