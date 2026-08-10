/**
 * Wave 133 — Production Hardening Tests
 * ──────────────────────────────────────
 * Covers:
 *  1. OpenSearch indexer service scaffold
 *  2. Lakehouse DuckDB/Iceberg Go package
 *  3. Keycloak realm backup script
 *  4. publishAuditEvent coverage for admin mutations
 *  5. docker-compose.production.yml opensearch-indexer service
 *  6. Go bridge lakehouse routes registration
 *  7. NDPR purge extended to face_embeddings (regression)
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");

// ─── 1. OpenSearch Indexer Service ───────────────────────────────────────────
describe("Wave 133 — OpenSearch Indexer Service", () => {
  const mainPy = path.join(ROOT, "python-services/opensearch-indexer/main.py");
  const reqTxt = path.join(ROOT, "python-services/opensearch-indexer/requirements.txt");
  const dockerfile = path.join(ROOT, "python-services/opensearch-indexer/Dockerfile");

  it("main.py exists", () => {
    expect(fs.existsSync(mainPy)).toBe(true);
  });

  it("main.py exposes /health endpoint", () => {
    const content = fs.readFileSync(mainPy, "utf-8");
    expect(content).toContain('@app.get("/health")');
  });

  it("main.py exposes /index endpoint with auth guard", () => {
    const content = fs.readFileSync(mainPy, "utf-8");
    expect(content).toContain('@app.post("/index"');
    expect(content).toContain("require_api_key");
  });

  it("main.py exposes /search endpoint", () => {
    const content = fs.readFileSync(mainPy, "utf-8");
    expect(content).toContain('@app.post("/search"');
  });

  it("main.py exposes /indices endpoint", () => {
    const content = fs.readFileSync(mainPy, "utf-8");
    expect(content).toContain('@app.get("/indices"');
  });

  it("main.py has Kafka consumer for all 4 PayGate topics", () => {
    const content = fs.readFileSync(mainPy, "utf-8");
    expect(content).toContain("paygate.transactions");
    expect(content).toContain("paygate.audit_events");
    expect(content).toContain("paygate.fraud_alerts");
    expect(content).toContain("paygate.kyc_events");
  });

  it("requirements.txt includes aiokafka and httpx", () => {
    const content = fs.readFileSync(reqTxt, "utf-8");
    expect(content).toContain("aiokafka");
    expect(content).toContain("httpx");
    expect(content).toContain("fastapi");
  });

  it("Dockerfile has HEALTHCHECK and EXPOSE 8003", () => {
    const content = fs.readFileSync(dockerfile, "utf-8");
    expect(content).toContain("HEALTHCHECK");
    expect(content).toContain("EXPOSE 8003");
  });
});

// ─── 2. docker-compose.production.yml opensearch-indexer ─────────────────────
describe("Wave 133 — docker-compose opensearch-indexer service", () => {
  const dc = path.join(ROOT, "docker-compose.production.yml");

  it("docker-compose.production.yml includes opensearch-indexer service", () => {
    const content = fs.readFileSync(dc, "utf-8");
    expect(content).toContain("opensearch-indexer:");
  });

  it("opensearch-indexer service has KAFKA_BOOTSTRAP_SERVERS env", () => {
    const content = fs.readFileSync(dc, "utf-8");
    expect(content).toContain("KAFKA_BOOTSTRAP_SERVERS");
  });

  it("opensearch-indexer service has healthcheck", () => {
    const content = fs.readFileSync(dc, "utf-8");
    // The service block contains a healthcheck
    const serviceIdx = content.indexOf("opensearch-indexer:");
    const serviceBlock = content.slice(serviceIdx, serviceIdx + 1500);
    expect(serviceBlock).toContain("healthcheck");
  });
});

// ─── 3. Lakehouse DuckDB/Iceberg Go package ───────────────────────────────────
describe("Wave 133 — Lakehouse DuckDB/Iceberg Go package", () => {
  const clientGo = path.join(ROOT, "go-bridge/internal/lakehouse/client.go");
  const stubGo = path.join(ROOT, "go-bridge/internal/lakehouse/duckdb_stub.go");

  it("client.go exists", () => {
    expect(fs.existsSync(clientGo)).toBe(true);
  });

  it("client.go defines QueryHandler, TablesHandler, ExportHandler", () => {
    const content = fs.readFileSync(clientGo, "utf-8");
    expect(content).toContain("func QueryHandler(");
    expect(content).toContain("func TablesHandler(");
    expect(content).toContain("func ExportHandler(");
  });

  it("client.go rejects mutating SQL statements", () => {
    const content = fs.readFileSync(clientGo, "utf-8");
    expect(content).toContain("mutating statements are not allowed");
  });

  it("client.go has graceful stub fallback when not configured", () => {
    const content = fs.readFileSync(clientGo, "utf-8");
    expect(content).toContain("lakehouse not configured");
  });

  it("duckdb_stub.go exists for CGO-free builds", () => {
    expect(fs.existsSync(stubGo)).toBe(true);
  });

  it("duckdb_stub.go registers duckdb driver", () => {
    const content = fs.readFileSync(stubGo, "utf-8");
    expect(content).toContain('sql.Register("duckdb"');
  });

  it("main.go registers /v1/lakehouse/* routes", () => {
    const mainGo = path.join(ROOT, "go-bridge/cmd/bridge/main.go");
    const content = fs.readFileSync(mainGo, "utf-8");
    expect(content).toContain("/v1/lakehouse/query");
    expect(content).toContain("/v1/lakehouse/tables");
    expect(content).toContain("/v1/lakehouse/export");
  });
});

// ─── 4. Keycloak realm backup script ─────────────────────────────────────────
describe("Wave 133 — Keycloak realm backup script", () => {
  const script = path.join(ROOT, "scripts/keycloak-realm-backup.sh");

  it("keycloak-realm-backup.sh exists", () => {
    expect(fs.existsSync(script)).toBe(true);
  });

  it("script is executable", () => {
    const stat = fs.statSync(script);
    // Check execute bit (owner)
    expect(stat.mode & 0o100).toBeGreaterThan(0);
  });

  it("script obtains admin token from Keycloak", () => {
    const content = fs.readFileSync(script, "utf-8");
    expect(content).toContain("openid-connect/token");
    expect(content).toContain("ACCESS_TOKEN");
  });

  it("script exports realm via admin API", () => {
    const content = fs.readFileSync(script, "utf-8");
    expect(content).toContain("/admin/realms/");
  });

  it("script uploads to S3 and enforces retention", () => {
    const content = fs.readFileSync(script, "utf-8");
    expect(content).toContain("aws s3 cp");
    expect(content).toContain("RETENTION_DAYS");
  });

  it("script validates exported JSON", () => {
    const content = fs.readFileSync(script, "utf-8");
    expect(content).toContain("JSON valid");
  });
});

// ─── 5. publishAuditEvent coverage for admin mutations ───────────────────────
describe("Wave 133 — publishAuditEvent coverage for admin mutations", () => {
  it("crud120.ts imports publishAuditEvent", () => {
    const content = fs.readFileSync(
      path.join(ROOT, "server/routers/crud120.ts"),
      "utf-8"
    );
    expect(content).toContain('import { publishAuditEvent }');
  });

  it("crud120.ts approveLoan emits audit event", () => {
    const content = fs.readFileSync(
      path.join(ROOT, "server/routers/crud120.ts"),
      "utf-8"
    );
    expect(content).toContain("emi_loan.approved");
  });

  it("crud120.ts invite code revoke emits audit event", () => {
    const content = fs.readFileSync(
      path.join(ROOT, "server/routers/crud120.ts"),
      "utf-8"
    );
    expect(content).toContain("invite_code.revoked");
  });

  it("crud120.ts money request approve emits audit event", () => {
    const content = fs.readFileSync(
      path.join(ROOT, "server/routers/crud120.ts"),
      "utf-8"
    );
    expect(content).toContain("money_request.approved");
  });

  it("crud120.ts open banking consent revoke emits audit event", () => {
    const content = fs.readFileSync(
      path.join(ROOT, "server/routers/crud120.ts"),
      "utf-8"
    );
    expect(content).toContain("open_banking_consent.revoked");
  });

  it("crud120.ts payroll run approve emits audit event", () => {
    const content = fs.readFileSync(
      path.join(ROOT, "server/routers/crud120.ts"),
      "utf-8"
    );
    expect(content).toContain("payroll_run.approved");
  });

  it("crud120.ts SDK token revoke emits audit event", () => {
    const content = fs.readFileSync(
      path.join(ROOT, "server/routers/crud120.ts"),
      "utf-8"
    );
    expect(content).toContain("sdk_token.revoked");
  });

  it("crud120b.ts imports publishAuditEvent", () => {
    const content = fs.readFileSync(
      path.join(ROOT, "server/routers/crud120b.ts"),
      "utf-8"
    );
    expect(content).toContain('import { publishAuditEvent }');
  });

  it("crud120b.ts super agent network suspend emits audit event", () => {
    const content = fs.readFileSync(
      path.join(ROOT, "server/routers/crud120b.ts"),
      "utf-8"
    );
    expect(content).toContain("super_agent_network.suspended");
  });

  it("crud120b.ts tenant suspend emits audit event", () => {
    const content = fs.readFileSync(
      path.join(ROOT, "server/routers/crud120b.ts"),
      "utf-8"
    );
    expect(content).toContain("tenant.suspended");
  });

  it("wave121.ts invoice financing approve emits audit event", () => {
    const content = fs.readFileSync(
      path.join(ROOT, "server/routers/wave121.ts"),
      "utf-8"
    );
    expect(content).toContain("invoice_financing.approved");
  });
});

// ─── 6. NDPR purge regression (Wave 132) ─────────────────────────────────────
describe("Wave 133 — NDPR purge regression", () => {
  it("index.ts NDPR purge covers face_embeddings table", () => {
    const content = fs.readFileSync(
      path.join(ROOT, "server/_core/index.ts"),
      "utf-8"
    );
    expect(content).toContain("face_embeddings");
    expect(content).toContain("embeddingsPurged");
  });
});

// ─── 7. Fluvio SSE regression (Wave 132) ─────────────────────────────────────
describe("Wave 133 — Fluvio SSE regression", () => {
  it("fluvioSse.ts exists and exposes registerFluvioSseEndpoint", () => {
    const fluvioSse = path.join(ROOT, "server/fluvioSse.ts");
    expect(fs.existsSync(fluvioSse)).toBe(true);
    const content = fs.readFileSync(fluvioSse, "utf-8");
    expect(content).toContain("registerFluvioSseEndpoint");
  });

  it("index.ts registers Fluvio SSE endpoint", () => {
    const content = fs.readFileSync(
      path.join(ROOT, "server/_core/index.ts"),
      "utf-8"
    );
    expect(content).toContain("registerFluvioSseEndpoint");
  });
});
