/**
 * Wave 113 — settingsRouter USSD procedures integration tests
 *
 * Tests:
 *   - settings.getUssdLangPickerEnabled  — returns the stored flag (or true default)
 *   - settings.updateUssdLangPickerEnabled — persists the flag and returns the updated merchant
 *   - ussd.resetLangPref — validates input and throws PRECONDITION_FAILED when USSD_GATEWAY_URL is not set
 *
 * Strategy: use appRouter.createCaller() with a mocked context (same pattern as
 * auth.logout.test.ts). DB calls are mocked via vi.mock() to avoid real DB access.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { TrpcContext } from "./_core/context";

// ── Mock db helpers ────────────────────────────────────────────────────────────
// We mock the server/db module so no real DB connection is needed.
const mockMerchant = {
  id: 42,
  ownerId: 1,
  tenantId: "ten_test",
  businessName: "Test Merchant Ltd",
  ussdLangPickerEnabled: true,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

const mockUser = {
  id: 1,
  openId: "test-open-id",
  email: "merchant@example.com",
  name: "Test Merchant",
  role: "user" as const,
  loginMethod: "manus" as const,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  lastSignedIn: new Date("2024-01-01"),
};

vi.mock("./db", () => ({
  getUserByOpenId: vi.fn(async (openId: string) => {
    if (openId === "test-open-id") return mockUser;
    return null;
  }),
  getMerchantByOwnerId: vi.fn(async (userId: number) => {
    if (userId === 1) return { ...mockMerchant };
    return null;
  }),
  updateMerchant: vi.fn(async (merchantId: number, data: Record<string, unknown>) => {
    return { ...mockMerchant, ...data, id: merchantId };
  }),
  // Stub out other db helpers used by the router at import time
  getDb: vi.fn(async () => null),
  listApiKeys: vi.fn(async () => []),
  createApiKey: vi.fn(async () => ({})),
  revokeApiKey: vi.fn(async () => ({})),
  getPaymentLinkById: vi.fn(async () => null),
  getPayoutById: vi.fn(async () => null),
  getDisputeById: vi.fn(async () => null),
  updateDispute: vi.fn(async () => ({})),
  updatePayout: vi.fn(async () => ({})),
  updatePaymentLink: vi.fn(async () => ({})),
  logAuditEvent: vi.fn(async () => {}),
}));

// ── Context factory ────────────────────────────────────────────────────────────
function createMerchantContext(): TrpcContext {
  return {
    user: {
      id: mockUser.id,
      openId: mockUser.openId,
      email: mockUser.email,
      name: mockUser.name,
      loginMethod: mockUser.loginMethod,
      role: mockUser.role,
      createdAt: mockUser.createdAt,
      updatedAt: mockUser.updatedAt,
      lastSignedIn: mockUser.lastSignedIn,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
      cookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
      cookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────
describe("settings.getUssdLangPickerEnabled", () => {
  it("returns ussdLangPickerEnabled=true for a merchant with default value", async () => {
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createMerchantContext());
    const result = await caller.settings.getUssdLangPickerEnabled();
    expect(result).toEqual({ ussdLangPickerEnabled: true });
  }, 60_000 /* Cold-import of the full appRouter exceeds 15s on slow (FUSE) filesystems — timeout bumped, assertion unchanged. */);

  it("returns ussdLangPickerEnabled=false when merchant has it disabled", async () => {
    const { getMerchantByOwnerId } = await import("./db");
    vi.mocked(getMerchantByOwnerId).mockResolvedValueOnce({ ...mockMerchant, ussdLangPickerEnabled: false });
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createMerchantContext());
    const result = await caller.settings.getUssdLangPickerEnabled();
    expect(result).toEqual({ ussdLangPickerEnabled: false });
  }, 60_000 /* Cold-import of the full appRouter exceeds 15s on slow (FUSE) filesystems — timeout bumped, assertion unchanged. */);

  it("returns ussdLangPickerEnabled=true as default when merchant field is null", async () => {
    const { getMerchantByOwnerId } = await import("./db");
    vi.mocked(getMerchantByOwnerId).mockResolvedValueOnce({ ...mockMerchant, ussdLangPickerEnabled: null as any });
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createMerchantContext());
    const result = await caller.settings.getUssdLangPickerEnabled();
    expect(result).toEqual({ ussdLangPickerEnabled: true });
  }, 60_000 /* Cold-import of the full appRouter exceeds 15s on slow (FUSE) filesystems — timeout bumped, assertion unchanged. */);

  it("throws UNAUTHORIZED when called without authentication", async () => {
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createUnauthContext());
    await expect(caller.settings.getUssdLangPickerEnabled()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("throws NOT_FOUND when user has no merchant account", async () => {
    const { getMerchantByOwnerId } = await import("./db");
    vi.mocked(getMerchantByOwnerId).mockResolvedValueOnce(null);
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createMerchantContext());
    // getUssdLangPickerEnabled uses getMerchantByOwnerId (not requireMerchant),
    // so it returns the default rather than throwing
    const result = await caller.settings.getUssdLangPickerEnabled();
    expect(result).toEqual({ ussdLangPickerEnabled: true });
  });
});

describe("settings.updateUssdLangPickerEnabled", () => {
  it("persists ussdLangPickerEnabled=false and returns updated merchant", async () => {
    const { updateMerchant } = await import("./db");
    vi.mocked(updateMerchant).mockResolvedValueOnce({ ...mockMerchant, ussdLangPickerEnabled: false });
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createMerchantContext());
    const result = await caller.settings.updateUssdLangPickerEnabled({ ussdLangPickerEnabled: false });
    expect(result).toMatchObject({ ussdLangPickerEnabled: false });
    expect(vi.mocked(updateMerchant)).toHaveBeenCalledWith(
      mockMerchant.id,
      { ussdLangPickerEnabled: false }
    );
  });

  it("persists ussdLangPickerEnabled=true and returns updated merchant", async () => {
    const { updateMerchant } = await import("./db");
    vi.mocked(updateMerchant).mockResolvedValueOnce({ ...mockMerchant, ussdLangPickerEnabled: true });
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createMerchantContext());
    const result = await caller.settings.updateUssdLangPickerEnabled({ ussdLangPickerEnabled: true });
    expect(result).toMatchObject({ ussdLangPickerEnabled: true });
  });

  it("throws UNAUTHORIZED when called without authentication", async () => {
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createUnauthContext());
    await expect(
      caller.settings.updateUssdLangPickerEnabled({ ussdLangPickerEnabled: false })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects non-boolean input (Zod validation)", async () => {
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createMerchantContext());
    await expect(
      (caller.settings.updateUssdLangPickerEnabled as any)({ ussdLangPickerEnabled: "yes" })
    ).rejects.toThrow();
  });

  it("throws NOT_FOUND when merchant account does not exist", async () => {
    const { getMerchantByOwnerId } = await import("./db");
    vi.mocked(getMerchantByOwnerId).mockResolvedValueOnce(null);
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createMerchantContext());
    await expect(
      caller.settings.updateUssdLangPickerEnabled({ ussdLangPickerEnabled: false })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("ussd.resetLangPref", () => {
  const origEnv = process.env.USSD_GATEWAY_URL;

  beforeEach(() => {
    delete process.env.USSD_GATEWAY_URL;
  });

  afterEach(() => {
    if (origEnv !== undefined) {
      process.env.USSD_GATEWAY_URL = origEnv;
    } else {
      delete process.env.USSD_GATEWAY_URL;
    }
  });

  it("throws PRECONDITION_FAILED when USSD_GATEWAY_URL is not configured", async () => {
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createMerchantContext());
    await expect(
      caller.ussd.resetLangPref({ phone: "+2348012345678" })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("throws UNAUTHORIZED when called without authentication", async () => {
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createUnauthContext());
    await expect(
      caller.ussd.resetLangPref({ phone: "+2348012345678" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects phone numbers shorter than 7 characters (Zod validation)", async () => {
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createMerchantContext());
    await expect(
      caller.ussd.resetLangPref({ phone: "123" })
    ).rejects.toThrow();
  });

  it("rejects phone numbers longer than 20 characters (Zod validation)", async () => {
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createMerchantContext());
    await expect(
      caller.ussd.resetLangPref({ phone: "+234801234567890123456" })
    ).rejects.toThrow();
  });

  it("calls the USSD service DELETE endpoint when USSD_GATEWAY_URL is configured", async () => {
    process.env.USSD_GATEWAY_URL = "http://ussd-service:8000";
    // Mock global fetch to simulate a successful DELETE response
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const origFetch = global.fetch;
    global.fetch = mockFetch as any;
    try {
      const { appRouter } = await import("./routers");
      const caller = appRouter.createCaller(createMerchantContext());
      const result = await caller.ussd.resetLangPref({ phone: "+2348012345678" });
      expect(result).toEqual({ success: true, phone: "+2348012345678" });
      expect(mockFetch).toHaveBeenCalledWith(
        "http://ussd-service:8000/lang-pref/%2B2348012345678",
        expect.objectContaining({ method: "DELETE" })
      );
    } finally {
      global.fetch = origFetch;
    }
  });

  it("treats 404 from USSD service as success (preference already cleared)", async () => {
    process.env.USSD_GATEWAY_URL = "http://ussd-service:8000";
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    const origFetch = global.fetch;
    global.fetch = mockFetch as any;
    try {
      const { appRouter } = await import("./routers");
      const caller = appRouter.createCaller(createMerchantContext());
      const result = await caller.ussd.resetLangPref({ phone: "+2348099999999" });
      expect(result).toEqual({ success: true, phone: "+2348099999999" });
    } finally {
      global.fetch = origFetch;
    }
  });

  it("throws INTERNAL_SERVER_ERROR when USSD service returns 500", async () => {
    process.env.USSD_GATEWAY_URL = "http://ussd-service:8000";
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const origFetch = global.fetch;
    global.fetch = mockFetch as any;
    try {
      const { appRouter } = await import("./routers");
      const caller = appRouter.createCaller(createMerchantContext());
      await expect(
        caller.ussd.resetLangPref({ phone: "+2348012345678" })
      ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    } finally {
      global.fetch = origFetch;
    }
  });
});
