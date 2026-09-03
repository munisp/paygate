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
import { TRPCError } from "@trpc/server";
import { logger } from "../logger";
import { withIdempotency } from "../idempotency";

const BRIDGE_URL = process.env.MIDDLEWARE_BRIDGE_URL || "http://localhost:8080";
const BRIDGE_KEY = process.env.MIDDLEWARE_INTERNAL_KEY || "";

async function bridgeRequest<T = Record<string, unknown>>(path: string, body: object): Promise<T> {
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
  return (await res.json()) as T;
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
      const result = await bridgeRequest<{ fspId: string; partyName?: string | null }>("/mojaloop/parties/lookup", {
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
      }).onConflictDoUpdate({
        target: [mojaloopParties.merchantId, mojaloopParties.partyIdentifier],
        set: {
          fspId: result.fspId,
          displayName: result.partyName ?? null,
        },
      });

      return {
        fspId: result.fspId,
        partyName: result.partyName ?? null,
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
      // Client-supplied idempotency key — a retry with the same key replays the
      // stored response and NEVER re-executes the transfer at the Hub.
      idempotencyKey: z.string().min(8).max(128).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const execute = async () => {
        const { idempotencyKey: _idem, ...bridgeInput } = input;
        const result = await bridgeRequest<{
          transferId: string;
          quoteId: string;
          payerFspId?: string | null;
          payeeFspId?: string | null;
          ilpPacket?: string | null;
          condition?: string | null;
          expiration?: string | null;
        }>("/mojaloop/transfers/initiate", {
          merchantId: String(ctx.user.id),
          ...bridgeInput,
        });

        if (!result?.transferId) {
          // Fail loud — never return a success-shaped response without a real
          // transfer reference from the Hub.
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Mojaloop bridge returned no transferId — transfer NOT initiated",
          });
        }

        // Persist transfer record. Dedup on the transfer reference: if the
        // transferId is already recorded, return the existing row instead of
        // double-recording (the unique constraint is the backstop).
        const amountMinor = Math.round(parseFloat(input.amount) * 100);
        const inserted = await db.insert(mojaloopTransfers).values({
          merchantId: String(ctx.user.id),
          transferId: result.transferId,
          quoteId: result.quoteId,
          payerFspId: result.payerFspId ?? null,
          payeeFspId: result.payeeFspId ?? null,
          amount: amountMinor,
          currency: input.currency,
          transferState: "RESERVED",
          ilpPacket: result.ilpPacket ?? null,
          condition: result.condition ?? null,
          expiration: result.expiration ? new Date(result.expiration) : null,
          note: input.note ?? null,
        }).onConflictDoNothing({ target: mojaloopTransfers.transferId })
          .returning({ transferId: mojaloopTransfers.transferId });

        if (inserted.length === 0) {
          logger.warn(`[mojaloop] duplicate transferId ${result.transferId} — returning existing record (dedup)`);
          const [existing] = await db
            .select()
            .from(mojaloopTransfers)
            .where(eq(mojaloopTransfers.transferId, result.transferId))
            .limit(1);
          if (existing) {
            return {
              transferId: existing.transferId,
              quoteId: existing.quoteId,
              transferState: existing.transferState,
              expiration: existing.expiration ? existing.expiration.toISOString() : null,
            };
          }
        }

        return {
          transferId: result.transferId,
          quoteId: result.quoteId,
          transferState: "RESERVED",
          expiration: result.expiration ?? null,
        };
      };

      // Idempotency: when the client supplies a key, claim it atomically and
      // replay the stored response on retry — the Hub call runs exactly once.
      if (input.idempotencyKey) {
        return withIdempotency({
          key: input.idempotencyKey,
          merchantId: String(ctx.user.id),
          operation: "mojaloop.initiateTransfer",
          requestBody: input,
          execute,
        });
      }
      return execute();
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
      } catch (err) {
        // FAIL LOUD — an empty success response would be indistinguishable
        // from "no transfers", hiding bridge outages from operators.
        logger.error(`[mojaloop] analytics bridge call failed: ${err instanceof Error ? err.message : String(err)}`);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Mojaloop analytics unavailable — bridge call failed",
        });
      }
    }),
});
