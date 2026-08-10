/**
 * wave26.branding.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * White-label branding tests for Wave 26.
 *
 * These tests verify per-tenant branding isolation, the tenants table schema,
 * and the correctness of branding field storage and retrieval via pg-mem.
 *
 * NOTE: All tenant INSERTs use explicit string IDs (not gen_random_uuid()) to
 * avoid duplicate-key collisions when pg-mem's NOW() is deterministic.
 *
 * Included in vitest.config.ts → pg-tests project.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { PG_AVAILABLE } from "./testHelpers";

// ─── Pool setup ───────────────────────────────────────────────────────────────
const PG_URL =
  process.env.PG_DATABASE_URL ??
  "postgresql://paygate:paygate_dev_2026@127.0.0.1:5433/paygate_dev";

let pool: Pool;

// Unique test run prefix to avoid collisions between test runs
const RUN_ID = Date.now();

beforeAll(async () => {
  if (!PG_AVAILABLE) return;
  pool = new Pool({ connectionString: PG_URL, max: 5 });
});

afterAll(async () => {
  if (pool) await pool.end().catch(() => {});
});

// ─── Schema validation ────────────────────────────────────────────────────────
describe.skipIf(!PG_AVAILABLE)("White-Label Branding — Schema Validation", () => {
  it("tenants table has primary_color column", async () => {
    const result = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'tenants' AND column_name = 'primary_color'`
    );
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows[0].column_name).toBe("primary_color");
  });

  it("tenants table has accent_color column", async () => {
    const result = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'tenants' AND column_name = 'accent_color'`
    );
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows[0].column_name).toBe("accent_color");
  });

  it("tenants table has font_family column", async () => {
    const result = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'tenants' AND column_name = 'font_family'`
    );
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows[0].column_name).toBe("font_family");
  });

  it("tenants table has logo_url column", async () => {
    const result = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'tenants' AND column_name = 'logo_url'`
    );
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows[0].column_name).toBe("logo_url");
  });

  it("tenants table has custom_domain column", async () => {
    const result = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'tenants' AND column_name = 'custom_domain'`
    );
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows[0].column_name).toBe("custom_domain");
  });

  it("tenants table has all 5 white-label branding columns", async () => {
    const result = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'tenants'
         AND column_name IN ('primary_color', 'accent_color', 'font_family', 'logo_url', 'custom_domain')`
    );
    const cols = result.rows.map((r: any) => r.column_name);
    expect(cols).toContain("primary_color");
    expect(cols).toContain("accent_color");
    expect(cols).toContain("font_family");
    expect(cols).toContain("logo_url");
    expect(cols).toContain("custom_domain");
    expect(cols.length).toBe(5);
  });
});

// ─── Default branding values ──────────────────────────────────────────────────
describe.skipIf(!PG_AVAILABLE)("White-Label Branding — Default Values", () => {
  it("new tenant gets default primary_color #6366f1", async () => {
    const id = `branding-default-primary-${RUN_ID}-1`;
    const slug = `branding-default-primary-${RUN_ID}-1`;
    await pool.query(
      `INSERT INTO tenants (id, name, slug, plan, status) VALUES ($1, $2, $3, $4, $5)`,
      [id, "Default Primary Color Tenant", slug, "starter", "active"]
    );
    const result = await pool.query(
      `SELECT primary_color FROM tenants WHERE id = $1`,
      [id]
    );
    expect(result.rows[0].primary_color).toBe("#6366f1");
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [id]);
  });

  it("new tenant gets default accent_color #8b5cf6", async () => {
    const id = `branding-default-accent-${RUN_ID}-2`;
    const slug = `branding-default-accent-${RUN_ID}-2`;
    await pool.query(
      `INSERT INTO tenants (id, name, slug, plan, status) VALUES ($1, $2, $3, $4, $5)`,
      [id, "Default Accent Color Tenant", slug, "starter", "active"]
    );
    const result = await pool.query(
      `SELECT accent_color FROM tenants WHERE id = $1`,
      [id]
    );
    expect(result.rows[0].accent_color).toBe("#8b5cf6");
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [id]);
  });

  it("new tenant gets default font_family Inter", async () => {
    const id = `branding-default-font-${RUN_ID}-3`;
    const slug = `branding-default-font-${RUN_ID}-3`;
    await pool.query(
      `INSERT INTO tenants (id, name, slug, plan, status) VALUES ($1, $2, $3, $4, $5)`,
      [id, "Default Font Tenant", slug, "starter", "active"]
    );
    const result = await pool.query(
      `SELECT font_family FROM tenants WHERE id = $1`,
      [id]
    );
    expect(result.rows[0].font_family).toBe("Inter");
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [id]);
  });

  it("new tenant has NULL logo_url by default", async () => {
    const id = `branding-default-logo-${RUN_ID}-4`;
    const slug = `branding-default-logo-${RUN_ID}-4`;
    await pool.query(
      `INSERT INTO tenants (id, name, slug, plan, status) VALUES ($1, $2, $3, $4, $5)`,
      [id, "Default Logo Tenant", slug, "starter", "active"]
    );
    const result = await pool.query(
      `SELECT logo_url FROM tenants WHERE id = $1`,
      [id]
    );
    expect(result.rows[0].logo_url).toBeNull();
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [id]);
  });

  it("new tenant has NULL custom_domain by default", async () => {
    const id = `branding-default-domain-${RUN_ID}-5`;
    const slug = `branding-default-domain-${RUN_ID}-5`;
    await pool.query(
      `INSERT INTO tenants (id, name, slug, plan, status) VALUES ($1, $2, $3, $4, $5)`,
      [id, "Default Domain Tenant", slug, "starter", "active"]
    );
    const result = await pool.query(
      `SELECT custom_domain FROM tenants WHERE id = $1`,
      [id]
    );
    expect(result.rows[0].custom_domain).toBeNull();
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [id]);
  });
});

// ─── Branding INSERT and SELECT ───────────────────────────────────────────────
describe.skipIf(!PG_AVAILABLE)("White-Label Branding — INSERT and SELECT", () => {
  it("can INSERT a tenant with full white-label branding config", async () => {
    const id = `branding-full-${RUN_ID}-6`;
    const slug = `branding-full-${RUN_ID}-6`;
    await pool.query(
      `INSERT INTO tenants (id, name, slug, plan, status, primary_color, accent_color, font_family, logo_url, custom_domain)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        "Full Branding Tenant",
        slug,
        "enterprise",
        "active",
        "#E11D48",
        "#F43F5E",
        "Poppins",
        "https://cdn.example.com/logo.png",
        "pay.example.com",
      ]
    );
    const result = await pool.query(
      `SELECT primary_color, accent_color, font_family, logo_url, custom_domain
       FROM tenants WHERE id = $1`,
      [id]
    );
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].primary_color).toBe("#E11D48");
    expect(result.rows[0].accent_color).toBe("#F43F5E");
    expect(result.rows[0].font_family).toBe("Poppins");
    expect(result.rows[0].logo_url).toBe("https://cdn.example.com/logo.png");
    expect(result.rows[0].custom_domain).toBe("pay.example.com");
    // Cleanup
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [id]);
  });

  it("can INSERT a tenant with only primary_color set", async () => {
    const id = `branding-partial-${RUN_ID}-7`;
    const slug = `branding-partial-${RUN_ID}-7`;
    await pool.query(
      `INSERT INTO tenants (id, name, slug, plan, status, primary_color)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, "Partial Branding Tenant", slug, "growth", "active", "#10B981"]
    );
    const result = await pool.query(
      `SELECT primary_color, accent_color, font_family FROM tenants WHERE id = $1`,
      [id]
    );
    expect(result.rows[0].primary_color).toBe("#10B981");
    // accent_color and font_family should have defaults
    expect(result.rows[0].accent_color).toBe("#8b5cf6");
    expect(result.rows[0].font_family).toBe("Inter");
    // Cleanup
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [id]);
  });
});

// ─── Branding UPDATE ──────────────────────────────────────────────────────────
describe.skipIf(!PG_AVAILABLE)("White-Label Branding — UPDATE", () => {
  it("can UPDATE primary_color for an existing tenant", async () => {
    const id = `branding-update-primary-${RUN_ID}-8`;
    const slug = `branding-update-primary-${RUN_ID}-8`;
    await pool.query(
      `INSERT INTO tenants (id, name, slug, plan, status) VALUES ($1, $2, $3, $4, $5)`,
      [id, "Update Primary Tenant", slug, "starter", "active"]
    );
    await pool.query(
      `UPDATE tenants SET primary_color = '#DC2626' WHERE id = $1`,
      [id]
    );
    const result = await pool.query(
      `SELECT primary_color FROM tenants WHERE id = $1`,
      [id]
    );
    expect(result.rows[0].primary_color).toBe("#DC2626");
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [id]);
  });

  it("can UPDATE all branding fields at once", async () => {
    const id = `branding-update-all-${RUN_ID}-9`;
    const slug = `branding-update-all-${RUN_ID}-9`;
    await pool.query(
      `INSERT INTO tenants (id, name, slug, plan, status) VALUES ($1, $2, $3, $4, $5)`,
      [id, "Update All Branding Tenant", slug, "growth", "active"]
    );
    await pool.query(
      `UPDATE tenants
       SET primary_color = '#7C3AED',
           accent_color = '#A78BFA',
           font_family = 'Roboto',
           logo_url = 'https://cdn.newbrand.com/logo.svg',
           custom_domain = 'checkout.newbrand.com'
       WHERE id = $1`,
      [id]
    );
    const result = await pool.query(
      `SELECT primary_color, accent_color, font_family, logo_url, custom_domain
       FROM tenants WHERE id = $1`,
      [id]
    );
    expect(result.rows[0].primary_color).toBe("#7C3AED");
    expect(result.rows[0].accent_color).toBe("#A78BFA");
    expect(result.rows[0].font_family).toBe("Roboto");
    expect(result.rows[0].logo_url).toBe("https://cdn.newbrand.com/logo.svg");
    expect(result.rows[0].custom_domain).toBe("checkout.newbrand.com");
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [id]);
  });

  it("can clear logo_url by setting it to NULL", async () => {
    const id = `branding-clear-logo-${RUN_ID}-10`;
    const slug = `branding-clear-logo-${RUN_ID}-10`;
    await pool.query(
      `INSERT INTO tenants (id, name, slug, plan, status, logo_url)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, "Clear Logo Tenant", slug, "starter", "active", "https://cdn.example.com/old-logo.png"]
    );
    await pool.query(
      `UPDATE tenants SET logo_url = NULL WHERE id = $1`,
      [id]
    );
    const result = await pool.query(
      `SELECT logo_url FROM tenants WHERE id = $1`,
      [id]
    );
    expect(result.rows[0].logo_url).toBeNull();
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [id]);
  });
});

// ─── Per-tenant isolation ─────────────────────────────────────────────────────
describe.skipIf(!PG_AVAILABLE)("White-Label Branding — Per-Tenant Isolation", () => {
  it("two tenants can have different primary colors", async () => {
    const idA = `isolation-tenant-a-${RUN_ID}-11`;
    const idB = `isolation-tenant-b-${RUN_ID}-12`;
    await pool.query(
      `INSERT INTO tenants (id, name, slug, plan, status, primary_color)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [idA, "Tenant A", idA, "starter", "active", "#EF4444"]
    );
    await pool.query(
      `INSERT INTO tenants (id, name, slug, plan, status, primary_color)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [idB, "Tenant B", idB, "growth", "active", "#3B82F6"]
    );
    const resultA = await pool.query(
      `SELECT primary_color FROM tenants WHERE id = $1`,
      [idA]
    );
    const resultB = await pool.query(
      `SELECT primary_color FROM tenants WHERE id = $1`,
      [idB]
    );
    expect(resultA.rows[0].primary_color).toBe("#EF4444");
    expect(resultB.rows[0].primary_color).toBe("#3B82F6");
    expect(resultA.rows[0].primary_color).not.toBe(resultB.rows[0].primary_color);
    // Cleanup
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [idA]);
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [idB]);
  });

  it("two tenants can have different font families", async () => {
    const idA = `font-tenant-a-${RUN_ID}-13`;
    const idB = `font-tenant-b-${RUN_ID}-14`;
    await pool.query(
      `INSERT INTO tenants (id, name, slug, plan, status, font_family)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [idA, "Font Tenant A", idA, "starter", "active", "Lato"]
    );
    await pool.query(
      `INSERT INTO tenants (id, name, slug, plan, status, font_family)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [idB, "Font Tenant B", idB, "growth", "active", "Montserrat"]
    );
    const resultA = await pool.query(
      `SELECT font_family FROM tenants WHERE id = $1`,
      [idA]
    );
    const resultB = await pool.query(
      `SELECT font_family FROM tenants WHERE id = $1`,
      [idB]
    );
    expect(resultA.rows[0].font_family).toBe("Lato");
    expect(resultB.rows[0].font_family).toBe("Montserrat");
    // Cleanup
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [idA]);
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [idB]);
  });

  it("two tenants can have different logo URLs", async () => {
    const idA = `logo-tenant-a-${RUN_ID}-15`;
    const idB = `logo-tenant-b-${RUN_ID}-16`;
    await pool.query(
      `INSERT INTO tenants (id, name, slug, plan, status, logo_url)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [idA, "Logo Tenant A", idA, "starter", "active", "https://cdn.a.com/logo.png"]
    );
    await pool.query(
      `INSERT INTO tenants (id, name, slug, plan, status, logo_url)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [idB, "Logo Tenant B", idB, "growth", "active", "https://cdn.b.com/logo.svg"]
    );
    const resultA = await pool.query(
      `SELECT logo_url FROM tenants WHERE id = $1`,
      [idA]
    );
    const resultB = await pool.query(
      `SELECT logo_url FROM tenants WHERE id = $1`,
      [idB]
    );
    expect(resultA.rows[0].logo_url).toBe("https://cdn.a.com/logo.png");
    expect(resultB.rows[0].logo_url).toBe("https://cdn.b.com/logo.svg");
    expect(resultA.rows[0].logo_url).not.toBe(resultB.rows[0].logo_url);
    // Cleanup
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [idA]);
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [idB]);
  });

  it("updating one tenant's branding does not affect another tenant", async () => {
    const idA = `cross-tenant-a-${RUN_ID}-17`;
    const idB = `cross-tenant-b-${RUN_ID}-18`;
    await pool.query(
      `INSERT INTO tenants (id, name, slug, plan, status, primary_color)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [idA, "Cross Tenant A", idA, "starter", "active", "#6366f1"]
    );
    await pool.query(
      `INSERT INTO tenants (id, name, slug, plan, status, primary_color)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [idB, "Cross Tenant B", idB, "starter", "active", "#6366f1"]
    );
    // Update only tenant A
    await pool.query(
      `UPDATE tenants SET primary_color = '#FF0000' WHERE id = $1`,
      [idA]
    );
    const resultA = await pool.query(
      `SELECT primary_color FROM tenants WHERE id = $1`,
      [idA]
    );
    const resultB = await pool.query(
      `SELECT primary_color FROM tenants WHERE id = $1`,
      [idB]
    );
    expect(resultA.rows[0].primary_color).toBe("#FF0000");
    expect(resultB.rows[0].primary_color).toBe("#6366f1"); // unchanged
    // Cleanup
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [idA]);
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [idB]);
  });

  it("can query branding for a specific tenant by slug", async () => {
    const id = `query-branding-${RUN_ID}-19`;
    const slug = `query-branding-${RUN_ID}-19`;
    await pool.query(
      `INSERT INTO tenants (id, name, slug, plan, status, primary_color, accent_color, font_family)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, "Query Branding Tenant", slug, "enterprise", "active", "#1D4ED8", "#3B82F6", "Open Sans"]
    );
    const result = await pool.query(
      `SELECT name, primary_color, accent_color, font_family
       FROM tenants WHERE slug = $1`,
      [slug]
    );
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].name).toBe("Query Branding Tenant");
    expect(result.rows[0].primary_color).toBe("#1D4ED8");
    expect(result.rows[0].accent_color).toBe("#3B82F6");
    expect(result.rows[0].font_family).toBe("Open Sans");
    // Cleanup
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [id]);
  });
});

// ─── Custom domain handling ───────────────────────────────────────────────────
describe.skipIf(!PG_AVAILABLE)("White-Label Branding — Custom Domain", () => {
  it("can set a custom domain for a tenant", async () => {
    const id = `custom-domain-set-${RUN_ID}-20`;
    const slug = `custom-domain-set-${RUN_ID}-20`;
    await pool.query(
      `INSERT INTO tenants (id, name, slug, plan, status, custom_domain)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, "Custom Domain Tenant", slug, "enterprise", "active", "pay.customdomain.io"]
    );
    const result = await pool.query(
      `SELECT custom_domain FROM tenants WHERE id = $1`,
      [id]
    );
    expect(result.rows[0].custom_domain).toBe("pay.customdomain.io");
    // Cleanup
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [id]);
  });

  it("can look up a tenant by custom_domain", async () => {
    const id = `custom-domain-lookup-${RUN_ID}-21`;
    const slug = `custom-domain-lookup-${RUN_ID}-21`;
    const domain = `lookup-${RUN_ID}.paygate.io`;
    await pool.query(
      `INSERT INTO tenants (id, name, slug, plan, status, custom_domain)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, "Domain Lookup Tenant", slug, "enterprise", "active", domain]
    );
    const result = await pool.query(
      `SELECT id, name, slug FROM tenants WHERE custom_domain = $1`,
      [domain]
    );
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].slug).toBe(slug);
    // Cleanup
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [id]);
  });

  it("can update custom_domain for an existing tenant", async () => {
    const id = `custom-domain-update-${RUN_ID}-22`;
    const slug = `custom-domain-update-${RUN_ID}-22`;
    await pool.query(
      `INSERT INTO tenants (id, name, slug, plan, status, custom_domain)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, "Domain Update Tenant", slug, "enterprise", "active", "old.domain.com"]
    );
    await pool.query(
      `UPDATE tenants SET custom_domain = 'new.domain.com' WHERE id = $1`,
      [id]
    );
    const result = await pool.query(
      `SELECT custom_domain FROM tenants WHERE id = $1`,
      [id]
    );
    expect(result.rows[0].custom_domain).toBe("new.domain.com");
    // Cleanup
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [id]);
  });
});

// ─── Branding serialization (pure logic) ─────────────────────────────────────
describe("White-Label Branding — Serialization Logic", () => {
  it("branding config can be serialized to JSON", () => {
    const branding = {
      primaryColor: "#E11D48",
      accentColor: "#F43F5E",
      fontFamily: "Poppins",
      logoUrl: "https://cdn.example.com/logo.png",
      customDomain: "pay.merchant.com",
    };
    const serialized = JSON.stringify(branding);
    const parsed = JSON.parse(serialized);
    expect(parsed.primaryColor).toBe("#E11D48");
    expect(parsed.accentColor).toBe("#F43F5E");
    expect(parsed.fontFamily).toBe("Poppins");
    expect(parsed.logoUrl).toContain("logo.png");
    expect(parsed.customDomain).toBe("pay.merchant.com");
  });

  it("branding config validates hex color format", () => {
    const isValidHexColor = (color: string): boolean =>
      /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color);
    expect(isValidHexColor("#6366f1")).toBe(true);
    expect(isValidHexColor("#8b5cf6")).toBe(true);
    expect(isValidHexColor("#E11D48")).toBe(true);
    expect(isValidHexColor("#FFF")).toBe(true);
    expect(isValidHexColor("red")).toBe(false);
    expect(isValidHexColor("rgb(0,0,0)")).toBe(false);
    expect(isValidHexColor("#GGGGGG")).toBe(false);
  });

  it("branding config validates font family names", () => {
    const validFonts = ["Inter", "Roboto", "Poppins", "Lato", "Montserrat", "Open Sans"];
    const isValidFont = (font: string): boolean =>
      validFonts.includes(font) || /^[A-Za-z\s]+$/.test(font);
    validFonts.forEach((font) => {
      expect(isValidFont(font)).toBe(true);
    });
    expect(isValidFont("")).toBe(false);
  });

  it("branding config validates custom domain format", () => {
    const isValidDomain = (domain: string): boolean =>
      /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,}$/.test(
        domain
      );
    expect(isValidDomain("pay.example.com")).toBe(true);
    expect(isValidDomain("checkout.merchant.io")).toBe(true);
    expect(isValidDomain("sub.domain.co.uk")).toBe(true);
    expect(isValidDomain("invalid")).toBe(false);
    expect(isValidDomain("")).toBe(false);
  });

  it("branding config validates logo URL format", () => {
    const isValidUrl = (url: string): boolean => {
      try {
        new URL(url);
        return true;
      } catch {
        return false;
      }
    };
    expect(isValidUrl("https://cdn.example.com/logo.png")).toBe(true);
    expect(isValidUrl("https://s3.amazonaws.com/bucket/logo.svg")).toBe(true);
    expect(isValidUrl("not-a-url")).toBe(false);
    expect(isValidUrl("")).toBe(false);
  });

  it("branding context can be merged with defaults", () => {
    const defaults = {
      primaryColor: "#6366f1",
      accentColor: "#8b5cf6",
      fontFamily: "Inter",
      logoUrl: null,
      customDomain: null,
    };
    const overrides = {
      primaryColor: "#E11D48",
      fontFamily: "Poppins",
    };
    const merged = { ...defaults, ...overrides };
    expect(merged.primaryColor).toBe("#E11D48");
    expect(merged.accentColor).toBe("#8b5cf6"); // from defaults
    expect(merged.fontFamily).toBe("Poppins");
    expect(merged.logoUrl).toBeNull(); // from defaults
  });

  it("branding config can be used to generate CSS variables", () => {
    const branding = {
      primaryColor: "#E11D48",
      accentColor: "#F43F5E",
      fontFamily: "Poppins",
    };
    const cssVars = [
      `--color-primary: ${branding.primaryColor};`,
      `--color-accent: ${branding.accentColor};`,
      `--font-family: ${branding.fontFamily}, sans-serif;`,
    ].join("\n");
    expect(cssVars).toContain("--color-primary: #E11D48");
    expect(cssVars).toContain("--color-accent: #F43F5E");
    expect(cssVars).toContain("--font-family: Poppins");
  });
});
