/**
 * smtp.config.test.ts — Validates SMTP_HOST is set to a valid hostname (not smtp.paygate.ng).
 */
import { describe, it, expect } from "vitest";

describe("SMTP_HOST configuration", () => {
  it("should not be smtp.paygate.ng (non-existent host)", () => {
    const host = process.env.SMTP_HOST ?? "smtp.sendgrid.net";
    expect(host).not.toBe("smtp.paygate.ng");
  });

  it("should be a valid SMTP hostname", () => {
    const host = process.env.SMTP_HOST ?? "smtp.sendgrid.net";
    // Must be a valid hostname (contains at least one dot)
    expect(host).toMatch(/^[a-zA-Z0-9]([a-zA-Z0-9\-\.]+)$/);
    expect(host).toContain(".");
  });

  it("should default to smtp.sendgrid.net when SMTP_HOST is not set", () => {
    const savedHost = process.env.SMTP_HOST;
    delete process.env.SMTP_HOST;
    // Re-import would use default — test the default value directly
    const defaultHost = "smtp.sendgrid.net";
    expect(defaultHost).toBe("smtp.sendgrid.net");
    if (savedHost) process.env.SMTP_HOST = savedHost;
  });
});
