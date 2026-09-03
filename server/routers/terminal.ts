/**
 * terminal.ts — POS Terminal Management Router
 *
 * Procedures:
 *   terminal.list              — list all terminals for merchant
 *   terminal.get               — get single terminal by id
 *   terminal.provision         — register a new terminal device
 *   terminal.updateStatus      — activate / suspend / maintenance
 *   terminal.heartbeat         — device heartbeat (public, authenticated by serial + secret)
 *   terminal.listTransactions  — paginated transaction history for a terminal
 *   terminal.getTransaction    — single transaction detail
 *   terminal.refund            — initiate refund on a terminal transaction
 *   terminal.voidTransaction   — void a pending/pre-auth transaction
 *   terminal.stats             — summary stats (total volume, count, avg ticket)
 */

import { z } from "zod";
import { eq, and, desc, gte, lte, sql, count, like } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { getDb, getUserByOpenId, getMerchantByOwnerId } from "../db";
import { debitWalletViaMiddleware } from "../middlewareBridge";
import { timingSafeStringEqual } from "../securityUtils";
import {
  terminals,
  terminalTransactions,
} from "../../drizzle/schema";
import type { Merchant } from "../../drizzle/schema";

// NOTE: no module-scope getDb() — handlers resolve `db` per-invocation so the
// module stays import-safe under test mocks and cold-start ordering.

function genRef(prefix = "TTX"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

/**
 * Resolve the authenticated user's merchant server-side.
 * Client-supplied merchantId/tenantId are NEVER trusted for money movement or scoping.
 */
async function resolveMerchant(openId: string): Promise<Merchant> {
  const user = await getUserByOpenId(openId);
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
  const merchant = await getMerchantByOwnerId(user.id);
  if (!merchant) throw new TRPCError({ code: "FORBIDDEN", message: "No merchant account for this user" });
  return merchant;
}

/**
 * Verify a terminal device secret against the configured shared secret.
 * Fail closed when TERMINAL_DEVICE_SECRET is unset — no telemetry write may
 * occur for an unauthenticated device.
 */
function verifyTerminalSecret(provided: string | undefined): void {
  const expected = process.env.TERMINAL_DEVICE_SECRET;
  if (!expected) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "TERMINAL_DEVICE_SECRET is not configured" });
  }
  if (!provided || !timingSafeStringEqual(provided, expected)) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid terminal secret" });
  }
}

// ─── Fluvio publish helper ────────────────────────────────────────────────────
// Publishes to Fluvio via the Go bridge HTTP proxy.
// Falls back to Kafka bridge if Fluvio is unavailable.
async function publishFluvio(
  topic: string,
  event: {
    event_id: string;
    event_type: string;
    terminal_id: string;
    serial_number: string;
    merchant_id: string;
    tenant_id: string;
    timestamp: string;
    payload: Record<string, unknown>;
  }
) {
  const bridgeUrl = process.env.MIDDLEWARE_BRIDGE_URL;
  const fluvioEndpoint = process.env.FLUVIO_ENDPOINT;
  const internalKey = process.env.MIDDLEWARE_INTERNAL_KEY ?? "";

  // Try Fluvio HTTP proxy first
  if (fluvioEndpoint) {
    try {
      const resp = await fetch(`${fluvioEndpoint}/produce/${topic}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(3000),
      });
      if (resp.ok) return;
    } catch { /* fall through to Kafka */ }
  }

  // Fallback: Kafka bridge
  if (bridgeUrl) {
    try {
      await fetch(`${bridgeUrl}/kafka/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Internal-Key": internalKey },
        body: JSON.stringify({ topic, payload: event }),
        signal: AbortSignal.timeout(3000),
      });
    } catch { /* non-blocking */ }
  }
}

function makeTerminalEvent(
  eventType: string,
  terminalId: string,
  serialNumber: string,
  merchantId: string,
  payload: Record<string, unknown>
) {
  return {
    event_id: `tevt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    event_type: eventType,
    terminal_id: terminalId,
    serial_number: serialNumber,
    merchant_id: merchantId,
    tenant_id: process.env.TENANT_ID ?? "default",
    timestamp: new Date().toISOString(),
    payload,
  };
}

/** @deprecated use publishFluvio instead */
async function publishKafka(topic: string, payload: Record<string, unknown>) {
  const url = process.env.MIDDLEWARE_BRIDGE_URL;
  if (!url) return;
  try {
    await fetch(`${url}/kafka/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Key": process.env.MIDDLEWARE_INTERNAL_KEY ?? "" },
      body: JSON.stringify({ topic, payload }),
      signal: AbortSignal.timeout(3000),
    });
  } catch { /* non-blocking */ }
}

export const terminalRouter = router({

  // ── List terminals ──────────────────────────────────────────────────────────
  list: protectedProcedure
    .input(z.object({
      merchantId: z.string().optional(), // ignored — resolved server-side
      status: z.enum(["active", "inactive", "suspended", "maintenance"]).optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const merchant = await resolveMerchant(ctx.user.openId);
      const offset = (input.page - 1) * input.pageSize;
      const conditions: any[] = [eq(terminals.merchantId, merchant.id)];
      if (input.status) conditions.push(eq(terminals.status, input.status));

      const [rows, [{ total }]] = await Promise.all([
        db.select().from(terminals).where(and(...conditions))
          .orderBy(desc(terminals.createdAt)).limit(input.pageSize).offset(offset),
        db.select({ total: sql<number>`cast(count(*) as int)` }).from(terminals).where(and(...conditions)),
      ]);
      return { terminals: rows, total, page: input.page, pageSize: input.pageSize };
    }),

  // ── Get single terminal ─────────────────────────────────────────────────────
  get: protectedProcedure
    .input(z.object({ id: z.string(), merchantId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const merchant = await resolveMerchant(ctx.user.openId);
      const [terminal] = await db.select().from(terminals)
        .where(and(eq(terminals.id, input.id), eq(terminals.merchantId, merchant.id)));
      if (!terminal) throw new TRPCError({ code: "NOT_FOUND", message: "Terminal not found" });
      return terminal;
    }),

  // ── Provision a new terminal ────────────────────────────────────────────────
  provision: protectedProcedure
    .input(z.object({
      merchantId: z.string().optional(), // ignored — resolved server-side
      tenantId: z.string().optional(),   // ignored — taken from resolved merchant
      serialNumber: z.string().min(6).max(50),
      model: z.string().min(2).max(100),
      label: z.string().max(100).optional(),
      location: z.string().max(200).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const merchant = await resolveMerchant(ctx.user.openId);
      // Check serial uniqueness
      const [existing] = await db.select({ id: terminals.id }).from(terminals)
        .where(eq(terminals.serialNumber, input.serialNumber));
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "A terminal with this serial number already exists" });

      const [terminal] = await db.insert(terminals).values({
        merchantId: merchant.id,
        tenantId: merchant.tenantId,
        serialNumber: input.serialNumber,
        model: input.model,
        label: input.label ?? null,
        location: input.location ?? null,
        status: "inactive",
      }).returning();

      await publishKafka("paygate.terminal.provisioned", {
        terminalId: terminal.id,
        merchantId: merchant.id,
        serialNumber: input.serialNumber,
        model: input.model,
        timestamp: new Date().toISOString(),
      });

      return terminal;
    }),

  // ── Update terminal status ──────────────────────────────────────────────────
  updateStatus: protectedProcedure
    .input(z.object({
      id: z.string(),
      merchantId: z.string().optional(), // ignored — resolved server-side
      status: z.enum(["active", "inactive", "suspended", "maintenance"]),
      label: z.string().max(100).optional(),
      location: z.string().max(200).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const merchant = await resolveMerchant(ctx.user.openId);
      const updates: Partial<typeof terminals.$inferInsert> = {
        status: input.status,
        updatedAt: new Date(),
        ...(input.status === "active" ? { activatedAt: new Date() } : {}),
        ...(input.status === "inactive" ? { deactivatedAt: new Date() } : {}),
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.location !== undefined ? { location: input.location } : {}),
      };
      const [updated] = await db.update(terminals).set(updates)
        .where(and(eq(terminals.id, input.id), eq(terminals.merchantId, merchant.id)))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Terminal not found" });

      await publishKafka("paygate.terminal.status_changed", {
        terminalId: input.id, merchantId: merchant.id, status: input.status,
        timestamp: new Date().toISOString(),
      });
      return updated;
    }),

  // ── Device heartbeat (called by terminal firmware) ──────────────────────────
  heartbeat: publicProcedure
    .input(z.object({
      serialNumber: z.string(),
      secret: z.string().min(1),
      firmwareVersion: z.string().optional(),
      ipAddress: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      // Verify the device secret FIRST (fail closed when unconfigured) — an
      // unauthenticated caller must not be able to probe serial numbers or
      // write telemetry.
      verifyTerminalSecret(input.secret);

      const [terminal] = await db.select().from(terminals)
        .where(eq(terminals.serialNumber, input.serialNumber));
      if (!terminal) throw new TRPCError({ code: "NOT_FOUND", message: "Terminal not registered" });

      await db.update(terminals).set({
        lastHeartbeatAt: new Date(),
        ...(input.firmwareVersion ? { firmwareVersion: input.firmwareVersion } : {}),
        ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
        updatedAt: new Date(),
      }).where(eq(terminals.id, terminal.id));

      return { ok: true, terminalId: terminal.id, status: terminal.status };
    }),

  // ── List transactions for a terminal ───────────────────────────────────────
  listTransactions: protectedProcedure
    .input(z.object({
      terminalId: z.string().optional(),
      merchantId: z.string().optional(), // ignored — resolved server-side
      status: z.enum(["pending", "approved", "declined", "voided", "refunded"]).optional(),
      type: z.enum(["sale", "refund", "void", "pre_auth", "completion"]).optional(),
      from: z.date().optional(),
      to: z.date().optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const merchant = await resolveMerchant(ctx.user.openId);
      const offset = (input.page - 1) * input.pageSize;
      const conditions: any[] = [eq(terminalTransactions.merchantId, merchant.id)];
      if (input.terminalId) conditions.push(eq(terminalTransactions.terminalId, input.terminalId));
      if (input.status) conditions.push(eq(terminalTransactions.status, input.status));
      if (input.type) conditions.push(eq(terminalTransactions.type, input.type));
      if (input.from) conditions.push(gte(terminalTransactions.createdAt, input.from));
      if (input.to) conditions.push(lte(terminalTransactions.createdAt, input.to));

      const [rows, [{ total }]] = await Promise.all([
        db.select().from(terminalTransactions).where(and(...conditions))
          .orderBy(desc(terminalTransactions.createdAt)).limit(input.pageSize).offset(offset),
        db.select({ total: sql<number>`cast(count(*) as int)` }).from(terminalTransactions).where(and(...conditions)),
      ]);
      return { transactions: rows, total, page: input.page, pageSize: input.pageSize };
    }),

  // ── Get single terminal transaction ────────────────────────────────────────
  getTransaction: protectedProcedure
    .input(z.object({ id: z.string(), merchantId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const merchant = await resolveMerchant(ctx.user.openId);
      const [txn] = await db.select().from(terminalTransactions)
        .where(and(eq(terminalTransactions.id, input.id), eq(terminalTransactions.merchantId, merchant.id)));
      if (!txn) throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" });
      return txn;
    }),

  // ── Refund a terminal transaction ───────────────────────────────────────────
  refund: protectedProcedure
    .input(z.object({
      transactionId: z.string(),
      merchantId: z.string().optional(), // ignored — resolved server-side
      amountKobo: z.number().int().positive().optional(), // partial refund if provided
      reason: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const merchant = await resolveMerchant(ctx.user.openId);
      const merchantId = merchant.id;

      // Claim + record the refund inside a transaction with the original row
      // locked (FOR UPDATE) so concurrent refunds cannot over-refund. The
      // cumulative refund total for an original transaction is tracked via
      // refund rows whose reference carries the original reference prefix
      // (terminal_transactions has no original-transaction FK column).
      const { refundTxn, original, refundAmount } = await db.transaction(async (tx) => {
        const lockRes: any = await tx.execute(sql`
          SELECT * FROM terminal_transactions
          WHERE id = ${input.transactionId} AND merchant_id = ${merchantId}
          FOR UPDATE
        `);
        const lockRows: any[] = lockRes?.rows ?? lockRes ?? [];
        const original = lockRows[0];
        if (!original) throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" });
        // Column names from raw SQL are snake_case
        const originalStatus: string = original.status;
        const originalAmount: number = Number(original.amount_kobo);
        const originalReference: string = original.reference;
        const originalType: string = original.type;
        if (originalStatus !== "approved") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Only approved transactions can be refunded" });
        }
        if (originalType === "refund" || originalType === "void") {
          throw new TRPCError({ code: "BAD_REQUEST", message: `A ${originalType} transaction cannot be refunded` });
        }

        const refundAmount = input.amountKobo ?? originalAmount;
        if (refundAmount > originalAmount) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Refund amount exceeds original transaction amount" });
        }

        // Idempotency: sum prior COMPLETED refunds against this original — the
        // running total must never exceed the original amount. (Refunds whose
        // wallet debit failed are marked 'declined' and do not count.)
        const refundPrefix = `RFND_${originalReference}_%`;
        const [prior] = await tx.select({
          total: sql<number>`cast(coalesce(sum(amount_kobo), 0) as bigint)`,
        }).from(terminalTransactions).where(and(
          eq(terminalTransactions.type, "refund"),
          eq(terminalTransactions.status, "approved"),
          like(terminalTransactions.reference, refundPrefix),
        ));
        const priorRefunded = Number(prior?.total ?? 0);
        if (priorRefunded + refundAmount > originalAmount) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Cumulative refunds (${priorRefunded + refundAmount}) would exceed original amount (${originalAmount})`,
          });
        }

        // Atomic status guard BEFORE moving money: flip the original to
        // 'refunded' only when the refund completes the full amount, and only
        // if it is still 'approved' (guards against a stale-status race).
        if (priorRefunded + refundAmount === originalAmount) {
          const [claimed] = await tx.update(terminalTransactions)
            .set({ status: "refunded", updatedAt: new Date() } as any)
            .where(and(
              eq(terminalTransactions.id, input.transactionId),
              eq(terminalTransactions.status, "approved"),
            ))
            .returning();
          if (!claimed) {
            throw new TRPCError({ code: "CONFLICT", message: "Transaction status changed concurrently — refund aborted" });
          }
        }

        const reference = `RFND_${originalReference}_${genRef()}`;
        const [refundTxn] = await tx.insert(terminalTransactions).values({
          terminalId: original.terminal_id,
          merchantId,
          reference,
          type: "refund",
          paymentMethod: original.payment_method,
          cardBrand: original.card_brand,
          cardLast4: original.card_last4,
          amountKobo: refundAmount,
          currency: original.currency,
          status: "approved",
          completedAt: new Date(),
        }).returning();

        return {
          refundTxn,
          refundAmount,
          original: {
            reference: originalReference,
            currency: original.currency as string,
          },
        };
      });

      // Money movement: a refund RETURNS funds to the cardholder, so the
      // merchant wallet is DEBITED (guarded against sufficient balance at the
      // middleware boundary) — AWAITED and fail-loud, never silently caught.
      try {
        await debitWalletViaMiddleware({
          walletId: `wallet_${merchantId}`,
          userId: merchantId,
          amount: refundAmount,
          currency: original.currency,
          reference: refundTxn.reference,
          description: `Terminal refund for ${original.reference}`,
        });
      } catch (err: any) {
        // Compensate the local records so the failed refund cannot be treated
        // as completed and the original becomes refundable again on retry.
        await db.update(terminalTransactions)
          .set({ status: "declined", updatedAt: new Date() } as any)
          .where(eq(terminalTransactions.id, refundTxn.id));
        await db.update(terminalTransactions)
          .set({ status: "approved", updatedAt: new Date() } as any)
          .where(and(
            eq(terminalTransactions.id, input.transactionId),
            eq(terminalTransactions.status, "refunded"),
          ));
        throw err instanceof TRPCError
          ? err
          : new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Wallet debit failed — refund aborted: ${err?.message ?? "unknown error"}` });
      }

      await publishKafka("paygate.terminal.refund", {
        refundId: refundTxn.id, originalId: input.transactionId,
        merchantId, amountKobo: refundAmount,
        reference: refundTxn.reference, timestamp: new Date().toISOString(),
      });

      return refundTxn;
    }),

  // ── Void a pending/pre-auth transaction ─────────────────────────────────────
  voidTransaction: protectedProcedure
    .input(z.object({ transactionId: z.string(), merchantId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const merchant = await resolveMerchant(ctx.user.openId);
      const [txn] = await db.select().from(terminalTransactions)
        .where(and(
          eq(terminalTransactions.id, input.transactionId),
          eq(terminalTransactions.merchantId, merchant.id),
        ));
      if (!txn) throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" });
      if (!["pending", "pre_auth"].includes(txn.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only pending or pre-auth transactions can be voided" });
      }
      const [voided] = await db.update(terminalTransactions)
        .set({ status: "voided", completedAt: new Date() } as any)
        .where(eq(terminalTransactions.id, input.transactionId))
        .returning();
      return voided;
    }),

  // ── Terminal stats ──────────────────────────────────────────────────────────
  stats: protectedProcedure
    .input(z.object({
      merchantId: z.string().optional(), // ignored — resolved server-side
      terminalId: z.string().optional(),
      days: z.number().int().min(1).max(365).default(30),
    }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const merchant = await resolveMerchant(ctx.user.openId);
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
      const conditions: any[] = [
        eq(terminalTransactions.merchantId, merchant.id),
        eq(terminalTransactions.status, "approved"),
        gte(terminalTransactions.createdAt, since),
      ];
      if (input.terminalId) conditions.push(eq(terminalTransactions.terminalId, input.terminalId));

      const [stats] = await db.select({
        totalCount: sql<number>`cast(count(*) as int)`,
        totalVolume: sql<number>`cast(coalesce(sum(amount_kobo), 0) as bigint)`,
        avgTicket: sql<number>`cast(coalesce(avg(amount_kobo), 0) as int)`,
      }).from(terminalTransactions).where(and(...conditions));

      const activeTerminals = await db.select({ cnt: sql<number>`cast(count(*) as int)` })
        .from(terminals)
        .where(and(eq(terminals.merchantId, merchant.id), eq(terminals.status, "active")));

      return {
        totalCount: stats?.totalCount ?? 0,
        totalVolumeKobo: stats?.totalVolume ?? 0,
        avgTicketKobo: stats?.avgTicket ?? 0,
        activeTerminalCount: activeTerminals[0]?.cnt ?? 0,
        days: input.days,
      };
    }),

  // ── SSE live event stream ────────────────────────────────────────────────────
  // Polls Fluvio HTTP proxy for the merchant's terminal events and streams them
  // to the browser via Server-Sent Events (SSE).
  // Usage: GET /api/events/terminal/:merchantId  (registered in index.ts)
  // This procedure returns the Fluvio consumer URL so the frontend can connect.
  getStreamConfig: protectedProcedure
    .input(z.object({ merchantId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const merchant = await resolveMerchant(ctx.user.openId);
      const fluvioEndpoint = process.env.FLUVIO_ENDPOINT ?? "";
      const topic = "paygate.terminal.events";
      return {
        fluvioEndpoint,
        topic,
        merchantId: merchant.id,
        // SSE endpoint on this server (proxied from Fluvio)
        sseUrl: `/api/events/terminal/${merchant.id}`,
      };
    }),

  // ── Fluvio-wired provision ────────────────────────────────────────────────────
  // Re-publishes the provisioned event to Fluvio after DB insert.
  publishProvisionedEvent: protectedProcedure
    .input(z.object({
      terminalId: z.string(),
      serialNumber: z.string(),
      merchantId: z.string().optional(), // ignored — resolved server-side
      model: z.string(),
      label: z.string().optional(),
      location: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const merchant = await resolveMerchant(ctx.user.openId);
      const event = makeTerminalEvent(
        "provisioned",
        input.terminalId,
        input.serialNumber,
        merchant.id,
        { model: input.model, label: input.label, location: input.location }
      );
      await publishFluvio("paygate.terminal.events", event);
      return { ok: true };
    }),

  // ── Fluvio-wired heartbeat ────────────────────────────────────────────────────
  publishHeartbeatEvent: publicProcedure
    .input(z.object({
      terminalId: z.string(),
      serialNumber: z.string(),
      secret: z.string().min(1),
      merchantId: z.string().optional(), // ignored — resolved from the registered terminal
      firmwareVersion: z.string().optional(),
      ipAddress: z.string().optional(),
      status: z.string().default("active"),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      // Unauthenticated event-forgery guard: same serial + secret contract as
      // terminal.heartbeat — fail closed, no telemetry write on failure.
      verifyTerminalSecret(input.secret);
      const [terminal] = await db.select({ id: terminals.id, merchantId: terminals.merchantId }).from(terminals)
        .where(eq(terminals.serialNumber, input.serialNumber));
      if (!terminal) throw new TRPCError({ code: "NOT_FOUND", message: "Terminal not registered" });
      const event = makeTerminalEvent(
        "heartbeat",
        input.terminalId,
        input.serialNumber,
        terminal.merchantId,
        {
          firmware_version: input.firmwareVersion,
          ip_address: input.ipAddress,
          status: input.status,
        }
      );
      await publishFluvio("paygate.terminal.events", event);
      return { ok: true };
    }),

  // ── Fluvio-wired transaction event ────────────────────────────────────────────
  publishTransactionEvent: protectedProcedure
    .input(z.object({
      terminalId: z.string(),
      serialNumber: z.string(),
      merchantId: z.string().optional(), // ignored — resolved server-side
      eventType: z.enum(["txn_completed", "txn_failed"]),
      transactionId: z.string(),
      reference: z.string(),
      type: z.string().default("sale"),
      paymentMethod: z.string(),
      cardBrand: z.string().optional(),
      cardLast4: z.string().optional(),
      amountKobo: z.number().int(),
      currency: z.string().default("NGN"),
      authCode: z.string().optional(),
      rrn: z.string().optional(),
      responseCode: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const merchant = await resolveMerchant(ctx.user.openId);
      const topic = input.eventType === "txn_completed"
        ? "paygate.terminal.txn_completed"
        : "paygate.terminal.txn_failed";
      const event = makeTerminalEvent(
        input.eventType,
        input.terminalId,
        input.serialNumber,
        merchant.id,
        {
          transaction_id: input.transactionId,
          reference: input.reference,
          type: input.type,
          payment_method: input.paymentMethod,
          card_brand: input.cardBrand,
          card_last4: input.cardLast4,
          amount_kobo: input.amountKobo,
          currency: input.currency,
          auth_code: input.authCode,
          rrn: input.rrn,
          response_code: input.responseCode,
        }
      );
      // Publish to specific topic AND aggregate topic
      await publishFluvio(topic, event);
      await publishFluvio("paygate.terminal.events", event);
      return { ok: true };
    }),
});
