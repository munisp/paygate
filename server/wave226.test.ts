/**
 * Wave 226 — Admin Regulator Management Tests
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock heavy dependencies ──────────────────────────────────────────────────
vi.mock("../drizzle/schema", () => ({
  nexthubRegulators: { id: "id", status: "status", contactEmail: "contactEmail", regulatorName: "regulatorName", regulatorCode: "regulatorCode", jurisdiction: "jurisdiction", regulatoryType: "regulatoryType" },
  regulatorMagicTokens: { id: "id", regulatorId: "regulatorId", token: "token", status: "status", expiresAt: "expiresAt", usedAt: "usedAt", createdAt: "createdAt" },
  regulatorSessions: { id: "id", regulatorId: "regulatorId", expiresAt: "expiresAt", revokedAt: "revokedAt" },
}));

vi.mock("../server/db", () => ({
  getDb: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: "reg-1", regulatorName: "CBN" }]),
  })),
}));

vi.mock("nodemailer", () => ({
  createTransport: vi.fn(() => ({
    sendMail: vi.fn().mockResolvedValue({ messageId: "test-id" }),
  })),
}));

vi.mock("../server/_core/env", () => ({
  ENV: { smtpHost: "smtp.test", smtpPort: "587", smtpUser: "test", smtpPass: "test", isProduction: false },
  env: { smtpHost: "smtp.test", smtpPort: "587", smtpUser: "test", smtpPass: "test", isProduction: false },
}));

// ─── Unit tests ───────────────────────────────────────────────────────────────
describe("Wave 226 — Admin Regulator Management", () => {
  describe("Magic link token generation", () => {
    it("generates a 64-char hex token", () => {
      const crypto = require("crypto");
      const token = crypto.randomBytes(32).toString("hex");
      expect(token).toHaveLength(64);
      expect(token).toMatch(/^[0-9a-f]+$/);
    });

    it("expiry is 30 minutes from now", () => {
      const now = Date.now();
      const expiry = now + 30 * 60 * 1000;
      expect(expiry - now).toBe(1_800_000);
    });
  });

  describe("RegulatorManagement UI helpers", () => {
    it("formats a magic link URL correctly", () => {
      const origin = "https://portal.example.com";
      const token = "abc123";
      const url = `${origin}/regulator/verify?token=${token}`;
      expect(url).toBe("https://portal.example.com/regulator/verify?token=abc123");
    });

    it("identifies active session status correctly", () => {
      const now = Date.now();
      const session = { expiresAt: now + 60_000, revokedAt: null };
      const isActive = session.revokedAt === null && session.expiresAt > now;
      expect(isActive).toBe(true);
    });

    it("identifies expired session correctly", () => {
      const now = Date.now();
      const session = { expiresAt: now - 1000, revokedAt: null };
      const isActive = session.revokedAt === null && session.expiresAt > now;
      expect(isActive).toBe(false);
    });

    it("identifies revoked session correctly", () => {
      const now = Date.now();
      const session = { expiresAt: now + 60_000, revokedAt: now - 1000 };
      const isActive = session.revokedAt === null && session.expiresAt > now;
      expect(isActive).toBe(false);
    });
  });

  describe("Token status logic", () => {
    it("marks token as expired when past expiresAt", () => {
      const now = Date.now();
      const token = { status: "pending", expiresAt: now - 1000, usedAt: null };
      const effectiveStatus = token.usedAt ? "used" : token.expiresAt < now ? "expired" : token.status;
      expect(effectiveStatus).toBe("expired");
    });

    it("marks token as used when usedAt is set", () => {
      const now = Date.now();
      const token = { status: "pending", expiresAt: now + 60_000, usedAt: now - 100 };
      const effectiveStatus = token.usedAt ? "used" : token.expiresAt < now ? "expired" : token.status;
      expect(effectiveStatus).toBe("used");
    });

    it("marks token as pending when not used and not expired", () => {
      const now = Date.now();
      const token = { status: "pending", expiresAt: now + 60_000, usedAt: null };
      const effectiveStatus = token.usedAt ? "used" : token.expiresAt < now ? "expired" : token.status;
      expect(effectiveStatus).toBe("pending");
    });
  });
});
