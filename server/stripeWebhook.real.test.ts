/**
 * REAL Stripe inbound-webhook tests (server/stripe.ts).
 *
 * Drives the actual stripeWebhookHandler with the actual stripe SDK
 * constructEvent signature verification — signatures are generated with the
 * real Stripe scheme (t=timestamp,v1=HMAC_SHA256(secret, "t.payload")).
 * Only the Postgres connection is faked (stateful in-memory stand-in).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";

import {
  consumerWallets as consumerWalletsTable,
  consumerWalletTxns as consumerWalletTxnsTable,
} from "../drizzle/schema";

type State = { consumerWallets: any[]; consumerTxns: any[] };
let state: State;

/** Extract embedded param values from a drizzle SQL condition object. */
function conditionParams(cond: any): any[] {
  const params: any[] = [];
  const walk = (c: any) => {
    if (c == null) return;
    if (Array.isArray(c)) return c.forEach(walk);
    if (typeof c === "object") {
      if (Array.isArray(c.value)) return walk(c.value);
      if ("queryChunks" in c) return walk(c.queryChunks);
      if ("value" in c) return walk(c.value);
      return;
    }
    params.push(c); // primitive: an embedded param value
  };
  walk(cond);
  return params;
}

vi.mock("./db", async (importOriginal) => {
  const orig = await importOriginal<any>();
  const conn: any = {
    select: () => ({
      from: (table: any) => ({
        where: (cond: any) => ({
          limit: async (n: number) => {
            const params = conditionParams(cond);
            if (table === consumerWalletsTable) {
              return state.consumerWallets
                .filter((w) => params.includes(w.userId) && params.includes(w.currency))
                .slice(0, n);
            }
            if (table === consumerWalletTxnsTable) {
              return state.consumerTxns
                .filter((t) => params.includes(t.reference) && params.includes(t.type))
                .slice(0, n);
            }
            return [];
          },
        }),
      }),
    }),
    insert: (table: any) => ({
      values: (v: any) => {
        const doInsert = () => {
          if (table === consumerWalletsTable) {
            state.consumerWallets.push({ ...v });
            return [state.consumerWallets[state.consumerWallets.length - 1]];
          }
          if (table === consumerWalletTxnsTable) {
            state.consumerTxns.push({ ...v });
            return [];
          }
          throw new Error("fake-db: unexpected insert table");
        };
        return {
          returning: async () => doInsert(),
          then: (res: any, rej: any) => Promise.resolve().then(() => { doInsert(); return []; }).then(res, rej),
        };
      },
    }),
    update: (table: any) => ({
      set: (v: any) => ({
        where: async () => {
          if (table === consumerWalletsTable && state.consumerWallets[0]) {
            Object.assign(state.consumerWallets[0], v);
          }
          return [];
        },
      }),
    }),
  };
  return { ...orig, getDb: async () => conn };
});

import { ENV } from "./_core/env";
import { stripeWebhookHandler, creditWalletTopUp } from "./stripe";

const SECRET = "whsec_testsecret_0123456789abcdef";

function makeRes() {
  const res: any = {
    statusCode: 0, body: null as any,
    status(c: number) { this.statusCode = c; return this; },
    json(b: unknown) { this.body = b; return this; },
  };
  return res;
}

/** Real Stripe webhook signature scheme. */
function sign(payload: string, secret: string): string {
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

const flushAsync = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
};

describe("stripeWebhookHandler — real Stripe signature scheme", () => {
  beforeEach(() => {
    state = { consumerWallets: [], consumerTxns: [] };
    ENV.stripeSecretKey = "sk_test_fake";
    ENV.stripeWebhookSecret = SECRET;
  });
  afterEach(() => {
    ENV.stripeSecretKey = "";
    ENV.stripeWebhookSecret = "";
  });

  it("503 when STRIPE_WEBHOOK_SECRET is not configured", async () => {
    ENV.stripeWebhookSecret = "";
    const res = makeRes();
    await stripeWebhookHandler({ headers: {}, body: Buffer.from("{}") } as any, res);
    expect(res.statusCode).toBe(503);
  });

  it("400 when the Stripe-Signature header is missing", async () => {
    const res = makeRes();
    await stripeWebhookHandler({ headers: {}, body: Buffer.from("{}") } as any, res);
    expect(res.statusCode).toBe(400);
  });

  it("400 when the raw body parser was not mounted (fail closed)", async () => {
    const res = makeRes();
    await stripeWebhookHandler(
      { headers: { "stripe-signature": "t=1,v1=x" }, body: { already: "parsed" } } as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it("400 on a forged signature (real constructEvent verification)", async () => {
    const payload = JSON.stringify({ id: "evt_forged", type: "payment_intent.succeeded", data: { object: {} } });
    const res = makeRes();
    await stripeWebhookHandler(
      { headers: { "stripe-signature": "t=1,v1=forged" }, body: Buffer.from(payload) } as any,
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringMatching(/[Ii]nvalid/) });
  });

  it("200 + wallet credit on a genuinely signed event; redelivery is idempotent", async () => {
    const event = {
      id: "evt_topup_1",
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_hook1", amount: 250_00, currency: "ngn", metadata: { user_id: "7", type: "consumer_wallet_topup" } } },
    };
    const payload = JSON.stringify(event);

    // First delivery
    const res1 = makeRes();
    await stripeWebhookHandler(
      { headers: { "stripe-signature": sign(payload, SECRET) }, body: Buffer.from(payload) } as any,
      res1,
    );
    expect(res1.statusCode).toBe(200);
    expect(res1.body).toMatchObject({ received: true, id: "evt_topup_1" });
    await flushAsync(); // async processing after the ACK
    expect(state.consumerTxns).toHaveLength(1);
    expect(state.consumerWallets[0].balanceKobo).toBe(250_00);
    // R4 spec #10: the dedupe reference is the PAYMENT INTENT id, not the
    // event id, so checkout.session.completed + payment_intent.succeeded for
    // one payment can never double-credit.
    expect(state.consumerTxns[0]).toMatchObject({
      type: "topup", amountKobo: 250_00, reference: "stripe:pi_pi_hook1", status: "completed",
    });

    // Stripe at-least-once redelivery of the SAME event
    const res2 = makeRes();
    await stripeWebhookHandler(
      { headers: { "stripe-signature": sign(payload, SECRET) }, body: Buffer.from(payload) } as any,
      res2,
    );
    expect(res2.statusCode).toBe(200);
    await flushAsync();
    expect(state.consumerTxns).toHaveLength(1); // duplicate suppressed
    expect(state.consumerWallets[0].balanceKobo).toBe(250_00); // credited exactly once

    // Cross-event-type dedupe (spec #10): checkout.session.completed for the
    // SAME payment intent must also be a no-op.
    const checkoutEvent = {
      id: "evt_checkout_same_pi",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_hook1", payment_status: "paid", payment_intent: "pi_hook1",
          amount_total: 250_00, currency: "ngn", metadata: { user_id: "7", type: "consumer_wallet_topup" },
        },
      },
    };
    const checkoutPayload = JSON.stringify(checkoutEvent);
    const res3 = makeRes();
    await stripeWebhookHandler(
      { headers: { "stripe-signature": sign(checkoutPayload, SECRET) }, body: Buffer.from(checkoutPayload) } as any,
      res3,
    );
    expect(res3.statusCode).toBe(200);
    await flushAsync();
    expect(state.consumerTxns).toHaveLength(1); // same payment_intent — NOT credited again
    expect(state.consumerWallets[0].balanceKobo).toBe(250_00);
  });

  it("paid checkout session with user_id but NO consumer_wallet_topup marker credits nothing (cross-flow reuse guard)", async () => {
    // R4 S16: subscription checkouts (wave34Router) stamp metadata.user_id
    // with no purpose marker — they are NOT wallet top-ups.
    const payload = JSON.stringify({
      id: "evt_sub_session", type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_sub1", payment_status: "paid", payment_intent: "pi_sub1",
          amount_total: 500_00, currency: "ngn", metadata: { user_id: "7" },
        },
      },
    });
    const res = makeRes();
    await stripeWebhookHandler(
      { headers: { "stripe-signature": sign(payload, SECRET) }, body: Buffer.from(payload) } as any,
      res,
    );
    expect(res.statusCode).toBe(200);
    await flushAsync();
    expect(state.consumerTxns).toHaveLength(0);
    expect(state.consumerWallets).toHaveLength(0);
  });

  it("signed event without user_id metadata is ACKed but credits nothing (no fabrication)", async () => {
    const payload = JSON.stringify({
      id: "evt_nometa", type: "payment_intent.succeeded",
      data: { object: { id: "pi_x", amount: 100, currency: "ngn", metadata: {} } },
    });
    const res = makeRes();
    await stripeWebhookHandler(
      { headers: { "stripe-signature": sign(payload, SECRET) }, body: Buffer.from(payload) } as any,
      res,
    );
    expect(res.statusCode).toBe(200);
    await flushAsync();
    expect(state.consumerTxns).toHaveLength(0);
  });
});

describe("creditWalletTopUp — idempotent crediting helper", () => {
  beforeEach(() => {
    state = { consumerWallets: [], consumerTxns: [] };
    ENV.stripeSecretKey = "sk_test_fake";
  });
  afterEach(() => { ENV.stripeSecretKey = ""; });

  it("a previously credited reference is never double-credited", async () => {
    const input = { userId: 7, amountKobo: 100_00, currency: "ngn", reference: "stripe:evt_dup" };
    const r1 = await creditWalletTopUp(input);
    expect(r1.credited).toBe(true);
    expect(r1.newBalanceKobo).toBe(100_00);
    const r2 = await creditWalletTopUp(input);
    expect(r2.credited).toBe(false);
    expect(r2.newBalanceKobo).toBe(100_00);
    expect(state.consumerTxns).toHaveLength(1);
    expect(state.consumerWallets[0].balanceKobo).toBe(100_00);
  });

  it("distinct references accumulate the balance correctly", async () => {
    await creditWalletTopUp({ userId: 7, amountKobo: 100_00, currency: "ngn", reference: "stripe:evt_a" });
    const r2 = await creditWalletTopUp({ userId: 7, amountKobo: 50_00, currency: "ngn", reference: "stripe:evt_b" });
    expect(r2.newBalanceKobo).toBe(150_00);
    expect(state.consumerTxns).toHaveLength(2);
  });
});
