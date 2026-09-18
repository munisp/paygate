/**
 * Round 41 — Keycloak Admin UI lockdown, audit log export, nightly realm backup
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const projectRoot = path.resolve(__dirname, "..");

describe("Round 41 — Keycloak Admin UI lockdown", () => {
  it("docker-compose adds keycloak-admin internal network", () => {
    const dc = fs.readFileSync(path.join(projectRoot, "docker-compose.production.yml"), "utf-8");
    expect(dc).toContain("keycloak-admin:");
    expect(dc).toContain("internal: true");
  });

  it("keycloak service references keycloak-admin network", () => {
    const dc = fs.readFileSync(path.join(projectRoot, "docker-compose.production.yml"), "utf-8");
    expect(dc).toContain("keycloak-admin");
  });

  it("keycloak port 8080 is NOT exposed to host (no uncommented ports line)", () => {
    const dc = fs.readFileSync(path.join(projectRoot, "docker-compose.production.yml"), "utf-8");
    const lines = dc.split("\n");
    const keycloakIdx = lines.findIndex(l => l.includes("container_name: paygate_keycloak"));
    const nextServiceIdx = lines.findIndex((l, i) => i > keycloakIdx + 5 && l.includes("container_name: paygate_"));
    const section = lines.slice(keycloakIdx, nextServiceIdx).join("\n");
    const uncommented = section.split("\n").find(l =>
      l.trim().startsWith("-") && l.includes(":8080") && !l.trim().startsWith("#")
    );
    expect(uncommented).toBeUndefined();
  });
});

describe("Round 41 — Audit log CSV/JSON export", () => {
  it("keycloak router exposes exportAuthEvents procedure", () => {
    const routers = fs.readFileSync(path.join(projectRoot, "server/routers.ts"), "utf-8");
    expect(routers).toContain("exportAuthEvents:");
  });

  it("exportAuthEvents accepts format enum csv|json", () => {
    const routers = fs.readFileSync(path.join(projectRoot, "server/routers.ts"), "utf-8");
    expect(routers).toContain('z.enum(["csv", "json"])');
  });

  it("exportAuthEvents enforces admin-only access", () => {
    const routers = fs.readFileSync(path.join(projectRoot, "server/routers.ts"), "utf-8");
    expect(routers).toContain("Admin access required to export auth events");
  });

  it("AuthEvents page has Export CSV and Export JSON buttons", () => {
    const page = fs.readFileSync(path.join(projectRoot, "client/src/pages/AuthEvents.tsx"), "utf-8");
    expect(page).toContain("Export CSV");
    expect(page).toContain("Export JSON");
  });

  it("AuthEvents page uses downloadFile helper for client-side download", () => {
    const page = fs.readFileSync(path.join(projectRoot, "client/src/pages/AuthEvents.tsx"), "utf-8");
    expect(page).toContain("downloadFile");
    expect(page).toContain("URL.createObjectURL");
  });
});

describe("Round 41 — Nightly Keycloak realm backup", () => {
  // Real contract: the in-process /api/scheduled/keycloak-realm-backup handler
  // was replaced by an external cron-driven shell script
  // (scripts/keycloak-realm-backup.sh, Wave 133) that exports the realm via
  // the Keycloak Admin REST API and uploads to S3. The only in-process
  // scheduled endpoint is /api/scheduled/checkBreaches, guarded to cron callers.
  const script = fs.readFileSync(path.join(projectRoot, "scripts/keycloak-realm-backup.sh"), "utf-8");

  it("backup script exists and fails closed (set -euo pipefail)", () => {
    expect(script).toContain("set -euo pipefail");
  });

  it("backup script obtains a Keycloak admin token via the master realm", () => {
    expect(script).toContain("/realms/master/protocol/openid-connect/token");
    expect(script).toContain("KEYCLOAK_ADMIN_PASSWORD");
  });

  it("backup script exports the realm via the Admin REST API", () => {
    expect(script).toContain("/admin/realms/${KC_REALM}");
  });

  it("backup script validates the exported JSON before upload", () => {
    expect(script).toContain("json.load");
  });

  it("backup script uploads realm JSON to S3 with a datestamped keycloak-backups/ key", () => {
    expect(script).toContain('BACKUP_KEY="keycloak-backups/realm-${KC_REALM}-${TIMESTAMP}.json"');
    expect(script).toContain("aws s3 cp");
  });

  it("index.ts scheduled endpoints are cron-only (sdk-authenticated)", () => {
    const index = fs.readFileSync(path.join(projectRoot, "server/_core/index.ts"), "utf-8");
    expect(index).toContain('"/api/scheduled/checkBreaches"');
    expect(index).toContain("user.isCron");
    expect(index).toContain("cron-only endpoint");
  });
});
