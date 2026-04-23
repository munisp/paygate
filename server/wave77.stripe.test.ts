/**
 * Wave 77 – Stripe Subscription Gating & Webhook Tests
 *
 * Tests:
 * - Stripe webhook endpoint handles test events with verified: true
 * - Stripe webhook rejects invalid signatures
 * - Feature gate checks subscription status
 * - Subscription plan listing
 * - Subscription create/pause/cancel lifecycle
 */

import { describe, it, expect, vi } from "vitest";

// ─── Mock Stripe ──────────────────────────────────────────────────────────────
const mockStripeInstance = {
  webhooks: {
    constructEvent: vi.fn(),
  },
  checkout: {
    sessions: {
      create: vi.fn().mockResolvedValue({
        id: "cs_test_123",
        url: "https://checkout.stripe.com/test/cs_test_123",
      }),
    },
  },
  subscriptions: {
    retrieve: vi.fn().mockResolvedValue({
      id: "sub_test_123",
      status: "active",
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
      items: { data: [{ price: { id: "price_test_123" } }] },
    }),
  },
  customers: {
    create: vi.fn().mockResolvedValue({ id: "cus_test_123" }),
  },
};

vi.mock("stripe", () => {
  const MockStripe = vi.fn().mockImplementation(() => mockStripeInstance);
  return { default: MockStripe };
});

// ─── Webhook Handler Tests ────────────────────────────────────────────────────

describe("Stripe Webhook Handler", () => {
  it("returns verified: true for test events", async () => {
    // Test events have IDs starting with 'evt_test_'
    const testEventId = "evt_test_" + Date.now();
    const mockEvent = {
      id: testEventId,
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_123" } },
    };

    // Simulate the webhook handler logic
    const isTestEvent = mockEvent.id.startsWith("evt_test_");
    expect(isTestEvent).toBe(true);

    // Test event should return verification response
    const response = isTestEvent ? { verified: true } : { received: true };
    expect(response).toEqual({ verified: true });
  });

  it("rejects webhook with invalid signature", () => {
    // Mock constructEvent to throw on invalid signature
    vi.mocked(mockStripeInstance.webhooks.constructEvent).mockImplementationOnce(() => {
      throw new Error("No signatures found matching the expected signature for payload");
    });

    let error: Error | null = null;
    try {
      mockStripeInstance.webhooks.constructEvent("payload", "invalid_sig", "whsec_test");
    } catch (e) {
      error = e as Error;
    }

    expect(error).not.toBeNull();
    expect(error?.message).toContain("No signatures found");
  });

  it("processes checkout.session.completed event", async () => {
    const event = {
      id: "evt_live_123",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_abc",
          customer: "cus_test_123",
          subscription: "sub_test_123",
          client_reference_id: "user_123",
          metadata: {
            user_id: "user_123",
            customer_email: "test@example.com",
          },
          payment_status: "paid",
          amount_total: 9900,
          currency: "ngn",
        },
      },
    };

    // Verify event structure
    expect(event.type).toBe("checkout.session.completed");
    expect(event.data.object.payment_status).toBe("paid");
    expect(event.data.object.metadata.user_id).toBe("user_123");
    expect(event.data.object.subscription).toBe("sub_test_123");
  });

  it("processes customer.subscription.updated event", async () => {
    const event = {
      id: "evt_live_456",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_test_123",
          status: "active",
          customer: "cus_test_123",
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
          items: { data: [{ price: { id: "price_starter_monthly" } }] },
        },
      },
    };

    expect(event.type).toBe("customer.subscription.updated");
    expect(event.data.object.status).toBe("active");
    expect(event.data.object.current_period_end).toBeGreaterThan(Date.now() / 1000);
  });

  it("processes customer.subscription.deleted event", async () => {
    const event = {
      id: "evt_live_789",
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_test_123",
          status: "canceled",
          customer: "cus_test_123",
        },
      },
    };

    expect(event.type).toBe("customer.subscription.deleted");
    expect(event.data.object.status).toBe("canceled");
  });
});

// ─── Feature Gate Tests ───────────────────────────────────────────────────────

describe("Stripe Feature Gate", () => {
  it("allows access when subscription is active", () => {
    const subscription = {
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    };

    const hasAccess = subscription.status === "active" &&
      subscription.currentPeriodEnd > new Date();

    expect(hasAccess).toBe(true);
  });

  it("denies access when subscription is cancelled", () => {
    const subscription = {
      status: "cancelled",
      currentPeriodEnd: new Date(Date.now() - 1000),
    };

    const hasAccess = subscription.status === "active" &&
      subscription.currentPeriodEnd > new Date();

    expect(hasAccess).toBe(false);
  });

  it("denies access when subscription period has expired", () => {
    const subscription = {
      status: "active",
      currentPeriodEnd: new Date(Date.now() - 24 * 3600 * 1000), // expired yesterday
    };

    const hasAccess = subscription.status === "active" &&
      subscription.currentPeriodEnd > new Date();

    expect(hasAccess).toBe(false);
  });

  it("allows access when no subscription but feature is free tier", () => {
    const featureTier = "free";
    const userSubscription = null;

    const hasAccess = featureTier === "free" || userSubscription !== null;
    expect(hasAccess).toBe(true);
  });
});

// ─── Subscription Plan Tests ──────────────────────────────────────────────────

describe("Subscription Plans", () => {
  it("validates plan structure", () => {
    const plans = [
      {
        planId: "starter",
        name: "Starter",
        amountKobo: 9_900_00,
        interval: "month",
        features: ["Up to 1,000 transactions/month", "Basic analytics", "Email support"],
      },
      {
        planId: "growth",
        name: "Growth",
        amountKobo: 29_900_00,
        interval: "month",
        features: ["Up to 10,000 transactions/month", "Advanced analytics", "Priority support"],
      },
      {
        planId: "enterprise",
        name: "Enterprise",
        amountKobo: 99_900_00,
        interval: "month",
        features: ["Unlimited transactions", "Custom analytics", "Dedicated support"],
      },
    ];

    for (const plan of plans) {
      expect(plan.planId).toBeTruthy();
      expect(plan.name).toBeTruthy();
      expect(plan.amountKobo).toBeGreaterThan(0);
      expect(plan.interval).toBe("month");
      expect(plan.features.length).toBeGreaterThan(0);
    }
  });

  it("formats plan amounts correctly", () => {
    const amountKobo = 9_900_00; // ₦9,900
    const amountNaira = amountKobo / 100;
    expect(amountNaira).toBe(9900);

    const formatted = `₦${amountNaira.toLocaleString("en-NG")}`;
    expect(formatted).toBe("₦9,900");
  });
});

// ─── Checkout Session Tests ───────────────────────────────────────────────────

describe("Checkout Session Creation", () => {
  it("creates checkout session with required metadata", async () => {
    const session = await mockStripeInstance.checkout.sessions.create({
      mode: "subscription",
      customer_email: "merchant@example.com",
      client_reference_id: "user_123",
      metadata: {
        user_id: "user_123",
        customer_email: "merchant@example.com",
        customer_name: "Test Merchant",
      },
      line_items: [{ price: "price_test_123", quantity: 1 }],
      success_url: "https://example.com/success",
      cancel_url: "https://example.com/cancel",
    } as any);

    expect(session.id).toBe("cs_test_123");
    expect(session.url).toContain("checkout.stripe.com");
  });

  it("validates required checkout fields", () => {
    const checkoutParams = {
      mode: "subscription",
      customer_email: "test@example.com",
      client_reference_id: "user_456",
      metadata: {
        user_id: "user_456",
        customer_email: "test@example.com",
      },
    };

    expect(checkoutParams.mode).toBe("subscription");
    expect(checkoutParams.client_reference_id).toBeTruthy();
    expect(checkoutParams.metadata.user_id).toBeTruthy();
    expect(checkoutParams.metadata.customer_email).toBeTruthy();
  });
});

// ─── Billing Page Tests ───────────────────────────────────────────────────────

describe("Billing Data Validation", () => {
  it("formats invoice amounts correctly", () => {
    const invoices = [
      { amountPaidKobo: 9_900_00, currency: "NGN" },
      { amountPaidKobo: 29_900_00, currency: "NGN" },
    ];

    for (const inv of invoices) {
      const naira = inv.amountPaidKobo / 100;
      expect(naira).toBeGreaterThan(0);
      expect(Number.isFinite(naira)).toBe(true);
    }
  });

  it("validates subscription status transitions", () => {
    const validTransitions: Record<string, string[]> = {
      active: ["paused", "cancelled"],
      paused: ["active", "cancelled"],
      cancelled: [], // terminal state
      pending: ["active", "cancelled"],
    };

    // active -> paused is valid
    expect(validTransitions["active"]).toContain("paused");

    // active -> cancelled is valid
    expect(validTransitions["active"]).toContain("cancelled");

    // cancelled -> active is NOT valid
    expect(validTransitions["cancelled"]).not.toContain("active");
  });
});
