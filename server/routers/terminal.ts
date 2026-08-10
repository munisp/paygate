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
import { eq, and, desc, gte, lte, sql, count } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { creditWalletViaMiddleware } from "../middlewareBridge";
import {
  terminals,
  terminalTransactions,
} from "../../drizzle/schema";

const db = getDb();

function genRef(prefix = "TTX"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
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
      merchantId: z.string(),
      status: z.enum(["active", "inactive", "suspended", "maintenance"]).optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const offset = (input.page - 1) * input.pageSize;
      const conditions: any[] = [eq(terminals.merchantId, input.merchantId)];
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
    .input(z.object({ id: z.string(), merchantId: z.string() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [terminal] = await db.select().from(terminals)
        .where(and(eq(terminals.id, input.id), eq(terminals.merchantId, input.merchantId)));
      if (!terminal) throw new TRPCError({ code: "NOT_FOUND", message: "Terminal not found" });
      return terminal;
    }),

  // ── Provision a new terminal ────────────────────────────────────────────────
  provision: protectedProcedure
    .input(z.object({
      merchantId: z.string(),
      tenantId: z.string(),
      serialNumber: z.string().min(6).max(50),
      model: z.string().min(2).max(100),
      label: z.string().max(100).optional(),
      location: z.string().max(200).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      // Check serial uniqueness
      const [existing] = await db.select({ id: terminals.id }).from(terminals)
        .where(eq(terminals.serialNumber, input.serialNumber));
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "A terminal with this serial number already exists" });

      const [terminal] = await db.insert(terminals).values({
        merchantId: input.merchantId,
        tenantId: input.tenantId,
        serialNumber: input.serialNumber,
        model: input.model,
        label: input.label ?? null,
        location: input.location ?? null,
        status: "inactive",
      }).returning();

      await publishKafka("paygate.terminal.provisioned", {
        terminalId: terminal.id,
        merchantId: input.merchantId,
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
      merchantId: z.string(),
      status: z.enum(["active", "inactive", "suspended", "maintenance"]),
      label: z.string().max(100).optional(),
      location: z.string().max(200).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const updates: Partial<typeof terminals.$inferInsert> = {
        status: input.status,
        updatedAt: new Date(),
        ...(input.status === "active" ? { activatedAt: new Date() } : {}),
        ...(input.status === "inactive" ? { deactivatedAt: new Date() } : {}),
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.location !== undefined ? { location: input.location } : {}),
      };
      const [updated] = await db.update(terminals).set(updates)
        .where(and(eq(terminals.id, input.id), eq(terminals.merchantId, input.merchantId)))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Terminal not found" });

      await publishKafka("paygate.terminal.status_changed", {
        terminalId: input.id, merchantId: input.merchantId, status: input.status,
        timestamp: new Date().toISOString(),
      });
      return updated;
    }),

  // ── Device heartbeat (called by terminal firmware) ──────────────────────────
  heartbeat: publicProcedure
    .input(z.object({
      serialNumber: z.string(),
      firmwareVersion: z.string().optional(),
      ipAddress: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
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
      merchantId: z.string(),
      status: z.enum(["pending", "approved", "declined", "voided", "refunded"]).optional(),
      type: z.enum(["sale", "refund", "void", "pre_auth", "completion"]).optional(),
      from: z.date().optional(),
      to: z.date().optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const offset = (input.page - 1) * input.pageSize;
      const conditions: any[] = [eq(terminalTransactions.merchantId, input.merchantId)];
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
    .input(z.object({ id: z.string(), merchantId: z.string() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [txn] = await db.select().from(terminalTransactions)
        .where(and(eq(terminalTransactions.id, input.id), eq(terminalTransactions.merchantId, input.merchantId)));
      if (!txn) throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" });
      return txn;
    }),

  // ── Refund a terminal transaction ───────────────────────────────────────────
  refund: protectedProcedure
    .input(z.object({
      transactionId: z.string(),
      merchantId: z.string(),
      amountKobo: z.number().int().positive().optional(), // partial refund if provided
      reason: z.string().max(500).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const [original] = await db.select().from(terminalTransactions)
        .where(and(
          eq(terminalTransactions.id, input.transactionId),
          eq(terminalTransactions.merchantId, input.merchantId),
        ));
      if (!original) throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" });
      if (original.status !== "approved") throw new TRPCError({ code: "BAD_REQUEST", message: "Only approved transactions can be refunded" });

      const refundAmount = input.amountKobo ?? original.amountKobo;
      if (refundAmount > original.amountKobo) throw new TRPCError({ code: "BAD_REQUEST", message: "Refund amount exceeds original transaction amount" });

      const reference = genRef("TRF");
      const [refundTxn] = await db.insert(terminalTransactions).values({
        terminalId: original.terminalId,
        merchantId: input.merchantId,
        reference,
        type: "refund",
        paymentMethod: original.paymentMethod,
        cardBrand: original.cardBrand,
        cardLast4: original.cardLast4,
        amountKobo: refundAmount,
        currency: original.currency,
        status: "approved",
        completedAt: new Date(),
      }).returning();

      // Mark original as refunded
      await db.update(terminalTransactions).set({ status: "refunded", updatedAt: new Date() } as any)
        .where(eq(terminalTransactions.id, input.transactionId));

      await publishKafka("paygate.terminal.refund", {
        refundId: refundTxn.id, originalId: input.transactionId,
        merchantId: input.merchantId, amountKobo: refundAmount,
        reference, timestamp: new Date().toISOString(),
      });

      // TigerBeetle wiring
      creditWalletViaMiddleware({
        walletId: `wallet_${input.merchantId}`,
        userId: input.merchantId,
        amount: refundAmount,
        currency: original.currency,
        reference: reference,
        description: `Terminal refund for ${original.reference}`,
      }).catch(e => console.error("[TigerBeetle] Terminal refund failed:", e));

      return refundTxn;
    }),

  // ── Void a pending/pre-auth transaction ─────────────────────────────────────
  voidTransaction: protectedProcedure
    .input(z.object({ transactionId: z.string(), merchantId: z.string() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const [txn] = await db.select().from(terminalTransactions)
        .where(and(
          eq(terminalTransactions.id, input.transactionId),
          eq(terminalTransactions.merchantId, input.merchantId),
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
      merchantId: z.string(),
      terminalId: z.string().optional(),
      days: z.number().int().min(1).max(365).default(30),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
      const conditions: any[] = [
        eq(terminalTransactions.merchantId, input.merchantId),
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
        .where(and(eq(terminals.merchantId, input.merchantId), eq(terminals.status, "active")));

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
    .input(z.object({ merchantId: z.string() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const fluvioEndpoint = process.env.FLUVIO_ENDPOINT ?? "";
      const topic = "paygate.terminal.events";
      return {
        fluvioEndpoint,
        topic,
        merchantId: input.merchantId,
        // SSE endpoint on this server (proxied from Fluvio)
        sseUrl: `/api/events/terminal/${input.merchantId}`,
      };
    }),

  // ── Fluvio-wired provision ────────────────────────────────────────────────────
  // Re-publishes the provisioned event to Fluvio after DB insert.
  publishProvisionedEvent: protectedProcedure
    .input(z.object({
      terminalId: z.string(),
      serialNumber: z.string(),
      merchantId: z.string(),
      model: z.string(),
      label: z.string().optional(),
      location: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const event = makeTerminalEvent(
        "provisioned",
        input.terminalId,
        input.serialNumber,
        input.merchantId,
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
      merchantId: z.string(),
      firmwareVersion: z.string().optional(),
      ipAddress: z.string().optional(),
      status: z.string().default("active"),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const event = makeTerminalEvent(
        "heartbeat",
        input.terminalId,
        input.serialNumber,
        input.merchantId,
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
      merchantId: z.string(),
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
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const topic = input.eventType === "txn_completed"
        ? "paygate.terminal.txn_completed"
        : "paygate.terminal.txn_failed";
      const event = makeTerminalEvent(
        input.eventType,
        input.terminalId,
        input.serialNumber,
        input.merchantId,
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
