// @ts-nocheck
/**
 * PayGate Merchant Portal — gRPC tRPC Router
 *
 * Exposes gRPC service health and key operations through the tRPC API.
 * This allows the frontend to:
 *   - Check gRPC service connectivity
 *   - Query TigerBeetle ledger balances directly
 *   - Trigger fraud risk profile lookups
 *   - Monitor outbox relay event status
 *
 * All procedures degrade gracefully when gRPC services are unavailable.
 */

import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  getLedgerClient,
  getFraudClient,
  getNotificationClient,
  getOutboxClient,
  checkGrpcHealth,
} from "./grpcClient";

export const grpcRouter = router({
  // ── Health check for all gRPC services ──────────────────────────────────
  health: protectedProcedure
    .query(async () => {
      const health = await checkGrpcHealth().catch(() => ({
        ledger: false,
        fraud: false,
        notifications: false,
        ussd: false,
        outbox: false,
        consumer: false,
        analytics: false,
      }));
      return {
        ...health,
        configured: {
          ledger: !!process.env.GRPC_BRIDGE_URL,
          fraud: !!(process.env.GRPC_FRAUD_URL || process.env.GRPC_BRIDGE_URL),
          notifications: !!(process.env.GRPC_NOTIFY_URL || process.env.PUSH_SERVICE_GRPC_URL),
          ussd: !!(process.env.GRPC_USSD_URL || process.env.USSD_SERVICE_GRPC_URL),
          outbox: !!(process.env.GRPC_OUTBOX_URL || process.env.OUTBOX_RELAY_GRPC_URL),
        },
      };
    }),

  // ── Ledger: get TigerBeetle account balance ──────────────────────────────
  ledgerBalance: protectedProcedure
    .input(z.object({
      accountId: z.string().min(1),
      currency: z.string().default("NGN"),
    }))
    .query(async ({ input }) => {
      const client = getLedgerClient();
      if (!client) return { available: false, balance: null };
      try {
        const balance = await client.getBalance({
          accountId: input.accountId,
          currency: input.currency,
        });
        return { available: true, balance };
      } catch {
        return { available: false, balance: null };
      }
    }),

  // ── Ledger: create a transfer via gRPC (idempotent) ──────────────────────
  ledgerTransfer: protectedProcedure
    .input(z.object({
      idempotencyKey: z.string().uuid(),
      debitAccountId: z.string().min(1),
      creditAccountId: z.string().min(1),
      amountCents: z.number().int().positive(),
      currency: z.string().default("NGN"),
      ledgerCode: z.string().default("1"),
      reference: z.string().min(1),
      metadata: z.record(z.string(), z.string(), z.string(), z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      const client = getLedgerClient();
      if (!client) throw new Error("Ledger gRPC service not configured");
      return client.createTransfer({
        idempotencyKey: input.idempotencyKey,
        debitAccountId: input.debitAccountId,
        creditAccountId: input.creditAccountId,
        amountCents: input.amountCents,
        currency: input.currency,
        ledgerCode: input.ledgerCode,
        reference: input.reference,
        metadata: input.metadata as Record<string, string> | undefined,
      });
    }),

  // ── Fraud: get risk profile for a merchant ───────────────────────────────
  fraudRiskProfile: protectedProcedure
    .input(z.object({
      entityId: z.string().min(1),
      entityType: z.enum(["merchant", "consumer"]).default("merchant"),
    }))
    .query(async ({ input }) => {
      const client = getFraudClient();
      if (!client) return { available: false, profile: null };
      try {
        const profile = await client.getRiskProfile({
          entityId: input.entityId,
          entityType: input.entityType,
        });
        return { available: true, profile };
      } catch {
        return { available: false, profile: null };
      }
    }),

  // ── Outbox: get event delivery status ────────────────────────────────────
  outboxEventStatus: protectedProcedure
    .input(z.object({ eventId: z.string().min(1) }))
    .query(async ({ input }) => {
      const client = getOutboxClient();
      if (!client) return { available: false, event: null };
      try {
        const event = await client.getEventStatus({ eventId: input.eventId });
        return { available: true, event };
      } catch {
        return { available: false, event: null };
      }
    }),

  // ── Outbox: retry a failed event ─────────────────────────────────────────
  outboxRetryEvent: protectedProcedure
    .input(z.object({ eventId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const client = getOutboxClient();
      if (!client) throw new Error("Outbox gRPC service not configured");
      return client.retryEvent({ eventId: input.eventId });
    }),

  // ── Notifications: send a test push via gRPC ─────────────────────────────
  testPushNotification: protectedProcedure
    .input(z.object({
      userId: z.string().min(1),
      merchantId: z.string().min(1),
      title: z.string().default("Test Notification"),
      body: z.string().default("This is a test push notification from PayGate."),
    }))
    .mutation(async ({ input }) => {
      const client = getNotificationClient();
      if (!client) throw new Error("Notification gRPC service not configured");
      return client.sendToUser({
        userId: input.userId,
        merchantId: input.merchantId,
        notification: { title: input.title, body: input.body },
        notificationType: "SYSTEM",
        priority: "HIGH",
      });
    }),
});
