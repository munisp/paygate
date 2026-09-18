/**
 * Round 45 — Audit Log UI filters, pagination, and bastion SSH docs
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

describe("Round 45 — Audit Log UI filters and pagination", () => {
  it("getKeycloakEvents accepts fromDate and toDate params", () => {
    const dbTs = readFileSync(join(ROOT, "server/db.ts"), "utf8");
    expect(dbTs).toContain("fromDate?: Date");
    expect(dbTs).toContain("toDate?: Date");
    // Real contract: getKeycloakEvents reads opts.* and builds sql`` conditions
    expect(dbTs).toContain("received_at >= ${opts.fromDate}");
    expect(dbTs).toContain("received_at <= ${opts.toDate}");
  });

  it("getKeycloakEvents accepts offset for pagination", () => {
    const dbTs = readFileSync(join(ROOT, "server/db.ts"), "utf8");
    expect(dbTs).toContain("offset?: number");
    expect(dbTs).toContain("OFFSET ${offset}");
  });

  it("getAuthEvents procedure exposes fromDate, toDate, and offset", () => {
    const routers = readFileSync(join(ROOT, "server/routers.ts"), "utf8");
    expect(routers).toContain("fromDate: z.date().optional()");
    expect(routers).toContain("toDate: z.date().optional()");
    expect(routers).toContain("offset: z.number().min(0).default(0)");
  });

  it("exportAuthEvents procedure exposes fromDate and toDate", () => {
    const routers = readFileSync(join(ROOT, "server/routers.ts"), "utf8");
    // Both getAuthEvents and exportAuthEvents should have fromDate
    const fromDateCount = (routers.match(/fromDate: z\.date\(\)\.optional\(\)/g) || []).length;
    expect(fromDateCount).toBeGreaterThanOrEqual(2);
  });

  it("AuthEvents UI page uses Calendar component for date picking", () => {
    const ui = readFileSync(join(ROOT, "client/src/pages/AuthEvents.tsx"), "utf8");
    expect(ui).toContain("Calendar");
    expect(ui).toContain("fromDate");
    expect(ui).toContain("toDate");
    expect(ui).toContain("DATE_PRESETS");
  });

  it("AuthEvents UI page has pagination controls", () => {
    const ui = readFileSync(join(ROOT, "client/src/pages/AuthEvents.tsx"), "utf8");
    expect(ui).toContain("ChevronLeft");
    expect(ui).toContain("ChevronRight");
    expect(ui).toContain("PAGE_SIZE");
    expect(ui).toContain("setPage");
  });

  it("AuthEvents UI page resets page to 0 when filters change", () => {
    const ui = readFileSync(join(ROOT, "client/src/pages/AuthEvents.tsx"), "utf8");
    expect(ui).toContain("setPage(0)");
  });

  it("AuthEvents UI page has quick date range presets", () => {
    const ui = readFileSync(join(ROOT, "client/src/pages/AuthEvents.tsx"), "utf8");
    expect(ui).toContain("Today");
    expect(ui).toContain("Last 7 days");
    expect(ui).toContain("Last 30 days");
    expect(ui).toContain("Last 90 days");
  });

  it("AuthEvents UI uses useMemo to stabilize query inputs", () => {
    const ui = readFileSync(join(ROOT, "client/src/pages/AuthEvents.tsx"), "utf8");
    expect(ui).toContain("useMemo");
    expect(ui).toContain("queryInput");
  });
});

describe("Round 45 — Keycloak bastion SSH documentation", () => {
  it("deployment docs contain bastion SSH port-forward instructions", () => {
    const docs = readFileSync(join(ROOT, "docs/keycloak-deployment.md"), "utf8");
    expect(docs).toContain("Bastion SSH");
    expect(docs).toContain("ssh -L");
    expect(docs).toContain("9090");
    expect(docs).toContain("localhost:8080");
  });

  it("deployment docs contain SSH config entry example", () => {
    const docs = readFileSync(join(ROOT, "docs/keycloak-deployment.md"), "utf8");
    expect(docs).toContain("~/.ssh/config");
    expect(docs).toContain("LocalForward");
    expect(docs).toContain("paygate-kc-tunnel");
  });

  it("deployment docs contain production deployment checklist", () => {
    const docs = readFileSync(join(ROOT, "docs/keycloak-deployment.md"), "utf8");
    expect(docs).toContain("Production Deployment Checklist");
    expect(docs).toContain("pnpm db:push");
    expect(docs).toContain("ALLOWED_ORIGINS");
    expect(docs).toContain("KEYCLOAK_WEBHOOK_SECRET");
    expect(docs).toContain("/api/health/auth-config");
  });

  it("deployment docs warn against exposing Admin port publicly", () => {
    const docs = readFileSync(join(ROOT, "docs/keycloak-deployment.md"), "utf8");
    expect(docs).toContain("not exposed publicly");
    expect(docs).toContain("keycloak-admin");
  });

  it("production checklist covers all 14 items", () => {
    const docs = readFileSync(join(ROOT, "docs/keycloak-deployment.md"), "utf8");
    // Count table rows (lines starting with | number |)
    const rows = (docs.match(/\| \d+ \|/g) || []).length;
    expect(rows).toBeGreaterThanOrEqual(14);
  });
});
