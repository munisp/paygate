/**
 * payoutsFxFixes.test.ts — regression tests for the audited payout/FX defects:
 *  H1+H2  reserve (amount+fee) at creation, integer bps fee, approve consumes
 *         the reservation (no double debit), reject/fail releases it
 *  H3     double-approval guard flip (pending_approval → approving) → 409
 *  H4     reject via PBAC + maker-checker; rejection_reason column, metadata preserved
 *  H5     settlement retry blocked while original workflow is not terminally failed
 *  M21    bridge workflow-start failure parks payout in workflow_pending + outbox
 *  C19+H28 convertCurrency: real two-leg atomic conversion, integer math, stale-rate rejection
 *  H25    executeApprovedPayouts / expireStalePendingApprovals sweepers
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@grpc/grpc-js", () => ({}), { virtual: true });
vi.mock("@grpc/proto-loader", () => ({ loadSync: () => ({}), load: async () => ({}) }), { virtual: true });
vi.mock("web-push", () => ({ default: {}, setVapidDetails: () => {}, sendNotification: async () => ({}) }), { virtual: true });

// ─── Hoisted fake state ───────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  wallets: [] as any[],
  walletTxns: [] as any[],
  payouts: new Map<string, any>(),
  outbox: [] as any[],
  events: [] as any[],
  users: {
    "admin-open-id": { id: 1, name: "Admin", openId: "admin-open-id", role: "admin" },
    "maker-open-id": { id: 2, name: "Maker", openId: "maker-open-id", role: "admin" },
  } as Record<string, any>,
  merchant: {
    id: "mer_1", tenantId: "ten_default", businessName: "Test Merchant",
    payoutApprovalEnabled: false, payoutApprovalThreshold: null as number | null,
  } as any,
  fxRates: [] as any[],
  settlements: new Map<string, any>(),
  // bridge controls
  bridgeAvailable: false,
  approvalWorkflow: null as any,        // getPayoutApprovalStatus return
  initiateError: null as string | null, // initiatePayoutApproval throws
  workflowStatus: null as any,          // getWorkflowStatusViaMiddleware return
  nipResult: { status: "success", responseCode: "00", responseMessage: "Approved", stan: "x" } as any,
  // stale read simulation for the H3 race test
  stalePayoutStatus: null as string | null,
}));

function resetState() {
  h.wallets.length = 0;
  h.walletTxns.length = 0;
  h.payouts.clear();
  h.outbox.length = 0;
  h.events.length = 0;
  h.settlements.clear();
  h.fxRates.length = 0;
  h.bridgeAvailable = false;
  h.approvalWorkflow = null;
  h.initiateError = null;
  h.workflowStatus = null;
  h.nipResult = { status: "success", responseCode: "00", responseMessage: "Approved", stan: "x" };
  h.stalePayoutStatus = null;
  h.merchant = { id: "mer_1", tenantId: "ten_default", businessName: "Test Merchant", payoutApprovalEnabled: false, payoutApprovalThreshold: null };
}

// ─── SQL fake ─────────────────────────────────────────────────────────────────
/** Render a drizzle sql`...` template into text + ordered params. */
function renderSql(q: any): { text: string; params: any[] } {
  const parts: string[] = [];
  const params: any[] = [];
  for (const c of q?.queryChunks ?? []) {
    if (c != null && typeof c === "object" && Array.isArray(c.value)) parts.push(c.value.join(""));
    else { params.push(c); parts.push("?"); }
  }
  return { text: parts.join(""), params };
}

// Wallet balances use the same units as payout/FX amounts (minor units stored
// as a decimal string, e.g. "10000.00" kobo) — matching the pre-existing
// approve-path convention (amount + fee).toFixed(2).
const toUnits = (s: string): number => parseFloat(s);
const fromUnits = (c: number): string => c.toFixed(2);

function findMerchantWallet(merchantId: string, currency: string) {
  return h.wallets.find((w) => w.merchantId === merchantId && w.currency === currency && w.status === "active");
}

function execSql(q: any, journal: Array<() => void>): { rows: any[] } {
  const { text, params } = renderSql(q);
  const T = text.replace(/\s+/g, " ").trim();

  // Guarded reserve / FX debit: UPDATE wallets SET balance = balance - X
  // WHERE id = (SELECT ... merchant/currency ...) AND balance >= X
  if (/^UPDATE wallets SET balance = \(balance::numeric - /.test(T) && T.includes("SELECT id FROM wallets")) {
    const [amount, merchantId, currency, guard] = params;
    const w = findMerchantWallet(merchantId, currency);
    if (!w || toUnits(w.balance) < Number(guard)) return { rows: [] };
    const prev = w.balance;
    w.balance = fromUnits(toUnits(w.balance) - Number(amount));
    journal.push(() => { w.balance = prev; });
    return { rows: [{ id: w.id, balance: w.balance }] };
  }
  // Plain re-credit by wallet id (create failure rollback): WHERE id = ?
  if (/^UPDATE wallets SET balance = \(balance::numeric \+ /.test(T) && /WHERE id = \?$/.test(T)) {
    const [amount, walletId] = params;
    const w = h.wallets.find((x) => x.id === walletId);
    if (!w) return { rows: [] };
    const prev = w.balance;
    w.balance = fromUnits(toUnits(w.balance) + Number(amount));
    journal.push(() => { w.balance = prev; });
    return { rows: [{ balance: w.balance }] };
  }
  // Release-credit via merchant/currency subquery
  if (/^UPDATE wallets SET balance = \(balance::numeric \+ /.test(T) && T.includes("SELECT id FROM wallets")) {
    const [amount, merchantId, currency] = params;
    const w = findMerchantWallet(merchantId, currency);
    if (!w) return { rows: [] };
    const prev = w.balance;
    w.balance = fromUnits(toUnits(w.balance) + Number(amount));
    journal.push(() => { w.balance = prev; });
    return { rows: [{ balance: w.balance }] };
  }
  // FX credit leg: UPDATE wallets SET balance = balance + X WHERE id = ? RETURNING balance
  if (/^UPDATE wallets SET balance = \(balance::numeric \+ /.test(T) && T.includes("RETURNING balance")) {
    const [amount, walletId] = params;
    const w = h.wallets.find((x) => x.id === walletId);
    if (!w) return { rows: [] };
    const prev = w.balance;
    w.balance = fromUnits(toUnits(w.balance) + Number(amount));
    journal.push(() => { w.balance = prev; });
    return { rows: [{ balance: w.balance }] };
  }
  // FX target wallet lookup (FOR UPDATE)
  if (/^SELECT id, balance FROM wallets/.test(T) && T.includes("FOR UPDATE")) {
    const [merchantId, currency] = params;
    const w = findMerchantWallet(merchantId, currency);
    return { rows: w ? [{ id: w.id, balance: w.balance }] : [] };
  }
  // FX target wallet creation
  if (/^INSERT INTO wallets /.test(T)) {
    const [tenant_id, user_id, merchant_id, currency] = params;
    const row = { id: h.wallets.length + 1, tenantId: tenant_id, userId: user_id, merchantId: merchant_id, currency, balance: "0.00", status: "active" };
    h.wallets.push(row);
    journal.push(() => { h.wallets = h.wallets.filter((x) => x !== row); });
    return { rows: [{ id: row.id }] };
  }
  // wallet_transactions insert (two legs) — unique (tenant_id, reference)
  if (/^INSERT INTO wallet_transactions/.test(T)) {
    // Layout per leg (type/channel/status are SQL literals): 10 bound params —
    // (tenant, wallet, amount, currency, balBeforeA, balBeforeB, balAfter, description, reference, metadata)
    const legs = [
      { tenantId: params[0], walletId: params[1], type: "debit", amount: params[2], currency: params[3] },
      { tenantId: params[10], walletId: params[11], type: "credit", amount: params[12], currency: params[13] },
    ];
    const refs = [params[8], params[18]];
    for (const ref of refs) {
      if (h.walletTxns.some((t) => t.reference === ref)) {
        throw new Error(`duplicate key value violates unique constraint "wallet_tx_tenant_ref_uniq"`);
      }
    }
    legs.forEach((leg, i) => h.walletTxns.push({ ...leg, reference: refs[i] }));
    return { rows: [] };
  }
  // FX replay lookup (pre-check and post-violation)
  if (/^SELECT (wallet_id, )?type, amount, currency FROM wallet_transactions/.test(T)) {
    const [tenantId, ref1, ref2] = params;
    return { rows: h.walletTxns.filter((t) => t.tenantId === tenantId && (t.reference === ref1 || t.reference === ref2)) };
  }
  // Track reservation on payout row
  if (/^UPDATE payouts SET reserved_amount = \d*.*WHERE id = \?$/.test(T) || /^UPDATE payouts SET reserved_amount = .* WHERE id = \?$/.test(T)) {
    const [amt, id] = params;
    const p = h.payouts.get(id);
    if (p) p.reserved_amount = Number(amt);
    return { rows: p ? [{ id }] : [] };
  }
  // Read reservation
  if (/^SELECT reserved_amount FROM payouts/.test(T)) {
    const p = h.payouts.get(params[0]);
    return { rows: [{ reserved_amount: p?.reserved_amount ?? 0 }] };
  }
  // H3 guard flip → approving
  if (T.includes("SET status = 'approving'") && T.includes("status = 'pending_approval'")) {
    const p = h.payouts.get(params[0]);
    if (!p || p.status !== "pending_approval") return { rows: [] };
    p.status = "approving";
    journal.push(() => { p.status = "pending_approval"; });
    return { rows: [{ id: p.id }] };
  }
  // Guard revert approving → pending_approval
  if (T.includes("SET status = 'pending_approval'") && T.includes("status = 'approving'")) {
    const p = h.payouts.get(params[0]);
    if (!p || p.status !== "approving") return { rows: [] };
    p.status = "pending_approval";
    return { rows: [{ id: p.id }] };
  }
  // M21 park: status = 'workflow_pending'
  if (T.includes("SET status = 'workflow_pending'")) {
    const p = h.payouts.get(params[0]);
    if (p) p.status = "workflow_pending";
    return { rows: [] };
  }
  // Approve final flip
  if (T.includes("SET status = 'pending'") && T.includes("'pending_approval', 'approving'")) {
    const p = h.payouts.get(params[0]);
    if (!p || !["pending_approval", "approving"].includes(p.status)) return { rows: [] };
    p.status = "pending";
    return { rows: [{ id: p.id }] };
  }
  // Release reservation
  if (/^UPDATE payouts SET reserved_amount = 0/.test(T) && T.includes("RETURNING reserved_amount")) {
    const p = h.payouts.get(params[0]);
    if (!p || !(p.reserved_amount > 0)) return { rows: [] };
    const prev = p.reserved_amount;
    p.reserved_amount = 0;
    journal.push(() => { p.reserved_amount = prev; });
    return { rows: [{ reserved_amount: prev, currency: p.currency ?? "NGN" }] };
  }
  // Reject guarded update
  if (T.includes("SET status = 'rejected'") && T.includes("rejection_reason")) {
    const [reason, id] = params;
    const p = h.payouts.get(id);
    if (!p || p.status !== "pending_approval") return { rows: [] };
    p.status = "rejected";
    p.rejection_reason = reason;
    return { rows: [{ id }] };
  }
  // Worker: pick executable payouts
  if (/^SELECT id, merchant_id, amount, fee_amount, currency, bank_code/.test(T)) {
    return {
      rows: [...h.payouts.values()]
        .filter((p) => p.status === "pending" && (p.reserved_amount ?? 0) > 0)
        .map((p) => ({
          id: p.id, merchant_id: p.merchantId, amount: p.amount, fee_amount: p.feeAmount ?? 0,
          currency: p.currency ?? "NGN", bank_code: p.bankCode, account_number: p.accountNumber,
          account_name: p.accountName, narration: p.narration, reference: p.reference,
        })),
    };
  }
  // Worker success: consume + complete
  if (T.includes("SET status = 'completed'") && T.includes("reserved_amount = 0")) {
    const p = h.payouts.get(params[0]);
    if (!p || p.status !== "pending") return { rows: [] };
    p.status = "completed";
    p.reserved_amount = 0;
    return { rows: [{ id: p.id }] };
  }
  // Worker failure: mark failed
  if (T.includes("SET status = 'failed'") && T.includes("failure_reason")) {
    const [reason, id] = params;
    const p = h.payouts.get(id);
    if (!p || p.status !== "pending") return { rows: [] };
    p.status = "failed";
    p.failure_reason = reason;
    return { rows: [{ id }] };
  }
  // Expiry sweeper select
  if (/^SELECT id, merchant_id, amount, currency FROM payouts/.test(T)) {
    const cutoff = params[0] as Date;
    return {
      rows: [...h.payouts.values()]
        .filter((p) => p.status === "pending_approval" && new Date(p.createdAt) < cutoff)
        .map((p) => ({ id: p.id, merchant_id: p.merchantId, amount: p.amount, currency: p.currency ?? "NGN" })),
    };
  }
  // M21 outbox insert
  if (/^INSERT INTO payout_workflow_outbox/.test(T)) {
    h.outbox.push({ payout_id: params[0], payload: params[1] });
    return { rows: [] };
  }
  throw new Error(`fake-db: unexpected SQL: ${T}`);
}

const conn: any = {
  execute: async (q: any) => execSql(q, []),
  // drizzle select() surface used by pbac.resolveMerchantTeamRole — no team
  // rows in the fake, so the owner-compat path (getMerchantByOwnerId) applies.
  select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
  transaction: async (cb: (tx: any) => Promise<any>) => {
    const journal: Array<() => void> = [];
    const tx = { execute: async (q: any) => execSql(q, journal) };
    try {
      return await cb(tx);
    } catch (err) {
      for (const undo of journal.reverse()) undo();
      throw err;
    }
  },
};

// G7 KYC gate: payouts.create/createBulk now require an approved KYC row.
// The KYC gate is NOT the contract under test in this file — stub it allowed.
vi.mock("./kyc", async (importOriginal) => {
  const orig = await importOriginal<any>();
  return { ...orig, assertApprovedKyc: vi.fn(async () => {}) };
});

vi.mock("../db", async (importOriginal) => {
  const orig = await importOriginal<any>();
  return {
    ...orig,
    getDb: async () => conn,
    getUserByOpenId: async (openId: string) => h.users[openId] ?? null,
    getMerchantByOwnerId: async () => h.merchant,
    getPayoutById: async (id: string) => {
      const p = h.payouts.get(id) ?? null;
      // H3 race simulation: return a stale snapshot while the row has moved on.
      if (p && h.stalePayoutStatus) return { ...p, status: h.stalePayoutStatus };
      return p;
    },
    createPayout: async (p: any) => {
      const row = { ...p, reserved_amount: 0, createdAt: new Date(), updatedAt: new Date() };
      h.payouts.set(p.id, row);
      return row;
    },
    updatePayout: async (id: string, patch: any) => {
      const p = h.payouts.get(id);
      if (p) Object.assign(p, patch);
      return p;
    },
    getLatestFxRates: async () => h.fxRates,
    getSettlementById: async (id: string) => h.settlements.get(id) ?? null,
    updateSettlement: async (id: string, patch: any) => {
      const s = h.settlements.get(id);
      if (s) Object.assign(s, patch);
      return s;
    },
    logAuditEvent: async () => {},
  };
});

vi.mock("../idempotency", () => ({
  withIdempotency: async (opts: any) => opts.execute(),
  derivePayoutIdempotencyKey: () => "test-key",
}));

vi.mock("../middlewareBridge", async (importOriginal) => {
  const orig = await importOriginal<any>();
  return {
    ...orig,
    isBridgeAvailable: () => h.bridgeAvailable,
    initiatePayoutApproval: async () => {
      if (h.initiateError) throw new Error(h.initiateError);
      return { workflowId: "wf-1", runId: "run-1", status: "RUNNING", createdAt: new Date().toISOString() };
    },
    approvePayoutViaMiddleware: async () => ({ payoutId: "x", status: "signaled", signaledAt: "" }),
    rejectPayoutViaMiddleware: async () => ({ payoutId: "x", status: "signaled", signaledAt: "" }),
    getPayoutApprovalStatus: async () => h.approvalWorkflow,
    getWorkflowStatusViaMiddleware: async () => h.workflowStatus,
    triggerSettlementViaMiddleware: async () => ({ settlementId: "stl_1", workflowId: "wf-stl-new", status: "RUNNING" }),
    nipInstantDebitViaMiddleware: async () => h.nipResult,
    recordFXConversionViaMiddleware: async () => {},
  };
});

vi.mock("../kafkaClient", async (importOriginal) => {
  const orig = await importOriginal<any>();
  return {
    ...orig,
    publishPayoutEvent: async (p: any) => { h.events.push(p); },
    publishAuditEvent: async () => {},
  };
});

vi.mock("../_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));

// Permify is not running in the sandbox — answer RESULT_ALLOWED so the PBAC
// check takes its definitive-answer path (local-matrix fallback would 503 on
// money actions when Permify is "unavailable").
vi.stubGlobal("fetch", vi.fn(async () => ({
  ok: true,
  json: async () => ({ can: "RESULT_ALLOWED" }),
})));

import { appRouter } from "../routers";
import { executeApprovedPayouts, expireStalePendingApprovals } from "../routers";

const makeCtx = (openId = "admin-open-id", id = 1, role = "admin"): any => ({
  user: { id, openId, role },
  req: { headers: {} },
  res: {},
});
const caller = (openId?: string, id?: number, role?: string) => appRouter.createCaller(makeCtx(openId, id, role));

const FEE = (amt: number) => Math.floor(amt * 50 / 10000); // 50 bps

beforeEach(resetState);

// ─── H1+H2: reserve at creation ───────────────────────────────────────────────
describe("payouts.create — reserve at creation (H1+H2)", () => {
  it("reserves amount + integer-bps fee atomically; payout carries reserved_amount", async () => {
    h.wallets.push({ id: 1, merchantId: "mer_1", tenantId: "ten_default", balance: "10000.00", currency: "NGN", status: "active" });
    const res: any = await caller().payouts.create({ amount: 5000, currency: "NGN", accountNumber: "0123456789" });
    expect(res.id).toBeTruthy();
    const p = h.payouts.get(res.id);
    expect(p.feeAmount).toBe(FEE(5000)); // 25
    expect(p.reserved_amount).toBe(5000 + FEE(5000));
    expect(h.wallets[0].balance).toBe("4975.00");
  });

  it("insufficient funds → PRECONDITION_FAILED (402), no payout created", async () => {
    h.wallets.push({ id: 1, merchantId: "mer_1", tenantId: "ten_default", balance: "10.00", currency: "NGN", status: "active" });
    await expect(caller().payouts.create({ amount: 5000, currency: "NGN" }))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: expect.stringMatching(/Insufficient funds \(402\)/) });
    expect(h.payouts.size).toBe(0);
    expect(h.wallets[0].balance).toBe("10.00");
  });

  it("rejects non-integer amounts", async () => {
    h.wallets.push({ id: 1, merchantId: "mer_1", tenantId: "ten_default", balance: "100.00", currency: "NGN", status: "active" });
    await expect(caller().payouts.create({ amount: 5000.5, currency: "NGN" })).rejects.toThrow();
  });
});

describe("payouts.createBulk — reserves exactly once per row (H2)", () => {
  it("two rows debit the wallet twice in total, never more", async () => {
    h.wallets.push({ id: 1, merchantId: "mer_1", tenantId: "ten_default", balance: "20000.00", currency: "NGN", status: "active" });
    const res: any = await caller().payouts.createBulk({
      rows: [
        { amount: 5000, currency: "NGN" },
        { amount: 6000, currency: "NGN" },
      ],
    });
    expect(res.succeeded).toBe(2);
    const total = 5000 + FEE(5000) + 6000 + FEE(6000);
    expect(h.wallets[0].balance).toBe(fromUnits(20000 - total));
    for (const p of h.payouts.values()) expect(p.reserved_amount).toBeGreaterThan(0);
  });
});

// ─── H2/H3: approve consumes reservation; double-approval 409 ────────────────
describe("payouts.approve — consumes reservation, no double debit (H2/H3)", () => {
  const seedPayout = () => {
    h.payouts.set("pyo_1", {
      id: "pyo_1", merchantId: "mer_1", tenantId: "ten_default",
      amount: 5000, feeAmount: 25, currency: "NGN", status: "pending_approval",
      failureReason: "initiator:maker-open-id", reserved_amount: 5025, createdAt: new Date(),
    });
  };

  it("approve consumes the existing reservation — wallet is NOT debited again", async () => {
    seedPayout();
    h.wallets.push({ id: 1, merchantId: "mer_1", tenantId: "ten_default", balance: "4975.00", currency: "NGN", status: "active" }); // 10000 - 5025 already reserved
    const res: any = await caller().payouts.approve({ id: "pyo_1" });
    expect(res).toEqual({ success: true, via: "db" });
    expect(h.wallets[0].balance).toBe("4975.00"); // unchanged — no double reserve
    expect(h.payouts.get("pyo_1").status).toBe("pending");
  });

  it("concurrent approve (row already flipped to approving) → 409 CONFLICT", async () => {
    seedPayout();
    h.stalePayoutStatus = "pending_approval";   // stale read passes the pre-check…
    h.payouts.get("pyo_1").status = "approving"; // …but the row has moved on
    await expect(caller().payouts.approve({ id: "pyo_1" }))
      .rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("maker-checker: initiator cannot approve → FORBIDDEN", async () => {
    seedPayout();
    await expect(caller("maker-open-id", 2).payouts.approve({ id: "pyo_1" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ─── H4: reject ───────────────────────────────────────────────────────────────
describe("payouts.reject — PBAC + maker-checker + reservation release (H4)", () => {
  const seedPayout = () => {
    h.payouts.set("pyo_2", {
      id: "pyo_2", merchantId: "mer_1", tenantId: "ten_default",
      amount: 5000, feeAmount: 25, currency: "NGN", status: "pending_approval",
      failureReason: "initiator:maker-open-id", reserved_amount: 5025, createdAt: new Date(),
    });
  };

  it("reject releases the reservation and stores rejection_reason without clobbering metadata", async () => {
    seedPayout();
    h.wallets.push({ id: 1, merchantId: "mer_1", tenantId: "ten_default", balance: "4975.00", currency: "NGN", status: "active" });
    const res: any = await caller().payouts.reject({ id: "pyo_2", reason: "duplicate payout" });
    expect(res).toEqual({ success: true, via: "db" });
    const p = h.payouts.get("pyo_2");
    expect(p.status).toBe("rejected");
    expect(p.rejection_reason).toBe("duplicate payout");
    expect(p.failureReason).toBe("initiator:maker-open-id"); // metadata preserved
    expect(p.reserved_amount).toBe(0);
    expect(h.wallets[0].balance).toBe("10000.00"); // 4975 + 5025 released
  });

  it("maker-checker: initiator cannot reject their own payout → FORBIDDEN", async () => {
    seedPayout();
    await expect(caller("maker-open-id", 2).payouts.reject({ id: "pyo_2", reason: "self" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ─── M21: bridge workflow-start failure fails loudly ──────────────────────────
describe("payouts.create — bridge workflow-start failure (M21)", () => {
  it("parks payout in workflow_pending, queues outbox row, throws SERVICE_UNAVAILABLE", async () => {
    h.merchant.payoutApprovalEnabled = true;
    h.merchant.payoutApprovalThreshold = 1000;
    h.bridgeAvailable = true;
    h.initiateError = "temporal unreachable";
    h.wallets.push({ id: 1, merchantId: "mer_1", tenantId: "ten_default", balance: "10000.00", currency: "NGN", status: "active" });
    await expect(caller().payouts.create({ amount: 5000, currency: "NGN" }))
      .rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    const p = [...h.payouts.values()][0];
    expect(p.status).toBe("workflow_pending");       // never left approvable
    expect(p.reserved_amount).toBe(5025);            // reservation held
    expect(h.outbox).toHaveLength(1);                // retry queued
  });
});

// ─── H5: settlement retry workflow guard ──────────────────────────────────────
describe("settlements.retry — original workflow guard (H5)", () => {
  const seedSettlement = () => {
    h.settlements.set("stl_1", {
      id: "stl_1", merchantId: "mer_1", amount: 10000, currency: "NGN",
      status: "failed", workflowId: "wf-stl-1", bankCode: "044",
      accountNumber: "0123456789", accountName: "X", initiatedAt: new Date(),
    });
  };

  it("blocks retry while original workflow is RUNNING (double-pay guard)", async () => {
    seedSettlement();
    h.bridgeAvailable = true;
    h.workflowStatus = { workflowId: "wf-stl-1", status: "RUNNING", startTime: "", historyLength: 1, taskQueue: "q", type: "SettlementWorkflow" };
    await expect(caller().settlements.retry({ id: "stl_1" }))
      .rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("allows retry when the original workflow terminally FAILED", async () => {
    seedSettlement();
    h.bridgeAvailable = true;
    h.workflowStatus = { workflowId: "wf-stl-1", status: "FAILED", startTime: "", historyLength: 5, taskQueue: "q", type: "SettlementWorkflow" };
    const res: any = await caller().settlements.retry({ id: "stl_1" });
    expect(res.ok).toBe(true);
    expect(h.settlements.get("stl_1").workflowId).toBe("wf-stl-new");
  });
});

// ─── C19+H28: convertCurrency two-leg atomic conversion ───────────────────────
describe("convertCurrency — two-leg atomic conversion (C19+H28)", () => {
  const seedRates = (fetchedAt = new Date()) => {
    h.fxRates.push({ targetCurrency: "USD", rate: "0.0025", source: "test", fetchedAt });
  };

  it("debits source (+fee), credits target with floored integer conversion, writes both ledger legs", async () => {
    seedRates();
    h.wallets.push({ id: 1, merchantId: "mer_1", tenantId: "ten_default", balance: "200000.00", currency: "NGN", status: "active" });
    const res: any = await caller().fx.convertCurrency({ fromCurrency: "NGN", toCurrency: "USD", amount: 100000 });
    // fee = floor(100000 * 80 / 10000) = 800; converted = floor(100000 * 2500 / 1e6) = 250
    expect(res.success).toBe(true);
    expect(res.fee).toBe(800);
    expect(res.convertedAmount).toBe(250);
    const ngn = h.wallets.find((w) => w.currency === "NGN");
    const usd = h.wallets.find((w) => w.currency === "USD");
    expect(ngn.balance).toBe("99200.00");
    expect(usd.balance).toBe("250.00");
    expect(h.walletTxns).toHaveLength(2);
    expect(h.walletTxns.map((t) => t.type).sort()).toEqual(["credit", "debit"]);
  });

  it("stale rate (>15 min) → PRECONDITION_FAILED, no money moved", async () => {
    seedRates(new Date(Date.now() - 16 * 60 * 1000));
    h.wallets.push({ id: 1, merchantId: "mer_1", tenantId: "ten_default", balance: "100000.00", currency: "NGN", status: "active" });
    await expect(caller().fx.convertCurrency({ fromCurrency: "NGN", toCurrency: "USD", amount: 100000 }))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: expect.stringMatching(/stale/i) });
    expect(h.wallets[0].balance).toBe("100000.00");
    expect(h.walletTxns).toHaveLength(0);
  });

  it("insufficient source funds → 402 and atomic rollback (no target credit, no ledger rows)", async () => {
    seedRates();
    h.wallets.push({ id: 1, merchantId: "mer_1", tenantId: "ten_default", balance: "10.00", currency: "NGN", status: "active" });
    await expect(caller().fx.convertCurrency({ fromCurrency: "NGN", toCurrency: "USD", amount: 100000 }))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(h.wallets.find((w) => w.currency === "USD")).toBeUndefined();
    expect(h.walletTxns).toHaveLength(0);
  });

  it("idempotent replay: same idempotencyKey returns the original conversion without double-converting", async () => {
    seedRates();
    h.wallets.push({ id: 1, merchantId: "mer_1", tenantId: "ten_default", balance: "200000.00", currency: "NGN", status: "active" });
    const input = { fromCurrency: "NGN", toCurrency: "USD", amount: 100000, idempotencyKey: "fx-key-00000001" };
    const r1: any = await caller().fx.convertCurrency(input);
    const r2: any = await caller().fx.convertCurrency(input);
    expect(r2.replayed).toBe(true);
    expect(r2.conversionId).toBe(r1.conversionId);
    const ngn = h.wallets.find((w) => w.currency === "NGN");
    expect(ngn.balance).toBe("99200.00"); // debited once
    expect(h.walletTxns).toHaveLength(2);
  });

  it("unsupported pair → NOT_FOUND", async () => {
    await expect(caller().fx.convertCurrency({ fromCurrency: "NGN", toCurrency: "EUR", amount: 1000 }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

// ─── H25: sweepers ────────────────────────────────────────────────────────────
describe("executeApprovedPayouts / expireStalePendingApprovals (H25)", () => {
  it("worker completes payout on NIP success: consumes reservation, emits payout processed", async () => {
    h.bridgeAvailable = true;
    h.wallets.push({ id: 1, merchantId: "mer_1", tenantId: "ten_default", balance: "4975.00", currency: "NGN", status: "active" });
    h.payouts.set("pyo_ok", {
      id: "pyo_ok", merchantId: "mer_1", amount: 5000, feeAmount: 25, currency: "NGN",
      status: "pending", reserved_amount: 5025, bankCode: "044", accountNumber: "0123456789",
      accountName: "X", narration: "n", reference: "PYO_1", createdAt: new Date(),
    });
    const res = await executeApprovedPayouts();
    expect(res.completed).toBe(1);
    const p = h.payouts.get("pyo_ok");
    expect(p.status).toBe("completed");
    expect(p.reserved_amount).toBe(0);
    expect(h.wallets[0].balance).toBe("4975.00"); // no second debit
    expect(h.events.some((e) => e.type === "processed" && e.payoutId === "pyo_ok")).toBe(true);
  });

  it("worker re-credits and marks failed on rail failure, emits payout.failed", async () => {
    h.bridgeAvailable = true;
    h.nipResult = { status: "failed", responseCode: "91", responseMessage: "Bank unavailable", stan: "x" };
    h.wallets.push({ id: 1, merchantId: "mer_1", tenantId: "ten_default", balance: "4975.00", currency: "NGN", status: "active" });
    h.payouts.set("pyo_bad", {
      id: "pyo_bad", merchantId: "mer_1", amount: 5000, feeAmount: 25, currency: "NGN",
      status: "pending", reserved_amount: 5025, bankCode: "044", accountNumber: "0123456789",
      accountName: "X", narration: "n", reference: "PYO_2", createdAt: new Date(),
    });
    const res = await executeApprovedPayouts();
    expect(res.failed).toBe(1);
    const p = h.payouts.get("pyo_bad");
    expect(p.status).toBe("failed");
    expect(p.failure_reason).toMatch(/Bank unavailable/);
    expect(h.wallets[0].balance).toBe("10000.00"); // reservation re-credited
    expect(h.events.some((e) => e.type === "failed" && e.payoutId === "pyo_bad")).toBe(true);
  });

  it("expiry sweeper auto-rejects stale pending approvals and releases reservations", async () => {
    h.wallets.push({ id: 1, merchantId: "mer_1", tenantId: "ten_default", balance: "4975.00", currency: "NGN", status: "active" });
    h.payouts.set("pyo_stale", {
      id: "pyo_stale", merchantId: "mer_1", amount: 5000, feeAmount: 25, currency: "NGN",
      status: "pending_approval", reserved_amount: 5025,
      createdAt: new Date(Date.now() - 48 * 3600 * 1000),
    });
    const res = await expireStalePendingApprovals(24);
    expect(res.expired).toBe(1);
    const p = h.payouts.get("pyo_stale");
    expect(p.status).toBe("rejected");
    expect(p.rejection_reason).toMatch(/Auto-rejected/);
    expect(h.wallets[0].balance).toBe("10000.00");
  });
});
