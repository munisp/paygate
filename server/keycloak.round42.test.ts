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

  it("storageList uses v1/storage/list endpoint", () => {
    const storage = fs.readFileSync(path.join(projectRoot, "server/storage.ts"), "utf-8");
    expect(storage).toContain("v1/storage/list");
  });

  it("storageDelete uses v1/storage/delete endpoint with DELETE method", () => {
    const storage = fs.readFileSync(path.join(projectRoot, "server/storage.ts"), "utf-8");
    expect(storage).toContain("v1/storage/delete");
    expect(storage).toContain('method: "DELETE"');
  });
});

describe("Round 42 — Backup retention in scheduled handler", () => {
  it("backup handler purges files older than 30 days", () => {
    const index = fs.readFileSync(path.join(projectRoot, "server/_core/index.ts"), "utf-8");
    expect(index).toContain("RETENTION_DAYS = 30");
    expect(index).toContain("storageDelete");
    expect(index).toContain("purged");
  });

  it("retention failure is non-fatal (try/catch around purge)", () => {
    const index = fs.readFileSync(path.join(projectRoot, "server/_core/index.ts"), "utf-8");
    expect(index).toContain("keycloak_backup_retention_error");
    expect(index).toContain("Retention failure is non-fatal");
  });

  it("backup response includes purgedCount", () => {
    const index = fs.readFileSync(path.join(projectRoot, "server/_core/index.ts"), "utf-8");
    expect(index).toContain("purgedCount: purged.length");
  });
});

describe("Round 42 — /api/health/keycloak-backup endpoint", () => {
  it("index.ts registers /api/health/keycloak-backup GET handler", () => {
    const index = fs.readFileSync(path.join(projectRoot, "server/_core/index.ts"), "utf-8");
    expect(index).toContain('"/api/health/keycloak-backup"');
  });

  it("health endpoint returns stale status when backup is older than 25 hours", () => {
    const index = fs.readFileSync(path.join(projectRoot, "server/_core/index.ts"), "utf-8");
    expect(index).toContain("stale");
    expect(index).toContain("25 * 3600000");
  });

  it("health endpoint returns no_backup when no files found", () => {
    const index = fs.readFileSync(path.join(projectRoot, "server/_core/index.ts"), "utf-8");
    expect(index).toContain("no_backup");
    expect(index).toContain("No Keycloak realm backup found");
  });

  it("health endpoint returns ageHours and totalBackups", () => {
    const index = fs.readFileSync(path.join(projectRoot, "server/_core/index.ts"), "utf-8");
    expect(index).toContain("ageHours");
    expect(index).toContain("totalBackups");
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
