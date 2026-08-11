/**
 * Round 42 — Backup retention, health endpoint, restore runbook, backup management UI
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const projectRoot = path.resolve(__dirname, "..");

describe("Round 42 — S3 storage helpers", () => {
  it("storage.ts exports storageList function", () => {
    const storage = fs.readFileSync(path.join(projectRoot, "server/storage.ts"), "utf-8");
    expect(storage).toContain("export async function storageList");
  });

  it("storage.ts exports storageDelete function", () => {
    const storage = fs.readFileSync(path.join(projectRoot, "server/storage.ts"), "utf-8");
    expect(storage).toContain("export async function storageDelete");
  });

  // Real contract: storage.ts speaks directly to S3 via the AWS SDK
  // (ListObjectsV2 / DeleteObject) — the v1/storage/* HTTP proxy endpoints
  // were replaced.
  it("storageList uses the S3 ListObjectsV2 API with pagination", () => {
    const storage = fs.readFileSync(path.join(projectRoot, "server/storage.ts"), "utf-8");
    expect(storage).toContain("ListObjectsV2Command");
    expect(storage).toContain("ContinuationToken");
  });

  it("storageDelete uses the S3 DeleteObject API", () => {
    const storage = fs.readFileSync(path.join(projectRoot, "server/storage.ts"), "utf-8");
    expect(storage).toContain("DeleteObjectCommand");
  });
});

describe("Round 42 — Backup retention in the backup script", () => {
  // Real contract: retention is enforced by scripts/keycloak-realm-backup.sh
  // (BACKUP_RETENTION_DAYS, default 30) after each successful upload — there
  // is no in-process scheduled retention handler in server/_core/index.ts.
  const script = fs.readFileSync(path.join(projectRoot, "scripts/keycloak-realm-backup.sh"), "utf-8");

  it("backup script purges backups older than BACKUP_RETENTION_DAYS (default 30)", () => {
    expect(script).toContain('RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"');
    expect(script).toContain("aws s3 rm");
  });

  it("retention only targets the keycloak-backups/ prefix", () => {
    expect(script).toContain('--prefix "keycloak-backups/"');
  });

  it("backup script writes latest-backup metadata for health visibility", () => {
    expect(script).toContain("latest-backup.json");
    expect(script).toContain("size_bytes");
  });
});

describe("Round 42 — backup visibility surface", () => {
  // Real contract: the /api/health/keycloak-backup endpoint was removed.
  // Backup visibility is via the admin-only listBackups/deleteBackup tRPC
  // procedures (covered below) and the script's latest-backup.json metadata.
  it("index.ts no longer registers a dedicated keycloak-backup health endpoint", () => {
    const index = fs.readFileSync(path.join(projectRoot, "server/_core/index.ts"), "utf-8");
    expect(index).not.toContain('"/api/health/keycloak-backup"');
  });

  it("index.ts still exposes the general /api/health probe", () => {
    const index = fs.readFileSync(path.join(projectRoot, "server/_core/index.ts"), "utf-8");
    expect(index).toContain('"/api/health"');
  });
});

describe("Round 42 — Backup management tRPC procedures", () => {
  it("keycloak router exposes listBackups procedure", () => {
    const routers = fs.readFileSync(path.join(projectRoot, "server/routers.ts"), "utf-8");
    expect(routers).toContain("listBackups:");
  });

  it("keycloak router exposes deleteBackup procedure", () => {
    const routers = fs.readFileSync(path.join(projectRoot, "server/routers.ts"), "utf-8");
    expect(routers).toContain("deleteBackup:");
  });

  it("deleteBackup enforces keycloak-backups/ prefix safety check", () => {
    const routers = fs.readFileSync(path.join(projectRoot, "server/routers.ts"), "utf-8");
    expect(routers).toContain('!input.key.startsWith("keycloak-backups/")');
    expect(routers).toContain("Invalid backup key");
  });

  it("listBackups and deleteBackup are admin-only", () => {
    const routers = fs.readFileSync(path.join(projectRoot, "server/routers.ts"), "utf-8");
    expect(routers).toContain("Admin access required to list backups");
    expect(routers).toContain("Admin access required to delete backups");
  });
});

describe("Round 42 — Backup restore runbook in docs", () => {
  it("keycloak-deployment.md has a Backup Management section", () => {
    const docs = fs.readFileSync(path.join(projectRoot, "docs/keycloak-deployment.md"), "utf-8");
    expect(docs).toContain("## Backup Management");
  });

  it("docs include restore procedure steps", () => {
    const docs = fs.readFileSync(path.join(projectRoot, "docs/keycloak-deployment.md"), "utf-8");
    expect(docs).toContain("Restore Procedure");
    expect(docs).toContain("partial-export");
  });

  it("docs include backup health check curl command", () => {
    const docs = fs.readFileSync(path.join(projectRoot, "docs/keycloak-deployment.md"), "utf-8");
    expect(docs).toContain("/api/health/keycloak-backup");
  });

  it("docs mention 30-day retention policy", () => {
    const docs = fs.readFileSync(path.join(projectRoot, "docs/keycloak-deployment.md"), "utf-8");
    expect(docs).toContain("30 days");
  });
});
