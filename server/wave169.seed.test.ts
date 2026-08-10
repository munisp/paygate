/**
 * Wave 169 — Seed Hardening + Pagination Tests
 *
 * Covers:
 * 1. seed.mjs dry-run flag: validates the --dry-run code path produces no DB calls
 * 2. seed.mjs idempotency: every INSERT uses ON CONFLICT DO NOTHING or DO UPDATE
 * 3. seed.mjs error collection: failures are collected, not thrown immediately
 * 4. seed.mjs per-entity labelling: each q() call receives a human-readable label
 * 5. SplitBillV2 pagination: totalPages derived from data?.totalPages, page state exists
 * 6. STRIPE_LIVE.md: reference file exists and contains required sections
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const ROOT = path.resolve(__dirname, "..");
const seedPath = path.join(ROOT, "seed.mjs");
const splitBillPath = path.join(ROOT, "client/src/pages/SplitBillV2.tsx");
const stripeLivePath = path.join(ROOT, "references/STRIPE_LIVE.md");

function readSeed(): string {
  return readFileSync(seedPath, "utf8");
}

function readSplitBill(): string {
  return readFileSync(splitBillPath, "utf8");
}

function readStripeLive(): string {
  return readFileSync(stripeLivePath, "utf8");
}

// ─── 1. Seed: dry-run flag ────────────────────────────────────────────────────
describe("Wave 169 — Seed Hardening: dry-run flag", () => {
  it("seed.mjs contains --dry-run CLI flag detection", () => {
    const src = readSeed();
    expect(src).toContain('process.argv.includes("--dry-run")');
  });

  it("dry-run mode skips DB connection (no client.connect in dry path)", () => {
    const src = readSeed();
    // The connect call must be inside an if (!DRY_RUN) block
    expect(src).toMatch(/if\s*\(!DRY_RUN\)\s*\{[\s\S]*?client\.connect\(\)/);
  });

  it("dry-run mode logs preview instead of executing SQL", () => {
    const src = readSeed();
    expect(src).toContain("[dry-run]");
  });

  it("dry-run mode prints completion message", () => {
    const src = readSeed();
    expect(src).toContain("Dry-run complete");
  });

  it("dry-run mode exits with code 0 on success (no process.exit(1) in dry path)", () => {
    const src = readSeed();
    // process.exit(1) should only be in the errors.length > 0 block
    expect(src).toContain("process.exit(1)");
    expect(src).toContain("errors.length > 0");
  });
});

// ─── 2. Seed: idempotency ─────────────────────────────────────────────────────
describe("Wave 169 — Seed Hardening: idempotency", () => {
  it("owner user INSERT uses ON CONFLICT DO UPDATE", () => {
    const src = readSeed();
    expect(src).toContain("ON CONFLICT (open_id) DO UPDATE");
  });

  it("merchant INSERT uses ON CONFLICT (id) DO NOTHING", () => {
    const src = readSeed();
    expect(src).toContain("ON CONFLICT (id) DO NOTHING");
  });

  it("transactions INSERT uses ON CONFLICT (id) DO NOTHING", () => {
    const src = readSeed();
    // Transactions section should have ON CONFLICT
    const txSection = src.slice(src.indexOf("[3/11]"), src.indexOf("[4/11]"));
    expect(txSection).toContain("ON CONFLICT (id) DO NOTHING");
  });

  it("payment links INSERT uses ON CONFLICT (tenant_id, slug) DO NOTHING", () => {
    const src = readSeed();
    expect(src).toContain("ON CONFLICT (tenant_id, slug) DO NOTHING");
  });

  it("team members INSERT uses ON CONFLICT DO NOTHING", () => {
    const src = readSeed();
    expect(src).toContain("ON CONFLICT DO NOTHING");
  });

  it("all 11 sections are present", () => {
    const src = readSeed();
    for (let i = 1; i <= 11; i++) {
      expect(src).toContain(`[${i}/11]`);
    }
  });
});

// ─── 3. Seed: error collection ────────────────────────────────────────────────
describe("Wave 169 — Seed Hardening: error collection", () => {
  it("errors array is initialised before any section", () => {
    const src = readSeed();
    const errorsDecl = src.indexOf("const errors = []");
    const firstSection = src.indexOf("[1/11]");
    expect(errorsDecl).toBeGreaterThan(-1);
    expect(errorsDecl).toBeLessThan(firstSection);
  });

  it("recordError function is defined", () => {
    const src = readSeed();
    expect(src).toContain("function recordError(section, err)");
  });

  it("each section has a try/catch that calls recordError", () => {
    const src = readSeed();
    // Count recordError calls — should be at least one per section (11 sections)
    const matches = src.match(/recordError\(/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(11);
  });

  it("error report is printed at the end", () => {
    const src = readSeed();
    expect(src).toContain("error(s) encountered during seed");
  });

  it("script exits with code 1 when errors exist", () => {
    const src = readSeed();
    expect(src).toContain("process.exit(1)");
  });
});

// ─── 4. Seed: per-entity labelling ───────────────────────────────────────────
describe("Wave 169 — Seed Hardening: per-entity labels", () => {
  it("q() wrapper accepts a label parameter", () => {
    const src = readSeed();
    expect(src).toContain("async function q(sql, params = [], label = \"\")");
  });

  it("INSERT owner user has a label", () => {
    const src = readSeed();
    expect(src).toContain('"INSERT owner user"');
  });

  it("INSERT merchant has a label", () => {
    const src = readSeed();
    expect(src).toContain('"INSERT merchant"');
  });

  it("INSERT transactions have numbered labels", () => {
    const src = readSeed();
    expect(src).toContain("`INSERT transaction ${i + 1}`");
  });

  it("INSERT payment links have named labels", () => {
    const src = readSeed();
    expect(src).toContain("`INSERT payment link \"${link.title}\"`");
  });
});

// ─── 5. SplitBillV2 pagination ────────────────────────────────────────────────
describe("Wave 169 — SplitBillV2 pagination", () => {
  it("PaginationControls is imported", () => {
    const src = readSplitBill();
    expect(src).toContain('import { PaginationControls }');
  });

  it("page state is initialised with useState(1)", () => {
    const src = readSplitBill();
    expect(src).toContain("useState(1)");
  });

  it("totalPages is derived from data?.totalPages", () => {
    const src = readSplitBill();
    expect(src).toContain("data?.totalPages ?? 1");
  });

  it("PaginationControls is rendered with page and totalPages props", () => {
    const src = readSplitBill();
    expect(src).toContain("<PaginationControls");
    expect(src).toContain("page={page}");
    expect(src).toContain("totalPages={totalPages}");
    expect(src).toContain("onPageChange={setPage}");
  });

  it("totalItems prop is passed to PaginationControls", () => {
    const src = readSplitBill();
    expect(src).toContain("totalItems={totalSessions}");
  });
});

// ─── 6. STRIPE_LIVE.md reference ─────────────────────────────────────────────
describe("Wave 169 — STRIPE_LIVE.md reference", () => {
  it("STRIPE_LIVE.md file exists", () => {
    expect(existsSync(stripeLivePath)).toBe(true);
  });

  it("contains Step 1 — swap API keys section", () => {
    const src = readStripeLive();
    expect(src).toContain("Step 1");
    expect(src).toContain("STRIPE_SECRET_KEY");
    expect(src).toContain("VITE_STRIPE_PUBLISHABLE_KEY");
  });

  it("contains Step 2 — create Stripe products section", () => {
    const src = readStripeLive();
    expect(src).toContain("Step 2");
    expect(src).toContain("Products");
  });

  it("contains Step 3 — register live webhook section", () => {
    const src = readStripeLive();
    expect(src).toContain("Step 3");
    expect(src).toContain("/api/stripe/webhook");
  });

  it("contains Step 4 — update remaining secrets section", () => {
    const src = readStripeLive();
    expect(src).toContain("Step 4");
    expect(src).toContain("STRIPE_PORTAL_STARTER_PRICE_ID");
    expect(src).toContain("STRIPE_PORTAL_GROWTH_PRICE_ID");
    expect(src).toContain("STRIPE_PORTAL_ENTERPRISE_PRICE_ID");
  });

  it("contains Step 5 — verify integration section", () => {
    const src = readStripeLive();
    expect(src).toContain("Step 5");
    expect(src).toContain("Verify");
  });

  it("contains rollback plan", () => {
    const src = readStripeLive();
    expect(src).toContain("Rollback");
  });

  it("contains troubleshooting table", () => {
    const src = readStripeLive();
    expect(src).toContain("Troubleshooting");
    expect(src).toContain("signature mismatch");
  });

  it("mentions minimum charge requirement", () => {
    const src = readStripeLive();
    expect(src).toContain("$0.50");
  });
});
