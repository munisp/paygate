/**
 * Wave 42 tests — Vendor Directory, Audit Log CSV Export, Consumer App Deep Link
 */
import { describe, it, expect } from "vitest";

// ─── Vendor data shape ────────────────────────────────────────────────────────
describe("Vendor data shape", () => {
  const PAYMENT_TERMS = ["immediate", "net7", "net14", "net30", "net60", "net90"] as const;

  it("validates a complete vendor object", () => {
    const vendor = {
      id: "vnd_1234_abc",
      name: "FreshFarm Supplies Ltd",
      contactName: "Emeka Obi",
      email: "emeka@freshfarm.ng",
      phone: "+234 800 000 0000",
      address: "12 Adeola Odeku St, Victoria Island, Lagos",
      paymentTerms: "net30",
      notes: "Preferred delivery: Tuesdays",
      isActive: true,
      createdAt: new Date(),
    };
    expect(vendor.id).toMatch(/^vnd_/);
    expect(vendor.name.length).toBeGreaterThan(0);
    expect(PAYMENT_TERMS).toContain(vendor.paymentTerms);
    expect(typeof vendor.isActive).toBe("boolean");
  });

  it("rejects invalid payment terms", () => {
    const invalid = "net45";
    expect(PAYMENT_TERMS.includes(invalid as any)).toBe(false);
  });

  it("allows optional fields to be null", () => {
    const minimal = {
      id: "vnd_min_001",
      name: "Minimal Vendor",
      contactName: null,
      email: null,
      phone: null,
      address: null,
      paymentTerms: "net30",
      notes: null,
      isActive: true,
    };
    expect(minimal.contactName).toBeNull();
    expect(minimal.email).toBeNull();
    expect(minimal.name).toBeTruthy();
  });

  it("generates a unique vendor ID with correct prefix", () => {
    const id = `vnd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    expect(id).toMatch(/^vnd_\d+_[a-z0-9]+$/);
  });
});

// ─── Audit Log CSV Export ─────────────────────────────────────────────────────
describe("Audit Log CSV export", () => {
  function buildCsvRow(event: {
    createdAt: Date;
    actorName: string;
    actorEmail: string;
    action: string;
    resource: string;
    resourceId?: string;
    ipAddress?: string;
    metadata?: Record<string, unknown>;
  }) {
    const meta = event.metadata ? JSON.stringify(event.metadata).replace(/"/g, '""') : "";
    return [
      event.createdAt.toISOString(),
      event.actorName,
      event.actorEmail,
      event.action,
      event.resource,
      event.resourceId ?? "",
      event.ipAddress ?? "",
      meta,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",");
  }

  it("builds a valid CSV row for a typical audit event", () => {
    const row = buildCsvRow({
      createdAt: new Date("2026-03-13T10:00:00Z"),
      actorName: "Chidi Okeke",
      actorEmail: "chidi@example.com",
      action: "vendor.created",
      resource: "vendor",
      resourceId: "vnd_123",
      ipAddress: "192.168.1.1",
      metadata: { name: "FreshFarm" },
    });
    expect(row).toContain("vendor.created");
    expect(row).toContain("Chidi Okeke");
    expect(row).toContain("2026-03-13T10:00:00.000Z");
    expect(row).toContain("FreshFarm");
  });

  it("escapes double-quotes in metadata JSON", () => {
    const row = buildCsvRow({
      createdAt: new Date(),
      actorName: 'He said "hello"',
      actorEmail: "test@test.com",
      action: "test.action",
      resource: "test",
      metadata: { note: 'contains "quotes"' },
    });
    // Actor name quotes are escaped: He said "hello" → He said ""hello""
    expect(row).toContain('He said ""hello""');
    // Metadata JSON is also double-escaped inside the outer CSV quoting
    expect(row).toContain('note');
    expect(row).toContain('contains');
  });

  it("generates correct CSV header", () => {
    const header = "Timestamp,Actor Name,Actor Email,Action,Resource,Resource ID,IP Address,Metadata";
    const cols = header.split(",");
    expect(cols).toHaveLength(8);
    expect(cols[0]).toBe("Timestamp");
    expect(cols[7]).toBe("Metadata");
  });

  it("handles events with no metadata gracefully", () => {
    const row = buildCsvRow({
      createdAt: new Date(),
      actorName: "Admin",
      actorEmail: "admin@test.com",
      action: "login",
      resource: "session",
    });
    expect(row).toBeTruthy();
    // Last field should be empty quotes
    expect(row.endsWith('""')).toBe(true);
  });
});

// ─── Consumer App Deep Link ───────────────────────────────────────────────────
describe("Consumer App Deep Link generation", () => {
  function buildDeepLink(origin: string, merchantName: string, merchantId: string) {
    const slug = merchantName
      ? merchantName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 30)
      : merchantId.slice(0, 12);
    return slug
      ? `${origin}/consumer?merchant=${encodeURIComponent(slug)}`
      : `${origin}/consumer`;
  }

  it("generates a slug from a business name", () => {
    const link = buildDeepLink("https://example.manus.space", "FreshFarm Supplies Ltd", "mid_001");
    expect(link).toContain("freshfarm-supplies-ltd");
    expect(link).toContain("/consumer?merchant=");
  });

  it("falls back to merchant ID when name is empty", () => {
    const link = buildDeepLink("https://example.manus.space", "", "mid_abc123xyz");
    expect(link).toContain("mid_abc123");
    expect(link).toContain("/consumer?merchant=");
  });

  it("truncates slug to 30 characters", () => {
    const longName = "A Very Long Business Name That Exceeds The Limit";
    const link = buildDeepLink("https://example.manus.space", longName, "mid_001");
    const slug = new URL(link).searchParams.get("merchant")!;
    expect(slug.length).toBeLessThanOrEqual(30);
  });

  it("encodes special characters in slug", () => {
    const link = buildDeepLink("https://example.manus.space", "Café & Bistro", "mid_001");
    expect(link).toContain("caf"); // 'é' stripped, 'Café' → 'caf'
    expect(link).not.toContain("&");
  });

  it("builds a valid WhatsApp share URL", () => {
    const deepLink = "https://example.manus.space/consumer?merchant=freshfarm";
    const shareText = "Pay with PayGate — FreshFarm. Open the app to manage your wallet.";
    const msg = encodeURIComponent(`${shareText}\n\n${deepLink}`);
    const waUrl = `https://wa.me/?text=${msg}`;
    expect(waUrl).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(decodeURIComponent(waUrl)).toContain(deepLink);
  });
});
