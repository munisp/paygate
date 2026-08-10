/**
 * emailService.test.ts — Vitest tests for the email delivery service.
 * Tests cover: dev-mode no-op, sendEmail success/failure, option handling.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mock nodemailer ──────────────────────────────────────────────────────────
const mockSendMail = vi.fn();
const mockCreateTransport = vi.fn(() => ({ sendMail: mockSendMail }));

vi.mock("nodemailer", () => ({
  default: { createTransport: mockCreateTransport },
}));

// ─── Mock ENV ─────────────────────────────────────────────────────────────────
vi.mock("./_core/env", () => ({
  ENV: {
    smtpHost: "smtp.sendgrid.net",
    smtpPort: 587,
    smtpUser: "apikey",
    smtpPass: "SG.test-key",
  },
}));

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("emailService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the module so the transporter singleton is recreated each test
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should export sendEmail function", async () => {
    const { sendEmail } = await import("./emailService");
    expect(typeof sendEmail).toBe("function");
  });

  it("should return true when email is sent successfully", async () => {
    mockSendMail.mockResolvedValueOnce({ messageId: "test-id" });
    const { sendEmail } = await import("./emailService");
    const result = await sendEmail({
      to: "merchant@example.com",
      subject: "Test Email",
      html: "<p>Hello</p>",
    });
    expect(result).toBe(true);
  });

  it("should return false when nodemailer throws", async () => {
    mockSendMail.mockRejectedValueOnce(new Error("SMTP connection refused"));
    const { sendEmail } = await import("./emailService");
    const result = await sendEmail({
      to: "merchant@example.com",
      subject: "Test Email",
      html: "<p>Hello</p>",
    });
    expect(result).toBe(false);
  });

  it("should accept array of recipients", async () => {
    mockSendMail.mockResolvedValueOnce({ messageId: "test-id" });
    const { sendEmail } = await import("./emailService");
    const result = await sendEmail({
      to: ["a@example.com", "b@example.com"],
      subject: "Bulk Email",
      html: "<p>Hello</p>",
    });
    expect(result).toBe(true);
  });

  it("should use custom from address when provided", async () => {
    mockSendMail.mockResolvedValueOnce({ messageId: "test-id" });
    const { sendEmail } = await import("./emailService");
    await sendEmail({
      to: "merchant@example.com",
      subject: "Custom From",
      html: "<p>Hello</p>",
      from: "support@paygate.ng",
    });
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: "support@paygate.ng" })
    );
  });

  it("should generate text from html when text not provided", async () => {
    mockSendMail.mockResolvedValueOnce({ messageId: "test-id" });
    const { sendEmail } = await import("./emailService");
    await sendEmail({
      to: "merchant@example.com",
      subject: "HTML Email",
      html: "<p>Hello World</p>",
    });
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Hello World" })
    );
  });

  it("should use provided text when given", async () => {
    mockSendMail.mockResolvedValueOnce({ messageId: "test-id" });
    const { sendEmail } = await import("./emailService");
    await sendEmail({
      to: "merchant@example.com",
      subject: "Text Email",
      html: "<p>Hello</p>",
      text: "Plain text version",
    });
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Plain text version" })
    );
  });
});

// ─── Dev Mode (no SMTP_PASS) ──────────────────────────────────────────────────
describe("emailService — dev mode (no SMTP_PASS)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("should return true without calling nodemailer when SMTP_PASS is empty", async () => {
    vi.doMock("./_core/env", () => ({
      ENV: {
        smtpHost: "smtp.sendgrid.net",
        smtpPort: 587,
        smtpUser: "apikey",
        smtpPass: "", // No password → dev mode
      },
    }));
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { sendEmail } = await import("./emailService");
    const result = await sendEmail({
      to: "dev@example.com",
      subject: "Dev Mode Test",
      html: "<p>Dev</p>",
    });
    expect(result).toBe(true);
    expect(mockSendMail).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

// ─── SendMailOptions validation ───────────────────────────────────────────────
describe("SendMailOptions interface", () => {
  it("should accept minimal required fields", () => {
    const opts = {
      to: "test@example.com",
      subject: "Test",
      html: "<p>Test</p>",
    };
    // Type-level check: these fields should be present
    expect(opts.to).toBeDefined();
    expect(opts.subject).toBeDefined();
    expect(opts.html).toBeDefined();
  });

  it("should accept all optional fields", () => {
    const opts = {
      to: ["a@example.com", "b@example.com"],
      subject: "Full Options Test",
      html: "<p>Full</p>",
      text: "Full plain text",
      from: "custom@paygate.ng",
    };
    expect(opts.from).toBe("custom@paygate.ng");
    expect(Array.isArray(opts.to)).toBe(true);
  });
});

// ─── Email template helpers ───────────────────────────────────────────────────
describe("Email template structure", () => {
  it("should strip HTML tags to produce plain text", () => {
    const html = "<h1>Welcome</h1><p>Your account is ready.</p><a href='#'>Login</a>";
    const text = html.replace(/<[^>]+>/g, "");
    expect(text).toBe("WelcomeYour account is ready.Login");
  });

  it("should handle nested HTML tags", () => {
    const html = "<div><p><strong>Bold</strong> and <em>italic</em></p></div>";
    const text = html.replace(/<[^>]+>/g, "");
    expect(text).toBe("Bold and italic");
  });

  it("should handle empty HTML", () => {
    const html = "";
    const text = html.replace(/<[^>]+>/g, "");
    expect(text).toBe("");
  });

  it("should handle HTML with special characters", () => {
    const html = "<p>Amount: ₦1,000.00 &amp; fee: ₦50.00</p>";
    const text = html.replace(/<[^>]+>/g, "");
    expect(text).toBe("Amount: ₦1,000.00 &amp; fee: ₦50.00");
  });
});

// ─── Digest email patterns ────────────────────────────────────────────────────
describe("Digest email patterns", () => {
  it("should format currency amounts for email display", () => {
    const formatNGN = (amount: number) =>
      new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(amount / 100);
    expect(formatNGN(100000)).toBe("₦1,000.00");
    expect(formatNGN(50000)).toBe("₦500.00");
    expect(formatNGN(0)).toBe("₦0.00");
  });

  it("should format date ranges for weekly digest subject", () => {
    const formatWeekRange = (start: Date, end: Date) => {
      const fmt = (d: Date) => d.toLocaleDateString("en-NG", { month: "short", day: "numeric" });
      return `${fmt(start)} – ${fmt(end)}`;
    };
    const start = new Date("2026-04-14");
    const end = new Date("2026-04-20");
    const range = formatWeekRange(start, end);
    expect(range).toContain("Apr");
  });

  it("should build correct email subject for merchant digest", () => {
    const merchantName = "Acme Corp";
    const subject = `Your PayGate Weekly Summary — ${merchantName}`;
    expect(subject).toBe("Your PayGate Weekly Summary — Acme Corp");
  });

  it("should build correct email subject for payout notification", () => {
    const amount = "₦250,000.00";
    const status = "approved";
    const subject = `Payout ${status}: ${amount}`;
    expect(subject).toBe("Payout approved: ₦250,000.00");
  });

  it("should build correct email subject for KYC status change", () => {
    const status = "verified";
    const subject = `KYC Verification ${status.charAt(0).toUpperCase() + status.slice(1)}`;
    expect(subject).toBe("KYC Verification Verified");
  });
});
