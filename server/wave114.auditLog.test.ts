/**
 * Wave 114 — Audit log tests for ussd.resetLangPref
 *
 * Tests that logAuditEvent is called (fire-and-forget) after a successful
 * language preference reset, and that audit log failures do not surface to callers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { TrpcContext } from "./_core/context";

// vi.hoisted: define mock fns BEFORE vi.mock factories run, with persistent implementations
const { mockLogAuditEvent, mockGetMerchantByOwnerId, mockGetUserByOpenId } = vi.hoisted(() => ({
  mockLogAuditEvent: vi.fn().mockResolvedValue(undefined),
  mockGetMerchantByOwnerId: vi.fn().mockResolvedValue({
    id: 42, ownerId: 1, businessName: "Test Business",
    tenantId: "ten_test", createdAt: new Date("2024-01-01"), updatedAt: new Date("2024-01-01"),
  }),
  mockGetUserByOpenId: vi.fn().mockResolvedValue({
    id: 1, openId: "test-open-id", name: "Test Merchant",
    email: "test@example.com", role: "user" as const,
    loginMethod: "manus" as const,
    createdAt: new Date("2024-01-01"), updatedAt: new Date("2024-01-01"),
  }),
}));

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getUserByOpenId: mockGetUserByOpenId,
    getMerchantByOwnerId: mockGetMerchantByOwnerId,
    logAuditEvent: mockLogAuditEvent,
  };
});

vi.mock("./middlewareBridge", () => ({
  isBridgeAvailable: vi.fn().mockResolvedValue(false),
}));

function createMerchantContext(): TrpcContext {
  return {
    user: { openId: "test-open-id", name: "Test Merchant", role: "user" },
    req: { headers: { origin: "http://localhost:3000" } } as any,
    res: {} as any,
  } as any;
}

describe("ussd.resetLangPref — audit log (Wave 114)", () => {
  const originalUssdUrl = process.env.USSD_GATEWAY_URL;

  beforeEach(() => {
    // Only reset call history, not implementations
    mockLogAuditEvent.mockClear();
    mockGetUserByOpenId.mockClear();
    mockGetMerchantByOwnerId.mockClear();
  });

  afterEach(() => {
    if (originalUssdUrl !== undefined) {
      process.env.USSD_GATEWAY_URL = originalUssdUrl;
    } else {
      delete process.env.USSD_GATEWAY_URL;
    }
    vi.unstubAllGlobals();
  });

  it("throws PRECONDITION_FAILED when USSD_GATEWAY_URL is not configured", async () => {
    delete process.env.USSD_GATEWAY_URL;
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createMerchantContext());
    await expect(
      caller.ussd.resetLangPref({ phone: "+2348012345678" })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  }, 60_000 /* Cold-import of the full appRouter exceeds 15s on slow (FUSE) filesystems — timeout bumped, assertion unchanged. */);

  it("calls logAuditEvent with action=ussd.resetLangPref after a successful reset", async () => {
    process.env.USSD_GATEWAY_URL = "http://ussd-service:8099";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createMerchantContext());
    const result = await caller.ussd.resetLangPref({ phone: "+2348012345678" });

    expect(result).toEqual({ success: true, phone: "+2348012345678" });
    // Give the fire-and-forget IIFE time to resolve
    await new Promise((r) => setTimeout(r, 300));

    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ussd.resetLangPref",
        resource: "ussd_lang_pref",
        resourceId: "+2348012345678",
        merchantId: 42,
      })
    );
  });

  it("audit log failure does not cause the mutation to fail", async () => {
    process.env.USSD_GATEWAY_URL = "http://ussd-service:8099";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    mockLogAuditEvent.mockRejectedValueOnce(new Error("DB write failed"));

    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createMerchantContext());
    const result = await caller.ussd.resetLangPref({ phone: "+2348099999999" });
    expect(result.success).toBe(true);
  });

  it("returns success when USSD service returns 404 (preference not found)", async () => {
    process.env.USSD_GATEWAY_URL = "http://ussd-service:8099";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createMerchantContext());
    const result = await caller.ussd.resetLangPref({ phone: "+2348011111111" });
    expect(result.success).toBe(true);
  });

  it("throws INTERNAL_SERVER_ERROR when USSD service returns 500", async () => {
    process.env.USSD_GATEWAY_URL = "http://ussd-service:8099";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createMerchantContext());
    await expect(
      caller.ussd.resetLangPref({ phone: "+2348022222222" })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});
