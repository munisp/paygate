// server/routers/apAssistant.ts
// P2-a AI assistant for Accounts Payable (Melio-inspired AP suite).
//
// Procedures: ask (merchant-scoped Q&A over AP state via the art-reasoning
// ReAct service, returning an answer + PROPOSALS ONLY), confirmAction
// (validates a persisted proposal against the real bill gates and hands back a
// validated payload for the canonical payBill path), getTrace (ownership-checked
// audit read + best-effort service trace fetch).
//
// Conventions (IMPLEMENTATION_SPEC_MELIO.md §D1–D8, §P2-a):
// - merchant identity ALWAYS resolved server-side from ctx.user.openId
//   (hostedCheckout.ts:31 / crud119.ts:110 pattern) — never trust client input
// - service calls: direct fetch + X-Internal-Key + AbortSignal.timeout
//   (canonical: server/routers.ts:4270–4286); service failure → 503, NEVER a
//   fabricated answer
// - every ask persists an ai_audit_trail row (model 'art-reasoning', input
//   hash, output, trace id) mapped honestly onto the existing columns
//
// WHY THE ASSISTANT NEVER MOVES MONEY ITSELF:
// draft_payment proposals are DATA ONLY ({billId, amountKobo, fundingMethod,
// rationale}). confirmAction re-validates the proposal against the same gates
// payBill enforces (ownership + status approved|partially_paid + amount ≤
// remaining) but then returns {requiresApproval: true, nextStep:
// 'apBillPay.payBill'} instead of executing. The actual money movement stays
// on apBillPay.payBill so maker-checker approval rules (P1-a), payout
// approval workflows and ledger-strict bridge calls can never be bypassed by
// an AI proposal. The assistant prepares and validates; humans approve and
// the canonical path executes.

import { z } from "zod";
import { createHash, randomUUID } from "node:crypto";
import { eq, and, asc, gte, lte, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { db, getUserByOpenId, getMerchantByOwnerId } from "../db";
import {
  apBills,
  vendors,
  taxWithholdingRecords,
  aiAuditTrail,
} from "../../drizzle/schema";
import { ENV } from "../_core/env";
import { withIdempotency } from "../idempotency";
import { auditLog, buildAuditEntry } from "../auditTrail";
import { logger } from "../logger";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Tools the art-reasoning service may use while answering AP questions. */
const AP_ASSISTANT_TOOLS = ["query_bills", "draft_payment", "summarize_ap"] as const;

/** Bill states that count as "upcoming due" for the assistant's context. */
const UPCOMING_DUE_STATUSES = ["approved", "pending_approval", "scheduled", "partially_paid"] as const;

/** States from which a bill may be paid — mirrors apBillPay.PAYABLE_STATUSES. */
const PAYABLE_STATUSES = ["approved", "partially_paid"] as const;

const ART_REASON_TIMEOUT_MS = 45_000;
const ART_TRACE_TIMEOUT_MS = 10_000;

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A draft_payment proposal is inert data — it describes an intent, it does not
 * execute anything. Execution only ever happens through apBillPay.payBill.
 */
export interface ApProposal {
  type: "draft_payment";
  billId: string;
  amountKobo: number;
  fundingMethod: "wallet" | "card" | "bank_transfer" | "pay_over_time";
  rationale: string;
}

/** Shape returned by art-reasoning POST /v1/reason (python-services/art-reasoning/main.py run_react_loop). */
interface ArtReasonResponse {
  trace_id: string;
  answer: string;
  confidence?: number;
  recommendation?: string;
  steps?: { action?: string; action_input?: Record<string, unknown> }[];
  total_steps?: number;
  duration_ms?: number;
  // Forward-compatible: a future service version may return structured proposals directly.
  proposals?: Record<string, unknown>[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve the merchant that owns the authenticated user. Merchant identity is
 * ALWAYS derived server-side — a client-supplied merchantId is never trusted.
 */
async function resolveMerchant(openId: string) {
  const user = await getUserByOpenId(openId);
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
  const merchant = await getMerchantByOwnerId(user.id);
  if (!merchant) throw new TRPCError({ code: "FORBIDDEN", message: "Merchant account required" });
  return { user, merchant };
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Coerce a raw service action_input into a well-formed draft_payment proposal, or null if unusable. */
function toDraftPaymentProposal(raw: Record<string, unknown>): ApProposal | null {
  const billId = typeof raw.billId === "string" ? raw.billId
    : typeof raw.bill_id === "string" ? raw.bill_id : null;
  const amountKobo = typeof raw.amountKobo === "number" ? raw.amountKobo
    : typeof raw.amount_kobo === "number" ? raw.amount_kobo : null;
  if (!billId || amountKobo == null || !Number.isFinite(amountKobo) || amountKobo <= 0) return null;
  const fundingRaw = typeof raw.fundingMethod === "string" ? raw.fundingMethod
    : typeof raw.funding_method === "string" ? raw.funding_method : "wallet";
  const fundingMethod = (["wallet", "card", "bank_transfer", "pay_over_time"] as const).includes(fundingRaw as never)
    ? (fundingRaw as ApProposal["fundingMethod"])
    : "wallet";
  const rationale = typeof raw.rationale === "string" ? raw.rationale
    : typeof raw.reason === "string" ? raw.reason : "proposed by AP assistant";
  return { type: "draft_payment", billId, amountKobo: Math.round(amountKobo), fundingMethod, rationale };
}

/**
 * Extract draft_payment proposals from a ReAct response. Proposals come from
 * `draft_payment` tool steps (current service) or a structured `proposals`
 * array (future service versions). Anything unparseable is dropped — a
 * malformed proposal must never reach confirmAction.
 */
export function extractProposals(resp: ArtReasonResponse): ApProposal[] {
  const out: ApProposal[] = [];
  for (const raw of resp.proposals ?? []) {
    const p = toDraftPaymentProposal(raw);
    if (p) out.push(p);
  }
  for (const step of resp.steps ?? []) {
    if (step.action === "draft_payment" && step.action_input) {
      const p = toDraftPaymentProposal(step.action_input);
      if (p) out.push(p);
    }
  }
  return out;
}

/**
 * Build the server-side tool context for the ReAct loop: the merchant's
 * upcoming-due bills (next 30 days, top 10), vendor count and pending WHT
 * exposure. All data is merchant-scoped; nothing client-supplied is trusted.
 */
async function buildApContext(merchantId: string) {
  const now = new Date();
  const in30d = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const upcomingBills = await db
    .select({
      id: apBills.id,
      vendorId: apBills.vendorId,
      billNumber: apBills.billNumber,
      status: apBills.status,
      totalKobo: apBills.totalKobo,
      amountPaidKobo: apBills.amountPaidKobo,
      dueDate: apBills.dueDate,
    })
    .from(apBills)
    .where(and(
      eq(apBills.merchantId, merchantId),
      inArray(apBills.status, [...UPCOMING_DUE_STATUSES]),
      gte(apBills.dueDate, now),
      lte(apBills.dueDate, in30d),
    ))
    .orderBy(asc(apBills.dueDate))
    .limit(10);

  const vendorRows = await db
    .select({ id: vendors.id })
    .from(vendors)
    .where(and(eq(vendors.merchantId, merchantId), eq(vendors.isActive, true)));

  // Pending WHT exposure: sum tax_withholding_records.status='pending'. The
  // join to ap_bills scopes records to bills this merchant actually owns
  // (defence in depth on top of tax_withholding_records.merchant_id).
  const whtRows = await db
    .select({ taxAmountKobo: taxWithholdingRecords.taxAmountKobo })
    .from(taxWithholdingRecords)
    .innerJoin(apBills, eq(taxWithholdingRecords.billId, apBills.id))
    .where(and(eq(apBills.merchantId, merchantId), eq(taxWithholdingRecords.status, "pending")));

  const whtExposureKobo = whtRows.reduce((sum, r) => sum + (r.taxAmountKobo ?? 0), 0);

  return {
    merchantId,
    asOf: now.toISOString(),
    upcomingDueBills: upcomingBills,
    vendorCount: vendorRows.length,
    whtExposureKobo,
  };
}

type ApContext = Awaited<ReturnType<typeof buildApContext>>;

/** POST to the art-reasoning service. Any failure → 503 (no fabricated answers). */
async function callArtReasoning(question: string, context: ApContext): Promise<ArtReasonResponse> {
  let resp: Response;
  try {
    resp = await fetch(`${ENV.artReasoningUrl}/v1/reason`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Key": ENV.internalApiKey },
      body: JSON.stringify({
        // `question` is the field the service's ReasonRequest model declares;
        // `query`/`tools`/`constraints` are forwarded for the AP-aware service
        // contract (pydantic ignores undeclared extras on the current build).
        question,
        query: question,
        context: JSON.stringify(context),
        tools: [...AP_ASSISTANT_TOOLS],
        constraints: { execution: "proposal_only" },
      }),
      signal: AbortSignal.timeout(ART_REASON_TIMEOUT_MS),
    });
  } catch (err) {
    logger.error("ap_assistant.reason_unreachable", {
      error: err instanceof Error ? err.message : String(err),
    });
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "AI reasoning service unavailable — no answer could be produced",
    });
  }
  if (!resp.ok) {
    logger.error("ap_assistant.reason_http_error", { status: resp.status });
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: `AI reasoning service error (${resp.status}) — no answer could be produced`,
    });
  }
  return (await resp.json()) as ArtReasonResponse;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const apAssistantRouter = router({
  /**
   * Ask the AP assistant a question. Builds merchant-scoped tool context
   * server-side, calls art-reasoning with execution=proposal_only, persists an
   * ai_audit_trail row and returns {answer, proposals, traceId}.
   *
   * Proposals are NEVER executed here — ask performs no mutation on AP state
   * (the only write is the audit-trail insert).
   */
  ask: protectedProcedure
    .input(z.object({
      question: z.string().min(3).max(2000),
      billId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { merchant } = await resolveMerchant(ctx.user.openId);

      const context = await buildApContext(merchant.id);
      if (input.billId) {
        // Optional question scoping — attach the specific bill when the caller
        // is asking about one (ownership-checked).
        const [bill] = await db
          .select()
          .from(apBills)
          .where(and(eq(apBills.id, input.billId), eq(apBills.merchantId, merchant.id)))
          .limit(1);
        if (!bill) throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found" });
        (context as Record<string, unknown>).focusBill = bill;
      }

      const result = await callArtReasoning(input.question, context);
      const proposals = extractProposals(result);

      // Persist the audit trail. Column mapping is honest:
      // - modelId      ← the model/service that produced the answer
      // - decision     ← 'REVIEW': assistant output always requires human review
      // - confidence   ← service-reported confidence (0 when absent)
      // - features     ← JSON: sha256 input hash + context + extracted proposals
      // - explanation  ← the answer text itself
      // - transactionId← the service trace id (no dedicated trace column exists;
      //                  this is the only free-text reference column)
      // - latencyMs/artSteps/toolsUsed ← service-reported run metadata
      const traceId = randomUUID();
      const inputHash = sha256Hex(JSON.stringify({ question: input.question, context }));
      await db.insert(aiAuditTrail).values({
        id: traceId,
        transactionId: result.trace_id ?? null,
        merchantId: merchant.id,
        modelId: "art-reasoning",
        decision: "REVIEW",
        confidence: typeof result.confidence === "number" ? result.confidence : 0,
        riskScore: null,
        features: JSON.stringify({ inputHash, context, proposals }),
        explanation: result.answer ?? "",
        latencyMs: result.duration_ms ?? null,
        toolsUsed: JSON.stringify([...AP_ASSISTANT_TOOLS]),
        artSteps: result.total_steps ?? null,
      });

      await auditLog(buildAuditEntry(ctx, merchant.id, "ap.assistant.ask", "ai_audit_trail", traceId, {
        serviceTraceId: result.trace_id ?? null,
        proposalCount: proposals.length,
      }));

      return { answer: result.answer ?? "", proposals, traceId };
    }),

  /**
   * Confirm a proposal from a previous ask. Loads the proposal from the
   * persisted ai_audit_trail row (ownership-checked), re-validates it against
   * the same gates apBillPay.payBill enforces (bill ownership + status
   * approved|partially_paid + amount ≤ remaining) and returns a validated
   * payload for the canonical payBill path.
   *
   * This procedure deliberately does NOT call any payout primitive: the
   * assistant must never bypass maker-checker approvals. The returned
   * validatedPayload must be submitted to apBillPay.payBill, where approval
   * rules, payout workflows and ledger-strict execution apply.
   */
  confirmAction: protectedProcedure
    .input(z.object({
      traceId: z.string().min(1),
      proposalIndex: z.number().int().min(0),
      idempotencyKey: z.string().min(8).max(128),
    }))
    .mutation(async ({ ctx, input }) => {
      const { merchant } = await resolveMerchant(ctx.user.openId);
      return withIdempotency({
        key: input.idempotencyKey,
        merchantId: merchant.id,
        operation: "ap.assistant.confirm",
        requestBody: input,
        execute: async () => {
          const [auditRow] = await db
            .select()
            .from(aiAuditTrail)
            .where(and(eq(aiAuditTrail.id, input.traceId), eq(aiAuditTrail.merchantId, merchant.id)))
            .limit(1);
          if (!auditRow) throw new TRPCError({ code: "NOT_FOUND", message: "Trace not found" });

          let proposals: ApProposal[] = [];
          try {
            const features = JSON.parse(auditRow.features ?? "{}") as { proposals?: ApProposal[] };
            proposals = Array.isArray(features.proposals) ? features.proposals : [];
          } catch {
            proposals = [];
          }
          const proposal = proposals[input.proposalIndex];
          if (!proposal) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Proposal not found at the given index" });
          }
          if (proposal.type !== "draft_payment") {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Unsupported proposal type '${proposal.type}' — only draft_payment can be confirmed`,
            });
          }

          // Same gates as apBillPay.payBill — the assistant prepares, the
          // canonical path executes.
          const [bill] = await db
            .select()
            .from(apBills)
            .where(and(eq(apBills.id, proposal.billId), eq(apBills.merchantId, merchant.id)))
            .limit(1);
          if (!bill) throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found" });
          if (!(PAYABLE_STATUSES as readonly string[]).includes(bill.status)) {
            throw new TRPCError({
              code: "CONFLICT",
              message: `Bill is not payable from status '${bill.status}' — must be approved or partially_paid`,
            });
          }
          const remaining = bill.totalKobo - (bill.amountPaidKobo ?? 0);
          if (remaining <= 0) {
            throw new TRPCError({ code: "CONFLICT", message: "Bill is already fully paid" });
          }
          if (proposal.amountKobo > remaining) {
            throw new TRPCError({
              code: "CONFLICT",
              message: `Proposed amount ${proposal.amountKobo} kobo exceeds remaining balance ${remaining} kobo`,
            });
          }

          await auditLog(buildAuditEntry(ctx, merchant.id, "ap.assistant.confirm", "ap_bill", bill.id, {
            traceId: input.traceId,
            proposalIndex: input.proposalIndex,
            amountKobo: proposal.amountKobo,
            fundingMethod: proposal.fundingMethod,
          }));

          // requiresApproval is ALWAYS true: the payload must go through
          // apBillPay.payBill so approval rules / maker-checker still apply.
          return {
            requiresApproval: true as const,
            nextStep: "apBillPay.payBill" as const,
            validatedPayload: {
              billId: bill.id,
              amountKobo: proposal.amountKobo,
              fundingMethod: proposal.fundingMethod,
              rationale: proposal.rationale,
            },
          };
        },
      });
    }),

  /**
   * Read a persisted assistant trace (ownership-checked) and, best-effort,
   * fetch the full ReAct trace from the art-reasoning service. A service
   * outage never fails this read — serviceTrace is null in that case.
   */
  getTrace: protectedProcedure
    .input(z.object({ traceId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const { merchant } = await resolveMerchant(ctx.user.openId);
      const [auditRow] = await db
        .select()
        .from(aiAuditTrail)
        .where(and(eq(aiAuditTrail.id, input.traceId), eq(aiAuditTrail.merchantId, merchant.id)))
        .limit(1);
      if (!auditRow) throw new TRPCError({ code: "NOT_FOUND", message: "Trace not found" });

      let serviceTrace: unknown = null;
      if (auditRow.transactionId) {
        try {
          const resp = await fetch(
            `${ENV.artReasoningUrl}/v1/trace/${encodeURIComponent(auditRow.transactionId)}`,
            {
              method: "GET",
              headers: { "X-Internal-Key": ENV.internalApiKey },
              signal: AbortSignal.timeout(ART_TRACE_TIMEOUT_MS),
            },
          );
          if (resp.ok) serviceTrace = await resp.json();
        } catch (err) {
          logger.warn("ap_assistant.trace_fetch_failed", {
            traceId: input.traceId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      return { audit: auditRow, serviceTrace };
    }),
});

/** Exported for unit tests (hostedCheckout.test.ts internals pattern). */
export const __apAssistantInternals = {
  extractProposals,
  toDraftPaymentProposal,
  UPCOMING_DUE_STATUSES,
  PAYABLE_STATUSES,
};
