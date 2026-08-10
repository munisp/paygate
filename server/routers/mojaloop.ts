/**
 * Mojaloop tRPC Router
 * ====================
 * Exposes Mojaloop FSPIOP operations to the merchant portal:
 *   - partyLookup: resolve a party identifier (MSISDN/ACCOUNT_ID) to an FSP
 *   - initiateTransfer: create a quote + transfer via the Mojaloop Go bridge
 *   - getTransferStatus: poll transfer status from DB
 *   - listTransfers: paginated transfer history for a merchant
 *   - getAnalytics: daily transfer stats from Redis (via Go bridge)
 *
 * All procedures call the Go FSPIOP bridge at MIDDLEWARE_BRIDGE_URL.
 * The bridge handles Mojaloop Hub communication, ILP packet construction,
 * and Kafka/Fluvio event publishing.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { db } from "../db";
import { mojaloopTransfers, mojaloopParties, mojaloopQuotes } from "../../drizzle/schema";
import { eq, desc, and, gte, lte } from "drizzle-orm";
import { env } from "../_core/env";

const BRIDGE_URL = process.env.MIDDLEWARE_BRIDGE_URL || "http://localhost:8080";
const BRIDGE_KEY = process.env.MIDDLEWARE_INTERNAL_KEY || "";

async function bridgeRequest(path: string, body: object) {
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Key": BRIDGE_KEY,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bridge error ${res.status}: ${text}`);
  }
  return res.json();
}

export const mojaloopRouter = router({
  /**
   * Resolve a party identifier to an FSP ID and party name.
   * Uses the Mojaloop GET /parties/{idType}/{idValue} endpoint via Go bridge.
   */
  partyLookup: protectedProcedure
    .input(z.object({
      idType: z.enum(["MSISDN", "ACCOUNT_ID", "EMAIL", "PERSONAL_ID", "BUSINESS", "DEVICE", "NIN", "BVN"]),
      idValue: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await bridgeRequest("/mojaloop/parties/lookup", {
        merchantId: String(ctx.user.id),
        idType: input.idType,
        idValue: input.idValue,
      });

      // Cache party in DB for future lookups
      await db.insert(mojaloopParties).values({
        merchantId: String(ctx.user.id),
        partyIdType: input.idType,
        partyIdentifier: input.idValue,
        fspId: result.fspId,
        displayName: result.partyName ?? null,
        lookupStatus: "found",
        rawResponse: JSON.stringify(result),
      } as any).onConflictDoUpdate({
        target: [mojaloopParties.merchantId, mojaloopParties.partyIdentifier],
        set: {
          fspId: result.fspId,
          displayName: result.partyName ?? null,
        },
      }) as any as any;

      return {
        fspId: result.fspId as string,
        partyName: result.partyName as string | null,
        idType: input.idType,
        idValue: input.idValue,
      };
    }),

  /**
   * Initiate a Mojaloop transfer:
   *   1. POST /mojaloop/quotes  → get ILP packet + condition
   *   2. POST /mojaloop/transfers → submit transfer to Hub
   * Returns a transferId for polling.
   */
  initiateTransfer: protectedProcedure
    .input(z.object({
      payerIdType: z.enum(["MSISDN", "ACCOUNT_ID", "EMAIL", "PERSONAL_ID", "BVN"]),
      payerIdValue: z.string().min(1),
      payeeIdType: z.enum(["MSISDN", "ACCOUNT_ID", "EMAIL", "PERSONAL_ID", "BVN"]),
      payeeIdValue: z.string().min(1),
      amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
      currency: z.enum(["NGN", "USD", "GHS", "KES", "ZAR", "UGX", "TZS", "XOF"]),
      note: z.string().max(200).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await bridgeRequest("/mojaloop/transfers/initiate", {
        merchantId: String(ctx.user.id),
        ...input,
      });

      // Persist transfer record
      const amountMinor = Math.round(parseFloat(input.amount) * 100);
      await db.insert(mojaloopTransfers).values({
        merchantId: String(ctx.user.id),
        transferId: result.transferId,
        quoteId: result.quoteId,
        payerFspId: result.payerFspId,
        payeeFspId: result.payeeFspId,
        amount: amountMinor,
        amountCurrency: input.currency,
        transferState: "RESERVED",
        ilpPacket: result.ilpPacket ?? null,
        condition: result.condition ?? null,
      }) as any as any as any;

      return {
        transferId: result.transferId as string,
        quoteId: result.quoteId as string,
        transferState: "RESERVED" as string,
        expiration: result.expiration as string | null,
      };
    }),

  /**
   * Poll the status of a Mojaloop transfer.
   */
  getTransferStatus: protectedProcedure
    .input(z.object({ transferId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const [transfer] = await db
        .select()
        .from(mojaloopTransfers)
        .where(
          and(
            eq(mojaloopTransfers.transferId, input.transferId),
            eq(mojaloopTransfers.merchantId, String(ctx.user.id)),
          )
        )
        .limit(1);

      if (!transfer) {
        throw new Error("Transfer not found");
      }

      return transfer;
    }),

  /**
   * List paginated Mojaloop transfers for the authenticated merchant.
   */
  listTransfers: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
      currency: z.string().optional(),
      state: z.enum(["RESERVED", "COMMITTED", "ABORTED"]).optional(),
      from: z.date().optional(),
      to: z.date().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const conditions = [eq(mojaloopTransfers.merchantId, String(ctx.user.id))];
      if (input.currency) conditions.push(eq(mojaloopTransfers.currency, input.currency));
      if (input.state) conditions.push(eq(mojaloopTransfers.transferState, input.state));
      if (input.from) conditions.push(gte(mojaloopTransfers.createdAt, input.from));
      if (input.to) conditions.push(lte(mojaloopTransfers.createdAt, input.to));

      const transfers = await db
        .select()
        .from(mojaloopTransfers)
        .where(and(...conditions))
        .orderBy(desc(mojaloopTransfers.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return transfers;
    }),

  /**
   * Get daily transfer analytics for the merchant.
   * Fetches from the Go bridge which reads from Redis aggregates.
   */
  getAnalytics: protectedProcedure
    .input(z.object({
      days: z.number().min(1).max(90).default(30),
    }))
    .query(async ({ input, ctx }) => {
      try {
        const result = await bridgeRequest("/mojaloop/analytics/daily", {
          merchantId: String(ctx.user.id),
          days: input.days,
        });
        return result as {
          days: Array<{
            date: string;
            transfers_completed: number;
            transfers_failed: number;
            volume_minor_units: number;
            party_lookups: number;
            quotes_accepted: number;
          }>;
        };
      } catch {
        // Return empty if bridge unavailable
        return { days: [] };
      }
    }),
});
