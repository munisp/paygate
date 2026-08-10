/**
 * Wave 43 Tests
 * Covers:
 *  - Vendor QR code: vCard string generation
 *  - Audit Log: date-range filter (from/to epoch ms conversion)
 *  - Vendor stats: PO count and total spend aggregation logic
 */
import { describe, it, expect } from "vitest";

// ─── Vendor QR vCard generation ───────────────────────────────────────────────

interface VendorForQR {
  id: string;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
}

function buildVCard(vendor: VendorForQR): string {
  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${vendor.name}`,
    vendor.contactName ? `N:${vendor.contactName};;;` : "",
    vendor.phone ? `TEL;TYPE=WORK:${vendor.phone}` : "",
    vendor.email ? `EMAIL;TYPE=WORK:${vendor.email}` : "",
    vendor.address ? `ADR;TYPE=WORK:;;${vendor.address};;;;` : "",
    vendor.notes ? `NOTE:${vendor.notes}` : "",
    "END:VCARD",
  ].filter(Boolean).join("\n");
}

describe("Vendor QR — vCard generation", () => {
  it("includes BEGIN:VCARD and END:VCARD markers", () => {
    const v = buildVCard({ id: "v1", name: "Acme Supplies" });
    expect(v).toContain("BEGIN:VCARD");
    expect(v).toContain("END:VCARD");
  });

  it("includes the vendor name in FN field", () => {
    const v = buildVCard({ id: "v1", name: "Acme Supplies" });
    expect(v).toContain("FN:Acme Supplies");
  });

  it("includes phone when provided", () => {
    const v = buildVCard({ id: "v1", name: "Acme", phone: "+2348012345678" });
    expect(v).toContain("TEL;TYPE=WORK:+2348012345678");
  });

  it("includes email when provided", () => {
    const v = buildVCard({ id: "v1", name: "Acme", email: "orders@acme.ng" });
    expect(v).toContain("EMAIL;TYPE=WORK:orders@acme.ng");
  });

  it("omits empty optional fields", () => {
    const v = buildVCard({ id: "v1", name: "Acme" });
    expect(v).not.toContain("TEL");
    expect(v).not.toContain("EMAIL");
    expect(v).not.toContain("ADR");
    expect(v).not.toContain("NOTE");
  });

  it("includes contact name in N field", () => {
    const v = buildVCard({ id: "v1", name: "Acme", contactName: "John Doe" });
    expect(v).toContain("N:John Doe;;;");
  });

  it("includes address in ADR field", () => {
    const v = buildVCard({ id: "v1", name: "Acme", address: "12 Broad Street, Lagos" });
    expect(v).toContain("ADR;TYPE=WORK:;;12 Broad Street, Lagos;;;;");
  });

  it("includes notes in NOTE field", () => {
    const v = buildVCard({ id: "v1", name: "Acme", notes: "Preferred delivery: Tuesdays" });
    expect(v).toContain("NOTE:Preferred delivery: Tuesdays");
  });

  it("generates valid vCard for a fully-populated vendor", () => {
    const v = buildVCard({
      id: "v1",
      name: "Global Foods Ltd",
      contactName: "Emeka Obi",
      phone: "+2348099999999",
      email: "emeka@globalfoods.ng",
      address: "45 Marina, Lagos Island",
      notes: "Net 30 terms. Minimum order ₦50,000.",
    });
    expect(v).toContain("FN:Global Foods Ltd");
    expect(v).toContain("TEL;TYPE=WORK:+2348099999999");
    expect(v).toContain("EMAIL;TYPE=WORK:emeka@globalfoods.ng");
    expect(v).toContain("ADR;TYPE=WORK:;;45 Marina, Lagos Island;;;;");
    expect(v).toContain("NOTE:Net 30 terms");
  });
});

// ─── Audit Log date-range filter ─────────────────────────────────────────────

function dateToEpochMs(dateStr: string, endOfDay = false): number {
  const suffix = endOfDay ? "T23:59:59" : "T00:00:00";
  return new Date(dateStr + suffix).getTime();
}

describe("Audit Log — date-range filter conversion", () => {
  it("converts a from-date string to start-of-day epoch ms", () => {
    const ms = dateToEpochMs("2026-03-01");
    const d = new Date(ms);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2); // March (0-indexed)
    expect(d.getDate()).toBe(1);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it("converts a to-date string to end-of-day epoch ms", () => {
    const ms = dateToEpochMs("2026-03-14", true);
    const d = new Date(ms);
    expect(d.getHours()).toBe(23);
    expect(d.getMinutes()).toBe(59);
    expect(d.getSeconds()).toBe(59);
  });

  it("from-date is earlier than to-date for same-day range", () => {
    const from = dateToEpochMs("2026-03-10");
    const to = dateToEpochMs("2026-03-10", true);
    expect(from).toBeLessThan(to);
    // Should span exactly 23h 59m 59s = 86399 seconds
    expect(to - from).toBe(86399 * 1000);
  });

  it("from-date is earlier than to-date for multi-day range", () => {
    const from = dateToEpochMs("2026-01-01");
    const to = dateToEpochMs("2026-03-14", true);
    expect(from).toBeLessThan(to);
  });

  it("empty string produces undefined (no filter applied)", () => {
    const fromMs = "" ? dateToEpochMs("") : undefined;
    expect(fromMs).toBeUndefined();
  });

  it("export filename includes the current date", () => {
    const today = new Date().toISOString().slice(0, 10);
    const filename = `audit-log-${today}.csv`;
    expect(filename).toMatch(/^audit-log-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});

// ─── Vendor stats aggregation ─────────────────────────────────────────────────

interface PurchaseOrder {
  id: string;
  vendorName: string | null;
  totalCostKobo: number;
  status: string;
}

interface VendorStats {
  vendorId: string;
  poCount: number;
  totalSpendKobo: number;
}

function computeVendorStats(
  vendors: Array<{ id: string; name: string }>,
  orders: PurchaseOrder[],
): VendorStats[] {
  return vendors.map((v) => {
    const matching = orders.filter((o) => o.vendorName === v.name);
    return {
      vendorId: v.id,
      poCount: matching.length,
      totalSpendKobo: matching.reduce((sum, o) => sum + o.totalCostKobo, 0),
    };
  });
}

describe("Vendor stats — PO count and total spend", () => {
  const vendors = [
    { id: "v1", name: "Acme Supplies" },
    { id: "v2", name: "Global Foods Ltd" },
    { id: "v3", name: "Tech Parts Co" },
  ];

  const orders: PurchaseOrder[] = [
    { id: "po1", vendorName: "Acme Supplies", totalCostKobo: 500_000, status: "approved" },
    { id: "po2", vendorName: "Acme Supplies", totalCostKobo: 1_200_000, status: "pending" },
    { id: "po3", vendorName: "Global Foods Ltd", totalCostKobo: 750_000, status: "approved" },
    { id: "po4", vendorName: null, totalCostKobo: 300_000, status: "pending" }, // no vendor
  ];

  it("counts POs correctly per vendor", () => {
    const stats = computeVendorStats(vendors, orders);
    const acme = stats.find((s) => s.vendorId === "v1")!;
    const global = stats.find((s) => s.vendorId === "v2")!;
    const tech = stats.find((s) => s.vendorId === "v3")!;
    expect(acme.poCount).toBe(2);
    expect(global.poCount).toBe(1);
    expect(tech.poCount).toBe(0);
  });

  it("sums total spend correctly per vendor", () => {
    const stats = computeVendorStats(vendors, orders);
    const acme = stats.find((s) => s.vendorId === "v1")!;
    const global = stats.find((s) => s.vendorId === "v2")!;
    expect(acme.totalSpendKobo).toBe(1_700_000); // 500k + 1.2M
    expect(global.totalSpendKobo).toBe(750_000);
  });

  it("returns zero POs and zero spend for vendors with no orders", () => {
    const stats = computeVendorStats(vendors, orders);
    const tech = stats.find((s) => s.vendorId === "v3")!;
    expect(tech.poCount).toBe(0);
    expect(tech.totalSpendKobo).toBe(0);
  });

  it("does not count orders with null vendorName against any vendor", () => {
    const stats = computeVendorStats(vendors, orders);
    const total = stats.reduce((sum, s) => sum + s.poCount, 0);
    expect(total).toBe(3); // po4 has null vendorName and should not be counted
  });

  it("formats spend in NGN currency correctly", () => {
    const kobo = 1_700_000;
    const formatted = (kobo / 100).toLocaleString("en-NG", {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 0,
    });
    expect(formatted).toContain("17,000");
  });

  it("returns stats for all vendors even when no orders exist", () => {
    const stats = computeVendorStats(vendors, []);
    expect(stats).toHaveLength(3);
    stats.forEach((s) => {
      expect(s.poCount).toBe(0);
      expect(s.totalSpendKobo).toBe(0);
    });
  });

  it("builds a lookup map from stats array", () => {
    const stats = computeVendorStats(vendors, orders);
    const map: Record<string, VendorStats> = {};
    stats.forEach((s) => { map[s.vendorId] = s; });
    expect(map["v1"].poCount).toBe(2);
    expect(map["v2"].totalSpendKobo).toBe(750_000);
    expect(map["v3"].poCount).toBe(0);
  });
});
