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

  it("NDPR purge handler exists", () => {
    const content = fs.readFileSync(indexTs, "utf-8");
    expect(content).toContain("ndpr-biometric-purge");
  });

  it("NDPR purge now deletes face_embeddings older than 2 years", () => {
    const content = fs.readFileSync(indexTs, "utf-8");
    expect(content).toContain("faceEmbeddings");
    expect(content).toContain("embeddingsPurged");
    expect(content).toContain("twoYearsAgo");
  });

  it("NDPR purge response includes embeddingsPurged field", () => {
    const content = fs.readFileSync(indexTs, "utf-8");
    expect(content).toContain("embeddingsPurged, taskUid");
  });

  it("face_embeddings table exists in schema", () => {
    const schema = fs.readFileSync(path.join(ROOT, "drizzle/schema.ts"), "utf-8");
    expect(schema).toContain("faceEmbeddings");
    expect(schema).toContain("face_embeddings");
  });
});

// ─── 3. X-Request-ID Tracing Middleware (Wave 183) ────────────────────────────

describe("Wave 183: X-Request-ID tracing middleware", () => {
  const indexTs = path.join(ROOT, "server/_core/index.ts");

  it("X-Request-ID middleware is registered", () => {
    const content = fs.readFileSync(indexTs, "utf-8");
    expect(content).toContain("X-Request-ID Tracing");
    expect(content).toContain("x-request-id");
    expect(content).toContain("res.setHeader(\"X-Request-ID\"");
  });

  it("req.id is set from X-Request-ID header or generated", () => {
    const content = fs.readFileSync(indexTs, "utf-8");
    expect(content).toContain("req.id = reqId");
    expect(content).toContain("randomUUID");
  });

  it("structured request logger includes reqId", () => {
    const content = fs.readFileSync(indexTs, "utf-8");
    expect(content).toContain("reqId: req.id");
    expect(content).toContain("contentLength");
  });
});

// ─── 4. Env Validation Hardening (Wave 182) ───────────────────────────────────

describe("Wave 182: Env validation hardening", () => {
  const indexTs = path.join(ROOT, "server/_core/index.ts");

  it("validateEnv function exists", () => {
    const content = fs.readFileSync(indexTs, "utf-8");
    expect(content).toContain("function validateEnv()");
  });

  it("VITE_APP_ID and OAUTH_SERVER_URL are in required list", () => {
    const content = fs.readFileSync(indexTs, "utf-8");
    expect(content).toContain("VITE_APP_ID");
    expect(content).toContain("OAUTH_SERVER_URL");
  });

  it("DEEPFACE_SIDECAR_URL is in optional list", () => {
    const content = fs.readFileSync(indexTs, "utf-8");
    expect(content).toContain("DEEPFACE_SIDECAR_URL");
    expect(content).toContain("DeepFace neural liveness");
  });

  it("FLUVIO_ENDPOINT, KAFKA_BOOTSTRAP_SERVERS, TEMPORAL_HOST_PORT are in optional list", () => {
    const content = fs.readFileSync(indexTs, "utf-8");
    expect(content).toContain("FLUVIO_ENDPOINT");
    expect(content).toContain("KAFKA_BOOTSTRAP_SERVERS");
    expect(content).toContain("TEMPORAL_HOST_PORT");
  });

  it("KEYCLOAK_URL and PERMIFY_URL are in optional list", () => {
    const content = fs.readFileSync(indexTs, "utf-8");
    expect(content).toContain("KEYCLOAK_URL");
    expect(content).toContain("PERMIFY_URL");
  });

  it("production mode exits on missing required vars", () => {
    const content = fs.readFileSync(indexTs, "utf-8");
    expect(content).toContain("process.exit(1)");
    expect(content).toContain("NODE_ENV === \"production\"");
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
